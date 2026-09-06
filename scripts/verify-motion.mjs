import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setViewport({ width: 1365, height: 900 });
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
  if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
  return request.continue();
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await page.evaluateOnNewDocument(() => {
  // Isolate choreography from the deliberately blocked network. These local
  // fixtures are browser-only and are never submitted to the application API.
  localStorage.setItem('arena_products_v1', JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
    id: `motion-fixture-${index}`, title: `Motion fixture ${index}`, tagline: 'Local animation test product',
    logo: '🚀', makerName: 'Test maker', twitter: '', url: 'https://example.com',
    status: 'showcase', votes: 0, submittedAt: '2026-09-01T00:00:00.000Z',
  }))));
  window.motionSamples = [];
  const sample = () => {
    const el = document.querySelector('.hero-title');
    if (el) window.motionSamples.push(Number(getComputedStyle(el).opacity));
    if (window.motionSamples.length < 240) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
try {
  for (const pass of ['initial load', 'refresh']) {
    if (pass === 'initial load') await page.goto(base, { waitUntil: 'domcontentloaded' });
    else await page.reload({ waitUntil: 'domcontentloaded' });
    await delay(1800);
    const frames = await page.evaluate(() => window.motionSamples.filter((opacity) => opacity > 0.01 && opacity < 0.99).length);
    assert(frames >= 5, `${pass}: expected visible GSAP entrance, got ${frames} intermediate frames`);
    assert.equal(await page.$eval('.hero-title', (el) => getComputedStyle(el).opacity), '1');
    console.log(`PASS ${pass}: ${frames} animated hero frames, ends visible`);
  }
  const selector = '[data-home-reveal="discovery"]';
  const sampleReveal = async () => page.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    const frames = [];
    const cards = [...element.querySelectorAll('[data-discovery-card]')];
    if (!cards.length) throw new Error(`Missing discovery cards: ${element.outerHTML.slice(0, 2400)}`);
    const card = cards[0];
    const lastCard = cards.at(-1);
    // Keep the target below the sticky header and inside the observer viewport.
    window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 180, behavior: 'instant' });
    const started = performance.now();
    while (performance.now() - started < 1900) {
      await new Promise(requestAnimationFrame);
      const style = getComputedStyle(card);
      const matrix = new DOMMatrixReadOnly(style.transform);
      frames.push({ opacity: Number(style.opacity), x: matrix.m41,
        lastOpacity: Number(getComputedStyle(lastCard).opacity),
        overflow: document.documentElement.scrollWidth > innerWidth });
    }
    return frames;
  }, selector);
  let frames = await sampleReveal();
  assert(frames.some(({ opacity }) => opacity > 0 && opacity < 0.95), 'Discovery must fade in on entry');
  assert(frames.some(({ x }) => Math.abs(x) > 10), 'Cards must enter laterally, not only fade');
  assert(frames.some(({ opacity, lastOpacity }) => opacity > lastOpacity + 0.1), 'Cards must be staggered');
  assert(frames.every(({ overflow }) => !overflow), 'Side entrances must not create horizontal overflow');
  assert.equal(frames.at(-1).opacity, 1);
  assert.equal(frames.at(-1).lastOpacity, 1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await delay(150);
  frames = await sampleReveal();
  assert(frames.every(({ opacity, x }) => opacity === 1 && x === 0), 'Do not repeatedly hide a visited section');
  console.log('PASS scroll reveal and no replay on revisiting a module');
  await page.goto(`${base}/#arena-section`, { waitUntil: 'domcontentloaded' });
  await delay(1300);
  assert.equal(await page.$eval('.hero-title', (el) => getComputedStyle(el).opacity), '1');
  assert.equal(await page.$eval('[data-home-reveal="arena-heading"]', (el) => getComputedStyle(el).opacity), '1');
  console.log('PASS anchor navigation leaves content visible');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await delay(1800);
  frames = await sampleReveal();
  assert(frames.some(({ x }) => Math.abs(x) > 5 && Math.abs(x) <= 16), 'Mobile uses a shorter lateral entrance');
  assert(frames.every(({ overflow }) => !overflow), 'Mobile entrance must not overflow');
  console.log('PASS mobile: restrained side entrance without horizontal overflow');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await delay(1800);
  await page.$eval(selector, (element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 180, behavior: 'instant' }));
  await page.waitForFunction(() => {
    const opacity = Number(getComputedStyle(document.querySelector('[data-discovery-card]')).opacity);
    return opacity > 0.02 && opacity < 0.95;
  });
  await page.focus('[aria-controls="discovery-grid"]');
  assert(await page.$$eval('[data-discovery-card]', (cards) => cards.every((card) => getComputedStyle(card).opacity === '1' && getComputedStyle(card).transform === 'none')));
  await page.click('[aria-controls="discovery-grid"]');
  await page.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
  console.log('PASS interaction completes entrance immediately; Next remains usable');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await delay(500);
  assert(await page.evaluate(() => window.motionSamples.every((opacity) => opacity === 1)));
  assert((await sampleReveal()).every(({ opacity, x }) => opacity === 1 && x === 0));
  console.log('PASS reduced-motion: no entrances or hidden content');
  await page.setJavaScriptEnabled(false);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('.hero-title', (el) => getComputedStyle(el).opacity), '1');
  assert.equal(await page.$eval(selector, (el) => getComputedStyle(el).opacity), '1');
  console.log('PASS server HTML stays visible without JavaScript');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
