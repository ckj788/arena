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

-- Keep every ownership link, but normalize season participation. An active
-- entry wins; otherwise the earliest queued waiting entry stays queued. Extra
-- waiting products remain owned and visible in My Console, but are unqueued.
WITH ranked_season_entries AS (
  SELECT
    shipandbattle_id,
    shipandbattle_queue_status,
    row_number() OVER (
      PARTITION BY shipandbattle_creator_uid
      ORDER BY
        CASE WHEN shipandbattle_queue_status = 'active' THEN 0 ELSE 1 END,
        shipandbattle_submitted_at ASC NULLS LAST,
        shipandbattle_id
    ) AS season_rank
  FROM public.shipandbattle_products
  WHERE shipandbattle_creator_uid IS NOT NULL
    AND (
      shipandbattle_queue_status = 'active'
      OR (
        shipandbattle_queue_status = 'waiting'
        AND shipandbattle_arena_enqueued = TRUE
      )
    )
)
UPDATE public.shipandbattle_products AS product
SET shipandbattle_arena_enqueued = FALSE
FROM ranked_season_entries AS ranked
WHERE product.shipandbattle_id = ranked.shipandbattle_id
  AND product.shipandbattle_queue_status = 'waiting'
  AND ranked.season_rank > 1;

-- This index closes concurrent double-queue races without limiting how many
-- public products an account may own. Active rows are governed by the locked
-- settlement workflow and the server-side participation check.
CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_queued_product_per_creator
  ON public.shipandbattle_products (shipandbattle_creator_uid)
  WHERE shipandbattle_creator_uid IS NOT NULL
    AND shipandbattle_queue_status = 'waiting'
    AND shipandbattle_arena_enqueued = TRUE;

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
