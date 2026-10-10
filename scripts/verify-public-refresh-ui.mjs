import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3000';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let mode = process.env.PUBLIC_REFRESH_TEST_FAILURE || 'offline', productRequests = 0;
assert(['offline', 'timeout'].includes(mode));
const errors = [], consoleErrors = [];
const rows = Array.from({ length: 3 }, (_, i) => ({
  shipandbattle_id: `refresh-fixture-${i}`, shipandbattle_title: `Recovered Product ${i}`,
  shipandbattle_tagline: 'An isolated refresh test product.', shipandbattle_url: `https://refresh-${i}.example.com`,
  shipandbattle_maker_name: 'Test Maker', shipandbattle_logo: '🚀', shipandbattle_submitted_at: '2026-10-10T00:00:00Z',
  shipandbattle_queue_status: 'waiting', shipandbattle_votes_count: 0, shipandbattle_arena_enqueued: false,
}));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900 });
  await page.setRequestInterception(true);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    const reply = (data, status = 200) => request.respond({ status,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      contentType: 'application/json', body: JSON.stringify(data),
    });
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,OPTIONS',
    } });
    // All writes and authentication are blocked; only public GETs are mocked.
    if (!['GET', 'HEAD'].includes(request.method())) return reply({ recorded: 0 });
    if (url.pathname.endsWith('public_products')) {
      productRequests++;
      if (mode === 'timeout') return; // The application's 15s AbortSignal cancels this paused GET.
      if (mode === 'offline') return setTimeout(() => request.abort(), 1000);
      if (mode === 'http-error') return reply({ code: 'TEST_OUTAGE', message: 'Injected read-only outage' }, 503);
      return setTimeout(() => reply(mode === 'empty' ? [] : rows), 400);
    }
    if (url.pathname.endsWith('public_brackets') || url.pathname.endsWith('public_matches') || url.pathname.endsWith('public_votes')) return reply([]);
    if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
    return request.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#discovery-grid a');
  const displayedLinks = () => page.$$eval('#discovery-grid a', links => links.map(a => a.getAttribute('href')));
  const initial = await displayedLinks();
  await page.waitForSelector('[data-public-refresh-error]', { visible: true });
  assert.deepEqual(await displayedLinks(), initial, 'Offline refresh must preserve current products');
  assert(productRequests >= 1, 'A failed request must be made; the SDK may retry network failures');
  assert(await page.$eval('[data-public-refresh-error]', e => e.textContent.includes('may be out of date')));
  assert(!consoleErrors.some(message => message.includes('Error syncing data')));
  assert(await page.evaluate(() => !document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog]')));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-refresh-'));
  await page.screenshot({ path: path.join(output, 'refresh-error-mobile.png') });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('PASS: network failure shows an inline status, preserves products, and does not trigger the Next error overlay.');

  mode = 'success';
  const before = productRequests;
  await page.$eval('[data-public-refresh-error] button', button => { for (let i = 0; i < 4; i++) button.click(); });
  await page.waitForFunction(() => document.querySelector('[data-public-refresh-error] button')?.disabled);
  await page.waitForFunction(() => !document.querySelector('[data-public-refresh-error]'));
  await page.waitForFunction(() => document.body.textContent.includes('Recovered Product 0'));
  assert.equal(productRequests, before + 1);
  const recovered = await displayedLinks();
  assert.equal(recovered.length, 3);
  console.log('PASS: Retry sends one request despite repeat clicks; success updates the list and clears the warning.');

  await new Promise(resolve => setTimeout(resolve, 1100));
  mode = 'http-error';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('[data-public-refresh-error]', { visible: true });
  assert.deepEqual(await displayedLinks(), recovered, '503 must not replace current data');
  mode = 'empty';
  await page.click('[data-public-refresh-error] button');
  await page.waitForFunction(() => !document.querySelector('[data-public-refresh-error]'));
  assert.equal((await displayedLinks()).length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: HTTP failure is visible; a genuine empty successful response remains valid; no browser runtime exceptions.');
  console.log(`Screenshot: ${output}`);
} finally { await browser.close(); }
