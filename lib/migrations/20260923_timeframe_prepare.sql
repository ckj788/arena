-- STEP 1: Run before deploying the app that no longer sends a build timeframe.
-- Compatible with both old and new clients. No records are deleted.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_products' AND column_name='shipandbattle_ship_timeframe') THEN
    ALTER TABLE public.shipandbattle_products ALTER COLUMN shipandbattle_ship_timeframe DROP NOT NULL;
    ALTER TABLE public.shipandbattle_products ALTER COLUMN shipandbattle_ship_timeframe DROP DEFAULT;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
