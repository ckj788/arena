-- INDIE CLASH / restore legacy Arena queue choices
-- Safe to run more than once after the previous single-product normalization.

BEGIN;

-- Queue participation must not be coupled to how many products a maker owns.
DROP INDEX IF EXISTS public.shipandbattle_one_open_product_per_creator;
DROP INDEX IF EXISTS public.shipandbattle_one_queued_product_per_creator;

-- Restore only pre-migration rows carrying both the legacy auth UID marker and
-- the legacy "not opted out" queue state. New showcase-only rows are untouched.
UPDATE public.shipandbattle_products
SET shipandbattle_arena_enqueued = TRUE
WHERE shipandbattle_queue_status = 'waiting'
  AND shipandbattle_arena_enqueued = FALSE
  AND shipandbattle_maker_avatar ~ 'uid=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  AND shipandbattle_maker_avatar NOT LIKE '%pushed=false%';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification result returned by the SQL editor. Production should return
-- six rows after this repair, including Seedance 2.5.
SELECT
  shipandbattle_id,
  shipandbattle_title,
  shipandbattle_submitted_at
FROM public.shipandbattle_products
WHERE shipandbattle_queue_status = 'waiting'
  AND shipandbattle_arena_enqueued = TRUE
ORDER BY shipandbattle_submitted_at ASC;
