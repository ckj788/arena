BEGIN;

ALTER TABLE public.shipandbattle_launch_orders
  ADD COLUMN IF NOT EXISTS product_id text
  REFERENCES public.shipandbattle_products(shipandbattle_id) ON DELETE SET NULL;

-- Publication, final order details and the confirmation-email trigger commit
-- together. The same domain lock is used by normal product submissions.
CREATE OR REPLACE FUNCTION public.shipandbattle_submit_launch_product(
  p_order_id uuid, p_user_id uuid, p_livemode boolean,
  p_product jsonb, p_service_details jsonb, p_profile jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  o public.shipandbattle_launch_orders%ROWTYPE;
  profile public.shipandbattle_products%ROWTYPE;
  domain text;
  existing_id text;
  existing_owner uuid;
  base_slug text;
  published_id text;
BEGIN
  SELECT * INTO o FROM public.shipandbattle_launch_orders
    WHERE id = p_order_id AND user_id = p_user_id AND livemode = p_livemode FOR UPDATE;
  IF NOT FOUND OR o.status <> 'paid' THEN
    RAISE EXCEPTION 'Paid order not found' USING ERRCODE = 'P0002';
  END IF;
  IF o.product_id IS NOT NULL AND o.details_submitted_at IS NOT NULL THEN RETURN o.product_id; END IF;

  profile := jsonb_populate_record(NULL::public.shipandbattle_products, p_profile);
  IF profile.shipandbattle_creator_uid IS DISTINCT FROM p_user_id
    OR profile.shipandbattle_url IS DISTINCT FROM p_product->>'url'
    OR nullif(profile.shipandbattle_id, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid product ownership' USING ERRCODE = '22023';
  END IF;
  domain := public.shipandbattle_product_domain_key(profile.shipandbattle_url);
  IF domain IS NULL THEN RAISE EXCEPTION 'Invalid product domain' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(domain, 71919));
  SELECT shipandbattle_id, shipandbattle_creator_uid INTO existing_id, existing_owner
    FROM public.shipandbattle_products
    WHERE public.shipandbattle_product_domain_key(shipandbattle_url) = domain
    ORDER BY shipandbattle_submitted_at, shipandbattle_id LIMIT 1;
  IF FOUND THEN
    IF existing_owner IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'This website is already listed under another account' USING ERRCODE = '42501';
    END IF;
    published_id := existing_id;
  ELSE
    base_slug := profile.shipandbattle_id;
    FOR attempt IN 0..9 LOOP
      INSERT INTO public.shipandbattle_products (
        shipandbattle_id, shipandbattle_title, shipandbattle_tagline, shipandbattle_url,
        shipandbattle_maker_name, shipandbattle_maker_twitter, shipandbattle_maker_avatar,
        shipandbattle_logo, shipandbattle_screenshot, shipandbattle_screenshots,
        shipandbattle_submitted_at, shipandbattle_queue_status, shipandbattle_votes_count,
        shipandbattle_creator_uid, shipandbattle_creator_username, shipandbattle_arena_enqueued,
        shipandbattle_description, shipandbattle_category, shipandbattle_pricing_model,
        shipandbattle_pricing_details, shipandbattle_platforms, shipandbattle_target_audience,
        shipandbattle_maker_story, shipandbattle_feedback_request, shipandbattle_published_at,
        shipandbattle_updated_at, shipandbattle_qualified_impressions,
        shipandbattle_exposure_status, shipandbattle_moderation_status, shipandbattle_link_trust
      ) VALUES (
        profile.shipandbattle_id, profile.shipandbattle_title, profile.shipandbattle_tagline, profile.shipandbattle_url,
        profile.shipandbattle_maker_name, profile.shipandbattle_maker_twitter, profile.shipandbattle_maker_avatar,
        profile.shipandbattle_logo, profile.shipandbattle_screenshot, profile.shipandbattle_screenshots,
        profile.shipandbattle_submitted_at, 'waiting', 0,
        p_user_id, profile.shipandbattle_creator_username, false,
        profile.shipandbattle_description, profile.shipandbattle_category, profile.shipandbattle_pricing_model,
        profile.shipandbattle_pricing_details, profile.shipandbattle_platforms, profile.shipandbattle_target_audience,
        profile.shipandbattle_maker_story, profile.shipandbattle_feedback_request, profile.shipandbattle_published_at,
        profile.shipandbattle_updated_at, 0, 'new', 'unreviewed', 'ugc'
      ) ON CONFLICT (shipandbattle_id) DO NOTHING RETURNING shipandbattle_id INTO published_id;
      EXIT WHEN published_id IS NOT NULL;
      profile.shipandbattle_id := base_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    END LOOP;
    IF published_id IS NULL THEN RAISE EXCEPTION 'Could not allocate product URL'; END IF;
  END IF;

  UPDATE public.shipandbattle_launch_orders SET
    product_id = published_id, product = p_product, service_details = p_service_details,
    details_submitted_at = coalesce(details_submitted_at, now()) WHERE id = p_order_id;
  RETURN published_id;
END;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_submit_launch_product(uuid,uuid,boolean,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_submit_launch_product(uuid,uuid,boolean,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
