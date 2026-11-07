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

// Payment action is a real anchor: it has no async click handler or checkout API.
const formRoutes = [], destinations = [];
let selectedPlan = 'starter', href, signedOut = false;
const picker = load('app/submit/PlanPicker.tsx', {
  '@/lib/submissionPlans': plans, 'next/navigation': { useRouter: () => ({ push: path => formRoutes.push(path) }) },
  './DirectoryCheckout': { useDirectoryCheckout: () => ({ href, signedOut, signIn() {}, reload() {}, consume() {} }) },
}, { useState: () => [selectedPlan, () => {}] }, { window: { location: { assign: url => destinations.push(url) } } }).default;
for (const plan of ['starter', 'growth', 'pro']) {
  selectedPlan = plan; href = 'https://buy.stripe.com/test_' + plan;
  const form = picker({});
  const bar = form.props.children.find(child => child?.props?.className === 'launch-selection-bar');
  const action = bar.props.children[1];
  assert.equal(action.type, 'a');
  assert.equal(action.props.href, href);
  assert.equal(typeof action.props.onClick, 'function');
  action.props.onClick();
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(destinations.at(-1), href, 'Keyboard submit also navigates synchronously');
}
href = undefined;
selectedPlan = 'free';
const form = picker({});
assert.equal(form.props.children.find(child => child?.props?.className === 'launch-selection-bar').props.children[1].props.disabled, false);
form.props.onSubmit({ preventDefault() {} });
assert.equal(formRoutes.at(-1), '/submit/details?plan=free');
signedOut = true; selectedPlan = 'growth';
assert.equal(picker({}).props.children.find(child => child?.props?.className === 'launch-selection-bar').props.children[1].type, 'button');

let linkSlots = [], linkIndex = 0, linkEffects = [], activeUser = 'owner', activeStatus = 'signed-in';
const linkRequests = [];
const linkHook = load('app/submit/DirectoryCheckout.tsx', {
  '@/lib/submissionPlans': plans,
  '@/lib/preparedCheckout': {
    CHECKOUT_PREPARATION_LIFETIME: 900000, consumePreparedCheckout() {},
    prepareCheckout: async (userId, plan) => {
      linkRequests.push({ userId, plan });
      return { userId, url: 'https://buy.stripe.com/test_' + plan };
    },
  },
  '@/app/components/SubmissionAccess': { useSubmissionAccess: () => ({ status: activeStatus, userId: activeUser, requestSubmission() {} }) },
}, {
  useState(initial) { const i = linkIndex++; if (!(i in linkSlots)) linkSlots[i] = initial; return [linkSlots[i], value => { linkSlots[i] = typeof value === 'function' ? value(linkSlots[i]) : value; }]; },
  useEffect(callback) { linkEffects.push(callback); },
}, { setTimeout: () => 1, clearTimeout() {} }).useDirectoryCheckout;
function renderLinks(plan) { linkIndex = 0; linkEffects = []; return linkHook(plan); }
assert.equal(renderLinks('starter').href, undefined);
const cleanupLinks = linkEffects[0](); await new Promise(setImmediate);
assert.equal(renderLinks('starter').href, 'https://buy.stripe.com/test_starter');
assert.equal(renderLinks('pro').href, 'https://buy.stripe.com/test_pro');
assert.equal(linkRequests.length, 3, 'All paid plans prepare in the background');
assert.deepEqual(linkRequests.map(request => request.plan), ['starter', 'growth', 'pro']);
activeUser = 'different-owner';
assert.equal(renderLinks('starter').href, undefined, 'Account switch must remove the previous payment link immediately');
activeUser = 'owner'; activeStatus = 'signed-out';
assert.equal(renderLinks('starter').href, undefined, 'Sign-out must remove payment link');
cleanupLinks();
console.log('PASS: native payment anchors, synchronous keyboard navigation, background session preparation, account isolation and free flow.');

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
