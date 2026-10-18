# Supabase setup

This project uses Supabase Auth and Postgres through the official Supabase SSR
clients. The browser receives only the publishable/anon key. Do not add a
service-role key to frontend variables or commit actual credentials.

## 1. Configure environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: project publishable key. The legacy
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted.
- `NEXT_PUBLIC_SITE_URL`: canonical public origin used for auth callbacks and email
  links; in local development this is typically `http://localhost:3000`.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for trusted backend tasks. Keep it
  out of browser code and never commit it.
- `RESEND_API_KEY`: optional server-only key when the project uses Resend instead
  of SMTP for transactional email.
- `EMAIL_FROM`: verified sender address used by the configured email provider.

Restart the Next.js development server after changing environment variables.

## 2. Reconcile and apply the current database schema

The current application uses `profiles`, `events`, `registrations`, and
`payments`. The application table for event sign-ups is named `registrations`;
do not create a second `event_registrations` table. The app currently does not
query courses, submissions, certificates, announcements, or other proposed
tables, so this repair does not create unused schemas.

The existing Supabase project was inspected through its read-only REST API. It
exposed legacy `events` columns `id`, `title`, `description`, `event_date`,
`status`, and `created_at`; legacy `payments` columns `id`, `event_id`,
`user_id`, `amount`, `payment_status`, and `created_at`; and did not expose
`profiles` or `registrations`. REST visibility is not proof those latter
tables are absent: RLS or API schema exposure can hide them. Constraints,
indexes, grants, and all column types have not been fully verified remotely.
Do not run the migration until the preflight checks below confirm its
assumptions.

Apply this new forward migration only after that manual check:

`supabase/migrations/202610180001_reconcile_legacy_event_schema.sql`

It adds the missing event columns `category`, `registration_deadline`,
`capacity`, `price`, `created_by`, and `updated_at`; creates the app-required
`profiles` and `registrations` tables; and adds payment columns
`registration_id`, `utr`, `status`, `verified_by`, and `verified_at`. The
migration adds the profile/auth, event creator, registration/event/user, and
payment/registration/event/user foreign keys; per-user event-registration
uniqueness; case-insensitive UTR uniqueness; one-pending-payment-per-registration
uniqueness; and indexes used by event, registration, profile, and payment
queries. Legacy payment rows keep their original fields, have no invented
registration link, and do not become reviewable payments just because the
migration ran. To make RLS behavior deterministic, the migration replaces
existing policies on these four application tables (`profiles`, `events`,
`registrations`, and `payments`) with the policy set used by this app; RLS
remains enabled throughout. If another application or custom workflow also
depends on policies on these same tables, review that dependency before
applying.

To apply it manually:

1. Back up the Supabase database first.
2. In Supabase Dashboard → SQL Editor, run the read-only preflight queries below.
   Stop if an existing table has an unexpected column, type, key, constraint,
   or policy, or if its dependencies are unclear. `CREATE TABLE IF NOT EXISTS`
   does not reconcile a pre-existing `profiles` or `registrations` table, and
   `ADD COLUMN IF NOT EXISTS` does not repair a pre-existing column of the
   wrong type.
3. Open the migration file above in this repository, copy its complete contents
   into a new SQL Editor query, and run it as the project owner.
4. Confirm the query completed successfully. If it fails, do not retry blindly:
   preserve the full error and inspect the current schema/constraints first.
5. After it succeeds, verify the tables, RLS policies, and app flows before
   using the project.

The migration is transactional, repeatable, adds missing columns/tables and
indexes without deleting rows, leaves legacy payment rows unlinked, and does
not disable RLS. It replaces existing policies on the four app tables with
the exact policy set above and revokes existing table privileges from
`PUBLIC`, `anon`, and `authenticated` before granting the app's required
privileges. Review those changes for any other application that may share
these tables. Nullable foreign keys are added as `NOT VALID` to preserve
legacy rows while checking new writes. Unique indexes can still fail if
existing duplicate data violates their keys; the transaction then rolls back.
This is intended as a non-destructive repair for the observed schema, but
take a backup before applying it. It is not yet applied to the remote database.

Read-only preflight (run before the migration). First verify which tables
actually exist and inspect every existing column/type:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations', 'payments')
order by table_name;

select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations', 'payments')
order by table_name, ordinal_position;
```

Expected application types are UUID IDs and foreign-key IDs; text for event
titles/descriptions/statuses, profile text fields, payment UTR/status, and
registration statuses; integer capacity; numeric event/payment/registration
amounts; and timestamp/date values for event dates and audit timestamps.
Confirm existing `events` and `payments` contain the observed legacy columns
with compatible types. If `profiles` or `registrations` already exists, compare
its full shape to the table definition in the migration: this migration does
not add missing columns or constraints to those existing tables. Do not
proceed on a partial or incompatible shape.

Inspect existing keys, constraints, and indexes; in particular confirm unique
IDs, unique `(registrations.event_id, registrations.user_id)`, the profile
email/participant-ID keys, and that foreign keys point to the intended
`auth.users`, `events`, and `registrations` IDs. Check for existing duplicate
event IDs, case-insensitive non-null payment UTRs, and multiple pending
payments per registration, which prevent creation of the migration's unique
indexes:

```sql
select c.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid, true) as definition,
       con.convalidated
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'events', 'registrations', 'payments')
order by c.relname, con.conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('profiles', 'events', 'registrations', 'payments')
order by tablename, indexname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'events', 'registrations', 'payments')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations', 'payments')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations', 'payments')
order by table_name, grantee, column_name, privilege_type;
```

After confirming each column exists, check duplicate keys using its actual
table shape. These queries are read-only; investigate results rather than
deleting rows:

```sql
select id, count(*) from public.events group by id having count(*) > 1;
select id, count(*) from public.payments group by id having count(*) > 1;
select lower(utr), count(*) from public.payments
where utr is not null group by lower(utr) having count(*) > 1;

