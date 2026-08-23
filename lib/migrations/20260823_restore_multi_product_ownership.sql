-- INDIE CLASH / restore multi-product ownership
-- Run after 20260822_production_ready.sql if that migration was executed before
-- multi-product ownership was supported. Safe to run more than once.

BEGIN;

-- The previous rule allowed only one waiting/active row to retain creator_uid.
-- Remove it before restoring the exact ownership evidence kept in legacy rows.
DROP INDEX IF EXISTS public.shipandbattle_one_open_product_per_creator;
DROP INDEX IF EXISTS public.shipandbattle_one_queued_product_per_creator;

-- Strongest recovery signal: the pre-migration application embedded auth.uid()
-- in the avatar URL. The production migration did not erase that marker.
UPDATE public.shipandbattle_products AS product
SET shipandbattle_creator_uid = account.id
FROM auth.users AS account
WHERE product.shipandbattle_creator_uid IS NULL
  AND product.shipandbattle_maker_avatar ~ 'uid=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  AND account.id = substring(
    product.shipandbattle_maker_avatar
    FROM 'uid=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
  )::UUID;

-- Restore legacy queue choices that the previous single-product normalization
-- changed. The uid marker limits this to pre-migration rows; new showcase-only
-- submissions are not automatically pushed into the Arena.
UPDATE public.shipandbattle_products
SET shipandbattle_arena_enqueued = TRUE
WHERE shipandbattle_queue_status = 'waiting'
  AND shipandbattle_arena_enqueued = FALSE
  AND shipandbattle_maker_avatar ~ 'uid=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  AND shipandbattle_maker_avatar NOT LIKE '%pushed=false%';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification result returned by the SQL editor.
SELECT
  count(*) AS total_products,
  count(*) FILTER (WHERE shipandbattle_creator_uid IS NOT NULL) AS owned_products,
  count(*) FILTER (WHERE shipandbattle_creator_uid IS NULL) AS unassigned_products,
  count(*) FILTER (
    WHERE shipandbattle_queue_status = 'waiting'
      AND shipandbattle_arena_enqueued = TRUE
  ) AS queued_waiting_products
FROM public.shipandbattle_products;
