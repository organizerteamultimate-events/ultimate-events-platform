# Ultimate Events Test Report

**Updated:** 2026-11-05

**Scope:** Existing audit results plus the focused migration contract run during Phase 1. This document-only delivery did not change application code.

## Recorded results

| Check | Result | Scope / limitation |
|---|---|---|
| `node --test` | 24 passed, 0 failed (prior audit) | Node smoke/contract tests only; no live Supabase or provider integration. |
| `node --test tests/migration-contract.test.mjs` | 12 passed, 0 failed (Phase 1) | Verifies migration text contracts, not actual PostgreSQL execution or live schema. |
| `npx tsc --noEmit` | Passed (prior audit) | Does not validate runtime/provider behavior. |
| `npm run build` | Passed (prior audit) | Production compilation only; not a deployment. |
| `git diff --check` | Passed in prior audit and Phase 1 | Worktree reports line-ending warnings in existing edited source; no whitespace error. |
| `npx supabase db lint --local` | Blocked | Local PostgreSQL endpoint was not running. |
| Lint | Not configured | `package.json` has no lint script or ESLint dependency/configuration observed. |
| Live database migration/schema test | Not run | No production connection attempted; remote history, grants, policies, columns, and buckets remain unknown. |

## Required test plan before feature release

1. Unit-test parsing, UTC/timezone conversion, file signatures, MIME/extension mismatch, size/count boundaries, deadline equality/late rules, and stable dedupe keys.
2. RLS/RPC integration matrix: anonymous, own participant, other participant, suspended account, existing admin, limited admin, owner, and service role.
3. Event/registration/payment: capacity race, duplicate registration, case-insensitive duplicate UTR, pending-payment race, cancelled registration, rejected/retried UPI, gateway callback signature/idempotency and out-of-order status.
4. Submission upload: ownership, registration/payment eligibility, open/closed/deadline boundaries, late-enabled/disabled, spoofed file type, zip bomb/resource limits, malformed archives/path traversal, file count, storage failure, duplicate request and unauthorized reviewer.
5. Certificates: rendering fixtures, Unicode names, layout overflow, preview/confirm, batch idempotency, private download authorization, revoked certificate behavior, verification minimal disclosure.
6. Email: provider not configured, provider rejection, accepted vs delivered distinction, timeout/uncertain result, retries, dedupe, unsubscribe/preferences and no fabricated success.
7. Admin workflows: audit record completeness, search filters/pagination/CSV authorization, no self-escalation, preserve last owner/admin and failed operation rollback.
8. Responsive/accessibility: smoke key journeys at phone/tablet/desktop; keyboard-only/focus, screen reader labels, no overflow, YouTube fallback/player no autoplay.
9. Staging migration: database lint, migration ledger/schema diff, backup restore rehearsal, forward-fix test, and data-preservation assertions.

## Release command checklist

After code implementation and approved migrations, run existing tests, TypeScript, build, and `git diff --check`; add and run a lint command only after tooling is approved/configured. Do not send live emails/payments or deploy as part of tests.
