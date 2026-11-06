begin;

-- This migration is an additive compatibility repair, not a replacement for
-- the ordered foundation/workflow migrations. It never drops policies,
-- tables, columns, or functions, and it does not rewrite existing records.

do $preflight$
declare
  required_table record;
  actual_kind "char";
begin
  if to_regnamespace('public') is null
    or to_regnamespace('auth') is null
    or to_regnamespace('storage') is null
    or to_regclass('auth.users') is null
    or to_regclass('storage.objects') is null
    or to_regclass('storage.buckets') is null then
    raise exception 'Required Supabase public, auth, or storage objects are unavailable; inspect the schema before retrying.';
  end if;

  for required_table in
    select * from (values
      ('profiles'),
      ('events'),
      ('registrations'),
      ('payments'),
      ('notifications')
    ) as required(table_name)
  loop
    if to_regclass(format('public.%I', required_table.table_name)) is null then
      raise exception 'Required foundation table public.% is missing; apply and verify its prerequisite migration first.',
        required_table.table_name;
    end if;

    select relkind into actual_kind
    from pg_catalog.pg_class
    where oid = to_regclass(format('public.%I', required_table.table_name));
    if actual_kind not in ('r', 'p') then
      raise exception 'Expected public.% to be a table; no changes were made.',
        required_table.table_name;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registrations'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'registrations'
      and con.contype in ('p', 'u')
      and con.conkey = array[
        (select attnum from pg_catalog.pg_attribute
         where attrelid = rel.oid and attname = 'event_id'),
        (select attnum from pg_catalog.pg_attribute
         where attrelid = rel.oid and attname = 'user_id')
      ]::smallint[]
  ) then
    raise exception 'public.registrations must have a UUID id and unique (event_id, user_id) key.';
  end if;

  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Required public.is_admin() authorization function is missing.';
  end if;
end;
$preflight$;

create sequence if not exists public.certificate_number_sequence;

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

-- The prior receipt migration adds these two fields. Guard their types before
-- using ADD COLUMN IF NOT EXISTS so a same-named incompatible column is not
-- silently accepted.
do $column_preflight$
declare
  actual_type text;
begin
  select udt_name into actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payments'
    and column_name = 'receipt_path';
  if actual_type is not null and actual_type <> 'text' then
    raise exception 'public.payments.receipt_path has type %, expected text; no changes were made.',
      actual_type;
  end if;

  select udt_name into actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payments'
    and column_name = 'rejection_reason';
  if actual_type is not null and actual_type <> 'text' then
    raise exception 'public.payments.rejection_reason has type %, expected text; no changes were made.',
      actual_type;
  end if;

  select udt_name into actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'platform_settings'
    and column_name = 'account_holder_name';
  if actual_type is not null and actual_type <> 'text' then
    raise exception 'public.platform_settings.account_holder_name has type %, expected text; no changes were made.',
      actual_type;
  end if;

  select udt_name into actual_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'platform_settings'
    and column_name = 'qr_image_path';
  if actual_type is not null and actual_type <> 'text' then
    raise exception 'public.platform_settings.qr_image_path has type %, expected text; no changes were made.',
      actual_type;
  end if;
end;
$column_preflight$;

alter table public.payments
  add column if not exists receipt_path text,
  add column if not exists rejection_reason text;

alter table public.platform_settings
  add column if not exists account_holder_name text,
  add column if not exists qr_image_path text;

-- The submission-window migration is still the authoritative definition. These
-- guarded additions only fill absent columns; incompatible same-named columns
-- stop the migration.
do $event_column_preflight$
declare
  expected record;
  actual_type text;
begin
  for expected in
    select * from (values
      ('submission_opens_at', 'timestamptz'),
      ('submission_deadline', 'timestamptz'),
      ('allow_late_submissions', 'bool'),
      ('late_submission_deadline', 'timestamptz')
    ) as required(column_name, udt_name)
  loop
    select c.udt_name into actual_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'events'
      and c.column_name = expected.column_name;
    if actual_type is not null and actual_type <> expected.udt_name then
      raise exception 'public.events.% has type %, expected %; no changes were made.',
        expected.column_name, actual_type, expected.udt_name;
    end if;
  end loop;
end;
$event_column_preflight$;

alter table public.events
  add column if not exists submission_opens_at timestamptz,
  add column if not exists submission_deadline timestamptz,
  add column if not exists allow_late_submissions boolean not null default false,
  add column if not exists late_submission_deadline timestamptz;

