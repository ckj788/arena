import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';

// Use the opt-in product-safety-fixture server. Browser intercepts ALL writes.
const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const uid = '00000000-0000-4000-8000-000000000001';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'fixture' } };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, exp: Math.floor(Date.now()/1000)+3600 })}.fixture`;
let created = null;
let writes = 0;
await page.evaluateOnNewDocument((session) => {
  // Next may inline a locally configured public project URL. Mock its storage
  // key too; every Supabase request is intercepted below, regardless of project.
  const get = Storage.prototype.getItem;
  Storage.prototype.getItem = function(key) {
    if (/^sb-.*-auth-token$/.test(key)) return JSON.stringify(session);
    return get.call(this, key);
  };
}, { access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, user });
await page.setRequestInterception(true);
page.on('request', request => {
  const url = new URL(request.url());
  const respond = body => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.endsWith('/user')) return respond(user);
    return respond([]);
  }
  if (url.pathname === '/api/arena/products/mine') return respond({ products: created ? [created] : [], productIds: created ? [created.id] : [] });
  if (url.pathname === '/api/arena/products' && request.method() === 'POST') {
    writes++;
    created = { ...JSON.parse(request.postData()), id: 'resource-test', creator_uid: uid, submittedAt: new Date().toISOString(), queueStatus: 'waiting', arenaEnqueued: false, votesCount: 0, moderationStatus: 'unreviewed' };
    return respond({ product: created });
  }
  if (!['GET','HEAD','OPTIONS'].includes(request.method())) return respond({ ok: true });
  return request.continue();
});
const clickButton = async label => {
  const found = await page.evaluate(label => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getClientRects().length);
    button?.click(); return Boolean(button);
  }, label);
  assert(found, `Button not found: ${label}`);
};
try {
  await page.setViewport({ width: 1280, height: 900 });
  const response = await page.goto(`${base}/resources/startup-launch-directories`, { waitUntil: 'networkidle2' });
  assert.equal(response.status(), 200);
  assert.equal(await page.$$eval('article', nodes => nodes.length), 12);
  const structured = await page.$$eval('script[type="application/ld+json"]', nodes => nodes.flatMap(node => JSON.parse(node.textContent)['@graph'] || []));
  assert.equal(structured.find(item => item['@type'] === 'CollectionPage').mainEntity.numberOfItems, 12);
  assert.equal(await page.$$eval('h1', nodes => nodes.length), 1);
  await page.click('[aria-label="Quick platform selection"] button');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 8);
  await clickButton('Clear filters');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 12);
  assert(await page.$$eval('nav[aria-label="On this page"] a', nodes => nodes.every(node => document.getElementById(node.hash.slice(1)))));
  await page.waitForSelector('#recent-launches');
  assert.equal(await page.$$eval('[aria-labelledby="recent-launches"] a[href^="/products/"]', nodes => nodes.length), 6);
  const recentLinks = () => page.$$eval('#recent-launch-grid a', nodes => nodes.map(node => node.getAttribute('href')));
  const firstRecent = await recentLinks();
  const nextRecent = 'button[aria-controls="recent-launch-grid"]';
  await page.$eval(nextRecent, button => { button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('#recent-launch-grid')?.getAttribute('aria-busy') === 'false');
  const lastRecent = await recentLinks();
  assert.equal(lastRecent.length, 1, 'Seven public fixtures produce six cards then one');
  assert(!firstRecent.includes(lastRecent[0]), 'Next group must contain a new product');
  assert.equal(new Set([...firstRecent, ...lastRecent]).size, 7);
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.click(nextRecent);
  await page.waitForFunction(() => document.querySelector('#recent-launch-grid')?.getAttribute('aria-busy') === 'false');
  assert.deepEqual(await recentLinks(), firstRecent, 'Explore again returns to first six with reduced motion');
  await page.emulateMediaFeatures([]);
  assert(!(await page.content()).includes('/products/safety-fixture-7'), 'Restricted product excluded');
  await page.click('article summary');
  assert(await page.$eval('article details', el => el.open), 'Details expand');
  await page.focus('article summary');
  await page.keyboard.press('Enter');
  assert(!(await page.$eval('article details', el => el.open)), 'Keyboard collapses row');
  await clickButton('Pre-launch');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 2);
  await clickButton('Builder feedback');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 4);
  await clickButton('SaaS & software');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 6);
  await clickButton('All launches');
  assert.equal(await page.$eval('link[rel=canonical]', el => el.href), 'https://www.indieclash.com/resources/startup-launch-directories');
  await page.select('select', 'Free');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 8);
  await page.type('input[type=search]', 'nothing-matches-123');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 0);
  await clickButton('Clear filters');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 12);
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 850 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: path.join(os.tmpdir(), 'indieclash-resource-directory-preview.png'), fullPage: true });
  await page.goto(`${base}/?submit=1`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#product-title', { visible: true });
  await page.type('#product-title', 'Resource Test');
  await page.type('#product-tagline', 'A working tool for preparing thoughtful product launches.');
  await page.type('#product-url', 'https://fixture.example.com');
  const textarea = await page.$('textarea[maxlength="2000"]');
  assert(textarea, 'Description textarea');
  await textarea.type('Prepare a useful product launch by gathering screenshots, writing a practical use case, and choosing a community that fits your product.');
  await page.select('#product-category', 'launch-tools');
  await clickButton('Submit Project');
  await page.waitForFunction(() => document.body.textContent.includes('Your product is live'));
  assert.equal(writes, 1);
  assert.equal(created.category, 'launch-tools');
  const shareUrl = await page.$eval('[role=dialog] a[href*="x.com/intent"]', el => el.href);
  assert(new URL(shareUrl).searchParams.get('text').includes('/products/resource-test'));
  await clickButton('My Console →');
  await page.waitForFunction(() => document.body.innerText.includes('Share & improve profile'));
  assert.equal(errors.length, 0, errors.join('\n'));
  const noJs = await browser.newPage();
  await noJs.setJavaScriptEnabled(false);
  await noJs.goto(`${base}/resources/startup-launch-directories`);
  assert.equal(await noJs.$$eval('article', nodes => nodes.length), 12, 'SSR content without JavaScript');
  assert.equal(await noJs.$$eval('#launch-faq details', nodes => nodes.length), 5, 'FAQ is server rendered');
  await noJs.close();
  console.log('PASS: resource SSR/canonical, filters, empty state, mobile layout, submission, success share URL and console. All writes mocked.');
} catch (error) {
  console.error(await page.$eval('body', el => el.innerText.slice(-3500)));
  throw error;
} finally { await browser.close(); }
