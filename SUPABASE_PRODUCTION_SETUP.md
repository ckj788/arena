# Indie Clash：Supabase 生产配置

## 执行顺序

1. 当前数据库已经有 `shipandbattle_*` 四张基础表：直接在 Supabase SQL Editor 完整执行 [`lib/migrations/20260822_production_ready.sql`](lib/migrations/20260822_production_ready.sql)。
2. 如果是全新的空数据库：先执行 [`lib/schema.sql`](lib/schema.sql)，再执行上述生产迁移。
3. 如果曾执行过会把重复开放产品的 `creator_uid` 清空的旧版生产迁移，再执行 [`lib/migrations/20260823_restore_multi_product_ownership.sql`](lib/migrations/20260823_restore_multi_product_ownership.sql) 恢复可确认的产品归属。
4. 如果旧版“单账号一个排队产品”规则减少了原队列数量，再执行 [`lib/migrations/20260823_restore_legacy_arena_queue.sql`](lib/migrations/20260823_restore_legacy_arena_queue.sql) 恢复旧版明确入队的产品。
5. SQL 成功提交后再部署应用。不要先部署依赖 `shipandbattle_public_*` 视图的新代码。

该迁移会一次性创建或更新：

- 私有基础表 RLS 与最小权限；
- 不含用户 UUID、投票 UUID 列表和结算锁的四个公开只读视图；
- 原子投票、原子保存赛季、结算锁 RPC；
- 用户级提交、Logo、入队、投票和结算限流；
- `product-logos` 公共读取 Bucket（浏览器不能直接写入）；
- 多产品所有权、Arena 排队状态、唯一投票、唯一开放赛季、数据合法性和查询索引；
- 从 Realtime publication 移除私有基础表，避免 WAL 推送泄露隐藏列。

## Supabase Auth Dashboard

在 Authentication → URL Configuration 设置：

- Site URL：`https://www.indieclash.com`
- Redirect URL：`https://www.indieclash.com/auth/callback`
- 本地开发另加：`http://localhost:3000/auth/callback`

在 Providers 中启用并正确配置 Google、GitHub。应用不支持密码、邮件或匿名登录，建议关闭这些不使用的注册入口。

## Vercel 环境变量

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_DB_PREFIX=shipandbattle_

# 以下只能放服务端，绝不能添加 NEXT_PUBLIC_ 前缀
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CRON_SECRET=AT_LEAST_32_RANDOM_BYTES
ADMIN_API_SECRET=AT_LEAST_32_RANDOM_BYTES
ADMIN_EMAILS=admin@example.com
```

当前 `vercel.json` 使用每日兜底结算，兼容 Vercel Hobby。活跃访客也会在轮次到期时触发受锁保护的即时结算。若项目使用 Vercel Pro，可把计划改为 `*/10 * * * *`，获得约十分钟一次的无人值守结算检查。

## 执行后核对

在 SQL Editor 运行下面的只读检查：

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'shipandbattle_public_%'
ORDER BY table_name;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'shipandbattle_consume_rate_limit',
    'shipandbattle_cast_vote',
    'shipandbattle_save_bracket_state',
    'shipandbattle_acquire_settlement_lock'
  )
ORDER BY routine_name;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'product-logos';

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (tablename LIKE 'shipandbattle_%' OR policyname LIKE 'shipandbattle_%')
ORDER BY schemaname, tablename, policyname;
```

预期结果：四个公开视图、四个 RPC、一个 1 MB 且仅允许 PNG/JPEG/WebP 的公开 Bucket；基础比赛表没有 `anon` 公开读策略，只有产品所有者读取自己产品行的策略。
