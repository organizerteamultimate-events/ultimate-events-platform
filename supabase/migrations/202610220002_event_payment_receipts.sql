begin;

do $$
declare
  missing_columns text[];
  mismatched_columns text[];
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.events') is null
    or to_regclass('public.registrations') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.platform_settings') is null
    or to_regclass('public.notifications') is null then
    raise exception 'Apply the profile, event reconciliation, and participant workflow migrations before this migration.';
  end if;

  select array_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name)
    into missing_columns
  from (values
    ('profiles', 'id'),
    ('profiles', 'account_status'),
    ('profiles', 'role'),
    ('events', 'id'),
    ('events', 'title'),
    ('events', 'status'),
    ('events', 'price'),
    ('events', 'registration_opens_at'),
    ('events', 'registration_deadline'),
    ('events', 'capacity'),
    ('registrations', 'id'),
    ('registrations', 'event_id'),
    ('registrations', 'user_id'),
    ('registrations', 'status'),
    ('registrations', 'payment_status'),
    ('registrations', 'amount'),
    ('payments', 'id'),
    ('payments', 'registration_id'),
    ('payments', 'event_id'),
    ('payments', 'user_id'),
    ('payments', 'amount'),
    ('payments', 'utr'),
    ('payments', 'status'),
    ('payments', 'payment_status'),
    ('payments', 'rejection_reason'),
    ('payments', 'verified_by'),
    ('payments', 'verified_at'),
    ('payments', 'created_at'),
    ('platform_settings', 'id'),
    ('platform_settings', 'upi_id'),
    ('platform_settings', 'payment_instructions'),
    ('platform_settings', 'updated_at'),
    ('platform_settings', 'updated_by'),
    ('notifications', 'user_id'),
    ('notifications', 'kind'),
    ('notifications', 'title'),
    ('notifications', 'message')
  ) as required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Required application schema is incomplete: %', missing_columns;
  end if;

  select array_agg(
    required.table_name || '.' || required.column_name
      || ' expected ' || required.udt_name || ' but found ' || actual.udt_name
    order by required.table_name, required.column_name
  )
  into mismatched_columns
  from (values
    ('profiles', 'id', 'uuid'),
    ('profiles', 'account_status', 'text'),
    ('profiles', 'role', 'text'),
    ('events', 'id', 'uuid'),
    ('events', 'title', 'text'),
    ('events', 'status', 'text'),
    ('events', 'price', 'numeric'),
    ('events', 'registration_opens_at', 'timestamptz'),
    ('events', 'registration_deadline', 'timestamptz'),
    ('events', 'capacity', 'int4'),
    ('registrations', 'id', 'uuid'),
    ('registrations', 'event_id', 'uuid'),
    ('registrations', 'user_id', 'uuid'),
    ('registrations', 'status', 'text'),
    ('registrations', 'payment_status', 'text'),
    ('registrations', 'amount', 'numeric'),
    ('payments', 'id', 'uuid'),
    ('payments', 'registration_id', 'uuid'),
    ('payments', 'event_id', 'uuid'),
    ('payments', 'user_id', 'uuid'),
    ('payments', 'amount', 'numeric'),
    ('payments', 'utr', 'text'),
    ('payments', 'status', 'text'),
    ('payments', 'payment_status', 'text'),
    ('payments', 'rejection_reason', 'text'),
    ('payments', 'created_at', 'timestamptz'),
    ('platform_settings', 'id', 'bool'),
    ('platform_settings', 'upi_id', 'text'),
    ('platform_settings', 'payment_instructions', 'text'),
    ('platform_settings', 'updated_at', 'timestamptz'),
    ('platform_settings', 'updated_by', 'uuid'),
    ('notifications', 'user_id', 'uuid'),
    ('notifications', 'kind', 'text'),
    ('notifications', 'title', 'text'),
    ('notifications', 'message', 'text')
  ) as required(table_name, column_name, udt_name)
  join information_schema.columns actual
    on actual.table_schema = 'public'
    and actual.table_name = required.table_name
    and actual.column_name = required.column_name
  where actual.udt_name <> required.udt_name;

  if mismatched_columns is not null then
    raise exception 'Application schema has incompatible column types: %', mismatched_columns;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.registrations'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.registrations'::regclass and attname = 'event_id'),
        (select attnum from pg_attribute where attrelid = 'public.registrations'::regclass and attname = 'user_id')
      ]::smallint[]
  ) then
    raise exception 'A unique registration key on (event_id, user_id) is required before applying payment workflows.';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.payments'::regclass
      and i.indisunique
      and i.indisvalid
      and pg_get_indexdef(i.indexrelid) ilike '%(registration_id)%'
      and pg_get_expr(i.indpred, i.indrelid) ilike '%status = ''pending''%'
  ) then
    raise exception 'A unique pending-payment index on registration_id is required before applying payment workflows.';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.payments'::regclass
      and i.indisunique
      and i.indisvalid
      and pg_get_indexdef(i.indexrelid) ilike '%lower(utr)%'
  ) then
    raise exception 'A case-insensitive unique index on payment UTR is required before applying payment workflows.';
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and account_status = 'active'
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.platform_settings
  add column if not exists account_holder_name text,
  add column if not exists qr_image_path text;