do $shape_preflight$
declare
  required record;
  actual_type text;
begin
  for required in
    select * from (values
      ('profiles', 'id', 'uuid'),
      ('profiles', 'email', 'text'),
      ('profiles', 'full_name', 'text'),
      ('profiles', 'mobile', 'text'),
      ('profiles', 'organization', 'text'),
      ('profiles', 'qualification', 'text'),
      ('profiles', 'participant_id', 'text'),
      ('profiles', 'role', 'text'),
      ('profiles', 'account_status', 'text'),
      ('profiles', 'created_at', 'timestamptz'),
      ('events', 'id', 'uuid'),
      ('events', 'title', 'text'),
      ('events', 'category', 'text'),
      ('events', 'description', 'text'),
      ('events', 'registration_opens_at', 'timestamptz'),
      ('events', 'registration_deadline', 'timestamptz'),
      ('events', 'capacity', 'int4'),
      ('events', 'status', 'text'),
      ('events', 'price', 'numeric'),
      ('events', 'created_by', 'uuid'),
      ('events', 'created_at', 'timestamptz'),
      ('events', 'updated_at', 'timestamptz'),
      ('events', 'submission_opens_at', 'timestamptz'),
      ('events', 'submission_deadline', 'timestamptz'),
      ('events', 'allow_late_submissions', 'bool'),
      ('events', 'late_submission_deadline', 'timestamptz'),
      ('registrations', 'id', 'uuid'),
      ('registrations', 'event_id', 'uuid'),
      ('registrations', 'user_id', 'uuid'),
      ('registrations', 'status', 'text'),
      ('registrations', 'payment_status', 'text'),
      ('registrations', 'amount', 'numeric'),
      ('registrations', 'created_at', 'timestamptz'),
      ('registrations', 'updated_at', 'timestamptz'),
      ('payments', 'id', 'uuid'),
      ('payments', 'registration_id', 'uuid'),
      ('payments', 'event_id', 'uuid'),
      ('payments', 'user_id', 'uuid'),
      ('payments', 'amount', 'numeric'),
      ('payments', 'utr', 'text'),
      ('payments', 'status', 'text'),
      ('payments', 'payment_status', 'text'),
      ('payments', 'verified_by', 'uuid'),
      ('payments', 'verified_at', 'timestamptz'),
      ('payments', 'receipt_path', 'text'),
      ('payments', 'rejection_reason', 'text'),
      ('payments', 'created_at', 'timestamptz'),
      ('notifications', 'id', 'uuid'),
      ('notifications', 'user_id', 'uuid'),
      ('notifications', 'kind', 'text'),
      ('notifications', 'title', 'text'),
      ('notifications', 'message', 'text'),
      ('notifications', 'created_at', 'timestamptz'),
      ('notifications', 'read_at', 'timestamptz'),
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
    ) as columns(table_name, column_name, udt_name)
  loop
    select c.udt_name into actual_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name;

    if actual_type is null then
      raise exception 'Required application column public.%.% is missing.',
        required.table_name, required.column_name;
    end if;
    if actual_type <> required.udt_name then
      raise exception 'Application column public.%.% has type %, expected %.',
        required.table_name, required.column_name, actual_type, required.udt_name;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'event_date'
      and data_type in ('date', 'timestamp without time zone', 'timestamp with time zone')
  ) then
    raise exception 'public.events.event_date is missing or has an unsupported type.';
  end if;
end;
$shape_preflight$;

