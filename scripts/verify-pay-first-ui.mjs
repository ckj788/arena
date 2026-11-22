import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { randomUUID } from 'node:crypto';

function load(file, mocks, react = React, runtime = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module: mod, exports: mod.exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return jsx;
    assert(name in mocks, `Unexpected import: ${name}`); return mocks[name];
  }, ...runtime });
  return mod.exports;
}
const plans = load('lib/submissionPlans.ts', {});
const page = load('app/submit/checkout/page.tsx', {
  'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  '@/app/components/PublicSiteHeader': { default: () => React.createElement('header', null, 'Indie Clash') },
  '@/lib/submissionPlans': plans,
}).default;
for (const plan of ['starter', 'growth', 'pro']) {
  await assert.rejects(page({ searchParams: Promise.resolve({ plan }) }), new RegExp(`REDIRECT:/submit\\?plan=${plan}$`));
  await assert.rejects(page({ searchParams: Promise.resolve({ plan, checkout: 'cancelled' }) }), new RegExp(`REDIRECT:/submit\\?plan=${plan}&checkout=cancelled$`));
}
await assert.rejects(page({ searchParams: Promise.resolve({ plan: 'free' }) }), /REDIRECT:\/submit\/details\?plan=free/);

let slots, index, effects, response, failure;
const savedDraft = { title: 'Only a title so far' };
const hooks = {
  useState(initial) { const n = index++; if (!(n in slots)) slots[n] = typeof initial === 'function' ? initial() : initial; return [slots[n], value => { slots[n] = value; }]; },
  useEffect(callback) { effects.push(callback); },
};
const Arena = () => null;
const FormSkeleton = () => null;
const gate = load('app/submit/details/PaidOrderDetails.tsx', {
  '@/app/ArenaClient': { default: Arena }, '@/app/components/NavigationLink': { default: () => null },
  '@/lib/submissionPlans': plans,
  '../SubmissionLoading': { default: FormSkeleton },
  '@/app/components/SubmissionAccess': { useSubmissionAccess: () => ({ userId: 'fixture-user' }) },
  '@/lib/arenaApi': { authenticatedJson: async (path) => {
    assert.equal(path, '/api/payments/orders/order-fixture/draft');
    if (failure) throw failure;
    return { order: response, draft: savedDraft };
  } },
}, hooks).default;
async function renderGate(order, error) {
  slots = []; index = 0; effects = []; response = order; failure = error;
  const initial = gate({ orderId: 'order-fixture' });
  assert.notEqual(initial.type, Arena, 'No fields while order verification is pending');
  assert.equal(initial.type, FormSkeleton, 'Loading shows the form skeleton instead of a payment-check card');
  effects[0](); await new Promise(setImmediate);
  index = 0; effects = [];
  return gate({ orderId: 'order-fixture' });
}
const order = { id: 'order-fixture', plan: 'growth', status: 'paid', details_submitted_at: null };
const paid = await renderGate(order);
assert.equal(paid.type, Arena);
assert.equal(paid.props.paidOrderId, order.id);
assert.equal(paid.props.submissionPlan, 'growth');
assert.equal(paid.props.initialSubmissionDraft, savedDraft);
for (const status of ['pending', 'failed', 'expired']) assert.notEqual((await renderGate({ ...order, status })).type, Arena);
assert.notEqual((await renderGate({ ...order, details_submitted_at: '2026-10-29T00:00:00Z' })).type, Arena);
assert.notEqual((await renderGate(null, new Error('Order not found'))).type, Arena);
console.log('PASS: all paid tiers ask for payment before product fields, free route skips payment, and only a verified paid/incomplete order unlocks the details form. Rendered components and mocked auth/store; no payment performed.');

const formRoutes = [], selected = [];
const picker = load('app/submit/PlanPicker.tsx', {
  '@/lib/submissionPlans': plans, 'next/navigation': { useRouter: () => ({ push: path => formRoutes.push(path) }) },
  './DirectoryCheckout': { useDirectoryCheckout: () => ({ forPlan: plan => ({ start: () => selected.push(plan) }) }) },
}).default;
const [freeCard, services] = picker({}).props.children;
freeCard.props.children[1].props.children.props.onClick();
assert.equal(formRoutes.at(-1), '/submit/details?plan=free');
for (const card of services.props.children[1].props.children) {
  const button = card.props.children[5];
  assert.equal(button.type, 'button');
  button.props.onClick();
  assert.equal(selected.at(-1), card.props['data-plan']);
}

