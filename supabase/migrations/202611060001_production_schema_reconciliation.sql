begin;

-- This migration is intentionally additive and production-safe.
-- It fails fast when the live schema drifts from the expected contract.
-- It never drops legacy tables, events, registrations, payments, or admin state.

do $$
declare
  v_required_foundation text[] := array[
    'public.profiles',
    'public.events',
    'public.registrations',
    'public.payments',
    'public.notifications'
  ];
  v_table text;
  v_expected record;
begin
  if to_regnamespace('public') is null then
    raise exception 'public schema is unavailable.';
  end if;
  if to_regnamespace('auth') is null then
    raise exception 'auth schema is unavailable.';
  end if;
  if to_regnamespace('storage') is null then
    raise exception 'storage schema is unavailable.';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'auth.users is unavailable.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects is unavailable.';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'storage.buckets is unavailable.';
  end if;

  foreach v_table in array v_required_foundation loop
    if to_regclass(v_table) is null then
      raise exception 'Required foundation table % is missing; apply the prerequisite migrations first.', v_table;
    end if;
  end loop;

  for v_expected in
    select * from (values
      ('profiles', 'id', 'uuid'),
      ('profiles', 'role', 'text'),
      ('profiles', 'account_status', 'text'),
      ('profiles', 'full_name', 'text'),
      ('profiles', 'email', 'text'),
      ('profiles', 'mobile', 'text'),
      ('profiles', 'organization', 'text'),
      ('profiles', 'qualification', 'text'),
      ('profiles', 'participant_id', 'text'),
      ('profiles', 'created_at', 'timestamptz'),
      ('events', 'id', 'uuid'),
      ('events', 'title', 'text'),
      ('events', 'category', 'text'),
      ('events', 'status', 'text'),
      ('events', 'event_date', 'timestamptz'),
      ('events', 'price', 'numeric'),
      ('events', 'capacity', 'int4'),
      ('events', 'registration_deadline', 'timestamptz'),
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
      ('notifications', 'id', 'uuid'),
      ('notifications', 'user_id', 'uuid'),
      ('notifications', 'kind', 'text'),
      ('notifications', 'title', 'text'),
      ('notifications', 'message', 'text'),
      ('notifications', 'created_at', 'timestamptz'),
      ('notifications', 'read_at', 'timestamptz')
    ) as required(table_name, column_name, udt_name)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_expected.table_name
        and c.column_name = v_expected.column_name
        and c.udt_name = v_expected.udt_name
    ) then
      raise exception 'Required foundation column public.%.% is missing or has an incompatible type; expected %.',
        v_expected.table_name, v_expected.column_name, v_expected.udt_name;
    end if;
  end loop;

  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing; the production admin guard must be present before reconciliation.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registrations'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    raise exception 'public.registrations.id must exist as uuid.';
  end if;

  if exists (
    select 1
    from (values ('event_id'), ('user_id')) as required(column_name)
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'registrations'
     and c.column_name = required.column_name
    where c.column_name is null
       or c.data_type <> 'uuid'
       or c.is_nullable <> 'NO'
  ) then
    raise exception 'public.registrations.event_id and user_id must be non-null uuid columns.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.registrations'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts = 2
      and (
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.registrations'::regclass and attname = 'event_id'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.registrations'::regclass and attname = 'user_id'
        ))
        or
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.registrations'::regclass and attname = 'user_id'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.registrations'::regclass and attname = 'event_id'
        ))
      )
  ) then
    raise exception 'public.registrations must have a valid, non-partial unique index on (event_id, user_id), in either column order.';
  end if;

  if to_regprocedure('public.register_for_event(uuid)') is null then
    raise exception 'public.register_for_event(uuid) is missing; the existing registration workflow must be preserved.';
  end if;
end;
$$;

