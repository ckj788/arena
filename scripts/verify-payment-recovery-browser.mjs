// Browser regression against a running local build, with all data/auth mocked.
// Does not create an order, upload a file, charge a card or send mail.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const owner = '11111111-1111-4111-8111-111111111111';
const sessionId = 'cs_test_browserrecovery';
const orderId = '11111111-2222-8333-a444-555555555555';
const key = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const expiry = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `e30.${Buffer.from(JSON.stringify({ sub: owner, exp: expiry })).toString('base64url')}.fixture`,
  refresh_token: 'fixture', expires_in: 3600, expires_at: expiry, token_type: 'bearer',
  user: { id: owner, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated',
    app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {} } };
const order = { id: orderId, plan: 'pro', status: 'paid', amount_total: 25900, currency: 'usd', details_submitted_at: null };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument((key, session) => localStorage.setItem(key, JSON.stringify(session)), key, session);
  let draft = null, saves = 0, reconciles = 0, submitted = null;
  const unnecessaryReads = [];
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const respond = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === `/api/payments/orders/${orderId}/draft`) {
      if (request.method() === 'PUT') { draft = JSON.parse(request.postData()); saves++; return respond({ orderId }); }
      return respond({ order, draft });
    }
    if (url.pathname === `/api/payments/orders/${orderId}/details` && request.method() === 'PUT') {
      submitted = JSON.parse(request.postData());
      order.product_id = 'browser-published-product';
      order.details_submitted_at = new Date().toISOString();
      return respond({ orderId, productId: order.product_id });
    }
    if (url.pathname === `/api/payments/orders/${orderId}`) return submitted ? respond({ order }) : respond({ error: 'Order not found.' }, 404);
    if (url.pathname === `/api/payments/orders/${orderId}/reconcile`) {
      reconciles++;
      return reconciles === 1 ? respond({ error: 'Temporary Stripe outage' }, 503) : respond({ order });
    }
    if (url.pathname.startsWith('/api/arena/') || url.hostname.endsWith('.supabase.co') && url.pathname.includes('/rest/')) unnecessaryReads.push(url.pathname);
    if (url.hostname.endsWith('.supabase.co')) return respond(url.pathname.endsWith('/user') ? session.user : []);
    if (url.pathname.startsWith('/api/arena/')) return respond({ productIds: [], products: [] });
    return request.continue();
  });
  await page.goto(`${base}/submit/details?order=${orderId}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#product-title');
  await page.type('#product-title', 'Saved incomplete product');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Save').click());
  await page.waitForFunction(() => document.body.innerText.includes('Saved. You can continue'));
  assert.equal(saves, 1);
  assert.equal(draft.title, 'Saved incomplete product');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('#product-title')?.value === 'Saved incomplete product');
  assert.deepEqual(unnecessaryReads, [], 'Paid form must not read or poll public Arena/owned products');
  console.log('PASS: incomplete Save, cloud draft restoration and no Arena/product requests on the paid form.');
  await page.goto(`${base}/submit/result?order=${orderId}&session_id=${sessionId}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Payment confirmed.'), { timeout: 30000 });
  assert.equal(reconciles, 2, 'Transient Stripe failure should recover automatically');
  await page.goto(`${base}/submit/details?order=${orderId}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#product-title');
  await page.type('#product-tagline', 'A complete product for normal discovery');
  await page.type('#product-url', 'example.com/resources');
  await page.type('#product-description', 'This product helps independent founders prepare their launch and organize their product information for discovery across useful platforms.');
  await page.type('#delivery-email', 'fixture@example.invalid');
  await page.click('input[name="directory-history"][value="none"]');
  await page.click('.submission-consent input');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Send product details')).click());
  await page.waitForSelector('a[href="/products/browser-published-product"]');
  assert.equal(submitted.product.title, 'Saved incomplete product');
  assert.equal(submitted.product.url, 'https://example.com/resources');
  assert.equal(submitted.serviceDetails.email, 'fixture@example.invalid');
  assert.equal(submitted.serviceDetails.consent, true);
  assert.equal(await page.$('a[href*="/submit/details?order="]'), null, 'Final order must no longer offer incomplete details');
  console.log('PASS: final paid form submits normal product information plus private service details and opens its linked public profile from the receipt.');
  await page.evaluate(key => {
    localStorage.removeItem(key);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    setTimeout(() => channel.close(), 200);
  }, key);
  await page.waitForFunction(() => !document.body.innerText.includes('Payment confirmed.'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: missing webhook + temporary Stripe outage recovery, and immediate receipt removal on sign-out.');
} finally { await browser.close(); }
