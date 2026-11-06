# Ultimate Events platform audit

**Audit date:** 2026-11-05

**Scope:** Repository source, routes and components, authorization/service helpers, existing migrations, local environment-variable names, automated tests, TypeScript check, and production build. This is a source audit, not a live Supabase/Vercel audit.

## Executive summary

The repository is an existing Next.js App Router application with Supabase Auth/Postgres, public event pages, participant/admin areas, manual UPI payments, competition link submissions, result management, notifications, and certificate PDF downloads. The existing project is not yet a complete production event-management platform: several dashboard sections are placeholders, competition submissions lack file uploads, certificates are fixed-format and generated on demand, and no PhonePe gateway is implemented. Competition windows are now configured per event and enforced by the new RLS migration, which remains unapplied.

The local `.env.local` variable names were checked without reading or exposing their values. Supabase public configuration is present by name. Server-side service-role, SMTP, Resend, and PhonePe variables are absent by name, so private receipt uploads and email/gateway delivery cannot be verified or treated as configured from this workspace. The local Supabase CLI could not connect to a database on `127.0.0.1:54322`; no live schema, migration history, storage policies, or production records were inspected or changed.

## Confirmed working surfaces

- Public home, about, event, workshop, competition, contact, winners, and certificate-verification pages exist.
- Signup/login, password-reset pages, Supabase SSR session handling, participant active-account checks, and admin-role checks exist.
- Admin pages and database RPCs cover event drafts/publication, participant status management, registration/payment review, submission review, winners, and certificate issuance/revocation.
- Manual UPI receipt submission uses a server route, file-signature checks, and private Supabase Storage when server credentials are configured. Payment decisions remain database/admin controlled.
- Participant data is read through authenticated Supabase queries; multiple tables have RLS and the migrations define security-definer RPCs with fixed search paths.
- Certificate PDFs are generated on demand for the owning participant; issued certificates have unique certificate and verification identifiers in the schema.
- Existing Node tests passed (24/24), TypeScript passed, and the production build passed.

These are code-path findings, not claims that remote credentials, email delivery, storage policies, or deployed database state have been tested.

## Product discovery and architecture deliverables

The source audit and product gap analysis are documented in [ULTIMATE_EVENTS_MASTER_PLAN.md](./ULTIMATE_EVENTS_MASTER_PLAN.md). Proposed table/source comparison and RLS/storage direction are in [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md), with relationships in [DATABASE_RELATIONSHIPS.md](./DATABASE_RELATIONSHIPS.md) and a no-write migration sequence in [MIGRATION_PLAN.md](./MIGRATION_PLAN.md). [FEATURE_STATUS.md](./FEATURE_STATUS.md), [TEST_REPORT.md](./TEST_REPORT.md), and [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) track delivery status, recorded validation, and deployment gates.

The proposed schema is a design document, not a claim about the live Supabase schema. The local database endpoint was unavailable, so remote tables, columns, constraints, functions/ACLs, policies, storage buckets, migration ledger, and production records were not inspected. No production connection was attempted. The user-provided administrator identity is not promoted or seeded by email in a migration; verify its Auth user ID before designing the owner membership backfill. Database implementation and deployment remain gated on explicit approval.

## Findings and root causes

| Priority | Area | Finding / root cause | Status |
|---|---|---|---|
| High | Competition submissions | Participants submit only an external URL. The schema and UI have no approved file formats, upload limits, file storage, or submission history. | Partly fixed: configurable regular/late windows are enforced by RLS; file uploads remain open |
| High | PhonePe | No PhonePe order, callback/webhook, signature verification, idempotency, or reconciliation implementation exists. Manual UPI is a separate workflow and is not automated gateway verification. | Open; merchant onboarding/credentials also required |
| High | Environment / integrations | Local `.env.local` has no service-role, SMTP/Resend, or PhonePe variables by name. Therefore secure receipt uploads, transactional email, and gateway processing cannot be exercised here. | Configuration required; no values disclosed |
| High | Certificate persistence/templates | PDFs are composed at download time from a fixed layout. There is no stored PDF, configurable template/position/signature workflow, eligibility selector, or automatic post-event issue setting. | Open |
| Medium | Certificate verification | The public RPC previously searched active certificates by certificate number only and returned participant ID. | Fixed in worktree: verification accepts either identifier, distinguishes revoked records, and omits participant IDs |
| Medium | Admin dashboard | Admin navigation includes competitions, leaderboard, announcements, reports, audit logs, and settings, but several sections render descriptive placeholders instead of working management/reporting tools. No persistent audit log or announcement campaign workflow is defined. | Open |
| Medium | Event management | Basic draft creation, editing, and status changes exist. Duplicate/delete actions, richer event assets/instructions, event announcements, and separate start/end dates are absent. | Open |
| Medium | Notifications/email | In-app notifications exist for several actions and SMTP send helpers/routes exist. Most email sending is manually triggered after a database action; durable delivery logs, retry/idempotency, and complete automatic lifecycle messages are not present. Local SMTP is not configured by variable name. | Open |
| Medium | Reports/exports | No comprehensive participant, registration, payment, submission, winner, certificate, or delivery-report export surface was found; the admin reports section is a placeholder. | Open |
| Medium | Security operations | No general rate-limit mechanism or audit trail for sensitive actions was found in the repository. Existing per-route role checks, ownership checks, RLS, and RPC authorization should be retained while closing these gaps. | Open |
| Low | Quality tooling | The package defines build and Node test scripts but no lint script; no ESLint dependency/configuration is present in the inspected manifest. | Open |
| Fixed | Migration integrity | The worktree version of `202610200001_participant_workflows.sql` had lost workflow functions, grants, the notification index, and its commit; it also contained invalid stray SQL. These definitions were restored from the repository's existing migration and a regression test now guards them. | Fixed in worktree; not applied to any database |
| Fixed | Admin setup messaging | A configured Supabase URL/key was described as if admin database access were verified. The notice now distinguishes configured credentials from verified schema/access. | Fixed in worktree |

