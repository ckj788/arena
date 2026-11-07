// Ephemeral PostgreSQL and real product mapping. No remote data or mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

function load(file, mocks) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: loaded, exports: loaded.exports, URL, Date, require: name => { assert(name in mocks, name); return mocks[name]; } });
  return loaded.exports;
}
const store = load('lib/arenaStore.ts', { './mockData': {}, './productTaxonomy': {}, './supabaseClient': { DB_PREFIX: 'shipandbattle_' }, './timeHelpers': {}, './discoveryRanking': {} });
const admin = load('lib/server/arenaAdmin.ts', { 'server-only': {}, 'node:crypto': { randomUUID }, '@supabase/supabase-js': {}, '@/lib/arenaStore': store,
  '@/lib/mockData': {}, '@/lib/supabaseClient': { DB_PREFIX: 'shipandbattle_' }, '@/lib/timeHelpers': {}, './auth': {}, '@/lib/productSafety': {} });
const db = new PGlite();
const owner = randomUUID(), other = randomUUID();
const input = { title: 'Published product', tagline: 'A complete product profile from a paid service', url: 'https://published.example', description: 'A'.repeat(100),
  makerName: 'Maker', makerTwitter: '@maker', logo: '🚀', screenshot: '', screenshots: [], pricingModel: 'unspecified', platforms: [] };
const profile = (url = input.url) => store.toDbProduct(admin.buildProductForUser({ id: owner }, { ...input, url }));
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.shipandbattle_products (
      shipandbattle_id text PRIMARY KEY, shipandbattle_title text NOT NULL, shipandbattle_tagline text,
      shipandbattle_url text NOT NULL, shipandbattle_maker_name text, shipandbattle_maker_twitter text,
      shipandbattle_maker_avatar text, shipandbattle_logo text, shipandbattle_screenshot text,
      shipandbattle_screenshots text[], shipandbattle_submitted_at timestamptz, shipandbattle_queue_status text,
      shipandbattle_votes_count integer, shipandbattle_creator_uid uuid REFERENCES auth.users(id),
      shipandbattle_creator_username text, shipandbattle_arena_enqueued boolean,
      shipandbattle_description text, shipandbattle_category text, shipandbattle_pricing_model text,
      shipandbattle_pricing_details jsonb, shipandbattle_platforms text[], shipandbattle_target_audience text,
      shipandbattle_maker_story text, shipandbattle_feedback_request text, shipandbattle_published_at timestamptz,
      shipandbattle_updated_at timestamptz, shipandbattle_qualified_impressions integer,
      shipandbattle_exposure_status text, shipandbattle_moderation_status text, shipandbattle_link_trust text
    );`);
  await db.query('INSERT INTO auth.users VALUES ($1),($2)', [owner, other]);
  const safety = fs.readFileSync('lib/migrations/20260919_product_safety.sql', 'utf8');
  await db.exec(safety.slice(0, safety.indexOf('CREATE TABLE IF NOT EXISTS public.shipandbattle_product_reports')) + 'COMMIT;');
  for (const file of ['20261027_launch_payments.sql', '20261031_confirmation_emails.sql', '20261104_paid_only_launch_orders.sql', '20261108_paid_product_profiles.sql', '20261108_paid_product_profiles.sql']) {
    await db.exec(fs.readFileSync(`lib/migrations/${file}`, 'utf8'));
  }
  async function order(userId = owner, status = 'paid') {
    const id = randomUUID();
    await db.query("INSERT INTO shipandbattle_launch_orders(id,user_id,request_id,input_hash,plan,amount_total,currency,livemode,status) VALUES($1,$2,$3,'hash','starter',9900,'usd',false,$4)", [id, userId, randomUUID(), status]);
    return id;
  }
  const submit = (id, userId = owner, snapshot = input, details = { email: 'fixture@example.invalid' }, row = profile(), mode = false) =>
    db.query('SELECT shipandbattle_submit_launch_product($1,$2,$3,$4,$5,$6) AS id', [id, userId, mode, snapshot, details, row]);
  const id = await order();
  await assert.rejects(submit(id, other), error => error.code === 'P0002');
  await assert.rejects(submit(id, owner, input, {}, profile(), true), error => error.code === 'P0002');
  await assert.rejects(submit(await order(owner, 'pending')), error => error.code === 'P0002');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(submit(id), error => error.code === '42501');
  await db.exec('RESET ROLE');
  const published = (await submit(id)).rows[0].id;
  assert.equal(published, 'published');
  assert.equal((await submit(id)).rows[0].id, published);
  const product = (await db.query('SELECT * FROM shipandbattle_products WHERE shipandbattle_id=$1', [published])).rows[0];
  assert.equal(product.shipandbattle_creator_uid, owner);
  assert.equal(product.shipandbattle_moderation_status, 'unreviewed');
  assert.equal(product.shipandbattle_link_trust, 'ugc');
  assert.equal(product.shipandbattle_arena_enqueued, false);
  assert.equal((await db.query('SELECT product_id FROM shipandbattle_launch_orders WHERE id=$1', [id])).rows[0].product_id, published);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM shipandbattle_confirmation_emails WHERE order_id=$1', [id])).rows[0].n, 1);
  const again = await order();
  assert.equal((await submit(again, owner, { ...input, url: 'https://www.published.example/resources' }, undefined, profile('https://www.published.example/resources'))).rows[0].id, published);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM shipandbattle_products')).rows[0].n, 1);
  await assert.rejects(submit(await order(other), other, input, undefined, { ...profile(), shipandbattle_creator_uid: other }), error => error.code === '42501');
  // Email trigger failure must roll back both publication and order completion.
  const rollback = await order();
  await assert.rejects(submit(rollback, owner, { ...input, url: 'https://rollback.example' }, {}, profile('https://rollback.example')), error => error.code === '23502');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM shipandbattle_products WHERE shipandbattle_id='rollback'")).rows[0].n, 0);
  assert.equal((await db.query('SELECT details_submitted_at FROM shipandbattle_launch_orders WHERE id=$1', [rollback])).rows[0].details_submitted_at, null);
  // Existing slugs for another domain get a new stable profile URL.
  const collision = await order();
  const collisionId = (await submit(collision, owner, { ...input, url: 'https://published.other' }, undefined, profile('https://published.other'))).rows[0].id;
  assert(collisionId.startsWith('published-'));
  console.log('PASS: shared real product mapping, atomic publication/order/email, private paid-only RPC, repeat submission, owned-domain reuse, foreign ownership denial, slug collisions and rollback.');
} finally { await db.close(); }
