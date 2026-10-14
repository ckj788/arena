import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports, URL, Response, Request, Buffer, AbortSignal,
    console: { warn() {}, error() {} }, process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' } },
    require(name) { assert(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
  });
  return mod.exports;
}

const policy = load('lib/server/cachePolicy.ts', { 'server-only': {} });
const site = load('lib/site.ts');
const images = load('lib/server/productImages.ts', { 'server-only': {}, 'node:crypto': { createHash }, '@/lib/site': site });
const rawImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const products = ['alpha', 'beta', 'unrelated', 'restricted'].map(id => ({
  id, title: id, url: `https://${id}.example.com`, logo: rawImage,
  screenshots: [rawImage], screenshot: rawImage, submittedAt: '2026-10-14T00:00:00Z',
  moderationStatus: id === 'restricted' ? 'restricted' : 'approved', votesCount: 0,
}));
let match = { id: 'match-one', product_a_id: 'alpha', product_b_id: 'beta', votes_a: 0, votes_b: 0, round_number: 4 };
const row = object => Object.fromEntries(Object.entries(object).map(([key, value]) => ['shipandbattle_' + ({ moderationStatus: 'moderation_status', votesCount: 'votes_count', submittedAt: 'submitted_at' }[key] || key), value]));
const fromDbProduct = record => Object.fromEntries(Object.entries(record).map(([key, value]) => {
  const field = key.replace('shipandbattle_', '');
  return [{ moderation_status: 'moderationStatus', votes_count: 'votesCount', submitted_at: 'submittedAt' }[field] || field, value];
}));
const queryReads = [];
let queryError = null;
const supabase = {
  from(table) {
    const filters = [];
    let ids, alternatives;
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; }, abortSignal() { return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      in(field, values) { ids = [field, values]; return query; },
      or(value) { alternatives = value; return query; },
      async run(single) {
        queryReads.push({ table, filtered: filters.length > 0 || Boolean(ids) });
        let data = table === 'products' ? products.map(row) : table === 'matches' ? [row(match)] : [];
        for (const [field, value] of filters) data = data.filter(item => item[field] === value);
        if (ids) data = data.filter(item => ids[1].includes(item[ids[0]]));
        if (alternatives && !alternatives.includes('alpha') && !alternatives.includes('beta')) data = [];
        return { data: single ? data[0] || null : data, error: queryError };
      },
      maybeSingle() { return query.run(true); },
      then(resolve, reject) { return query.run(false).then(resolve, reject); },
    };
    return query;
  },
};
const cells = new Map();
const expired = [], paths = [], settings = [];
const nextCache = {
  unstable_cache(fn, keys, options) {
    settings.push(options);
    return async (...args) => {
      const key = JSON.stringify([keys, args]);
      if (cells.has(key)) return cells.get(key).value;
      const value = await fn(...args);
      cells.set(key, { value, tags: options.tags });
      return value;
    };
  },
  revalidateTag(tag, profile) {
    assert.equal(profile.expire, 0, 'Mutations must expire data before the next read');
    expired.push(tag);
    for (const [key, entry] of cells) if (entry.tags.includes(tag)) cells.delete(key);
  },
  revalidatePath(path) { paths.push(path); },
};
const mutations = load('lib/server/cache.ts', { 'server-only': {}, 'next/cache': nextCache, './cachePolicy': policy });
const db = { DB_PREFIX: 'shipandbattle_', publicArenaTable: table => table, supabase };
const data = load('lib/server/publicSeoData.ts', {
  'server-only': {}, react: { cache: fn => fn }, 'next/cache': nextCache,
  '@/lib/arenaStore': { fromDbProduct, fetchCloudProducts: async () => [] }, '@/lib/mockData': { SEED_PRODUCTS: [] },
  '@/lib/supabaseClient': db, '@/lib/productSafety': { isVisibleProduct: product => product.moderationStatus !== 'restricted' },
  './cachePolicy': policy, './productImages': images,
});
let bracketReads = 0, championReads = 0;
const arena = load('lib/server/arenaPageData.ts', {
  'server-only': {}, react: { cache: fn => fn }, 'next/cache': nextCache,
  '@/lib/server/publicSeoData': data, './cachePolicy': policy,
  '@/lib/arenaStore': {
    fetchCloudBracket: async () => { bracketReads++; return { votesA: match.votes_a }; },
    fetchCloudPastChampions: async products => { championReads++; return [products[0]]; },
  },
});

