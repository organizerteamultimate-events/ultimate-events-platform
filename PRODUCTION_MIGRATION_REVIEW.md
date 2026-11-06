# Production migration review

This package is a forward-only, production-safe reconciliation layer for the verified Ultimate Events Supabase schema. It is designed to be reviewed and approved before any execution against the live database. It does not execute SQL in production and does not rewrite or drop existing production records.

## Scope

The migration package reconciles the verified application schema against the previously audited production state by:

- creating missing workflow tables only when their presence is verified absent,
- validating existing column and table types before adding columns,
- preserving existing `profiles`, `registrations`, `payments`, `notifications`, and `event_registrations` data,
- recreating the exact RPC signatures currently expected by the app,
- enforcing least-privilege storage and RLS policies,
- failing safely when schema drift or type mismatches are detected.

## Verified compatibility gaps

The repository and migration chain confirm the following production schema gaps:

- Missing tables: `public.platform_settings`, `public.submissions`, `public.winners`, `public.certificates`
- Missing app-required columns: `payments.receipt_path`, `payments.rejection_reason`, `events.submission_opens_at`, `events.submission_deadline`, `events.allow_late_submissions`, `events.late_submission_deadline`, `platform_settings.account_holder_name`, `platform_settings.qr_image_path`
- Missing/incorrect RPC contract: `submit_upi_payment_for_user(uuid, uuid, text, text)`, `review_upi_payment(uuid, boolean, text)`, `review_upi_payments(uuid[], boolean, text)`, `update_payment_settings(text, text, text, text)`, `admin_search_participants(text, integer, integer)`, `manage_participant(uuid, text, text)`, `review_competition_submission(uuid, text, numeric, text)`, `manage_event_winner(uuid, uuid, integer, text, boolean)`, `issue_event_certificates(uuid)`, `revoke_certificate(uuid, text)`, `verify_certificate(text)`, `get_published_winners()`, `set_notification_read(uuid)`
- Missing or incompatible storage configuration: private `ultimate-event-payment-receipts` bucket and public `ultimate-event-payment-qr` bucket with safe MIME and size limits

## Safety rules applied

- No `DROP TABLE`, `TRUNCATE`, or destructive DDL is used.
- Existing production data is never reset or rewritten.
- Existing functions are not dropped unless their exact same signature is intentionally replaced during reconciliation.
- Each migration step includes explicit type guards and `RAISE EXCEPTION` failure paths.
- All privileged functions use `security definer` and `set search_path = ''`.
- Storage policies use least privilege and bucket-targeting checks.
- Policy creation uses idempotent PostgreSQL checks against `pg_catalog.pg_policy` instead of invalid `CREATE POLICY IF NOT EXISTS` syntax.
- Restrictive RLS policies enforce participant/admin row boundaries even if an older permissive table or storage policy is broader.
- RLS is enabled for payment, submission, winner, certificate, and platform-settings tables. Table and column grants are reset for those objects and then restored only for application-required operations.
- Public platform-settings reads are limited to UPI/payment display information; `updated_by`, timestamps, and any extra existing columns are not exposed.
- Receipt storage is private; participants can read only objects under their own identity path and cannot read or remove another user's receipt. Linked receipts cannot be deleted by participants. QR read/write policies affect only the QR bucket.
- Missing workflow foreign keys are added as `NOT VALID` only after a read-only orphan check; new writes are constrained, while production approval must separately decide whether/when to validate historical rows.
- Missing workflow unique indexes are added without replacing existing indexes. Duplicate historical data causes the transaction to fail rather than being rewritten.
- The migration includes postflight checks for RPC result contracts, `SECURITY DEFINER` settings, RLS states, policies, and key grants.

## Required approval gate

This package is intended to be run only after:

1. a read-only schema inventory confirms the production schema state,
2. a backup / recovery plan is documented and approved,
3. the exact SQL is reviewed against the live environment, and
4. the migration is approved for execution in the target Supabase project.

## Artifact list

- `supabase/migrations/202611060001_production_schema_reconciliation.sql` — forward-only production reconciliation migration
- `PRODUCTION_MIGRATION_VERIFICATION.sql` — read-only verification queries for the live schema
- `PRODUCTION_MIGRATION_ROLLBACK.md` — recovery and rollback guidance
- `MIGRATION_EXECUTION_PLAN.md` — execution order and approval-gated steps

## Remaining blockers

- The live production Supabase schema and migration history were not inspected from this workspace, so no live execution is claimed.
- SQL syntax and catalog behavior were reviewed locally, but no PostgreSQL server was available for executing or preparing the migration; live preflight remains mandatory.
- The transaction deliberately fails if existing workflow data violates required unique keys, foreign keys, column types, or non-null contracts. Such failures require a separate reviewed remediation; the migration does not rewrite the rows.
- No service-role or secret material was printed or exposed.
- Any final execution still requires a human approval step and an environment-specific backup validation.
