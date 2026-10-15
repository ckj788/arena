import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// All records, authentication and writes are isolated in memory.
function load(file, mocks = {}) {
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: testModule, exports: testModule.exports, URL, Response, Request, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' } },
    require(name) { assert(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
  });
  return testModule.exports;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const prefix = 'shipandbattle_';
const safety = load('lib/productSafety.ts');
const aliases = [
  'https://baidu.com', 'https://www.baidu.com/', 'http://BAIDU.COM/a?ref=launch#top',
  'https://WWW.Baidu.com.:443/pricing', 'https://baidu.com:8443/another-page',
  ' https://www.baidu.com ', 'https://HTTPS://www.baidu.com/',
  'https://baidu.com/page', 'https://www.baidu.com/resource', 'https://baidu.com/resources/',
  'https://www.baidu.com/resources/launch/guides/first?utm_source=directory#details',
];
for (const url of aliases) assert.equal(safety.productDomainKey(url), 'baidu.com', url);
for (const url of ['https://baidu.net', 'https://notbaidu.com', 'https://baidu.com.evil.example', 'https://app.baidu.com']) {
  assert.notEqual(safety.productDomainKey(url), 'baidu.com', url);
}
assert.notEqual(safety.productDomainKey('https://a.vercel.app'), safety.productDomainKey('https://b.vercel.app'));
assert.equal(safety.productDomainKey('https://www.github.com/Owner/Repo/issues'), 'github.com/owner/repo');
assert.notEqual(safety.productDomainKey('https://github.com/Owner/First'), safety.productDomainKey('https://github.com/Owner/Second'));
assert.notEqual(safety.productDomainKey('https://gitlab.com/Owner/First'), safety.productDomainKey('https://gitlab.com/Owner/Second'));

const original = { id: 'original', url: 'https://baidu.com/' };
const legacy = { id: 'legacy', url: 'http://www.baidu.com/old' };
for (const url of aliases) assert.equal(safety.findProductWithSameDomain([original], url)?.id, original.id);
for (const url of aliases) {
  assert.equal(safety.findProductWithSameDomain([{ id: 'submitted-subpage', url: 'https://www.baidu.com/resources/original' }], url)?.id, 'submitted-subpage', 'a subpage submitted first also reserves the root website');
}
assert.equal(safety.findProductWithSameDomain([original], 'https://new.example.com'), undefined);
assert.equal(safety.findProductWithSameDomain([original], ''), undefined);
assert.equal(safety.findProductWithSameDomain([original, legacy], 'https://www.baidu.com/new', legacy), undefined, 'unchanged legacy domain remains editable');
assert.equal(safety.findProductWithSameDomain([original, legacy], original.url, { id: 'other', url: 'https://other.example.com' })?.id, original.id);

const site = load('lib/site.ts');
const taxonomy = load('lib/productTaxonomy.ts');
const pricing = load('lib/productPricing.ts', { './site': site });
const input = load('lib/server/productInput.ts', {
  'server-only': {}, '@/lib/server/auth': { HttpError }, '@/lib/site': site,
  '@/lib/productTaxonomy': taxonomy, '@/lib/productPricing': pricing,
});
const store = load('lib/arenaStore.ts', {
  './productTaxonomy': taxonomy, './supabaseClient': { supabase: null, DB_PREFIX: prefix },
  './timeHelpers': {}, './discoveryRanking': {},
});
const user = { id: 'fixture-owner', user_metadata: { user_name: 'fixture' } };
const base = input.parseProductInput({
  title: 'Domain fixture', tagline: 'An isolated duplicate submission test.', url: original.url,
  makerName: 'Maker', makerTwitter: '@maker', logo: '🚀', description: 'A'.repeat(100),
});
const row = (id, url, owner = user.id) => ({
  [prefix + 'id']: id, [prefix + 'url']: url, [prefix + 'creator_uid']: owner,
  [prefix + 'domain_key']: safety.productDomainKey(url),
});
let rows = [], inserts = 0, updates = 0, race = false, lookupError = null;
const queries = [];
function from(table) {
  assert.equal(table, prefix + 'products');
  const filters = [];
  let limit = Infinity, write, operation;
  const matching = () => rows.filter(record => filters.every(([key, value, equal]) => (record[key] === value) === equal)).slice(0, limit);
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value, true]); return this; },
    neq(key, value) { filters.push([key, value, false]); return this; },
    limit(value) { limit = value; return this; },
    then(resolve, reject) { queries.push(filters); return Promise.resolve({ data: matching(), error: lookupError }).then(resolve, reject); },
    async maybeSingle() { return { data: matching()[0] || null, error: null }; },
    insert(value) { operation = 'insert'; write = value; inserts++; return this; },
    update(value) { operation = 'update'; write = value; updates++; return this; },
    async single() {
      if (race) {
        race = false;
        rows.push(row('concurrent-product', base.url));
        return { data: null, error: { code: '23505', message: 'Duplicate product domain' } };
      }
      if (operation === 'insert') rows.push({ ...write, [prefix + 'domain_key']: safety.productDomainKey(write[prefix + 'url']) });
      if (operation === 'update') Object.assign(matching()[0], write);
      return { data: operation === 'insert' ? rows.at(-1) : matching()[0], error: null };
    },
  };
  return query;
}
const admin = load('lib/server/arenaAdmin.ts', {
  'server-only': {}, 'node:crypto': { randomUUID }, '@/lib/arenaStore': store,
  '@/lib/supabaseClient': { DB_PREFIX: prefix }, '@/lib/timeHelpers': {},
  './auth': { HttpError, getAdminClient: () => ({ from }) }, '@/lib/productSafety': safety,
});
const duplicate = error => error.status === 409 && error.message.includes(safety.DUPLICATE_PRODUCT_MESSAGE);