const before = await data.getPublicProducts();
assert.equal(before.length, 3);
assert(!JSON.stringify(before).includes('data:image/'));
const beforeBytes = Buffer.byteLength(JSON.stringify(products));
console.log(`Fixture public image payload: ${beforeBytes} -> ${Buffer.byteLength(JSON.stringify(before))} bytes (tiny 1px image fixture)`);
const a = await data.getProductSeoData('ALPHA');
await data.getProductSeoData('beta');
const unrelated = await data.getProductSeoData('unrelated');
await data.getVersusSeoData('alpha-vs-beta');
await data.getVersusSeoData('beta-vs-alpha');
await arena.getArenaPageData();
const catalogueReads = () => queryReads.filter(item => item.table === 'products' && !item.filtered).length;
const count = catalogueReads();
products[0].votesCount = 7;
match.votes_a = 7;
mutations.invalidateArenaVote('alpha', 'beta');
assert(!expired.includes(policy.CATALOGUE_TAG), 'A vote must not invalidate the catalogue');
assert(!expired.includes(policy.CHAMPIONS_TAG), 'A vote must not invalidate champions');
assert.equal(paths.length, 0, 'A vote must not invalidate homepage or editorial paths');
assert.equal((await data.getProductSeoData('alpha')).product.votesCount, 7);
assert.equal(a.product.votesCount, 0, 'The original snapshot should remain unchanged');
assert.equal((await data.getVersusSeoData('alpha-vs-beta')).match.votesA, 7);
assert.equal((await data.getVersusSeoData('beta-vs-alpha')).match.votesA, 7);
assert.equal(await data.getProductSeoData('unrelated'), unrelated);
await arena.getArenaPageData();
assert.equal(bracketReads, 2);
assert.equal(championReads, 1);
assert.equal(catalogueReads(), count);
mutations.invalidateArenaState();
await arena.getArenaPageData();
assert.equal(bracketReads, 3);
assert.equal(championReads, 2);
assert(!paths.some(path => path.startsWith('/resources')));

assert.equal(await data.getProductSeoData('new-product'), null);
products.push({ ...products[0], id: 'new-product', title: 'New product' });
mutations.invalidateProductCatalogue('new-product');
assert((await data.getPublicProducts()).some(product => product.id === 'new-product'));
assert.equal((await data.getProductSeoData('new-product')).product.id, 'new-product');
products[0].moderationStatus = 'restricted';
mutations.invalidateProductModeration('alpha');
assert.equal(await data.getProductSeoData('alpha'), null);
assert.equal(await data.getVersusSeoData('alpha-vs-beta'), null);
assert(!(await data.getPublicProducts()).some(product => product.id === 'alpha'));
assert(!paths.includes('/'), 'Moderation must not purge the root layout');

const imageRoute = load('app/product-images/[id]/route.ts', { '@/lib/supabaseClient': db, '@/lib/server/productImages': images });
const publicImage = images.withPublicImageUrls(products[1]);
for (const url of [publicImage.logo, publicImage.screenshot, ...publicImage.screenshots]) {
  const response = await imageRoute.GET(new Request(`https://local.test${url}`), { params: Promise.resolve({ id: 'beta' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), images.legacyRasterImage(rawImage).bytes);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.match(response.headers.get('cache-control'), /s-maxage=86400/);
}
assert.equal((await imageRoute.GET(new Request(`https://local.test${publicImage.logo.replace(/v=.*/, 'v=0000000000000000')}`), { params: Promise.resolve({ id: 'beta' }) })).status, 404);
assert.equal((await imageRoute.GET(new Request(`https://local.test${images.withPublicImageUrls(products[0]).logo}`), { params: Promise.resolve({ id: 'alpha' }) })).status, 404);
queryError = { message: 'Outage' };
const outage = await imageRoute.GET(new Request(`https://local.test${publicImage.logo}`), { params: Promise.resolve({ id: 'beta' }) });
assert.equal(outage.status, 503);
assert.equal(outage.headers.get('cache-control'), 'no-store');
queryError = null;
assert.equal(images.legacyRasterImage('data:image/svg+xml;base64,PHN2Zz4='), null);
assert(settings.every(setting => setting.revalidate >= 300));

let authorized = false, rpcCalls = 0, rpcError = null, voteTargets;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const vote = load('app/api/arena/vote/route.ts', {
  'next/server': { NextResponse: Response }, '@/lib/supabaseClient': db,
  '@/lib/server/cache': { invalidateArenaVote: (...targets) => { voteTargets = targets; } },
  '@/lib/server/auth': {
    HttpError, readJsonRequest: request => request.json(),
    authenticateRequest: async () => {
      if (!authorized) throw new HttpError(401, 'Unauthorized');
      return { user: { id: 'fixture-user' }, client: { ...supabase, rpc: async () => { rpcCalls++; return { data: { votes_a: 8, votes_b: 0 }, error: rpcError }; } } };
    }, jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
  },
});
const request = () => new Request('https://local.test/api/arena/vote', {
  method: 'POST', body: JSON.stringify({ matchId: 'match-one', votedProductId: 'alpha', winnerFeedback: 'Clear useful workflow', loserFeedback: 'Improve onboarding steps', productBId: 'spoofed' }),
});
assert.equal((await vote.POST(request())).status, 401);
assert.equal(rpcCalls, 0);
authorized = true;
assert.equal((await vote.POST(request())).status, 200);
assert.deepEqual(voteTargets, ['alpha', 'beta']);
voteTargets = null; rpcError = { code: '23505', message: 'already voted' };
assert.equal((await vote.POST(request())).status, 409);
assert.equal(voteTargets, null);
console.log('PASS: scoped vote/round/catalogue/moderation tags, fresh vote totals, new-product cached-404 recovery, image bytes/version/visibility/outage, authenticated vote targets and duplicate-vote rejection. All database operations are in memory.');
