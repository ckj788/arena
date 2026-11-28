BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS shipandbattle_paid_product_orders_idx
  ON public.shipandbattle_launch_orders (product_id)
  WHERE status = 'paid' AND livemode AND details_submitted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.shipandbattle_claim_publication_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  today date := (transaction_timestamp() AT TIME ZONE 'America/New_York')::date;
BEGIN
  -- The payment RPC has already verified the account and Stripe environment.
  -- Confirmed test orders follow the same submission quota rules as live orders.
  IF EXISTS (
    SELECT FROM public.shipandbattle_launch_orders
    WHERE product_id = NEW.shipandbattle_id AND user_id = NEW.shipandbattle_creator_uid
      AND status = 'paid' AND details_submitted_at IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.shipandbattle_last_publication AS quota (user_id, publication_day)
    VALUES (NEW.shipandbattle_creator_uid, today)
  ON CONFLICT (user_id) DO UPDATE SET publication_day = EXCLUDED.publication_day
    WHERE quota.publication_day < EXCLUDED.publication_day;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can publish one free product per account per day.' USING ERRCODE = 'IC001';
  END IF;
  RETURN NULL;
END;
$$;

-- The checkout RPC attaches the order after inserting the product, in the same transaction.
DROP TRIGGER shipandbattle_daily_publication ON public.shipandbattle_products;
CREATE CONSTRAINT TRIGGER shipandbattle_daily_publication
AFTER INSERT ON public.shipandbattle_products DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.shipandbattle_creator_uid IS NOT NULL)
EXECUTE FUNCTION public.shipandbattle_claim_publication_day();

-- Preserve the deployed view's moderation filters, column order and access grants.
DO $$
DECLARE definition text;
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'shipandbattle_public_products' AND column_name = 'shipandbattle_paid_website_link') THEN
    definition := rtrim(pg_get_viewdef('public.shipandbattle_public_products'::regclass, true), E'; \n');
    EXECUTE format($view$
      CREATE OR REPLACE VIEW public.shipandbattle_public_products WITH (security_barrier=true,security_invoker=false)
      AS SELECT existing.*, EXISTS (
        SELECT FROM public.shipandbattle_launch_orders o WHERE o.product_id = existing.shipandbattle_id
          AND o.status = 'paid' AND o.livemode AND o.details_submitted_at IS NOT NULL
      ) AS shipandbattle_paid_website_link FROM (%s) existing
    $view$, definition);
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
