-- INDIE CLASH / shipandbattle_ production migration
-- Target: the existing schema in lib/schema.sql
-- Run this entire file once in Supabase Dashboard -> SQL Editor.
-- The transaction is intentionally atomic: any incompatible legacy data aborts
-- the migration instead of leaving the database half-secured.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Identity, ownership, settlement locking, and data integrity
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipandbattle_products
  ADD COLUMN IF NOT EXISTS shipandbattle_creator_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipandbattle_creator_username TEXT,
  ADD COLUMN IF NOT EXISTS shipandbattle_arena_enqueued BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.shipandbattle_votes
  ADD COLUMN IF NOT EXISTS shipandbattle_voter_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shipandbattle_brackets
  ADD COLUMN IF NOT EXISTS shipandbattle_settlement_lock_token UUID,
  ADD COLUMN IF NOT EXISTS shipandbattle_settlement_lock_until TIMESTAMPTZ;

-- Recover ownership written by the pre-migration application. New application
-- code stores creator_uid directly and never embeds it in an avatar URL.
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
  shipandbattle_maker_avatar IS NULL
  OR shipandbattle_maker_avatar NOT LIKE '%pushed=false%'
)
WHERE shipandbattle_arena_enqueued = FALSE;

-- UUIDs are retained only in the private votes table. The old denormalized list
-- is no longer required and is deliberately erased before public views are made.
UPDATE public.shipandbattle_matches
SET shipandbattle_voted_user_ids = '{}'::TEXT[]
WHERE COALESCE(cardinality(shipandbattle_voted_user_ids), 0) > 0;

-- Older vote rows may have fallen back to an email address as their public
-- display label. Anonymize those labels before exposing the safe vote view.
UPDATE public.shipandbattle_votes
SET shipandbattle_voter_username = CASE
  WHEN shipandbattle_voter_uid IS NOT NULL
    THEN 'member-' || left(shipandbattle_voter_uid::TEXT, 8)
  ELSE 'Community member'
END
WHERE shipandbattle_voter_username ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

ALTER TABLE public.shipandbattle_matches
  ALTER COLUMN shipandbattle_bracket_id SET NOT NULL;

ALTER TABLE public.shipandbattle_votes
  DROP CONSTRAINT IF EXISTS shipandbattle_votes_shipandbattle_voter_auth_type_check;
ALTER TABLE public.shipandbattle_votes
  ADD CONSTRAINT shipandbattle_votes_shipandbattle_voter_auth_type_check
  CHECK (shipandbattle_voter_auth_type IN ('google', 'github')) NOT VALID;

ALTER TABLE public.shipandbattle_products
  DROP CONSTRAINT IF EXISTS shipandbattle_products_nonnegative_votes;
ALTER TABLE public.shipandbattle_products
  ADD CONSTRAINT shipandbattle_products_nonnegative_votes
  CHECK (shipandbattle_votes_count >= 0) NOT VALID;

ALTER TABLE public.shipandbattle_products
  DROP CONSTRAINT IF EXISTS shipandbattle_products_http_url;
ALTER TABLE public.shipandbattle_products
  ADD CONSTRAINT shipandbattle_products_http_url
  CHECK (shipandbattle_url ~* '^https?://[^[:space:]]+$') NOT VALID;

ALTER TABLE public.shipandbattle_matches
  DROP CONSTRAINT IF EXISTS shipandbattle_matches_valid_round;
ALTER TABLE public.shipandbattle_matches
  ADD CONSTRAINT shipandbattle_matches_valid_round
  CHECK (shipandbattle_round_number BETWEEN 1 AND 4) NOT VALID;

ALTER TABLE public.shipandbattle_matches
  DROP CONSTRAINT IF EXISTS shipandbattle_matches_distinct_products;
ALTER TABLE public.shipandbattle_matches
  ADD CONSTRAINT shipandbattle_matches_distinct_products
  CHECK (shipandbattle_product_a_id <> shipandbattle_product_b_id) NOT VALID;

ALTER TABLE public.shipandbattle_matches
  DROP CONSTRAINT IF EXISTS shipandbattle_matches_nonnegative_votes;
ALTER TABLE public.shipandbattle_matches
  ADD CONSTRAINT shipandbattle_matches_nonnegative_votes
  CHECK (shipandbattle_votes_a >= 0 AND shipandbattle_votes_b >= 0) NOT VALID;

ALTER TABLE public.shipandbattle_matches
  DROP CONSTRAINT IF EXISTS shipandbattle_matches_valid_winner;
ALTER TABLE public.shipandbattle_matches
  ADD CONSTRAINT shipandbattle_matches_valid_winner
  CHECK (
    shipandbattle_winner_id IS NULL
    OR shipandbattle_winner_id IN (shipandbattle_product_a_id, shipandbattle_product_b_id)
  ) NOT VALID;

ALTER TABLE public.shipandbattle_votes
  DROP CONSTRAINT IF EXISTS shipandbattle_votes_feedback_length;
