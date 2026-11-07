import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import Stripe from 'stripe';

// Offline only: no .env.local, Supabase client, HTTP transport, or real keys.
const env = { NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_test_offline_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_offline_fixture', STRIPE_CHECKOUT_BASE_URL: 'http://localhost:3000', SUPABASE_SERVICE_ROLE_KEY: 'offline' };
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: mod, exports: mod.exports, URL, Response, Request, Buffer, console, Date, performance, process: { env },
    require(name) { assert(name in mocks, `Unexpected import ${name} in ${file}`); return mocks[name]; },
  });
  return mod.exports;
}
class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const statusIs = status => error => error.status === status;
const plans = load('lib/submissionPlans.ts');
const site = load('lib/site.ts');
const taxonomy = load('lib/productTaxonomy.ts');
const pricing = load('lib/productPricing.ts', { './site': site });
const productInput = load('lib/server/productInput.ts', { 'server-only': {}, '@/lib/server/auth': { HttpError }, '@/lib/site': site, '@/lib/productTaxonomy': taxonomy, '@/lib/productPricing': pricing });
const configuration = load('lib/server/stripe.ts', { 'server-only': {}, stripe: { default: Stripe }, undici: { fetch() { throw new Error('Offline test must not perform network requests'); } }, './auth': { HttpError } });
assert.equal(configuration.paymentConfiguration(), true);
env.STRIPE_SECRET_KEY = 'sk_live_offline_fixture';
assert.equal(configuration.paymentConfiguration(), false, 'Live keys cannot enable checkout in default test mode');
assert.throws(() => configuration.getStripe(), statusIs(503));
env.STRIPE_MODE = 'live';
assert.equal(configuration.paymentConfiguration(), true);
env.STRIPE_MODE = 'test';
env.STRIPE_SECRET_KEY = 'sk_test_offline_fixture';
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CHECKOUT_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  const previous = env[key]; env[key] = ''; assert.equal(configuration.paymentConfiguration(), false); env[key] = previous;
}
for (const origin of ['https://example.com/path', 'https://user:pass@example.com', 'http://example.com', 'invalid', 'https://example.com?url=evil']) {
  env.STRIPE_CHECKOUT_BASE_URL = origin;
  assert.throws(() => configuration.checkoutBaseUrl(), statusIs(503));
}
env.STRIPE_CHECKOUT_BASE_URL = 'http://localhost:3000';
assert.equal(configuration.checkoutBaseUrl(), env.STRIPE_CHECKOUT_BASE_URL);
env.NODE_ENV = 'production'; assert.throws(() => configuration.checkoutBaseUrl(), statusIs(503)); env.NODE_ENV = 'development';

