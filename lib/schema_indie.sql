-- ========================================================
-- 🛡️ INDIE CLASH — SUPABASE DATABASE TABLES BACKUP (INDIE_ PREFIX)
-- File: d:\ZASON-项目\arena\lib\schema_indie.sql
-- All tables and columns are prefixed with 'indie_' for the staging/testing project.
-- ========================================================

-- 1. indie_products Table (Makers submitted products)
CREATE TABLE IF NOT EXISTS indie_products (
  indie_id TEXT PRIMARY KEY,
  indie_title TEXT NOT NULL,
  indie_tagline TEXT NOT NULL,
  indie_url TEXT NOT NULL,
  indie_ship_timeframe TEXT NOT NULL CHECK (indie_ship_timeframe IN ('24h', '48h', '7d')),
  indie_maker_name TEXT NOT NULL,
  indie_maker_twitter TEXT NOT NULL,
  indie_maker_avatar TEXT,
  indie_logo TEXT NOT NULL,
  indie_submitted_at TIMESTAMPTZ DEFAULT NOW(),
  indie_queue_status TEXT NOT NULL DEFAULT 'waiting' CHECK (indie_queue_status IN ('waiting', 'active', 'completed')),
  indie_votes_count INT NOT NULL DEFAULT 0,
  indie_creator_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  indie_creator_username TEXT,
  indie_arena_enqueued BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. indie_brackets Table (Tournament lifecycle brackets)
CREATE TABLE IF NOT EXISTS indie_brackets (
  indie_id TEXT PRIMARY KEY,
  indie_status TEXT NOT NULL DEFAULT 'preparing' CHECK (indie_status IN ('preparing', 'active', 'completed')),
  indie_winner_id TEXT REFERENCES indie_products(indie_id) ON DELETE SET NULL,
  indie_created_at TIMESTAMPTZ DEFAULT NOW(),
  indie_round_started_at TIMESTAMPTZ DEFAULT NOW(),
  indie_settlement_lock_token UUID,
  indie_settlement_lock_until TIMESTAMPTZ
);

-- 3. indie_matches Table (Matchup scores & stats)
CREATE TABLE IF NOT EXISTS indie_matches (
  indie_id TEXT PRIMARY KEY,
  indie_bracket_id TEXT REFERENCES indie_brackets(indie_id) ON DELETE CASCADE,
  indie_round_number INT NOT NULL,
  indie_product_a_id TEXT NOT NULL REFERENCES indie_products(indie_id) ON DELETE CASCADE,
  indie_product_b_id TEXT NOT NULL REFERENCES indie_products(indie_id) ON DELETE CASCADE,
  indie_votes_a INT NOT NULL DEFAULT 0,
  indie_votes_b INT NOT NULL DEFAULT 0,
  indie_winner_id TEXT REFERENCES indie_products(indie_id) ON DELETE SET NULL,
  indie_voted_user_ids TEXT[] DEFAULT '{}'::TEXT[]
);

-- 4. indie_votes Table (Constructive double-critique comments & audit logging)
CREATE TABLE IF NOT EXISTS indie_votes (
  indie_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indie_match_id TEXT NOT NULL REFERENCES indie_matches(indie_id) ON DELETE CASCADE,
  indie_voter_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  indie_voter_username TEXT NOT NULL,
  indie_voter_auth_type TEXT NOT NULL CHECK (indie_voter_auth_type IN ('google', 'github', 'twitter')),
  indie_voted_product_id TEXT NOT NULL REFERENCES indie_products(indie_id) ON DELETE CASCADE,
  indie_feedback_winner TEXT NOT NULL,
  indie_feedback_loser TEXT NOT NULL,
  indie_created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS indie_one_open_bracket
  ON indie_brackets ((TRUE))
  WHERE indie_status IN ('preparing', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS indie_votes_one_per_user_match
  ON indie_votes (indie_match_id, indie_voter_uid)
  WHERE indie_voter_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS indie_products_submitted_at_idx
  ON indie_products (indie_submitted_at DESC);
CREATE INDEX IF NOT EXISTS indie_matches_product_a_idx
  ON indie_matches (indie_product_a_id);
CREATE INDEX IF NOT EXISTS indie_matches_product_b_idx
  ON indie_matches (indie_product_b_id);
CREATE INDEX IF NOT EXISTS indie_votes_match_created_at_idx
  ON indie_votes (indie_match_id, indie_created_at DESC);
CREATE INDEX IF NOT EXISTS indie_votes_product_idx
  ON indie_votes (indie_voted_product_id);

-- ========================================================
-- ⚡ ENABLE SUPABASE REALTIME STREAMING
-- ========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE indie_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE indie_votes;

-- ========================================================
-- 🔒 ENABLE ROW LEVEL SECURITY: PUBLIC READS, SERVER-SIDE WRITES ONLY
-- ========================================================
ALTER TABLE indie_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE indie_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE indie_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE indie_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY indie_products_public_read ON indie_products FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY indie_brackets_public_read ON indie_brackets FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY indie_matches_public_read ON indie_matches FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY indie_votes_public_read ON indie_votes FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON indie_products, indie_brackets, indie_matches, indie_votes
  FROM anon, authenticated;