alter table public.payments
  add column if not exists receipt_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ultimate-event-payment-qr', 'ultimate-event-payment-qr', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('ultimate-event-payment-receipts', 'ultimate-event-payment-receipts', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'ultimate-event-payment-qr'
      and public
      and file_size_limit = 2097152
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The payment QR storage bucket exists with incompatible privacy or upload settings.';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'ultimate-event-payment-receipts'
      and not public
      and file_size_limit = 5242880
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The private payment receipt storage bucket exists with incompatible privacy or upload settings.';
  end if;
end;
$$;

alter table public.platform_settings enable row level security;
alter table public.payments enable row level security;
alter table public.events enable row level security;

revoke all on public.platform_settings from public, anon, authenticated;
grant select (id, upi_id, payment_instructions, account_holder_name, qr_image_path)
  on public.platform_settings to anon, authenticated;
drop policy if exists "Anyone can read payment instructions" on public.platform_settings;
create policy "Anyone can read payment instructions"
  on public.platform_settings for select to anon, authenticated
  using (true);

revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
drop policy if exists "Payment read authorization boundary" on public.payments;
create policy "Payment read authorization boundary"
  on public.payments as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Anyone can view published events" on public.events;
create policy "Anyone can view published events"
  on public.events for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
drop policy if exists "Published events visibility boundary" on public.events;
create policy "Published events visibility boundary"
  on public.events as restrictive for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));

drop policy if exists "Participants can upload their payment receipts" on storage.objects;
create policy "Receipt uploads require server service role"
  on storage.objects as restrictive for insert to public
  with check (
    bucket_id <> 'ultimate-event-payment-receipts'
    or (select auth.role()) = 'service_role'
  );

drop policy if exists "Participants and admins can read permitted payment receipts" on storage.objects;
create policy "Participants and admins can read permitted payment receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ultimate-event-payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "Receipt object read boundary" on storage.objects;
create policy "Receipt object read boundary"
  on storage.objects as restrictive for select to public
  using (
    bucket_id <> 'ultimate-event-payment-receipts'
    or (
      auth.role() = 'authenticated'
      and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select public.is_admin())
      )
    )
  );

drop policy if exists "Receipt object update boundary" on storage.objects;
create policy "Receipt object update boundary"
  on storage.objects as restrictive for update to public
  using (bucket_id <> 'ultimate-event-payment-receipts')
  with check (bucket_id <> 'ultimate-event-payment-receipts');

drop policy if exists "Participants and admins can remove permitted payment receipts" on storage.objects;
create policy "Participants and admins can remove permitted payment receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ultimate-event-payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1 from public.payments p where p.receipt_path = name
      )
      or (select public.is_admin())
    )
  );