create sequence if not exists public.certificate_number_sequence;
revoke all on sequence public.certificate_number_sequence from public, anon, authenticated;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  upi_id text,
  account_holder_name text,
  qr_image_path text,
  payment_instructions text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations (id),
  event_id uuid not null references public.events (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_url text not null
    check (length(btrim(submission_url)) between 8 and 2048 and submission_url ~* '^https?://'),
  notes text not null default '' check (length(notes) <= 10000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  score numeric(10, 2) check (score is null or score >= 0),
  feedback text not null default '' check (length(feedback) <= 10000),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz
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

alter table public.platform_settings enable row level security;
alter table public.payments enable row level security;
alter table public.submissions enable row level security;
alter table public.winners enable row level security;
alter table public.certificates enable row level security;

revoke all on public.platform_settings from public, anon, authenticated;
do $settings_column_grants$
declare
  setting_column record;
begin
  for setting_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_settings'
  loop
    execute format(
      'revoke all privileges (%I) on table public.platform_settings from public, anon, authenticated',
      setting_column.column_name
    );
  end loop;
end
$settings_column_grants$;
grant select (id, upi_id, account_holder_name, qr_image_path, payment_instructions)
  on public.platform_settings to anon, authenticated;

revoke all on public.payments, public.submissions, public.winners, public.certificates
  from public, anon, authenticated;

do $workflow_column_grants$
declare
  workflow_table text;
  workflow_column record;
begin
  foreach workflow_table in array array['payments', 'submissions', 'winners', 'certificates']
  loop
    for workflow_column in
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = workflow_table
    loop
      execute format(
        'revoke all privileges (%I) on table public.%I from public, anon, authenticated',
        workflow_column.column_name,
        workflow_table
      );
    end loop;
  end loop;
end
$workflow_column_grants$;

grant select on public.payments, public.submissions, public.winners, public.certificates
  to authenticated;
grant insert (registration_id, event_id, user_id, submission_url, notes)
  on public.submissions to authenticated;
grant update (submission_url, notes)
  on public.submissions to authenticated;
grant select on public.winners to anon;

-- RLS preflight checks allow existing tables to keep their data while
-- enforcing row-specific access for sensitive workflow records.
do $$
declare
  v_actual_type text;
begin
  select udt_name into v_actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payments'
    and column_name = 'receipt_path';
  if v_actual_type is not null and v_actual_type <> 'text' then
    raise exception 'public.payments.receipt_path has incompatible type %; expected text.', v_actual_type;
  end if;

  select udt_name into v_actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payments'
    and column_name = 'rejection_reason';
  if v_actual_type is not null and v_actual_type <> 'text' then
    raise exception 'public.payments.rejection_reason has incompatible type %; expected text.', v_actual_type;
  end if;

  select udt_name into v_actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'platform_settings'
    and column_name = 'account_holder_name';
  if v_actual_type is not null and v_actual_type <> 'text' then
    raise exception 'public.platform_settings.account_holder_name has incompatible type %; expected text.', v_actual_type;
  end if;

  select udt_name into v_actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'platform_settings'
    and column_name = 'qr_image_path';
  if v_actual_type is not null and v_actual_type <> 'text' then
    raise exception 'public.platform_settings.qr_image_path has incompatible type %; expected text.', v_actual_type;
  end if;
end;
$$;

alter table public.payments
  add column if not exists receipt_path text,
  add column if not exists rejection_reason text;

alter table public.platform_settings
  add column if not exists account_holder_name text,
  add column if not exists qr_image_path text;

do $$
declare
  v_expected record;
  v_actual_type text;
begin
  for v_expected in
    select * from (values
      ('submission_opens_at', 'timestamptz'),
      ('submission_deadline', 'timestamptz'),
      ('allow_late_submissions', 'bool'),
      ('late_submission_deadline', 'timestamptz')
    ) as required(column_name, udt_name)
  loop
    select c.udt_name into v_actual_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'events'
      and c.column_name = v_expected.column_name;

    if v_actual_type is not null and v_actual_type <> v_expected.udt_name then
      raise exception 'public.events.% has incompatible type %; expected %.', v_expected.column_name, v_actual_type, v_expected.udt_name;
    end if;
  end loop;
end;
$$;

alter table public.events
  add column if not exists submission_opens_at timestamptz,
  add column if not exists submission_deadline timestamptz,
  add column if not exists allow_late_submissions boolean not null default false,
  add column if not exists late_submission_deadline timestamptz;

do $event_window_null_preflight$
begin
  if exists (
    select 1 from public.events where allow_late_submissions is null
  ) then
    raise exception 'public.events.allow_late_submissions contains NULL values; review them before applying the NOT NULL contract.';
  end if;
end
$event_window_null_preflight$;

alter table public.events
  alter column allow_late_submissions set default false,
  alter column allow_late_submissions set not null;

do $workflow_schema_preflight$
declare
  expected record;
  actual_type text;
begin
  for expected in
    select * from (values
      ('platform_settings', 'id', 'bool'),
      ('platform_settings', 'upi_id', 'text'),
      ('platform_settings', 'account_holder_name', 'text'),
      ('platform_settings', 'qr_image_path', 'text'),
      ('platform_settings', 'payment_instructions', 'text'),
      ('platform_settings', 'updated_at', 'timestamptz'),
      ('platform_settings', 'updated_by', 'uuid'),
      ('submissions', 'id', 'uuid'),
      ('submissions', 'registration_id', 'uuid'),
      ('submissions', 'event_id', 'uuid'),
      ('submissions', 'user_id', 'uuid'),
      ('submissions', 'submission_url', 'text'),
      ('submissions', 'notes', 'text'),
      ('submissions', 'status', 'text'),
      ('submissions', 'score', 'numeric'),
      ('submissions', 'feedback', 'text'),
      ('submissions', 'submitted_at', 'timestamptz'),
      ('submissions', 'reviewed_by', 'uuid'),
      ('submissions', 'reviewed_at', 'timestamptz'),
      ('winners', 'id', 'uuid'),
      ('winners', 'event_id', 'uuid'),
      ('winners', 'user_id', 'uuid'),
      ('winners', 'place', 'int4'),
      ('winners', 'award_title', 'text'),
      ('winners', 'published', 'bool'),
      ('winners', 'created_at', 'timestamptz'),
      ('winners', 'updated_at', 'timestamptz'),
      ('certificates', 'id', 'uuid'),
      ('certificates', 'registration_id', 'uuid'),
      ('certificates', 'event_id', 'uuid'),
      ('certificates', 'user_id', 'uuid'),
      ('certificates', 'participant_id', 'text'),
      ('certificates', 'recipient_name', 'text'),
      ('certificates', 'event_name', 'text'),
      ('certificates', 'certificate_number', 'text'),
      ('certificates', 'verification_code', 'uuid'),
      ('certificates', 'issued_at', 'timestamptz'),
      ('certificates', 'revoked_at', 'timestamptz'),
      ('certificates', 'revoked_by', 'uuid'),
      ('certificates', 'revoke_reason', 'text')
    ) as required(table_name, column_name, udt_name)
  loop
    select c.udt_name into actual_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name;

    if actual_type is distinct from expected.udt_name then
      raise exception 'public.%.% has type %; expected %.',
        expected.table_name, expected.column_name, coalesce(actual_type, 'missing'), expected.udt_name;
    end if;
  end loop;
end
$workflow_schema_preflight$;

do $workflow_key_preflight$
declare
  expected record;
  actual_nullable text;
  actual_primary_key boolean;
begin
  for expected in
    select * from (values
      ('platform_settings', 'id'),
      ('submissions', 'id'),
      ('submissions', 'registration_id'),
      ('submissions', 'event_id'),
      ('submissions', 'user_id'),
      ('submissions', 'submission_url'),
      ('submissions', 'notes'),
      ('submissions', 'status'),
      ('submissions', 'feedback'),
      ('submissions', 'submitted_at'),
      ('winners', 'id'),
      ('winners', 'event_id'),
      ('winners', 'user_id'),
      ('winners', 'place'),
      ('winners', 'award_title'),
      ('winners', 'published'),
      ('winners', 'created_at'),
      ('winners', 'updated_at'),
      ('certificates', 'id'),
      ('certificates', 'registration_id'),
      ('certificates', 'event_id'),
      ('certificates', 'user_id'),
      ('certificates', 'participant_id'),
      ('certificates', 'recipient_name'),
      ('certificates', 'event_name'),
      ('certificates', 'certificate_number'),
      ('certificates', 'verification_code'),
      ('certificates', 'issued_at')
    ) as required(table_name, column_name)
  loop
    select c.is_nullable into actual_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name;

    if actual_nullable is distinct from 'NO' then
      raise exception 'public.%.% must be NOT NULL.',
        expected.table_name, expected.column_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('platform_settings'),
      ('submissions'),
      ('winners'),
      ('certificates')
    ) as required(table_name)
  loop
    select exists (
      select 1
      from pg_catalog.pg_index i
      where i.indrelid = to_regclass('public.' || expected.table_name)
        and i.indisprimary
        and i.indnkeyatts = 1
        and i.indkey[0] = (
          select a.attnum
          from pg_catalog.pg_attribute a
          where a.attrelid = to_regclass('public.' || expected.table_name)
            and a.attname = 'id'
            and not a.attisdropped
        )
    ) into actual_primary_key;

    if not actual_primary_key then
      raise exception 'public.% must have a primary key on id.', expected.table_name;
    end if;
  end loop;
end
$workflow_key_preflight$;

do $workflow_constraints$
declare
  expected record;
  source_attnum smallint;
  target_attnum smallint;
  existing_delete_action "char";
  constraint_name text;
  has_orphaned_reference boolean;
begin
  for expected in
    select * from (values
      ('submissions', 'registration_id', 'public.registrations', 'id', 'a'),
      ('submissions', 'event_id', 'public.events', 'id', 'a'),
      ('submissions', 'user_id', 'auth.users', 'id', 'c'),
      ('winners', 'event_id', 'public.events', 'id', 'a'),
      ('winners', 'user_id', 'auth.users', 'id', 'a'),
      ('certificates', 'registration_id', 'public.registrations', 'id', 'a'),
      ('certificates', 'event_id', 'public.events', 'id', 'a'),
      ('certificates', 'user_id', 'auth.users', 'id', 'a'),
      ('certificates', 'revoked_by', 'auth.users', 'id', 'a'),
      ('platform_settings', 'updated_by', 'auth.users', 'id', 'a')
    ) as required(table_name, column_name, target_table, target_column, delete_action)
  loop
    select attnum into source_attnum
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.' || expected.table_name)
      and attname = expected.column_name
      and not attisdropped;

    select attnum into target_attnum
    from pg_catalog.pg_attribute
    where attrelid = to_regclass(expected.target_table)
      and attname = expected.target_column
      and not attisdropped;

    if source_attnum is null or target_attnum is null then
      raise exception 'Cannot verify foreign key public.%.% -> %.%.',
        expected.table_name, expected.column_name, expected.target_table, expected.target_column;
    end if;

    select c.confdeltype into existing_delete_action
    from pg_catalog.pg_constraint c
    where c.conrelid = to_regclass('public.' || expected.table_name)
      and c.confrelid = to_regclass(expected.target_table)
      and c.contype = 'f'
      and c.conkey = array[source_attnum]::smallint[]
      and c.confkey = array[target_attnum]::smallint[]
    limit 1;

    if existing_delete_action is not null
       and existing_delete_action <> expected.delete_action then
      raise exception 'Foreign key public.%.% -> %.% has incompatible ON DELETE behavior.',
        expected.table_name, expected.column_name, expected.target_table, expected.target_column;
    end if;

    if existing_delete_action is null then
      execute format(
        'select exists (select 1 from public.%I source where source.%I is not null and not exists (select 1 from %s target where target.%I = source.%I))',
        expected.table_name,
        expected.column_name,
        to_regclass(expected.target_table),
        expected.target_column,
        expected.column_name
      )
      into has_orphaned_reference;

      if has_orphaned_reference then
        raise exception 'Existing values in public.%.% do not all reference %.%.',
          expected.table_name, expected.column_name, expected.target_table, expected.target_column;
      end if;

      constraint_name := 'ue_202611060001_' || expected.table_name || '_' || expected.column_name || '_fkey';
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references %s (%I)%s not valid',
        expected.table_name,
        constraint_name,
        expected.column_name,
        to_regclass(expected.target_table),
        expected.target_column,
        case when expected.delete_action = 'c' then ' on delete cascade' else '' end
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.submissions'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = (
        select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.submissions'::regclass and attname = 'registration_id'
      )
  ) then
    create unique index submissions_registration_id_key
      on public.submissions (registration_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.winners'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 2
      and (
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'event_id'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'place'
        ))
        or
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'place'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'event_id'
        ))
      )
  ) then
    create unique index winners_event_place_key
      on public.winners (event_id, place);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.winners'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 2
      and (
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'event_id'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'user_id'
        ))
        or
        (i.indkey[0] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'user_id'
        ) and i.indkey[1] = (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.winners'::regclass and attname = 'event_id'
        ))
      )
  ) then
    create unique index winners_event_user_key
      on public.winners (event_id, user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.certificates'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = (
        select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.certificates'::regclass and attname = 'certificate_number'
      )
  ) then
    create unique index certificates_certificate_number_key
      on public.certificates (certificate_number);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.certificates'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 1
      and i.indkey[0] = (
        select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.certificates'::regclass and attname = 'verification_code'
      )
  ) then
    create unique index certificates_verification_code_key
      on public.certificates (verification_code);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.certificates'::regclass
      and i.indisunique and i.indisvalid
      and regexp_replace(
        lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = 'revoked_atisnull'
      and i.indnkeyatts = 1
      and i.indkey[0] = (
        select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.certificates'::regclass and attname = 'registration_id'
      )
  ) then
    create unique index certificates_one_active_per_registration_key
      on public.certificates (registration_id)
      where revoked_at is null;
  end if;
