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
  shipandbattle_votes_count INT NOT NULL DEFAULT 0
);

-- 2. shipandbattle_brackets 表 (存放晋级赛阶段状态)
CREATE TABLE IF NOT EXISTS shipandbattle_brackets (
  shipandbattle_id TEXT PRIMARY KEY,
  shipandbattle_status TEXT NOT NULL DEFAULT 'preparing' CHECK (shipandbattle_status IN ('preparing', 'active', 'completed')),
  shipandbattle_winner_id TEXT REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE SET NULL,
  shipandbattle_created_at TIMESTAMPTZ DEFAULT NOW(),
  shipandbattle_round_started_at TIMESTAMPTZ DEFAULT NOW()
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
  shipandbattle_voter_username TEXT NOT NULL,
  shipandbattle_voter_auth_type TEXT NOT NULL CHECK (shipandbattle_voter_auth_type IN ('twitter', 'github')),
  shipandbattle_voted_product_id TEXT NOT NULL REFERENCES shipandbattle_products(shipandbattle_id) ON DELETE CASCADE,
  shipandbattle_feedback_winner TEXT NOT NULL,
  shipandbattle_feedback_loser TEXT NOT NULL,
  shipandbattle_created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- ⚡ 开启 SUPABASE 实时数据流推送（REALTIME）
-- ========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE shipandbattle_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE shipandbattle_votes;

-- ========================================================
-- 🔓 禁用行级安全策略（RLS），允许公共客户端免授权读写（Demo/Sandbox 极速配置）
-- ========================================================
ALTER TABLE shipandbattle_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_brackets DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipandbattle_votes DISABLE ROW LEVEL SECURITY;
