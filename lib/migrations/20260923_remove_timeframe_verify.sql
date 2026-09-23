-- Read-only checks. First three results should be true; last is the product count.
SELECT 'timeframe_removed' AS check_name, to_jsonb(NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('shipandbattle_products','shipandbattle_public_products')
    AND column_name='shipandbattle_ship_timeframe')) AS result
UNION ALL
SELECT 'public_read_access', to_jsonb(has_table_privilege('anon','public.shipandbattle_public_products','SELECT')
  AND has_table_privilege('authenticated','public.shipandbattle_public_products','SELECT'))
UNION ALL
SELECT 'category_preserved', to_jsonb(EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='shipandbattle_products' AND column_name='shipandbattle_category'))
UNION ALL
SELECT 'product_count', to_jsonb(count(*)) FROM public.shipandbattle_products;