-- Preserve existing rows while ensuring new rows cannot violate the
-- submission-window invariant.
do $window_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'ue_202611050003_submission_window_check'
  ) then
    alter table public.events
      add constraint ue_202611050003_submission_window_check
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

  if not exists (
    select 1
    from pg_catalog.pg_constraint
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
$window_constraint$;

-- Add only absent foreign keys. A conflicting FK on the same column is a
-- stop condition; existing data is not rewritten or deleted.
do $foreign_keys$
declare
  fk record;
  source_table regclass;
  target_table regclass;
  source_att smallint;
  target_att smallint;
  has_conflict boolean;
begin
  for fk in
    select * from (values
      ('submissions', 'registration_id', 'public', 'registrations', 'id', 'a', 'ue_submissions_registration_fk'),
      ('submissions', 'event_id', 'public', 'events', 'id', 'a', 'ue_submissions_event_fk'),
      ('submissions', 'user_id', 'auth', 'users', 'id', 'c', 'ue_submissions_user_fk'),
      ('submissions', 'reviewed_by', 'auth', 'users', 'id', 'a', 'ue_submissions_reviewer_fk'),
      ('winners', 'event_id', 'public', 'events', 'id', 'a', 'ue_winners_event_fk'),
      ('winners', 'user_id', 'auth', 'users', 'id', 'a', 'ue_winners_user_fk'),
      ('certificates', 'registration_id', 'public', 'registrations', 'id', 'a', 'ue_certificates_registration_fk'),
      ('certificates', 'event_id', 'public', 'events', 'id', 'a', 'ue_certificates_event_fk'),
      ('certificates', 'user_id', 'auth', 'users', 'id', 'a', 'ue_certificates_user_fk'),
      ('certificates', 'revoked_by', 'auth', 'users', 'id', 'a', 'ue_certificates_revoker_fk'),
      ('platform_settings', 'updated_by', 'auth', 'users', 'id', 'a', 'ue_platform_settings_updated_by_fk')
    ) as definitions(
      source_name, source_column, target_schema, target_name, target_column,
      delete_action, constraint_name
    )
  loop
    source_table := to_regclass(format('public.%I', fk.source_name));
    target_table := to_regclass(format('%I.%I', fk.target_schema, fk.target_name));
    select attnum into source_att
    from pg_catalog.pg_attribute
    where attrelid = source_table and attname = fk.source_column and attnum > 0;
    select attnum into target_att
    from pg_catalog.pg_attribute
    where attrelid = target_table and attname = fk.target_column and attnum > 0;

    if exists (
      select 1
      from pg_catalog.pg_constraint con
      where con.conrelid = source_table
        and con.contype = 'f'
        and con.conkey = array[source_att]::smallint[]
        and con.confrelid = target_table
        and con.confkey = array[target_att]::smallint[]
        and con.confdeltype = fk.delete_action
    ) then
      continue;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_constraint con
      where con.conrelid = source_table
        and con.contype = 'f'
        and con.conkey = array[source_att]::smallint[]
    ) into has_conflict;

    if has_conflict then
      raise exception 'A conflicting foreign key exists on public.%.%; inspect it before continuing.',
        fk.source_name, fk.source_column;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %I.%I (%I) on delete %s not valid',
      fk.source_name,
      fk.constraint_name,
      fk.source_column,
      fk.target_schema,
      fk.target_name,
      fk.target_column,
      case fk.delete_action
        when 'c' then 'cascade'
        when 'n' then 'set null'
        when 'r' then 'restrict'
        when 'd' then 'set default'
        else 'no action'
      end
    );
  end loop;
end;
$foreign_keys$;

create index if not exists submissions_event_status_idx
  on public.submissions (event_id, status, submitted_at desc);
create index if not exists submissions_user_submitted_idx
  on public.submissions (user_id, submitted_at desc);
create unique index if not exists platform_settings_pkey
  on public.platform_settings (id);
create unique index if not exists submissions_pkey
  on public.submissions (id);
create unique index if not exists submissions_registration_id_key
  on public.submissions (registration_id);
create unique index if not exists winners_pkey
  on public.winners (id);
create unique index if not exists winners_event_id_place_key
  on public.winners (event_id, place);
create unique index if not exists winners_event_id_user_id_key
  on public.winners (event_id, user_id);
create index if not exists winners_published_event_idx
  on public.winners (published, event_id, place);
create unique index if not exists certificates_pkey
  on public.certificates (id);
create unique index if not exists certificates_certificate_number_key
  on public.certificates (certificate_number);
create unique index if not exists certificates_verification_code_key
  on public.certificates (verification_code);
create unique index if not exists certificates_one_active_per_registration_idx
  on public.certificates (registration_id)
  where revoked_at is null;
create index if not exists certificates_user_issued_idx
  on public.certificates (user_id, issued_at desc);

-- A legacy foundation index may enforce case-sensitive UTR uniqueness only.
-- Add the case-insensitive invariant under a distinct name if no valid
-- equivalent index already exists; duplicate values make this transaction
-- fail rather than deleting or rewriting payment records.
do $payment_indexes$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.payments'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%lower(utr)%'
      and coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '') ilike '%utr%is not null%'
  ) then
    execute 'create unique index ue_payments_utr_lower_uidx on public.payments (lower(utr)) where utr is not null';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.payments'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%registration_id%'
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ilike '%status%pending%'
  ) then
    execute 'create unique index ue_payments_pending_registration_uidx on public.payments (registration_id) where registration_id is not null and status = ''pending''';
  end if;