drop policy if exists "Receipt object delete boundary" on storage.objects;
create policy "Receipt object delete boundary"
  on storage.objects as restrictive for delete to public
  using (
    bucket_id <> 'ultimate-event-payment-receipts'
    or (
      auth.role() = 'authenticated'
      and (
        (select public.is_admin())
        or (
          (storage.foldername(name))[1] = (select auth.uid())::text
          and not exists (
            select 1 from public.payments p where p.receipt_path = name
          )
        )
      )
    )
  );

drop policy if exists "Public can read payment QR images" on storage.objects;
create policy "Public can read payment QR images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'ultimate-event-payment-qr');

drop policy if exists "Admins can upload payment QR images" on storage.objects;
create policy "Admins can upload payment QR images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()));

drop policy if exists "Admins can update payment QR images" on storage.objects;
create policy "Admins can update payment QR images"
  on storage.objects for update to authenticated
  using (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()))
  with check (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()));

drop policy if exists "Admins can delete payment QR images" on storage.objects;
create policy "Admins can delete payment QR images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()));

drop policy if exists "Payment QR insert boundary" on storage.objects;
create policy "Payment QR insert boundary"
  on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()));
drop policy if exists "Payment QR update boundary" on storage.objects;
create policy "Payment QR update boundary"
  on storage.objects as restrictive for update to public
  using (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()))
  with check (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()));
drop policy if exists "Payment QR delete boundary" on storage.objects;
create policy "Payment QR delete boundary"
  on storage.objects as restrictive for delete to public
  using (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()));

create or replace function public.update_payment_settings(
  p_upi_id text,
  p_account_holder_name text,
  p_qr_image_path text,
  p_instructions text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upi_id text := nullif(btrim(p_upi_id), '');
  v_holder text := nullif(btrim(p_account_holder_name), '');
  v_qr_path text := nullif(btrim(p_qr_image_path), '');
  v_instructions text := btrim(coalesce(p_instructions, ''));
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if v_upi_id is not null
    and (length(v_upi_id) > 255 or v_upi_id !~ '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$') then
    raise exception 'Enter a valid UPI ID';
  end if;
  if v_holder is not null and length(v_holder) > 160 then
    raise exception 'Account holder name must be 160 characters or fewer';
  end if;
  if v_qr_path is not null and (
    v_qr_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$'
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'ultimate-event-payment-qr' and name = v_qr_path
    )
  ) then
    raise exception 'The QR image path is invalid';
  end if;
  if length(v_instructions) > 4000 then
    raise exception 'Payment instructions must be 4000 characters or fewer';
  end if;

  update public.platform_settings
  set upi_id = v_upi_id,
      account_holder_name = v_holder,
      qr_image_path = v_qr_path,
      payment_instructions = v_instructions,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = true;

  if not found then
    raise exception 'Payment settings row is missing; apply the participant workflow migration first';
  end if;
end;
$$;

create or replace function public.register_for_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_registration_id uuid;
  v_registration_status text;
  v_count integer;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles
    where id = v_user_id and account_status = 'active'
  ) then
    raise exception 'An active participant account is required';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception 'This event is not open for registration';
  end if;
  if v_event.registration_opens_at is not null and v_event.registration_opens_at > now() then
    raise exception 'Registration for this event has not opened yet';
  end if;
  if v_event.registration_deadline is not null and v_event.registration_deadline <= now() then
    raise exception 'The registration deadline has passed';
  end if;
  if v_event.price > 0 and not exists (
    select 1 from public.platform_settings
    where id = true and nullif(btrim(upi_id), '') is not null
  ) then
    raise exception 'Paid registration is unavailable until the organizer configures UPI payment details';
  end if;

  select id, status into v_registration_id, v_registration_status
  from public.registrations
  where event_id = p_event_id and user_id = v_user_id;
  if v_registration_id is not null then
    if v_registration_status = 'cancelled' then
      raise exception 'Your registration for this event was cancelled';
    end if;
    return v_registration_id;
  end if;

  if v_event.capacity is not null then
    select count(*)::integer into v_count
    from public.registrations
    where event_id = p_event_id and status <> 'cancelled';
    if v_count >= v_event.capacity then
      raise exception 'This event is full';
    end if;
  end if;

  insert into public.registrations (event_id, user_id, status, payment_status, amount)
  values (
    p_event_id,
    v_user_id,
    case when v_event.price = 0 then 'confirmed' else 'pending' end,
    case when v_event.price = 0 then 'not_required' else 'pending' end,
    v_event.price
  )
  returning id into v_registration_id;

  insert into public.notifications (user_id, kind, title, message)
  values (
    v_user_id,
    'registration',
    'Registration received',
    'Your registration for ' || v_event.title || ' has been recorded.'
  );

  return v_registration_id;
