# Production migration rollback and recovery guidance

This document describes the recovery plan for the forward-only production reconciliation migration in this package. It does not claim that every schema change is fully reversible, especially when applying additive DDL to a live Supabase project.

## Recovery principles

- Treat the migration as additive and failure-safe, not destructive.
- Preserve all production records, including legacy `event_registrations`, existing `registrations`, and payment history.
- Do not assume a `ROLLBACK` after a partial migration is safe if irreversible logic or data-dependent triggers have already executed.
- Prefer a fresh backup and restore path if a serious mismatch is discovered after execution.
- The reconciliation file is wrapped in one transaction. Its DDL, grants, bucket inserts, policy changes, and settings-row insert commit together or roll back together when run as written.
- No migration function is invoked as part of the reconciliation transaction; sequence values are not advanced by certificate issuance during migration.
- Missing foreign keys are added `NOT VALID` only after checking existing references. New writes are enforced, but a separate reviewed `VALIDATE CONSTRAINT` step is required if the team wants catalog status `validated = true`.
- Creating required unique indexes fails the transaction if historical duplicates exist; the migration does not merge or delete those rows.

## Before execution checklist

- Confirm the production schema inventory matches the audited expectations.
- Confirm a fresh database backup exists and is testable.
- Confirm the admin account still exists and is retained.
- Confirm the migration order follows the verified dependency chain.
- Confirm storage buckets and policies are not in a custom conflicting state.
- Confirm that the migration differs only by additive, app-compatible reconciliation and does not include destructive DDL.

## If the migration fails before commit

Because the file uses a single explicit transaction and performs no external side effects, a failure before `COMMIT` rolls back the file's transactional database changes. Review the error output and do not re-run the migration until the root cause is resolved.

## If a migration partially succeeds and a rollback is needed

- Use a production backup restore process only if the environment supports it safely.
- Do not attempt to drop legacy tables or historical records.
- If a function had been created with the exact expected signature, verify whether it is safe to leave it in place while the root cause is investigated.
- If storage policies or buckets are misaligned, remove only the newly created objects related to the failed migration after reviewing the live state.
- Do not infer safety from the migration being additive: replacing a same-signature function changes future behavior, and removing newly created policies can change access. Review each such object against current application traffic before any manual recovery.

## Post-execution recovery steps

1. Run the verification SQL in `PRODUCTION_MIGRATION_VERIFICATION.sql`.
2. Check `public.platform_settings`, `public.submissions`, `public.winners`, `public.certificates`, `storage.buckets`, and the relevant policies.
3. Verify the application RPCs and page-level calls against the live schema.
4. Confirm that existing admin-role checks and participant records remain intact.
5. If a mismatch remains, restore from backup rather than attempting destructive repair scripts.

## Critical limitation

Because the migration intentionally uses additive logic and lives in a production environment, a safe rollback cannot be guaranteed for every failure mode. The migration is designed to fail early and preserve data, but restoration from a database backup remains the most reliable recovery path.
