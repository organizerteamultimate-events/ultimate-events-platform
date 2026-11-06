# Ultimate Events Database Architecture

**Status:** Proposed target; not a live database description and not approved for implementation.

**Source baseline:** Ordered SQL migrations in `supabase/migrations/`. Actual remote schema and migration ledger were not accessible during this source audit.

## Design principles

- Preserve existing rows and the current `profiles.role = 'admin'` access path until a tested compatibility transition is approved.
- Use UUID primary keys for domain rows, UTC `timestamptz` instants, stable unique constraints, and database transactions for multi-row state changes.
- Keep canonical events, registrations, payments, submissions, certificates, and notifications. Extend them rather than creating duplicate equivalents.
- Normalize reusable categories, skills, speakers, sessions, teams, and access assignments; keep event/workshop/competition-specific settings in one-to-one subtype tables.
- Use constraints for invariants, server/RPC authorization for business operations, RLS as the row boundary, and private storage with short-lived signed downloads.
- Use `numeric` for monetary amounts and an ISO 4217 currency code. Never treat a client-supplied payment state as authoritative.
- Avoid public exposure of participant email/mobile, payment evidence, private files, PDF paths, or admin audit data.

## Repository baseline: existing objects

Column definitions below summarize the repository migrations, not a live catalog inspection. Earlier legacy reconciliation is conditional and may have encountered a different starting schema.

### `public.profiles` — existing

| Column | Type / behavior |
|---|---|
| `id` | UUID PK, references `auth.users(id)` with cascade delete |
| `email` | `text`, required, unique; normalized lower-case by provisioning flow |
| `full_name`, `mobile` | required text |
| `organization`, `qualification` | nullable text |
| `participant_id` | required unique text |
| `role` | text, default `user`, constrained to `user`/`admin` by foundation |
| `account_status` | text default `active`, allowed active/suspended/deleted |
| `suspended_at`, `deleted_at` | nullable `timestamptz` |
| `created_at`, `updated_at` | timestamps |

Indexes include unique participant ID/email and a lower(email) lookup (exact names vary across migrations). RLS restricts profile reads; authenticated users update only allowed own profile fields. `is_admin()` checks active profile admin role. Preserve roles and profile IDs.

### `public.events` — existing

| Column | Type / behavior |
|---|---|
| `id` | UUID PK |
| `title`, `category` | required text with length checks |
| `description` | required text, default empty |
| `event_date` | nullable `timestamptz` in canonical foundation; older installations are reconciled |
| `registration_opens_at`, `registration_deadline` | nullable `timestamptz` |
| `capacity` | nullable integer, when set positive |
| `price` | numeric(10,2), default 0, nonnegative |
| `status` | draft/published/cancelled/completed |
| `created_by` | nullable-compatible UUID reference to Auth user after legacy reconciliation |
| `submission_opens_at`, `submission_deadline` | nullable `timestamptz` from unapplied window migration |
| `allow_late_submissions` | boolean default false |
| `late_submission_deadline` | nullable `timestamptz` |
| `created_at`, `updated_at` | timestamps |

Constraints enforce event/category/status/pricing/capacity and registration/submission window relationships. Existing index: public schedule `(status,event_date)`. Submission-window constraint and columns are proposed in the worktree migration, not verified live.

### `public.registrations` — existing

`id uuid PK`, `event_id uuid FK events`, `user_id uuid FK auth.users`, `status` pending/confirmed/cancelled, `payment_status` not_required/pending/verified/rejected, `amount numeric(10,2)`, timestamps; unique `(event_id,user_id)`. Indexes support user/date and event/status. RLS allows participant-own and admin reads; creation is via authorized `register_for_event` RPC. Preserve its unique key and existing rows.

### `public.payments` — existing

`id uuid PK`; nullable legacy-compatible event/registration references; user UUID; amount numeric; UTR; `status` pending/verified/rejected; `payment_status`; `verified_by`, `verified_at`; `rejection_reason`; `receipt_path`; `created_at`. Existing migrations establish uniqueness for UTR (including case-insensitive guard in reconciliation) and one pending payment per registration. Receipt submission goes through server-side service role and an RPC. Admin review checks linked registration consistency, records decision/reason, and notifies the participant.

### `public.platform_settings` — existing

Singleton `id boolean PK` constrained true; UPI ID, payment instructions, account holder name, QR object path, updated timestamp/user. Public read is column-limited; mutation goes through an admin RPC. Do not put PhonePe secrets in this table.

### `public.submissions` — existing

`id uuid PK`, required unique `registration_id`, event/user UUIDs, `submission_url`, notes, status pending/accepted/rejected, nullable numeric score, feedback, submitted/reviewed timestamps and reviewer. Checks bound URL/text/score; indexes support event/status and user/time. RLS permits owner/admin reads, eligible confirmed competition inserts, and pending participant updates. Admin review is via `review_competition_submission`. Deadline migration replaces the insert/update policies by name. No file metadata or project storage reference exists.

