-- Run AFTER 20260919_product_safety.sql. Additive, transactional, rerunnable.
BEGIN;
-- Existing per-user image quota must accommodate 3 submissions x (logo + 5 images).
-- Preserve all other actions, auth checks and atomic counters.
DO $$ DECLARE definition text; updated text; BEGIN
  IF to_regprocedure('public.shipandbattle_consume_rate_limit(text)') IS NOT NULL THEN
    definition:=pg_get_functiondef('public.shipandbattle_consume_rate_limit(text)'::regprocedure);
    updated:=regexp_replace(definition, '(WHEN ''logo''[[:space:]]+THEN v_window := INTERVAL ''1 day'';[[:space:]]+v_limit := )10;', '\130;');
    IF updated<>definition THEN EXECUTE updated; END IF;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_products' AND column_name='shipandbattle_screenshots') THEN
    ALTER TABLE public.shipandbattle_products ADD COLUMN shipandbattle_screenshots text[] NOT NULL DEFAULT '{}';
    UPDATE public.shipandbattle_products SET shipandbattle_screenshots=ARRAY[shipandbattle_screenshot]
      WHERE coalesce(shipandbattle_screenshot,'') <> '';
  END IF;
END $$;
ALTER TABLE public.shipandbattle_products DROP CONSTRAINT IF EXISTS shipandbattle_gallery_limit;
ALTER TABLE public.shipandbattle_products ADD CONSTRAINT shipandbattle_gallery_limit CHECK (
  cardinality(shipandbattle_screenshots)<=5 AND
  (cardinality(shipandbattle_screenshots)=0 OR (array_ndims(shipandbattle_screenshots)=1 AND array_lower(shipandbattle_screenshots,1)=1)) AND
  array_position(shipandbattle_screenshots,NULL) IS NULL AND array_position(shipandbattle_screenshots,'') IS NULL
);
CREATE OR REPLACE FUNCTION public.shipandbattle_guard_product_gallery()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF cardinality(NEW.shipandbattle_screenshots)=0 AND coalesce(NEW.shipandbattle_screenshot,'')<>'' THEN
      NEW.shipandbattle_screenshots:=ARRAY[NEW.shipandbattle_screenshot];
    END IF;
  ELSE
    -- Old clients edit only the first image, without discarding the remaining images.
    IF NEW.shipandbattle_screenshots IS NOT DISTINCT FROM OLD.shipandbattle_screenshots
      AND NEW.shipandbattle_screenshot IS DISTINCT FROM OLD.shipandbattle_screenshot THEN
      NEW.shipandbattle_screenshots:=CASE WHEN coalesce(NEW.shipandbattle_screenshot,'')='' THEN '{}'::text[] ELSE ARRAY[NEW.shipandbattle_screenshot] END || coalesce(OLD.shipandbattle_screenshots[2:5],'{}'::text[]);
    END IF;
    IF NEW.shipandbattle_screenshots IS DISTINCT FROM OLD.shipandbattle_screenshots THEN
      IF OLD.shipandbattle_moderation_status <> 'restricted' THEN NEW.shipandbattle_moderation_status:='unreviewed'; END IF;
      NEW.shipandbattle_link_trust:='ugc';
      NEW.shipandbattle_updated_at:=now();
    END IF;
  END IF;
  NEW.shipandbattle_screenshot:=NEW.shipandbattle_screenshots[1];
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shipandbattle_product_gallery_guard ON public.shipandbattle_products;
CREATE TRIGGER shipandbattle_product_gallery_guard BEFORE INSERT OR UPDATE ON public.shipandbattle_products
FOR EACH ROW EXECUTE FUNCTION public.shipandbattle_guard_product_gallery();
-- Preserve all existing public fields and their redaction rules.
DO $$ DECLARE definition text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_public_products' AND column_name='shipandbattle_screenshots') THEN
    definition:=rtrim(pg_get_viewdef('public.shipandbattle_public_products'::regclass,true),'; ' || chr(10));
    EXECUTE 'CREATE OR REPLACE VIEW public.shipandbattle_public_products WITH (security_barrier=true,security_invoker=false) AS SELECT existing.*, CASE WHEN source.shipandbattle_moderation_status=''restricted'' THEN ''{}''::text[] ELSE source.shipandbattle_screenshots END AS shipandbattle_screenshots FROM (' || definition || ') existing JOIN public.shipandbattle_products source ON source.shipandbattle_id=existing.shipandbattle_id';
  END IF;
END $$;
ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_products FROM PUBLIC;
GRANT SELECT ON public.shipandbattle_public_products TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
