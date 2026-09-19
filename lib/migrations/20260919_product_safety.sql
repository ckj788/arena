-- Run AFTER 20260903_product_profiles.sql, BEFORE deploying the matching app.
-- Additive and repeatable. No products, owners, matches, votes or slugs are deleted.
BEGIN;

ALTER TABLE public.shipandbattle_products
  ADD COLUMN IF NOT EXISTS shipandbattle_screenshot text,
  ADD COLUMN IF NOT EXISTS shipandbattle_moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS shipandbattle_link_trust text NOT NULL DEFAULT 'trusted',
  ADD COLUMN IF NOT EXISTS shipandbattle_domain_key text;
-- Existing records retain their status. New inserts are live but unreviewed.
ALTER TABLE public.shipandbattle_products
  ALTER COLUMN shipandbattle_moderation_status SET DEFAULT 'unreviewed',
  ALTER COLUMN shipandbattle_link_trust SET DEFAULT 'ugc';
ALTER TABLE public.shipandbattle_products DROP CONSTRAINT IF EXISTS shipandbattle_moderation_status_check;
ALTER TABLE public.shipandbattle_products ADD CONSTRAINT shipandbattle_moderation_status_check
  CHECK (shipandbattle_moderation_status IN ('unreviewed','approved','restricted'));
ALTER TABLE public.shipandbattle_products DROP CONSTRAINT IF EXISTS shipandbattle_link_trust_check;
ALTER TABLE public.shipandbattle_products ADD CONSTRAINT shipandbattle_link_trust_check
  CHECK (shipandbattle_link_trust IN ('ugc','trusted'));

CREATE OR REPLACE FUNCTION public.shipandbattle_product_domain_key(value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE host text; path text; normalized text;
BEGIN
  normalized := regexp_replace(btrim(value), '^(https?://[[:space:]]*)+', '', 'i');
  host := lower(split_part(split_part(split_part(normalized, '/', 1), '?', 1), '#', 1));
  host := regexp_replace(regexp_replace(regexp_replace(host, ':[0-9]+$', ''), '^www\.', ''), '\.$', '');
  IF host IN ('github.com','gitlab.com') THEN
    path := split_part(split_part(normalized, '?', 1), '#', 1);
    path := regexp_replace(path, '^[^/]+/*', '');
    path := regexp_replace(path, '/+', '/', 'g');
    RETURN host || '/' || lower(split_part(path, '/', 1)) ||
      CASE WHEN split_part(path, '/', 2) <> '' THEN '/' || lower(split_part(path, '/', 2)) ELSE '' END;
  END IF;
  RETURN nullif(host, '');
END $$;

-- Only one historical row claims each domain. Historical duplicates survive,
-- and editing their description is allowed; new duplicates are not allowed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='shipandbattle_unique_product_domain') THEN
    WITH ranked AS (
      SELECT shipandbattle_id, public.shipandbattle_product_domain_key(shipandbattle_url) AS domain,
        row_number() OVER (PARTITION BY public.shipandbattle_product_domain_key(shipandbattle_url)
          ORDER BY shipandbattle_submitted_at, shipandbattle_id) AS position
      FROM public.shipandbattle_products
    ) UPDATE public.shipandbattle_products p SET shipandbattle_domain_key = CASE WHEN r.position=1 THEN r.domain ELSE NULL END
      FROM ranked r WHERE p.shipandbattle_id=r.shipandbattle_id;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_unique_product_domain
  ON public.shipandbattle_products(shipandbattle_domain_key) WHERE shipandbattle_domain_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipandbattle_product_domain_lookup
  ON public.shipandbattle_products(public.shipandbattle_product_domain_key(shipandbattle_url));

