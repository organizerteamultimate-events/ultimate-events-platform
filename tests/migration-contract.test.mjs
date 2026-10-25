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
const authProfileRepair = readMigration('202610220001_auth_profile_status_repair.sql')
const eventPaymentReceipts = readMigration('202610220002_event_payment_receipts.sql')

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
  assert.match(eventSchema, /event_id uuid references public\.events \(id\)/i)
  assert.match(eventSchema, /add column if not exists event_id uuid references public\.events \(id\)/i)
  assert.match(reconciliation, /\('payments', 'event_id'\)/i)
  assert.match(reconciliation, /public\.events/i)
  assert.match(workflows, /create table if not exists public\.platform_settings/i)
  assert.match(paymentReview, /registration_opens_at/i)
  assert.match(authProfileRepair, /add column if not exists account_status text not null default 'active'/i)
  assert.match(authProfileRepair, /alter column role set default 'user'/i)
  assert.match(authProfileRepair, /max_participant_number[\s\S]*setval\(\s*'public\.participant_id_sequence'/i)
  assert.match(authProfileRepair, /profiles_account_status_check', 'profiles_account_status_allowed_check/i)
  assert.match(eventPaymentReceipts, /create table|create or replace function public\.submit_upi_payment/i)
})

test('auth profile repair preserves existing roles and safely provisions missing profiles', () => {
  assert.match(authProfileRepair, /check\s*\(account_status in \('active', 'suspended', 'deleted'\)\)/i)
  assert.match(authProfileRepair, /security definer/i)
  assert.match(authProfileRepair, /set search_path = ''/i)
  assert.match(authProfileRepair, /after insert or update of email on auth\.users/i)
  assert.match(authProfileRepair, /on conflict \(id\) do update\s+set email = excluded\.email/i)
  assert.match(authProfileRepair, /from auth\.users as users[\s\S]*on conflict \(id\) do nothing/i)
  assert.match(authProfileRepair, /alter table public\.profiles enable row level security/i)
  assert.match(functionBody(authProfileRepair, 'is_admin'), /account_status\s*=\s*'active'/i)
  assert.match(authProfileRepair, /grant execute on function public\.is_admin\(\) to anon, authenticated/i)
  assert.doesNotMatch(authProfileRepair, /disable row level security/i)
  assert.doesNotMatch(authProfileRepair, /set role\s*=\s*'admin'/i)
  assert.match(authProfileRepair, /notify pgrst, 'reload schema'/i)
})

test('event payment migration protects private receipts and admin review RPCs', () => {
  assert.match(eventPaymentReceipts, /Application schema has incompatible column types/i)
  assert.match(eventPaymentReceipts, /\('events', 'price', 'numeric'\)/i)
  assert.match(eventPaymentReceipts, /\('payments', 'registration_id', 'uuid'\)/i)
  assert.match(eventPaymentReceipts, /ultimate-event-payment-receipts', 'ultimate-event-payment-receipts', false/i)
  assert.match(eventPaymentReceipts, /ultimate-event-payment-qr', 'ultimate-event-payment-qr', true/i)
  assert.match(eventPaymentReceipts, /Participants and admins can read permitted payment receipts[\s\S]*public\.is_admin\(\)/i)
  assert.match(eventPaymentReceipts, /Receipt object read boundary[\s\S]*as restrictive for select to public/i)
  assert.match(eventPaymentReceipts, /Receipt uploads require server service role[\s\S]*as restrictive for insert to public[\s\S]*auth\.role\(\).*service_role/i)
  assert.doesNotMatch(eventPaymentReceipts, /Receipt object insert boundary/i)
  assert.doesNotMatch(eventPaymentReceipts, /Receipt object insert boundary/i)
  assert.match(eventPaymentReceipts, /Receipt object delete boundary[\s\S]*not exists\s*\(\s*select 1 from public\.payments p where p\.receipt_path = name/i)
  assert.match(eventPaymentReceipts, /Payment QR insert boundary[\s\S]*as restrictive for insert to public/i)
  assert.match(eventPaymentReceipts, /Payment read authorization boundary[\s\S]*as restrictive for select to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/i)
  assert.doesNotMatch(eventPaymentReceipts, /create policy "Participants can upload their payment receipts"/i)
  assert.match(eventPaymentReceipts, /Admins can upload payment QR images[\s\S]*public\.is_admin\(\)/i)
  assert.match(eventPaymentReceipts, /create or replace function public\.submit_upi_payment\(\s*p_registration_id uuid,\s*p_utr text,\s*p_receipt_path text/i)
  assert.match(functionBody(eventPaymentReceipts, 'submit_upi_payment'), /lower\(utr\) = lower\(v_utr\)/i)
  assert.match(eventPaymentReceipts, /case-insensitive unique index on payment UTR/i)
  assert.match(eventPaymentReceipts, /pg_get_indexdef\(i\.indexrelid\) ilike '%lower\(utr\)%'/i)
  assert.match(functionBody(eventPaymentReceipts, 'submit_upi_payment'), /already awaiting review/i)
  assert.match(functionBody(eventPaymentReceipts, 'submit_upi_payment'), /v_registration\.amount/)
  assert.match(eventPaymentReceipts, /revoke all on function public\.submit_upi_payment\(uuid, text\) from public, anon, authenticated/i)
  assert.match(eventPaymentReceipts, /revoke all on function public\.submit_upi_payment\(uuid, text, text\) from public, anon, authenticated/i)
  assert.match(functionBody(eventPaymentReceipts, 'submit_upi_payment_for_user'), /auth\.role\(\).*service_role/i)
  assert.match(eventPaymentReceipts, /grant execute on function public\.submit_upi_payment_for_user\(uuid, uuid, text, text\) to service_role/i)
  assert.match(eventPaymentReceipts, /revoke all on function public\.submit_upi_payment_for_user\(uuid, uuid, text, text\) from public, anon, authenticated/i)
  assert.match(functionBody(eventPaymentReceipts, 'review_upi_payment'), /public\.is_admin\(\)/i)
  assert.match(functionBody(eventPaymentReceipts, 'review_upi_payment'), /set payment_status = case when p_approve then 'verified' else 'rejected' end/i)
  assert.match(functionBody(eventPaymentReceipts, 'review_upi_payment'), /Administrators cannot review their own payments/i)
  assert.match(eventPaymentReceipts, /using \(status = 'published' or \(select public\.is_admin\(\)\)\)/i)
  assert.match(functionBody(eventPaymentReceipts, 'register_for_event'), /v_event\.status <> 'published'/i)
  assert.match(functionBody(eventPaymentReceipts, 'register_for_event'), /v_event\.registration_deadline <= now\(\)/i)
  assert.match(functionBody(eventPaymentReceipts, 'register_for_event'), /v_count >= v_event\.capacity/i)
  assert.match(functionBody(eventPaymentReceipts, 'register_for_event'), /case when v_event\.price = 0 then 'confirmed'/i)
  assert.doesNotMatch(eventPaymentReceipts, /disable row level security/i)
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
