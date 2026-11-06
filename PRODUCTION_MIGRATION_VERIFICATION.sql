-- Read-only production verification script.
-- Do not run migration SQL, db push, migration repair, or database writes here.

-- 1) Foundation and workflow table inventory
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'events', 'registrations', 'payments', 'notifications',
    'platform_settings', 'submissions', 'winners', 'certificates'
  )
order by table_name;

-- 2) Application-required columns and types
select table_schema, table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'events' and column_name in (
      'submission_opens_at', 'submission_deadline',
      'allow_late_submissions', 'late_submission_deadline'
    ))
    or (table_name = 'payments' and column_name in (
      'registration_id', 'event_id', 'user_id', 'receipt_path', 'rejection_reason'
    ))
    or (table_name = 'platform_settings' and column_name in (
      'id', 'upi_id', 'account_holder_name', 'qr_image_path',
      'payment_instructions', 'updated_at', 'updated_by'
    ))
  )
order by table_name, column_name;

-- 3) RPC signatures, result types, SECURITY DEFINER and fixed search_path
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as signature,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin', 'register_for_event', 'submit_upi_payment_for_user',
    'review_upi_payment', 'review_upi_payments', 'update_payment_settings',
    'admin_search_participants', 'manage_participant',
    'review_competition_submission', 'manage_event_winner',
    'issue_event_certificates', 'revoke_certificate', 'verify_certificate',
    'get_published_winners', 'set_notification_read'
  )
order by p.proname;

-- 4) Required registration uniqueness. Either index column order is valid.
select i.indexrelid::regclass as index_name, i.indisvalid, i.indisunique,
       pg_get_indexdef(i.indexrelid) as index_definition
from pg_catalog.pg_index i
where i.indrelid = 'public.registrations'::regclass
  and i.indisunique
  and i.indisvalid
  and i.indpred is null
  and i.indnkeyatts = 2
  and (
    (i.indkey[0] = (
      select attnum from pg_catalog.pg_attribute
      where attrelid = 'public.registrations'::regclass and attname = 'event_id'
    ) and i.indkey[1] = (
      select attnum from pg_catalog.pg_attribute
      where attrelid = 'public.registrations'::regclass and attname = 'user_id'
    ))
    or
    (i.indkey[0] = (
      select attnum from pg_catalog.pg_attribute
      where attrelid = 'public.registrations'::regclass and attname = 'user_id'
    ) and i.indkey[1] = (
      select attnum from pg_catalog.pg_attribute
      where attrelid = 'public.registrations'::regclass and attname = 'event_id'
    ))
  );

-- 5) Workflow foreign keys and validation state
select
  c.conrelid::regclass as table_name,
  c.conname as constraint_name,
  c.confrelid::regclass as referenced_table,
  c.convalidated as existing_rows_validated,
  pg_get_constraintdef(c.oid) as definition
from pg_catalog.pg_constraint c
where c.contype = 'f'
  and c.conrelid in (
    'public.platform_settings'::regclass,
    'public.submissions'::regclass,
    'public.winners'::regclass,
    'public.certificates'::regclass
  )
order by table_name, constraint_name;

-- 6) Required workflow uniqueness and supporting indexes
select i.indrelid::regclass as table_name,
       i.indexrelid::regclass as index_name,
       i.indisunique,
       i.indisvalid,
       pg_get_indexdef(i.indexrelid) as index_definition
from pg_catalog.pg_index i
where i.indrelid in (
  'public.submissions'::regclass,
  'public.winners'::regclass,
  'public.certificates'::regclass
)
order by table_name, index_name;

-- 7) Certificate sequence access
select schemaname, sequencename,
       has_sequence_privilege('anon', format('%I.%I', schemaname, sequencename), 'USAGE') as anon_can_use,
       has_sequence_privilege('authenticated', format('%I.%I', schemaname, sequencename), 'USAGE') as authenticated_can_use
from pg_catalog.pg_sequences
where schemaname = 'public'
  and sequencename = 'certificate_number_sequence';

-- 8) Payment bucket settings (no object names or secrets)
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('ultimate-event-payment-receipts', 'ultimate-event-payment-qr')
order by id;

-- 9) Table policy inventory including policy mode and expressions
select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('payments', 'submissions', 'winners', 'certificates', 'platform_settings')
order by tablename, policyname;

-- 10) Storage policy inventory for the payment buckets
select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    policyname like 'payment\_%' escape '\'
    or policyname like 'ue\_202611060001\_%' escape '\'
  )
order by policyname;

-- 11) RLS status
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in ('platform_settings', 'payments', 'submissions', 'winners', 'certificates')
order by tablename;

-- 12) Confirm platform_settings exposes only payment information needed by participants.
select
  column_name,
  has_column_privilege('anon', 'public.platform_settings', column_name, 'SELECT') as anon_can_read,
  has_column_privilege('authenticated', 'public.platform_settings', column_name, 'SELECT') as authenticated_can_read
from information_schema.columns
where table_schema = 'public'
  and table_name = 'platform_settings'
order by ordinal_position;

-- 13) Non-sensitive row counts for post-apply checks
select 'platform_settings' as table_name, count(*) as row_count from public.platform_settings
union all
select 'submissions', count(*) from public.submissions
union all
select 'winners', count(*) from public.winners
union all
select 'certificates', count(*) from public.certificates;
