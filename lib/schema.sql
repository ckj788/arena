-- ========================================================
-- 🛡️ INDIE CLASH — SUPABASE DATABASE TABLES BACKUP
-- Local backup to prevent table name typos and mismatches
-- File: d:\ZASON-项目\1\lib\schema.sql
-- 所有表和列均添加了 'shipandbattle_' 前缀，以防免费版数据库重合冲突
-- ========================================================

-- 1. shipandbattle_products 表 (存放参赛项目数据)
CREATE TABLE IF NOT EXISTS shipandbattle_products (
  shipandbattle_id TEXT PRIMARY KEY,
  shipandbattle_title TEXT NOT NULL,
  shipandbattle_tagline TEXT NOT NULL,
  shipandbattle_url TEXT NOT NULL,
  shipandbattle_ship_timeframe TEXT NOT NULL CHECK (shipandbattle_ship_timeframe IN ('24h', '48h', '7d')),
  shipandbattle_maker_name TEXT NOT NULL,
  shipandbattle_maker_twitter TEXT NOT NULL,
  shipandbattle_maker_avatar TEXT,
  shipandbattle_logo TEXT NOT NULL,
  shipandbattle_submitted_at TIMESTAMPTZ DEFAULT NOW(),
  shipandbattle_queue_status TEXT NOT NULL DEFAULT 'waiting' CHECK (shipandbattle_queue_status IN ('waiting', 'active', 'completed')),
  shipandbattle_votes_count INT NOT NULL DEFAULT 0,
  shipandbattle_creator_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shipandbattle_creator_username TEXT,
  shipandbattle_arena_enqueued BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. shipandbattle_brackets 表 (存放晋级赛阶段状态)
CREATE TABLE IF NOT EXISTS shipandbattle_brackets (
  shipandbattle_id TEXT PRIMARY KEY,
  shipandbattle_status TEXT NOT NULL DEFAULT 'preparing' CHECK (shipandbattle_status IN ('preparing', 'active', 'completed')),
  shipandbattle_winner_id TEXT REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE SET NULL,
  shipandbattle_created_at TIMESTAMPTZ DEFAULT NOW(),
  shipandbattle_round_started_at TIMESTAMPTZ DEFAULT NOW(),
  shipandbattle_settlement_lock_token UUID,
  shipandbattle_settlement_lock_until TIMESTAMPTZ
);

-- 3. shipandbattle_matches 表 (存放每轮 1v1 对决比分和状态)
CREATE TABLE IF NOT EXISTS shipandbattle_matches (
  shipandbattle_id TEXT PRIMARY KEY,
  shipandbattle_bracket_id TEXT REFERENCES shipandbattle_brackets(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_round_number INT NOT NULL,
  shipandbattle_product_a_id TEXT NOT NULL REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_product_b_id TEXT NOT NULL REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_votes_a INT NOT NULL DEFAULT 0,
  shipandbattle_votes_b INT NOT NULL DEFAULT 0,
  shipandbattle_winner_id TEXT REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE SET NULL,
  shipandbattle_voted_user_ids TEXT[] DEFAULT '{}'::TEXT[]
);

-- 4. shipandbattle_votes 表 (存放每个用户绑定 X/GitHub 投出的真实反馈，即双向 Critique 评语表)
CREATE TABLE IF NOT EXISTS shipandbattle_votes (
  shipandbattle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipandbattle_match_id TEXT NOT NULL REFERENCES shipandbattle_matches(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_voter_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shipandbattle_voter_username TEXT NOT NULL,
  shipandbattle_voter_auth_type TEXT NOT NULL CHECK (shipandbattle_voter_auth_type IN ('google', 'github', 'twitter')),
  shipandbattle_voted_product_id TEXT NOT NULL REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_feedback_winner TEXT NOT NULL,
  shipandbattle_feedback_loser TEXT NOT NULL,
  shipandbattle_created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_product_per_creator
  ON shipandbattle_products (shipandbattle_creator_uid)
  WHERE shipandbattle_creator_uid IS NOT NULL AND shipandbattle_queue_status IN ('waiting', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_one_open_bracket
  ON shipandbattle_brackets ((TRUE))
  WHERE shipandbattle_status IN ('preparing', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS shipandbattle_votes_one_per_user_match
  ON shipandbattle_votes (shipandbattle_match_id, shipandbattle_voter_uid)
  WHERE shipandbattle_voter_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipandbattle_products_submitted_at_idx
  ON shipandbattle_products (shipandbattle_submitted_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_a_idx
  ON shipandbattle_matches (shipandbattle_product_a_id);
CREATE INDEX IF NOT EXISTS shipandbattle_matches_product_b_idx
  ON shipandbattle_matches (shipandbattle_product_b_id);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_match_created_at_idx
  ON shipandbattle_votes (shipandbattle_match_id, shipandbattle_created_at DESC);
CREATE INDEX IF NOT EXISTS shipandbattle_votes_product_idx
  ON shipandbattle_votes (shipandbattle_voted_product_id);

-- ========================================================
-- ⚡ 开启 SUPABASE 实时数据流推送（REALTIME）
-- ========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE shipandbattle_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE shipandbattle_votes;

-- ========================================================
-- 🔒 生产安全策略：公开只读，所有写入经服务端或受控 RPC 完成
-- ========================================================
ALTER TABLE shipandbattle_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipandbattle_products_public_read ON shipandbattle_products FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_brackets_public_read ON shipandbattle_brackets FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_matches_public_read ON shipandbattle_matches FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY shipandbattle_votes_public_read ON shipandbattle_votes FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON shipandbattle_products, shipandbattle_brackets, shipandbattle_matches, shipandbattle_votes
  FROM anon, authenticated;

-- Apply lib/migrations/20260821_security_hardening.sql after this base schema
-- to install atomic voting, uniqueness constraints, and settlement locking.
