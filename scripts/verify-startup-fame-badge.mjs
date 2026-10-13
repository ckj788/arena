import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3144';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const badgeHref = 'https://startupfa.me/s/indie-clash?utm_source=www.indieclash.com';
const badgeSrc = 'https://startupfa.me/badges/featured-badge-small.webp';
const toolPilotHref = 'https://www.toolpilot.ai';
const toolPilotSrc = 'https://www.toolpilot.ai/cdn/shop/files/toolpilot-badge-w.png';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-startup-fame-'));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', request => {
  const url = new URL(request.url());
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return request.abort();
  if (['localhost', '127.0.0.1'].includes(url.hostname) || request.resourceType() === 'image' || url.protocol === 'data:') return request.continue();
  return request.abort();
});
try {
  await page.setJavaScriptEnabled(false);
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
  assert.equal(await page.$$eval(`footer a[href="${badgeHref}"]`, nodes => nodes.length), 1);
  assert.equal(await page.$eval(`footer a[href="${badgeHref}"] img`, node => node.src), badgeSrc);
  assert.equal(await page.$eval(`footer a[href="${badgeHref}"]`, node => node.target), '_blank');
  assert.equal(await page.$eval(`footer a[href="${badgeHref}"]`, node => node.rel), 'noopener noreferrer');
  assert.equal(await page.$$eval(`footer a[href="${toolPilotHref}"]`, nodes => nodes.length), 1);
  assert.equal(await page.$eval(`footer a[href="${toolPilotHref}"] img`, node => node.src), toolPilotSrc);
  assert.equal(await page.$eval(`footer a[href="${toolPilotHref}"]`, node => node.target), '_blank');
  assert.equal(await page.$eval(`footer a[href="${toolPilotHref}"]`, node => node.rel), 'noopener noreferrer');
  await page.setJavaScriptEnabled(true);
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const initial = await page.$eval(`footer a[href="${badgeHref}"]`, node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { top: rect.top, viewportHeight: innerHeight, width: rect.width, height: rect.height, hidden: node.hidden, display: style.display, visibility: style.visibility, opacity: style.opacity, tabIndex: node.tabIndex, position: style.position };
    });
    assert(initial.top >= initial.viewportHeight, 'The badge stays below the first screen');
    assert.equal(initial.width, 224);
    assert.equal(initial.height, 36);
    assert.equal(initial.hidden, false);
    assert.equal(initial.visibility, 'visible');
    assert.equal(initial.opacity, '1');
    assert.equal(initial.tabIndex, 0);
    assert(!['fixed', 'absolute'].includes(initial.position));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    await page.$eval(`footer a[href="${badgeHref}"]`, node => node.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(src => {
      const image = [...document.images].find(node => node.src === src);
      return image?.complete && image.naturalWidth > 0;
    }, { timeout: 15000 }, badgeSrc);
    assert(await page.$eval(`footer a[href="${badgeHref}"]`, node => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), 'The visible badge must not be covered by another element');
    assert(await page.$eval(`footer a[href="${badgeHref}"] img`, node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return !node.hidden && style.display !== 'none' && style.visibility === 'visible' && style.opacity === '1' && rect.top >= 0 && rect.bottom <= innerHeight;
    }));
    await page.$eval(`footer a[href="${toolPilotHref}"]`, node => node.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(src => {
      const image = [...document.images].find(node => node.src === src);
      return image?.complete && image.naturalWidth > 0;
    }, { timeout: 15000 }, toolPilotSrc);
    assert(await page.$eval(`footer a[href="${toolPilotHref}"]`, node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const image = node.querySelector('img');
      return !node.hidden && node.tabIndex === 0 && style.display !== 'none' && style.visibility === 'visible' && style.opacity === '1' && !image.hidden && image.getBoundingClientRect().height === 36 && rect.top >= 0 && rect.bottom <= innerHeight && node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), 'ToolPilot must be visible, keyboard accessible, loaded and unobstructed');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Partner badges must not overflow at ${width}px`);
    assert(await page.$eval('footer a[href="https://twelve.tools"]', node => node.hidden && node.getBoundingClientRect().width === 0), 'Preserve the existing Twelve Tools hidden state');
    await page.screenshot({ path: path.join(output, `footer-${width}.png`) });
    console.log(`PASS: ${width}px, Startup Fame and ToolPilot images loaded and visible on scroll, no overflow; Twelve Tools remains hidden`);
  }
  for (const route of ['/arena', '/champions']) {
    assert.equal((await page.goto(base + route, { waitUntil: 'domcontentloaded' })).status(), 200);
    assert.equal(await page.$$eval(`a[href="${badgeHref}"]`, nodes => nodes.length), 0);
    assert.equal(await page.$$eval(`a[href="${toolPilotHref}"]`, nodes => nodes.length), 0);
  }
  console.log(JSON.stringify({ result: 'PASS: homepage-only, server-rendered visible official badge; no writes or external navigation', screenshots: output }));
} finally {
  await browser.close();
}