## Phase 1 — Database safety

**Source review: complete. Live-schema compatibility: not verified; do not apply the new migrations yet.**

The restored `202610200001_participant_workflows.sql` was checked against the numbered migration chain. Its referenced profiles, events, registrations, submissions, certificates, notifications, and payment settings objects are defined by the preceding migrations. The restoration retains the notification index, workflow RPCs, function grants, and transaction boundary. `participant_workflows_recovered.sql` is a root-level recovery copy, not a numbered Supabase migration; do not execute it separately.

The two new migrations were checked against that source baseline:

- `202611050001_certificate_verification_status.sql` reads certificate columns created by the workflow migration. It intentionally drops and recreates `verify_certificate(text)` because its returned row shape changes, then explicitly grants execution to `anon` and `authenticated`. That is not duplicate SQL, but an unrecorded database dependency on the old function could make the drop fail.
- `202611050002_competition_submission_windows.sql` adds four event columns and a new check constraint, then replaces the two submission policies already created by the workflow migration. The referenced event, profile, registration, and submission columns exist in the source chain. The constraint is added `NOT VALID`, so existing rows are not checked until it is explicitly validated.
- Neither new migration adds indexes, changes table grants, or references storage. The existing receipt migration defines the `ultimate-event-payment-qr` public bucket and `ultimate-event-payment-receipts` private bucket; their live settings were not checked.

| Check | Source finding | Live compatibility / safe next action |
|---|---|---|
| Migration history | The repository has an ordered migration chain; the two new files follow it. | The remote `supabase_migrations.schema_migrations` history was not queried. The project status says the two new versions are unapplied; independently confirm that and all prerequisite versions before considering either migration. |
| Columns and types | The required columns and types are supplied by earlier repository migrations. | Actual remote columns and types are unknown. `ADD COLUMN IF NOT EXISTS` does not validate the type of an already-existing same-named column. Compare the live schema before applying. |
| Constraints and indexes | The submission-window constraint is new; no new indexes are created. Existing workflow indexes support the source schema. | Check for same-named constraints with different definitions, inspect existing constraint validation, and confirm the expected workflow indexes on the live database. |
| Functions and grants | The certificate RPC is recreated with an updated result shape and re-granted to `anon` and `authenticated`. Submission-window SQL does not alter function grants. | Check dependencies on `verify_certificate(text)` and capture its current ACL before applying. No SQL dependencies are present in the repository, but remote dependencies cannot be ruled out. |
| RLS and policies | Both submission policies are replaced by name, preserving the intended participant checks while adding time-window checks. | PostgreSQL combines permissive policies with OR. Inventory all live INSERT/UPDATE policies on `public.submissions`; an additional broad permissive policy could bypass the deadline checks. Retire or narrow one only after reviewing its purpose and preserving admin access. |
| Storage | Neither new migration touches buckets or storage policies. The prior receipt migration specifies expected bucket privacy and limits. | Live bucket configuration and policies remain unverified; this is not a prerequisite introduced by these two migrations. |

The local Postgres endpoint was unavailable, and no production connection was attempted; the remote schema, migration history, grants, policies, and bucket state therefore remain unverified. No migration or preflight SQL was run, no production data or access was changed, and no deployment was made. The safe correction at this stage is a read-only preflight—not speculative DDL: inspect migration versions and the listed catalog objects in the Supabase SQL Editor using a read-only session, then prepare only the specific reconciliation required by the results. Take a current backup before any later authorized migration.

## Validation performed

- `node --test`: 24 passed, 0 failed.
- `node --test tests/migration-contract.test.mjs`: 12 passed, 0 failed during Phase 1 review.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `npx supabase db lint --local`: blocked because the local Postgres endpoint was not running.

## Recommended implementation order

1. Complete secure competition file upload/download and submission history on top of the new database-enforced time windows.
2. Add durable PDFs and configurable certificate eligibility/templates.
3. Implement event/workshop management gaps and useful dashboard metrics.
4. Add durable, idempotent email delivery records and complete notification lifecycle events.
5. Add authorized reports/CSV exports, announcements, and admin audit logs.
6. Implement PhonePe only after merchant onboarding and official credentials are available; test signed callbacks and reconciliation in sandbox before enabling it.
7. **Phase 1 source review is complete, but live compatibility is not cleared.** Reconcile migration history, catalog objects, and bucket state with read-only preflight queries; prepare any drift corrections and take a backup before an authorized operator considers either new migration. Do not apply them until this is complete.
