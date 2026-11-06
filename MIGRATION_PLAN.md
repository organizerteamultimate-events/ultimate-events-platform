# Ultimate Events Migration Plan

**Status:** Proposal only. No migration SQL in this document has been applied. Do not apply production migrations without explicit approval.

## 1. Pre-migration gates

1. Confirm the exact Supabase project/ref and its environment without disclosing credentials.
2. Establish a current restorable database backup and verify recovery procedure.
3. In a read-only session, inspect `supabase_migrations.schema_migrations`, all required schemas/tables/columns/types, constraints/indexes/validation status, triggers/functions/ACLs, RLS state/policies, and Storage buckets/policies.
4. Compare remote state with each numbered repository migration; do not treat successful local tests as proof of remote application.
5. Verify the current owner/admin Auth user IDs and profile roles without changing them.
6. Identify existing rows violating proposed checks, duplicate data, unexpected policy names, dependent views/functions, and object paths before any DDL.
7. Run proposed additive migrations on a production-like staging clone and run migration-contract, workflow, and permission integration tests.
8. Obtain owner approval for the exact reviewed migration and execution window.

No live schema query or production connection was performed in this phase.

## 2. Repository migration inventory

Ordered source files:

1. `202610110001_profiles.sql` — profiles, participant ID sequence/provisioning, profile RLS, `is_admin`.
2. `202610110002_events.sql` — events, registrations, payments, indexes, RLS, registration/payment functions.
3. `202610180001_reconcile_legacy_event_schema.sql` — compatibility checks and non-destructive legacy reconciliation.
4. `202610200001_participant_workflows.sql` — account status, payment settings, submissions, winners, certificates, notifications, workflow RPCs, grants and policies. Restored in worktree; not evidence of remote application.
5. `202610200002_event_registration_and_payment_review.sql` — registration opening/payment rejection details and revised review flows.
6. `202610220001_auth_profile_status_repair.sql` — profile/schema checks, status/role repair, auth provisioning, active-admin function.
7. `202610220002_event_payment_receipts.sql` — receipt columns, private/public payment buckets and policies, secure payment submission/review.
8. `202611050001_certificate_verification_status.sql` — replaces certificate verification RPC return shape and grants.
9. `202611050002_competition_submission_windows.sql` — event submission-window fields/constraint and deadline-aware submission policies.

The root `participant_workflows_recovered.sql` is a recovery copy, not a numbered migration; executing it independently risks duplicate or conflicting operations. Do not do so.

## 3. Phase 1 safety findings

- Both new migrations depend on the workflow migration's certificates/submissions and the event/registration/profile schema.
- Certificate migration drops/recreates `verify_certificate(text)` because its return type changes; inspect external dependencies and live ACL before applying.
- Submission-window migration replaces policies by name. PostgreSQL OR-combines permissive policies, so find any extra permissive INSERT/UPDATE policies that weaken the deadline boundary.
- `ADD COLUMN IF NOT EXISTS` does not verify the type of an existing column. Confirm every column and the exact definitions of same-named constraints/indexes.
- Submission window constraint is added `NOT VALID`; inspect existing data and decide explicit validation timing after safely assessing rows.
- These two migrations do not add storage buckets, indexes, or table grants. Check live storage independently but don't conflate it with new migration behavior.
- Project status says the two new migrations are unapplied; independently confirm remote ledger and all prerequisites.

## 4. Proposed additive migration sequence

Each numbered item is a future migration proposal, not SQL approval.

### M0 — Reconciliation report (read-only)

Capture catalog output for remote migration versions, relation/column types, constraints, indexes, functions/dependencies/ACLs, triggers, policies, grants, buckets, and object policies. Produce a drift matrix and a copy of the exact reviewed catalog state. No DDL or data mutation.

### M1 — Conditional application of current pending migrations

Only if ledger and schema prove prerequisites, review the exact two new files and dependencies, apply through the approved Supabase migration workflow in staging first, test behavior, then require separate explicit production approval. No root recovery SQL.

### M2 — International event metadata and discovery

Add missing event metadata/subtype tables and normalized skills/categories after deciding source-of-truth fields. Backfill from existing category/date/description values with deterministic mappings; keep all old columns and routes working. Detect invalid codes/dates before constraints; add checks as NOT VALID only with a documented validation plan.

### M3 — Attendance, sessions, resources and preferences

Add event speaker/session/resource, attendance and participant preferences only for approved features. Introduce private bucket/object policies and server-side signed download handlers in a separate reviewed release.

### M4 — Competition settings and secure files

Add competition subtype/configuration and `submission_files`; add private bucket. Preserve existing `submissions`, records and unique registration constraint initially. Choose a final-versus-draft/attempt model before changing uniqueness or allowing team submissions. Keep file metadata/object path transactionally linked and clean up only confirmed unlinked objects under a reviewed retention process.

### M5 — Teams/review enhancements (optional)

Add teams/members and optionally append-only reviews after the competition model is approved. Migrate existing score/feedback as current summary, not duplicate review rows unless audit history is required. Enforce aggregate team sizes in an RPC/transaction.

### M6 — Durable certificate artifacts

Add certificate template/version, issue batch, PDF object path and issuer fields with nullable/backfilled additions. Keep existing certificate identifiers/verification function compatible. Generate/preview artifacts in staging; bulk issue via idempotent server/RPC operation and explicit confirmation. No existing certificate is reissued or revoked by migration.

### M7 — Owner/admin permission model and audit

Create permission catalog, role mapping, membership and append-only audit objects. First verify existing admins and owner user ID; backfill current admins without changing access. Deploy compatibility authorization checks before switching policies. Prevent self-escalation and last-owner removal; audit changes. Do not seed an owner based solely on mutable email.

### M8 — Email outbox

Add templates/outbox/attempt log with unique idempotency key and retry state. No historical message is replayed automatically. Dry-run audience preview and consent/preferences before bulk sends.

### M9 — PhonePe persistence (only after onboarding)

Add gateway transaction and webhook deduplication tables only after official contract, sandbox, merchant credentials, callback security, reconciliation, and retention requirements are settled. Keep manual UPI operation independent. No gateway status is set by frontend input.

## 5. Safe DDL and data rules

- Additive nullable/defaulted changes first; avoid table rebuilds, destructive renames, resets, cascades, and broad data rewrites.
- Use explicit transactions when supported and lock-aware indexes for large tables.
- Before adding unique constraints, run a duplicate report and define deterministic human-reviewed resolution; do not auto-delete records.
- Before adding check/FK constraints, report violations and use NOT VALID only with a plan to validate.
- Protect current admin roles, registration/payment links, certificate numbers, verification codes, and private object paths.
- Use idempotent migrations, explicit constraint definitions, fixed search paths and least privilege; never use `IF NOT EXISTS` as a substitute for drift validation.
- Keep forward-fix/rollback strategy and backup/restore test. Schema rollback must not discard new data.

## 6. Required migration acceptance

- `supabase db lint`/equivalent against staging.
- Migration ledger equals the approved sequence.
- Schema diff contains only reviewed changes.
- RLS/RPC tests cover anonymous, participant-own, other participant, ordinary admin, owner, and service role.
- Existing active admins remain authorized; ordinary users cannot grant roles.
- Payment, storage, file deadline, certificate verify/download, outbox idempotency, and audit behaviors pass integration tests.
- No real email/payment is triggered during migration validation.
- Operator signs off backup, execution, monitoring, and recovery checklist.