end;
$payment_indexes$;

-- Existing workflow tables can be present with a partial schema. Do not
-- silently continue unless the functions the UI calls have their exact
-- signatures, return shapes, fixed search_path, and expected authorization
-- markers. This migration deliberately does not replace function bodies.
do $function_preflight$
declare
  required record;
  routine oid;
  routine_result text;
  routine_source text;
  is_definer boolean;
  routine_config text[];
begin
  for required in
    select * from (values
      ('public.is_admin()', 'boolean', 'account_status'),
      ('public.register_for_event(uuid)', 'uuid', 'account_status'),
      ('public.submit_upi_payment_for_user(uuid,uuid,text,text)', 'uuid', 'service_role'),
      ('public.review_upi_payment(uuid,boolean,text)', 'uuid', 'public.is_admin'),
      ('public.review_upi_payments(uuid[],boolean,text)', 'integer', 'public.is_admin'),
      ('public.update_payment_settings(text,text,text,text)', 'void', 'public.is_admin'),
      ('public.admin_search_participants(text,integer,integer)',
        'TABLE(id uuid, full_name text, email text, mobile text, organization text, qualification text, participant_id text, role text, account_status text, created_at timestamp with time zone)',
        'public.is_admin'),
      ('public.manage_participant(uuid,text,text)', 'text', 'public.is_admin'),
      ('public.review_competition_submission(uuid,text,numeric,text)', 'uuid', 'public.is_admin'),
      ('public.manage_event_winner(uuid,uuid,integer,text,boolean)', 'uuid', 'public.is_admin'),
      ('public.issue_event_certificates(uuid)',
        'TABLE(id uuid, user_id uuid, recipient_name text, event_name text, certificate_number text, verification_code uuid)',
        'public.is_admin'),
      ('public.revoke_certificate(uuid,text)', 'void', 'public.is_admin'),
      ('public.verify_certificate(text)',
        'TABLE(certificate_number text, certificate_status text, participant_name text, event_name text, issued_at timestamp with time zone)',
        'c.revoked_at'),
      ('public.get_published_winners()',
        'TABLE(event_id uuid, event_name text, participant_name text, participant_id text, place integer, award_title text, score numeric)',
        'w.published'),
      ('public.set_notification_read(uuid)', 'void', 'auth.uid')
    ) as functions(signature, expected_result, source_marker)
  loop
    routine := to_regprocedure(required.signature);
    if routine is null then
      raise exception 'Required application RPC % is missing; apply and verify its prerequisite workflow migration.',
        required.signature;
    end if;

    select pg_catalog.pg_get_function_result(p.oid),
           p.prosrc,
           p.prosecdef,
           p.proconfig
    into routine_result, routine_source, is_definer, routine_config
    from pg_catalog.pg_proc p
    where p.oid = routine;

    if lower(regexp_replace(routine_result, '\s+', '', 'g'))
      <> lower(regexp_replace(required.expected_result, '\s+', '', 'g')) then
      raise exception 'RPC % returns an incompatible result shape (%).',
        required.signature, routine_result;
    end if;
    if not is_definer then
      raise exception 'RPC % must remain SECURITY DEFINER with its reviewed authorization guard.',
        required.signature;
    end if;
    if not exists (
      select 1
      from unnest(coalesce(routine_config, array[]::text[])) as config(setting)
      where lower(split_part(config.setting, '=', 1)) = 'search_path'
        and replace(split_part(config.setting, '=', 2), '"', '') = ''
    ) then
      raise exception 'SECURITY DEFINER RPC % must configure an empty search_path.',
        required.signature;
    end if;
    if position(lower(required.source_marker) in lower(routine_source)) = 0 then
      raise exception 'RPC % is missing its expected authorization/data-boundary marker (%).',
        required.signature, required.source_marker;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as config(setting)
        where lower(split_part(config.setting, '=', 1)) = 'search_path'
          and replace(split_part(config.setting, '=', 2), '"', '') = ''
      )
  ) then
    raise exception 'A public SECURITY DEFINER function lacks an explicitly empty search_path; inspect every such function before continuing.';
  end if;
end;
$function_preflight$;

alter table public.platform_settings enable row level security;
alter table public.submissions enable row level security;
alter table public.winners enable row level security;
alter table public.certificates enable row level security;
alter table public.payments enable row level security;

