-- Run after 20261027_launch_payments.sql, including on installations using its
-- earlier pay-after-details schema. Does not modify existing product profiles.
BEGIN;
ALTER TABLE public.shipandbattle_launch_orders
  ALTER COLUMN product DROP NOT NULL,
  ALTER COLUMN service_details DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS details_submitted_at timestamptz;
-- Preserve complete snapshots supplied by customers on the previous flow.
UPDATE public.shipandbattle_launch_orders SET details_submitted_at=created_at
WHERE product IS NOT NULL AND service_details IS NOT NULL AND details_submitted_at IS NULL;
COMMIT;
