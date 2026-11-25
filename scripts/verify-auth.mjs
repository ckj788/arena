import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import puppeteer from 'puppeteer-core';

// The real SDK runs its PKCE generation/exchange/session persistence, but every
// provider/Auth response is intercepted. No real login, product, vote or write.
const base = process.env.UI_TEST_URL || 'http://localhost:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-auth-'));
const source = fs.readFileSync('lib/browserOAuth.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let calls = 0;
const fakeClient = { auth: { exchangeCodeForSession: async () => { calls++; return { data: { session: null }, error: null }; } } };
await Promise.all([helpers.exchangeOAuthCodeOnce(fakeClient, 'one-use'), helpers.exchangeOAuthCodeOnce(fakeClient, 'one-use')]);
assert.equal(calls, 1, 'Remount/Strict Mode must not exchange the code twice');
for (const unsafe of ['//attacker.invalid', '/\\attacker.invalid', 'https://attacker.invalid', '/auth/callback']) {
  assert.equal(helpers.safeOAuthReturnPath(unsafe, base), '/');
}
assert.equal(helpers.safeOAuthReturnPath('/?submit=1&code=redacted#arena-section', base), '/?submit=1#arena-section');
const results = ['One-use exchange deduplication and same-origin return validation'];
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const uid = '00000000-0000-4000-8000-000000000002';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'auth-test@example.invalid', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Auth Test Maker' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.test-only`;
const clickText = async (page, text) => {
  await page.waitForFunction((label) => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === label && !el.disabled), {}, text);
  for (const button of await page.$$('button')) {
    if (await button.isVisible() && await button.evaluate((el, label) => el.textContent.trim() === label, text)) return button.click();
  }
  throw new Error(`Button not found: ${text}`);
};
let currentPage;
let diagnostics = () => ({});

