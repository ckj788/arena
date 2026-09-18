import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
const diagnostics = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const env = fs.readFileSync('.env.local', 'utf8');
const publicUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(publicUrl, 'A configured local build is required (only the public URL is read)');
const uid = '00000000-0000-4000-8000-000000000009';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'resilience@example.invalid', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'resilience-test' } };
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp, aud: 'authenticated' })).toString('base64url')}.test-only`;
const session = { access_token: token, refresh_token: 'test-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
const key = `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
const prefix = env.match(/^NEXT_PUBLIC_DB_PREFIX\s*=\s*["']?([^\s"']+)/m)?.[1] || 'shipandbattle_';
const row = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`${prefix}${k}`, v]));
const products = ['alpha', 'beta'].map(id => row({ id: `safety-${id}`, title: `Safety ${id}`, tagline: 'Isolated browser fixture for failure testing.', logo: '🚀', url: 'https://example.invalid', maker_name: 'Fixture Maker', maker_twitter: '@fixture', submitted_at: '2026-01-01T00:00:00Z', queue_status: 'active', arena_enqueued: true, votes_count: 0 }));
const bracket = row({ id: 'safety-bracket', status: 'active', bracket_size: 2, round_started_at: new Date().toISOString(), round_ends_at: new Date(Date.now() + 86400000).toISOString() });
const match = row({ id: 'safety-match', bracket_id: 'safety-bracket', product_a_id: 'safety-alpha', product_b_id: 'safety-beta', round_number: 4, votes_a: 0, votes_b: 0, voted_user_ids: [] });
let submits = 0, votes = 0;
let logoutFailure = true, logoutCalls = 0;
async function setup({ login = false, fixtures = false, blockedStorage = false } = {}) {
  // Fault scenarios must not inherit a previous scenario's auth/cache state.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(message.text().slice(0, 500));
  });
  page.on('requestfailed', request => diagnostics.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  if (blockedStorage) await page.evaluateOnNewDocument(() => {
    for (const name of ['getItem', 'setItem', 'removeItem']) Storage.prototype[name] = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  if (login) await page.evaluateOnNewDocument(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const reply = (body, status = 200) => request.respond({ status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (request.method() === 'OPTIONS') return void request.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' } });
    if (url.pathname === '/api/arena/products' && request.method() === 'POST') {
      submits++; setTimeout(() => void reply({ error: 'Injected submission outage' }, 503), 400); return;
    }
    if (url.pathname === '/api/arena/vote' && request.method() === 'POST') {
      votes++; setTimeout(() => void reply({ error: 'Injected voting outage' }, 503), 400); return;
    }
    if (url.pathname === '/api/arena/products/mine') return void reply({ productIds: [], products: [] });
    if (url.pathname === '/auth/v1/user') return void reply(user);
    if (url.pathname === '/auth/v1/logout') { logoutCalls++; return void reply(logoutFailure ? { message: 'Injected logout outage' } : {}, logoutFailure ? 503 : 200); }
    // Every write is intercepted; fixtures never reach the database.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return void reply({ recorded: 0 });
    if (url.hostname.endsWith('.supabase.co')) {
      // Let SSR logo requests fail first, then replace products. This catches
      // imperative img.remove() corrupting React's tree during revalidation.
      if (fixtures && url.pathname.endsWith(`${prefix}public_products`)) return void setTimeout(() => reply(products), 500);
      if (fixtures && url.pathname.endsWith(`${prefix}public_brackets`)) return void reply(url.searchParams.get(`${prefix}status`) === 'eq.completed' ? [] : [bracket]);
      if (fixtures && url.pathname.endsWith(`${prefix}public_matches`)) return void reply([match]);
      if (fixtures && url.pathname.endsWith(`${prefix}public_votes`)) return void reply([]);
      return void request.abort();
    }
    if (url.pathname.startsWith('/_vercel/')) return void request.abort();
    return void request.continue();
  });
  return page;
}
try {
  const storagePage = await setup({ blockedStorage: true });
  await storagePage.goto(base, { waitUntil: 'domcontentloaded' });
  await storagePage.waitForSelector('#discovery-grid');
  for (let i = 0; i < 8; i++) {
    await storagePage.$eval('[aria-controls="discovery-grid"]', el => el.click());
    await storagePage.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
    await delay(50);
  }
  assert(await storagePage.$$eval('#discovery-grid a', els => els.length > 0));
  results.push('Blocked storage: eight deck changes including reseeding stay usable');
  await storagePage.close();

  const page = await setup({ login: true });
  await page.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="product-form-title"]')?.textContent.includes('resilience-test'));
  for (const [selector, value] of Object.entries({ '#product-title': 'Reliability Fixture', '#product-tagline': 'A fixture that will never be written to the real database.', '#product-url': 'https://example.invalid', '#product-description': 'This is a test of error recovery and repeat clicks. All submission requests are intercepted and no product is ever created.' })) await page.type(selector, value);
  const submitForm = '[aria-labelledby="product-form-title"] form';
  await page.$eval(submitForm, form => { for (let i = 0; i < 5; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="product-form-title"]')?.textContent.includes('Injected submission outage'));
  assert.equal(submits, 1);
  assert.equal(await page.$eval('#product-title', el => el.value), 'Reliability Fixture');
  assert.equal(await page.$eval(`${submitForm} button[type="submit"]`, el => el.disabled), false);
  await page.$eval(submitForm, form => form.requestSubmit());
  await delay(650); assert.equal(submits, 2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[aria-labelledby="product-form-title"]'));
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  results.push('Submit: five simultaneous events send once; 503 retains fields, unlocks retry and restores scrolling');
  await page.goto(`${base}/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header a[href="/?view=console"]');
  await page.setViewport({ width: 320, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.click('header a[href="/?view=console"]');
  await page.waitForSelector('.maker-console');
  results.push('Public account navigation: signed-in Console link works at 320px');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Sign out').click());
  await page.waitForFunction(() => document.body.textContent.includes('Sign-out could not finish'));
  assert(await page.$('.maker-console'));
  assert(await page.evaluate(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'Sign out' && !el.disabled)));
  logoutFailure = false;
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Sign out').click());
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'Sign in'));
  results.push('Sign-out: server failure does not pretend success; retry clears the authenticated UI');
  await page.close();

  const anonymous = await setup();
  await anonymous.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Clipboard denied')) } }));
  await anonymous.goto(`${base}/products/https`, { waitUntil: 'domcontentloaded' });
  await anonymous.waitForSelector('input[aria-label="Share link"]');
  await anonymous.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'COPY').click());
  await anonymous.waitForFunction(() => document.body.textContent.includes('copy the link manually'));
  await anonymous.click('header a[href="/?signin=1"]');
  await anonymous.waitForSelector('.auth-dialog');
  await anonymous.keyboard.press('Escape');
  await anonymous.waitForFunction(() => !document.querySelector('.auth-dialog'));
  await anonymous.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
  await anonymous.waitForSelector('[aria-labelledby="product-form-title"]');
  await anonymous.$eval('[aria-labelledby="product-form-title"] form', form => form.requestSubmit());
  await anonymous.waitForSelector('.auth-dialog');
  await anonymous.keyboard.press('Escape');
  await anonymous.waitForFunction(() => !document.querySelector('.auth-dialog'));
  assert.equal(await anonymous.evaluate(() => document.body.style.overflow), 'hidden');
  await anonymous.keyboard.press('Escape');
  await anonymous.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.notEqual(await anonymous.evaluate(() => document.body.style.overflow), 'hidden');
  results.push('Clipboard denial has a manual fallback; nested sign-in/submit dialogs preserve then release the scroll lock');
  await anonymous.close();

  const votePage = await setup({ login: true, fixtures: true });
  await votePage.goto(`${base}/arena`, { waitUntil: 'domcontentloaded' });
  await votePage.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'VOTE FOR A' && !el.disabled));
  await votePage.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'VOTE FOR A' && !el.disabled).click());
  await votePage.waitForSelector('[aria-label="Vote and give feedback"]');
  const textareas = await votePage.$$('[aria-label="Vote and give feedback"] textarea');
  await textareas[0].type('The workflow is clear and easy to follow.');
  await textareas[1].type('Please make the initial setup instructions clearer.');
  await votePage.$eval('[aria-label="Vote and give feedback"] form', form => { for (let i = 0; i < 5; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await votePage.waitForFunction(() => document.querySelector('[aria-label="Vote and give feedback"]')?.textContent.includes('Injected voting outage'));
  assert.equal(votes, 1);
  assert.equal(await votePage.$eval('[aria-label="Vote and give feedback"] fieldset', el => el.disabled), false);
  assert.equal(await votePage.$eval('[aria-label="Vote and give feedback"] textarea', el => el.value), 'The workflow is clear and easy to follow.');
  await votePage.keyboard.press('Escape');
  await votePage.waitForFunction(() => !document.querySelector('[aria-label="Vote and give feedback"]'));
  assert.notEqual(await votePage.evaluate(() => document.body.style.overflow), 'hidden');
  results.push('Failed logo + product refresh preserves React DOM; vote duplicates send once and failed critiques remain editable');
  await votePage.close();
  assert.deepEqual(errors, []);
  assert(!diagnostics.some(message => /removeChild|\[INDIE CLASH\] Route error|Minified React error|Hydration failed/i.test(message)), 'No swallowed React/route errors');
  console.log(JSON.stringify({ results, browserErrors: errors }, null, 2));
} catch (error) {
  const states = await Promise.all((await browser.pages()).map(p => p.evaluate(() => ({ path: location.pathname, body: document.body.innerHTML.slice(0, 900), tail: document.body.innerHTML.slice(-900), buttons: [...document.querySelectorAll('button')].map(el => ({ text: el.textContent.trim(), disabled: el.disabled })).filter(el => /Sign|Disconnect/.test(el.text)), console: !!document.querySelector('.maker-console') })).catch(() => ({}))));
  console.log(JSON.stringify({ completed: results, browserErrors: errors, diagnostics: diagnostics.slice(-20), logoutCalls, states }, null, 2));
  throw error;
} finally { await browser.close(); }