end
$workflow_constraints$;

-- Guard the submission-window constraint as a forward-only additive check.
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

-- Ensure the private receipt and QR buckets exist with safe settings.
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
      and public = true
      and file_size_limit = 2097152
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
      and allowed_mime_types <@ array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The QR bucket has incompatible privacy or upload settings.';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'ultimate-event-payment-receipts'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
      and allowed_mime_types <@ array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The private receipt bucket has incompatible privacy or upload settings.';
  end if;
end;
$$;

-- Storage object access is least privilege and bucket-scoped. Policy creation
-- is idempotent and will not touch unrelated buckets.
do $policy_setup$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_qr_public_read'
  ) then
    execute $sql$create policy "payment_qr_public_read"
      on storage.objects for select to anon, authenticated
      using (bucket_id = 'ultimate-event-payment-qr')$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_qr_admin_insert'
  ) then
    execute $sql$create policy "payment_qr_admin_insert"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'ultimate-event-payment-qr'
        and (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_qr_admin_update'
  ) then
    execute $sql$create policy "payment_qr_admin_update"
      on storage.objects for update to authenticated
      using (
        bucket_id = 'ultimate-event-payment-qr'
        and (select public.is_admin())
      )
      with check (
        bucket_id = 'ultimate-event-payment-qr'
        and (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_qr_admin_delete'
  ) then
    execute $sql$create policy "payment_qr_admin_delete"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'ultimate-event-payment-qr'
        and (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_receipt_private_read'
  ) then
    execute $sql$create policy "payment_receipt_private_read"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'ultimate-event-payment-receipts'
        and (
          (select public.is_admin())
          or (
            (storage.foldername(name))[1] = (select auth.uid())::text
            and not exists (
              select 1
              from public.payments p
              where p.receipt_path = name
                and p.user_id <> (select auth.uid())
            )
          )
        )
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_receipt_private_insert'
  ) then
    execute $sql$create policy "payment_receipt_private_insert"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'ultimate-event-payment-receipts'
        and (
          (select public.is_admin())
          or (
            (storage.foldername(name))[1] = (select auth.uid())::text
            and not exists (
              select 1 from public.payments p where p.receipt_path = name
            )
          )
        )
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_receipt_private_update'
  ) then
    execute $sql$create policy "payment_receipt_private_update"
      on storage.objects for update to authenticated
      using (
        bucket_id = 'ultimate-event-payment-receipts'
        and (select public.is_admin())
      )
      with check (
        bucket_id = 'ultimate-event-payment-receipts'
        and (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'payment_receipt_private_delete'
  ) then
    execute $sql$create policy "payment_receipt_private_delete"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'ultimate-event-payment-receipts'
        and (
          (select public.is_admin())
          or (
            (storage.foldername(name))[1] = (select auth.uid())::text
            and not exists (
              select 1
              from public.payments p
              where p.receipt_path = name
            )
          )
        )
      )$sql$;
  end if;