-- RLS policies are additive. Restrictive boundaries prevent any other
-- permissive policy from broadening participant access.
do $table_policies$
begin
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.platform_settings'::regclass and polname = 'ue_202611050003_settings_read') then
    execute $policy$create policy ue_202611050003_settings_read on public.platform_settings for select to anon, authenticated using (true)$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.platform_settings'::regclass and polname = 'ue_202611050003_settings_read_boundary') then
    execute $policy$create policy ue_202611050003_settings_read_boundary on public.platform_settings as restrictive for select to anon, authenticated using (true)$policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_read') then
    execute $policy$create policy ue_202611050003_submissions_read on public.submissions for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_read_boundary') then
    execute $policy$create policy ue_202611050003_submissions_read_boundary on public.submissions as restrictive for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_insert') then
    execute $policy$
      create policy ue_202611050003_submissions_insert
      on public.submissions for insert to authenticated
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
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_insert_boundary') then
    execute $policy$
      create policy ue_202611050003_submissions_insert_boundary
      on public.submissions as restrictive for insert to authenticated
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
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_update') then
    execute $policy$
      create policy ue_202611050003_submissions_update
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
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.submissions'::regclass and polname = 'ue_202611050003_submissions_update_boundary') then
    execute $policy$
      create policy ue_202611050003_submissions_update_boundary
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
      )
    $policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.certificates'::regclass and polname = 'ue_202611050003_certificates_read') then
    execute $policy$
      create policy ue_202611050003_certificates_read
      on public.certificates for select to authenticated
      using (
        (user_id = (select auth.uid()) and exists (
          select 1 from public.profiles participant
          where participant.id = (select auth.uid())
            and participant.account_status = 'active'
        ))
        or (select public.is_admin())
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.certificates'::regclass and polname = 'ue_202611050003_certificates_read_boundary') then
    execute $policy$
      create policy ue_202611050003_certificates_read_boundary
      on public.certificates as restrictive for select to authenticated
      using (
        (user_id = (select auth.uid()) and exists (
          select 1 from public.profiles participant
          where participant.id = (select auth.uid())
            and participant.account_status = 'active'
        ))
        or (select public.is_admin())
      )
    $policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.winners'::regclass and polname = 'ue_202611050003_winners_read') then
    execute $policy$create policy ue_202611050003_winners_read on public.winners for select to anon, authenticated using (published or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.winners'::regclass and polname = 'ue_202611050003_winners_read_boundary') then
    execute $policy$create policy ue_202611050003_winners_read_boundary on public.winners as restrictive for select to anon, authenticated using (published or (select public.is_admin()))$policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.payments'::regclass and polname = 'ue_202611050003_payments_read') then
    execute $policy$create policy ue_202611050003_payments_read on public.payments for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.payments'::regclass and polname = 'ue_202611050003_payments_read_boundary') then
    execute $policy$create policy ue_202611050003_payments_read_boundary on public.payments as restrictive for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()))$policy$;
  end if;
end;
$table_policies$;

-- Bucket rows are inserted only when absent. Existing privacy, size, or MIME
-- settings that differ from the expected contract abort instead of being
-- silently changed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ultimate-event-payment-qr', 'ultimate-event-payment-qr', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('ultimate-event-payment-receipts', 'ultimate-event-payment-receipts', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $bucket_preflight$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'ultimate-event-payment-qr'
      and name = 'ultimate-event-payment-qr'
      and public
      and file_size_limit = 2097152
      and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The payment QR bucket is absent or incompatible; expected public PNG/JPEG/WebP up to 2 MiB.';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'ultimate-event-payment-receipts'
      and name = 'ultimate-event-payment-receipts'
      and not public
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The payment receipt bucket is absent or incompatible; expected private PNG/JPEG/WebP up to 5 MiB.';
  end if;
end;
$bucket_preflight$;

alter table storage.objects enable row level security;

