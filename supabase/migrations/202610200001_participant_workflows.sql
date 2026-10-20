begin;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'suspended', 'deleted')) not valid;
  end if;
end;
$$;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  upi_id text,
  payment_instructions text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
grant select (id, upi_id, payment_instructions) on public.platform_settings to anon, authenticated;
drop policy if exists "Anyone can read payment instructions" on public.platform_settings;
create policy "Anyone can read payment instructions"
  on public.platform_settings for select to anon, authenticated
  using (true);

create sequence if not exists public.certificate_number_sequence;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations (id),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_url text not null check (length(btrim(submission_url)) between 8 and 2048 and submission_url ~* '^https?://'),
  notes text not null default '' check (length(notes) <= 10000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  score numeric(10, 2),
  feedback text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  check (score is null or score >= 0),
  check (length(feedback) <= 10000)
);

create index if not exists submissions_event_status_idx
  on public.submissions (event_id, status, submitted_at desc);
create index if not exists submissions_user_submitted_idx
  on public.submissions (user_id, submitted_at desc);

alter table public.submissions enable row level security;
revoke all on public.submissions from public, anon, authenticated;
grant select on public.submissions to authenticated;
revoke insert on public.submissions from public, anon, authenticated;
grant insert (registration_id, event_id, user_id, submission_url, notes) on public.submissions to authenticated;
revoke update on public.submissions from public, anon, authenticated;
grant update (submission_url, notes) on public.submissions to authenticated;
drop policy if exists "Participants and admins can read submissions" on public.submissions;
create policy "Participants and admins can read submissions"
  on public.submissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "Participants can submit for confirmed competitions" on public.submissions;
create policy "Participants can submit for confirmed competitions"
  on public.submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and score is null
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1
      from public.profiles participant
      where participant.id = (select auth.uid())
        and participant.account_status = 'active'
    )
    and exists (
      select 1
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.id = submissions.registration_id
        and r.user_id = (select auth.uid())
        and r.status = 'confirmed'
        and e.id = submissions.event_id
        and e.category ilike '%competition%'
        and e.status in ('published', 'completed')
    )
  );
drop policy if exists "Participants can update pending submissions" on public.submissions;
create policy "Participants can update pending submissions"
  on public.submissions for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and score is null
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.profiles participant
      where participant.id = (select auth.uid())
        and participant.account_status = 'active'
    )
  );

create table if not exists public.winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id),
  place integer not null check (place between 1 and 100),
  award_title text not null check (length(btrim(award_title)) between 2 and 160),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, place),
  unique (event_id, user_id)
);

create index if not exists winners_published_event_idx
  on public.winners (published, event_id, place);

alter table public.winners enable row level security;
revoke all on public.winners from public, anon, authenticated;
grant select on public.winners to anon, authenticated;
drop policy if exists "Anyone can view published winners" on public.winners;
create policy "Anyone can view published winners"
  on public.winners for select to anon, authenticated
  using (published or (select public.is_admin()));

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id),
  participant_id text not null,
  recipient_name text not null,
  event_name text not null,
  certificate_number text not null unique,
  verification_code uuid not null unique default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  revoke_reason text,
  check (revoked_at is null or revoked_by is not null)
);

create unique index if not exists certificates_one_active_per_registration_idx
  on public.certificates (registration_id)
  where revoked_at is null;
create index if not exists certificates_user_issued_idx
  on public.certificates (user_id, issued_at desc);