let owner = 'owner', status = 'signed-in', cursor, effect;
const hookSlots = [], signIns = [], requests = [], navigations = [];
const checkout = load('app/submit/DirectoryCheckout.tsx', {
  '@/lib/preparedCheckout': {
    consumePreparedCheckout() {},
    prepareCheckout: async (userId, plan) => {
      requests.push([userId, plan]);
      return { userId, url: 'https://checkout.stripe.com/' + plan };
    },
  },
  '@/app/components/SubmissionAccess': { useSubmissionAccess: () => ({
    status, userId: owner, requestSubmission: path => signIns.push(path),
  }) },
}, {
  useState(initial) {
    const i = cursor++;
    if (!(i in hookSlots)) hookSlots[i] = initial;
    return [hookSlots[i], value => { hookSlots[i] = value; }];
  },
  useEffect(fn) { effect = fn; },
}, { window: { location: { assign: url => navigations.push(url) } } }).useDirectoryCheckout;
function renderCheckout() { cursor = 0; return checkout(); }
renderCheckout(); effect();
assert.equal(requests.length, 0);
renderCheckout().forPlan('growth').start();
const pending = renderCheckout();
assert(pending.forPlan('growth').busy && pending.forPlan('pro').disabled);
const cancel = effect();
cancel(); owner = 'new-owner';
renderCheckout(); effect(); await new Promise(setImmediate);
assert.equal(navigations.length, 0, 'An account change must cancel the pending redirect');
renderCheckout().forPlan('pro').start();
renderCheckout(); effect(); await new Promise(setImmediate);
assert.deepEqual(requests, [['owner', 'growth'], ['new-owner', 'pro']]);
assert.deepEqual(navigations, ['https://checkout.stripe.com/pro']);
owner = null; status = 'signed-out';
renderCheckout().forPlan('starter').start();
assert.deepEqual(signIns, ['/submit?plan=starter']);
console.log('PASS: explicit plan selection, free and signed-out routes, and account isolation.');

let clock = Date.now(), replyOwner = 'owner', preparationFailure = false;
const preparations = [];
const prepared = load('lib/preparedCheckout.ts', {
  './arenaApi': { authenticatedJson: async (path, body) => {
    preparations.push({ path, body });
    if (preparationFailure) throw new Error('Temporary network failure');
    return { userId: replyOwner, orderId: 'fixture', url: 'https://checkout.stripe.com/fixture' };
  } },
}, React, { crypto: { randomUUID }, Date: { now: () => clock } });
const firstPreparation = prepared.prepareCheckout('owner', 'starter');
assert.equal(prepared.prepareCheckout('owner', 'starter'), firstPreparation, 'Remount shares the same in-flight request');
await firstPreparation;
await prepared.prepareCheckout('owner', 'starter');
assert.equal(preparations.length, 1);
prepared.consumePreparedCheckout('owner', 'starter');
await prepared.prepareCheckout('owner', 'starter');
assert.notEqual(preparations[0].body.requestId, preparations[1].body.requestId);
clock += prepared.CHECKOUT_PREPARATION_LIFETIME;
await prepared.prepareCheckout('owner', 'starter');
assert.equal(preparations.length, 3, 'Old cached URLs are replaced');
preparationFailure = true;
await assert.rejects(prepared.prepareCheckout('owner', 'growth'), /Temporary network failure/);
const retryRequest = preparations.at(-1).body;
assert.equal(retryRequest.resume, false);
preparationFailure = false;
await prepared.prepareCheckout('owner', 'growth');
assert.equal(preparations.at(-1).body.requestId, retryRequest.requestId);
assert.equal(preparations.at(-1).body.resume, true);
replyOwner = 'different-owner';
await assert.rejects(prepared.prepareCheckout('owner', 'pro'), /account changed/);
console.log('PASS: preparation deduplicates remounts, expires cached URLs, uses stable retry IDs, consumes used sessions and rejects account changes.');

