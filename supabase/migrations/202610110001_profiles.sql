create sequence if not exists public.participant_id_sequence;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  mobile text not null,
  organization text,
  qualification text,
  participant_id text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists profiles_participant_id_idx on public.profiles (participant_id);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
on conflict (id) do nothing;

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

drop trigger if exists set_profile_updated_at on public.profiles;
create trigger set_profile_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

alter table public.profiles enable row level security;

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

grant execute on function public.is_admin() to authenticated;

drop policy if exists "Users and admins can read permitted profiles" on public.profiles;
create policy "Users and admins can read permitted profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users can update their own profile fields" on public.profiles;
create policy "Users can update their own profile fields"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, mobile, organization, qualification) on public.profiles to authenticated;
grant usage, select on sequence public.participant_id_sequence to postgres, service_role;
