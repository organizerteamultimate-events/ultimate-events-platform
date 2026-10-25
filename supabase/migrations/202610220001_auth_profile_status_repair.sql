begin;

do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Expected public.profiles was not found; apply and verify the profile foundation migration first.';
  end if;

  select array_agg(required.column_name order by required.column_name)
    into missing_columns
  from (values
    ('id'),
    ('email'),
    ('full_name'),
    ('mobile'),
    ('organization'),
    ('qualification'),
    ('participant_id'),
    ('role')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = 'profiles'
      and actual.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'public.profiles is incompatible with profile provisioning; missing columns: %', missing_columns;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'id' and data_type = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'email' and data_type in ('text', 'character varying')
  ) then
    raise exception 'public.profiles id/email column types are incompatible; no schema changes were made.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in ('full_name', 'mobile', 'organization', 'qualification', 'participant_id', 'role')
      and data_type not in ('text', 'character varying')
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'account_status'
      and data_type not in ('text', 'character varying')
  ) then
    raise exception 'public.profiles text column types are incompatible; no schema changes were made.';
  end if;
end;
$$;

create sequence if not exists public.participant_id_sequence;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.profiles
set account_status = 'active'
where account_status is null;

alter table public.profiles
  alter column account_status set default 'active',
  alter column account_status set not null,
  alter column role set default 'user';

do $$
declare
  max_participant_number bigint;
  current_sequence_value bigint;
  sequence_is_called boolean;
begin
  select max(
    case
      when participant_id ~ '^UE-[0-9]{4}-[0-9]{6}$'
        then substring(participant_id from '^UE-[0-9]{4}-([0-9]{6})$')::bigint
    end
  )
  into max_participant_number
  from public.profiles;

  if max_participant_number is not null and max_participant_number > 0 then
    select last_value, is_called
    into current_sequence_value, sequence_is_called
    from public.participant_id_sequence;

    perform setval(
      'public.participant_id_sequence',
      greatest(max_participant_number, case when sequence_is_called then current_sequence_value else 0 end),
      true
    );
  end if;
end;
$$;

do $$
declare
  status_constraint_name text;
begin
  for status_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname in ('profiles_account_status_check', 'profiles_account_status_allowed_check')
      and contype = 'c'
  loop
    execute format(
      'alter table public.profiles validate constraint %I',
      status_constraint_name
    );
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname in ('profiles_account_status_check', 'profiles_account_status_allowed_check')
      and contype = 'c'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_allowed_check
      check (account_status in ('active', 'suspended', 'deleted'));
  end if;
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
    raise exception 'An email address is required to provision a participant profile';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    mobile,
    organization,
    qualification,
    participant_id
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
  id,
  email,
  full_name,
  mobile,
  organization,
  qualification,
  participant_id
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
where users.email is not null
on conflict (id) do nothing;

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

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;

notify pgrst, 'reload schema';

commit;
