import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
// SSR uses only the explicitly opted-in, read-only fixture server.
for (const [id, hasOffer, price] of [[0, true, '19.99'], [1, true, '0'], [2, false], [3, false]]) {
  const response = await fetch(`${base}/products/safety-fixture-${id}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const graphs = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].flatMap(m => JSON.parse(m[1])['@graph'] || []);
  const product = graphs.find(n => n['@type'] === 'Product');
  assert.equal(Boolean(product), hasOffer);
  assert(graphs.some(n => n['@type'] === 'WebPage'));
  assert(graphs.some(n => n['@type'] === 'BreadcrumbList'));
  if (hasOffer) {
    assert.equal(product.offers.price, price); assert.equal(product.offers.priceCurrency, 'USD');
    assert(!product.image?.startsWith('data:')); assert(!product.aggregateRating);
    assert(html.includes('View official pricing'));
  } else {
    assert.equal(graphs.find(n => n['@type'] === 'WebPage').mainEntity, undefined);
    assert(!html.includes('View official pricing'));
  }
}
console.log('PASS: live SSR paid/free Offers, quote-less Paid/Freemium WebPages, breadcrumbs, no invented ratings or base64 schema images.');

const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'pricing-test' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.test-only`;
const session = { access_token: token, refresh_token: 'test-only', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
const quote = { planName: 'Pro', amount: '29', currency: 'USD', billingPeriod: 'month', pricingUrl: 'https://example.com/pricing' };
let owned = { id: 'pricing-test', title: 'Pricing test', tagline: 'An isolated pricing test product', url: 'https://example.com', pricingModel: 'paid', pricingDetails: quote, description: 'A private test fixture used to verify optional product pricing without creating or changing any real submissions.', makerName: 'Test', makerTwitter: '@test', logo: '🚀', submittedAt: new Date().toISOString(), queueStatus: 'waiting', arenaEnqueued: false, creator_uid: user.id, votesCount: 0 };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const writes = [], errors = [];
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-pricing-'));
try {
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) {
      if (u.pathname.startsWith('/api/arena/products')) {
        const body = JSON.parse(r.postData()); writes.push({ method: r.method(), path: u.pathname, body });
        owned = { ...owned, ...body, pricingDetails: body.pricingDetails || undefined };
        return r.respond({ status: r.method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify({ product: owned }) });
      }
      return r.respond({ status: 403, contentType: 'application/json', body: '{"error":"Test blocks all non-product writes"}' });
    }
    if (u.pathname === '/auth/v1/user') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname === '/api/arena/products/mine') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ productIds: [owned.id], products: [owned] }) });
    if (u.hostname.endsWith('.supabase.co') || u.pathname.startsWith('/_vercel/')) return r.abort();
    return r.continue();
  });
  await page.evaluateOnNewDocument(session => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), session);
  const draft = { ...owned, maker: 'Test', twitter: '@test' };
  const restore = async value => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(value => sessionStorage.setItem('indieclash_oauth_submit_draft_v1', JSON.stringify(value)), value);
    await page.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#product-plan-name');
    await page.waitForFunction(() => document.querySelector('#product-plan-name').value === 'Pro');
  };
  const submit = async () => {
    const count = writes.length;
    await page.$eval('[aria-labelledby="product-form-title"] button[type="submit"]', e => e.click());
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="product-form-title"]'));
    assert.equal(writes.length, count + 1);
  };
  await restore(draft);
  assert.equal(await page.$eval('#product-price-amount', e => e.value), '29');
  assert.equal(await page.$eval('#product-price-currency', e => e.value), 'USD');
  await submit();
  assert.equal(writes.at(-1).method, 'POST'); assert.deepEqual(writes.at(-1).body.pricingDetails, quote);
  console.log('PASS: login draft restores all price fields; create payload contains exact quote (write intercepted).');

  await page.goto(`${base}/?view=console`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maker-console');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(e => e.textContent.includes('Edit Profile')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Edit Profile')).click());
  await page.waitForSelector('#product-plan-name');
  assert.equal(await page.$eval('#product-plan-name', e => e.value), 'Pro');
  await page.$eval('#product-price-amount', e => { e.focus(); e.select(); });
  await page.type('#product-price-amount', '35');
  await submit(); assert.equal(writes.at(-1).method, 'PATCH'); assert.equal(writes.at(-1).body.pricingDetails.amount, '35');
  console.log('PASS: Console → Edit Profile prefills and updates price (write intercepted).');

  await restore({ ...draft, editingProductId: owned.id, source: 'console' });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Clear plan details')).click());
  await submit(); assert.equal(writes.at(-1).method, 'PATCH'); assert.equal(writes.at(-1).body.pricingDetails, null);
  console.log('PASS: edit draft remains PATCH after login recovery; clearing sends explicit NULL.');

  await restore(draft);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Clear plan details')).click());
  await page.type('#product-plan-name', 'Partial');
  const count = writes.length;
  await page.$eval('[aria-labelledby="product-form-title"] button[type="submit"]', e => e.click());
  await page.waitForFunction(() => document.body.textContent.includes('Complete all plan fields'));
  assert.equal(writes.length, count);
  console.log('PASS: incomplete quote blocked before request.');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Clear plan details')).click());
  await submit();
  assert.equal(writes.at(-1).method, 'POST');
  assert.equal('pricingDetails' in writes.at(-1).body, false);
  console.log('PASS: new submissions can skip pricing entirely.');

  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 1000 });
    await restore(draft);
    const details = await page.$('#product-plan-name');
    await details.evaluate(e => { e.closest('details').open = true; e.scrollIntoView({ block: 'center' }); });
    await page.screenshot({ path: path.join(output, `form-${width}.png`) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const bounds = await page.$eval('#product-price-currency', e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right }; });
    assert(bounds.left >= 0 && bounds.right <= width);
  }
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/products/safety-fixture-0`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pricing-heading', { visible: true });
  await page.$eval('#pricing-heading', e => e.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, 'profile-price.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile layout, visible profile price, no browser runtime errors.');
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
