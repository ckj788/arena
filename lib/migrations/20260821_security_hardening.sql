-- INDIE CLASH production security hardening (shipandbattle_ schema)
-- Run once in the Supabase SQL editor before deploying the matching application code.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.shipandbattle_products
  ADD COLUMN IF NOT EXISTS shipandbattle_creator_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipandbattle_creator_username TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_arena_enqueued BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.shipandbattle_products AS product
SET shipandbattle_creator_uid = account.id
FROM auth.users AS account
WHERE product.shipandbattle_creator_uid IS NULL
  AND product.shipandbattle_maker_avatar ~ 'uid=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  AND account.id = substring(
    product.shipandbattle_maker_avatar
    FROM 'uid=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
  )::UUID;

UPDATE public.shipandbattle_products
SET shipandbattle_arena_enqueued = (
  shipandbattle_maker_avatar IS NULL OR shipandbattle_maker_avatar NOT LIKE '%pushed=false%'
);

ALTER TABLE public.shipandbattle_votes
  ADD COLUMN IF NOT EXISTS shipandbattle_voter_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shipandbattle_votes
  DROP CONSTRAINT IF EXISTS shipandbattle_votes_shipandbattle_voter_auth_type_check;
ALTER TABLE public.shipandbattle_votes
  ADD CONSTRAINT shipandbattle_votes_shipandbattle_voter_auth_type_check
  CHECK (shipandbattle_voter_auth_type IN ('google', 'github', 'twitter'));

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_votes_one_per_user_match
  ON public.shipandbattle_votes (shipandbattle_match_id, shipandbattle_voter_uid)
  WHERE shipandbattle_voter_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_product_per_creator
  ON public.shipandbattle_products (shipandbattle_creator_uid)
  WHERE shipandbattle_creator_uid IS NOT NULL
    AND shipandbattle_queue_status IN ('waiting', 'active');

ALTER TABLE public.shipandbattle_brackets
  ADD COLUMN IF NOT EXISTS shipandbattle_settlement_lock_token UUID,
  ADD COLUMN IF NOT EXISTS shipandbattle_settlement_lock_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_bracket
  ON public.shipandbattle_brackets ((TRUE))
  WHERE shipandbattle_status IN ('preparing', 'active');

