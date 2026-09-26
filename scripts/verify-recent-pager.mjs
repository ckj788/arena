import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return req.abort();
    return req.continue();
  });
  await page.goto('http://localhost:3000/resources/startup-launch-directories', {waitUntil: 'networkidle2'});
  await page.waitForSelector('#recent-launch-grid');
  const links = () => page.$$eval('#recent-launch-grid a', nodes => nodes.map(node => node.getAttribute('href')));
  const first = await links();
  assert.equal(first.length, 6);
  const section = '[aria-labelledby="recent-launches"]';
  const status = await page.$eval(`${section} [role="status"]`, node => node.textContent);
  const total = Number(status.match(/of (\d+)/)[1]);
  const button = 'button[aria-controls="recent-launch-grid"]';
  const seen = [...first];
  for (let batch = 1; batch < Math.ceil(total / 6); batch++) {
    await page.$eval(button, node => { node.click(); node.click(); });
    await page.waitForFunction(() => document.querySelector('#recent-launch-grid').getAttribute('aria-busy') === 'false');
    const current = await links();
    assert.equal(current.length, Math.min(6, total - batch * 6));
    for (const url of current) assert(!seen.includes(url), `Duplicate ${url}`);
    seen.push(...current);
  }
  assert.equal(seen.length, total);
  await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.click(button);
  await page.waitForFunction(() => document.querySelector('#recent-launch-grid').getAttribute('aria-busy') === 'false');
  assert.deepEqual(await links(), first);
  for (const width of [390, 768, 1440]) {
    await page.setViewport({width, height: 900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${total} products paged without gaps/duplicates, rapid clicks locked, reduced-motion wraparound and responsive layout.`);
} finally { await browser.close(); }