end;
$$;

create or replace function public.submit_upi_payment(
  p_registration_id uuid,
  p_utr text,
  p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_registration public.registrations%rowtype;
  v_utr text := btrim(coalesce(p_utr, ''));
  v_payment_id uuid;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles
    where id = v_user_id and account_status = 'active'
  ) then
    raise exception 'An active participant account is required';
  end if;
  if length(v_utr) not between 6 and 100 then
    raise exception 'Enter a valid UPI transaction reference between 6 and 100 characters';
  end if;
  if p_receipt_path is null
    or split_part(p_receipt_path, '/', 1) <> v_user_id::text
    or split_part(p_receipt_path, '/', 2) <> p_registration_id::text
    or split_part(p_receipt_path, '/', 3) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$'
    or position('/' in substring(p_receipt_path from length(v_user_id::text || '/' || p_registration_id::text || '/') + 1)) > 0
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'ultimate-event-payment-receipts'
        and name = p_receipt_path
    ) then
    raise exception 'Upload a valid receipt image before submitting payment';
  end if;
  if exists (select 1 from public.payments where lower(utr) = lower(v_utr)) then
    raise exception 'This transaction reference has already been submitted';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id and user_id = v_user_id
  for update;

  if not found or v_registration.amount <= 0 or v_registration.status = 'cancelled' then
    raise exception 'Paid registration not found';
  end if;
  if v_registration.payment_status = 'verified' then
    raise exception 'This registration is already paid';
  end if;
  if exists (
    select 1 from public.payments
    where registration_id = p_registration_id and status = 'pending'
  ) then
    raise exception 'A payment for this registration is already awaiting review';
  end if;

  insert into public.payments (
    registration_id, event_id, user_id, amount, utr, receipt_path, status, payment_status
  )
  values (
    p_registration_id, v_registration.event_id, v_user_id, v_registration.amount, v_utr,
    p_receipt_path, 'pending', 'pending'
  )
  returning id into v_payment_id;

  update public.registrations
  set payment_status = 'pending', status = 'pending'
  where id = p_registration_id;

  return v_payment_id;
exception
  when unique_violation then
    raise exception 'This transaction reference or registration already has a pending payment';
end;
$$;