const user = { id: randomUUID(), email: 'owner@example.com' }, otherUser = randomUUID();
const orders = new Map();
const seenEvents = new Set();
const calls = { created: [], retrieved: [], rpc: [], tables: [] };
function projectColumns(row, columns) {
  if (!columns) return row;
  return Object.fromEntries(columns.split(',').map(column => {
    const [key, path] = column.split(':');
    const [field, property] = (path || key).split(/->>?/);
    return [key, property ? row[field]?.[property] ?? null : row[field]];
  }));
}
let storeFailure = false;
let launchLimitError = null;
const db = {
  from(table) {
    calls.tables.push(table);
    let filters = [], changes, columns;
    const query = {
      select(value) { columns = value; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      is(key, value) { return this.eq(key, value); },
      order() { return this; }, limit() { return this; },
      update(value) { changes = value; return this; },
      upsert(value) {
        if (storeFailure) return this;
        const existing = [...orders.values()].find(o => o.user_id === value.user_id && o.request_id === value.request_id);
        if (!existing) { const id = randomUUID(); orders.set(id, { ...value, id, status: 'pending', stripe_session_id: null, created_at: new Date().toISOString(), paid_at: null, details_submitted_at: null }); filters.push(['id', id]); }
        else filters.push(['id', 'ignored-duplicate']);
        return this;
      },
      async single() { return this.maybeSingle(); },
      async maybeSingle() {
        if (storeFailure) return { data: null, error: { message: 'offline store failure' } };
        const match = [...orders.values()].find(o => filters.every(([k, v]) => o[k] === v));
        if (match && changes) Object.assign(match, changes);
        return { data: match ? projectColumns(match, columns) : null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          for (const order of orders.values()) if (filters.every(([k, v]) => order[k] === v)) Object.assign(order, changes);
          return { data: [...orders.values()].filter(o => filters.every(([k, v]) => o[k] === v)).map(o => projectColumns(o, columns)), error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  },
  async rpc(name, args) {
    calls.rpc.push({ name, args });
    if (name === 'shipandbattle_consume_launch_rate_limit') return { error: launchLimitError };
    if (storeFailure) return { error: { message: 'offline store failure' } };
    if (args.p_request_id && args.p_status === 'paid' && !orders.has(args.p_order_id)) {
      orders.set(args.p_order_id, { id: args.p_order_id, user_id: args.p_user_id, request_id: args.p_request_id, plan: args.p_plan, amount_total: args.p_amount, currency: args.p_currency, livemode: args.p_livemode });
    }
    const order = orders.get(args.p_order_id);
    if (!order || order.user_id !== args.p_user_id || order.plan !== args.p_plan || order.amount_total !== args.p_amount || order.currency !== args.p_currency || order.livemode !== args.p_livemode || (order.stripe_session_id && order.stripe_session_id !== args.p_session_id)) return { error: { message: 'mismatch' } };
    // Fake storage provides the RPC contract; SQL is separately checked below.
    if (seenEvents.has(args.p_event_id)) return { error: null };
    seenEvents.add(args.p_event_id);
    order.stripe_session_id = args.p_session_id;
    if (order.status !== 'paid' && !(args.p_status === 'pending' && ['failed', 'expired'].includes(order.status))) order.status = args.p_status;
    if (args.p_status === 'paid') order.paid_at ||= new Date().toISOString();
    return { error: null };
  },
};
const sessions = new Map();
const stripeMock = { checkout: { sessions: {
  async create(params, options) {
    calls.created.push({ params, options });
    if (!sessions.has(options.idempotencyKey)) sessions.set(options.idempotencyKey, { id: `cs_test_${calls.created.length}`, url: 'https://checkout.stripe.com/c/pay/fixture', status: 'open' });
    return sessions.get(options.idempotencyKey);
  },
  async retrieve(id) { calls.retrieved.push(id); return [...sessions.values()].find(s => s.id === id); },
} } };
const auth = { HttpError, getAdminClient: () => db };
env.STRIPE_PAYMENT_LINK_SIGNING_SECRET = 'offline-signing-secret-with-more-than-32-characters';
env.STRIPE_PAYMENT_LINKS = JSON.stringify({ mode: 'test', baseUrl: 'http://localhost:3000', links: Object.fromEntries(['starter','growth','pro'].map(plan => [plan, { id: `plink_${plan}`, url: `https://buy.stripe.com/test_${plan}` }])) });
const paymentLinks = load('lib/server/paymentLinks.ts', {
  'server-only': {}, 'node:crypto': { createHash, createHmac, timingSafeEqual }, '@/lib/submissionPlans': plans,
  './auth': auth, './stripe': configuration,
});
const payments = load('lib/server/launchPayments.ts', {
  'server-only': {}, 'node:crypto': { createHash }, '@/lib/supabaseClient': { DB_PREFIX: 'shipandbattle_' },
  '@/lib/submissionPlans': plans, './auth': auth, './productInput': productInput,
  './stripe': { ...configuration, getStripe: () => stripeMock },
  './paymentLinks': paymentLinks,
});
const body = { requestId: randomUUID(), plan: 'starter', amount: 1,
  product: { title: 'Offline launch test', tagline: 'An isolated payment integration fixture.', url: 'https://example.com', makerName: 'Maker', makerTwitter: '@maker', logo: '🚀', description: 'A'.repeat(100), pricingModel: 'unspecified' },
  serviceDetails: { email: 'test@example.com', history: 'none', directories: '', consent: true },
};
for (const [plan, cents] of [['starter', 9900], ['growth', 16900], ['pro', 25900]]) {
  const input = payments.parseCheckoutInput({ ...body, plan, requestId: randomUUID() });
  assert.equal(input.amount, cents, 'Client amounts never control the charge');
  await db.from('shipandbattle_launch_orders').upsert({ user_id: user.id, request_id: input.requestId, input_hash: input.hash, plan, amount_total: cents, currency: 'usd', livemode: false });
  const tablesBefore = calls.tables.length;
  const result = await payments.createLaunchCheckout(user, input);
  assert.equal(calls.tables.length - tablesBefore, 2, 'An old checkout reads its existing order and binds the session');
  const call = calls.created.at(-1);
  assert.equal(call.params.line_items[0].price_data.unit_amount, cents);
  assert.equal(call.params.mode, 'payment');
  assert.equal(call.params.allowed_payment_method_types.join(), 'card');
  assert.equal(call.options.idempotencyKey, `launch-order:${result.orderId}`);
  assert.equal(call.params.metadata.user_id, user.id);
  assert.equal(call.params.customer_email, user.email);
  assert.equal('product' in input, false, 'Checkout must not require product details');
  assert(call.params.success_url.includes('/submit/result?order='));
  const before = calls.created.length;
  assert.equal((await payments.createLaunchCheckout(user, input)).orderId, result.orderId);
  assert.equal(calls.created.length, before, 'Repeated checkout must reuse the session');
  await assert.rejects(payments.createLaunchCheckout(user, payments.parseCheckoutInput({ ...body, requestId: input.requestId, plan: plan === 'pro' ? 'starter' : 'pro' })), statusIs(409));
}
for (const changes of [{ plan: 'free' }, { plan: 'unknown' }, { requestId: 'invalid' }]) {
  assert.throws(() => payments.parseCheckoutInput({ ...body, ...changes }), statusIs(400));
}
for (const changes of [{ serviceDetails: { ...body.serviceDetails, consent: false } }, { serviceDetails: { ...body.serviceDetails, email: 'bad' } }, { serviceDetails: { ...body.serviceDetails, history: 'provided' } }, { serviceDetails: { ...body.serviceDetails, history: ['none'] } }, { product: { ...body.product, url: 'http://127.0.0.1' } }]) assert.throws(() => payments.parseLaunchDetails({ ...body, ...changes }), statusIs(400));
assert.equal(payments.parseCheckoutInput({ plan: 'starter', requestId: randomUUID() }).amount, 9900);
const firstOrder = [...orders.values()][0];
const details = payments.parseLaunchDetails(body);
await assert.rejects(payments.saveLaunchDetails(user.id, firstOrder.id, details), statusIs(403));
await assert.rejects(payments.saveLaunchDetails(otherUser, firstOrder.id, details), statusIs(404));
await assert.rejects(payments.getLaunchOrder(otherUser, firstOrder.id), statusIs(404));
assert.equal((await payments.getLaunchOrder(user.id, firstOrder.id)).id, firstOrder.id);
assert.equal('service_details' in await payments.getLaunchOrder(user.id, firstOrder.id), false, 'Receipts must not expose contact/product snapshots');
assert(calls.tables.every(table => table === 'shipandbattle_launch_orders'), 'Payments must never publish products');

function event(type = 'checkout.session.completed', overrides = {}) {
  return { id: `evt_${randomUUID()}`, type, livemode: false, data: { object: { id: firstOrder.stripe_session_id, metadata: { application: configuration.STRIPE_APPLICATION, order_id: firstOrder.id, user_id: user.id, plan: firstOrder.plan }, client_reference_id: firstOrder.id, mode: 'payment', currency: 'usd', amount_total: firstOrder.amount_total, livemode: false, payment_status: 'unpaid', ...overrides } } };
}
await payments.applyCheckoutEvent(event());
assert.equal(firstOrder.status, 'pending', 'Completed redirect/session is not proof of payment');
const paidEvent = event('checkout.session.completed', { payment_status: 'paid' });
await payments.applyCheckoutEvent(paidEvent);
const paidAt = firstOrder.paid_at;
await payments.applyCheckoutEvent(paidEvent);
await payments.applyCheckoutEvent(event('checkout.session.expired'));
assert.equal(firstOrder.status, 'paid'); assert.equal(firstOrder.paid_at, paidAt);
assert.equal(seenEvents.size, 3, 'Duplicate events must not be applied twice');
await payments.saveLaunchDetails(user.id, firstOrder.id, details);
assert.equal(firstOrder.product.title, body.product.title);
assert.equal(firstOrder.service_details.email, body.serviceDetails.email);
assert(firstOrder.details_submitted_at);
assert.equal(firstOrder.status, 'paid');
await assert.rejects(payments.saveLaunchDetails(user.id, firstOrder.id, details), statusIs(409));
const history = await payments.listLaunchOrders(user.id);
assert.equal(history.length, 1, 'Unpaid checkouts are excluded from Dashboard history');
assert.equal(history[0].id, firstOrder.id);
assert(history[0].details_submitted_at, 'Completed details do not remove a paid order from history');
const awaitingDetails = [...orders.values()].find(order => order.id !== firstOrder.id);
awaitingDetails.status = 'paid';
assert.equal((await payments.listLaunchOrders(user.id)).length, 2, 'Paid orders awaiting details remain visible');
awaitingDetails.status = 'pending';
assert.equal((await payments.listLaunchOrders(otherUser)).length, 0);
for (const overrides of [{ amount_total: 1 }, { currency: 'eur' }, { livemode: true }, { id: 'cs_other' }, { client_reference_id: otherUser }]) await assert.rejects(payments.applyCheckoutEvent(event('checkout.session.completed', { payment_status: 'paid', ...overrides })), error => [400, 503].includes(error.status));
assert.equal((await payments.applyCheckoutEvent(event('checkout.session.completed', { metadata: {} }))).ignored, true);
assert.equal((await payments.applyCheckoutEvent(event('invoice.paid'))).ignored, true);
await assert.rejects(payments.applyCheckoutEvent(event('checkout.session.async_payment_succeeded')), statusIs(400));
storeFailure = true; await assert.rejects(payments.applyCheckoutEvent(paidEvent), statusIs(503)); storeFailure = false;
const aged = payments.parseCheckoutInput({ ...body, requestId: randomUUID() });
await db.from('shipandbattle_launch_orders').upsert({ user_id: user.id, request_id: aged.requestId, input_hash: aged.hash, plan: aged.plan.id, amount_total: aged.amount, currency: 'usd', livemode: false });
const oldOrder = [...orders.values()].find(o => o.request_id === aged.requestId);
oldOrder.created_at = new Date(Date.now() - 25 * 3600_000).toISOString();
await assert.rejects(payments.createLaunchCheckout(user, aged), statusIs(409));
const secondOrder = [...orders.values()][1];
const secondInput = payments.parseCheckoutInput({ ...body, plan: secondOrder.plan, requestId: secondOrder.request_id });
secondOrder.status = 'expired';
await assert.rejects(payments.createLaunchCheckout(user, secondInput), statusIs(410));

const routeAuth = { ...auth, jsonError: error => Response.json({ error: error.message, code: error.code }, { status: error.status || 500 }),
  authenticatePaymentRequest: async request => { if (request.headers.get('authorization') !== 'Bearer fixture') throw new HttpError(401, 'Authentication required'); return { user, client: db }; },
  authenticateRequest: async request => { if (request.headers.get('authorization') !== 'Bearer fixture') throw new HttpError(401, 'Authentication required'); return { user, client: db }; },
  consumeUserRateLimit: async () => { throw new Error('Payment must not consume a product publication quota'); }, readJsonRequest: request => request.json(),
};
const checkoutRoute = load('app/api/payments/checkout/route.ts', { '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': payments, '@/lib/server/stripe': configuration });
const post = (authorization, payload = { ...body, requestId: firstOrder.request_id }) => new Request('http://localhost/api/payments/checkout', { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(payload) });
const countBefore = orders.size;
env.STRIPE_SECRET_KEY = '';
assert.equal((await checkoutRoute.POST(post('Bearer fixture'))).status, 503);
assert.equal(orders.size, countBefore, 'Missing keys must not create an order');
env.STRIPE_SECRET_KEY = 'sk_test_offline_fixture';
assert.equal((await checkoutRoute.POST(post())).status, 401);
assert.equal((await checkoutRoute.POST(post('Bearer fixture'))).status, 200);
assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc.at(-1))), { name: 'shipandbattle_consume_launch_rate_limit', args: { p_action: 'checkout' } });
const beforeLimited = { orders: orders.size, sessions: calls.created.length };
launchLimitError = { code: 'P0001', message: 'launch rate limit exceeded' };
const limited = await checkoutRoute.POST(post('Bearer fixture'));
assert.equal(limited.status, 429);
assert((await limited.json()).error.includes('next hour'));
assert.equal(orders.size, beforeLimited.orders);
assert.equal(calls.created.length, beforeLimited.sessions, 'Rejected requests cannot create a Stripe session');
launchLimitError = { code: 'PGRST202', message: 'Missing launch rate limit function' };
assert.equal((await checkoutRoute.POST(post('Bearer fixture'))).status, 503, 'A missing migration is a setup failure, not a user quota error');
launchLimitError = null;
const beforeInvalid = calls.rpc.length;
assert.equal((await checkoutRoute.POST(new Request('http://localhost/api/payments/checkout', { method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'free' }) }))).status, 400);
assert.equal(calls.rpc.length, beforeInvalid, 'Malformed checkout input does not consume a quota');
const fastRequestId = new Date().getTime().toString(16).padStart(12, '0').replace(/^(........)/, '$1-') + '-7' + randomUUID().slice(15);
const beforeMissing = calls.created.length;
const missingLegacy = await checkoutRoute.POST(post('Bearer fixture', { requestId: randomUUID(), plan: 'pro' }));
assert.equal(missingLegacy.status, 410);
assert.equal((await missingLegacy.json()).code, 'legacy_checkout_missing');
assert.equal(calls.created.length, beforeMissing);
const fastRequest = { requestId: fastRequestId, plan: 'starter' };
const beforeFast = { tables: calls.tables.length, rpc: calls.rpc.length, orders: orders.size };
const fastResponse = await checkoutRoute.POST(post('Bearer fixture', fastRequest));
assert.equal(fastResponse.status, 200);
const fast = await fastResponse.json();
const sessionCall = calls.created.at(-1);
assert.equal(sessionCall.params.metadata.request_id, fastRequestId);
assert.equal(sessionCall.params.metadata.order_id, fast.orderId);
assert.equal(sessionCall.params.metadata.user_id, user.id);
assert.equal(sessionCall.params.line_items[0].price_data.unit_amount, 9900);
const fastRetry = await checkoutRoute.POST(post('Bearer fixture', { ...fastRequest, resume: true }));
assert.deepEqual(await fastRetry.json(), fast);
assert.deepEqual({ tables: calls.tables.length, rpc: calls.rpc.length, orders: orders.size }, beforeFast, 'New checkout and retries do not touch Supabase');
const unpaidFast = event('checkout.session.completed', { id: calls.retrieved.at(-1), metadata: sessionCall.params.metadata, client_reference_id: fast.orderId });
assert.equal((await payments.applyCheckoutEvent(unpaidFast)).ignored, true);
assert.equal(calls.rpc.length, beforeFast.rpc, 'Unpaid new checkout never reaches storage');
await assert.rejects(payments.applyCheckoutEvent(event('checkout.session.completed', { ...unpaidFast.data.object, amount_total: 1, payment_status: 'paid' })), statusIs(400));
const paidFast = event('checkout.session.completed', { ...unpaidFast.data.object, payment_status: 'paid' });
await payments.applyCheckoutEvent(paidFast);
assert.equal(calls.rpc.at(-1).name, 'shipandbattle_record_launch_checkout_event');
assert.equal(calls.rpc.at(-1).args.p_request_id, fastRequestId);
assert.equal((await payments.getLaunchOrder(user.id, fast.orderId)).status, 'paid');
await assert.rejects(payments.getLaunchOrder(otherUser, fast.orderId), statusIs(404));
const orderRoute = load('app/api/payments/orders/[id]/route.ts', { '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': payments });
assert.equal((await orderRoute.GET(new Request('http://localhost/api/order'), { params: Promise.resolve({ id: firstOrder.id }) })).status, 401);
const deferred = [];
const detailsRoute = load('app/api/payments/orders/[id]/details/route.ts', { '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': payments,
  'next/server': { after: callback => deferred.push(callback) }, '@/lib/server/confirmationEmails': { deliverSubmissionConfirmation: async () => {} } });