### `public.winners` — existing

`id uuid PK`, event/user references, place 1..100, award title, published flag, timestamps; unique `(event_id,place)` and `(event_id,user_id)`. Public read is limited to published winners; updates are through `manage_event_winner`.

### `public.certificates` — existing

`id uuid PK`, registration/event/user references, participant/event snapshots, unique certificate number and verification UUID, issue timestamp, nullable revocation timestamp/actor/reason. Partial unique index permits one active certificate per registration; user/issue index. Participant/admin read is RLS-scoped. PDF is generated on demand; no saved PDF object path/template linkage currently exists.

### `public.notifications` — existing

`id uuid PK`, user FK with cascade, constrained kind, title/message, created/read timestamps. User-created index; user reads own rows and marks read through an ownership-checking RPC.

### Existing functions, triggers, grants, policies and storage

Functions include profile creation/update, `is_admin`, event registration, UPI submission/review, participant search/management, competition review, winner management, certificate issue/revoke/verify, published winner query, payment settings update, notification read, and receipt server RPCs. Security-definer functions in the source use fixed empty search paths and generally contain role/ownership guards. Review every live function ACL and policy before deployment; repository text cannot confirm live grants.

Storage in source defines public `ultimate-event-payment-qr` (2 MiB, image formats) and private `ultimate-event-payment-receipts` (5 MiB, image formats), with restrictive receipt ownership/admin policies and server-only upload. Live bucket state/policies are unknown. No project-submission or certificate PDF buckets are defined in the inspected migrations.

## Proposed target tables

Types are PostgreSQL types; all UUID `id` values are generated by `gen_random_uuid()` unless a table uses a natural/composite key. All temporal instants are UTC `timestamptz`. Indexes listed are required access-path recommendations, not claims about existing indexes. For every new table, RLS is enabled, privileges are revoked from `public`/`anon` by default, and explicit grants/policies are added only after reviewed operations exist.

### Discovery and event content

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `event_categories` (new) | `id uuid PK`, `slug text`, `name text`, `description text`, `active bool`, timestamps | unique slug; active/name index. Public active reads, owner/admin writes; avoid unbounded category creation. |
| `skills` (new) | `id uuid PK`, `slug`, `name`, `active`, timestamps | unique slug; public active reads, admin writes. |
| `event_skills` (new) | `(event_id,skill_id) PK`, both FKs with cascade, optional importance | composite uniqueness; skill/event lookup. Public only for published events; admin manages. |
| `event_tags` (new, optional) | `id uuid PK`, `slug`, `label`, `active`; relation from event through `event_tag_links` if validated | Do not add tags if categories and skills cover discovery needs. Normalize before implementation. |
| `event_speakers` (new) | `id uuid PK`, `display_name`, biography, avatar path, public profile URL, timestamps | Optional user association must not expose private profile data. Published event speaker data is public; admin controls. |
| `event_speaker_links` (new) | `(event_id,speaker_id) PK`, role/order | FKs cascade; event/speaker index. Public only on published events. |
| `workshop_details` (new subtype) | `event_id uuid PK/FK events`, instructor/session policy fields, registration requirement, attendance policy | One-to-one with an event categorized/type-designated as workshop; admin write, eligible participant/public read according to event status. Do not create a duplicate workshop entity. |
| `workshop_sessions` (new) | `id uuid PK`, `event_id FK`, `starts_at`, `ends_at`, `timezone text`, `live_url`, `recording_url`, `player_published bool` | starts < ends; URL allowlist/validation server-side; event/time index. Hide live/recording URLs until permitted; admin writes. |
| `event_resources` (new) | `id uuid PK`, `event_id FK`, title, description, object path or approved external URL, visibility/status, creator, timestamps | object path unique per bucket; do not store public signed URLs. Private by default; server verifies registration/eligibility before signing. |
| `event_favorites` (new) | `(user_id,event_id) PK`, created_at | FK to Auth/event; user-only select/insert/delete, published event requirement. |
| `event_waitlist` (new, optional) | `id uuid PK`, event/user FKs, state, joined_at, notified_at | unique `(event_id,user_id)`; queue index. Participant owns entry; admin can administer. Add only with capacity promotion rules. |
| `event_attendance` (new) | `id uuid PK`, `event_id FK`, optional session ID, `user_id FK`, status/source/marked_by/marked_at | unique event/session/user; admin/server writes, participant reads own. Audit corrections. |
| `event_feedback` (new, optional) | `id uuid PK`, event/user FKs, rating, comment, created/updated | unique `(event_id,user_id)`, check rating range; participant owns, admin moderates, public aggregates only. |