end
$policy_setup$;

-- Restrictive bucket boundaries make these rules effective even if an older
-- permissive policy on storage.objects is broader. Other buckets are untouched.
do $storage_boundaries$
begin
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_receipt_select_boundary'
  ) then
    execute $sql$create policy ue_202611060001_receipt_select_boundary
      on storage.objects as restrictive for select to public
      using (
        bucket_id <> 'ultimate-event-payment-receipts'
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or (
              (storage.foldername(name))[1] = (select auth.uid())::text
              and not exists (
                select 1
                from public.payments p
                where p.receipt_path = name
                  and p.user_id <> (select auth.uid())
              )
            )
          )
        )
      )$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_receipt_insert_boundary'
  ) then
    execute $sql$create policy ue_202611060001_receipt_insert_boundary
      on storage.objects as restrictive for insert to public
      with check (
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
      )$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_receipt_update_boundary'
  ) then
    execute $sql$create policy ue_202611060001_receipt_update_boundary
      on storage.objects as restrictive for update to public
      using (bucket_id <> 'ultimate-event-payment-receipts')
      with check (bucket_id <> 'ultimate-event-payment-receipts')$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_receipt_delete_boundary'
  ) then
    execute $sql$create policy ue_202611060001_receipt_delete_boundary
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
      )$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_qr_insert_boundary'
  ) then
    execute $sql$create policy ue_202611060001_qr_insert_boundary
      on storage.objects as restrictive for insert to public
      with check (
        bucket_id <> 'ultimate-event-payment-qr'
        or (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_qr_update_boundary'
  ) then
    execute $sql$create policy ue_202611060001_qr_update_boundary
      on storage.objects as restrictive for update to public
      using (
        bucket_id <> 'ultimate-event-payment-qr'
        or (select public.is_admin())
      )
      with check (
        bucket_id <> 'ultimate-event-payment-qr'
        or (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 'ue_202611060001_qr_delete_boundary'
  ) then
    execute $sql$create policy ue_202611060001_qr_delete_boundary
      on storage.objects as restrictive for delete to public
      using (
        bucket_id <> 'ultimate-event-payment-qr'
        or (select public.is_admin())
      )$sql$;
  end if;
end
$storage_boundaries$;

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

create or replace function public.admin_search_participants(
  p_query text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
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

create or replace function public.manage_participant(
  p_user_id uuid,
  p_action text,
  p_reason text default ''
)
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

  insert into public.notifications (user_id, kind, title, message)
  values (
    p_user_id,
    'account',
    case when p_action = 'suspend' then 'Account suspended' when p_action = 'reactivate' then 'Account reactivated' else 'Account removed' end,
    coalesce(p_reason, 'Administrator action')
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
  certificate_status text,
  participant_name text,
  event_name text,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.certificate_number,
    case when c.revoked_at is null then 'valid' else 'revoked' end,
    case when c.revoked_at is null then c.recipient_name else null end,
    c.event_name,
    c.issued_at
  from public.certificates c
  where upper(c.certificate_number) = upper(btrim(p_certificate_number))
    or c.verification_code::text = lower(btrim(p_certificate_number))
  limit 1;
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

-- Workflow RLS remains additive and caller-scoped. No policy is dropped.
do $workflow_policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'public.platform_settings'::regclass
      and polname = 'ue_202611060001_settings_select'
  ) then
    execute $sql$create policy ue_202611060001_settings_select
      on public.platform_settings for select to anon, authenticated
      using (true)$sql$;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'public.platform_settings'::regclass
      and polname = 'ue_202611060001_settings_select_boundary'
  ) then
    execute $sql$create policy ue_202611060001_settings_select_boundary
      on public.platform_settings as restrictive for select to anon, authenticated
      using (true)$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_read'
  ) then
    execute $sql$create policy "submissions_participant_read"
      on public.submissions for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()))$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_read_boundary'
  ) then
    execute $sql$create policy "submissions_participant_read_boundary"
      on public.submissions as restrictive for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()))$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_insert'
  ) then
    execute $sql$create policy "submissions_participant_insert"
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
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_insert_boundary'
  ) then
    execute $sql$create policy "submissions_participant_insert_boundary"
      on public.submissions as restrictive for insert to authenticated
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
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_update'
  ) then
    execute $sql$create policy "submissions_participant_update"
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
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.submissions'::regclass
      and polname = 'submissions_participant_update_boundary'
  ) then
    execute $sql$create policy "submissions_participant_update_boundary"
      on public.submissions as restrictive for update to authenticated
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
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.certificates'::regclass
      and polname = 'certificates_owner_or_admin_read'
  ) then
    execute $sql$create policy "certificates_owner_or_admin_read"
      on public.certificates for select to authenticated
      using (
        (user_id = (select auth.uid())
         and exists (
           select 1 from public.profiles participant
           where participant.id = (select auth.uid())
             and participant.account_status = 'active'
         ))
        or (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.certificates'::regclass
      and polname = 'certificates_owner_or_admin_read_boundary'
  ) then
    execute $sql$create policy "certificates_owner_or_admin_read_boundary"
      on public.certificates as restrictive for select to authenticated
      using (
        (user_id = (select auth.uid())
         and exists (
           select 1 from public.profiles participant
           where participant.id = (select auth.uid())
             and participant.account_status = 'active'
         ))
        or (select public.is_admin())
      )$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.winners'::regclass
      and polname = 'winners_published_read'
  ) then
    execute $sql$create policy "winners_published_read"
      on public.winners for select to anon, authenticated
      using (published or (select public.is_admin()))$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.winners'::regclass
      and polname = 'winners_published_read_boundary'
  ) then
    execute $sql$create policy "winners_published_read_boundary"
      on public.winners as restrictive for select to anon, authenticated
      using (published or (select public.is_admin()))$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.payments'::regclass
      and polname = 'payments_owner_or_admin_read'
  ) then
    execute $sql$create policy "payments_owner_or_admin_read"
      on public.payments for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()))$sql$;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.payments'::regclass
      and polname = 'payments_owner_or_admin_read_boundary'
  ) then
    execute $sql$create policy "payments_owner_or_admin_read_boundary"
      on public.payments as restrictive for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()))$sql$;
  end if;