const detailsRequest = authorized => new Request('http://localhost/api/order/details', { method: 'PUT', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(body) });
const thirdOrder = [...orders.values()][2];
assert.equal((await detailsRoute.PUT(detailsRequest(false), { params: Promise.resolve({ id: thirdOrder.id }) })).status, 401);
assert.equal((await detailsRoute.PUT(detailsRequest(true), { params: Promise.resolve({ id: thirdOrder.id }) })).status, 403);
thirdOrder.status = 'paid';
assert.equal((await detailsRoute.PUT(detailsRequest(true), { params: Promise.resolve({ id: thirdOrder.id }) })).status, 200);
assert.equal(deferred.length, 1, 'Email is deferred until after submission succeeds');
assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc.at(-1))), { name: 'shipandbattle_consume_launch_rate_limit', args: { p_action: 'launch_details' } });
assert.equal((await detailsRoute.PUT(detailsRequest(true), { params: Promise.resolve({ id: thirdOrder.id }) })).status, 409);

let dispatched = 0;
const webhookRoute = load('app/api/payments/webhook/route.ts', { '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': { applyCheckoutEvent: async () => { dispatched++; return { received: true }; } }, '@/lib/server/stripe': configuration });
const raw = JSON.stringify(paidEvent);
const header = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET });
const signed = (payload = raw, signature = header) => new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { ...(signature ? { 'stripe-signature': signature } : {}) }, body: payload });
assert.equal((await webhookRoute.POST(signed())).status, 200);
assert.equal(dispatched, 1);
assert.equal((await webhookRoute.POST(signed(`${raw} `))).status, 400, 'Body mutation invalidates signature');
assert.equal((await webhookRoute.POST(signed(raw, ''))).status, 400);
assert.equal((await webhookRoute.POST(signed('x'.repeat(1_000_001)))).status, 413);
assert.equal(dispatched, 1, 'Unsigned/invalid events must never reach storage');
env.STRIPE_WEBHOOK_SECRET = '';
assert.equal((await webhookRoute.POST(signed())).status, 503);