-- Run when the relevant tables/columns already exist:
select id, count(*) from public.profiles group by id having count(*) > 1;
select lower(email), count(*) from public.profiles
group by lower(email) having count(*) > 1;
select participant_id, count(*) from public.profiles
group by participant_id having count(*) > 1;
select event_id, user_id, count(*) from public.registrations
group by event_id, user_id having count(*) > 1;
select registration_id, count(*) from public.payments
where registration_id is not null and status = 'pending'
group by registration_id having count(*) > 1;
```

Do not delete or rewrite existing rows to make these checks pass. Investigate
unexpected rows, keys, constraints, grants, or custom policies before deciding
on a migration.

The older files `202610110001_profiles.sql` and `202610110002_events.sql` are
kept for migration history. Do not paste those older files after the repair
migration. When using Supabase CLI later, first reconcile the remote migration
history with `supabase migration list`; manually running SQL in Dashboard does
not automatically record a CLI migration version.

After running it, verify the schema and enabled RLS without reading user data:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'events', 'registrations', 'payments')
order by table_name, ordinal_position;

select relname, relrowsecurity
from pg_class
where oid in (
  'public.profiles'::regclass,
  'public.events'::regclass,
  'public.registrations'::regclass,
  'public.payments'::regclass
);

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'events', 'registrations', 'payments')
order by tablename, policyname;
```

## 3. Configure Auth

In **Authentication → URL Configuration**, set the Site URL to the deployed
site origin (or `http://localhost:3000` locally). Add these redirect URLs:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/reset-password`
- `http://192.168.1.7:3000/auth/callback` (when testing on the local network)
- `http://192.168.1.7:3000/reset-password`
- `https://YOUR-DOMAIN/auth/callback`
- `https://YOUR-DOMAIN/reset-password`

Enable email confirmation. Configure SMTP in Supabase for production delivery;
the built-in email sender is intended only for low-volume development/testing.

## 4. Bootstrap the first administrator

Create the account through the normal sign-up page and verify its email. Find
its UUID in **Authentication → Users**, then run this SQL as the project owner,
replacing the UUID:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH-USER-UUID';
```

Do not expose an admin-role option in public sign-up. The admin panel checks the
stored role on the server and in middleware.

## UPI payment configuration

This project currently uses **manual UPI verification**, not a payment gateway.
Set `NEXT_PUBLIC_UPI_ID` to the business UPI address in `.env.local` and restart
Next.js. Participants launch their UPI app (where supported), transfer the
displayed amount, and submit the transaction reference. The registration stays
pending until an administrator checks the transfer and verifies it in
**Admin → Payments**. Rejection leaves the registration unconfirmed and permits
the participant to submit a corrected reference. Do not mark payments paid
based only on client-side input or screenshots. A Razorpay/other gateway is not
connected; use its signed server-side webhook and idempotency checks before
switching away from manual review.
Canceling an event does not automatically refund a verified UPI transfer;
resolve refunds separately with the participant and payment provider.

## Email configuration

Supabase Auth handles account verification and password-reset emails. For
production, configure Supabase **Authentication → SMTP Settings** using Gmail
SMTP or another transactional SMTP provider.

The app also sends registration notices and verified-payment receipts from the
server using SMTP. For Gmail:

1. Enable 2-Step Verification on the Google account.
2. Create a Google **App Password** for this application (do not use the normal
   Gmail password).
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` to the Gmail
   address, `SMTP_APP_PASSWORD` to the generated app password, and `EMAIL_FROM`
   to a sender using that account in `.env.local` and the deployment's server
   environment.
4. Keep all SMTP variables server-side. Do not prefix them with
   `NEXT_PUBLIC_`, commit `.env.local`, or expose the app password to clients.

If SMTP is not configured, registration and payment status still persist, but
the UI reports that the email was not delivered. Configure the same SMTP
provider separately in Supabase Auth for account-related messages.

## Included workflows and remaining integrations

Supabase-backed sign-up, email verification callback, login, logout, password
reset, session refresh, profile creation, participant IDs, and user/admin page
access checks are included. For a database with the inspected legacy schema,
apply the forward reconciliation migration above; it supersedes the two older
profile/events migrations for that starting state. After the applicable schema
migration has been successfully applied, published event discovery, user
registration, pending manual UPI submissions, admin event publishing/payment
verification, participant registration/payment records, registration notices,
and verified-payment receipts are connected. Competition judging/submissions,
certificates, winners, and general announcement delivery remain separate
integrations; no scores, certificates, or other demo records are generated.
