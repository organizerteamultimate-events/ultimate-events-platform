# Ultimate Events Master Plan

**Status:** Discovery and architecture proposal; implementation requires owner approval.

**Prepared:** 2026-11-05

**Scope:** Repository source and local configuration names only. This is not a live Supabase, provider, or deployment audit.

## 1. Product direction

Ultimate Events should connect event discovery, practical learning, competitions, and verifiable achievements. The first release priorities should be trustworthy registration/payment state, accessible participant workflows, complete competition submissions/reviews, and reliable certificates. Add discovery and learning features incrementally; avoid a social network, automated code execution, or complex marketplace until core operations are reliable.

## 2. Current baseline

### Working in source

- Next.js App Router application with public home, event list/detail, workshop, competition, winners, leaderboard, legal, contact, and certificate verification pages.
- Supabase Auth SSR flows, profile provisioning, active-account guard, and an admin guard based on `profiles.role = 'admin'`.
- Event CRUD/publication and registration/payment flows, including manual UPI review.
- Secure receipt route validates user, active account, registration ownership, image signature/type/size, and uses a private bucket when server service-role configuration exists.
- Participant submission records are URL-based; database has administrator scoring/feedback and accepted/rejected review.
- Certificate records, issue/revoke operations, on-demand participant PDF downloads, and public verification RPC.
- In-app notifications for several workflows.
- Configurable submission windows are in the worktree migration, which remains unapplied per project status.

These are source-code capabilities, not confirmation that remote schema, storage, SMTP, or deployed services are configured or working.

### Known gaps from source audit

- Competition project uploads, secure project downloads, team competition, and submission history versions are missing.
- Admin pages exist for several domains, but competition configuration, reporting, audit log, settings, and other listed sections are placeholders.
- Participant navigation lacks several requested areas (teams, achievements, announcements, support inbox); current support directs users to contact information.
- No configurable certificate templates or persisted PDF artifacts; bulk selection and eligibility options are limited.
- SMTP helper can send and reports SMTP acceptance, but there is no durable delivery outbox, retry, deduplication, or complete automated lifecycle.
- No PhonePe integration, gateway callback, or reconciliation code.
- Existing roles are a simple `user`/`admin` profile field. A separately protected owner role and scoped permissions are not implemented.
- No general persistent admin audit trail or rate-limit implementation was found.
- No lint script or configured ESLint tool is present in `package.json`.

See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for the phase 1 migration-source review and validation record.

## 3. Product feature evaluation

Complexity: **S** small, **M** medium, **L** large, **XL** high-risk/integration-heavy.