Event additions should be additive: `ends_at`, `location_mode` (online/offline/hybrid), `country_code`, `city`, venue/online display location, `language_code`, `timezone`, `currency_code`, `skill_level`, `banner_path`, instructions, and publication timestamp. Add check constraints for supported codes and dates. `price` remains numeric but currency is required before international pricing is enabled. Whether event `category` becomes a FK is a migration decision; preserve its text value during backfill.

### Registration, preferences and payment

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `participant_preferences` (new) | `user_id uuid PK/FK auth.users`, locale, timezone, accessibility prefs, created/updated | validated locale/timezone; user-only read/write. Keep only preferences, not duplicated profile fields. |
| `user_notification_preferences` (new) | `user_id uuid PK/FK`, channel/category opt-ins, updated_at | user-only read/write; transactional/required notices cannot be silently disabled where legally permitted. |
| `payment_gateway_transactions` (new) | `id uuid PK`, registration FK, user FK, provider, provider transaction/order IDs, amount/currency, status, idempotency key, initiated/verified/expiry timestamps, sanitized response metadata | unique provider order/transaction and idempotency key; registration/status index; immutable provider facts. Participant reads own safe fields, admin reads; only trusted server/RPC mutates. |
| `payment_webhook_events` (new) | `id uuid PK`, provider, provider event ID, event type, received/processed timestamps, signature-valid flag, processing status, minimal payload hash/reference, error code | unique `(provider,event_id)`; never store secrets or unnecessary raw PII. Service role only. |
| `payments` additions (existing) | add `currency_code` only after currency policy; optionally gateway relation/settlement metadata after reconciliation design | preserve existing UTR unique and pending-registration uniqueness; no browser can set verified status. |
| `platform_settings` additions (existing) | no gateway secret fields; optional public merchant display settings | keep secrets in managed server environment/provider vault. Admin RPC and audit. |

### Competitions and submissions

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `competitions` (new subtype) | `event_id uuid PK/FK events`, participation mode, team min/max, allowed file types, max bytes/files, late rules, result publication time, rubric version | checks on limits/windows; admin writes; published participant-safe read. Keep event dates and base registration in `events`. |
| `competition_problems` (new) | `id uuid PK`, event FK, title, statement, difficulty, display order, optional resource | unique event/order; public only when published/eligible. |
| `competition_teams` (new) | `id uuid PK`, event FK, name, creator user FK, status, created_at | unique event/name (case-normalized index), size/state checked transactionally; member/admin policies. |
| `competition_team_members` (new) | `id uuid PK`, team/user FKs, membership role/status, invited/joined timestamps | unique `(team_id,user_id)`; only one accepted team per event/user where policy says so (partial unique index through event relation may require transaction/RPC). |
| `submission_files` (new) | `id uuid PK`, submission FK, private bucket/object path, original display name, detected MIME, byte size, checksum, uploaded_at | unique bucket/path; positive bounded size and per-submission count enforced transactionally; participant reads own, admin reads, uploads/deletes only through verified server flow. |
| `submission_reviews` (new, only if review history/rubric is required) | `id uuid PK`, submission FK, reviewer FK, status, score, feedback, rubric/version, created_at | append-only; reviewer/admin read; mutation only via permission-checked RPC. Existing submission score/feedback remain the latest summary, not a second source of truth. |
| `submissions` (existing) | retain current columns for migration compatibility; later add `finalized_at`, optional `team_id` or entry reference if team workflow approved | Current unique registration key means one record per registration. Decide and migrate attempt semantics before multiple finals; do not silently drop uniqueness or invalidate existing rows. |

Use the database time in the final submission RPC, locking the competition/entry as needed. Validate user/registration/payment/team, status, configured window, and file metadata before accepting. Bucket limits are defense-in-depth, not the sole validation. Never execute submitted code.

### Certificates, results and achievements

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `certificate_templates` (new) | `id uuid PK`, name, version, private/public-approved background path, layout config, active, created_by, timestamps | version unique per template; only authorized admins manage; validate layout and assets. |
| `certificates` (existing additions) | nullable/required template FK after backfill, PDF private object path, issued_by, issue batch, status/metadata | preserve certificate number/verification uniqueness and one-active-per-registration; participant can request own PDF through server; admin manage/revoke. |
| `certificate_issue_batches` (new) | `id uuid PK`, event FK, criteria snapshot, preview count/hash, requested_by, confirmed_by, status, created/confirmed timestamps | preview and explicit confirm; unique idempotency key; admin/owner only. |
| `certificate_verification_logs` (optional) | `id uuid PK`, certificate FK, timestamp, minimal client/network telemetry | avoid IP retention unless justified; aggregate/short retention; service-only. Prefer no persistent log initially. |
| `result_categories` (new, optional) | `id uuid PK`, event FK, name, sort order | unique event/name; admin manages. |
| `event_results` (new, optional) | `id uuid PK`, event/user/team FKs, category/place/score, publication state and timestamps | unique event/category/place and entry; published-only public read. Existing `winners` remains source of current winner rows until an explicit data-preserving migration replaces/extends it. |
| `achievements` (new) | `id uuid PK`, slug, name, description, criteria/version, icon path, active | unique slug; public definition read; admin writes. |
| `participant_achievements` (new) | `id uuid PK`, achievement/user/event references, source type/id, awarded/revoked timestamps, visibility | unique achievement/user/source; participant read/control of visibility; only trusted award workflows write. |

