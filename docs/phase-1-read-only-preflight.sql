-- Ultimate Events Phase 1 preflight
-- READ-ONLY: every executable statement in this file is a SELECT.
-- Run statements individually in order. Skip the explicitly gated queries
-- unless the preceding availability query confirms that object exists and
-- its required columns are present. Do not add credentials or query row data.
-- REMOTE NOT VERIFIED: this script has not been run against any Supabase project.

-- 1. Optional schemas and migration-ledger availability. This reads catalogs
-- only; it does not read migration contents or database records.
SELECT
  'REMOTE NOT VERIFIED until the project owner runs this query' AS audit_status,
  to_regnamespace('public') IS NOT NULL AS public_schema_available,
  to_regnamespace('supabase_migrations') IS NOT NULL AS migration_schema_available,
  to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS migration_ledger_available,
  to_regnamespace('storage') IS NOT NULL AS storage_schema_available,
  to_regclass('storage.buckets') IS NOT NULL AS storage_buckets_available,
  to_regclass('storage.objects') IS NOT NULL AS storage_objects_available,
  ARRAY(
    SELECT c.column_name
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'supabase_migrations'
      AND c.table_name = 'schema_migrations'
    ORDER BY c.ordinal_position
  ) AS migration_ledger_columns;

-- 2. CONDITIONAL: run only if query 1 says the ledger is available and lists
-- a "version" column. This reports migration versions only, never statements.
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 3. Public table/view definitions and column types. Defaults are reported
-- only as present/not present; default expressions are not exposed.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  cls.relkind AS relation_kind,
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
  NOT a.attnotnull AS is_nullable,
  a.attidentity AS identity_kind,
  a.attgenerated AS generated_kind,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) IS NOT NULL AS has_default_expression
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = cls.oid
LEFT JOIN pg_catalog.pg_attrdef AS ad
  ON ad.adrelid = cls.oid
 AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, cls.relname, a.attnum;

-- 4. Constraints on public relations: primary, foreign, unique, check,
-- exclusion and not-null constraints, including validation/deferral state.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  con.conname AS constraint_name,
  con.contype AS constraint_kind,
  con.convalidated AS is_validated,
  con.condeferrable AS is_deferrable,
  con.condeferred AS initially_deferred,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.pg_get_constraintdef(con.oid, true),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS cls ON cls.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
ORDER BY n.nspname, cls.relname, con.conname;

-- 5. Index definitions and readiness/validity on public relations.
SELECT
  n.nspname AS schema_name,
  tbl.relname AS relation_name,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  i.indisready AS is_ready,
  i.indislive AS is_live,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.pg_get_indexdef(i.indexrelid),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_index_definition,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(i.indpred, i.indrelid), ''),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_partial_predicate
FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_class AS tbl ON tbl.oid = i.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = tbl.relnamespace
JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
WHERE n.nspname = 'public'
ORDER BY n.nspname, tbl.relname, idx.relname;

-- 6. User-defined triggers on public relations and Storage objects when
-- present. Trigger definitions contain metadata, not function source or rows.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  trg.tgname AS trigger_name,
  trg.tgenabled AS enabled_state,
  trg.tgisinternal AS is_internal,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.pg_get_triggerdef(trg.oid, true),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_trigger_definition
FROM pg_catalog.pg_trigger AS trg
JOIN pg_catalog.pg_class AS cls ON cls.oid = trg.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
WHERE (n.nspname = 'public' AND cls.relkind IN ('r', 'p'))
   OR (n.nspname = 'storage' AND cls.relname = 'objects')
ORDER BY n.nspname, cls.relname, trg.tgname;

-- 7. Function/procedure signatures, security-definer state, configured
-- search_path and EXECUTE ACLs. Function bodies/source are never selected.
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  p.prokind AS routine_kind,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  COALESCE(
    (
      SELECT string_agg(cfg.setting, ', ' ORDER BY cfg.setting)
      FROM unnest(p.proconfig) AS cfg(setting)
      WHERE lower(cfg.setting) LIKE 'search_path=%'
    ),
    '[not explicitly configured]'
  ) AS configured_search_path,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee.rolname, '[role no longer exists]')
  END AS execute_grantee,
  acl.is_grantable AS execute_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
WHERE n.nspname IN ('public', 'auth', 'storage')
  AND acl.privilege_type = 'EXECUTE'
ORDER BY n.nspname, p.proname, identity_arguments, execute_grantee;