| Feature | User value / controls | Data and admin/participant controls | Complexity / priority |
|---|---|---|---|
| Global event discovery | Participants search relevant opportunities; admins publish accurate schedules and eligibility. | Expand events with type, location, timezone, language, currency, skill level; category/skill/tag relations; validated filters. | M / P1 |
| Skill-based recommendations | Helps participants find relevant learning without requiring a social feed. | Participant skill preferences and event skills; opt-out/edit preferences; deterministic filter/ranking first. | M / P2 |
| Personalized learning dashboard | Brings registrations, deadlines, workshops, submissions, and certificates together. | Derived from authorized existing rows; user-controlled notification preferences. | M / P1 |
| Worldwide online workshops | Makes live instruction accessible across timezones. | Reuse events as workshop records; sessions, instructor profiles, resources, attendance, recording visibility. Admin schedules and controls live links; participants register and access eligible materials. | L / P1 |
| Coding competitions / project showcases | Practical skills evidence and judging. | Competition settings, problems/rules, secure submission objects, reviews/scores, results. Admin controls windows/rubrics; participants submit and view feedback. | L / P1 |
| Beginner challenges | Provides low-friction entry and progression. | Reuse competitions with difficulty and starter resources; admin controls eligibility and hints; participants choose level. | M / P2 |
| Teams and hackathons | Supports collaborative work. | Team records/membership/invitations, team entry, team submissions, limits, and audit events. Admin can resolve disputes; participants control join/leave before lock. | L / P2 |
| Mentorship and expert webinars | Adds guided learning. | Speaker/mentor profiles, sessions, capacity, registration, consent and messaging boundaries. | L / P3 |
| Community discussions | Peer support, but adds moderation and abuse risk. | Not recommended until reporting/moderation, rate limits, privacy, and operations are staffed. | XL / Defer |
| Participant portfolio | Makes accomplishments shareable. | Explicitly public opt-in portfolio records and visibility controls; private by default. | M / P3 |
| Skill progression / badges | Shows learning progress and recognition. | Skills, achievement definitions, awarded participant achievements, criteria/provenance, revocation. Admin controls criteria; participants control public visibility. | M / P2 |
| Attendance records | Enables participation certificates and accurate workshop follow-up. | Session attendance with source and correction audit; admin correction controls and participant visibility. | M / P1 |
| Verified certificates | Portable proof with verification and revocation. | Extend existing certificates; templates and protected PDF storage; participant re-download; minimal public verification. | M / P1 |
| Public achievements | Helps participants demonstrate verified outcomes. | Participant-controlled exposure of specific verified achievements; never expose account contact data. | M / P3 |
| Global leaderboard | Existing page can display results; avoid ranking without verified scoring policy. | Published event-scoped results only; privacy policy and opt-in where appropriate. | M / P2 |
| Reminders / saved events / calendar | Reduces missed sessions and deadlines. | Favorites, timezone-aware notification preferences, reminder deduplication, calendar feed. Participant opt-in/out; admin controls event changes. | M / P2 |
| Feedback / ratings | Improves event quality. | One feedback record per eligible registration, moderation, anonymization choices. Admin controls publication; participants can edit within policy. | M / P3 |
| Referral system | May support growth but has fraud/abuse and incentive costs. | Not recommended until abuse monitoring and clear incentives are designed. | L / Defer |
| Help center / support tickets | Makes workflows understandable and gives admins traceable support. | FAQs first; ticket records only with ownership, attachment safety, retention, and response permissions. | M / P2 |
| Accessibility / internationalization | Makes discovery usable across devices, languages, and locales. | Accessible component acceptance criteria; locale-aware UI and translation resources; UTC storage and event/user timezones. | M ongoing / P1 |

P1 is foundational. P2 follows core reliability. P3 and deferred items require validation and operational capacity.

## 4. Proposed end-to-end workflows

### Participant

1. Sign up, verify/authenticate, and receive a profile/participant ID.
2. Set optional timezone, locale, accessibility, skill, and notification preferences.
3. Discover an event, review eligibility, time in local timezone, price/currency, and cancellation rules.
4. Register. For paid events, registration remains pending until verified manual UPI or an authenticated gateway event confirms payment.
5. Access event/workshop/competition materials only after eligibility is checked.
6. Submit permitted competition files before the authoritative server/database deadline; receive a durable submission receipt.
7. Review own submission history and result/feedback when available.
8. Re-download issued certificate and share verification link only if desired.

### Admin / owner

1. Authenticate and pass server-side role/permission checks on every route/RPC.
2. Draft and preview event/workshop/competition; validate capacity, currency, timezone, content, and windows.
3. Publish and monitor registrations, payments, attendance, submissions, delivery status, and errors.
4. Review payment evidence or competition submissions, recording actor, decision, reason, and timestamp.
5. Publish results, preview eligible certificate recipients, confirm bulk issuance, and handle revocation.
6. Export filtered reports with minimum necessary data; audit every privileged mutation and export.
7. Monitor retries, provider failures, storage state, and actionable system health without exposing secrets.

## 5. Administration model

Preserve all existing active administrator access. Do not equate an email string with authorization in a database policy. Add an owner/super-admin identity only after an operator verifies the existing account's immutable Auth user ID. Keep the existing `profiles.role` compatibility during transition; introduce a narrowly scoped admin-membership/permission model and use centralized server and database authorization helpers. Admins must not grant themselves owner rights or expand their own permissions. The owner can manage assignments, with protections against removing the last owner and auditable grants/revocations.

