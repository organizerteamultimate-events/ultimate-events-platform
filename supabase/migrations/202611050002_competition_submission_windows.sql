begin;

alter table public.events
  add column if not exists submission_opens_at timestamptz,
  add column if not exists submission_deadline timestamptz,
  add column if not exists allow_late_submissions boolean not null default false,
  add column if not exists late_submission_deadline timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_submission_window_check'
  ) then
    alter table public.events
      add constraint events_submission_window_check
      check (
        (
          submission_opens_at is null
          and submission_deadline is null
          and late_submission_deadline is null
          and not allow_late_submissions
        )
        or (
          submission_opens_at is not null
          and submission_deadline is not null
          and submission_opens_at <= submission_deadline
          and (
            (not allow_late_submissions and late_submission_deadline is null)
            or (
              allow_late_submissions
              and late_submission_deadline is not null
              and submission_deadline < late_submission_deadline
            )
          )
        )
      ) not valid;
  end if;
end;
$$;

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
        and e.submission_opens_at is not null
        and e.submission_deadline is not null
        and now() >= e.submission_opens_at
        and (
          now() <= e.submission_deadline
          or (
            e.allow_late_submissions
            and e.late_submission_deadline is not null
            and now() <= e.late_submission_deadline
          )
        )
    )
  );

drop policy if exists "Participants can update pending submissions" on public.submissions;
create policy "Participants can update pending submissions"
  on public.submissions for update to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'pending'
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
        and e.submission_opens_at is not null
        and e.submission_deadline is not null
        and now() >= e.submission_opens_at
        and (
          now() <= e.submission_deadline
          or (
            e.allow_late_submissions
            and e.late_submission_deadline is not null
            and now() <= e.late_submission_deadline
          )
        )
    )
  )
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
        and e.submission_opens_at is not null
        and e.submission_deadline is not null
        and now() >= e.submission_opens_at
        and (
          now() <= e.submission_deadline
          or (
            e.allow_late_submissions
            and e.late_submission_deadline is not null
            and now() <= e.late_submission_deadline
          )
        )
    )
  );

notify pgrst, 'reload schema';
commit;
