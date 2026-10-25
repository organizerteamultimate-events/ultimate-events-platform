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
- `EMAIL_FROM`: verified sender address used by the configured email provider.

Most privileged actions use the signed-in administrator's Supabase session and
database-checked RPCs. Private receipt submission requires
`SUPABASE_SERVICE_ROLE_KEY` on the server so participants cannot bypass image
signature validation or call the payment-submission RPC directly. Configure it
only in local `.env.local` and Vercel server environment settings. Never expose
it with a `NEXT_PUBLIC_` prefix, commit it, or import the admin client in a
client component.

Restart the Next.js development server after changing environment variables.

On Next.js 16, the root `proxy.ts` refreshes and checks the Supabase Auth
session for protected navigation. Dashboard pages re-check the current user
and active profile on the server; admin pages additionally check the profile
role. Admin API handlers and database RPCs perform their own authorization
checks. Keep these data-bound checks even though Proxy redirects logged-out
requests.

## 2. Reconcile and apply the current database schema

The application uses `profiles`, `events`, `registrations`, `payments`,
`platform_settings`, `submissions`, `winners`, `certificates`, and
`notifications`. The sign-up table is named `registrations`; do not create a
second `event_registrations` table. The reconciliation migration preserves
legacy records, and the participant workflows migration adds the persistence
required by the existing admin and participant panels.

The existing Supabase project was inspected through its read-only REST API. It
exposed legacy `events` columns `id`, `title`, `description`, `event_date`,
`status`, and `created_at`; legacy `payments` columns `id`, `event_id`,
`user_id`, `amount`, `payment_status`, and `created_at`; and did not expose
`profiles` or `registrations`. REST visibility is not proof those latter
tables are absent: RLS or API schema exposure can hide them. Constraints,
indexes, grants, and all column types have not been fully verified remotely.
Do not run the migration until the preflight checks below confirm its
assumptions.

For a project with the inspected legacy tables, first apply the reconciliation
migration after the preflight checks, then apply the participant workflows
migration:

`supabase/migrations/202610180001_reconcile_legacy_event_schema.sql`

The reconciliation migration adds the missing event columns `category`, `registration_deadline`,
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
3. Open `202610180001_reconcile_legacy_event_schema.sql` in this repository,
   copy its complete contents into a new SQL Editor query, and run it as the project owner.
4. After it succeeds, apply `202610200001_participant_workflows.sql` as a
   separate SQL Editor query.
5. Apply `202610200002_event_registration_and_payment_review.sql` as a
   separate query to enable server-enforced registration opening times and
   required payment rejection reasons.
6. Confirm each query completed successfully. If one fails, do not retry blindly:
   preserve the full error and inspect the current schema/constraints first.
7. Verify the tables, RLS policies, and app flows before
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

Then apply:

`supabase/migrations/202610200001_participant_workflows.sql`

This migration adds active/suspended/deleted profile status, persisted public UPI
payment instructions, competition submissions and reviews, published winners,
eligible certificates, verification records, and participant notifications. It
adds server-side functions for participant search/management, atomic bulk
payment review, payment settings, result publication, certificate issuance and
revocation, and certificate verification. RLS is enabled for each new table;
admin functions validate the active admin role in Postgres. Participant
deletion is deliberately a data-preserving soft delete: contact details are
anonymized and access is blocked, while registrations, payment records, and
permanent participant IDs remain for audit/history. It does not delete
`auth.users` or cascade away event history.

For a fresh database, apply the migrations in order:

1. `202610110001_profiles.sql`
2. `202610110002_events.sql`
3. `202610180001_reconcile_legacy_event_schema.sql`
4. `202610200001_participant_workflows.sql`
5. `202610200002_event_registration_and_payment_review.sql`
6. `202610220001_auth_profile_status_repair.sql`
7. `202610220002_event_payment_receipts.sql`

