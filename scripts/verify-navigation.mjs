import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-navigation-'));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  // No submissions, votes, settlement, or exposure writes during verification.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
  if ((url.hostname.endsWith('.supabase.co') && request.resourceType() !== 'image') || url.pathname.startsWith('/_vercel/')) return request.abort();
  return request.continue();
});
const waitForPage = async (name) => {
  await page.waitForSelector(`[data-main-page="${name}"]`);
  await page.waitForFunction(() => [...document.querySelectorAll('h1')].every((el) => Number(getComputedStyle(el).opacity) === 1));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-home-reveal], [data-home-reveal="how-steps"] > *, [data-discovery-card]')].every((el) => {
    const rect = el.getBoundingClientRect();
    return rect.bottom <= 0 || rect.top >= innerHeight || Number(getComputedStyle(el).opacity) === 1;
  }));
};
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setJavaScriptEnabled(false);
  for (const [route, name, title] of [['/', 'discover', 'Discover New Indie Products'], ['/arena', 'arena', 'Arena'], ['/champions', 'champions', 'Champions']]) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    assert.equal(await page.$$eval('h1', (els) => els.length), 1);
    assert((await page.title()).includes(title));
    assert.equal(await page.$eval('link[rel="canonical"]', (el) => el.href), `https://www.indieclash.com${route}`);
    assert(!(await page.$eval('meta[name="robots"]', (el) => el.content)).includes('noindex'));
    assert.equal(await page.$eval('[data-main-page]', (el) => el.dataset.mainPage), name);
    assert.equal(await page.$$eval('header a[aria-current="page"]', (els) => [...new Set(els.map((el) => el.getAttribute('href')))].join()), route);
    assert(await page.$$eval('script[type="application/ld+json"]', (els) => els.length > 0 && els.every((el) => !!JSON.parse(el.textContent))));
    assert.equal(Boolean(await page.$('#launches-section')), name === 'discover');
    assert.equal(Boolean(await page.$('#new-and-unseen-section')), name === 'discover');
    assert.equal(Boolean(await page.$('#arena-section')), name === 'arena');
    assert.equal(Boolean(await page.$('#champions-section')), name === 'champions');
    assert.equal(Boolean(await page.$('#how-it-works-section')), name === 'champions');
    assert(await page.$('a[href="/products"]'), 'The product directory stays discoverable');
  }
  console.log('PASS: independent server-rendered pages, own canonical/title, JSON-LD, and visible content without JavaScript');
  await page.setJavaScriptEnabled(true);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await waitForPage('discover');
  await page.click('header a[href="/arena"]');
  await waitForPage('arena');
  await page.click('header a[href="/champions"]');
  await waitForPage('champions');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await waitForPage('arena');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await waitForPage('discover');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await waitForPage('arena');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPage('arena');
  console.log('PASS: navigation, Back/Forward, and refresh agree with the URL');

  for (const [fragment, name] of [['arena-section', 'arena'], ['champions-section', 'champions'], ['how-it-works-section', 'champions']]) {
    await page.goto(`${base}/#${fragment}`, { waitUntil: 'domcontentloaded' });
    await waitForPage(name);
    assert.equal(new URL(page.url()).pathname, `/${name}`);
    if (fragment === 'how-it-works-section') {
      assert.equal(new URL(page.url()).hash, '#how-it-works-section');
      await page.waitForFunction(() => {
        const box = document.querySelector('#how-it-works-section').getBoundingClientRect();
        return box.top >= 0 && box.top < innerHeight;
      });
    }
  }
  console.log('PASS: previously shared homepage anchors reach their new pages');

  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
    for (const [route, name] of [['/', 'discover'], ['/arena', 'arena'], ['/champions', 'champions']]) {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await waitForPage(name);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must fit ${width}px`);
      await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: width === 1440 });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS: desktop/mobile layouts with no browser exceptions', screenshots: output }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  console.log(JSON.stringify({ screenshots: output, errors }));
  throw error;
} finally {
  await browser.close();
}
