-- Read-only verification after installing 20261010_product_pricing.sql.
SELECT 'table_column_exists' AS check_name, to_jsonb(EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='shipandbattle_products' AND column_name='shipandbattle_pricing_details'
)) AS result
UNION ALL SELECT 'public_view_column_exists', to_jsonb(EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='shipandbattle_public_products' AND column_name='shipandbattle_pricing_details'
))
UNION ALL SELECT 'pricing_constraint_exists', to_jsonb(EXISTS (
  SELECT 1 FROM pg_constraint WHERE conrelid='public.shipandbattle_products'::regclass
  AND conname='shipandbattle_product_pricing_valid' AND convalidated
))
UNION ALL SELECT 'updated_at_trigger_exists', to_jsonb(EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgrelid='public.shipandbattle_products'::regclass
  AND tgname='shipandbattle_product_pricing_updated_at' AND tgenabled='O'
))
UNION ALL SELECT 'public_read_access', to_jsonb(
  has_table_privilege('anon','public.shipandbattle_public_products','SELECT')
  AND has_table_privilege('authenticated','public.shipandbattle_public_products','SELECT')
)
UNION ALL SELECT 'private_owner_fields_hidden', to_jsonb(NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='shipandbattle_public_products'
  AND column_name IN ('shipandbattle_creator_uid','shipandbattle_creator_username')
))
UNION ALL SELECT 'product_count', to_jsonb(count(*)) FROM public.shipandbattle_products;