alter table public.certificates enable row level security;
revoke all on public.certificates from public, anon, authenticated;
grant select on public.certificates to authenticated;
drop policy if exists "Participants and admins can read certificates" on public.certificates;
create policy "Participants and admins can read certificates"
  on public.certificates for select to authenticated
  using (
    (user_id = (select auth.uid()) and exists (
      select 1 from public.profiles participant
      where participant.id = (select auth.uid())
        and participant.account_status = 'active'
    ))
    or (select public.is_admin())
  );

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('registration', 'payment', 'event', 'submission', 'result', 'certificate', 'account')),
  title text not null check (length(btrim(title)) between 1 and 160),
  message text not null check (length(btrim(message)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "Participants can read and mark their notifications" on public.notifications;
drop policy if exists "Participants can mark their own notifications read" on public.notifications;
create policy "Participants can read and mark their notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Participants can mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

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

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

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
  if v_user_id is null or not exists (
    select 1 from public.profiles where id = v_user_id and account_status = 'active'
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
  v_event_title text;
  v_utr text := btrim(p_utr);
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles where id = v_user_id and account_status = 'active'
  ) then
    raise exception 'An active participant account is required';
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

  select title into v_event_title from public.events where id = v_registration.event_id;
  insert into public.payments (
    event_id, registration_id, user_id, amount, utr, status, payment_status
  )
  values (
    v_registration.event_id, p_registration_id, v_user_id, v_registration.amount,
    v_utr, 'pending', 'pending'
  )
  returning id into v_payment_id;
  update public.registrations
  set payment_status = 'pending', status = 'pending'
  where id = p_registration_id;
  insert into public.notifications (user_id, kind, title, message)
  values (
    v_user_id,
    'payment',
    'Payment reference submitted',
    'Your payment reference for ' || coalesce(v_event_title, 'your event') || ' is awaiting administrator review.'
  );
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
  v_event_title text;
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
  if v_payment.user_id = (select auth.uid()) then
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
    or v_registration.amount <> v_payment.amount then
    raise exception 'Payment does not match its registration';
  end if;
  if p_approve and v_registration.status = 'cancelled' then
    raise exception 'A cancelled registration cannot be confirmed by payment review';
  end if;

  update public.payments
  set status = case when p_approve then 'verified' else 'rejected' end,
      payment_status = case when p_approve then 'verified' else 'rejected' end,
      verified_by = (select auth.uid()),
      verified_at = now()
  where id = p_payment_id;
  update public.registrations
  set payment_status = case when p_approve then 'verified' else 'rejected' end,
      status = case when p_approve then 'confirmed' else v_registration.status end
  where id = v_payment.registration_id;

  select title into v_event_title from public.events where id = v_registration.event_id;
  insert into public.notifications (user_id, kind, title, message)
  values (
    v_payment.user_id,
    'payment',
    case when p_approve then 'Payment verified' else 'Payment rejected' end,
    case when p_approve
      then 'Your payment for ' || coalesce(v_event_title, 'your event') || ' was verified and your registration is confirmed.'
      else 'Your payment for ' || coalesce(v_event_title, 'your event') || ' was rejected. Submit a corrected transaction reference.'
    end
  );
  return v_registration.id;
end;
$$;

create or replace function public.update_payment_settings(p_upi_id text, p_instructions text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upi_id text := nullif(btrim(p_upi_id), '');
  v_instructions text := btrim(coalesce(p_instructions, ''));
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if v_upi_id is not null and (length(v_upi_id) > 255 or v_upi_id !~ '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$') then
    raise exception 'Enter a valid UPI ID';
  end if;
  if length(v_instructions) > 4000 then
    raise exception 'Payment instructions must be 4000 characters or fewer';
  end if;

  update public.platform_settings
  set upi_id = v_upi_id,
      payment_instructions = v_instructions,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = true;
end;
$$;

create or replace function public.review_upi_payments(p_payment_ids uuid[], p_approve boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_count integer := 0;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_approve is null or p_payment_ids is null
    or cardinality(p_payment_ids) < 1 or cardinality(p_payment_ids) > 100 then
    raise exception 'Select between 1 and 100 payments and choose an action';
  end if;
  if (select count(distinct selected.payment_id) from unnest(p_payment_ids) as selected(payment_id)) <> cardinality(p_payment_ids) then
    raise exception 'The payment selection contains duplicate IDs';
  end if;

  foreach v_payment_id in array p_payment_ids loop
    perform public.review_upi_payment(v_payment_id, p_approve);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_search_participants(p_query text default '', p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid,
  full_name text,
  email text,
  mobile text,
  organization text,
  qualification text,
  participant_id text,
  role text,
  account_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if length(v_query) > 200 or p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 100000 then
    raise exception 'Invalid participant search parameters';
  end if;

  return query
  select p.id, p.full_name, p.email, p.mobile, p.organization, p.qualification,
         p.participant_id, p.role, p.account_status, p.created_at
  from public.profiles p
  where v_query = ''
    or position(v_query in lower(p.full_name)) > 0
    or position(v_query in lower(p.email)) > 0
    or position(v_query in lower(p.participant_id)) > 0
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.manage_participant(p_user_id uuid, p_action text, p_reason text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_user_id is null or p_user_id = (select auth.uid())
    or p_action is null
    or p_action not in ('suspend', 'reactivate', 'delete')
    or length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Invalid participant action';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;
  if v_target.role = 'admin' and v_target.account_status = 'active'
    and p_action in ('suspend', 'delete')
    and (select count(*) from public.profiles where role = 'admin' and account_status = 'active') <= 1 then
    raise exception 'The last active administrator cannot be suspended or deleted';
  end if;

  if p_action = 'suspend' then
    update public.profiles
    set account_status = 'suspended', suspended_at = now()
    where id = p_user_id and account_status <> 'deleted';
  elsif p_action = 'reactivate' then
    update public.profiles
    set account_status = 'active', suspended_at = null
    where id = p_user_id and account_status = 'suspended';
  else
    update public.profiles
    set account_status = 'deleted',
        deleted_at = now(),
        suspended_at = null,
        role = 'user',
        full_name = 'Deleted participant',
        email = 'deleted+' || p_user_id::text || '@deleted.invalid',
        mobile = '',
        organization = null,
        qualification = null
    where id = p_user_id and account_status <> 'deleted';
  end if;

  if not found then
    raise exception 'Participant account is already deleted or unchanged';
  end if;
  insert into public.notifications (user_id, kind, title, message)
  values (
    p_user_id,
    'account',
    case p_action when 'suspend' then 'Account suspended' when 'reactivate' then 'Account restored' else 'Account deleted' end,
    case when btrim(coalesce(p_reason, '')) = ''
      then 'Your account status was changed by an administrator.'
      else btrim(p_reason)
    end
  );
  return p_action;
end;
$$;

create or replace function public.review_competition_submission(
  p_submission_id uuid,
  p_status text,
  p_score numeric,
  p_feedback text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.submissions%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_status is null or p_status not in ('accepted', 'rejected')
    or p_score is not null and (p_score < 0 or p_score::text in ('NaN', 'Infinity', '-Infinity'))
    or length(coalesce(p_feedback, '')) > 10000 then
    raise exception 'Invalid submission review';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission not found';
  end if;

  update public.submissions
  set status = p_status,
      score = p_score,
      feedback = btrim(coalesce(p_feedback, '')),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_submission_id;
  insert into public.notifications (user_id, kind, title, message)
  values (
    v_submission.user_id,
    'submission',
    'Competition submission reviewed',
    case when btrim(coalesce(p_feedback, '')) = ''
      then 'Your submission for an event has been ' || p_status || '.'
      else btrim(p_feedback)
    end
  );
  return p_submission_id;
end;
$$;

create or replace function public.manage_event_winner(
  p_event_id uuid,
  p_user_id uuid,
  p_place integer,
  p_award_title text,
  p_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_winner_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if p_event_id is null or p_user_id is null or p_place is null or p_place not between 1 and 100
    or length(btrim(coalesce(p_award_title, ''))) not between 2 and 160
    or p_published is null then
    raise exception 'Invalid winner details';
  end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and status = 'completed'
  ) or not exists (
    select 1 from public.registrations
    where event_id = p_event_id and user_id = p_user_id and status = 'confirmed'
  ) or not exists (
    select 1 from public.submissions
    where event_id = p_event_id and user_id = p_user_id and status = 'accepted'
  ) or not exists (
    select 1 from public.profiles
    where id = p_user_id and account_status = 'active'
  ) then
    raise exception 'A winner must have an accepted submission for a completed event';
  end if;

  insert into public.winners (event_id, user_id, place, award_title, published)
  values (p_event_id, p_user_id, p_place, btrim(p_award_title), p_published)
  on conflict (event_id, user_id) do update
    set place = excluded.place,
        award_title = excluded.award_title,
        published = excluded.published,
        updated_at = now()
  returning id into v_winner_id;

  if p_published then
    insert into public.notifications (user_id, kind, title, message)
    values (p_user_id, 'result', 'Official result published', 'Your result for a completed event is now published.');
  end if;
  return v_winner_id;
end;
$$;

create or replace function public.issue_event_certificates(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  recipient_name text,
  event_name text,
  certificate_number text,
  verification_code uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and status = 'completed') then
    raise exception 'Certificates can only be issued for completed events';
  end if;

  return query
  with eligible as (
    select r.id as registration_id, r.event_id, r.user_id,
           p.participant_id, p.full_name, e.title
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    join public.events e on e.id = r.event_id
    where r.event_id = p_event_id
      and r.status = 'confirmed'
      and r.payment_status in ('verified', 'not_required')
      and p.account_status = 'active'
      and not exists (
        select 1 from public.certificates c
        where c.registration_id = r.id and c.revoked_at is null
      )
  ), created as (
    insert into public.certificates (
      registration_id, event_id, user_id, participant_id, recipient_name,
      event_name, certificate_number
    )
    select registration_id, event_id, user_id, participant_id, full_name, title,
           'UE-CERT-' || extract(year from now())::integer::text || '-' ||
           lpad(nextval('public.certificate_number_sequence')::text, 6, '0')
    from eligible
    returning certificates.id, certificates.user_id, certificates.recipient_name,
              certificates.event_name, certificates.certificate_number, certificates.verification_code
  ), notices as (
  insert into public.notifications (user_id, kind, title, message)
  select user_id, 'certificate', 'Your certificate is ready',
         'A certificate for ' || event_name || ' is available in your participant dashboard. Certificate number: ' || certificate_number
  from created
  returning id
  )
  select created.id, created.user_id, created.recipient_name, created.event_name,
         created.certificate_number, created.verification_code
  from created;
end;
$$;

create or replace function public.revoke_certificate(p_certificate_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Enter a revocation reason';
  end if;
  update public.certificates
  set revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = btrim(p_reason)
  where id = p_certificate_id and revoked_at is null
  returning user_id into v_user_id;
  if not found then
    raise exception 'An active certificate was not found';
  end if;
  insert into public.notifications (user_id, kind, title, message)
  values (v_user_id, 'certificate', 'Certificate revoked', 'A certificate was revoked by an administrator.');
end;
$$;

create or replace function public.verify_certificate(p_certificate_number text)
returns table (
  certificate_number text,
  participant_name text,
  participant_id text,
  event_name text,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.certificate_number, c.recipient_name, c.participant_id, c.event_name, c.issued_at
  from public.certificates c
  where upper(c.certificate_number) = upper(btrim(p_certificate_number))
    and c.revoked_at is null;
$$;

create or replace function public.get_published_winners()
returns table (
  event_id uuid,
  event_name text,
  participant_name text,
  participant_id text,
  place integer,
  award_title text,
  score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.event_id, e.title, p.full_name, p.participant_id, w.place, w.award_title, s.score
  from public.winners w
  join public.events e on e.id = w.event_id
  join public.profiles p on p.id = w.user_id
  left join public.submissions s on s.event_id = w.event_id and s.user_id = w.user_id and s.status = 'accepted'
  where w.published
  order by e.event_date desc nulls last, w.place asc;
$$;

create or replace function public.set_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Notification not found';
  end if;
end;
$$;

revoke all on function public.update_payment_settings(text, text) from public, anon;
revoke all on function public.review_upi_payments(uuid[], boolean) from public, anon;
revoke all on function public.admin_search_participants(text, integer, integer) from public, anon;
revoke all on function public.manage_participant(uuid, text, text) from public, anon;
revoke all on function public.review_competition_submission(uuid, text, numeric, text) from public, anon;
revoke all on function public.manage_event_winner(uuid, uuid, integer, text, boolean) from public, anon;
revoke all on function public.issue_event_certificates(uuid) from public, anon;
revoke all on function public.revoke_certificate(uuid, text) from public, anon;
revoke all on function public.verify_certificate(text) from public, anon, authenticated;
revoke all on function public.get_published_winners() from public, anon, authenticated;
revoke all on function public.set_notification_read(uuid) from public, anon;
grant execute on function public.update_payment_settings(text, text) to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.submit_upi_payment(uuid, text) to authenticated;
revoke all on function public.register_for_event(uuid) from public, anon;
revoke all on function public.submit_upi_payment(uuid, text) from public, anon;
revoke all on function public.review_upi_payment(uuid, boolean) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.submit_upi_payment(uuid, text) to authenticated;
grant execute on function public.review_upi_payments(uuid[], boolean) to authenticated;
grant execute on function public.review_upi_payment(uuid, boolean) to authenticated;
grant execute on function public.admin_search_participants(text, integer, integer) to authenticated;
grant execute on function public.manage_participant(uuid, text, text) to authenticated;
grant execute on function public.review_competition_submission(uuid, text, numeric, text) to authenticated;
grant execute on function public.manage_event_winner(uuid, uuid, integer, text, boolean) to authenticated;
grant execute on function public.issue_event_certificates(uuid) to authenticated;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
grant execute on function public.get_published_winners() to anon, authenticated;
grant execute on function public.set_notification_read(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