-- Public product and matchup pages use these read paths for metadata, internal
-- links, and sitemap generation. Keep them fast as the launch catalog grows.
CREATE INDEX IF NOT EXISTS shipandbattle_products_submitted_at_idx
  ON public.shipandbattle_products (shipandbattle_submitted_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_a_idx
  ON public.shipandbattle_matches (shipandbattle_product_a_id);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_b_idx
  ON public.shipandbattle_matches (shipandbattle_product_b_id);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_match_created_at_idx
  ON public.shipandbattle_votes (shipandbattle_match_id, shipandbattle_created_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_product_idx
  ON public.shipandbattle_votes (shipandbattle_voted_product_id);

ALTER TABLE public.shipandbattle_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipandbattle_products_public_read ON public.shipandbattle_products;
DROP POLICY IF EXISTS shipandbattle_brackets_public_read ON public.shipandbattle_brackets;
DROP POLICY IF EXISTS shipandbattle_matches_public_read ON public.shipandbattle_matches;
DROP POLICY IF EXISTS shipandbattle_votes_public_read ON public.shipandbattle_votes;

CREATE POLICY shipandbattle_products_public_read
  ON public.shipandbattle_products FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_brackets_public_read
  ON public.shipandbattle_brackets FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_matches_public_read
  ON public.shipandbattle_matches FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_votes_public_read
  ON public.shipandbattle_votes FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.shipandbattle_products, public.shipandbattle_brackets,
     public.shipandbattle_matches, public.shipandbattle_votes
  FROM anon, authenticated;
GRANT SELECT
  ON public.shipandbattle_products, public.shipandbattle_brackets,
     public.shipandbattle_matches, public.shipandbattle_votes
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.shipandbattle_cast_vote(
  p_match_id TEXT,
  p_voted_product_id TEXT,
  p_feedback_winner TEXT,
  p_feedback_loser TEXT
)
RETURNS TABLE(votes_a INTEGER, votes_b INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
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

  SELECT * INTO v_match
  FROM public.shipandbattle_matches
  WHERE shipandbattle_id = p_match_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_bracket
  FROM public.shipandbattle_brackets
  WHERE shipandbattle_id = v_match.shipandbattle_bracket_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_bracket.shipandbattle_status <> 'active'
     OR v_match.shipandbattle_winner_id IS NOT NULL
     OR COALESCE(v_bracket.shipandbattle_settlement_lock_until, '-infinity'::TIMESTAMPTZ) > now() THEN
    RAISE EXCEPTION 'match is closed' USING ERRCODE = '22023';
  END IF;

  v_deadline := v_bracket.shipandbattle_round_started_at + CASE v_match.shipandbattle_round_number
    WHEN 1 THEN INTERVAL '3 days'
    WHEN 2 THEN INTERVAL '2 days'
    ELSE INTERVAL '1 day'
  END;
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'match is closed' USING ERRCODE = '22023';
  END IF;

  IF p_voted_product_id <> v_match.shipandbattle_product_a_id
     AND p_voted_product_id <> v_match.shipandbattle_product_b_id THEN
    RAISE EXCEPTION 'voted product is not in this match' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shipandbattle_votes
    WHERE shipandbattle_match_id = p_match_id
      AND shipandbattle_voter_uid = v_user_id
  ) THEN
    RAISE EXCEPTION 'already voted' USING ERRCODE = '23505';
  END IF;

  v_provider := COALESCE(auth.jwt() -> 'app_metadata' ->> 'provider', '');
  IF v_provider NOT IN ('google', 'github') THEN
    RAISE EXCEPTION 'unsupported authentication provider' USING ERRCODE = '28000';
  END IF;
  v_username := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'preferred_username',
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    v_user_id::TEXT
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
  SET shipandbattle_votes_a = shipandbattle_votes_a + CASE WHEN p_voted_product_id = shipandbattle_product_a_id THEN 1 ELSE 0 END,
      shipandbattle_votes_b = shipandbattle_votes_b + CASE WHEN p_voted_product_id = shipandbattle_product_b_id THEN 1 ELSE 0 END,
      shipandbattle_voted_user_ids = array_append(COALESCE(shipandbattle_voted_user_ids, '{}'::TEXT[]), v_user_id::TEXT)
  WHERE shipandbattle_id = p_match_id;

  UPDATE public.shipandbattle_products
  SET shipandbattle_votes_count = shipandbattle_votes_count + 1
  WHERE shipandbattle_id = p_voted_product_id;

  RETURN QUERY
    SELECT m.shipandbattle_votes_a, m.shipandbattle_votes_b
    FROM public.shipandbattle_matches AS m
    WHERE m.shipandbattle_id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Persist a bracket, all of its matches, and participant statuses in one transaction.
-- This prevents half-written seasons when one of several REST writes fails.
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
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_bracket ->> 'status' NOT IN ('preparing', 'active', 'completed')
     OR p_product_status NOT IN ('active', 'completed') THEN
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
    shipandbattle_round_started_at
  ) VALUES (
    p_bracket ->> 'id',
    p_bracket ->> 'status',
    NULLIF(p_bracket ->> 'winner_id', ''),
    (p_bracket ->> 'round_started_at')::TIMESTAMPTZ
  )
  ON CONFLICT (shipandbattle_id) DO UPDATE SET
    shipandbattle_status = EXCLUDED.shipandbattle_status,
    shipandbattle_winner_id = EXCLUDED.shipandbattle_winner_id,
    shipandbattle_round_started_at = EXCLUDED.shipandbattle_round_started_at;

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
    COALESCE(row_data.shipandbattle_voted_user_ids, '{}'::TEXT[])
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
    shipandbattle_voted_user_ids = EXCLUDED.shipandbattle_voted_user_ids;

  UPDATE public.shipandbattle_products
  SET shipandbattle_queue_status = p_product_status
  WHERE shipandbattle_id = ANY(COALESCE(p_product_ids, '{}'::TEXT[]));
END;
$$;

REVOKE ALL ON FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.shipandbattle_acquire_settlement_lock(
  p_bracket_id TEXT,
  p_round_started_at TIMESTAMPTZ,
  p_lock_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shipandbattle_brackets
  SET shipandbattle_settlement_lock_token = p_lock_token,
      shipandbattle_settlement_lock_until = now() + INTERVAL '90 seconds'
  WHERE shipandbattle_id = p_bracket_id
    AND shipandbattle_round_started_at IS NOT DISTINCT FROM p_round_started_at
    AND (shipandbattle_settlement_lock_until IS NULL OR shipandbattle_settlement_lock_until < now());
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.shipandbattle_acquire_settlement_lock(TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_acquire_settlement_lock(TEXT, TIMESTAMPTZ, UUID) TO service_role;

COMMIT;
