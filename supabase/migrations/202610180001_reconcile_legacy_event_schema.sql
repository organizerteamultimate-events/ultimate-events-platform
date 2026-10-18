begin;

do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.events') is null or to_regclass('public.payments') is null then
    raise exception 'Expected legacy public.events and public.payments tables were not found; no schema changes were made.';
  end if;

  select array_agg(required.column_name order by required.column_name)
    into missing_columns
  from (values
    ('events', 'id'),
    ('events', 'title'),
    ('events', 'description'),
    ('events', 'event_date'),
    ('events', 'status'),
    ('events', 'created_at'),
    ('payments', 'id'),
    ('payments', 'event_id'),
    ('payments', 'user_id'),
    ('payments', 'amount'),
    ('payments', 'payment_status'),
    ('payments', 'created_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Legacy schema differs from inspected schema; missing required columns: %', missing_columns;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'events' and column_name = 'id')
        or (table_name = 'payments' and column_name in ('id', 'event_id', 'user_id')))
      and data_type <> 'uuid'
  ) then
    raise exception 'Legacy ID columns are not UUIDs; no schema changes were made.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'events' and column_name = 'event_date'
          and data_type not in ('date', 'timestamp without time zone', 'timestamp with time zone'))
        or (table_name = 'events' and column_name = 'status'
          and data_type not in ('text', 'character varying'))
        or (table_name = 'payments' and column_name = 'amount'
          and data_type not in ('numeric', 'smallint', 'integer', 'bigint', 'real', 'double precision'))
        or (table_name = 'payments' and column_name = 'payment_status'
          and data_type not in ('text', 'character varying'))
      )
  ) then
    raise exception 'Legacy date, amount, or status column types differ from the supported application schema; no schema changes were made.';
  end if;
end;
$$;

create sequence if not exists public.participant_id_sequence;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  mobile text not null default '',
  organization text,
  qualification text,
  participant_id text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));

alter table public.events
  add column if not exists category text not null default 'Technical Event',
  add column if not exists registration_deadline timestamptz,
  add column if not exists capacity integer,
  add column if not exists price numeric(10, 2) not null default 0,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.events'::regclass and attname = 'created_by'
      )]::smallint[]
      and confrelid = 'auth.users'::regclass
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'auth.users'::regclass and attname = 'id'
      )]::smallint[]
      and confdeltype = 'a'
  ) then
    alter table public.events
      add constraint events_created_by_fkey
      foreign key (created_by) references auth.users (id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_category_check'
  ) then
    alter table public.events add constraint events_category_check
      check (length(btrim(category)) between 2 and 80) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_title_check'
  ) then
    alter table public.events add constraint events_title_check
      check (length(btrim(title)) between 3 and 160) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_status_check'
  ) then
    alter table public.events add constraint events_status_check
      check (status in ('draft', 'published', 'cancelled', 'completed')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_capacity_check'
  ) then
    alter table public.events add constraint events_capacity_check
      check (capacity is null or capacity > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_price_check'
  ) then
    alter table public.events add constraint events_price_check
      check (price >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_deadline_check'
  ) then
    alter table public.events add constraint events_registration_deadline_check
      check (registration_deadline is null or event_date is null or registration_deadline <= event_date) not valid;
  end if;
end;
$$;

create index if not exists events_public_schedule_idx
  on public.events (status, event_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype in ('p', 'u')
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.events'::regclass and attname = 'id'
      )]::smallint[]
  ) then
    create unique index if not exists events_id_repair_uidx
      on public.events (id);
  end if;