-- 8. Relation-level table/view grants. These are explicit/default ACL entries;
-- role membership and owner/superuser bypass behavior are not expanded here.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  cls.relkind AS relation_kind,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee.rolname, '[role no longer exists]')
  END AS privilege_grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = cls.relowner
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(cls.relacl, pg_catalog.acldefault('r', cls.relowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
WHERE n.nspname IN ('public', 'storage')
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, cls.relname, privilege_grantee, acl.privilege_type;

-- 9. Column-level ACLs (only explicit ACL entries; relation-level grants are
-- reported by query 8). No column values are read.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  a.attname AS column_name,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee.rolname, '[role no longer exists]')
  END AS privilege_grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS cls ON cls.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
WHERE n.nspname IN ('public', 'storage')
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, cls.relname, a.attnum, privilege_grantee, acl.privilege_type;

-- 10. RLS enabled/forced state for public relations and Storage objects.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  cls.relkind AS relation_kind,
  cls.relrowsecurity AS row_level_security_enabled,
  cls.relforcerowsecurity AS row_level_security_forced
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
   OR (n.nspname = 'storage' AND cls.relname = 'objects')
ORDER BY n.nspname, cls.relname;

-- 11. RLS policy metadata and sanitized predicates. Quoted literals (which
-- could contain emails or object paths) and UUIDs are redacted before output.
SELECT
  n.nspname AS schema_name,
  cls.relname AS relation_name,
  pol.polname AS policy_name,
  pol.polcmd AS command_code,
  pol.polpermissive AS is_permissive,
  ARRAY(
    SELECT CASE
      WHEN role_oid = 0 THEN 'PUBLIC'
      ELSE COALESCE(role_info.rolname, '[role no longer exists]')
    END
    FROM unnest(pol.polroles) AS policy_role(role_oid)
    LEFT JOIN pg_catalog.pg_roles AS role_info ON role_info.oid = role_oid
    ORDER BY 1
  ) AS policy_roles,
  pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) IS NOT NULL AS has_using_expression,
  pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) IS NOT NULL AS has_check_expression,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), ''),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_using_expression,
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      $$'([^']|'')*'$$,
      '''[REDACTED_LITERAL]''',
      'g'
    ),
    '[[:xdigit:]]{8}-([[:xdigit:]]{4}-){3}[[:xdigit:]]{12}',
    '[REDACTED_UUID]',
    'gi'
  ) AS sanitized_check_expression
FROM pg_catalog.pg_policy AS pol
JOIN pg_catalog.pg_class AS cls ON cls.oid = pol.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public'
   OR (n.nspname = 'storage' AND cls.relname = 'objects')
ORDER BY n.nspname, cls.relname, pol.polname;

-- 12. CONDITIONAL: run only if query 1 confirms storage.buckets is available.
-- Reports bucket configuration only; never reads storage.objects or file paths.
SELECT
  id AS bucket_id,
  name AS bucket_name,
  public AS is_public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 13. View/materialized-view dependencies on public, auth, or storage
-- relations. Definitions and underlying row data are not selected.
SELECT
  view_ns.nspname AS view_schema,
  view_rel.relname AS view_name,
  view_rel.relkind AS view_kind,
  ref_ns.nspname AS referenced_schema,
  ref_rel.relname AS referenced_relation,
  CASE
    WHEN dep.refobjsubid > 0 THEN ref_att.attname
    ELSE NULL
  END AS referenced_column,
  dep.deptype AS dependency_kind
FROM pg_catalog.pg_rewrite AS rw
JOIN pg_catalog.pg_class AS view_rel ON view_rel.oid = rw.ev_class
JOIN pg_catalog.pg_namespace AS view_ns ON view_ns.oid = view_rel.relnamespace
JOIN pg_catalog.pg_depend AS dep
  ON dep.classid = 'pg_catalog.pg_rewrite'::regclass
 AND dep.objid = rw.oid
 AND dep.refclassid = 'pg_catalog.pg_class'::regclass
JOIN pg_catalog.pg_class AS ref_rel ON ref_rel.oid = dep.refobjid
JOIN pg_catalog.pg_namespace AS ref_ns ON ref_ns.oid = ref_rel.relnamespace
LEFT JOIN pg_catalog.pg_attribute AS ref_att
  ON ref_att.attrelid = ref_rel.oid
 AND ref_att.attnum = dep.refobjsubid
WHERE view_ns.nspname = 'public'
  AND view_rel.relkind IN ('v', 'm')
  AND ref_rel.oid <> view_rel.oid
  AND ref_ns.nspname IN ('public', 'auth', 'storage')
ORDER BY view_ns.nspname, view_rel.relname, ref_ns.nspname, ref_rel.relname, referenced_column;

-- 14. CONDITIONAL: run only if query 3 lists public.profiles and the SQL
-- Editor role is permitted to read it. Returns aggregate counts only; no
-- profile IDs, names, email addresses, or participant IDs are selected.
SELECT
  CASE
    WHEN role IN ('user', 'admin') THEN role
    WHEN role IS NULL THEN '[null]'
    ELSE '[other]'
  END AS role_bucket,
  CASE
    WHEN account_status IN ('active', 'suspended', 'deleted') THEN account_status
    WHEN account_status IS NULL THEN '[null]'
    ELSE '[other]'
  END AS account_status_bucket,
  count(*)::bigint AS profile_count
FROM public.profiles
GROUP BY role_bucket, account_status_bucket
ORDER BY role_bucket, account_status_bucket;