const sql = fs.readFileSync('lib/migrations/20261027_launch_payments.sql', 'utf8');
assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 2);
assert(sql.includes('FROM PUBLIC, anon, authenticated'));
assert(sql.includes('TO service_role'));
assert(sql.includes('UNIQUE (user_id,request_id)'));
assert(sql.includes('FOR UPDATE') && sql.includes('ON CONFLICT (id) DO NOTHING'));
assert(sql.includes("WHEN status='paid' OR p_status='paid' THEN 'paid'"));
assert(!/UPDATE public\.shipandbattle_products|INSERT INTO public\.shipandbattle_products/.test(sql));
const limitSql = fs.readFileSync('lib/migrations/20261030_launch_rate_limits.sql', 'utf8');
assert(limitSql.includes("'checkout', 'launch_details'"));
assert(limitSql.includes('auth.uid()') && limitSql.includes('shipandbattle_request_count < 20'));
assert(limitSql.includes('ON CONFLICT (shipandbattle_user_id, shipandbattle_action, shipandbattle_window_started_at)'));
assert(limitSql.includes('FROM PUBLIC, anon') && limitSql.includes('TO authenticated'));
assert(!limitSql.includes('CREATE OR REPLACE FUNCTION public.shipandbattle_consume_rate_limit('), 'Existing product quotas are preserved');
console.log('PASS: server prices, input/consent, auth, private orders, session reuse, changed payload rejection, old-order reconciliation, signed/raw webhook limits, duplicate/out-of-order events, mode/amount/session mismatch, no-key behavior and SQL access contracts. Offline mocks only; no migration or external payments executed.');

