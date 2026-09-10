import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual update helper against an in-memory query stub.
let storedUpdate;
const query = {
  select() { return this; }, eq() { return this; },
  async maybeSingle() { return { data: { shipandbattle_id: 'test', shipandbattle_creator_uid: 'owner' }, error: null }; },
  update(value) { storedUpdate = value; return this; },
  async single() { return { data: storedUpdate, error: null }; },
};
const adminModule = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync('lib/server/arenaAdmin.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { exports: adminModule.exports, module: adminModule, console, require(name) {
  if (name === './auth') return { getAdminClient: () => ({ from: () => query }), HttpError: Error };
  if (name === '@/lib/supabaseClient') return { DB_PREFIX: 'shipandbattle_' };
  if (name === '@/lib/arenaStore') return { fromDbProduct: row => row };
  return {};
} });
for (const category of ['ai-tools', undefined]) {
  await adminModule.exports.updateOwnedProduct({ id: 'owner' }, 'test', { category });
  assert.equal(storedUpdate.shipandbattle_category, category || null);
}
console.log('PASS: real update helper writes category or NULL (in-memory database stub)');

// Isolated browser with fake identity. All writes are intercepted, never sent.
const base = 'http://localhost:3107';
const env = fs.readFileSync('.env.local', 'utf8');
const publicUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'category-test' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.test-only`;
const session = { access_token: token, refresh_token: 'test-only', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
const key = `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
const product = { id: 'category-test', title: 'Category test', tagline: 'A test product that will never be published', url: 'https://example.com', category: 'design-tools', description: 'A private test fixture used to verify that product categories are saved correctly without making any real submissions.', makerName: 'Test', makerTwitter: '@test', logo: '🚀', submittedAt: new Date().toISOString(), queueStatus: 'waiting', arenaEnqueued: false, creator_uid: user.id, votesCount: 0 };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const writes = [];
try {
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) {
      if (u.pathname.startsWith('/api/arena/products')) writes.push({ method: r.method(), body: JSON.parse(r.postData()) });
      return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"Test interception: nothing was saved"}' });
    }
    if (u.pathname === '/auth/v1/user') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname === '/api/arena/products/mine') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ productIds: [product.id], products: [product] }) });
    if (u.hostname.endsWith('.supabase.co') || u.pathname.startsWith('/_vercel/')) return r.abort();
    return r.continue();
  });
  await page.evaluateOnNewDocument(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate((product) => sessionStorage.setItem('indieclash_oauth_submit_draft_v1', JSON.stringify({ ...product, category: 'video-tools', maker: 'Test', twitter: '@test' })), product);
  await page.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#product-category');
  assert.equal(await page.$eval('#product-category', e => e.value), 'video-tools');
  assert.equal(await page.$eval('#product-category', e => e.options.length), 9);
  assert.equal(await page.$eval('#product-category', e => e.required), false);
  const submit = async () => {
    const n = writes.length;
    await page.click('[aria-labelledby="product-form-title"] button[type="submit"]');
    for (let i = 0; i < 50 && writes.length === n; i++) await new Promise(r => setTimeout(r,100));
    assert.equal(writes.length, n + 1);
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="product-form-title"] button[type="submit"]').disabled);
  };
  await page.select('#product-category', 'ai-tools');
  await submit();
  assert.equal(writes.at(-1).body.category, 'ai-tools');
  await page.select('#product-category', '');
  await submit();
  assert.equal(writes.at(-1).body.category, undefined);
  console.log('PASS: OAuth draft, eight categories, optional selection, create payload');
  await page.goto(`${base}/?view=console`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maker-console');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(e => e.textContent.includes('Edit Profile')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Edit Profile')).click());
  await page.waitForSelector('#product-category');
  assert.equal(await page.$eval('#product-category', e => e.value), 'design-tools');
  await page.select('#product-category', 'developer-tools');
  await submit();
  assert.equal(writes.at(-1).body.category, 'developer-tools');
  assert.notEqual(writes.at(-1).method, 'POST');
  console.log('PASS: edit prefill and updated category payload');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-category-'));
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${base}/?submit=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#product-category');
    await page.$eval('#product-category', e => e.scrollIntoView({ block: 'center' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `form-${width}.png`) });
  }
  for (const route of ['/categories', '/categories/ai-tools']) assert.equal((await fetch(base + route)).status, 404);
  for (const route of ['/products', '/products/https', '/underrated', '/sitemap.xml', '/llms.txt']) {
    const body = await (await fetch(base + route)).text();
    assert(!/href="\/categories|<loc>[^<]*\/categories|https:\/\/www\.indieclash\.com\/categories/.test(body), route);
  }
  console.log('PASS: responsive form; public categories, sitemap and llms links disabled');
  console.log(output);
} finally { await browser.close(); }