try {
  const scenarios = [
    'success', 'github-success', 'email-order-success', 'free-submission-success', 'arena-success', 'champions-success',
    'arena-cancel', 'cancel', 'cancel-fragment', 'expired', 'missing-verifier', 'provider-signup-disabled',
    'fragment-provider-email', 'slow-free-submission-success', 'slow-expired', 'stalled-retry',
  ];
  for (const scenario of scenarios.filter(value => !process.env.AUTH_TEST_SCENARIO || value === process.env.AUTH_TEST_SCENARIO)) {
    const emailOrderId = '11111111-1111-4111-8111-111111111111';
    const freeSubmission = scenario.endsWith('free-submission-success');
    const expired = scenario.endsWith('expired');
    const stalled = scenario === 'stalled-retry';
    const startPath = freeSubmission ? '/submit/details' : scenario.startsWith('arena-') ? '/arena' : scenario.startsWith('champions-') ? '/champions' : '/';
    const cancelScenario = scenario.endsWith('cancel');
    const provider = scenario === 'github-success' ? 'github' : 'google';
    const sessionUser = provider === 'github'
      ? { ...user, app_metadata: { provider }, user_metadata: { preferred_username: 'auth-test-maker' } }
      : user;
    const accountLabel = provider === 'github' ? '@auth-test-maker' : 'Auth Test Maker';
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    currentPage = page;
    await page.setViewport({ width: 1365, height: 900 });
    const errors = [];
    const handoffs = [];
    let exchanges = 0;
    let homeDocuments = 0;
    diagnostics = () => ({ scenario, exchanges, homeDocuments, errors, handoffs: handoffs.map((item) => ({ redirect: item.redirect, hasChallenge: Boolean(item.challenge), method: item.method })) });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.origin === base && url.pathname === '/') homeDocuments++;
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: { 'access-control-allow-origin': base, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
      if (url.pathname === '/auth/v1/authorize') {
        assert.equal(url.searchParams.get('provider'), provider);
        handoffs.push({ redirect: url.searchParams.get('redirect_to'), challenge: url.searchParams.get('code_challenge'), method: url.searchParams.get('code_challenge_method') });
        const callback = new URL('/auth/callback', base);
        if (cancelScenario) callback.searchParams.set('error', 'access_denied');
        else if (scenario === 'cancel-fragment') callback.hash = 'error=access_denied&error_description=User+cancelled';
        else if (scenario === 'provider-signup-disabled') {
          callback.searchParams.set('error', 'server_error');
          callback.searchParams.set('error_code', 'signup_disabled');
        } else if (scenario === 'fragment-provider-email') {
          callback.hash = 'error=server_error&error_code=provider_email_needs_verification';
        }
        else callback.searchParams.set('code', `fixture-${scenario}-${handoffs.length}`);
        return request.respond({ status: 302, headers: { location: callback.toString() } });
      }
      if (url.pathname === '/auth/v1/token') {
        exchanges++;
        const body = JSON.parse(request.postData() || '{}');
        if (!body.code_verifier || body.auth_code !== `fixture-${scenario}-${handoffs.length}`) errors.push('Missing/incorrect PKCE exchange data');
        if (stalled && exchanges === 1) return; // Leave the request pending until the browser aborts it.
        if (scenario.startsWith('slow-')) {
          await new Promise(resolve => setTimeout(resolve, 17_000));
          const stillPending = await page.evaluate(() =>
            new URLSearchParams(location.search).has('code') && !document.querySelector('[data-auth-error]'));
          if (!stillPending) errors.push('The UI finished sign-in before the token response arrived');
        } else {
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        return request.respond({
          status: expired ? 400 : 200,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': base,
            'access-control-expose-headers': 'x-supabase-api-version',
            'x-supabase-api-version': '2024-01-01',
          },
          body: JSON.stringify(expired ? { code: 'flow_state_expired', msg: 'Test expired auth code' } : { access_token: token, refresh_token: 'test-only', token_type: 'bearer', expires_in: 3600, user: sessionUser }),
        });
      }
      if (url.pathname === '/auth/v1/user') return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': base }, body: JSON.stringify(sessionUser) });
      if (url.pathname === '/api/arena/products/mine') return request.respond({ status: 200, contentType: 'application/json', body: '{"productIds":[]}' });
      if (url.pathname === '/api/payments/orders') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [{ id: emailOrderId, plan: 'growth', status: 'paid', amount_total: 16900, currency: 'usd', details_submitted_at: '2026-11-07T00:00:00Z', product_name: 'Email order fixture' }] }) });
      if (!['GET', 'HEAD'].includes(request.method())) return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
      if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
      return request.continue();
    });

    const entry = scenario === 'email-order-success' ? `/?view=console&order=${emailOrderId}` : freeSubmission ? `${startPath}?plan=free` : startPath;
    await page.goto(scenario === 'missing-verifier' ? `${base}/?code=fixture-missing` : `${base}${entry}`, { waitUntil: 'domcontentloaded' });
    if (scenario === 'email-order-success') {
      await page.waitForFunction(() => document.body.textContent.includes('Sign in to view order'));
      assert(!(await page.content()).includes('Your sign-in could not be verified'));
    }
    if (scenario !== 'missing-verifier') {
      await clickText(page, freeSubmission ? 'Sign in to continue →' : 'Sign in');
      await clickText(page, provider === 'github' ? 'Continue with GitHub' : 'Continue with Google');
    }
    const success = scenario.endsWith('success');
    if (success) {
      await page.waitForFunction(label => document.body.textContent.includes(label) && !location.search.includes('code='), {}, accountLabel);
      await page.waitForFunction((path) => location.pathname === path && (path === '/submit/details' ? Boolean(document.querySelector('#product-title')) : document.querySelector('[data-main-page]')?.getAttribute('data-main-page') === (path === '/' ? 'discover' : path.slice(1))), {}, startPath);
      assert.equal(exchanges, 1);
      assert.equal(await page.$('[data-auth-error]'), null);
      assert.equal(homeDocuments, startPath === '/' ? 2 : 1, 'Completing sign-in must not reload home a second time');
      if (scenario === 'email-order-success') {
        await page.waitForSelector(`#launch-order-${emailOrderId}`);
        assert.equal(new URL(page.url()).searchParams.get('order'), emailOrderId);
        assert.equal(new URL(page.url()).searchParams.get('view'), 'console');
        assert(await page.$eval(`#launch-order-${emailOrderId}`, element => element.textContent.includes('Email order fixture')));
      }
      if (freeSubmission) assert.equal(new URL(page.url()).searchParams.get('plan'), 'free');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(label => document.body.textContent.includes(label), {}, accountLabel);
      assert.equal(exchanges, 1, 'Refresh must restore session without another code exchange');
    } else {
      await page.waitForSelector('[data-auth-error]', { timeout: stalled ? 60_000 : 30_000 });
      const message = await page.$eval('[data-auth-error]', (el) => el.textContent);
      const expectedFailure = {
        'missing-verifier': 'different site',
        expired: 'attempt expired',
        'slow-expired': 'attempt expired',
        'stalled-retry': 'could not respond',
        'provider-signup-disabled': 'New account sign-ups',
        'fragment-provider-email': 'Verify your email',
      }[scenario] ?? 'cancelled';
      assert(message.includes(expectedFailure), message);
      await page.waitForFunction((path) => location.pathname === path && !location.search.includes('error='), {}, startPath);
      assert(!page.url().includes('code=') && !page.url().includes('error='));
      assert.equal(exchanges, expired || stalled ? 1 : 0);
      await clickText(page, 'Sign in');
      assert(await page.$eval('[role="dialog"] button[aria-busy]', (el) => !el.disabled));
      if (stalled) {
        await clickText(page, 'Continue with Google');
        await page.waitForFunction(() => document.body.textContent.includes('Auth Test Maker') && !location.search.includes('code='));
        assert.equal(await page.$('[data-auth-error]'), null);
        assert.equal(exchanges, 2, 'Only an explicit new login may exchange another code');
      }
    }
    if (handoffs.length) {
      assert.equal(handoffs.length, stalled ? 2 : 1);
      assert.equal(handoffs[0].redirect, `${base}/auth/callback`);
      assert(handoffs[0].challenge);
      assert.equal(handoffs[0].method, 's256');
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `${scenario}.png`) });
    results.push(`${scenario}: exact-origin callback, expected session/error state, no duplicate exchange`);
    await context.close();
  }
  const redirect = await fetch(`${base}/auth/callback?code=fixture&next=${encodeURIComponent('//attacker.invalid')}`, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), '/?code=fixture');
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  const providerError = await fetch(`${base}/auth/callback?error=server_error&error_code=unexpected_failure&error_description=private+provider+details`, { redirect: 'manual' });
  const errorRedirect = new URL(providerError.headers.get('location'), base);
  assert.equal(errorRedirect.search, '?error=unexpected_failure');
  results.push('Server callback rejects external returns and is never cached');
  console.log(JSON.stringify({ results, screenshots: output, note: 'Mocked provider responses; real Supabase allowlist and real OAuth require manual confirmation.' }, null, 2));
} catch (error) {
  await currentPage?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  const state = await currentPage?.evaluate(() => ({ origin: location.origin, path: location.pathname, hasCode: new URLSearchParams(location.search).has('code'), error: document.querySelector('[data-auth-error]')?.textContent, buttons: [...document.querySelectorAll('header button')].map((el) => el.textContent.trim()) })).catch(() => null);
  console.log(JSON.stringify({ completed: results, screenshots: output, diagnostics: diagnostics(), state }, null, 2));
  throw error;
} finally { await browser.close(); }
