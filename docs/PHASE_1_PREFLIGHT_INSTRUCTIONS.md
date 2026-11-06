# Phase 1 Supabase Read-Only Preflight Instructions

## Status and safety boundary

**REMOTE NOT VERIFIED.** The repository migration files and documentation were inspected locally. No remote Supabase database was connected to or queried for this audit.

The accompanying [`phase-1-read-only-preflight.sql`](./phase-1-read-only-preflight.sql) is a catalog-only preflight package. Every executable statement is `SELECT`. It does not read participant records except for grouped counts by role/account status, does not select email addresses or private object paths, and does not select function source. Policy expression string literals and UUIDs are redacted in its output.

Do not use `supabase db push`, `migration up`, `db reset`, `migration repair`, or any deploy/write workflow for this preflight. Do not paste credentials into the script or SQL Editor.

## Identify the intended Supabase project

1. Open the Supabase Dashboard using your normal trusted browser session.
2. Select the intended organization, then the exact Ultimate Events project.
3. Check the project reference in the Dashboard URL, which has the form `https://supabase.com/dashboard/project/<project-ref>`. You can also cross-check the project's General settings page.
4. Confirm whether the selected project is production, staging, or development using your own environment inventory. Do not infer the environment solely from the project name.
5. Keep the project ref in your private notes. It is not a database credential, but redact it from shared screenshots if you prefer.
6. Do not use a connection string, database password, API key, service-role key, access token, or environment variable value for this audit.

## Run the SQL safely

1. In the confirmed project's Dashboard, open **SQL Editor** and start a new query.
2. Open the local file `docs/phase-1-read-only-preflight.sql`, review it, and paste its contents into the SQL Editor.
3. Run **one statement at a time**, in numbered order. Do not run every statement as a batch: three queries are explicitly conditional and must be skipped when their prerequisite object is absent.
4. Query 1 checks whether the Supabase migration schema/ledger, Storage schema/buckets, and public schema are available. It reads catalog names/columns only.
5. Run query 2 only if query 1 reports the migration ledger exists and its columns include `version`. If it lacks that column, stop and report the ledger's listed column names; do not guess another relation or query migration contents.
6. Run queries 3–11 and 13 as written. They inspect catalog metadata, not application rows. Query 11 redacts quoted literals and UUIDs from policy expressions before returning them.
7. Run query 12 only if query 1 confirms `storage.buckets` is available. It reads bucket configuration, never object records.
8. Run query 14 only if query 3 lists `public.profiles` with both `role` and `account_status` columns and the SQL Editor permits the aggregate read. It returns counts grouped by those columns, not user identities.
9. If a query errors because of permissions, stop. Do not switch to or request a more privileged credential as a workaround. Record the query number and sanitized error text for the project operator.
10. If any result unexpectedly contains a participant email, participant ID, private object path, credential, token, or other sensitive value, do not export or share it. Stop and notify the project owner so the output can be reviewed locally.

The file contains only `SELECT` statements, but SQL Editor permissions themselves may allow writes. Review each statement before running; do not append statements or select application rows for troubleshooting.

## Export and share results safely

1. Use the SQL Editor's result **Download CSV** or equivalent for each result set, if available. Keep each result associated with its query number.
2. Save exports in a private local folder, not in the repository, a public drive, or a public issue. Do not commit raw exports.
3. Before sharing, inspect the files locally. The script does not query participant emails or object rows; nonetheless, redact project refs, role/user names if considered sensitive, internal hostnames, and any unexpected literals.
4. Keep aggregate profile counts only if needed for access-preservation review. They are counts, not identities, but should still be treated as operationally sensitive.
5. If a CSV or screenshot includes a value that looks like a secret or private data, remove it before sharing and state which query result was redacted. Never paste passwords, keys, tokens, service-role keys, or database URLs.
6. Share results with the project owner through an approved private channel. Include the project environment label (for example, production or staging), but not credentials.

## Repository migration source inventory

This is a summary of the numbered SQL files currently present in `supabase/migrations`, in filename order. It describes repository source only, not the remote migration ledger or actual remote schema.

| Migration | Repository source scope |
|---|---|
| `202610110001_profiles.sql` | Creates the participant ID sequence and `profiles`; profile/Auth provisioning and update functions/triggers; `is_admin`; profile RLS, policies, grants and sequence access. |
| `202610110002_events.sql` | Defines/reconciles `events`, `registrations`, and `payments`; event/registration/payment checks and indexes; updated-at triggers; RLS/policies/grants; registration and UPI review functions. |
| `202610180001_reconcile_legacy_event_schema.sql` | Checks expected legacy columns/types; reconciles profiles/events/registrations/payments and constraints/indexes; provisions missing profiles; replaces triggers, policies and grants; defines registration/payment functions. Source includes a loop that drops existing policies on four tables before recreating its policy set. This file must not be replayed as a preflight. |
| `202610200001_participant_workflows.sql` | Adds account status, platform settings, submissions, winners, certificates and notifications; certificate sequence; indexes, RLS/policies/grants; participant/admin workflow RPCs for payments, submissions, participants, winners, certificates and notifications. The worktree copy has been restored; this says nothing about whether it is applied remotely. |
| `202610200002_event_registration_and_payment_review.sql` | Adds registration opening and payment rejection fields/checks; replaces payment-review function signatures and grants; updates registration/review notification flows. |
| `202610220001_auth_profile_status_repair.sql` | Checks profile compatibility; adds/validates account status, updates null status/defaults, synchronizes participant sequence, repairs Auth profile trigger/function and active-admin check, and refreshes the API schema cache. |
| `202610220002_event_payment_receipts.sql` | Checks payment schema; adds payment settings/receipt columns; defines payment QR and private receipt buckets and Storage policies; tightens table policies/grants; defines server-side receipt submission and payment review/settings RPCs. |
| `202611050001_certificate_verification_status.sql` | Drops/recreates `verify_certificate(text)` with a changed result shape to accept certificate number or verification code and distinguish revoked certificates; reassigns execute grants. |
| `202611050002_competition_submission_windows.sql` | Adds submission-window columns/check on events; drops/recreates participant insert/update policies for submissions with time-window predicates. |

Important dependency and risk cues for drift review:

- The later migrations assume earlier objects and may not repair every same-named object with a different definition.
- The certificate migration's function drop may be blocked by dependent database objects; remote dependencies and ACLs are unknown.
- PostgreSQL combines permissive RLS policies with OR. Additional remote submission policies can weaken the intended deadline policies.
- The legacy reconciliation migration intentionally replaces policy sets on selected tables; its source behavior is not a reason to run it against live data without a separate approved migration review.
- The repository's current status reports the two `20261105` migrations as unapplied. Verify this against the remote ledger; local Git state is not evidence of remote status.
- Root-level `participant_workflows_recovered.sql` is not a numbered migration and must not be run separately.

## What this preflight does not verify

- It does not run migrations, validate application workflows, inspect actual payment/registration/certificate rows, inspect Storage objects, or prove that remote policies are effective for each application role.
- Migration ledger availability and versions are only established after the conditional ledger query completes successfully.
- SQL Editor catalog visibility depends on the selected project and its execution role. An unavailable or denied query is **unknown**, not proof that an object is absent.
- Results must be compared with the ordered repository files and reviewed for drift before any separate approval to change a database.
