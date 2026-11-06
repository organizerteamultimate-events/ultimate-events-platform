# Migration Execution Plan

Status: approval-gated, forward-only reconciliation plan. No production SQL has been executed in this workspace.

## Objective

This plan reconciles the verified Ultimate Events application schema with the current production schema while preserving existing profiles, admin roles, registrations, payments, notifications, legacy tables, and user data.

## Verified production findings

- Foundation tables that must exist before reconciliation: `public.profiles`, `public.events`, `public.registrations`, `public.payments`, `public.notifications`.
- Missing workflow tables required by the app: `public.platform_settings`, `public.submissions`, `public.winners`, `public.certificates`.
- Missing or incompatible columns: `public.payments.receipt_path`, `public.payments.rejection_reason`, `public.events.submission_opens_at`, `public.events.submission_deadline`, `public.events.allow_late_submissions`, `public.events.late_submission_deadline`, `public.platform_settings.account_holder_name`, `public.platform_settings.qr_image_path`.
- Required admin guard: `public.is_admin()` must exist before migration execution.
- Required RPCs include the exact signatures used by the app: `submit_upi_payment_for_user(uuid, uuid, text, text)`, `review_upi_payment(uuid, boolean, text)`, `review_upi_payments(uuid[], boolean, text)`, `update_payment_settings(text, text, text, text)`, `admin_search_participants(text, integer, integer)`, `manage_participant(uuid, text, text)`, `review_competition_submission(uuid, text, numeric, text)`, `manage_event_winner(uuid, uuid, integer, text, boolean)`, `issue_event_certificates(uuid)`, `revoke_certificate(uuid, text)`, `verify_certificate(text)`, `get_published_winners()`, `set_notification_read(uuid)`.
- Required storage buckets: `ultimate-event-payment-qr` (public) and `ultimate-event-payment-receipts` (private).
- Required policy design: private receipt access limited to the owner or admin, public access only to QR images, and workflow submission-window rules enforced in the table RLS and function logic.

## Dependency order

1. Preflight: verify the public/auth/storage schemas and required foundation tables exist.
2. Verify `public.is_admin()`, `public.register_for_event(uuid)`, foundation columns, and the non-partial registration uniqueness key.
3. Execute only the reviewed reconciliation migration after approval. It creates or guards workflow tables, checks types and existing data, installs missing workflow indexes and `NOT VALID` foreign keys, configures storage/RLS, installs RPCs, and runs its postflight assertions in one transaction.
4. After the migration commits, run `PRODUCTION_MIGRATION_VERIFICATION.sql` read-only and verify RPC contracts, RLS/policies, grants, bucket settings, foreign keys, and indexes.
5. Test the relevant public and authenticated workflows against the live environment; do not infer authenticated success from schema checks alone.

## Exact ordered SQL execution steps requiring approval

These are the steps requiring explicit approval before any SQL is applied to production.

### Step 1: Read-only preflight

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'events', 'registrations', 'payments', 'notifications',
    'platform_settings', 'submissions', 'winners', 'certificates'
  )
order by table_name;

select proname, pg_get_function_identity_arguments(oid) as signature
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'is_admin',
    'register_for_event',
    'submit_upi_payment_for_user',
    'review_upi_payment',
    'review_upi_payments',
    'update_payment_settings',
    'verify_certificate'
  )
order by proname;
```

### Step 2: Safe schema guard

```sql
do $$
begin
  if to_regnamespace('public') is null then
    raise exception 'public schema missing';
  end if;
  if to_regnamespace('auth') is null then
    raise exception 'auth schema missing';
  end if;
  if to_regnamespace('storage') is null then
    raise exception 'storage schema missing';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'auth.users missing';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() missing';
  end if;
end;
$$;
```

### Step 3: Execute the reviewed migration

```sql
-- File: supabase/migrations/202611060001_production_schema_reconciliation.sql
```

### Step 4: Post-apply verification

Run the complete read-only script in `PRODUCTION_MIGRATION_VERIFICATION.sql`. The following spot-checks avoid printing participant or payment details.

```sql
select id,
       upi_id is not null as upi_configured,
       qr_image_path is not null as qr_configured
from public.platform_settings;

select 'submissions' as table_name, count(*) as row_count from public.submissions
union all
select 'winners', count(*) from public.winners
union all
select 'certificates', count(*) from public.certificates;

select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'submit_upi_payment_for_user',
    'review_upi_payment',
    'review_upi_payments',
    'update_payment_settings',
    'admin_search_participants',
    'manage_participant',
    'review_competition_submission',
    'manage_event_winner',
    'issue_event_certificates',
    'revoke_certificate',
    'verify_certificate',
    'get_published_winners',
    'set_notification_read'
  )
order by proname;
```

## Required safety constraints

- Do not run SQL against production without explicit approval.
- Do not run `db push`, migration repair, resets, or destructive DDL.
- Do not drop legacy `event_registrations` or any existing production records.
- Preserve the existing admin role and all user identities.
- Treat the migration as additive with a backup-and-restore fallback if unexpected drift is detected.
- Ensure policy creation is idempotent without dropping unrelated production policies.

## Risk review

| Feature | Current production compatibility | Missing dependency | Required migration | Risk | Verification status |
|---|---|---|---|---|---|
| Workflow tables | Missing or incomplete | `platform_settings`, `submissions`, `winners`, `certificates` | `202611060001_production_schema_reconciliation.sql` | High | Package verified locally; live schema requires read-only preflight and approval |
| Payment workflow | Requires receipt columns and exact RPC contracts | `payments.receipt_path`, `payments.rejection_reason`, `submit_upi_payment_for_user(uuid, uuid, text, text)` | `202611060001_production_schema_reconciliation.sql` | High | Package verified locally; live schema requires read-only preflight and approval |
| Competition windows | Requires event window columns and restrictive RLS checks | `submission_opens_at`, `submission_deadline`, `allow_late_submissions`, `late_submission_deadline` | `202611060001_production_schema_reconciliation.sql` | High | Package verified locally; live schema requires read-only preflight and approval |
| Certificate verification | Requires final function contract and readable rows | `certificates` + `verify_certificate(text)` | `202611060001_production_schema_reconciliation.sql` | Medium | Package verified locally; live schema requires read-only preflight and approval |
| Event winners | Missing table and RPC contract | `winners` + `manage_event_winner(...)` | `202611060001_production_schema_reconciliation.sql` | Medium | Package verified locally; live schema requires read-only preflight and approval |
| Payment settings | Missing settings table and admin RPC | `platform_settings` + `update_payment_settings(...)` | `202611060001_production_schema_reconciliation.sql` | Medium | Package verified locally; live schema requires read-only preflight and approval |
| Storage access | Requires safe bucket policy separation | `ultimate-event-payment-qr`, `ultimate-event-payment-receipts` | `202611060001_production_schema_reconciliation.sql` | Medium | Package verified locally; live schema requires read-only preflight and approval |

## Final control point

Only execute the final migration after confirming all of the following:

- the live schema matches the expected drift state,
- a safe backup or rollback path is verified,
- the SQL in the migration file exactly matches the reviewed version,
- existing production records and admin roles are preserved,
- no secrets or service-role material are exposed in logs or screenshots,
- historical rows satisfy required unique keys and foreign-key references. Missing foreign keys are added `NOT VALID` after an orphan check; a separate approved validation step may be needed to mark them validated.

This document is the approval gate for live execution. It does not authorize live execution in this workspace.