ALTER TABLE public.shipandbattle_votes
  ADD CONSTRAINT shipandbattle_votes_feedback_length
  CHECK (
    char_length(trim(shipandbattle_feedback_winner)) BETWEEN 10 AND 1000
    AND char_length(trim(shipandbattle_feedback_loser)) BETWEEN 10 AND 1000
  ) NOT VALID;

-- Legacy versions allowed one account to own multiple open products. Preserve
-- every product and its tournament state, but keep ownership on only one open
-- row per account so the production uniqueness rule can be installed safely.
-- Prefer an active entry; otherwise keep the most recently submitted waiting
-- entry. Completed products are not affected by this rule.
WITH ranked_open_products AS (
  SELECT
    shipandbattle_id,
    row_number() OVER (
      PARTITION BY shipandbattle_creator_uid
      ORDER BY
        CASE WHEN shipandbattle_queue_status = 'active' THEN 0 ELSE 1 END,
        shipandbattle_submitted_at DESC NULLS LAST,
        shipandbattle_id
    ) AS ownership_rank
  FROM public.shipandbattle_products
  WHERE shipandbattle_creator_uid IS NOT NULL
    AND shipandbattle_queue_status IN ('waiting', 'active')
)
UPDATE public.shipandbattle_products AS product
SET shipandbattle_creator_uid = NULL
FROM ranked_open_products AS ranked
WHERE product.shipandbattle_id = ranked.shipandbattle_id
  AND ranked.ownership_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_votes_one_per_user_match
  ON public.shipandbattle_votes (shipandbattle_match_id, shipandbattle_voter_uid)
  WHERE shipandbattle_voter_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_product_per_creator
  ON public.shipandbattle_products (shipandbattle_creator_uid)
  WHERE shipandbattle_creator_uid IS NOT NULL
    AND shipandbattle_queue_status IN ('waiting', 'active');

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_bracket
  ON public.shipandbattle_brackets ((TRUE))
  WHERE shipandbattle_status IN ('preparing', 'active');

CREATE INDEX IF NOT EXISTS shipandbattle_products_submitted_at_idx
  ON public.shipandbattle_products (shipandbattle_submitted_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_products_queue_idx
  ON public.shipandbattle_products (shipandbattle_queue_status, shipandbattle_arena_enqueued, shipandbattle_submitted_at);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_bracket_round_idx
  ON public.shipandbattle_matches (shipandbattle_bracket_id, shipandbattle_round_number);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_a_idx
  ON public.shipandbattle_matches (shipandbattle_product_a_id);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_b_idx
  ON public.shipandbattle_matches (shipandbattle_product_b_id);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_match_created_at_idx
  ON public.shipandbattle_votes (shipandbattle_match_id, shipandbattle_created_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_product_idx
  ON public.shipandbattle_votes (shipandbattle_voted_product_id);

-- ---------------------------------------------------------------------------
-- 2. Private base tables plus deliberately narrow public read views
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipandbattle_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_votes ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive policies, including policies with unknown names.
DO $do$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'shipandbattle_products',
        'shipandbattle_brackets',
        'shipandbattle_matches',
        'shipandbattle_votes'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$do$;

REVOKE ALL
  ON public.shipandbattle_products,
     public.shipandbattle_brackets,
     public.shipandbattle_matches,
     public.shipandbattle_votes
  FROM PUBLIC, anon, authenticated;

-- Authenticated owners may read only their own base product row. This supplies
-- creator_uid to the maker console without exposing it in public catalog data.
GRANT SELECT ON public.shipandbattle_products TO authenticated;
CREATE POLICY shipandbattle_products_owner_read
  ON public.shipandbattle_products
  FOR SELECT
  TO authenticated
  USING (shipandbattle_creator_uid = (SELECT auth.uid()));

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
  shipandbattle_arena_enqueued
FROM public.shipandbattle_products;

CREATE OR REPLACE VIEW public.shipandbattle_public_brackets
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  shipandbattle_id,
  shipandbattle_status,
  shipandbattle_winner_id,
  shipandbattle_created_at,
  shipandbattle_round_started_at
FROM public.shipandbattle_brackets;

CREATE OR REPLACE VIEW public.shipandbattle_public_matches
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  shipandbattle_id,
  shipandbattle_bracket_id,
  shipandbattle_round_number,
  shipandbattle_product_a_id,
  shipandbattle_product_b_id,
  shipandbattle_votes_a,
  shipandbattle_votes_b,
  shipandbattle_winner_id
FROM public.shipandbattle_matches;

CREATE OR REPLACE VIEW public.shipandbattle_public_votes
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  shipandbattle_id,
  shipandbattle_match_id,
  shipandbattle_voter_username,
  shipandbattle_voter_auth_type,
  shipandbattle_voted_product_id,
  shipandbattle_feedback_winner,
  shipandbattle_feedback_loser,
  shipandbattle_created_at
FROM public.shipandbattle_votes;

ALTER VIEW public.shipandbattle_public_products OWNER TO postgres;
ALTER VIEW public.shipandbattle_public_brackets OWNER TO postgres;
ALTER VIEW public.shipandbattle_public_matches OWNER TO postgres;
ALTER VIEW public.shipandbattle_public_votes OWNER TO postgres;

REVOKE ALL
  ON public.shipandbattle_public_products,
     public.shipandbattle_public_brackets,
     public.shipandbattle_public_matches,
     public.shipandbattle_public_votes
  FROM PUBLIC;
GRANT SELECT
  ON public.shipandbattle_public_products,
     public.shipandbattle_public_brackets,
     public.shipandbattle_public_matches,
     public.shipandbattle_public_votes
  TO anon, authenticated;

-- Public subscriptions to private WAL rows can reveal columns omitted by views.
-- The application now polls the safe views, so remove all arena base tables from
-- the Realtime publication if they were previously added.
DO $do$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'shipandbattle_products',
      'shipandbattle_brackets',
      'shipandbattle_matches',
      'shipandbattle_votes'
    ]
    LOOP
      IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
          table_name
        );
      END IF;
    END LOOP;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. Database-backed per-user abuse protection
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipandbattle_rate_limits (
  shipandbattle_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shipandbattle_action TEXT NOT NULL
    CHECK (shipandbattle_action IN ('logo', 'product_submit', 'queue', 'settle', 'vote')),
  shipandbattle_window_started_at TIMESTAMPTZ NOT NULL,
  shipandbattle_request_count INTEGER NOT NULL DEFAULT 1
    CHECK (shipandbattle_request_count > 0),
  PRIMARY KEY (
    shipandbattle_user_id,
    shipandbattle_action,
    shipandbattle_window_started_at
  )
);

