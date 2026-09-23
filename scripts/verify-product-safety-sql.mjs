import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Isolated PostgreSQL WASM database. No network, credentials or real data used.
// PGLITE_MODULE may point to a temporary npm-cache installation.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const oldSql = fs.readFileSync('lib/migrations/20260903_product_profiles.sql', 'utf8');
const viewFields = oldSql.match(/CREATE OR REPLACE VIEW public.shipandbattle_public_products[\s\S]*?SELECT([\s\S]*?)FROM public.shipandbattle_products/)[1].trim().split(',').map(s => s.trim());
const timestamp = new Set(['submitted_at','published_at','updated_at','last_exposed_at','arena_enqueued_at','discovery_boost_until']);
const fields = viewFields.map(field => {
  const short = field.replace('shipandbattle_', '');
  const type = short === 'id' ? 'text PRIMARY KEY' : timestamp.has(short) ? 'timestamptz DEFAULT now()' : short === 'arena_enqueued' ? 'boolean DEFAULT false' : ['votes_count','qualified_impressions'].includes(short) ? 'integer DEFAULT 0' : short === 'platforms' ? "text[] DEFAULT '{}'" : short === 'title' ? 'varchar(80)' : 'text';
  return `${field} ${type}`;
});
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.shipandbattle_products(${fields.join(',')},shipandbattle_creator_uid uuid);
ALTER TABLE public.shipandbattle_products ENABLE ROW LEVEL SECURITY;
CREATE VIEW public.shipandbattle_public_products AS SELECT ${viewFields.join(',')} FROM public.shipandbattle_products;
INSERT INTO public.shipandbattle_products(shipandbattle_id,shipandbattle_title,shipandbattle_url) VALUES ('old','Original','https://www.example.com/one'),('legacy-duplicate','Legacy','http://EXAMPLE.com/two');`);
const migration = fs.readFileSync('lib/migrations/20260919_product_safety.sql','utf8');
await db.exec(migration);
const one = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
assert.equal((await one('SELECT count(*)::int n FROM shipandbattle_products')).n, 2);
assert.equal((await one("SELECT shipandbattle_link_trust v FROM shipandbattle_products WHERE shipandbattle_id='old'")).v, 'trusted');
await db.exec("UPDATE shipandbattle_products SET shipandbattle_description='Editable legacy product' WHERE shipandbattle_id='legacy-duplicate'");
await assert.rejects(db.exec("INSERT INTO shipandbattle_products(shipandbattle_id,shipandbattle_url) VALUES ('duplicate','https://example.com/new')"), e => e.code === '23505');
await db.exec("UPDATE shipandbattle_products SET shipandbattle_url='https://moved.example.org' WHERE shipandbattle_id='old'");
await assert.rejects(db.exec("INSERT INTO shipandbattle_products(shipandbattle_id,shipandbattle_url) VALUES ('duplicate','https://example.com/new')"), e => e.code === '23505');
await db.exec("INSERT INTO shipandbattle_products(shipandbattle_id,shipandbattle_title,shipandbattle_url,shipandbattle_screenshot,shipandbattle_arena_enqueued) VALUES ('new','New product','https://new.example.com','https://storage.example.com/screenshot.jpg',true)");
assert.equal((await one("SELECT shipandbattle_moderation_status v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'unreviewed');
const reporter = '00000000-0000-4000-8000-000000000001';
await db.query('SELECT shipandbattle_report_product($1,$2,$3,$4)', ['new',reporter,'spam','Test report']);
await db.query('SELECT shipandbattle_report_product($1,$2,$3,$4)', ['new',reporter,'spam','Duplicate click']);
assert.equal((await one('SELECT count(*)::int n FROM shipandbattle_product_reports')).n, 1);
assert.equal((await one("SELECT shipandbattle_moderation_status v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'unreviewed');
await db.query('SELECT shipandbattle_moderate_product($1,$2,$3,$4)', ['new',reporter,'restricted','Confirmed spam']);
const publicRow = await one("SELECT * FROM shipandbattle_public_products WHERE shipandbattle_id='new'");
assert.equal(publicRow.shipandbattle_title, 'Unavailable product');
assert.equal(publicRow.shipandbattle_url, '');
assert.equal(publicRow.shipandbattle_arena_enqueued, false);
assert(!publicRow.shipandbattle_screenshot);
assert(!('shipandbattle_creator_uid' in publicRow));
assert.equal((await one("SELECT shipandbattle_url v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'https://new.example.com');
await db.exec("UPDATE shipandbattle_products SET shipandbattle_title='Owner edited' WHERE shipandbattle_id='new'");
assert.equal((await one("SELECT shipandbattle_moderation_status v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'restricted');
await db.query('SELECT shipandbattle_moderate_product($1,$2,$3,$4)', ['new',reporter,'approved','Checked website']);
assert.equal((await one("SELECT shipandbattle_link_trust v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'trusted');
await db.exec("UPDATE shipandbattle_products SET shipandbattle_url='https://new.example.com/changed' WHERE shipandbattle_id='new'");
assert.equal((await one("SELECT shipandbattle_link_trust v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'ugc');
// Repeat migration does not re-approve products or duplicate reports.
await db.exec(migration);
assert.equal((await one("SELECT shipandbattle_moderation_status v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, 'unreviewed');
for (let i=0;i<10;i++) {
  await db.query('INSERT INTO shipandbattle_products(shipandbattle_id,shipandbattle_url) VALUES($1,$2)', [`limit-${i}`,`https://limit-${i}.example.com`]);
  if (i<9) await db.query('SELECT shipandbattle_report_product($1,$2,$3,$4)', [`limit-${i}`,reporter,'other','']);
}
await assert.rejects(db.query('SELECT shipandbattle_report_product($1,$2,$3,$4)', ['limit-9',reporter,'spam','']), e => e.code === 'P0001');
for (const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  await db.query('SELECT * FROM shipandbattle_public_products LIMIT 1');
  await assert.rejects(db.query('SELECT * FROM shipandbattle_product_reports'), e => e.code === '42501');
  await assert.rejects(db.query('SELECT * FROM shipandbattle_moderation_log'), e => e.code === '42501');
  await assert.rejects(db.query('SELECT shipandbattle_moderate_product($1,$2,$3,$4)', ['new',reporter,'approved','Unauthorized']), e => e.code === '42501');
  await assert.rejects(db.query('SELECT shipandbattle_report_product($1,$2,$3,$4)', ['new',reporter,'spam','Unauthorized']), e => e.code === '42501');
  await db.exec('RESET ROLE');
}
for (const [url, expected] of [['https://WWW.Example.com.:443/a','example.com'],['https://a.vercel.app','a.vercel.app'],['https://github.com/Owner/Repo/issues','github.com/owner/repo'],['https://github.com/Other/Repo','github.com/other/repo']]) {
  assert.equal((await one('SELECT shipandbattle_product_domain_key($1) v',[url])).v, expected);
}
const verification = await db.query(fs.readFileSync('lib/migrations/20260919_product_safety_verify.sql','utf8'));
for (const check of verification.rows) {
  if (check.check_name.startsWith('missing_')) assert.deepEqual(check.result, []);
  else if (check.check_name !== 'product_status_counts') assert.equal(check.result, true, check.check_name);
}
const gallerySql = fs.readFileSync('lib/migrations/20260919_product_gallery.sql', 'utf8');
await db.exec(`CREATE FUNCTION public.shipandbattle_consume_rate_limit(p_action text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE v_window interval; v_limit integer; BEGIN CASE p_action WHEN 'logo' THEN v_window := INTERVAL '1 day'; v_limit := 10; ELSE v_limit:=3; END CASE; END $$;`);
await db.exec(gallerySql);
assert.match((await one("SELECT prosrc v FROM pg_proc WHERE proname='shipandbattle_consume_rate_limit'")).v,/v_limit := 30;/);
const beforeGallery = await one("SELECT shipandbattle_screenshots v FROM shipandbattle_products WHERE shipandbattle_id='new'");
assert.equal(beforeGallery.v.length, 1, 'legacy screenshot backfilled');
await db.exec(gallerySql);
assert.deepEqual((await one("SELECT shipandbattle_screenshots v FROM shipandbattle_products WHERE shipandbattle_id='new'")).v, beforeGallery.v);
await db.query("UPDATE shipandbattle_products SET shipandbattle_screenshots=$1 WHERE shipandbattle_id='old'", [['https://images.example.com/one.jpg','https://images.example.com/two.jpg']]);
assert.equal((await one("SELECT shipandbattle_screenshot v FROM shipandbattle_products WHERE shipandbattle_id='old'")).v, 'https://images.example.com/one.jpg');
await db.query('SELECT shipandbattle_moderate_product($1,$2,$3,$4)', ['old',reporter,'approved','Gallery approved']);
await db.query("UPDATE shipandbattle_products SET shipandbattle_screenshots=$1 WHERE shipandbattle_id='old'", [['https://images.example.com/one.jpg','https://images.example.com/three.jpg']]);
assert.equal((await one("SELECT shipandbattle_link_trust v FROM shipandbattle_products WHERE shipandbattle_id='old'")).v, 'ugc', 'secondary image edits reset trust');
await assert.rejects(db.query("UPDATE shipandbattle_products SET shipandbattle_screenshots=$1 WHERE shipandbattle_id='old'", [Array(6).fill('https://images.example.com/x.jpg')]), e => e.code === '23514');
await db.query('SELECT shipandbattle_moderate_product($1,$2,$3,$4)', ['old',reporter,'restricted','Gallery restricted']);
assert.deepEqual((await one("SELECT shipandbattle_screenshots v FROM shipandbattle_public_products WHERE shipandbattle_id='old'")).v, []);
await db.exec("UPDATE shipandbattle_products SET shipandbattle_screenshots='{}' WHERE shipandbattle_id='old'");
assert.equal((await one("SELECT shipandbattle_screenshot v FROM shipandbattle_products WHERE shipandbattle_id='old'")).v, null, 'clear does not resurrect legacy image');
// Retirement of build-time metadata preserves safety, gallery, rows and triggers.
await db.exec(`CREATE FUNCTION public.shipandbattle_touch_product_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.shipandbattle_updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER shipandbattle_products_touch_updated_at BEFORE UPDATE OF shipandbattle_title, shipandbattle_ship_timeframe, shipandbattle_url ON shipandbattle_products FOR EACH ROW EXECUTE FUNCTION shipandbattle_touch_product_updated_at();`);
const countBefore = (await one('SELECT count(*)::int n FROM shipandbattle_products')).n;
for (const name of ['20260923_timeframe_prepare.sql','20260923_remove_timeframe.sql','20260923_remove_timeframe.sql']) {
  await db.exec(fs.readFileSync(`lib/migrations/${name}`,'utf8'));
}
assert.equal((await one('SELECT count(*)::int n FROM shipandbattle_products')).n, countBefore);
assert.equal((await one("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND column_name='shipandbattle_ship_timeframe'")).n, 0);
assert.deepEqual((await one("SELECT shipandbattle_screenshots v FROM shipandbattle_public_products WHERE shipandbattle_id='old'")).v, []);
await db.exec("UPDATE shipandbattle_products SET shipandbattle_title='Still editable' WHERE shipandbattle_id='new'");
await db.exec('SET ROLE anon');
await db.query('SELECT * FROM shipandbattle_public_products');
await assert.rejects(db.query('SELECT * FROM shipandbattle_product_reports'), e => e.code === '42501');
await db.exec('RESET ROLE');
await db.close();
console.log('PASS: migration runs twice, preserves legacy records, rejects duplicate domains, resets edited link trust, keeps restricted match participants as tombstones, enforces report limits and private admin privileges. No production database accessed.');