// Reusable links bind ownership without calling Stripe or creating an order.
env.STRIPE_WEBHOOK_SECRET = 'whsec_offline_fixture';
assert.equal(paymentLinks.paymentLinksConfigured(), true);
const beforeLinks = { orders: orders.size, rpc: calls.rpc.length, stripe: calls.created.length };
const urls = paymentLinks.paymentLinksForUser(user.id);
assert.deepEqual({ orders: orders.size, rpc: calls.rpc.length, stripe: calls.created.length }, beforeLinks);
for (const [plan, amount] of [['starter', 9900], ['growth', 16900], ['pro', 25900]]) {
  const reference = new URL(urls[plan]).searchParams.get('client_reference_id');
  assert(reference.length <= 200 && /^[A-Za-z0-9_-]+$/.test(reference));
  const session = { id: `cs_test_link${plan}`, payment_link: `plink_${plan}`, client_reference_id: reference,
    metadata: { application: 'indieclash-directory', flow: 'payment-link', plan },
    mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'usd', amount_total: amount, livemode: false, payment_intent: `pi_${plan}` };
  const linkEvent = { id: `evt_link_${plan}`, type: 'checkout.session.completed', livemode: false, data: { object: session } };
  const result = paymentLinks.validatePaidPaymentLink(session, linkEvent);
  assert.equal(result.userId, user.id);
  assert.equal(result.orderId, paymentLinks.paymentLinkOrderId(session.id));
  for (const patch of [{ amount_total: 1 }, { currency: 'eur' }, { payment_link: 'plink_wrong' }, { livemode: true },
    { payment_status: 'unpaid' }, { status: 'open' }, { mode: 'subscription' }, { metadata: { ...session.metadata, plan: 'free' } },
    { client_reference_id: reference.replace(user.id, otherUser) }, { client_reference_id: '' },
    { client_reference_id: reference.slice(0, -1) + (reference.endsWith('a') ? 'b' : 'a') }]) {
    assert.throws(() => paymentLinks.validatePaidPaymentLink({ ...session, ...patch }, linkEvent), statusIs(400));
  }
  const beforeUnpaid = calls.rpc.length;
  assert.equal((await payments.applyCheckoutEvent({ ...linkEvent, data: { object: { ...session, payment_status: 'unpaid' } } })).ignored, true);
  assert.equal(calls.rpc.length, beforeUnpaid);
  await payments.applyCheckoutEvent(linkEvent);
  const count = orders.size;
  await payments.applyCheckoutEvent(linkEvent);
  assert.equal(orders.size, count, 'Webhook retries must not duplicate orders');
  assert.equal((await payments.getLaunchOrder(user.id, result.orderId)).status, 'paid');
  await assert.rejects(payments.getLaunchOrder(otherUser, result.orderId), statusIs(404));
}
assert.notEqual(paymentLinks.paymentLinkOrderId('cs_test_one'), paymentLinks.paymentLinkOrderId('cs_test_two'));
console.log('PASS: fixed links need zero Stripe/database operations; all tiers, signed ownership, amount/mode/link tampering, unpaid ignore, retries and private orders verified.');
const linksRoute = load('app/api/payments/links/route.ts', {
  '@/lib/server/auth': routeAuth, '@/lib/server/paymentLinks': paymentLinks,
});
assert.equal((await linksRoute.GET(new Request('http://localhost/api/payments/links'))).status, 401);
const linksResponse = await linksRoute.GET(new Request('http://localhost/api/payments/links', { headers: { authorization: 'Bearer fixture' } }));
assert.equal(linksResponse.status, 200);
assert.equal(linksResponse.headers.get('cache-control'), 'private, no-store');
const bound = await linksResponse.json();
assert.equal(bound.userId, user.id);
assert.equal(Object.keys(bound.links).length, 3);
assert.equal(JSON.stringify(bound).includes(env.STRIPE_PAYMENT_LINK_SIGNING_SECRET), false);
console.log('PASS: binding endpoint requires authentication, returns no secrets and forbids shared caching.');

