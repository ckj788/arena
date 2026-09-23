-- STEP 2: Run AFTER deploying the new app, after product safety + gallery migrations.
-- Permanently removes ONLY build-time metadata. Back up first if you need it.
-- No CASCADE: unexpected dependent objects abort the entire transaction safely.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ DECLARE columns_sql text := ''; field record; expression text; trigger_sql text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipandbattle_products' AND column_name='shipandbattle_ship_timeframe') THEN RETURN; END IF;
  -- Rebuild only the existing public projection: never expose private table fields.
  FOR field IN SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS datatype
    FROM pg_attribute a WHERE a.attrelid='public.shipandbattle_public_products'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'shipandbattle_ship_timeframe' ORDER BY a.attnum
  LOOP
    expression := format('%I',field.attname);
    IF field.attname='shipandbattle_screenshots' THEN
      expression := 'CASE WHEN shipandbattle_moderation_status=''restricted'' THEN ''{}''::text[] ELSE shipandbattle_screenshots END AS shipandbattle_screenshots';
    ELSIF field.attname IN ('shipandbattle_title','shipandbattle_tagline','shipandbattle_url','shipandbattle_maker_name','shipandbattle_maker_twitter','shipandbattle_maker_avatar','shipandbattle_logo','shipandbattle_description','shipandbattle_target_audience','shipandbattle_maker_story','shipandbattle_feedback_request','shipandbattle_screenshot') THEN
      expression := format('CASE WHEN shipandbattle_moderation_status=''restricted'' THEN %L::%s ELSE %I END AS %I',
        CASE field.attname WHEN 'shipandbattle_title' THEN 'Unavailable product' WHEN 'shipandbattle_logo' THEN '🚀' ELSE '' END,
        field.datatype,field.attname,field.attname);
    END IF;
    columns_sql := columns_sql || CASE WHEN columns_sql='' THEN '' ELSE ', ' END || expression;
  END LOOP;
  -- Preserve the existing updated-at trigger, removing just its obsolete column.
  SELECT pg_get_triggerdef(oid) INTO trigger_sql FROM pg_trigger
    WHERE tgrelid='public.shipandbattle_products'::regclass AND tgname='shipandbattle_products_touch_updated_at';
  IF trigger_sql IS NOT NULL THEN
    trigger_sql := replace(trigger_sql, ', shipandbattle_ship_timeframe', '');
    DROP TRIGGER shipandbattle_products_touch_updated_at ON public.shipandbattle_products;
  END IF;
  DROP VIEW public.shipandbattle_public_products;
  ALTER TABLE public.shipandbattle_products DROP COLUMN shipandbattle_ship_timeframe;
  IF trigger_sql IS NOT NULL THEN EXECUTE trigger_sql; END IF;
  EXECUTE 'CREATE VIEW public.shipandbattle_public_products WITH (security_barrier=true,security_invoker=false) AS SELECT ' || columns_sql || ' FROM public.shipandbattle_products';
END $$;
ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shipandbattle_public_products TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
