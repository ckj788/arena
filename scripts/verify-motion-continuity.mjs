import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
try {
  for (const scenario of [
    { name: 'desktop', width: 1365, cpu: 1, scriptDelay: 0 },
    { name: 'late hydration', width: 1365, cpu: 1, scriptDelay: 1600 },
    { name: 'mobile / 4x CPU slowdown', width: 390, cpu: 4, scriptDelay: 0 },
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: scenario.width, height: 844 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
    await page.evaluateOnNewDocument(() => {
      // Observe the very first HTML paint, not merely post-hydration DOM.
      window.continuity = { samples: [], deck: [], starts: 0 };
      document.addEventListener('animationstart', event => {
        if (event.target.matches?.('.hero-title')) window.continuity.starts++;
      });
      const sample = time => {
        const hero = document.querySelector('.hero-title');
        const cards = [...document.querySelectorAll('[data-qualified-exposure-id]')].map(el => el.dataset.qualifiedExposureId).join(',');
        if (hero) window.continuity.samples.push({ opacity: Number(getComputedStyle(hero).opacity), time });
        if (cards && window.continuity.deck.at(-1) !== cards) window.continuity.deck.push(cards);
        if (!window.stopSampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      // Never write telemetry or mutate real data in an animation test.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return void request.respond({ status: 200, contentType: 'application/json', body: '{"recorded":0}' });
      if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return void request.abort();
      if (request.resourceType() === 'script' && scenario.scriptDelay) return void setTimeout(() => request.continue().catch(() => {}), scenario.scriptDelay);
      return void request.continue();
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.continuity.samples.length > 30 && getComputedStyle(document.querySelector('.hero-title')).opacity === '1');
    await new Promise(resolve => setTimeout(resolve, 800));
    const sample = await page.evaluate(() => { window.stopSampling = true; return window.continuity; });
    assert.equal(sample.starts, 1, `${scenario.name}: hero entrance must start exactly once`);
    assert(sample.samples.every((frame, index, all) => index === 0 || frame.opacity >= all[index - 1].opacity - 0.02), `${scenario.name}: no visible → hidden → visible flash`);
    assert.equal(sample.deck.length, 1, `${scenario.name}: hydration must not replace the first six products`);
    assert.equal(await page.$eval('.hero-title', el => el.style.opacity), '', 'Hero must not be reset by a late GSAP inline style');
    await page.$eval('#new-and-unseen-section', el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.focus('[aria-controls="discovery-grid"]');
    const deckResult = await page.evaluate(async () => {
      const grid = document.querySelector('#discovery-grid');
      const button = document.querySelector('[aria-controls="discovery-grid"]');
      const before = grid.textContent;
      const height = grid.getBoundingClientRect().height;
      button.click();
      const frames = [];
      const start = performance.now();
      while (performance.now() - start < 1400) {
        await new Promise(requestAnimationFrame);
        frames.push({ opacity: Number(getComputedStyle(grid).opacity), time: performance.now(), height: grid.getBoundingClientRect().height });
      }
      return { changed: before !== grid.textContent, disabled: button.disabled, frames, height };
    });
    assert(deckResult.changed && !deckResult.disabled, `${scenario.name}: deck must change and unlock`);
    assert(deckResult.frames.every(frame => Math.abs(frame.height - deckResult.height) < 1), 'Deck transition must not shift layout');
    assert.equal(deckResult.frames.at(-1).opacity, 1);
    const intervals = deckResult.frames.slice(1).map((frame, index) => frame.time - deckResult.frames[index].time).sort((a, b) => a - b);
    assert.deepEqual(errors, []);
    results.push({ scenario: scenario.name, heroEntrances: sample.starts, initialDeckChanges: sample.deck.length - 1, deckFrameIntervalP95Ms: Math.round(intervals[Math.floor(intervals.length * .95)]) });
    await context.close();
  }
  console.log(JSON.stringify({ results, note: 'Headless frame intervals are diagnostic, not a hardware FPS guarantee.' }, null, 2));
} finally { await browser.close(); }
