-- INDIE CLASH — additive product-profile and fair-exposure foundation
-- Safe to run after the previous production migration.
-- This migration does not delete products, brackets, matches, votes, or critiques.

BEGIN;

ALTER TABLE public.shipandbattle_products
  ADD COLUMN IF NOT EXISTS shipandbattle_description TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_category TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_pricing_model TEXT NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS shipandbattle_platforms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS shipandbattle_target_audience TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_maker_story TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_feedback_request TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipandbattle_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS shipandbattle_qualified_impressions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipandbattle_last_exposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipandbattle_exposure_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS shipandbattle_arena_enqueued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipandbattle_discovery_boost_until TIMESTAMPTZ;

ALTER TABLE public.shipandbattle_brackets
  ADD COLUMN IF NOT EXISTS shipandbattle_bracket_size INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS shipandbattle_round_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipandbattle_arena_scope TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS shipandbattle_category_slug TEXT;

UPDATE public.shipandbattle_products
SET
  shipandbattle_published_at = COALESCE(shipandbattle_published_at, shipandbattle_submitted_at, NOW()),
  shipandbattle_updated_at = CASE
    WHEN shipandbattle_description IS NULL THEN COALESCE(shipandbattle_submitted_at, NOW())
    ELSE COALESCE(shipandbattle_updated_at, shipandbattle_submitted_at, NOW())
  END,
  shipandbattle_exposure_status = CASE
    WHEN shipandbattle_exposure_status = 'new' AND shipandbattle_description IS NULL THEN 'legacy_catchup'
    ELSE shipandbattle_exposure_status
  END
WHERE shipandbattle_published_at IS NULL
   OR shipandbattle_updated_at IS NULL
   OR (shipandbattle_exposure_status = 'new' AND shipandbattle_description IS NULL);

-- Preserve the relative order of products already in the Arena queue. Future
-- entries receive their exact enqueue timestamp from the server.
UPDATE public.shipandbattle_products
SET shipandbattle_arena_enqueued_at = COALESCE(
  shipandbattle_arena_enqueued_at,
  shipandbattle_submitted_at,
  NOW()
)
WHERE shipandbattle_arena_enqueued = TRUE
  AND shipandbattle_arena_enqueued_at IS NULL;

ALTER TABLE public.shipandbattle_products
  ALTER COLUMN shipandbattle_published_at SET DEFAULT NOW(),
  ALTER COLUMN shipandbattle_published_at SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipandbattle_products_category_valid'
      AND conrelid = 'public.shipandbattle_products'::regclass
  ) THEN
    ALTER TABLE public.shipandbattle_products
      ADD CONSTRAINT shipandbattle_products_category_valid
      CHECK (
        shipandbattle_category IS NULL OR shipandbattle_category IN (
          'ai-tools', 'developer-tools', 'productivity', 'marketing',
          'design-tools', 'video-tools', 'founder-tools', 'saas'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipandbattle_products_pricing_valid'
      AND conrelid = 'public.shipandbattle_products'::regclass
  ) THEN
    ALTER TABLE public.shipandbattle_products
      ADD CONSTRAINT shipandbattle_products_pricing_valid
      CHECK (shipandbattle_pricing_model IN ('unspecified', 'free', 'freemium', 'paid', 'open-source', 'contact')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipandbattle_products_exposure_status_valid'
      AND conrelid = 'public.shipandbattle_products'::regclass
  ) THEN
    ALTER TABLE public.shipandbattle_products
      ADD CONSTRAINT shipandbattle_products_exposure_status_valid
      CHECK (shipandbattle_exposure_status IN ('new', 'legacy_catchup', 'needs_more_eyes', 'evergreen')) NOT VALID;
  END IF;
END
$constraints$;

DO $bracket_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipandbattle_brackets_size_valid'
      AND conrelid = 'public.shipandbattle_brackets'::regclass
  ) THEN
    ALTER TABLE public.shipandbattle_brackets
      ADD CONSTRAINT shipandbattle_brackets_size_valid
      CHECK (shipandbattle_bracket_size IN (2, 4, 8, 16)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipandbattle_brackets_scope_valid'
      AND conrelid = 'public.shipandbattle_brackets'::regclass
  ) THEN
    ALTER TABLE public.shipandbattle_brackets
      ADD CONSTRAINT shipandbattle_brackets_scope_valid
      CHECK (shipandbattle_arena_scope IN ('global', 'category')) NOT VALID;
  END IF;
