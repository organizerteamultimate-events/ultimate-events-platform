begin;

alter table public.events
  add column if not exists registration_opens_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_opening_check'
  ) then
    alter table public.events
      add constraint events_registration_opening_check
      check (
        registration_opens_at is null
        or (
          (registration_deadline is null or registration_opens_at <= registration_deadline)
          and (event_date is null or registration_opens_at <= event_date)
          and (registration_deadline is null or event_date is null or registration_deadline <= event_date)
        )
      ) not valid;
  end if;
end;
$$;

alter table public.payments
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_rejection_reason_length_check'
  ) then
    alter table public.payments
      add constraint payments_rejection_reason_length_check
      check (
        rejection_reason is null
        or length(btrim(rejection_reason)) between 3 and 500
      ) not valid;
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
  if v_event.registration_opens_at is not null and v_event.registration_opens_at > now() then
    raise exception 'Registration for this event has not opened yet';
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

drop function if exists public.review_upi_payments(uuid[], boolean);
drop function if exists public.review_upi_payment(uuid, boolean);

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
      verified_at = now(),
      rejection_reason = case when p_approve then null else v_reason end
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
      else 'Your payment for ' || coalesce(v_event_title, 'your event') || ' was rejected. Reason: ' || v_reason || '. Submit a corrected transaction reference.'
    end
  );
  return v_registration.id;
end;
$$;

create or replace function public.review_upi_payments(
  p_payment_ids uuid[],
  p_approve boolean,
  p_rejection_reason text
)
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
  if not p_approve and length(btrim(coalesce(p_rejection_reason, ''))) not between 3 and 500 then
    raise exception 'A rejection reason between 3 and 500 characters is required';
  end if;
  if (
    select count(distinct selected.payment_id)
    from unnest(p_payment_ids) as selected(payment_id)
  ) <> cardinality(p_payment_ids) then
    raise exception 'The payment selection contains duplicate IDs';
  end if;

  foreach v_payment_id in array p_payment_ids loop
    perform public.review_upi_payment(v_payment_id, p_approve, p_rejection_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.review_upi_payment(uuid, boolean, text) from public, anon;
revoke all on function public.review_upi_payments(uuid[], boolean, text) from public, anon;
grant execute on function public.review_upi_payment(uuid, boolean, text) to authenticated;
grant execute on function public.review_upi_payments(uuid[], boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;
