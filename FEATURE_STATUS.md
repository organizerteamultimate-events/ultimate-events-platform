# Ultimate Events Feature Status

**Updated:** 2026-11-05

**Evidence:** Repository source and existing `AUDIT_REPORT.md`; live providers/database not verified.

| Area | Source status | Remaining work / gate |
|---|---|---|
| Public site and discovery | Home, events, event detail, workshops, competitions, winners, leaderboard and certificate verification routes exist. Event discovery is basic. | Add approved international metadata, skill/category filters, saved events, timezone presentation. |
| Authentication/profile | Supabase Auth SSR, signup/login/reset, profile provisioning and participant ID exist. Active-account checks are present. | Verify remote schema/auth settings; add preferences/locale; improve complete accessibility testing. |
| Admin authorization | Active `profiles.role='admin'` checks protect admin surface and workflow RPCs. Existing admin access must be preserved. | No separate owner/super-admin or permission-scoped admin role. Verify every API/RPC and add auditable permission model. |
| Events/registrations | Event management, publication and registration RPC with capacity/window checks exist. | Rich event fields, archive/delete eligibility controls, universal search/reporting. |
| Manual UPI | Settings, UTR, receipt upload with image checks, private bucket path, server-side RPC, admin review/rejection reason exist in source. | Service-role and live storage config unverified. Verify migration/history and expand exports/reconciliation. |
| PhonePe | Not implemented. | Official merchant docs, onboarding, sandbox, signed callbacks, idempotency, reconciliation and credentials needed. |
| Competition windows | Four fields and RLS policies are in an unapplied migration per project status. | Live catalog/policy preflight. Existing extra permissive policies may bypass intended deadline enforcement. |
| Competition submissions | URL/notes, pending/accepted/rejected, score/feedback and admin review exist. | Secure project file storage/upload/download, file policies, history and optional teams. |
| Results/winners | Admin winner RPC and published-winner query exist. | Complete results workflow, ranking rules, exports and audit trail. |
| Certificates | Issue/revoke records, unique IDs, PDF download generated on demand, public verification. Verification migration supports code and revoked result. | New migration/live grant dependencies unverified; template builder, stored PDFs, preview/selection/bulk confirmation, broader search/history. |
| Notifications | In-app notifications for selected registration/payment/submission/result/certificate/account flows; own-row read RPC. | Preference center, complete reminders, announcements and delivery monitoring. |
| Email | SMTP helper validates recipient acceptance and throws explicit setup/provider errors; selected API actions send messages. | Provider config not present by name locally; no durable logs/outbox/retry/deduplication or complete templates. |
| Dashboard | Participant/admin routed panels and domain-specific pages exist. | Several sections are placeholder/descriptive; simpler consolidated participant overview and owner metrics/search needed. |
| Storage | Payment QR public and receipt private buckets specified in migrations. | Live bucket/policies unverified. No competition file or certificate PDF buckets. |
| Audit/security operations | RLS, fixed-search-path security-definer functions and some route-level checks exist. | No general audit log or rate limiter; perform complete route/function ACL/RLS review and negative tests. |
| Internationalization | UTC timestamps are used in many schema fields; multi-font assets exist. | No verified locale/currency/timezone-complete event model or translated UX. |
| Testing/tooling | Node smoke/contract tests; previous audit reports 24 passing, TypeScript and production build passing. | Integration/RLS/provider/viewport tests absent. No lint script/config detected in package manifest. |

## Current phase checkpoint

- Phase 1 source migration review: complete.
- Phase 1 live database compatibility: blocked; actual remote schema and migration ledger not queried.
- New certificate and submission-window migrations: project reports unapplied; never apply without separate preflight and approval.
- No production SQL, production data changes, or deployment performed in this work.