Do not duplicate winners with results until a versioned migration defines a single canonical write path. Retain `winners` API/RPC compatibility during transition.

### Email, audit and support

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `email_templates` (new) | `id uuid PK`, unique key/version, subject/text/html templates, active, updated_by/time | admin write; escape user content at render; templates cannot execute arbitrary code. |
| `email_logs` (new durable outbox) | `id uuid PK`, recipient user/email snapshot, template/version, event key, dedupe key, status, attempt count, next attempt, provider message ID, accepted/delivered timestamps, sanitized error, created/updated | unique dedupe key; retry/status index. Service role writes; admins read limited fields. Accepted is distinct from delivered. |
| `email_delivery_attempts` (new, recommended) | `id uuid PK`, email log FK, attempt number, started/finished, provider result/error code | unique `(email_log_id,attempt_number)`; immutable service-only; retention policy. |
| `announcements` (new) | `id uuid PK`, title/body, audience criteria, publication window, creator, status | audience preview/count and approval before broadcast; public/participant read limited by audience; admin mutate. |
| `admin_audit_logs` (new) | `id uuid PK`, actor user FK snapshot, action, resource type/id, request/correlation ID, before/after redacted JSON, timestamp | append-only, indexed actor/resource/time; owner/authorized auditor read; no general delete/update. Redact secrets and minimize PII. |
| `support_tickets` (optional) | `id uuid PK`, user FK, subject, state, priority, created/updated, assignee | owner/user-scoped; staff permission required; attachment handling via private storage. Defer until staffed. |

### Admin permissions

| Table | Columns / keys / relationships | Constraints / indexes / access |
|---|---|---|
| `admin_permissions` (new) | `permission_key text PK`, description | controlled deployment-owned catalog; no client writes. |
| `admin_roles` (new) | `role_key text PK`, name, immutable flag | owner role immutable; owner-only assignment management. |
| `admin_role_permissions` (new) | `(role_key,permission_key) PK`, FK to both | only protected owner workflow changes assignments; changes audited. |
| `admin_memberships` (new) | `user_id uuid PK/FK auth.users`, `role_key FK`, granted_by FK, granted_at, revoked_at | protect last active owner; no self-escalation; only server/RPC owner operation writes. Existing `profiles.role='admin'` accounts require an audited backfill preserving access. |

Initially retain a single verified owner and a compatibility role for existing admins. A role grant must not rely on user-editable profile fields. RLS admin policies should call a reviewed permission function with fixed search path and least execution grants.

## Proposed core table specifications

These are complete minimum specifications for the **new core tables selected for the initial architecture**. Optional tables in feature evaluation are not part of this target and must receive a separate schema/security review before being added. All listed tables use RLS; deny anonymous access by default, grant no broad `PUBLIC` privileges, and retain append-only records where noted.

### Event taxonomy and preferences

**`event_categories`** — canonical event classification.

- Columns: `id uuid`, `slug text`, `name text`, `description text`, `active boolean`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; unique: `slug`; indexes: `(active,name)`.
- Relationships: one category has many events; initially preserve `events.category text` and add nullable `category_id` FK for backfill/compatibility.
- RLS/access: public reads active categories; authorized event managers write; server validates slugs.
- Retention: retain category rows referenced by events; deactivate rather than delete.

**`skills`** — controlled vocabulary for learning/search.

- Columns: `id uuid`, `slug text`, `name text`, `description text`, `active boolean`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; unique: `slug`; indexes: `(active,name)`.
- Relationships: many-to-many with events through `event_skills`.
- RLS/access: public reads active skills; only authorized taxonomy managers write.
- Retention: deactivate referenced skills; preserve historical event mappings.

**`event_skills`** — event-to-skill bridge.

- Columns: `event_id uuid`, `skill_id uuid`, `importance smallint`, `created_at timestamptz`.
- PK/unique: `(event_id,skill_id)`; FKs cascade from `events` and `skills`; check importance range if used; indexes: `(skill_id,event_id)`.
- RLS/access: public reads only for published events; event manager writes.
- Retention: cascade only when an event is legitimately removed under a separate audited deletion policy; preserve skills.

