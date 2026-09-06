-- INDIE CLASH: run in Supabase SQL Editor before choosing migrations.
-- Read-only inventory. Does not expose account data, tokens, or product content.
BEGIN TRANSACTION READ ONLY;

WITH required_tables(name) AS (
  VALUES ('shipandbattle_products'), ('shipandbattle_brackets'),
    ('shipandbattle_matches'), ('shipandbattle_votes'), ('shipandbattle_rate_limits')
), base_columns(table_name, column_name) AS (
  VALUES
    ('shipandbattle_products', 'shipandbattle_creator_uid'),
    ('shipandbattle_products', 'shipandbattle_arena_enqueued'),
    ('shipandbattle_brackets', 'shipandbattle_settlement_lock_until'),
    ('shipandbattle_brackets', 'shipandbattle_settlement_lock_token')
), new_columns(table_name, column_name) AS (
  VALUES
    ('shipandbattle_products', 'shipandbattle_description'),
    ('shipandbattle_products', 'shipandbattle_category'),
    ('shipandbattle_products', 'shipandbattle_pricing_model'),
    ('shipandbattle_products', 'shipandbattle_platforms'),
    ('shipandbattle_products', 'shipandbattle_target_audience'),
    ('shipandbattle_products', 'shipandbattle_maker_story'),
    ('shipandbattle_products', 'shipandbattle_feedback_request'),
    ('shipandbattle_products', 'shipandbattle_published_at'),
    ('shipandbattle_products', 'shipandbattle_updated_at'),
    ('shipandbattle_products', 'shipandbattle_qualified_impressions'),
    ('shipandbattle_products', 'shipandbattle_last_exposed_at'),
    ('shipandbattle_products', 'shipandbattle_exposure_status'),
    ('shipandbattle_products', 'shipandbattle_arena_enqueued_at'),
    ('shipandbattle_products', 'shipandbattle_discovery_boost_until'),
    ('shipandbattle_brackets', 'shipandbattle_bracket_size'),
    ('shipandbattle_brackets', 'shipandbattle_round_ends_at'),
    ('shipandbattle_brackets', 'shipandbattle_arena_scope'),
    ('shipandbattle_brackets', 'shipandbattle_category_slug')
), functions(signature) AS (
  VALUES
    ('public.shipandbattle_consume_rate_limit(text)'),
    ('public.shipandbattle_cast_vote(text,text,text,text)'),
    ('public.shipandbattle_save_bracket_state(jsonb,jsonb,text[],text,integer)'),
    ('public.shipandbattle_acquire_settlement_lock(text,timestamp with time zone,uuid)'),
    ('public.shipandbattle_record_product_exposures(text[],text)'),
    ('public.shipandbattle_touch_product_updated_at()')
)
SELECT 'missing_base_tables' AS check_name,
  COALESCE(jsonb_agg(name), '[]'::jsonb) AS result
FROM required_tables WHERE to_regclass('public.' || name) IS NULL
UNION ALL
SELECT 'missing_base_columns', COALESCE(jsonb_agg(b.table_name || '.' || b.column_name), '[]'::jsonb)
FROM base_columns b WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = b.table_name AND c.column_name = b.column_name
)
UNION ALL
SELECT 'missing_profile_columns', COALESCE(jsonb_agg(n.table_name || '.' || n.column_name), '[]'::jsonb)
FROM new_columns n WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = n.table_name AND c.column_name = n.column_name
)
UNION ALL
SELECT 'missing_public_view_columns', COALESCE(jsonb_agg(n.table_name || '.' || n.column_name), '[]'::jsonb)
FROM new_columns n WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = replace(n.table_name, 'shipandbattle_', 'shipandbattle_public_')
    AND c.column_name = n.column_name
)
UNION ALL
SELECT 'missing_functions', COALESCE(jsonb_agg(signature), '[]'::jsonb)
FROM functions WHERE to_regprocedure(signature) IS NULL
UNION ALL
SELECT 'legacy_single_product_indexes', COALESCE(jsonb_agg(indexname), '[]'::jsonb)
FROM pg_indexes WHERE schemaname = 'public'
  AND indexname IN ('shipandbattle_one_open_product_per_creator', 'shipandbattle_one_queued_product_per_creator')
UNION ALL
SELECT 'exposure_table_exists', to_jsonb(to_regclass('public.shipandbattle_product_exposures') IS NOT NULL)
UNION ALL
SELECT 'vote_function_has_deadline_and_boost', to_jsonb(EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'shipandbattle_cast_vote'
    AND p.prosrc LIKE '%shipandbattle_round_ends_at%'
    AND p.prosrc LIKE '%shipandbattle_discovery_boost_until%'
));

COMMIT;
