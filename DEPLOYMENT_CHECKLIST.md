# Ultimate Events Deployment Checklist

**Status:** Planning checklist only. No deployment was performed or approved.

## Database and data

- [ ] Confirm intended Supabase project and environment.
- [ ] Run read-only catalog/migration-history preflight; compare with repository.
- [ ] Confirm every prerequisite migration and resolve drift without destructive reset.
- [ ] Verify owner/admin identities and existing grants; preserve current admin access.
- [ ] Take and verify a restorable backup; rehearse recovery/forward-fix.
- [ ] Run reviewed additive migrations in staging; inspect exact schema diff.
- [ ] Test RLS, function ACLs, storage bucket privacy/policies, and actual API permissions.
- [ ] Obtain explicit approval before any production migration.

## Secrets and integrations

- [ ] Configure Supabase URL/public key and server-only service role where required.
- [ ] Confirm secret values are not in source, client bundles, logs, or database settings.
- [ ] Configure verified SMTP/provider sender and durable delivery monitoring.
- [ ] Obtain PhonePe merchant onboarding and official credentials; validate sandbox callback signatures and reconciliation before enablement.
- [ ] Configure only approved YouTube embed URLs; provide external fallback and respect recording rights.

## Application and operations

- [ ] Confirm all admin actions and routes enforce permissions server-side and create audit records.
- [ ] Confirm private bucket policies, object limits, retention, signed URL expiry and orphan cleanup.
- [ ] Confirm event timezone/currency/locale behavior and participant consent.
- [ ] Confirm registration, payment, submission, certificate, email and notification workflows with failure handling.
- [ ] Confirm accessibility, responsive breakpoints, loading/empty/error states.
- [ ] Review admin search/export permissions and minimize exported PII.
- [ ] Configure alerts for provider failures, queue backlog, database errors, and storage errors.
- [ ] Document support and incident response contacts/runbooks.

## Validation and release approval

- [ ] Run unit, integration, RLS/permission, file validation, payment, email retry, certificate PDF, and mobile/a11y tests.
- [ ] Run TypeScript, configured lint, full tests, production build, and `git diff --check`.
- [ ] Confirm no test sends real payment, email campaign, or destructive operation.
- [ ] Review `AUDIT_REPORT.md`, `FEATURE_STATUS.md`, `TEST_REPORT.md`, and migration diff.
- [ ] Obtain explicit owner approval for deployment and any production database changes.
- [ ] Deploy through the existing approved pipeline; verify health and critical workflows.
- [ ] Monitor release, record migration versions, and execute rollback/forward-fix plan if needed.