const draftOrder = orders.get(paymentLinks.paymentLinkOrderId('cs_test_linkstarter'));
draftOrder.details_submitted_at = null;
const draftRoute = load('app/api/payments/orders/[id]/draft/route.ts', {
  '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': payments,
});
const partial = { title: 'Only a title', serviceDetails: { email: 'not complete' } };
const draftContext = { params: Promise.resolve({ id: draftOrder.id }) };
const draftRequest = (method, authorized = true) => new Request('http://localhost/api/order/draft', {
  method, headers: authorized ? { authorization: 'Bearer fixture' } : {},
  body: method === 'PUT' ? JSON.stringify(partial) : undefined,
});
assert.equal((await draftRoute.PUT(draftRequest('PUT', false), draftContext)).status, 401);
assert.equal((await draftRoute.PUT(draftRequest('PUT'), draftContext)).status, 200);
const draftResponse = await draftRoute.GET(draftRequest('GET'), draftContext);
assert.deepEqual((await draftResponse.json()).draft, partial);
assert.equal(draftResponse.headers.get('cache-control'), 'private, no-store');
assert.equal(draftOrder.details_submitted_at, null);
assert.equal('draft' in await payments.getLaunchOrder(user.id, draftOrder.id), false);
await assert.rejects(payments.getLaunchOrderDraft(otherUser, draftOrder.id), statusIs(404));
await assert.rejects(payments.saveLaunchOrderDraft(otherUser, draftOrder.id, partial), statusIs(409));
draftOrder.status = 'pending';
assert.equal((await draftRoute.PUT(draftRequest('PUT'), draftContext)).status, 409);
draftOrder.status = 'paid';
await payments.saveLaunchDetails(user.id, draftOrder.id, payments.parseLaunchDetails(body));
assert.equal((await draftRoute.PUT(draftRequest('PUT'), draftContext)).status, 409);
assert.equal((await payments.getLaunchOrderDraft(user.id, draftOrder.id)).draft, null);
assert.equal(draftOrder.product.title, body.product.title);
console.log('PASS: draft save accepts incomplete fields, is private and paid-only, and cannot overwrite a final submission.');