**`participant_preferences`** — user-controlled locale, timezone and discovery settings.

- Columns: `user_id uuid`, `locale text`, `timezone text`, `accessibility_preferences jsonb`, `skill_level text`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `user_id`; FK to `auth.users(id)` cascade; check supported values and valid IANA timezone at service boundary; indexes unnecessary beyond PK initially.
- RLS/access: owner select/insert/update; no public reads; accessibility JSON schema validated server-side.
- Retention: delete with account only under account-retention policy; do not use preferences as authorization claims.

**`user_notification_preferences`** — communication choices.

- Columns: `user_id uuid`, `transactional_email boolean`, `promotional_email boolean`, `in_app boolean`, `workshop_reminders boolean`, `updated_at timestamptz`.
- PK/FK: `user_id -> auth.users(id)` cascade.
- Unique/indexes: PK only.
- RLS/access: owner read/update; server controls mandatory/security notices and applies applicable consent law.
- Retention: retain only while account active unless a consent/audit obligation requires a minimal history.

### Learning and event sessions

**`event_speakers`** — reusable public instructor/speaker identity.

- Columns: `id uuid`, `display_name text`, `biography text`, `avatar_path text`, `profile_url text`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FK `created_by -> auth.users(id)`; indexes `(display_name)`; no uniqueness on names.
- Relationships: many-to-many with events via `event_speaker_links`.
- RLS/access: public reads only speaker data linked to published events; authorized admins write; validate external URL and avatar path.
- Retention: keep snapshots referenced by past events; anonymize only after review.

**`event_speaker_links`** — speaker/event relation.

- Columns: `event_id uuid`, `speaker_id uuid`, `speaker_role text`, `display_order integer`.
- PK/unique: `(event_id,speaker_id)`; FKs cascade to event and speaker; index `(speaker_id,event_id)`.
- RLS/access: published event read; event manager write.
- Retention: follows event retention.

**`workshop_details`** — one-to-one workshop subtype.

- Columns: `event_id uuid`, `registration_required boolean`, `attendance_policy text`, `join_instructions text`, `created_at timestamptz`, `updated_at timestamptz`.
- PK/FK: `event_id -> events(id)` cascade; check attendance policy enum; unique is inherent in PK.
- RLS/access: published-safe fields public; private instructions only to eligible registrants; event manager write.
- Retention: follows event retention.

**`workshop_sessions`** — scheduled live/recorded session.

- Columns: `id uuid`, `event_id uuid`, `title text`, `starts_at timestamptz`, `ends_at timestamptz`, `timezone text`, `live_url text`, `recording_url text`, `player_published boolean`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FK `event_id -> events(id)` cascade; checks `starts_at < ends_at`; indexes `(event_id,starts_at)` and `(player_published,starts_at)`.
- RLS/access: participant-safe session times public for published events; live/recording access follows registration policy; admin controls links and publication. Validate YouTube hosts and embed IDs server-side.
- Retention: retain session metadata with event; remove recordings only after rights/retention review.

**`event_resources`** — materials or approved external resources.

- Columns: `id uuid`, `event_id uuid`, `title text`, `description text`, `object_path text`, `external_url text`, `visibility text`, `created_by uuid`, `created_at timestamptz`.
- PK: `id`; FKs event and creator; check exactly one of `object_path`/`external_url`; unique `(event_id,object_path)` where path is not null; index `(event_id,visibility)`.
- RLS/access: no direct storage path exposure for private resources; server validates eligible registration before short-lived signing; admins manage.
- Retention: follow event/resource rights policy; delete object only after database reference/retention checks.

**`event_attendance`** — authoritative attendance record used for reporting and eligibility.