Admin sections should be delivered as real query-backed features or clearly disabled with a reason; no success-shaped placeholder actions. Universal search must be server-authorized, paginated, sorted with stable keys, and avoid returning full payment or personal data by default. CSV exports must apply the same filters and permissions and be audited.

## 6. Database proposal

The detailed source comparison, columns, keys, RLS direction, and staged migration approach are in:

- [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md)
- [DATABASE_RELATIONSHIPS.md](./DATABASE_RELATIONSHIPS.md)
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)

The repository migration baseline includes `profiles`, `events`, `registrations`, `payments`, `platform_settings`, `submissions`, `winners`, `certificates`, and `notifications`, plus functions, indexes, policies, and two payment buckets. The live schema/history is unverified. Extend and reconcile those records; do not recreate or reset them.

## 7. Recommended delivery phases

0. **Discovery and architecture:** source audit, schema proposal, security assumptions, migration/preflight plan; owner approval required before database implementation. Current deliverables are this plan and linked architecture/status documents.
1. **Database safety:** read-only remote catalog/history reconciliation, backup verification, prepare narrow additive migrations, verify staging, owner approval before any production change.
2. **Submission files:** private storage, server-side ownership/eligibility/deadline/type/size enforcement, participant history, admin review/download, tests.
3. **Certificates:** template preview, deterministic PDF generation, stored private PDFs, idempotent single/bulk issue, download, search, revocation, preserve verification.
4. **Admin control center:** owner model, permission-scoped administration, dashboard/search, all domain sections, audit log, safe exports.
5. **Communication:** templates, durable outbox, retries/deduplication, delivery logs, preferences, unsubscribe rules, in-app state.
6. **PhonePe:** official documentation and merchant onboarding, sandbox API integration, signed callback verification, idempotency/reconciliation; no live enablement without credentials and approval.
7. **Global discovery/workshops:** normalized event metadata, timezone-aware UX, sessions, approved YouTube embed handling, attendance/resources.
8. **Teams and value-add:** gated by validated demand and moderation/support capacity.
9. **Final assurance:** end-to-end permissions, migrations on staging, mobile/a11y, failure/retry tests, full build/test/security checklist, operator-approved deployment.

## 8. External services and setup

- Supabase Auth/Postgres/Storage project and verified migration history.
- Server-side Supabase service-role key only where needed; never expose it client-side.
- SMTP/provider credentials and verified sender/domain; delivery failure must be observable.
- PhonePe merchant account, official merchant credentials, configured callback endpoint, sandbox/live approval, and settlement/reconciliation procedures.
- Optional email/calendar provider only after a privacy, consent, and retention decision.
- YouTube Live URLs must be valid embeddable URLs; keep a user-initiated external link fallback and do not download or redistribute recordings without permission.

The inspected local `.env.local` key names did not include service-role, SMTP, or PhonePe variables. Values were not read or disclosed.

## 9. Open decisions and gates

- Confirm live Supabase project, schema, applied migrations, policies, and bucket state through read-only preflight.
- Confirm authoritative owner Auth user ID while preserving existing admin access.
- Decide supported currencies, pricing/tax/refund policy, locales, and event country/location data.
- Decide whether submissions are replaceable drafts, immutable final attempts, or both, and whether teams are in the initial competition release.
- Decide attendance proof rules and certificate eligibility per event.
- Choose email provider/delivery SLA, data retention, and promotional consent rules.
- Obtain official PhonePe merchant documentation/credentials before implementing a production integration.
- Approve table/migration design and staging test strategy before database changes.

## 10. Acceptance criteria

- No database operation occurs without a reviewed migration, current backup, preflight, and explicit approval.
- Every protected page, API, RPC, and storage operation enforces server/database-side authorization.
- Existing user, registration, payment, admin, submission, and certificate records remain intact.
- Payment success and email delivery are provider/database-confirmed; no UI-only success.
- Every critical workflow has automated tests, including negative authorization, race/idempotency and provider failure cases.
- Primary participant and admin workflows work with keyboard, screen reader semantics, and phone/tablet/desktop layouts.
- Release checks, runbooks, rollback/forward-fix plan, and manual provider setup are recorded.