const Result = () => null;
const resultPage = load('app/submit/result/page.tsx', {
  'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  '@/app/components/PublicSiteHeader': { default: () => null },
  '@/lib/server/launchPayments': { UUID_PATTERN: /^[0-9a-f-]{36}$/ },
  '@/lib/server/paymentLinks': {
    isCheckoutSessionId: id => typeof id === 'string' && /^cs_(test|live)_[a-zA-Z0-9]+$/.test(id),
    paymentLinkOrderId: id => `order-derived-from-${id}`,
  },
  './PaymentResult': { default: Result },
}).default;
const linkedReceipt = await resultPage({ searchParams: Promise.resolve({ session_id: 'cs_test_example' }) });
assert.equal(linkedReceipt.props.children[1].props.orderId, 'order-derived-from-cs_test_example');
assert.equal(linkedReceipt.props.children[1].props.sessionId, 'cs_test_example');
assert.equal(linkedReceipt.props.children[1].props.canReconcile, true);
const legacyReceipt = await resultPage({ searchParams: Promise.resolve({ order: '11111111-1111-4111-8111-111111111111' }) });
assert.equal(legacyReceipt.props.children[1].props.orderId, '11111111-1111-4111-8111-111111111111');
assert.equal(legacyReceipt.props.children[1].props.canReconcile, false);
await assert.rejects(resultPage({ searchParams: Promise.resolve({ session_id: 'invalid' }) }), /REDIRECT:\/submit/);
console.log('PASS: reusable-link return resolves the same receipt, legacy order URLs remain valid and invalid returns are rejected.');

let consoleOrder = { id: 'fixture', plan: 'growth', status: 'paid', amount_total: 16900, currency: 'usd', details_submitted_at: null, livemode: false, created_at: '2026-10-30T12:00:00Z', paid_at: '2026-10-30T12:01:00Z' };
const ordersView = load('app/components/LaunchOrders.tsx', {
  './NavigationLink': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/submissionPlans': plans, '@/lib/arenaApi': {},
}, {
  useState: initial => [Array.isArray(initial) ? [consoleOrder] : initial === true ? false : initial, () => {}],
  useEffect() {},
}).default;
assert(renderToStaticMarkup(React.createElement(ordersView, { userId: 'owner' })).includes('Complete product details'));
consoleOrder = { ...consoleOrder, draft_saved_at: '2026-10-31T00:00:00Z' };
const draftHtml = renderToStaticMarkup(React.createElement(ordersView, { userId: 'owner', focusedOrderId: consoleOrder.id }));
assert(draftHtml.includes('Draft saved') && draftHtml.includes('Continue editing') && draftHtml.includes('id="launch-order-fixture" tabindex="-1"'));
consoleOrder = { ...consoleOrder, details_submitted_at: '2026-10-31T00:00:00Z', product_name: 'Fixture product', product_id: 'published-fixture' };
const completedHtml = renderToStaticMarkup(React.createElement(ordersView, { userId: 'owner' }));
assert(!completedHtml.includes('Complete product details'));
assert(completedHtml.includes('Details received') && completedHtml.includes('View order'));
assert(completedHtml.includes('/products/published-fixture') && completedHtml.includes('View product profile'));
for (const expected of ['Order history', 'Fixture product', '$169.00', 'Placed', 'Paid', 'fixture', '10 business days']) assert(completedHtml.includes(expected), `History includes ${expected}`);
assert(!completedHtml.includes('Test order'));
assert(!completedHtml.includes('My Console'));
const dashboardSource = fs.readFileSync('app/components/MakerConsole.tsx', 'utf8');
assert(dashboardSource.includes('DASHBOARD'));
assert(dashboardSource.includes('<LaunchOrders') && !dashboardSource.includes('ownershipStatus !== "reauth" && <LaunchOrders'), 'Order history is independent of product profile loading');
console.log('PASS: completed Console orders remove the details button and retain a read-only order link.');