const receiptSessionId = 'cs_test_receiptrecovery';
const receiptOrderId = paymentLinks.paymentLinkOrderId(receiptSessionId);
const receiptSession = {
  id: receiptSessionId, payment_link: 'plink_pro',
  client_reference_id: new URL(paymentLinks.paymentLinksForUser(user.id).pro).searchParams.get('client_reference_id'),
  metadata: { application: 'indieclash-directory', plan: 'pro' }, livemode: false, mode: 'payment',
  amount_total: 25900, currency: 'usd', status: 'complete', payment_status: 'unpaid',
  payment_intent: { id: 'pi_receipt', status: 'succeeded', latest_charge: { amount_refunded: 0, disputed: false } },
};
sessions.set(receiptSessionId, receiptSession);
const reconcileRoute = load('app/api/payments/orders/[id]/reconcile/route.ts', {
  '@/lib/server/auth': routeAuth, '@/lib/server/launchPayments': payments,
});
const context = { params: Promise.resolve({ id: receiptOrderId }) };
const request = (authorization = 'Bearer fixture') => new Request('http://localhost/api/order/reconcile', {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: receiptSessionId }),
});
assert.equal((await reconcileRoute.POST(request(''), context)).status, 401);
const pending = await reconcileRoute.POST(request(), context);
assert.equal(pending.status, 409);
assert.equal((await pending.json()).code, 'payment_pending');
receiptSession.payment_status = 'paid';
await assert.rejects(payments.reconcilePaymentLink(otherUser, receiptOrderId, receiptSessionId), statusIs(403));
await assert.rejects(payments.reconcilePaymentLink(user.id, firstOrder.id, receiptSessionId), statusIs(400));
receiptSession.payment_intent.latest_charge.amount_refunded = 100;
assert.equal((await reconcileRoute.POST(request(), context)).status, 409);
assert.equal(orders.has(receiptOrderId), false);
receiptSession.payment_intent.latest_charge.amount_refunded = 0;
const reconciled = await reconcileRoute.POST(request(), context);
assert.equal(reconciled.status, 200);
assert.equal((await reconciled.json()).order.status, 'paid');
const recoveredCount = orders.size;
await reconcileRoute.POST(request(), context);
await payments.applyCheckoutEvent({ id: 'evt_receipt_recovery', type: 'checkout.session.completed', livemode: false, data: { object: receiptSession } });
assert.equal(orders.size, recoveredCount, 'Receipt recovery, retries and a late webhook share one order');
console.log('PASS: receipt recovers a verified Stripe payment when webhook is missing, requires the same owner and rejects unpaid/refunded sessions.');

