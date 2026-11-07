// Isolated PostgreSQL runtime; never loads .env or contacts Supabase.
// node scripts/verify-launch-rate-limits.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
  `);
  const base = fs.readFileSync('lib/migrations/20260822_production_ready.sql', 'utf8');
  await db.exec(base.slice(base.indexOf('CREATE TABLE IF NOT EXISTS public.shipandbattle_rate_limits ('), base.indexOf('CREATE OR REPLACE FUNCTION public.shipandbattle_consume_rate_limit(')));
  const profile = fs.readFileSync('lib/migrations/20260903_product_profiles.sql', 'utf8');
  const routine = profile.slice(profile.indexOf('CREATE OR REPLACE FUNCTION public.shipandbattle_consume_rate_limit('), profile.indexOf('CREATE TABLE IF NOT EXISTS public.shipandbattle_product_exposures'));
  await db.exec(routine);
  const oldDefinition = (await db.query("SELECT pg_get_functiondef('public.shipandbattle_consume_rate_limit(text)'::regprocedure) AS definition")).rows[0].definition;

  const migration = fs.readFileSync('lib/migrations/20261030_launch_rate_limits.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Re-running must preserve counters and permissions.
  assert.equal((await db.query("SELECT pg_get_functiondef('public.shipandbattle_consume_rate_limit(text)'::regprocedure) AS definition")).rows[0].definition, oldDefinition);

  await db.exec('SET ROLE anon');
  await assert.rejects(db.query("SELECT public.shipandbattle_consume_launch_rate_limit('checkout')"), e => e.code === '42501');
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await assert.rejects(db.query("SELECT public.shipandbattle_consume_launch_rate_limit('checkout')"), e => e.code === '28000');
  await assert.rejects(db.query('SELECT * FROM public.shipandbattle_rate_limits'), e => e.code === '42501');

  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-4000-8000-000000000001']);
  for (let n = 0; n < 3; n++) await db.query("SELECT public.shipandbattle_consume_rate_limit('product_submit')");
  await assert.rejects(db.query("SELECT public.shipandbattle_consume_rate_limit('product_submit')"), e => e.code === 'P0001');
  for (const action of ['checkout', 'launch_details']) {
    for (let n = 0; n < 20; n++) await db.query('SELECT public.shipandbattle_consume_launch_rate_limit($1)', [action]);
    await assert.rejects(db.query('SELECT public.shipandbattle_consume_launch_rate_limit($1)', [action]), e => e.code === 'P0001' && e.message === 'launch rate limit exceeded');
  }
  await assert.rejects(db.query("SELECT public.shipandbattle_consume_launch_rate_limit('product_submit')"), e => e.code === '22023');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-4000-8000-000000000002']);
  await db.query("SELECT public.shipandbattle_consume_launch_rate_limit('checkout')");
  await db.exec('RESET ROLE');
  const counters = (await db.query('SELECT shipandbattle_user_id AS owner, shipandbattle_action AS action, shipandbattle_request_count AS count FROM public.shipandbattle_rate_limits ORDER BY owner, action')).rows;
  assert.deepEqual(counters.map(({ action, count }) => [action, count]), [['checkout', 20], ['launch_details', 20], ['product_submit', 3], ['checkout', 1]]);
  console.log('PASS: actual PostgreSQL migration runs twice, keeps product quota at 3/day, isolates checkout/details at 20/hour per account, rejects the 21st request, requires authentication, denies direct table access and preserves the existing limiter. Local ephemeral database only.');
} finally {
  await db.close();
}