The events migration now explicitly creates the legacy-compatible
`payments.payment_status` field and nullable `payments.event_id` field needed
by the reconciliation and review procedures. The nullable event link preserves
legacy payments when their original event association is unavailable; new
workflow payments are linked by the server-side RPC. For an existing project,
do not assume migration history or schema matches this sequence: inspect
Supabase migration history and run the preflight queries before applying
anything. These migrations have not been applied to the linked project from
this workspace.

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

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity,
       c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'events', 'registrations', 'payments', 'platform_settings',
    'submissions', 'winners', 'certificates', 'notifications'
  )
order by c.relname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin', 'register_for_event', 'submit_upi_payment',
    'review_upi_payment', 'review_upi_payments', 'update_payment_settings',
    'admin_search_participants', 'manage_participant',
    'review_competition_submission', 'manage_event_winner',
    'issue_event_certificates', 'revoke_certificate', 'verify_certificate',
    'get_published_winners', 'set_notification_read'
  )
order by p.proname, arguments;
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

-- Run when the relevant tables/columns already exist:
select event_id, place, count(*) from public.winners
group by event_id, place having count(*) > 1;
select event_id, user_id, count(*) from public.winners
group by event_id, user_id having count(*) > 1;
select registration_id, count(*) from public.certificates
where revoked_at is null group by registration_id having count(*) > 1;
```

Do not delete or rewrite existing rows to make these checks pass. Investigate
unexpected rows, keys, constraints, grants, or custom policies before deciding
on a migration.

The older files `202610110001_profiles.sql` and `202610110002_events.sql` are
kept for migration history. Do not paste those older files after the repair
migration. When using Supabase CLI later, first reconcile the remote migration
history with `supabase migration list`; manually running SQL in Dashboard does
not automatically record a CLI migration version. A migration version marked
applied is not proof its schema objects match these files. Review the actual
columns, constraints, indexes, function signatures, grants, and RLS policies.

Migration dependencies and app queries:

| App workflow / query surface | Required schema and functions |
| --- | --- |
| Sign-up profile trigger, role checks, profile editor | `202610110001_profiles.sql`; reconciliation fills the legacy event/payment schema before workflows |
| Public event list, event admin, event detail | Events base columns from `202610110002_events.sql`; `registration_opens_at` from `202610200002_event_registration_and_payment_review.sql` |
| Registration and free/paid status | `registrations` and `register_for_event(uuid)` from reconciliation / `202610200001_participant_workflows.sql`; opening/deadline enforcement from `202610200002_event_registration_and_payment_review.sql` |
| UPI instructions and transaction references | `platform_settings`, `submit_upi_payment(uuid,text)`, payment columns and RLS from reconciliation / participant workflows |
| Admin payment review and participant payment history | Payment columns from reconciliation; `rejection_reason` and the three-argument review RPCs from `202610200002_event_registration_and_payment_review.sql` |
| Participant search, account status, submissions, results, certificates, notifications | `202610200001_participant_workflows.sql` and its RPCs/tables |

The reconciliation migration assumes the observed legacy `events` and
`payments` tables and only accepts the column/type variants checked at its
start. `CREATE TABLE IF NOT EXISTS` does not repair an existing table with a
partial or different shape. The workflow migration likewise does not reconcile
pre-existing `platform_settings`, `submissions`, `winners`, `certificates`, or
`notifications` tables. Stop if any such table exists with a different shape,
custom grants/policies, dependent views/functions, duplicate keys, or unknown
ownership. In particular, reconciliation intentionally replaces policies and
table grants on `profiles`, `events`, `registrations`, and `payments`; the
workflow migration changes grants on the workflow tables and replaces several
same-signature functions. `202610200002` replaces the old two-argument payment
review RPCs with three-argument forms. It is transaction-wrapped and safe to
rerun after it succeeds, but custom dependencies on the old RPC signatures
must be reviewed first. Never add `CASCADE` to make a drop succeed.

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

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'profiles' and column_name in ('participant_id', 'account_status'))
    or (table_name = 'events' and column_name in ('registration_opens_at', 'registration_deadline'))
    or (table_name = 'payments' and column_name in ('registration_id', 'utr', 'status', 'rejection_reason'))
  )
order by table_name, column_name;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'register_for_event', 'submit_upi_payment', 'submit_upi_payment_for_user',
    'review_upi_payment', 'review_upi_payments'
  )
order by p.proname, arguments;
```