end;
$$;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null
    check (payment_status in ('not_required', 'pending', 'verified', 'rejected')),
  amount numeric(10, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists registrations_user_created_idx
  on public.registrations (user_id, created_at desc);
create index if not exists registrations_event_status_idx
  on public.registrations (event_id, status);

alter table public.payments
  add column if not exists registration_id uuid,
  add column if not exists utr text,
  add column if not exists status text,
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz;
alter table public.payments alter column status set default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.payments'::regclass and attname = 'registration_id'
      )]::smallint[]
      and confrelid = 'public.registrations'::regclass
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.registrations'::regclass and attname = 'id'
      )]::smallint[]
      and confdeltype = 'a'
  ) then
    alter table public.payments
      add constraint payments_registration_id_fkey
      foreign key (registration_id) references public.registrations (id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.payments'::regclass and attname = 'event_id'
      )]::smallint[]
      and confrelid = 'public.events'::regclass
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.events'::regclass and attname = 'id'
      )]::smallint[]
      and confdeltype = 'a'
  ) then
    alter table public.payments
      add constraint payments_event_id_fkey
      foreign key (event_id) references public.events (id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.payments'::regclass and attname = 'user_id'
      )]::smallint[]
      and confrelid = 'auth.users'::regclass
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'auth.users'::regclass and attname = 'id'
      )]::smallint[]
      and confdeltype = 'c'
  ) then
    alter table public.payments
      add constraint payments_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.payments'::regclass and attname = 'verified_by'
      )]::smallint[]
      and confrelid = 'auth.users'::regclass
      and confkey = array[(
        select attnum from pg_attribute
        where attrelid = 'auth.users'::regclass and attname = 'id'
      )]::smallint[]
      and confdeltype = 'n'
  ) then
    alter table public.payments
      add constraint payments_verified_by_fkey
      foreign key (verified_by) references auth.users (id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_status_check'
  ) then
    alter table public.payments add constraint payments_status_check
      check (status is null or status in ('pending', 'verified', 'rejected')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_utr_length_check'
  ) then
    alter table public.payments add constraint payments_utr_length_check
      check (utr is null or length(btrim(utr)) between 6 and 100) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_amount_check'
  ) then
    alter table public.payments add constraint payments_amount_check
      check (amount > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_application_record_check'
  ) then
    alter table public.payments add constraint payments_application_record_check
      check (
        status is null
        or (
          registration_id is not null
          and utr is not null
          and user_id is not null
          and event_id is not null
          and amount > 0
        )
      ) not valid;
  end if;
end;
$$;

create unique index if not exists payments_one_pending_per_registration_idx
  on public.payments (registration_id)
  where registration_id is not null and status = 'pending';
create unique index if not exists payments_utr_unique_idx
  on public.payments (lower(utr))
  where utr is not null;
create index if not exists payments_admin_review_idx
  on public.payments (status, created_at);
create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);
create index if not exists payments_registration_idx
  on public.payments (registration_id)
  where registration_id is not null;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (
    id, email, full_name, mobile, organization, qualification, participant_id
  )
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Participant'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'mobile'), ''), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'organization'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'qualification'), ''),
    'UE-' || extract(year from now())::integer::text || '-' ||
      lpad(nextval('public.participant_id_sequence')::text, 6, '0')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
  after insert or update of email on auth.users
  for each row execute function public.create_profile_for_auth_user();

insert into public.profiles (
  id, email, full_name, mobile, organization, qualification, participant_id
)
select
  users.id,
  lower(users.email),
  coalesce(nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''), 'Participant'),
  coalesce(nullif(btrim(users.raw_user_meta_data ->> 'mobile'), ''), ''),
  nullif(btrim(users.raw_user_meta_data ->> 'organization'), ''),
  nullif(btrim(users.raw_user_meta_data ->> 'qualification'), ''),
  'UE-' || extract(year from now())::integer::text || '-' ||
    lpad(nextval('public.participant_id_sequence')::text, 6, '0')
from auth.users as users
on conflict (id) do nothing;

drop trigger if exists set_profile_updated_at on public.profiles;
create trigger set_profile_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.set_profile_updated_at();

drop trigger if exists set_registrations_updated_at on public.registrations;
create trigger set_registrations_updated_at
  before update on public.registrations
  for each row execute function public.set_profile_updated_at();

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
  );
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'events', 'registrations', 'payments')
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end;
$$;

revoke all on public.profiles, public.events, public.registrations, public.payments
  from public, anon, authenticated;
grant select on public.profiles to authenticated;
revoke update (id, email, participant_id, role, created_at, updated_at)
  on public.profiles from public, anon, authenticated;
grant update (full_name, mobile, organization, qualification)
  on public.profiles to authenticated;
grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select on public.registrations to anon, authenticated;
grant select on public.payments to authenticated;
grant update (status) on public.registrations to authenticated;
revoke all on sequence public.participant_id_sequence from public, anon, authenticated;
grant usage, select on sequence public.participant_id_sequence to postgres, service_role;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "Users and admins can read permitted profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Users can update their own profile fields"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Anyone can view published events"
  on public.events for select to anon, authenticated
  using (
    status = 'published'
    or (select public.is_admin())
    or exists (
      select 1 from public.registrations
      where registrations.event_id = events.id
        and registrations.user_id = (select auth.uid())
    )
  );
create policy "Admins can create events"
  on public.events for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "Admins can update events"
  on public.events for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Users and admins can view registrations"
  on public.registrations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins can cancel registrations"
  on public.registrations for update to authenticated
  using ((select public.is_admin()) and payment_status <> 'verified')
  with check ((select public.is_admin()) and status = 'cancelled');

create policy "Users and admins can view payments"
  on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.register_for_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_registration_id uuid;
  v_registration_status text;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception 'This event is not open for registration';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline <= now() then
    raise exception 'The registration deadline has passed';
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

  return v_registration_id;
end;
$$;

create or replace function public.submit_upi_payment(p_registration_id uuid, p_utr text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration public.registrations%rowtype;
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_utr text := btrim(p_utr);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_utr is null or length(v_utr) < 6 or length(v_utr) > 100 then
    raise exception 'Enter a valid UPI transaction reference';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id and user_id = v_user_id
  for update;

  if not found or v_registration.amount <= 0 or v_registration.status = 'cancelled' then
    raise exception 'Paid registration not found';
  end if;

  select * into v_payment
  from public.payments
  where registration_id = p_registration_id and status = 'pending'
  for update;

  if found then
    if lower(v_payment.utr) = lower(v_utr) then
      return v_payment.id;
    end if;
    raise exception 'A payment for this registration is already awaiting review';
  end if;

  if v_registration.payment_status = 'verified' then
    raise exception 'This registration is already paid';
  end if;

  insert into public.payments (
    event_id, registration_id, user_id, amount, utr, status, payment_status
  )
  values (
    v_registration.event_id,
    p_registration_id,
    v_user_id,
    v_registration.amount,
    v_utr,
    'pending',
    'pending'
  )
  returning id into v_payment_id;

  update public.registrations
  set payment_status = 'pending', status = 'pending'
  where id = p_registration_id;

  return v_payment_id;
end;
$$;

create or replace function public.review_upi_payment(p_payment_id uuid, p_approve boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_registration public.registrations%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;

  if p_approve is null then
    raise exception 'A payment decision is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.user_id = auth.uid() then
    raise exception 'Administrators cannot review their own payments';
  end if;

  if v_payment.status = 'verified' then
    return v_payment.registration_id;
  end if;

  if v_payment.status <> 'pending' or v_payment.registration_id is null then
    raise exception 'Only linked pending payments can be reviewed';
  end if;

  select * into v_registration
  from public.registrations
  where id = v_payment.registration_id
  for update;

  if not found
    or v_registration.user_id <> v_payment.user_id
    or v_registration.event_id <> v_payment.event_id
    or v_registration.amount <> v_payment.amount
  then
    raise exception 'Payment does not match its registration';
  end if;

  if p_approve and v_registration.status = 'cancelled' then
    raise exception 'A cancelled registration cannot be confirmed by payment review';
  end if;

  update public.payments
  set status = case when p_approve then 'verified' else 'rejected' end,
      verified_by = auth.uid(),
      verified_at = now()
  where id = p_payment_id;

  update public.registrations
  set payment_status = case when p_approve then 'verified' else 'rejected' end,
      status = case when p_approve then 'confirmed' else v_registration.status end
  where id = v_payment.registration_id;

  return v_payment.registration_id;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
revoke all on function public.register_for_event(uuid) from public, anon;
revoke all on function public.submit_upi_payment(uuid, text) from public, anon;
revoke all on function public.review_upi_payment(uuid, boolean) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.submit_upi_payment(uuid, text) to authenticated;
grant execute on function public.review_upi_payment(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
