import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3172';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-duplicates-'));
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'duplicate-test' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.test-only`;
const session = { access_token: token, refresh_token: 'test-only', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
let owned = { id: 'safety-fixture-0', title: 'Safety Fixture 0', tagline: 'A fixture for testing product safety and screenshots.', url: 'https://product-0.example.com', description: 'An isolated test fixture with a detailed description for verifying duplicate submissions without modifying any real product.', makerName: 'Maker', makerTwitter: '@fixture', logo: '🚀', submittedAt: '2026-09-19T00:00:00Z', queueStatus: 'waiting', arenaEnqueued: false, creator_uid: user.id, votesCount: 0 };
const rows = Array.from({ length: 7 }, (_, index) => ({
  shipandbattle_id: `safety-fixture-${index}`, shipandbattle_title: `Safety Fixture ${index}`,
  shipandbattle_url: `https://product-${index}.example.com`, shipandbattle_tagline: owned.tagline,
  shipandbattle_description: owned.description, shipandbattle_maker_name: 'Maker', shipandbattle_maker_twitter: '@fixture',
  shipandbattle_logo: '🚀', shipandbattle_submitted_at: owned.submittedAt, shipandbattle_moderation_status: 'unreviewed',
}));
const errors = [], writes = [], uploads = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const dialog = '[aria-labelledby="product-form-title"]';
const replace = async (selector, value) => {
  await page.$eval(selector, element => { element.focus(); element.select(); });
  await page.keyboard.type(value);
};
try {
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const respond = (status, body) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/arena/logo') { uploads.push(request.postData()); return respond(403, { error: 'Unexpected image upload in duplicate test' }); }
    if (url.pathname === '/api/arena/products' && request.method() === 'POST') {
      const body = JSON.parse(request.postData()); writes.push({ method: 'POST', body });
      if (body.url.includes('newly-listed.example.com')) return respond(409, { error: 'This website has already been submitted to Indie Clash. View the existing profile: /products/concurrent-product.' });
      return respond(201, { product: { ...owned, ...body, id: 'new-fixture' } });
    }
    if (url.pathname === '/api/arena/products/safety-fixture-0' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData()); writes.push({ method: 'PATCH', body }); owned = { ...owned, ...body };
      return respond(200, { product: owned });
    }
    if (url.pathname === '/api/arena/products/mine') return respond(200, { productIds: [owned.id], products: [owned] });
    if (url.pathname === '/api/arena/moderation') return respond(403, { error: 'Admin access required.' });
    if (url.hostname.endsWith('.supabase.co')) {
      if (url.pathname === '/auth/v1/user') return respond(200, user);
      if (url.pathname.endsWith('public_products')) return respond(200, rows);
      return respond(200, []);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return respond(200, {});
    if (url.pathname.startsWith('/_vercel/')) return request.abort();
    return request.continue();
  });
  await page.evaluateOnNewDocument(value => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(value)), session);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(value => sessionStorage.setItem('indieclash_oauth_submit_draft_v1', JSON.stringify(value)), {
    title: 'Duplicate test', tagline: owned.tagline, url: 'https://www.product-0.example.com', description: owned.description,
    maker: 'Maker', twitter: '@fixture', logo: '🚀',
  });
  await page.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#product-title')?.value === 'Duplicate test');
  for (const url of ['https://www.product-0.example.com', 'product-0.example.com', 'www.PRODUCT-0.example.com', 'HTTP://PRODUCT-0.example.com/pricing?ref=launch#top', 'https://www.product-0.example.com.:8443/another',
    'https://product-0.example.com/page', 'https://www.product-0.example.com/resource',
    'https://product-0.example.com/resources/', 'https://www.product-0.example.com/resources/launch/guides/first?utm_source=directory#details']) {
    await replace('#product-url', url);
    await page.waitForSelector('#product-url-hint[role="alert"]');
    assert.equal(await page.$eval('#product-url', element => element.getAttribute('aria-invalid')), 'true');
    assert(await page.$eval(`${dialog} button[type="submit"]`, element => element.disabled));
    assert.equal(await page.$eval('#product-url-hint a', element => element.getAttribute('href')), '/products/safety-fixture-0');
    assert.equal(await page.$eval('#product-url-hint a', element => element.target), '_blank');
  }
  // Even a scripted form event must not bypass the client check or upload files.
  await page.$eval(`${dialog} form`, form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="product-form-title"] > div') !== null);
  assert.equal(writes.length, 0); assert.equal(uploads.length, 0);
  await page.setViewport({ width: 390, height: 844 });
  await page.$eval('#product-url', element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, 'mobile-duplicate-warning.png') });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await replace('#product-url', 'https://newly-listed.example.com');
  assert.equal(await page.$('#product-url-hint[role="alert"]'), null);
  await page.$eval(`${dialog} button[type="submit"]`, element => element.click());
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="product-form-title"]')?.innerText.includes('/products/concurrent-product.'));
  assert.equal(writes.length, 1);
  assert.equal(await page.$eval('#product-title', element => element.value), 'Duplicate test', 'server conflict preserves the draft');
  await replace('#product-url', 'HTTPS://different.example.com');
  await page.$eval(`${dialog} button[type="submit"]`, element => element.click());
  await page.waitForSelector(dialog, { hidden: true });
  assert.equal(writes.length, 2); assert.equal(writes.at(-1).body.url, 'https://different.example.com/');

  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/?view=console`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(element => element.textContent.includes('Edit Profile')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(element => element.textContent.includes('Edit Profile')).click());
  await page.waitForSelector('#product-url');
  await replace('#product-url', 'https://WWW.product-0.example.com/pricing');
  assert.equal(await page.$('#product-url-hint[role="alert"]'), null, 'own unchanged domain stays editable');
  await replace('#product-url', 'https://www.product-1.example.com/resources/launch/guide');
  await page.waitForSelector('#product-url-hint[role="alert"]');
  assert(await page.$eval(`${dialog} button[type="submit"]`, element => element.disabled));
  await replace('#product-url', 'https://product-0.example.com');
  await page.$eval(`${dialog} button[type="submit"]`, element => element.click());
  await page.waitForSelector(dialog, { hidden: true });
  assert.equal(writes.at(-1).method, 'PATCH');
  assert.deepEqual(errors, []);
  console.log('PASS: immediate www/bare/http/case/path/query/port warnings, existing profile link, disabled submit, scripted-event guard, zero duplicate uploads, mobile layout, stale-catalogue 409 draft retention, successful independent submission, unchanged own-domain edits and occupied-domain edit blocking. All mutations intercepted.');
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error('UI snapshot:', (await page.evaluate(() => document.body.innerText)).slice(-4500));
  throw error;
} finally {
  await browser.close();
}
