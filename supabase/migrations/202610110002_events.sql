create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 160),
  category text not null check (length(btrim(category)) between 2 and 80),
  description text not null default '',
  event_date timestamptz,
  registration_deadline timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  price numeric(10, 2) not null default 0 check (price >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_deadline is null or event_date is null or registration_deadline <= event_date)
);

-- Earlier deployments may already have an events table with only a subset of
-- the application columns. Add the missing columns without replacing records.
alter table public.events
  add column if not exists category text not null default 'Technical Event',
  add column if not exists registration_deadline timestamptz,
  add column if not exists capacity integer,
  add column if not exists price numeric(10, 2) not null default 0,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_category_check'
  ) then
    alter table public.events add constraint events_category_check
      check (length(btrim(category)) between 2 and 80) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_capacity_check'
  ) then
    alter table public.events add constraint events_capacity_check
      check (capacity is null or capacity > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_price_check'
  ) then
    alter table public.events add constraint events_price_check
      check (price >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_registration_deadline_check'
  ) then
    alter table public.events add constraint events_registration_deadline_check
      check (registration_deadline is null or event_date is null or registration_deadline <= event_date) not valid;
  end if;
end;
$$;

create index if not exists events_public_schedule_idx
  on public.events (status, event_date);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null check (payment_status in ('not_required', 'pending', 'verified', 'rejected')),
  amount numeric(10, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists registrations_user_created_idx
  on public.registrations (user_id, created_at desc);
create index if not exists registrations_event_status_idx
  on public.registrations (event_id, status);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id),
  registration_id uuid not null references public.registrations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  utr text not null unique check (length(btrim(utr)) between 6 and 100),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Preserve legacy payment rows while adding fields required by manual review.
-- Existing rows stay unlinked with a null status; new rows default to pending.
alter table public.payments
  add column if not exists event_id uuid references public.events (id),
  add column if not exists registration_id uuid references public.registrations (id),
  add column if not exists utr text,
  add column if not exists payment_status text,
  add column if not exists status text
    check (status in ('pending', 'verified', 'rejected')),
  add column if not exists verified_by uuid references auth.users (id),
  add column if not exists verified_at timestamptz;
alter table public.payments alter column status set default 'pending';

create unique index if not exists payments_one_pending_per_registration_idx
  on public.payments (registration_id)
  where status = 'pending';
create unique index if not exists payments_utr_unique_idx
  on public.payments (utr)
  where utr is not null;
create index if not exists payments_admin_review_idx
  on public.payments (status, created_at);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.set_profile_updated_at();

drop trigger if exists set_registrations_updated_at on public.registrations;
create trigger set_registrations_updated_at
  before update on public.registrations
  for each row execute function public.set_profile_updated_at();

alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Anyone can view published events" on public.events;
create policy "Anyone can view published events"
  on public.events for select to anon, authenticated
  using (
    status = 'published'
    or (select public.is_admin())
    or exists (
      select 1
      from public.registrations
      where registrations.event_id = events.id
        and registrations.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can create events" on public.events;
create policy "Admins can create events"
  on public.events for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events"
  on public.events for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Users and admins can view registrations" on public.registrations;
create policy "Users and admins can view registrations"
  on public.registrations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can cancel registrations" on public.registrations;
create policy "Admins can cancel registrations"
  on public.registrations for update to authenticated
  using ((select public.is_admin()) and payment_status <> 'verified')
  with check ((select public.is_admin()) and status = 'cancelled');

drop policy if exists "Users and admins can view payments" on public.payments;
create policy "Users and admins can view payments"
  on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select on public.registrations to anon, authenticated;
grant select on public.payments to authenticated;
grant update (status) on public.registrations to authenticated;
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

  if length(v_utr) < 6 or length(v_utr) > 100 then
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
  where registration_id = p_registration_id
    and status = 'pending'
  for update;

  if found then
    if v_payment.utr = v_utr then
      return v_payment.id;
    end if;
    raise exception 'A payment for this registration is already awaiting review';
  end if;

  if v_registration.payment_status = 'verified' then
    raise exception 'This registration is already paid';
  end if;

  insert into public.payments (registration_id, user_id, amount, utr)
  values (p_registration_id, v_user_id, v_registration.amount, v_utr)
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
  v_registration_status text;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required';
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

  if v_payment.status <> 'pending' then
    raise exception 'Only pending payments can be reviewed';
  end if;

  select status into v_registration_status
  from public.registrations
  where id = v_payment.registration_id
  for update;

  if p_approve and v_registration_status = 'cancelled' then
    raise exception 'A cancelled registration cannot be confirmed by payment review';
  end if;

  update public.payments
  set status = case when p_approve then 'verified' else 'rejected' end,
      verified_by = case when p_approve then auth.uid() else null end,
      verified_at = case when p_approve then now() else null end
  where id = p_payment_id;

  update public.registrations
  set payment_status = case when p_approve then 'verified' else 'rejected' end,
      status = case when p_approve then 'confirmed' else v_registration_status end
  where id = v_payment.registration_id;

  return v_payment.registration_id;
end;
$$;

revoke all on function public.register_for_event(uuid) from public, anon;
revoke all on function public.submit_upi_payment(uuid, text) from public, anon;
revoke all on function public.review_upi_payment(uuid, boolean) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.submit_upi_payment(uuid, text) to authenticated;
grant execute on function public.review_upi_payment(uuid, boolean) to authenticated;