rows = [row(original.id, 'https://www.baidu.com/resources/original')];
for (const submitter of [user, { id: 'another-fixture-owner', user_metadata: {} }]) {
  for (const url of aliases) {
    await assert.rejects(admin.createProductForUser(submitter, input.parseProductInput({ ...base, url })), error => duplicate(error) && error.message.includes('/products/original'));
  }
}
assert.equal(inserts, 0, 'duplicates rejected before insertion');
assert(queries.every(filters => filters.some(([key, value]) => key === prefix + 'domain_key' && value === 'baidu.com')));
assert(queries.every(filters => filters.every(([key]) => key !== prefix + 'creator_uid')), 'domain uniqueness applies across accounts');

// Existing profiles and grandfathered historical duplicates are not blocked.
rows.push({ ...row(legacy.id, legacy.url), [prefix + 'domain_key']: null });
await admin.updateOwnedProduct(user, legacy.id, { ...base, url: 'https://WWW.Baidu.com/new' });
assert.equal(updates, 1);
rows.push(row('other', 'https://other.example.com'));
await assert.rejects(admin.updateOwnedProduct(user, 'other', base), duplicate);
assert.equal(updates, 1, 'changing another profile to an occupied domain is blocked');
await assert.rejects(admin.updateOwnedProduct({ id: 'not-owner' }, original.id, base), error => error.status === 403);

rows = []; race = true;
await assert.rejects(admin.createProductForUser(user, base), error => duplicate(error) && error.message.includes('/products/concurrent-product'));
assert.equal(rows.length, 1, 'concurrent duplicate creates only one profile');

let authorized = false, invalidations = 0;
const route = load('app/api/arena/products/route.ts', {
  'next/server': { NextResponse: Response }, '@/lib/server/arenaAdmin': admin,
  '@/lib/server/productInput': input,
  '@/lib/server/auth': {
    authenticateRequest: async () => { if (!authorized) throw new HttpError(401, 'Unauthorized'); return { user, client: {} }; },
    consumeUserRateLimit: async () => {}, readJsonRequest: request => request.json(),
    jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
  },
  '@/lib/server/cache': { invalidateProductCatalogue: () => invalidations++ },
});
const request = body => new Request('https://local.test/api/arena/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
assert.equal((await route.POST(request(base))).status, 401);
authorized = true;
const conflict = await route.POST(request({ ...base, url: 'https://www.baidu.com/pricing' }));
assert.equal(conflict.status, 409);
assert((await conflict.json()).error.includes('/products/concurrent-product'));
assert.equal(invalidations, 0, 'rejected duplicates do not invalidate ISR caches');
rows = [];
assert.equal((await route.POST(request({ ...base, url: 'https://different.example.com' }))).status, 201);
assert.equal(invalidations, 1);
assert.equal(rows.length, 1);
console.log('PASS: domain/www/http/case/path/query/port aliases, shared-host exceptions, immediate client matching, legacy profile editing, backend 409, owner checks, concurrent conflict messages, authenticated POST, successful independent submission and no ISR invalidation on duplicates. No live database accessed.');
