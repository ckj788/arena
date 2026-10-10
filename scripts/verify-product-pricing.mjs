import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

function load(file, mocks = {}) {
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: testModule, exports: testModule.exports, URL, Response, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' } },
    require(name) { assert(name in mocks, `Unexpected import: ${name}`); return mocks[name]; },
  });
  return testModule.exports;
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const site = load('lib/site.ts');
const taxonomy = load('lib/productTaxonomy.ts');
const pricing = load('lib/productPricing.ts', { './site': site });
const input = load('lib/server/productInput.ts', { 'server-only': {}, '@/lib/server/auth': { HttpError }, '@/lib/site': site, '@/lib/productTaxonomy': taxonomy, '@/lib/productPricing': pricing });
const base = { title: 'Pricing fixture', tagline: 'An isolated product pricing test.', url: 'https://example.com', makerName: 'Maker', makerTwitter: 'maker', logo: '🚀', description: 'A'.repeat(100), pricingModel: 'paid' };
const quote = { planName: 'Pro', amount: '19.99', currency: 'USD', billingPeriod: 'month', pricingUrl: 'https://example.com/pricing' };
const parsed = input.parseProductInput({ ...base, pricingDetails: quote });
assert.equal(parsed.pricingDetails.amount, '19.99');
assert.equal(input.parseProductInput(base).pricingDetails, undefined);
assert.equal(input.parseProductInput({ ...base, pricingDetails: null }).pricingDetails, null);
assert.equal(pricing.pricingDraftValue(pricing.EMPTY_PRICING_DRAFT), null);
assert.equal(pricing.productPriceLabel(quote), 'USD 19.99 · per month');
assert.equal(pricing.productOffer(quote).priceSpecification.billingDuration, 'P1M');
assert.equal(pricing.productOffer({ ...quote, billingPeriod: 'year' }).priceSpecification.billingDuration, 'P1Y');
assert.equal(pricing.productOffer({ ...quote, billingPeriod: 'one-time' }).priceSpecification, undefined);
assert.equal(pricing.productOffer(quote).aggregateRating, undefined);
for (const model of ['free', 'freemium', 'open-source']) {
  const free = input.parseProductInput({ ...base, pricingModel: model, pricingDetails: { ...quote, amount: '0', billingPeriod: 'free' } });
  assert.equal(pricing.productOffer(free.pricingDetails).price, '0');
}
for (const currency of pricing.PRICE_CURRENCIES) assert.equal(input.parseProductInput({ ...base, pricingDetails: { ...quote, currency } }).pricingDetails.currency, currency);
assert.equal(input.parseProductInput({ ...base, pricingDetails: { ...quote, currency: ' usd ', planName: ' Pro ' } }).pricingDetails.currency, 'USD');
for (const bad of [[], {}, { ...quote, amount: 19.99 }, ...['-1', '1e3', '01', '$19', '19,99', 'NaN', '0.1234567'].map(amount => ({ ...quote, amount })),
  { ...quote, currency: 'BTC' }, { ...quote, planName: 'x' }, { ...quote, billingPeriod: 'trial' }, { ...quote, pricingUrl: 'http://127.0.0.1/pricing' }, { ...quote, pricingUrl: 'javascript:alert(1)' }, { ...quote, amount: '0', billingPeriod: 'free' },
]) assert.throws(() => input.parseProductInput({ ...base, pricingDetails: bad }), e => e.status === 400);
for (const model of ['free', 'contact', 'unspecified']) assert.throws(() => input.parseProductInput({ ...base, pricingModel: model, pricingDetails: quote }), e => e.status === 400);

const store = load('lib/arenaStore.ts', { './productTaxonomy': taxonomy, './supabaseClient': { supabase: null, DB_PREFIX: 'shipandbattle_' }, './timeHelpers': {}, './discoveryRanking': {} });
const product = { ...base, id: 'pricing-fixture', pricingDetails: quote, submittedAt: '2026-10-10T00:00:00Z', queueStatus: 'waiting', votesCount: 0 };
assert.equal(JSON.stringify(store.fromDbProduct(store.toDbProduct(product)).pricingDetails), JSON.stringify(quote));
assert.equal('shipandbattle_pricing_details' in store.toDbProduct({ ...product, pricingDetails: undefined }), false);
assert.equal(store.fromDbProduct({ shipandbattle_id: 'legacy' }).pricingDetails, undefined);

