-- Read-only checks after installing the gallery migration.
SELECT 'gallery_column_exists' AS check_name, to_jsonb(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_products' AND column_name='shipandbattle_screenshots')) AS result
UNION ALL
SELECT 'public_gallery_exists',to_jsonb(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_public_products' AND column_name='shipandbattle_screenshots'))
UNION ALL
SELECT 'gallery_trigger_enabled',to_jsonb(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.shipandbattle_products'::regclass AND tgname='shipandbattle_product_gallery_guard' AND tgenabled='O'))
UNION ALL
SELECT 'gallery_limit_exists',to_jsonb(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.shipandbattle_products'::regclass AND conname='shipandbattle_gallery_limit'));
