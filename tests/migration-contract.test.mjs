import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrations = new URL('../supabase/migrations/', import.meta.url)
const readMigration = (filename) => readFileSync(new URL(filename, migrations), 'utf8')
const profileSchema = readMigration('202610110001_profiles.sql')
const eventSchema = readMigration('202610110002_events.sql')
const reconciliation = readMigration('202610180001_reconcile_legacy_event_schema.sql')
const workflows = readMigration('202610200001_participant_workflows.sql')
const paymentReview = readMigration('202610200002_event_registration_and_payment_review.sql')

function functionBody(sql, name) {
  const declaration = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    'i',
  ).exec(sql)
  assert.ok(declaration, `Expected public.${name} to be defined`)
  const bodyStart = sql.indexOf('as $$', declaration.index)
  assert.notEqual(bodyStart, -1, `Expected public.${name} to have a dollar-quoted body`)
  const bodyEnd = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyEnd, -1, `Expected public.${name} body to close`)
  return sql.slice(bodyStart, bodyEnd)
}

test('migration files exist in dependency order and retain the profile/event foundation', () => {
  assert.match(profileSchema, /create table if not exists public\.profiles/i)
  assert.match(eventSchema, /create table if not exists public\.events/i)
  assert.match(reconciliation, /public\.events/i)
  assert.match(workflows, /create table if not exists public\.platform_settings/i)
  assert.match(paymentReview, /registration_opens_at/i)
})

test('reconciliation enforces one registration per user and event', () => {
  assert.match(reconciliation, /registrations_event_user_key unique\s*\(event_id,\s*user_id\)/i)
})

test('registration RPC enforces active account, publication, schedule, capacity, and duplicate checks', () => {
  const body = functionBody(paymentReview, 'register_for_event')
  assert.match(body, /account_status\s*=\s*'active'/i)
  assert.match(body, /v_event\.status\s*<>\s*'published'/i)
  assert.match(body, /registration_opens_at\s*>\s*now\(\)/i)
  assert.match(body, /registration_deadline\s*<=\s*now\(\)/i)
  assert.match(body, /for update/i)
  assert.match(body, /where event_id\s*=\s*p_event_id and user_id\s*=\s*v_user_id/i)
  assert.match(body, /v_count\s*>=\s*v_event\.capacity/i)
})

test('payment submission checks ownership and leaves payment approval server-side', () => {
  const body = functionBody(workflows, 'submit_upi_payment')
  assert.match(body, /account_status\s*=\s*'active'/i)
  assert.match(body, /where id\s*=\s*p_registration_id and user_id\s*=\s*v_user_id/i)
  assert.match(body, /lower\(v_payment\.utr\)\s*=\s*lower\(v_utr\)/i)
  assert.match(body, /already awaiting review/i)
  assert.match(reconciliation, /create unique index if not exists payments_utr_unique_idx/i)
})

test('payment review requires an admin, a rejection reason, and linked-record consistency', () => {
  const single = functionBody(paymentReview, 'review_upi_payment')
  const bulk = functionBody(paymentReview, 'review_upi_payments')
  assert.match(single, /public\.is_admin\(\)/i)
  assert.match(single, /length\(v_reason\) not between 3 and 500/i)
  assert.match(single, /v_registration\.user_id\s*<>\s*v_payment\.user_id/i)
  assert.match(single, /v_registration\.event_id\s*<>\s*v_payment\.event_id/i)
  assert.match(single, /v_registration\.amount\s*<>\s*v_payment\.amount/i)
  assert.match(bulk, /cardinality\(p_payment_ids\) < 1 or cardinality\(p_payment_ids\) > 100/i)
  assert.match(bulk, /perform public\.review_upi_payment\(v_payment_id,\s*p_approve,\s*p_rejection_reason\)/i)
  assert.match(paymentReview, /grant execute on function public\.review_upi_payment\(uuid, boolean, text\) to authenticated/i)
  assert.match(paymentReview, /grant execute on function public\.review_upi_payments\(uuid\[\], boolean, text\) to authenticated/i)
})

test('payment review migration can be safely re-run without dropping dependent functions', () => {
  assert.match(paymentReview, /drop function if exists public\.review_upi_payment\(uuid, boolean\)/i)
  assert.match(paymentReview, /drop function if exists public\.review_upi_payments\(uuid\[\], boolean\)/i)
  assert.match(paymentReview, /create or replace function public\.review_upi_payment\(/i)
  assert.match(paymentReview, /create or replace function public\.review_upi_payments\(/i)
  assert.doesNotMatch(paymentReview, /drop function public\.review_upi_payment/i)
  assert.doesNotMatch(paymentReview, /drop function public\.review_upi_payments/i)
})

test('workflow tables keep RLS enabled and migrations do not disable it', () => {
  for (const table of ['profiles', 'events', 'registrations', 'payments']) {
    assert.match(reconciliation, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  for (const table of ['platform_settings', 'submissions', 'winners', 'certificates', 'notifications']) {
    assert.match(workflows, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  assert.doesNotMatch(`${reconciliation}\n${workflows}\n${paymentReview}`, /disable row level security/i)
})
