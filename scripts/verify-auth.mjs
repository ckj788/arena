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
  for (const scenario of ['success', 'submit-draft', 'cancel', 'cancel-fragment', 'expired', 'missing-verifier']) {
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
        handoffs.push({ redirect: url.searchParams.get('redirect_to'), challenge: url.searchParams.get('code_challenge'), method: url.searchParams.get('code_challenge_method') });
        const callback = new URL('/auth/callback', base);
        if (scenario === 'cancel') callback.searchParams.set('error', 'access_denied');
        else if (scenario === 'cancel-fragment') callback.hash = 'error=access_denied&error_description=User+cancelled';
        else callback.searchParams.set('code', `fixture-${scenario}`);
        return request.respond({ status: 302, headers: { location: callback.toString() } });
      }
      if (url.pathname === '/auth/v1/token') {
        exchanges++;
        const body = JSON.parse(request.postData() || '{}');
        if (!body.code_verifier || body.auth_code !== `fixture-${scenario}`) errors.push('Missing/incorrect PKCE exchange data');
        await new Promise((resolve) => setTimeout(resolve, 350));
        return request.respond({
          status: scenario === 'expired' ? 400 : 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': base },
          body: JSON.stringify(scenario === 'expired' ? { code: 'flow_state_expired', msg: 'Test expired auth code' } : { access_token: token, refresh_token: 'test-only', token_type: 'bearer', expires_in: 3600, user }),
        });
      }
      if (url.pathname === '/auth/v1/user') return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': base }, body: JSON.stringify(user) });
      if (url.pathname === '/api/arena/products/mine') return request.respond({ status: 200, contentType: 'application/json', body: '{"productIds":[]}' });
      if (!['GET', 'HEAD'].includes(request.method())) return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
      if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
      return request.continue();
    });

    await page.goto(scenario === 'missing-verifier' ? `${base}/?code=fixture-missing` : base, { waitUntil: 'domcontentloaded' });
    if (scenario !== 'missing-verifier') {
      if (scenario === 'submit-draft') {
        await clickText(page, 'Submit Product');
        await page.type('#product-title', 'Keep this product draft');
        await page.type('#product-tagline', 'The form survives signing in');
      } else await clickText(page, 'Sign in');
      await clickText(page, 'Continue with Google');
    }
    const success = ['success', 'submit-draft'].includes(scenario);
    if (success) {
      await page.waitForFunction(() => document.body.textContent.includes('Auth Test Maker') && !location.search.includes('code='));
      assert.equal(exchanges, 1);
      assert.equal(homeDocuments, 2, 'Completing sign-in must not reload home a second time');
      if (scenario === 'submit-draft') {
        await page.waitForSelector('[aria-labelledby="product-form-title"]');
        assert.equal(await page.$eval('#product-title', (el) => el.value), 'Keep this product draft');
        assert.equal(await page.$eval('#product-tagline', (el) => el.value), 'The form survives signing in');
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.textContent.includes('Auth Test Maker'));
      assert.equal(exchanges, 1, 'Refresh must restore session without another code exchange');
    } else {
      await page.waitForSelector('[data-auth-error]');
      const message = await page.$eval('[data-auth-error]', (el) => el.textContent);
      assert(message.includes(scenario === 'missing-verifier' ? 'different site' : scenario.startsWith('cancel') ? 'cancelled' : 'could not finish'));
      assert(!page.url().includes('code=') && !page.url().includes('error='));
      assert.equal(exchanges, scenario === 'expired' ? 1 : 0);
      await clickText(page, 'Sign in');
      assert(await page.$eval('[role="dialog"] button[aria-busy]', (el) => !el.disabled));
    }
    if (handoffs.length) {
      assert.equal(handoffs.length, 1);
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
  assert.equal(new URL(redirect.headers.get('location')).origin, base);
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  results.push('Server callback rejects external returns and is never cached');
  console.log(JSON.stringify({ results, screenshots: output, note: 'Mocked provider responses; real Supabase allowlist and real OAuth require manual confirmation.' }, null, 2));
} catch (error) {
  await currentPage?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  const state = await currentPage?.evaluate(() => ({ origin: location.origin, path: location.pathname, hasCode: new URLSearchParams(location.search).has('code'), error: document.querySelector('[data-auth-error]')?.textContent, buttons: [...document.querySelectorAll('header button')].map((el) => el.textContent.trim()) })).catch(() => null);
  console.log(JSON.stringify({ completed: results, screenshots: output, diagnostics: diagnostics(), state }, null, 2));
  throw error;
} finally { await browser.close(); }