CREATE OR REPLACE FUNCTION public.shipandbattle_guard_product_safety()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.shipandbattle_domain_key := public.shipandbattle_product_domain_key(NEW.shipandbattle_url);
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.shipandbattle_domain_key, 71919));
    IF EXISTS (SELECT 1 FROM public.shipandbattle_products WHERE public.shipandbattle_product_domain_key(shipandbattle_url)=NEW.shipandbattle_domain_key) THEN
      RAISE EXCEPTION 'Duplicate product domain' USING ERRCODE='23505', CONSTRAINT='shipandbattle_unique_product_domain';
    END IF;
  ELSE
    IF public.shipandbattle_product_domain_key(NEW.shipandbattle_url) IS DISTINCT FROM public.shipandbattle_product_domain_key(OLD.shipandbattle_url) THEN
      NEW.shipandbattle_domain_key := public.shipandbattle_product_domain_key(NEW.shipandbattle_url);
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.shipandbattle_domain_key, 71919));
      IF EXISTS (SELECT 1 FROM public.shipandbattle_products WHERE shipandbattle_id<>OLD.shipandbattle_id AND public.shipandbattle_product_domain_key(shipandbattle_url)=NEW.shipandbattle_domain_key) THEN
        RAISE EXCEPTION 'Duplicate product domain' USING ERRCODE='23505', CONSTRAINT='shipandbattle_unique_product_domain';
      END IF;
    ELSE
      NEW.shipandbattle_domain_key := OLD.shipandbattle_domain_key;
    END IF;
    -- An approved URL must not be silently replaced with an unreviewed target.
    -- Changes within the same host (path/query) also require a fresh review.
    IF ROW(NEW.shipandbattle_url, NEW.shipandbattle_title, NEW.shipandbattle_tagline, NEW.shipandbattle_description, NEW.shipandbattle_logo, NEW.shipandbattle_screenshot)
      IS DISTINCT FROM ROW(OLD.shipandbattle_url, OLD.shipandbattle_title, OLD.shipandbattle_tagline, OLD.shipandbattle_description, OLD.shipandbattle_logo, OLD.shipandbattle_screenshot) THEN
      IF OLD.shipandbattle_moderation_status <> 'restricted' THEN NEW.shipandbattle_moderation_status := 'unreviewed'; END IF;
      NEW.shipandbattle_link_trust := 'ugc';
      NEW.shipandbattle_updated_at := now();
    END IF;
  END IF;
  IF NEW.shipandbattle_moderation_status <> 'approved' THEN NEW.shipandbattle_link_trust := 'ugc'; END IF;
  IF NEW.shipandbattle_moderation_status='restricted' THEN NEW.shipandbattle_arena_enqueued := false; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shipandbattle_product_safety_guard ON public.shipandbattle_products;
CREATE TRIGGER shipandbattle_product_safety_guard BEFORE INSERT OR UPDATE ON public.shipandbattle_products
  FOR EACH ROW EXECUTE FUNCTION public.shipandbattle_guard_product_safety();

CREATE TABLE IF NOT EXISTS public.shipandbattle_product_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.shipandbattle_products(shipandbattle_id),
  reporter_uid uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam','unsafe','duplicate','impersonation','other')),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,reporter_uid)
);
CREATE INDEX IF NOT EXISTS shipandbattle_reports_queue ON public.shipandbattle_product_reports(status,created_at);
CREATE INDEX IF NOT EXISTS shipandbattle_reports_rate ON public.shipandbattle_product_reports(reporter_uid,created_at);
CREATE TABLE IF NOT EXISTS public.shipandbattle_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.shipandbattle_products(shipandbattle_id),
  actor_uid uuid,
  action text NOT NULL CHECK (action IN ('approved','unreviewed','restricted','dismiss')),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipandbattle_product_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_moderation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_product_reports, public.shipandbattle_moderation_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shipandbattle_product_reports, public.shipandbattle_moderation_log TO service_role;