ALTER TABLE public.shipandbattle_rate_limits
  DROP CONSTRAINT IF EXISTS shipandbattle_rate_limits_shipandbattle_action_check;
ALTER TABLE public.shipandbattle_rate_limits
  ADD CONSTRAINT shipandbattle_rate_limits_shipandbattle_action_check
  CHECK (shipandbattle_action IN ('logo', 'product_submit', 'queue', 'settle', 'vote'));

ALTER TABLE public.shipandbattle_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_rate_limits FROM PUBLIC, anon, authenticated;

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

  -- Cheap bounded cleanup of this user's obsolete counters.
  DELETE FROM public.shipandbattle_rate_limits
  WHERE shipandbattle_user_id = v_user_id
    AND shipandbattle_window_started_at < clock_timestamp() - INTERVAL '2 days';
END;
$function$;

ALTER FUNCTION public.shipandbattle_consume_rate_limit(TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.shipandbattle_consume_rate_limit(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_consume_rate_limit(TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Atomic authenticated voting
-- ---------------------------------------------------------------------------

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

  SELECT m.shipandbattle_bracket_id
  INTO v_bracket_id
  FROM public.shipandbattle_matches AS m
  WHERE m.shipandbattle_id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  -- Lock bracket before match, matching settlement's lock order.
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

  v_deadline := COALESCE(v_bracket.shipandbattle_round_started_at, clock_timestamp())
    + CASE v_match.shipandbattle_round_number
        WHEN 1 THEN INTERVAL '3 days'
        WHEN 2 THEN INTERVAL '2 days'
        ELSE INTERVAL '1 day'
      END;
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

  RETURN QUERY
  SELECT m.shipandbattle_votes_a, m.shipandbattle_votes_b
  FROM public.shipandbattle_matches AS m
  WHERE m.shipandbattle_id = p_match_id;
END;
$function$;

ALTER FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_cast_vote(TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Service-role-only atomic bracket persistence and settlement locking
-- ---------------------------------------------------------------------------

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
END;
$function$;

ALTER FUNCTION public.shipandbattle_save_bracket_state(JSONB, JSONB, TEXT[], TEXT, INTEGER)
  OWNER TO postgres;

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
SET search_path = ''
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shipandbattle_brackets
  SET shipandbattle_settlement_lock_token = p_lock_token,
      shipandbattle_settlement_lock_until = clock_timestamp() + INTERVAL '90 seconds'
  WHERE shipandbattle_id = p_bracket_id
    AND shipandbattle_round_started_at IS NOT DISTINCT FROM p_round_started_at
    AND (
      shipandbattle_settlement_lock_until IS NULL
      OR shipandbattle_settlement_lock_until < clock_timestamp()
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

ALTER FUNCTION public.shipandbattle_acquire_settlement_lock(TEXT, TIMESTAMPTZ, UUID)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.shipandbattle_acquire_settlement_lock(TEXT, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_acquire_settlement_lock(TEXT, TIMESTAMPTZ, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Product-logo Storage bucket. Browser writes remain disabled; uploads go
-- through the authenticated, rate-limited API using the service role.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'product-logos',
  'product-logos',
  TRUE,
  1000000,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public buckets serve known object URLs without a SELECT policy. Keep listing
-- and direct client writes disabled; the server-side upload route bypasses RLS.
DROP POLICY IF EXISTS shipandbattle_product_logos_public_read ON storage.objects;
DROP POLICY IF EXISTS shipandbattle_product_logos_owner_insert ON storage.objects;
DROP POLICY IF EXISTS shipandbattle_product_logos_owner_update ON storage.objects;
DROP POLICY IF EXISTS shipandbattle_product_logos_owner_delete ON storage.objects;

NOTIFY pgrst, 'reload schema';

COMMIT;