- Columns: `id uuid`, `event_id uuid`, `session_id uuid`, `user_id uuid`, `status text`, `source text`, `marked_by uuid`, `marked_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FKs event/session/user/marker; choose one unique key before implementation: `(session_id,user_id)` for session attendance or `(event_id,user_id)` for event-level attendance. Index `(event_id,marked_at)` and `(user_id,marked_at desc)`.
- Checks: status/source enums; session must belong to event, validated transactionally.
- RLS/access: participant reads own record; authorized attendance admin writes through RPC; corrections require audit entry. No public read.
- Retention: retain as event participation evidence under attendance/certificate retention policy; do not silently overwrite corrections.

### Competition and judging

**`competitions`** — one-to-one competition configuration.

- Columns: `event_id uuid`, `participation_mode text`, `min_team_size smallint`, `max_team_size smallint`, `allow_multiple_submissions boolean`, `max_files smallint`, `max_file_bytes bigint`, `allowed_extensions text[]`, `allowed_mime_types text[]`, `result_publish_at timestamptz`, `created_at timestamptz`, `updated_at timestamptz`.
- PK/FK: `event_id -> events(id)` cascade; checks on mode, positive limits, file-size cap and min/max team sizes; index on `result_publish_at` if scheduling requires.
- Relationships: problems and teams; event stores canonical schedule/window, and competition-specific limits stay here.
- RLS/access: public reads safe settings only for published competitions; admin writes; final submission RPC reads canonical window and limits.
- Retention: follows event; retain settings snapshots needed to interpret historical submissions.

**`competition_problems`** — problem statements and ordering.

- Columns: `id uuid`, `event_id uuid`, `title text`, `statement text`, `difficulty text`, `display_order integer`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FK event; unique `(event_id,display_order)`; index `(event_id,difficulty)`.
- RLS/access: published/eligible participants read; admins write; do not expose hidden problems before configured release time.
- Retention: retain with event results.

**`competition_teams`** — participant team.

- Columns: `id uuid`, `event_id uuid`, `name text`, `created_by uuid`, `status text`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FKs event and Auth creator; unique `(event_id,lower(name))` via unique expression index; index `(event_id,status,created_at)`.
- Relationships: members and team submissions.
- RLS/access: members read own team; admins read/manage; create/update only through transactions checking event mode, deadlines and limits.
- Retention: retain historical teams with results; closed teams are deactivated, not silently deleted.

**`competition_team_members`** — team membership/invitation state.

- Columns: `id uuid`, `team_id uuid`, `user_id uuid`, `membership_role text`, `status text`, `invited_at timestamptz`, `joined_at timestamptz`, `left_at timestamptz`.
- PK: `id`; FKs team and Auth user; unique `(team_id,user_id)`; index `(user_id,status)` and `(team_id,status)`.
- RLS/access: own membership and team members read according to policy; joins/invites/leave through checked RPC; admin can resolve.
- Retention: preserve membership history for judged submissions; do not cascade Auth deletion if audit/results require a participant snapshot.

**`submission_files`** — metadata linking private objects to existing submissions.

- Columns: `id uuid`, `submission_id uuid`, `bucket_id text`, `object_path text`, `display_name text`, `detected_mime text`, `byte_size bigint`, `sha256 text`, `uploaded_at timestamptz`.
- PK: `id`; FK submission; unique `(bucket_id,object_path)`; indexes `(submission_id,uploaded_at)` and optionally `sha256` for deduplication.
- Checks: positive bounded `byte_size`; bucket/path constrained to configured private bucket and opaque generated path; file count/aggregate size checked transactionally.
- RLS/access: participants/admins read authorized metadata; object uploads/downloads through server-side ownership/deadline/permission flow; no public bucket grants.
- Retention: delete only after event retention/appeal policy; keep review evidence as long as required.

**`submission_reviews`** — append-only rubric/reviewer history when approved.

- Columns: `id uuid`, `submission_id uuid`, `reviewer_id uuid`, `status text`, `score numeric(10,2)`, `feedback text`, `rubric_version text`, `created_at timestamptz`.
- PK: `id`; FKs submission and reviewer; index `(submission_id,created_at desc)` and `(reviewer_id,created_at desc)`.
- Checks: allowed state, finite nonnegative score and bounded feedback; no uniqueness so authorized review history is retained.
- RLS/access: participant reads own review; authorized reviewers append through RPC; no client update/delete.
- Retention: retain with submission/result appeal period; immutable.

### Certificate and admin records

**`certificate_templates`** — controlled PDF template versions.

- Columns: `id uuid`, `template_key text`, `version integer`, `name text`, `background_path text`, `layout jsonb`, `active boolean`, `created_by uuid`, `created_at timestamptz`.
- PK: `id`; FK creator; unique `(template_key,version)`; index `(template_key,active)`.
- RLS/access: no public writes; owner/authorized certificate manager reads/writes; validate asset path/layout schema and snapshot template version on issue.
- Retention: immutable versions retained while certificates reference them.

**`certificate_issue_batches`** — auditable preview/confirmation.

- Columns: `id uuid`, `event_id uuid`, `template_id uuid`, `criteria jsonb`, `preview_count integer`, `preview_hash text`, `status text`, `requested_by uuid`, `confirmed_by uuid`, `created_at timestamptz`, `confirmed_at timestamptz`.
- PK: `id`; FKs event/template/requester/confirmer; unique `idempotency_key text`; index `(event_id,created_at desc)`.
- Checks: status enum and nonnegative count; freeze criteria and preview hash before confirmation.
- RLS/access: certificate managers only; participant does not control batch; confirmation RPC rechecks eligibility and count.
- Retention: audit/business records retained per certificate policy; immutable after completion.

**Existing `certificates` additions** — persisted PDF and issuance provenance.

- Add: `template_id uuid`, `pdf_object_path text`, `issued_by uuid`, `issue_batch_id uuid`, optional `eligibility_snapshot jsonb`.
- Keep current PK/FKs, unique certificate number and verification code, active-per-registration unique index; add unique private object path and `(event_id,issued_at desc)` / `(user_id,issued_at desc)` indexes as needed.
- RLS/access: preserve existing owner/admin read; participant downloads through ownership-checked API, admin has scoped issue/revoke. Verification remains public with minimum fields.
- Retention: retain certificate/audit snapshots through revocation; object retention according to legal/business policy.

**`admin_permissions`** — deployment-controlled permission vocabulary.

- Columns: `permission_key text`, `description text`.
- PK: `permission_key`; no additional index required.
- RLS/access: no client writes; read only to authorized owner/admin UI.
- Retention: retain keys referenced by role assignments and audit history.

**`admin_roles`** — stable role catalog.

- Columns: `role_key text`, `name text`, `immutable boolean`, `created_at timestamptz`.
- PK: `role_key`; unique `name`.
- RLS/access: owner-only administration, immutable owner role cannot be edited or removed.
- Retention: no hard-delete if referenced; deactivate only through audited owner operation.

**`admin_role_permissions`** — role/permission join.

- Columns: `role_key text`, `permission_key text`, `granted_at timestamptz`, `granted_by uuid`.
- PK/unique: `(role_key,permission_key)`; FKs role/permission and grantor; index `(permission_key,role_key)`.
- RLS/access: owner-only RPC mutation; no self-escalation; changes append to audit log.
- Retention: retain or version changes for audit; do not remove referenced records without history preservation.

**`admin_memberships`** — admin assignment.

- Columns: `user_id uuid`, `role_key text`, `granted_by uuid`, `granted_at timestamptz`, `revoked_at timestamptz`.
- PK: `user_id`; FKs to Auth users and roles; index `(role_key,revoked_at)`.
- Constraint: at most one active owner enforced transactionally; existing admin migration/backfill must preserve all active admins.
- RLS/access: owner-only assignment, self-edit denied; authorization function reads active membership and permission.
- Retention: retain revoked memberships for audit; do not cascade away historical actor identity.

**`admin_audit_logs`** — immutable sensitive-action trail.

- Columns: `id uuid`, `actor_id uuid`, `action text`, `resource_type text`, `resource_id text`, `request_id text`, `before_state jsonb`, `after_state jsonb`, `created_at timestamptz`.
- PK: `id`; actor FK nullable only for trusted system action; indexes `(created_at desc)`, `(actor_id,created_at desc)`, `(resource_type,resource_id,created_at desc)`.
- Unique: optional request/action idempotency key if emitted by every writer.
- RLS/access: insert only via trusted server/RPC; owner/auditor read; no update/delete. Redact secrets and minimize PII before insert.
- Retention: define per policy and jurisdiction; preserve under legal hold; purge only by privileged retention process with purge audit.

### Email and payment integration

**`email_templates`** — reusable content.

- Columns: `id uuid`, `template_key text`, `version integer`, `subject text`, `text_body text`, `html_body text`, `active boolean`, `updated_by uuid`, `created_at timestamptz`.
- PK: `id`; unique `(template_key,version)`; index `(template_key,active)`.
- RLS/access: authorized email admins write; delivery service reads active templates; sanitize escaped variables at render.
- Retention: retain referenced versions until delivery records expire.

**`email_logs`** — durable outbox and final provider status.

- Columns: `id uuid`, `recipient_user_id uuid`, `recipient_email text`, `template_id uuid`, `template_version integer`, `event_key text`, `dedupe_key text`, `status text`, `attempt_count integer`, `next_attempt_at timestamptz`, `provider_message_id text`, `accepted_at timestamptz`, `delivered_at timestamptz`, `last_error_code text`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FKs recipient/template; unique `dedupe_key`; indexes `(status,next_attempt_at)` and `(recipient_user_id,created_at desc)`.
- RLS/access: service role creates/updates; authorized email admin reads redacted details; participants may see own delivery status only if product requires.
- Retention: retain delivery evidence for a defined operational/legal period; minimize email snapshots and redact message bodies.

**`email_delivery_attempts`** — append-only provider call history.

- Columns: `id uuid`, `email_log_id uuid`, `attempt_number integer`, `started_at timestamptz`, `finished_at timestamptz`, `provider_status text`, `provider_message_id text`, `error_code text`.
- PK: `id`; FK email log; unique `(email_log_id,attempt_number)`; index `(email_log_id,started_at)`.
- RLS/access: service role insert; admins read sanitized status; no update/delete.
- Retention: same or shorter than email log; never store SMTP credentials or full provider secrets.

**`payment_gateway_transactions`** — trusted server gateway lifecycle.

- Columns: `id uuid`, `registration_id uuid`, `user_id uuid`, `provider text`, `provider_order_id text`, `provider_transaction_id text`, `idempotency_key text`, `amount numeric(10,2)`, `currency_code char(3)`, `status text`, `initiated_at timestamptz`, `verified_at timestamptz`, `expires_at timestamptz`, `sanitized_metadata jsonb`, `created_at timestamptz`, `updated_at timestamptz`.
- PK: `id`; FKs registration/user; unique `(provider,provider_order_id)`, `(provider,provider_transaction_id)` where not null, and `idempotency_key`; indexes `(registration_id,created_at desc)` and `(status,created_at)`.
- Checks: positive amount; allowed lifecycle state; settlement amount/currency must match registration.
- RLS/access: participant reads safe own status; admin reads; service role/RPC is only writer of provider status.
- Retention: retain transaction/reconciliation evidence per financial rules; never store credentials or full card/UPI secrets.

**`payment_webhook_events`** — callback dedupe and processing evidence.

- Columns: `id uuid`, `provider text`, `provider_event_id text`, `transaction_id uuid`, `event_type text`, `payload_hash text`, `signature_valid boolean`, `processing_status text`, `received_at timestamptz`, `processed_at timestamptz`, `error_code text`.
- PK: `id`; FK optional transaction; unique `(provider,provider_event_id)`; index `(processing_status,received_at)`.
- RLS/access: service role only; signature validation happens before trusted processing; store hash/minimal sanitized metadata, not secrets.
- Retention: short operational retention for raw event metadata; preserve financial reconciliation references as required.

### Core access defaults and deferred entities

The public event/session/resource policies described above are subject to publication and registration state. All mutation RPCs must re-check the actor, active account, ownership, deadlines and allowed status transitions inside the transaction. Every new table is denied by default until named grants/policies are reviewed.

`event_favorites`, `event_waitlist`, `event_feedback`, `announcements`, `event_results`, `result_categories`, `achievements`, `participant_achievements`, `support_tickets`, and `certificate_verification_logs` are **not selected for the first target migration set**. Their need is evaluated in the Master Plan; each requires explicit retention/access/abuse decisions and full table specification before inclusion. Reuse existing `winners` for current published results and existing `notifications` for in-app notices meanwhile.

## Storage design

| Bucket | Current/source state | Target access |
|---|---|---|
| `ultimate-event-payment-qr` | Defined public in receipt migration, 2 MiB images | Public only if QR is intended public; admin-only writes, content validation. |
| `ultimate-event-payment-receipts` | Defined private, 5 MiB images | Preserve. Participant can upload only own path through server service role; read via short-lived signed URL after ownership/admin authorization; immutable linkage to payment. |
| `competition-submissions` | Proposed, private | Owner can upload only before deadline through server route; authorized reviewer can download; random opaque object path, MIME/signature/size scan, no public listing. |
| `certificates` | Proposed, private | Owner/admin server-authorized signed download; immutable issued artifact and controlled revocation. |
| `event-assets` | Proposed only if needed | Public assets may use public bucket; sensitive resources remain private. Limit MIME/size and admin write. |

Storage policies and server routes must both enforce ownership. Never accept arbitrary object paths, bucket names, or signed URLs from the browser.

## Cross-cutting RLS and retention

- Enable RLS on every exposed application table. Revoke broad table/function rights and grant only intended operations.
- Participants select only their own registrations, payments (safe columns), submissions/files, certificates, notifications, preferences, and team membership.
- Public anonymous reads are limited to published event content, explicitly public results/achievements, and minimum certificate verification output.
- Admin authorization is permission-scoped and enforced in route and database/RPC; RLS is not replaced by UI navigation hiding.
- Service role is server-only and bypasses RLS; each service route must authenticate user, verify role/ownership, validate business state, and constrain object paths before calling it.
- Keep payment evidence and certificate/submission object files private. Define retention/deletion schedules and legal holds before production launch; preserve financial/audit records per applicable legal requirements.
- Use UTC timestamps; store an IANA timezone for event display and reminders. User timezone affects display, not deadline decisions.

## Explicitly not recommended now

Avoid separate `workshops` and `competitions` base tables duplicating `events`; use one-to-one subtype tables. Avoid a `user_sessions` table unless there is a concrete revocation/security need already unmet by Auth. Avoid DB-backed rate-limit tables unless an edge/server limiter cannot meet requirements. Avoid duplicate `payment_receipts` while `payments.receipt_path` is canonical. Avoid separate `email_retry_jobs` if the durable outbox already holds retry state. Avoid `role_permissions` JSON or per-admin booleans; use normalized membership and permission assignments only if the owner approves granular roles.