-- Service-role-only RPC: authenticated API supplies the verified reporter id.
CREATE OR REPLACE FUNCTION public.shipandbattle_report_product(p_product text, p_reporter uuid, p_reason text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_reporter::text, 51919));
  IF EXISTS (SELECT 1 FROM public.shipandbattle_product_reports WHERE product_id=p_product AND reporter_uid=p_reporter) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.shipandbattle_product_reports WHERE reporter_uid=p_reporter AND created_at>now()-interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'Report limit reached' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.shipandbattle_product_reports(product_id,reporter_uid,reason,note) VALUES(p_product,p_reporter,p_reason,p_note);
END $$;
REVOKE ALL ON FUNCTION public.shipandbattle_report_product(text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_report_product(text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.shipandbattle_moderate_product(p_product text, p_actor uuid, p_action text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.shipandbattle_products WHERE shipandbattle_id=p_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
  IF p_action NOT IN ('approved','unreviewed','restricted','dismiss') OR length(btrim(p_note)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE='22023';
  END IF;
  IF p_action <> 'dismiss' THEN
    UPDATE public.shipandbattle_products SET shipandbattle_moderation_status=p_action,
      shipandbattle_link_trust=CASE WHEN p_action='approved' THEN 'trusted' ELSE 'ugc' END,
      shipandbattle_updated_at=now() WHERE shipandbattle_id=p_product;
  END IF;
  UPDATE public.shipandbattle_product_reports SET status=CASE WHEN p_action='restricted' THEN 'actioned' ELSE 'dismissed' END
    WHERE product_id=p_product AND status='open';
  INSERT INTO public.shipandbattle_moderation_log(product_id,actor_uid,action,note) VALUES(p_product,p_actor,p_action,btrim(p_note));
END $$;
REVOKE ALL ON FUNCTION public.shipandbattle_moderate_product(text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_moderate_product(text,uuid,text,text) TO service_role;

-- Preserve the exact public-view column order/types. Restricted records become
-- safe tombstones, so past/active match graphs keep their participants and votes.
-- Private owner ids, reports and moderation notes are NEVER added to this view.
DO $$ DECLARE columns_sql text; field record; expression text; BEGIN
  columns_sql := '';
  FOR field IN SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS datatype
    FROM pg_attribute a WHERE a.attrelid='public.shipandbattle_public_products'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum
  LOOP
    expression := format('%I',field.attname);
    IF field.attname='shipandbattle_screenshots' THEN
      expression := 'CASE WHEN shipandbattle_moderation_status=''restricted'' THEN ''{}''::text[] ELSE shipandbattle_screenshots END AS shipandbattle_screenshots';
    END IF;
    IF field.attname IN ('shipandbattle_title','shipandbattle_tagline','shipandbattle_url','shipandbattle_maker_name','shipandbattle_maker_twitter','shipandbattle_maker_avatar','shipandbattle_logo','shipandbattle_description','shipandbattle_target_audience','shipandbattle_maker_story','shipandbattle_feedback_request','shipandbattle_screenshot') THEN
      expression := format('CASE WHEN shipandbattle_moderation_status=''restricted'' THEN %L::%s ELSE %I END AS %I',
        CASE field.attname WHEN 'shipandbattle_title' THEN 'Unavailable product' WHEN 'shipandbattle_logo' THEN '🚀' ELSE '' END,
        field.datatype,field.attname,field.attname);
    END IF;
    columns_sql := columns_sql || CASE WHEN columns_sql='' THEN '' ELSE ', ' END || expression;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_public_products' AND column_name='shipandbattle_screenshot') THEN
    columns_sql := columns_sql || ', CASE WHEN shipandbattle_moderation_status=''restricted'' THEN NULL ELSE shipandbattle_screenshot END AS shipandbattle_screenshot, shipandbattle_moderation_status, shipandbattle_link_trust';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.shipandbattle_public_products WITH (security_barrier=true,security_invoker=false) AS SELECT ' || columns_sql || ' FROM public.shipandbattle_products';
END $$;
ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_products FROM PUBLIC;
GRANT SELECT ON public.shipandbattle_public_products TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