### Repairing account status and profile provisioning

The application requires `profiles.account_status` with the values `active`,
`suspended`, and `deleted`. The additive
`202610220001_auth_profile_status_repair.sql` migration is a compatibility
repair for a database where the expected `profiles` base columns already exist
but account status or the auth-user profile trigger is missing/incomplete. It
adds `active` as the default status and `user` as the default role for new
profiles, preserves existing non-null statuses, roles, and participant IDs,
and backfills null statuses to `active`. It synchronizes the participant-ID
sequence with existing IDs before provisioning profiles, restores the
`auth.users` profile trigger, and creates profiles only for auth users who do
not already have one. The trigger preserves the profile's role and participant
data when an existing auth user's email changes. The database admin check also
requires an active account, so suspending an admin blocks their database-level
admin RPC access as well as protected pages. It does not replace the
reconciliation or participant-workflow migrations.

Before applying it, back up the database and verify the existing profile
columns, constraints, and policies with the preflight queries above. If the
`profiles` base schema or other application migrations are missing, apply only
the missing migrations in their documented order after their respective
preflight checks; do not use this repair as a substitute for them. Run the
repair in Supabase Dashboard → SQL Editor as the project owner. The migration
is transactional and aborts rather than changing an incompatible profile
schema or resolving duplicate email conflicts by overwriting profile rows.
It does not disable RLS, change profile policies, reset data, or assign admin
roles.

Afterward, confirm `profiles.account_status` exists with default `active`, the
three allowed status values are constrained, RLS is enabled, and the
`on_auth_user_profile_created` trigger exists. Test signup with a new address,
email confirmation, active-account login, and a suspended test account before
deploying the app. Deployment does not apply database migrations; deploy the
code to the existing Vercel project only after the database change succeeds.

### Manual UPI receipts and payment QR migration

After the profile, reconciliation, participant workflow, registration/payment
review, and account-status repair migrations are present and verified, inspect
the new migration `202610220002_event_payment_receipts.sql`. It adds the admin
account-holder and QR settings, receipt object path, a public QR-only storage
bucket, a private receipt bucket, object-level RLS policies, and database RPCs
that accept only server-validated uploads and the authenticated participant's
registration amount and receipt path. It updates event publication visibility, preserves existing
registration uniqueness, and keeps payment state changes inside admin-checked
RPCs. Legacy payment history remains readable; unlinked legacy rows are not
reviewable because they have no verified registration link. New submissions
require a private receipt image.

Before applying, back up the database and check for duplicate case-insensitive
UTRs, the unique `(registrations.event_id, registrations.user_id)` constraint,
the unique pending-payment-per-registration and case-insensitive UTR indexes,
bucket ID conflicts, and the prerequisite columns/functions. Run the SQL as the
project owner in Supabase Dashboard → SQL Editor only after review.
Check its complete result; it is transaction wrapped and deliberately aborts
on missing prerequisites or incompatible pre-existing storage buckets. Do not
apply it from the CLI or run `supabase db push` without explicit approval.

After applying, set `SUPABASE_SERVICE_ROLE_KEY` as a server-only environment
variable locally and in the existing Vercel project. Verify that
`ultimate-event-payment-receipts` is private, the QR bucket contains only
public payment QR assets, the storage policies are present, and `payments` RLS
is enabled. In a staging project, submit a receipt,
confirm a participant cannot read another user's object, confirm an admin can
view it through the authenticated receipt route, reject and approve payments,
and verify registration state changes only after admin approval.