create or replace function public.review_upi_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_registration public.registrations%rowtype;
  v_event_title text;
  v_reason text := btrim(coalesce(p_rejection_reason, ''));
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_approve is null then
    raise exception 'A payment decision is required';
  end if;
  if not p_approve and length(v_reason) not between 3 and 500 then
    raise exception 'A rejection reason between 3 and 500 characters is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status = 'verified' then
    return v_payment.registration_id;
  end if;
  if v_payment.status is distinct from 'pending' or v_payment.registration_id is null then
    raise exception 'Only linked pending payments can be reviewed';
  end if;

  select * into v_registration
  from public.registrations
  where id = v_payment.registration_id
  for update;
  if not found
    or v_registration.user_id <> v_payment.user_id
    or v_registration.event_id <> v_payment.event_id
    or v_registration.amount <> v_payment.amount then
    raise exception 'Payment does not match its registration';
  end if;
  if v_payment.user_id = (select auth.uid()) then
    raise exception 'Administrators cannot review their own payments';
  end if;
  if p_approve and v_registration.status = 'cancelled' then
    raise exception 'A cancelled registration cannot be confirmed by payment review';
  end if;

  update public.payments
  set status = case when p_approve then 'verified' else 'rejected' end,
      payment_status = case when p_approve then 'verified' else 'rejected' end,
      verified_by = (select auth.uid()),
      verified_at = now(),
      rejection_reason = case when p_approve then null else v_reason end
  where id = p_payment_id;

  update public.registrations
  set payment_status = case when p_approve then 'verified' else 'rejected' end,
      status = case when p_approve then 'confirmed' else v_registration.status end
  where id = v_payment.registration_id;

  select title into v_event_title
  from public.events
  where id = v_registration.event_id;

  insert into public.notifications (user_id, kind, title, message)
  values (
    v_payment.user_id,
    'payment',
    case when p_approve then 'Payment verified' else 'Payment rejected' end,
    case when p_approve
      then 'Your payment for ' || coalesce(v_event_title, 'your event') || ' was verified and your registration is confirmed.'
      else 'Your payment for ' || coalesce(v_event_title, 'your event') || ' was rejected. Reason: ' || v_reason || '. Submit a corrected reference and receipt.'
    end
  );

  return v_registration.id;
end;
$$;

create or replace function public.submit_upi_payment_for_user(
  p_user_id uuid,
  p_registration_id uuid,
  p_utr text,
  p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_utr text := btrim(coalesce(p_utr, ''));
  v_payment_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Server-side payment submission is required';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.profiles
    where id = p_user_id and account_status = 'active'
  ) then
    raise exception 'An active participant account is required';
  end if;
  if length(v_utr) not between 6 and 100 then
    raise exception 'Enter a valid UPI transaction reference between 6 and 100 characters';
  end if;
  if p_receipt_path is null
    or split_part(p_receipt_path, '/', 1) <> p_user_id::text
    or split_part(p_receipt_path, '/', 2) <> p_registration_id::text
    or split_part(p_receipt_path, '/', 3) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$'
    or position('/' in substring(p_receipt_path from length(p_user_id::text || '/' || p_registration_id::text || '/') + 1)) > 0
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'ultimate-event-payment-receipts'
        and name = p_receipt_path
        and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
        and (metadata ->> 'size')::bigint between 1 and 5242880
    ) then
    raise exception 'Upload a valid receipt image before submitting payment';
  end if;
  if exists (select 1 from public.payments where lower(utr) = lower(v_utr)) then
    raise exception 'This transaction reference has already been submitted';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id and user_id = p_user_id
  for update;

  if not found or v_registration.amount <= 0 or v_registration.status = 'cancelled' then
    raise exception 'Paid registration not found';
  end if;
  if v_registration.payment_status = 'verified' then
    raise exception 'This registration is already paid';
  end if;
  if exists (
    select 1 from public.payments
    where registration_id = p_registration_id and status = 'pending'
  ) then
    raise exception 'A payment for this registration is already awaiting review';
  end if;

  insert into public.payments (
    registration_id, event_id, user_id, amount, utr, receipt_path, status, payment_status
  )
  values (
    p_registration_id, v_registration.event_id, p_user_id, v_registration.amount, v_utr,
    p_receipt_path, 'pending', 'pending'
  )
  returning id into v_payment_id;

  update public.registrations
  set payment_status = 'pending', status = 'pending'
  where id = p_registration_id;

  return v_payment_id;
exception
  when unique_violation then
    raise exception 'This transaction reference or registration already has a pending payment';
end;
$$;

revoke all on function public.submit_upi_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_upi_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_upi_payment_for_user(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_upi_payment_for_user(uuid, uuid, text, text) to service_role;
revoke all on function public.update_payment_settings(text, text) from public, anon, authenticated;
revoke all on function public.update_payment_settings(text, text, text, text) from public, anon;
grant execute on function public.update_payment_settings(text, text, text, text) to authenticated;
revoke all on function public.review_upi_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_upi_payment(uuid, boolean, text) to authenticated;
revoke all on function public.register_for_event(uuid) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
