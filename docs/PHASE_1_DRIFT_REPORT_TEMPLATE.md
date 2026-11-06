# Phase 1 Database Drift Report

**Status: REMOTE NOT VERIFIED**  
Do not mark any remote observation as confirmed until results from the intended Supabase project's SQL Editor have been reviewed.

**Project environment:** `[production / staging / development / unknown]`  
**Project ref (keep private if desired):** `[not recorded here]`  
**Preflight run date:** `[not run]`  
**Reviewer:** `[not assigned]`  
**Evidence location:** `[private local location; do not commit raw exports]`

| object | repository expectation | remote observation | difference | risk | recommended action | approval required |
|---|---|---|---|---|---|---|
| Migration ledger availability | `supabase_migrations.schema_migrations` availability and columns reported by query 1; version list from query 2 if present | NOT RUN | Unknown | Cannot establish which migrations have run; replay/skip decisions are unsafe | Run the gated read-only ledger query in the verified project; do not infer from Git | No for read-only inspection; yes before any migration action |
| Migration versions | Nine numbered repository migrations are listed in `PHASE_1_PREFLIGHT_INSTRUCTIONS.md`; latest filenames are `202611050001` and `202611050002` | NOT RUN | Unknown | Wrong assumptions about prerequisite or pending versions can break schema or access | Compare remote version set to repository sequence and investigate missing/out-of-order versions | Yes before applying, repairing, or reconciling |
| `public.profiles` columns/types | See `202610110001`, `202610180001`, `202610200001`, `202610220001` source; includes profile identity, participant ID, role, account status | NOT RUN | Unknown | Login/profile provisioning or existing admin access may fail | Compare columns/types and defaults; preserve all rows and roles | Yes before any schema/data change |
| Profile role/status counts | Aggregate role/account-status counts only; no identities selected | NOT RUN | Unknown | Could reveal unprovisioned, suspended, deleted, or admin accounts | Compare aggregates privately to expected operational totals; do not share identity data | Yes before role/status changes |
| `public.events` columns/types | Event, registration, and submission schedule fields from the ordered migrations | NOT RUN | Unknown | Event pages, registration, payment, or deadline enforcement may be incompatible | Compare types/nullability/default presence without selecting event records | Yes before schema change |
| `public.registrations` constraints | PK/FKs and unique `(event_id,user_id)`; status/payment invariants in source | NOT RUN | Unknown | Duplicate/lost registration or payment linkage risk | Compare constraint definitions and validation state; preserve rows | Yes before constraint/data action |
| `public.payments` columns/constraints | Legacy-compatible payment fields; unique UTR and one-pending-payment guard; receipt/rejection fields in later source | NOT RUN | Unknown | Duplicate payment or incorrect verification risk | Compare exact UTR/pending indexes, links, checks, and types | Yes before payment-related changes |
| `public.submissions` and deadline fields | URL submission table, review fields; submission-window event fields in the newer migration | NOT RUN | Unknown | Unauthorized, late, or blocked submissions | Compare table columns/checks and all policies, not just expected policy names | Yes before policy/schema change |
| `public.certificates` | Unique certificate number/verification code; one active certificate per registration; revoke metadata | NOT RUN | Unknown | Existing certificate downloads or verification may break | Compare constraints/indexes and function dependencies before considering function replacement | Yes before function/schema change |
| Functions and execute grants | Migration-defined signatures; fixed `search_path` in reviewed security-definer source; least-privilege ACLs | NOT RUN | Unknown | Unauthorized RPC execution or broken application flows | Compare signatures, definer flag, search path, and execute ACLs; do not export source | Yes before function/grant changes |
| Triggers | Profile provisioning/update and event/registration update triggers in source | NOT RUN | Unknown | New/changed records may not be provisioned or timestamps may stop updating | Compare trigger definitions/enabled states and backing function signatures | Yes before trigger changes |
| Table/column grants | Restricted grants defined by migration history; platform settings use column grants; participant/admin access relies on RLS | NOT RUN | Unknown | Data exposure or broken access | Compare relation and column ACLs with policies and application roles | Yes before permission changes |
| RLS and policies | RLS enabled for protected application tables; user ownership/admin checks; storage restrictions | NOT RUN | Unknown | Unauthorized access or denial of participant/admin operations | Compare RLS enabled/forced state, every policy, command, role, and sanitized expression | Yes before policy changes |
| Storage buckets | Source defines public QR bucket and private receipt bucket with size/MIME limits | NOT RUN | Unknown | Receipt exposure, failed upload, or public/private mismatch | Compare bucket metadata and storage policies; never inspect object names/paths in this preflight | Yes before bucket/policy change |
| Views and dependencies | No assumed view shape; query 13 reports view/materialized-view dependencies | NOT RUN | Unknown | Function replacement or migration may be blocked or alter dependent behavior | Review dependency list before modifying referenced objects | Yes before dependent object changes |

## Findings

1. `[Finding, evidence query number, and source migration]`
2. `[Finding, evidence query number, and source migration]`

## Decision log

- Read-only inspection reviewed by: `[name/date]`
- Required follow-up evidence: `[list]`
- Proposed corrective action (if any): `[describe; do not include unapproved SQL here]`
- Explicit owner approval for a later change: `[not requested / pending / approved with scope and date]`
- Database changes applied: **None as part of this read-only preflight package.**
