-- Install before deploying the pricing editor. Additive and rerunnable.
-- Existing products retain NULL pricing; no prices or ratings are invented.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.shipandbattle_products
  ADD COLUMN IF NOT EXISTS shipandbattle_pricing_details jsonb;

ALTER TABLE public.shipandbattle_products
  DROP CONSTRAINT IF EXISTS shipandbattle_product_pricing_valid;
ALTER TABLE public.shipandbattle_products
  ADD CONSTRAINT shipandbattle_product_pricing_valid CHECK (
    shipandbattle_pricing_details IS NULL OR (
      jsonb_typeof(shipandbattle_pricing_details) = 'object'
      AND shipandbattle_pricing_details ?& ARRAY['planName','amount','currency','billingPeriod','pricingUrl']
      AND jsonb_typeof(shipandbattle_pricing_details->'planName') = 'string'
      AND char_length(btrim(shipandbattle_pricing_details->>'planName')) BETWEEN 2 AND 80
      AND jsonb_typeof(shipandbattle_pricing_details->'amount') = 'string'
      AND (shipandbattle_pricing_details->>'amount') ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$'
      AND jsonb_typeof(shipandbattle_pricing_details->'currency') = 'string'
      AND shipandbattle_pricing_details->>'currency' IN ('USD','EUR','GBP','CNY','JPY','CAD','AUD','INR','BRL','SGD','HKD','KRW','CHF','SEK','PLN','NZD','MXN','AED')
      AND jsonb_typeof(shipandbattle_pricing_details->'billingPeriod') = 'string'
      AND shipandbattle_pricing_details->>'billingPeriod' IN ('one-time','month','year','free')
      AND jsonb_typeof(shipandbattle_pricing_details->'pricingUrl') = 'string'
      AND char_length(shipandbattle_pricing_details->>'pricingUrl') BETWEEN 8 AND 500
      AND (shipandbattle_pricing_details->>'pricingUrl') ~ '^https?://[^[:space:]]+$'
      AND shipandbattle_pricing_model IS NOT NULL
      AND shipandbattle_pricing_model IN ('free','freemium','paid','open-source')
      AND CASE WHEN (shipandbattle_pricing_details->>'amount') ~ '^0(\.0{1,6})?$' THEN
        shipandbattle_pricing_details->>'billingPeriod' = 'free' AND shipandbattle_pricing_model <> 'paid'
      ELSE
        shipandbattle_pricing_details->>'billingPeriod' <> 'free' AND shipandbattle_pricing_model <> 'free'
      END
    )
  );

-- Append only this public field to the existing view. Preserve its projection,
-- moderation redaction, and any filtering; never expose private owner fields.
DO $$ DECLARE definition text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_public_products' AND column_name='shipandbattle_pricing_details') THEN
    definition := rtrim(pg_get_viewdef('public.shipandbattle_public_products'::regclass,true), '; ' || chr(10));
    EXECUTE 'CREATE OR REPLACE VIEW public.shipandbattle_public_products WITH (security_barrier=true,security_invoker=false) AS SELECT existing.*, CASE WHEN source.shipandbattle_moderation_status=''restricted'' THEN NULL::jsonb ELSE source.shipandbattle_pricing_details END AS shipandbattle_pricing_details FROM (' || definition || ') existing JOIN public.shipandbattle_products source ON source.shipandbattle_id=existing.shipandbattle_id';
  END IF;
END $$;
ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_products FROM PUBLIC;
GRANT SELECT ON public.shipandbattle_public_products TO anon, authenticated, service_role;

-- Keep sitemap lastModified accurate for a pricing-only edit as well.
DROP TRIGGER IF EXISTS shipandbattle_product_pricing_updated_at ON public.shipandbattle_products;
CREATE TRIGGER shipandbattle_product_pricing_updated_at
BEFORE UPDATE OF shipandbattle_pricing_details ON public.shipandbattle_products
FOR EACH ROW EXECUTE FUNCTION public.shipandbattle_touch_product_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