end
$workflow_policies$;

-- Normalize permissions after function creation.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.register_for_event(uuid) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;

revoke all on function public.submit_upi_payment_for_user(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_upi_payment_for_user(uuid, uuid, text, text)
  to service_role;

revoke all on function public.review_upi_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_upi_payment(uuid, boolean, text) to authenticated;

revoke all on function public.review_upi_payments(uuid[], boolean, text) from public, anon;
grant execute on function public.review_upi_payments(uuid[], boolean, text) to authenticated;

revoke all on function public.update_payment_settings(text, text, text, text) from public, anon;
grant execute on function public.update_payment_settings(text, text, text, text) to authenticated;

revoke all on function public.admin_search_participants(text, integer, integer) from public, anon;
grant execute on function public.admin_search_participants(text, integer, integer) to authenticated;

revoke all on function public.manage_participant(uuid, text, text) from public, anon;
grant execute on function public.manage_participant(uuid, text, text) to authenticated;

revoke all on function public.review_competition_submission(uuid, text, numeric, text) from public, anon;
grant execute on function public.review_competition_submission(uuid, text, numeric, text) to authenticated;

revoke all on function public.manage_event_winner(uuid, uuid, integer, text, boolean) from public, anon;
grant execute on function public.manage_event_winner(uuid, uuid, integer, text, boolean) to authenticated;

revoke all on function public.issue_event_certificates(uuid) from public, anon;
grant execute on function public.issue_event_certificates(uuid) to authenticated;

revoke all on function public.revoke_certificate(uuid, text) from public, anon;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

revoke all on function public.get_published_winners() from public;
grant execute on function public.get_published_winners() to anon, authenticated;

revoke all on function public.set_notification_read(uuid) from public, anon;
grant execute on function public.set_notification_read(uuid) to authenticated;

do $postflight$
declare
  expected record;
  routine oid;
  actual_result text;
  routine_config text[];
  routine_is_definer boolean;
  required_table text;
  setting_column record;
  has_select boolean;
  has_authenticated_select boolean;
begin
  for required_table in
    select unnest(array[
      'platform_settings', 'payments', 'submissions', 'winners', 'certificates'
    ])
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      where c.oid = to_regclass('public.' || required_table)
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%.', required_table;
    end if;
  end loop;

  for expected in
    select * from (values
      ('public.is_admin()', 'boolean'),
      ('public.register_for_event(uuid)', 'uuid'),
      ('public.submit_upi_payment_for_user(uuid,uuid,text,text)', 'uuid'),
      ('public.review_upi_payment(uuid,boolean,text)', 'uuid'),
      ('public.review_upi_payments(uuid[],boolean,text)', 'integer'),
      ('public.update_payment_settings(text,text,text,text)', 'void'),
      ('public.admin_search_participants(text,integer,integer)',
        'TABLE(id uuid, full_name text, email text, mobile text, organization text, qualification text, participant_id text, role text, account_status text, created_at timestamp with time zone)'),
      ('public.manage_participant(uuid,text,text)', 'text'),
      ('public.review_competition_submission(uuid,text,numeric,text)', 'uuid'),
      ('public.manage_event_winner(uuid,uuid,integer,text,boolean)', 'uuid'),
      ('public.issue_event_certificates(uuid)',
        'TABLE(id uuid, user_id uuid, recipient_name text, event_name text, certificate_number text, verification_code uuid)'),
      ('public.revoke_certificate(uuid,text)', 'void'),
      ('public.verify_certificate(text)',
        'TABLE(certificate_number text, certificate_status text, participant_name text, event_name text, issued_at timestamp with time zone)'),
      ('public.get_published_winners()',
        'TABLE(event_id uuid, event_name text, participant_name text, participant_id text, place integer, award_title text, score numeric)'),
      ('public.set_notification_read(uuid)', 'void')
    ) as required(signature, result_type)
  loop
    routine := to_regprocedure(expected.signature);
    if routine is null then
      raise exception 'Required RPC % is missing.', expected.signature;
    end if;

    select pg_catalog.pg_get_function_result(p.oid), p.proconfig, p.prosecdef
    into actual_result, routine_config, routine_is_definer
    from pg_catalog.pg_proc p
    where p.oid = routine;

    if lower(regexp_replace(actual_result, '\s+', '', 'g'))
       <> lower(regexp_replace(expected.result_type, '\s+', '', 'g')) then
      raise exception 'RPC % has incompatible result type %.', expected.signature, actual_result;
    end if;
    if not routine_is_definer then
      raise exception 'RPC % must remain SECURITY DEFINER.', expected.signature;
    end if;
    if not exists (
      select 1
      from unnest(coalesce(routine_config, array[]::text[])) as config(setting)
      where lower(split_part(config.setting, '=', 1)) = 'search_path'
        and replace(split_part(config.setting, '=', 2), '"', '') = ''
    ) then
      raise exception 'RPC % must set an empty search_path.', expected.signature;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.submit_upi_payment_for_user(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.submit_upi_payment_for_user(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.submit_upi_payment_for_user(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Payment submission RPC permissions are not least-privilege.';
  end if;

  for expected in
    select * from (values
      ('platform_settings', 'ue_202611060001_settings_select', 'r', true),
      ('platform_settings', 'ue_202611060001_settings_select_boundary', 'r', false),
      ('submissions', 'submissions_participant_read', 'r', true),
      ('submissions', 'submissions_participant_read_boundary', 'r', false),
      ('submissions', 'submissions_participant_insert', 'a', true),
      ('submissions', 'submissions_participant_insert_boundary', 'a', false),
      ('submissions', 'submissions_participant_update', 'w', true),
      ('submissions', 'submissions_participant_update_boundary', 'w', false),
      ('certificates', 'certificates_owner_or_admin_read', 'r', true),
      ('certificates', 'certificates_owner_or_admin_read_boundary', 'r', false),
      ('winners', 'winners_published_read', 'r', true),
      ('winners', 'winners_published_read_boundary', 'r', false),
      ('payments', 'payments_owner_or_admin_read', 'r', true),
      ('payments', 'payments_owner_or_admin_read_boundary', 'r', false)
    ) as required(table_name, policy_name, command, permissive)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = to_regclass('public.' || expected.table_name)
        and p.polname = expected.policy_name
        and p.polcmd = expected.command
        and p.polpermissive = expected.permissive
    ) then
      raise exception 'Required RLS policy public.%.% is missing or incompatible.',
        expected.table_name, expected.policy_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('payment_qr_public_read', 'r', true),
      ('payment_qr_admin_insert', 'a', true),
      ('payment_qr_admin_update', 'w', true),
      ('payment_qr_admin_delete', 'd', true),
      ('payment_receipt_private_read', 'r', true),
      ('payment_receipt_private_insert', 'a', true),
      ('payment_receipt_private_update', 'w', true),
      ('payment_receipt_private_delete', 'd', true),
      ('ue_202611060001_receipt_select_boundary', 'r', false),
      ('ue_202611060001_receipt_insert_boundary', 'a', false),
      ('ue_202611060001_receipt_update_boundary', 'w', false),
      ('ue_202611060001_receipt_delete_boundary', 'd', false),
      ('ue_202611060001_qr_insert_boundary', 'a', false),
      ('ue_202611060001_qr_update_boundary', 'w', false),
      ('ue_202611060001_qr_delete_boundary', 'd', false)
    ) as required(policy_name, command, permissive)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = 'storage.objects'::regclass
        and p.polname = expected.policy_name
        and p.polcmd = expected.command
        and p.polpermissive = expected.permissive
    ) then
      raise exception 'Required storage policy % is missing or incompatible.', expected.policy_name;
    end if;
  end loop;

  for setting_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_settings'
  loop
    select has_column_privilege('anon', 'public.platform_settings', setting_column.column_name, 'SELECT')
      into has_select;
    select has_column_privilege('authenticated', 'public.platform_settings', setting_column.column_name, 'SELECT')
      into has_authenticated_select;
    if (has_select or has_authenticated_select)
       and setting_column.column_name not in (
      'id', 'upi_id', 'account_holder_name', 'qr_image_path', 'payment_instructions'
    ) then
      raise exception 'Unauthenticated or authenticated users have unexpected SELECT access to platform_settings.%.',
        setting_column.column_name;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.platform_settings', 'SELECT')
     or has_table_privilege('anon', 'public.payments', 'SELECT')
     or has_table_privilege('anon', 'public.submissions', 'SELECT')
     or has_table_privilege('anon', 'public.certificates', 'SELECT')
     or has_table_privilege('anon', 'public.payments', 'INSERT')
     or has_table_privilege('authenticated', 'public.payments', 'INSERT')
     or has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payments', 'DELETE') then
    raise exception 'Unexpected broad table-level grants exist on workflow tables.';
  end if;
end
$postflight$;

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
