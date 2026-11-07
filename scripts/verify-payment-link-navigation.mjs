// Isolated browser fixture. No real sign-in, order, payment, or user profile.
// Run against local dev: node --require ./scripts/local-network.cjs scripts/verify-payment-link-navigation.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const config = { baseUrl: process.env.VERIFY_BASE_URL || 'http://localhost:3000', links: Object.fromEntries(['starter', 'growth', 'pro'].map(plan => [plan, { url: `https://checkout.stripe.com/c/pay/cs_test_${plan}` }])) };
const userId = '11111111-1111-4111-8111-111111111111';
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt })).toString('base64url'), 'offline-fixture'].join('.');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000 });
  const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await page.evaluateOnNewDocument((key, session) => { localStorage.setItem(key, JSON.stringify(session)); }, storageKey,
    { access_token: token, refresh_token: 'offline-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {} } });
  let checkoutRequests = 0, linkRequests = 0, navigationTime, navigationDone;
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/payments/checkout') {
      checkoutRequests++;
      const body = JSON.parse(request.postData());
      assert.match(body.requestId, /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId, orderId: 'fixture-order', url: config.links[body.plan].url }) });
    }
    if (url.pathname === '/api/payments/links') {
      linkRequests++;
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, userId,
        links: Object.fromEntries(Object.entries(config.links).map(([plan, link]) => [plan, link.url])) }) });
    }
    if (url.hostname === 'checkout.stripe.com') {
      navigationTime = performance.now();
      await request.respond({ status: 200, contentType: 'text/html', body: '<h1>Stripe navigation captured</h1>' });
      navigationDone?.();
      return;
    }
    if (url.hostname.endsWith('.supabase.co')) return request.respond({ status: 200, contentType: 'application/json', body: '[]' });
    return request.continue();
  });
  for (const plan of ['starter', 'growth', 'pro']) {
    await page.goto(`${process.env.VERIFY_BASE_URL || config.baseUrl}/submit?plan=${plan}`, { waitUntil: 'networkidle0', timeout: 60000 });
    const selector = '.launch-selection-bar a.exhibition-button';
    await page.waitForSelector(selector);
    const url = await page.$eval(selector, a => a.href);
    assert.equal(url, config.links[plan].url);
    const before = { checkoutRequests, linkRequests };
    const navigation = new Promise(resolve => { navigationDone = resolve; });
    const started = performance.now();
    await page.click(selector);
    await navigation;
    const elapsed = navigationTime - started;
    assert.equal(checkoutRequests, before.checkoutRequests, 'Click must not create a session');
    assert.equal(linkRequests, 0, 'Fixed payment links must not be requested');
    assert(elapsed < 1000, `Navigation took ${elapsed}ms`);
    console.log(`${plan}: native Stripe navigation started in ${elapsed.toFixed(0)}ms; click-time API requests: 0.`);
  }
  console.log('PASS: real local page/native navigation, mocked account and binding responses. No payment performed.');
} finally { await browser.close(); }