let written, owner = 'owner', create = false, error = null;
const query = { select() { return this; }, eq() { return this; }, neq() { return this; }, limit() { return this; },
  async maybeSingle() { return { data: create ? null : { shipandbattle_id: product.id, shipandbattle_creator_uid: owner, shipandbattle_url: base.url }, error: null }; },
  insert(value) { written = value; return this; }, update(value) { written = value; return this; },
  async single() { return { data: { shipandbattle_id: product.id, ...written }, error }; },
};
const admin = load('lib/server/arenaAdmin.ts', { 'server-only': {}, 'node:crypto': { randomUUID }, '@/lib/arenaStore': store, '@/lib/supabaseClient': { DB_PREFIX: 'shipandbattle_' }, '@/lib/timeHelpers': {}, './auth': { getAdminClient: () => ({ from: () => query }), HttpError }, '@/lib/productSafety': load('lib/productSafety.ts') });
await admin.updateOwnedProduct({ id: 'owner' }, product.id, parsed);
assert.equal(JSON.stringify(written.shipandbattle_pricing_details), JSON.stringify(quote));
await admin.updateOwnedProduct({ id: 'owner' }, product.id, input.parseProductInput({ ...base, pricingDetails: null }));
assert.equal(written.shipandbattle_pricing_details, null);
await admin.updateOwnedProduct({ id: 'owner' }, product.id, input.parseProductInput(base));
assert.equal('shipandbattle_pricing_details' in written, false);
owner = 'someone-else'; written = undefined;
await assert.rejects(() => admin.updateOwnedProduct({ id: 'owner' }, product.id, parsed), e => e.status === 403);
assert.equal(written, undefined);
owner = 'owner'; error = { code: 'PGRST204', message: 'pricing_details column is absent' };
await assert.rejects(() => admin.updateOwnedProduct({ id: 'owner' }, product.id, parsed), e => e.status === 503);
error = null; create = true;
await admin.createProductForUser({ id: 'owner', user_metadata: {} }, parsed);
assert.equal(JSON.stringify(written.shipandbattle_pricing_details), JSON.stringify(quote));

let authorized = false, calls = 0, invalidations = 0;
const mocks = { 'next/server': { NextResponse: Response }, '@/lib/server/productInput': input,
  '@/lib/server/arenaAdmin': { createProductForUser: async () => { calls++; return product; }, updateOwnedProduct: async () => { calls++; return product; } },
  '@/lib/server/auth': { HttpError, authenticateRequest: async () => { if (!authorized) throw new HttpError(401, 'Unauthorized'); return { user: { id: 'owner' }, client: {} }; }, consumeUserRateLimit: async () => {}, readJsonRequest: req => req.json(), jsonError: e => Response.json({ error: e.message }, { status: e.status || 500 }) },
  '@/lib/server/cache': { invalidateArenaPublic: () => { invalidations++; } },
};
const post = load('app/api/arena/products/route.ts', mocks);
const patch = load('app/api/arena/products/[id]/route.ts', mocks);
const request = body => ({ json: async () => body });
assert.equal((await post.POST(request(base))).status, 401);
assert.equal(calls, 0);
authorized = true;
assert.equal((await post.POST(request({ ...base, pricingDetails: {} }))).status, 400);
assert.equal(calls, 0);
assert.equal((await post.POST(request({ ...base, pricingDetails: quote }))).status, 201);
assert.equal((await patch.PATCH(request({ ...base, pricingDetails: null }), { params: Promise.resolve({ id: product.id }) })).status, 200);
assert.equal(calls, 2); assert.equal(invalidations, 2);
console.log('PASS: optional pricing, 18 currencies, explicit free quotes, invalid input, offer periods, DB mapping, create/update/clear/legacy omission, ownership, migration error, API validation and cache invalidation. All writes in memory.');