const sandboxOrder = orders.get(receiptOrderId);
const liveOrderId = randomUUID();
orders.set(liveOrderId, { ...sandboxOrder, id: liveOrderId, livemode: true, details_submitted_at: null });
assert((await payments.listLaunchOrders(user.id)).some(order => order.id === receiptOrderId));
await assert.rejects(payments.getLaunchOrder(user.id, liveOrderId), statusIs(404));
env.STRIPE_MODE = 'live';
assert.deepEqual(Array.from(await payments.listLaunchOrders(user.id), order => order.id), [liveOrderId]);
assert.equal((await payments.getLaunchOrder(user.id, liveOrderId)).id, liveOrderId);
await assert.rejects(payments.getLaunchOrder(user.id, receiptOrderId), statusIs(404));
await assert.rejects(payments.getLaunchOrderDraft(user.id, receiptOrderId), statusIs(404));
await assert.rejects(payments.saveLaunchOrderDraft(user.id, receiptOrderId, partial), statusIs(409));
await assert.rejects(payments.reconcilePaymentLink(user.id, receiptOrderId, receiptSessionId), statusIs(404));
const rpcCount = calls.rpc.length;
await assert.rejects(payments.applyCheckoutEvent(paidEvent), statusIs(400));
assert.equal(calls.rpc.length, rpcCount, 'Cross-mode webhook must not reach the database');
env.STRIPE_MODE = 'test';
console.log('PASS: live order history, receipts, drafts and webhook processing exclude sandbox payments.');