Expected: all four core tables report `relrowsecurity = true`; the expected
columns above exist; registration is executable by `authenticated` but not
`anon`; the receipt submission RPC is executable only by `service_role`;
payment-review RPCs use
`(uuid, boolean, text)` and `(uuid[], boolean, text)` and are not executable
by `anon`. Stop if any result differs. Confirm RLS policies and constraints
against the migration definitions before testing with dedicated accounts.

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
After migrations through `202610220002_event_payment_receipts.sql` are applied
and the first admin has been bootstrapped, set the business UPI ID,
account-holder name, QR image, and participant-facing instructions in
**Admin → Settings**.
These values are stored in the existing Supabase project, not in a public
environment variable. Participants launch their UPI app (where supported),
transfer the displayed amount, and submit the transaction reference. The
registration stays pending until an administrator checks the transfer and
verifies it in **Admin → Payments**. Individual and bulk reviews are validated
and committed in Postgres; rejection leaves the registration unconfirmed and
permits a corrected reference. Do not mark payments paid based only on
client-side input or screenshots. A Razorpay/other gateway is not connected;
use its signed server-side webhook and idempotency checks before switching away
from manual review.
Canceling an event does not automatically refund a verified UPI transfer;
resolve refunds separately with the participant and payment provider.

## Email configuration

Supabase Auth handles account verification and password-reset emails. For
production, configure Supabase **Authentication → SMTP Settings** using Gmail
SMTP or another transactional SMTP provider.

The app also sends registration notices, payment receipts, account-status
notices, submission reviews, winner announcements, and certificate notices
from the server using SMTP. Dashboard notifications are persisted separately
from email delivery. The app checks that SMTP accepted the recipient address;
this is not a delivery receipt and does not prove that the message reached the
inbox. Email retries are not durably queued, so inspect the status before
retrying to avoid duplicate notices. For Gmail:

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
the UI reports that the email could not be accepted by SMTP. Configure the same
SMTP provider separately in Supabase Auth for account-related messages.

## Workflow coverage, email, and deployment limits

The application code contains Supabase-backed sign-up, email verification
callback, login, logout, password reset, session refresh, profile creation,
permanent participant IDs, active-account checks, server/database admin
authorization, event registration, manual UPI review, participant account
management, submissions/reviews, published results, eligible certificate
issuance/revocation, PDF downloads, verification, and participant
notifications. These workflows depend on the migrations above. They have not
been end-to-end tested against the existing Supabase project from this
workspace; code presence and HTTP 200 responses do not establish that database
operations or RLS policies work. Do not treat this app as production-ready until
the migrations are reviewed/applied and an authenticated staging workflow
passes.

`tests/migration-contract.test.mjs` checks source-level migration contracts
(required RPC guards, grants, RLS declarations, and registration uniqueness).
These tests do not parse or execute PostgreSQL and do not replace the read-only
preflight or an isolated PostgreSQL integration test.

Still disconnected in the current application:

- Admin task creation/editing and participant task assignment.
- Admin announcement composition, consent/recipient selection, preview, and
  durable delivery logs. Existing registration/status/result emails are
  individual transactional notices, not a campaign system.
- Secure project file uploads. Competition submissions currently store
  validated HTTP(S) URLs; the app does not upload to private Supabase Storage,
  issue signed URLs, or define storage-bucket policies.
- Durable audit-log records for sensitive admin actions.
- Database-derived registration/payment/event reports and CSV exports.

Do not claim these admin sections are operational or enable them for production
until their persistence, authorization, validation, and tests are implemented.
No event, payment, score, winner, submission, or certificate demo records are
generated.

The existing Vercel project metadata is present in the local workspace and no
`vercel.json` override is required. Keep the existing Vercel project; configure
the public Supabase URL/key, `NEXT_PUBLIC_SITE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and server-side SMTP values in that project's
environment settings. Never add the Supabase service-role key to `NEXT_PUBLIC_*`
variables. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_APP_PASSWORD`, and `EMAIL_FROM` are used by server-side mail. The app
reports SMTP acceptance only; SMTP acceptance does not confirm inbox delivery.
Supabase Auth SMTP is configured separately in the Supabase dashboard.

The Vercel deployment state and build logs were not verified in this workspace:
no authenticated Vercel CLI or deployment inspection was available. The
Supabase CLI is not linked to a project, and no local PostgreSQL/Docker
environment was available to validate or execute migrations. Do not apply the
migrations automatically from this workspace or assume production is ready.
