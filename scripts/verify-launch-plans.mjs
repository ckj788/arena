import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      assert(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  return mod.exports;
}

const plans = load('lib/submissionPlans.ts');
assert.equal(plans.SUBMISSION_PLANS.length, 4);
assert.equal(new Set(plans.SUBMISSION_PLANS.map(p => p.id)).size, 4);
for (const [id, price, directories] of [['starter', 99, 50], ['growth', 169, 100], ['pro', 259, 200], ['free', 0, 0]]) {
  const plan = plans.getSubmissionPlan(id);
  assert.equal(plan.price, price);
  assert.equal(plan.directories, directories);
  if (directories) assert.equal(plan.unitPrice, (Math.round(price * 100 / directories) / 100).toFixed(2));
}
for (const invalid of [undefined, null, '', 'enterprise', '__proto__', ['free'], ['free', 'pro']]) {
  assert.equal(plans.getSubmissionPlan(invalid), undefined);
}

const picker = load('app/submit/PlanPicker.tsx', { '@/lib/submissionPlans': plans, 'next/navigation': { useRouter: () => ({ push() {} }) }, './DirectoryCheckout': { useDirectoryCheckout: () => ({ configuration: 'ready', busy: false }) } }).default;
const pickerHtml = renderToStaticMarkup(React.createElement(picker));
assert.equal((pickerHtml.match(/type="radio"/g) || []).length, 4);
assert.equal((pickerHtml.match(/class="launch-plan-card/g) || []).length, 3);
assert(pickerHtml.includes('launch-free-plan'));
assert(pickerHtml.includes('$1.30') && pickerHtml.includes('$1.98') && pickerHtml.includes('$1.69'));
assert(!pickerHtml.includes('action="/submit/checkout"'), 'Plan selection must not navigate to an extra confirmation page');
assert(pickerHtml.includes('disabled=""'));
assert(!pickerHtml.includes('checked=""'), 'No paid plan should be silently preselected');

const fields = load('app/submit/ServiceFields.tsx').default;
for (const history of ['none', 'provided', 'unsure']) {
  const html = renderToStaticMarkup(React.createElement(fields, {
    value: { email: '', history, directories: '', consent: false }, onChange() {},
  }));
  assert.equal((html.match(/type="radio"/g) || []).length, 3);
  assert.equal(html.includes('id="submitted-directories"'), history === 'provided');
  assert(html.includes('type="email"'));
  assert(html.includes('type="checkbox"') && !html.includes('type="checkbox" checked=""'));
}

const detailsPage = load('app/submit/details/page.tsx', {
  'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  '@/app/ArenaClient': { default: () => null },
  '@/lib/submissionPlans': plans,
  '@/lib/server/launchPayments': { UUID_PATTERN: /^[0-9a-f-]{36}$/ },
  './PaidOrderDetails': { default: () => null },
});
const freeElement = await detailsPage.default({ searchParams: Promise.resolve({ plan: 'free' }) });
assert.equal(freeElement.props.submissionPlan, 'free');
assert.equal(freeElement.props.initialProducts.length, 0);
for (const plan of ['starter', 'growth', 'pro']) await assert.rejects(detailsPage.default({ searchParams: Promise.resolve({ plan }) }), new RegExp(`REDIRECT:/submit/checkout\\?plan=${plan}`));
const paidElement = await detailsPage.default({ searchParams: Promise.resolve({ order: '11111111-1111-4111-8111-111111111111' }) });
assert.equal(paidElement.props.orderId, '11111111-1111-4111-8111-111111111111');
for (const plan of [undefined, 'invalid', ['free', 'pro']]) {
  await assert.rejects(detailsPage.default({ searchParams: Promise.resolve({ plan }) }), /REDIRECT:\/submit/);
}
assert.equal(detailsPage.metadata.robots.index, false);
assert.equal(detailsPage.metadata.robots.googleBot.index, false);

const client = fs.readFileSync('app/ArenaClient.tsx', 'utf8');
const paidBranch = client.slice(client.indexOf('if (isPaidSubmission) {'), client.indexOf('if (!userLoggedIn)', client.indexOf('const handleSubmitProduct')));
assert(paidBranch.includes('return;'));
assert(!/submitArenaProduct|updateArenaProduct/.test(paidBranch), 'Paid order details must not create duplicate product profiles');
assert(paidBranch.includes('/details`') && paidBranch.includes('"PUT"'));
assert(client.includes('useModalAccessibility(isSubmitOpen && !isSubmissionPage'));
assert(client.includes('SUBMISSION_PAGE_DRAFT_KEY'));
assert(client.includes('router.replace(restoredDraft ? "/submit/details?plan=free" : "/submit")'));
console.log('PASS: pricing, rounding, selection, history fields, route validation, noindex, drafts and paid-preview boundaries.');
