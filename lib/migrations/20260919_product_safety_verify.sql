-- Read-only verification after installing 20260919_product_safety.sql.
SELECT 'missing_columns' AS check_name, coalesce(jsonb_agg(name),'[]'::jsonb) AS result
FROM unnest(ARRAY['shipandbattle_screenshot','shipandbattle_moderation_status','shipandbattle_link_trust','shipandbattle_domain_key']) AS name
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='shipandbattle_products' AND c.column_name=name)
UNION ALL
SELECT 'missing_functions', coalesce(jsonb_agg(signature),'[]'::jsonb)
FROM unnest(ARRAY['public.shipandbattle_product_domain_key(text)','public.shipandbattle_report_product(text,uuid,text,text)','public.shipandbattle_moderate_product(text,uuid,text,text)']) AS signature
WHERE to_regprocedure(signature) IS NULL
UNION ALL
SELECT 'domain_index_exists', to_jsonb(EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='shipandbattle_unique_product_domain'))
UNION ALL
SELECT 'safety_trigger_exists', to_jsonb(EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='shipandbattle_product_safety_guard' AND NOT tgisinternal AND tgenabled='O'))
UNION ALL
SELECT 'reports_are_private', to_jsonb(
  NOT has_table_privilege('anon','public.shipandbattle_product_reports','SELECT')
  AND NOT has_table_privilege('authenticated','public.shipandbattle_product_reports','SELECT')
  AND NOT has_function_privilege('authenticated','public.shipandbattle_moderate_product(text,uuid,text,text)','EXECUTE'))
UNION ALL
SELECT 'product_status_counts', coalesce((SELECT jsonb_object_agg(status,n) FROM (
  SELECT shipandbattle_moderation_status AS status,count(*) AS n FROM public.shipandbattle_products GROUP BY shipandbattle_moderation_status
) counts),'{}'::jsonb);