END
$bracket_constraints$;

CREATE INDEX IF NOT EXISTS shipandbattle_products_category_published_idx
  ON public.shipandbattle_products (shipandbattle_category, shipandbattle_published_at DESC);

CREATE INDEX IF NOT EXISTS shipandbattle_products_fair_exposure_idx
  ON public.shipandbattle_products (
    shipandbattle_exposure_status,
    shipandbattle_qualified_impressions,
    shipandbattle_last_exposed_at NULLS FIRST,
    shipandbattle_published_at
  );

CREATE INDEX IF NOT EXISTS shipandbattle_products_arena_fifo_idx
  ON public.shipandbattle_products (
    shipandbattle_queue_status,
    shipandbattle_arena_enqueued,
    shipandbattle_arena_enqueued_at,
    shipandbattle_submitted_at
  );

ALTER TABLE public.shipandbattle_rate_limits
  DROP CONSTRAINT IF EXISTS shipandbattle_rate_limits_shipandbattle_action_check;
ALTER TABLE public.shipandbattle_rate_limits
  ADD CONSTRAINT shipandbattle_rate_limits_shipandbattle_action_check
  CHECK (shipandbattle_action IN ('logo', 'product_submit', 'product_update', 'queue', 'settle', 'vote'));

CREATE OR REPLACE FUNCTION public.shipandbattle_consume_rate_limit(p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_window INTERVAL;
  v_limit INTEGER;
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  CASE p_action
    WHEN 'logo'           THEN v_window := INTERVAL '1 day';  v_limit := 10;
    WHEN 'product_submit' THEN v_window := INTERVAL '1 day';  v_limit := 3;
    WHEN 'product_update' THEN v_window := INTERVAL '1 hour'; v_limit := 20;
    WHEN 'queue'          THEN v_window := INTERVAL '1 hour'; v_limit := 10;
    WHEN 'settle'         THEN v_window := INTERVAL '1 hour'; v_limit := 30;
    WHEN 'vote'           THEN v_window := INTERVAL '1 hour'; v_limit := 60;
    ELSE
      RAISE EXCEPTION 'unsupported rate-limit action' USING ERRCODE = '22023';
  END CASE;

  v_window_start := date_bin(v_window, clock_timestamp(), TIMESTAMPTZ '2001-01-01 00:00:00+00');

  INSERT INTO public.shipandbattle_rate_limits (
    shipandbattle_user_id,
    shipandbattle_action,
    shipandbattle_window_started_at,
    shipandbattle_request_count
  ) VALUES (v_user_id, p_action, v_window_start, 1)
  ON CONFLICT (
    shipandbattle_user_id,
    shipandbattle_action,
    shipandbattle_window_started_at
  ) DO UPDATE
    SET shipandbattle_request_count = public.shipandbattle_rate_limits.shipandbattle_request_count + 1
    WHERE public.shipandbattle_rate_limits.shipandbattle_request_count < v_limit
  RETURNING shipandbattle_request_count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.shipandbattle_rate_limits
  WHERE shipandbattle_user_id = v_user_id
    AND shipandbattle_window_started_at < clock_timestamp() - INTERVAL '2 days';
END;
$function$;

ALTER FUNCTION public.shipandbattle_consume_rate_limit(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shipandbattle_consume_rate_limit(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_consume_rate_limit(TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.shipandbattle_product_exposures (
  shipandbattle_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  shipandbattle_product_id TEXT NOT NULL REFERENCES public.shipandbattle_products(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_visitor_hash TEXT NOT NULL,
  shipandbattle_exposed_on DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE,
  shipandbattle_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipandbattle_product_exposures_unique_daily
    UNIQUE (shipandbattle_product_id, shipandbattle_visitor_hash, shipandbattle_exposed_on)
);

ALTER TABLE public.shipandbattle_product_exposures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_product_exposures FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.shipandbattle_record_product_exposures(
  p_product_ids TEXT[],
  p_visitor_hash TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_recorded INTEGER := 0;
BEGIN
  IF COALESCE(array_length(p_product_ids, 1), 0) NOT BETWEEN 1 AND 6
     OR char_length(p_visitor_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid exposure payload' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.shipandbattle_product_exposures
  WHERE shipandbattle_exposed_on < ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE - 31);

  WITH inserted AS (
    INSERT INTO public.shipandbattle_product_exposures (
      shipandbattle_product_id,
      shipandbattle_visitor_hash
    )
    SELECT DISTINCT input.product_id, p_visitor_hash
    FROM unnest(p_product_ids) AS input(product_id)
    WHERE EXISTS (
      SELECT 1 FROM public.shipandbattle_products AS product
      WHERE product.shipandbattle_id = input.product_id
    )
    ON CONFLICT DO NOTHING
    RETURNING shipandbattle_product_id
  ), updated AS (
    UPDATE public.shipandbattle_products AS product
    SET
      shipandbattle_qualified_impressions = product.shipandbattle_qualified_impressions + additions.impression_count,
      shipandbattle_last_exposed_at = clock_timestamp(),
      shipandbattle_exposure_status = CASE
        WHEN product.shipandbattle_qualified_impressions + additions.impression_count >= 100 THEN 'evergreen'
        WHEN product.shipandbattle_exposure_status = 'new' THEN 'needs_more_eyes'
        ELSE product.shipandbattle_exposure_status
      END
    FROM (
      SELECT shipandbattle_product_id, count(*)::INTEGER AS impression_count
      FROM inserted
      GROUP BY shipandbattle_product_id
    ) AS additions
    WHERE product.shipandbattle_id = additions.shipandbattle_product_id
    RETURNING additions.impression_count
  )
  SELECT COALESCE(sum(impression_count), 0)::INTEGER INTO v_recorded FROM updated;

  RETURN v_recorded;
END
$function$;

ALTER FUNCTION public.shipandbattle_record_product_exposures(TEXT[], TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shipandbattle_record_product_exposures(TEXT[], TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_record_product_exposures(TEXT[], TEXT)
  TO service_role;

-- Voting closes at the exact persisted New York calendar deadline. The
-- duration fallback keeps older brackets valid if they predate this migration.
CREATE OR REPLACE FUNCTION public.shipandbattle_cast_vote(
  p_match_id TEXT,
  p_voted_product_id TEXT,
  p_feedback_winner TEXT,
  p_feedback_loser TEXT
)
RETURNS TABLE(votes_a INTEGER, votes_b INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_bracket_id TEXT;
  v_match public.shipandbattle_matches%ROWTYPE;
  v_bracket public.shipandbattle_brackets%ROWTYPE;
  v_provider TEXT;
  v_username TEXT;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF char_length(trim(p_feedback_winner)) NOT BETWEEN 10 AND 1000
     OR char_length(trim(p_feedback_loser)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid feedback length' USING ERRCODE = '22023';
  END IF;

  PERFORM public.shipandbattle_consume_rate_limit('vote');

  SELECT match_row.shipandbattle_bracket_id
  INTO v_bracket_id
  FROM public.shipandbattle_matches AS match_row
  WHERE match_row.shipandbattle_id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_bracket
  FROM public.shipandbattle_brackets
  WHERE shipandbattle_id = v_bracket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match is closed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_match
  FROM public.shipandbattle_matches
  WHERE shipandbattle_id = p_match_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_bracket.shipandbattle_status <> 'active'
     OR v_match.shipandbattle_winner_id IS NOT NULL
     OR COALESCE(v_bracket.shipandbattle_settlement_lock_until, '-infinity'::TIMESTAMPTZ) > clock_timestamp() THEN
    RAISE EXCEPTION 'match is closed' USING ERRCODE = '22023';
  END IF;

  v_deadline := COALESCE(
    v_bracket.shipandbattle_round_ends_at,
    COALESCE(v_bracket.shipandbattle_round_started_at, clock_timestamp())
      + CASE v_match.shipandbattle_round_number
          WHEN 1 THEN INTERVAL '3 days'
          WHEN 2 THEN INTERVAL '2 days'
          ELSE INTERVAL '1 day'
        END
  );
  IF clock_timestamp() >= v_deadline THEN
    RAISE EXCEPTION 'match is closed' USING ERRCODE = '22023';
  END IF;

  IF p_voted_product_id <> v_match.shipandbattle_product_a_id
     AND p_voted_product_id <> v_match.shipandbattle_product_b_id THEN
    RAISE EXCEPTION 'voted product is not in this match' USING ERRCODE = '22023';
  END IF;

  v_provider := COALESCE(auth.jwt() -> 'app_metadata' ->> 'provider', '');
  IF v_provider NOT IN ('google', 'github') THEN
    IF COALESCE(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::JSONB) ? 'github' THEN
      v_provider := 'github';
    ELSIF COALESCE(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::JSONB) ? 'google' THEN
      v_provider := 'google';
    END IF;
  END IF;
  IF v_provider NOT IN ('google', 'github') THEN
    RAISE EXCEPTION 'unsupported authentication provider' USING ERRCODE = '28000';
  END IF;
  v_username := COALESCE(
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'preferred_username', ''),
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'user_name', ''),
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    'member-' || left(v_user_id::TEXT, 8)
  );

  INSERT INTO public.shipandbattle_votes (
    shipandbattle_match_id,
    shipandbattle_voter_uid,
    shipandbattle_voter_username,
    shipandbattle_voter_auth_type,
    shipandbattle_voted_product_id,
    shipandbattle_feedback_winner,
    shipandbattle_feedback_loser
  ) VALUES (
    p_match_id,
    v_user_id,
    v_username,
    v_provider,
    p_voted_product_id,
    trim(p_feedback_winner),
    trim(p_feedback_loser)
  );

  UPDATE public.shipandbattle_matches
  SET shipandbattle_votes_a = shipandbattle_votes_a
        + CASE WHEN p_voted_product_id = shipandbattle_product_a_id THEN 1 ELSE 0 END,
      shipandbattle_votes_b = shipandbattle_votes_b
        + CASE WHEN p_voted_product_id = shipandbattle_product_b_id THEN 1 ELSE 0 END
  WHERE shipandbattle_id = p_match_id;

  UPDATE public.shipandbattle_products
  SET shipandbattle_votes_count = shipandbattle_votes_count + 1
  WHERE shipandbattle_id = p_voted_product_id;

  -- Give-to-get is deliberately isolated from Arena seeding: one valid vote
  -- includes two critiques and activates seven days of +20% discovery weight
  -- for products owned by the reviewer. Repeated reviews extend, not stack.
  UPDATE public.shipandbattle_products
  SET shipandbattle_discovery_boost_until = GREATEST(
    COALESCE(shipandbattle_discovery_boost_until, '-infinity'::TIMESTAMPTZ),
    clock_timestamp() + INTERVAL '7 days'
  )
  WHERE shipandbattle_creator_uid = v_user_id;

  RETURN QUERY
  SELECT match_row.shipandbattle_votes_a, match_row.shipandbattle_votes_b
  FROM public.shipandbattle_matches AS match_row
  WHERE match_row.shipandbattle_id = p_match_id;
END;
$function$;

ALTER FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.shipandbattle_save_bracket_state(
  p_bracket JSONB,
  p_matches JSONB,
  p_product_ids TEXT[],
  p_product_status TEXT,
  p_prune_after_round INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_bracket ->> 'status' NOT IN ('preparing', 'active', 'completed')
     OR p_product_status NOT IN ('active', 'completed')
     OR COALESCE((p_bracket ->> 'bracket_size')::INTEGER, 16) NOT IN (2, 4, 8, 16)
     OR COALESCE(p_bracket ->> 'arena_scope', 'global') NOT IN ('global', 'category') THEN
    RAISE EXCEPTION 'invalid bracket status' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_matches, '[]'::JSONB)) <> 'array'
     OR jsonb_typeof(p_bracket) <> 'object' THEN
    RAISE EXCEPTION 'invalid bracket payload' USING ERRCODE = '22023';
  END IF;
  IF p_prune_after_round IS NOT NULL AND p_prune_after_round NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid prune round' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shipandbattle_brackets (
    shipandbattle_id,
    shipandbattle_status,
    shipandbattle_winner_id,
    shipandbattle_round_started_at,
    shipandbattle_round_ends_at,
    shipandbattle_bracket_size,
    shipandbattle_arena_scope,
    shipandbattle_category_slug
  ) VALUES (
    p_bracket ->> 'id',
    p_bracket ->> 'status',
    NULLIF(p_bracket ->> 'winner_id', ''),
    (p_bracket ->> 'round_started_at')::TIMESTAMPTZ,
    NULLIF(p_bracket ->> 'round_ends_at', '')::TIMESTAMPTZ,
    COALESCE((p_bracket ->> 'bracket_size')::INTEGER, 16),
    COALESCE(p_bracket ->> 'arena_scope', 'global'),
    NULLIF(p_bracket ->> 'category_slug', '')
  )
  ON CONFLICT (shipandbattle_id) DO UPDATE SET
    shipandbattle_status = EXCLUDED.shipandbattle_status,
    shipandbattle_winner_id = EXCLUDED.shipandbattle_winner_id,
    shipandbattle_round_started_at = EXCLUDED.shipandbattle_round_started_at,
    shipandbattle_round_ends_at = EXCLUDED.shipandbattle_round_ends_at,
    shipandbattle_bracket_size = EXCLUDED.shipandbattle_bracket_size,
    shipandbattle_arena_scope = EXCLUDED.shipandbattle_arena_scope,
    shipandbattle_category_slug = EXCLUDED.shipandbattle_category_slug;

  IF p_prune_after_round IS NOT NULL THEN
    DELETE FROM public.shipandbattle_matches
    WHERE shipandbattle_bracket_id = p_bracket ->> 'id'
      AND shipandbattle_round_number >= p_prune_after_round;
  END IF;

  INSERT INTO public.shipandbattle_matches (
    shipandbattle_id,
    shipandbattle_bracket_id,
    shipandbattle_round_number,
    shipandbattle_product_a_id,
    shipandbattle_product_b_id,
    shipandbattle_votes_a,
    shipandbattle_votes_b,
    shipandbattle_winner_id,
    shipandbattle_voted_user_ids
  )
  SELECT
    row_data.shipandbattle_id,
    row_data.shipandbattle_bracket_id,
    row_data.shipandbattle_round_number,
    row_data.shipandbattle_product_a_id,
    row_data.shipandbattle_product_b_id,
    row_data.shipandbattle_votes_a,
    row_data.shipandbattle_votes_b,
    row_data.shipandbattle_winner_id,
    '{}'::TEXT[]
  FROM jsonb_to_recordset(COALESCE(p_matches, '[]'::JSONB)) AS row_data(
    shipandbattle_id TEXT,
    shipandbattle_bracket_id TEXT,
    shipandbattle_round_number INTEGER,
    shipandbattle_product_a_id TEXT,
    shipandbattle_product_b_id TEXT,
    shipandbattle_votes_a INTEGER,
    shipandbattle_votes_b INTEGER,
    shipandbattle_winner_id TEXT,
    shipandbattle_voted_user_ids TEXT[]
  )
  ON CONFLICT (shipandbattle_id) DO UPDATE SET
    shipandbattle_bracket_id = EXCLUDED.shipandbattle_bracket_id,
    shipandbattle_round_number = EXCLUDED.shipandbattle_round_number,
    shipandbattle_product_a_id = EXCLUDED.shipandbattle_product_a_id,
    shipandbattle_product_b_id = EXCLUDED.shipandbattle_product_b_id,
    shipandbattle_votes_a = EXCLUDED.shipandbattle_votes_a,
    shipandbattle_votes_b = EXCLUDED.shipandbattle_votes_b,
    shipandbattle_winner_id = EXCLUDED.shipandbattle_winner_id,
    shipandbattle_voted_user_ids = '{}'::TEXT[];

  UPDATE public.shipandbattle_products
  SET shipandbattle_queue_status = p_product_status
  WHERE shipandbattle_id = ANY(COALESCE(p_product_ids, '{}'::TEXT[]));
END
$function$;

ALTER FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.shipandbattle_touch_product_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.shipandbattle_updated_at := clock_timestamp();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS shipandbattle_products_touch_updated_at ON public.shipandbattle_products;
CREATE TRIGGER shipandbattle_products_touch_updated_at
BEFORE UPDATE OF
  shipandbattle_title,
  shipandbattle_tagline,
  shipandbattle_url,
  shipandbattle_ship_timeframe,
  shipandbattle_maker_name,
  shipandbattle_maker_twitter,
  shipandbattle_logo,
  shipandbattle_description,
  shipandbattle_category,
  shipandbattle_pricing_model,
  shipandbattle_platforms,
  shipandbattle_target_audience,
  shipandbattle_maker_story,
  shipandbattle_feedback_request
ON public.shipandbattle_products
FOR EACH ROW EXECUTE FUNCTION public.shipandbattle_touch_product_updated_at();

CREATE OR REPLACE VIEW public.shipandbattle_public_products
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  shipandbattle_id,
  shipandbattle_title,
  shipandbattle_tagline,
  shipandbattle_url,
  shipandbattle_ship_timeframe,
  shipandbattle_maker_name,
  shipandbattle_maker_twitter,
  shipandbattle_maker_avatar,
  shipandbattle_logo,
  shipandbattle_submitted_at,
  shipandbattle_queue_status,
  shipandbattle_votes_count,
  shipandbattle_arena_enqueued,
  shipandbattle_description,
  shipandbattle_category,
  shipandbattle_pricing_model,
  shipandbattle_platforms,
  shipandbattle_target_audience,
  shipandbattle_maker_story,
  shipandbattle_feedback_request,
  shipandbattle_published_at,
  shipandbattle_updated_at,
  shipandbattle_qualified_impressions,
  shipandbattle_last_exposed_at,
  shipandbattle_exposure_status,
  shipandbattle_arena_enqueued_at,
  shipandbattle_discovery_boost_until
FROM public.shipandbattle_products;

ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_products FROM PUBLIC;
GRANT SELECT ON public.shipandbattle_public_products TO anon, authenticated;

CREATE OR REPLACE VIEW public.shipandbattle_public_brackets
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  shipandbattle_id,
  shipandbattle_status,
  shipandbattle_winner_id,
  shipandbattle_created_at,
  shipandbattle_round_started_at,
  shipandbattle_bracket_size,
  shipandbattle_round_ends_at,
  shipandbattle_arena_scope,
  shipandbattle_category_slug
FROM public.shipandbattle_brackets;

ALTER VIEW public.shipandbattle_public_brackets OWNER TO postgres;
REVOKE ALL ON public.shipandbattle_public_brackets FROM PUBLIC;
GRANT SELECT ON public.shipandbattle_public_brackets TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