do $storage_policies$
begin
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_read') then
    execute $policy$create policy ue_202611050003_qr_read on storage.objects for select to anon, authenticated using (bucket_id = 'ultimate-event-payment-qr')$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_insert') then
    execute $policy$create policy ue_202611050003_qr_insert on storage.objects for insert to authenticated with check (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_update') then
    execute $policy$create policy ue_202611050003_qr_update on storage.objects for update to authenticated using (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin())) with check (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_delete') then
    execute $policy$create policy ue_202611050003_qr_delete on storage.objects for delete to authenticated using (bucket_id = 'ultimate-event-payment-qr' and (select public.is_admin()))$policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_read') then
    execute $policy$
      create policy ue_202611050003_receipts_read
      on storage.objects for select to authenticated
      using (
        bucket_id = 'ultimate-event-payment-receipts'
        and (
          (select public.is_admin())
          or exists (
            select 1 from public.payments payment
            where payment.receipt_path = storage.objects.name
              and payment.user_id = (select auth.uid())
          )
        )
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_delete') then
    execute $policy$
      create policy ue_202611050003_receipts_delete
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'ultimate-event-payment-receipts'
        and (
          (select public.is_admin())
          or (
            (storage.foldername(name))[1] = (select auth.uid())::text
            and not exists (
              select 1 from public.payments payment
              where payment.receipt_path = storage.objects.name
            )
          )
        )
      )
    $policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_read_boundary') then
    execute $policy$
      create policy ue_202611050003_receipts_read_boundary
      on storage.objects as restrictive for select to public
      using (
        bucket_id <> 'ultimate-event-payment-receipts'
        or (
          (select auth.role()) = 'authenticated'
          and (
            (select public.is_admin())
            or exists (
              select 1 from public.payments payment
              where payment.receipt_path = storage.objects.name
                and payment.user_id = (select auth.uid())
            )
          )
        )
      )
    $policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_insert_boundary') then
    execute $policy$create policy ue_202611050003_receipts_insert_boundary on storage.objects as restrictive for insert to public with check (bucket_id <> 'ultimate-event-payment-receipts' or (select auth.role()) = 'service_role')$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_update_boundary') then
    execute $policy$create policy ue_202611050003_receipts_update_boundary on storage.objects as restrictive for update to public using (bucket_id <> 'ultimate-event-payment-receipts') with check (bucket_id <> 'ultimate-event-payment-receipts')$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_receipts_delete_boundary') then
    execute $policy$
      create policy ue_202611050003_receipts_delete_boundary
      on storage.objects as restrictive for delete to public
      using (
        bucket_id <> 'ultimate-event-payment-receipts'
        or (
          (select auth.role()) = 'authenticated'
          and (
            (select public.is_admin())
            or (
              (storage.foldername(name))[1] = (select auth.uid())::text
              and not exists (
                select 1 from public.payments payment
                where payment.receipt_path = storage.objects.name
              )
            )
          )
        )
      )
    $policy$;
  end if;

  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_insert_boundary') then
    execute $policy$create policy ue_202611050003_qr_insert_boundary on storage.objects as restrictive for insert to public with check (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_update_boundary') then
    execute $policy$create policy ue_202611050003_qr_update_boundary on storage.objects as restrictive for update to public using (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin())) with check (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()))$policy$;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'storage.objects'::regclass and polname = 'ue_202611050003_qr_delete_boundary') then
    execute $policy$create policy ue_202611050003_qr_delete_boundary on storage.objects as restrictive for delete to public using (bucket_id <> 'ultimate-event-payment-qr' or (select public.is_admin()))$policy$;
  end if;
end;
$storage_policies$;

-- The UI accesses these objects only through SELECT policies or checked RPCs.
revoke all on public.platform_settings from public, anon, authenticated;
grant select (id, upi_id, account_holder_name, qr_image_path, payment_instructions)
  on public.platform_settings to anon, authenticated;

revoke all on public.submissions from public, anon, authenticated;
grant select on public.submissions to authenticated;
grant insert (registration_id, event_id, user_id, submission_url, notes)
  on public.submissions to authenticated;
grant update (submission_url, notes) on public.submissions to authenticated;

revoke all on public.winners from public, anon, authenticated;
grant select on public.winners to anon, authenticated;

revoke all on public.certificates from public, anon, authenticated;
grant select on public.certificates to authenticated;

revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;

-- Revoke obsolete direct receipt-less submission overloads if a legacy copy
-- remains. Do not drop them; callers/dependencies can be reviewed separately.
do $legacy_rpc_acl$
declare
  legacy_signature text;
  legacy_routine regprocedure;
begin
  foreach legacy_signature in array array[
    'public.submit_upi_payment(uuid,text)',
    'public.submit_upi_payment(uuid,text,text)'
  ]
  loop
    legacy_routine := to_regprocedure(legacy_signature);
    if legacy_routine is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        legacy_routine
      );
    end if;
  end loop;
end;
$legacy_rpc_acl$;

-- Existing routines are retained; only their execute grants are normalized.
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

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
