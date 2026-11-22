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
  let checkoutRequests = 0, linkRequests = 0, rejectNext = true;
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/payments/checkout') {
      checkoutRequests++;
      const body = JSON.parse(request.postData());
      assert.match(body.requestId, /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      if (rejectNext) {
        rejectNext = false;
        return request.respond({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many payment requests.' }) });
      }
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId, orderId: 'fixture-order', url: config.links[body.plan].url }) });
    }
    if (url.pathname === '/api/payments/links') {
      linkRequests++;
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, userId,
        links: Object.fromEntries(Object.entries(config.links).map(([plan, link]) => [plan, link.url])) }) });
    }
    if (url.hostname === 'checkout.stripe.com') {
      await request.respond({ status: 200, contentType: 'text/html', body: '<h1>Stripe navigation captured</h1>' });
      return;
    }
    if (url.hostname.endsWith('.supabase.co')) return request.respond({ status: 200, contentType: 'application/json', body: '[]' });
    return request.continue();
  });
  for (const plan of ['starter', 'growth', 'pro']) {
    const before = checkoutRequests;
    await page.goto(config.baseUrl + '/submit?plan=' + plan, { waitUntil: 'networkidle0' });
    await page.reload({ waitUntil: 'networkidle0' });
    const selector = '[data-plan="' + plan + '"] button.launch-card-choice:enabled';
    await page.waitForSelector(selector);
    assert.equal(checkoutRequests, before, 'Opening and refreshing must consume zero checkout quota');
    if (plan === 'starter') {
      await page.click(selector);
      await page.waitForSelector('[data-plan="starter"] [role="alert"]');
      assert.equal(await page.$$eval('[role="alert"]', nodes => nodes.length), 1);
    }
    const requestsBeforeClick = checkoutRequests;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.$eval(selector, button => { button.click(); button.click(); }),
    ]);
    assert.equal(page.url(), config.links[plan].url);
    assert.equal(checkoutRequests, requestsBeforeClick + 1);
    assert.equal(linkRequests, 0);
    console.log(plan + ': no requests on load/reload, one on double click, correct destination.');
  }
  console.log('PASS: real local page/native navigation, mocked account and binding responses. No payment performed.');
} finally { await browser.close(); }
