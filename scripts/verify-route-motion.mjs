import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (const route of ['arena', 'champions']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep the steps beyond the 80px pre-entry margin until we scroll to them.
    await page.setViewport({ width: 1365, height: 480 });
    let slowScripts = false;
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return void request.respond({ status: 200, contentType: 'application/json', body: '{"recorded":0}' });
      if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return void request.abort();
      if (slowScripts && request.resourceType() === 'script') return void setTimeout(() => request.continue().catch(() => {}), 1400);
      return void request.continue();
    });
    await page.evaluateOnNewDocument(() => {
      window.routeMotion = { frames: [], starts: 0 };
      document.addEventListener('animationstart', event => {
        if (event.target.matches?.('[data-home-reveal$="-heading"]') && event.target.querySelector('h1')) window.routeMotion.starts++;
      });
      const sample = () => {
        const heading = document.querySelector('h1')?.closest('[data-route-enter]');
        if (heading) {
          const style = getComputedStyle(heading);
          window.routeMotion.frames.push({ opacity: Number(style.opacity), x: new DOMMatrixReadOnly(style.transform).m41 });
        }
        if (window.routeMotion.frames.length < 800) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const mode of ['load', 'refresh', 'delayed hydration']) {
      slowScripts = mode === 'delayed hydration';
      if (mode === 'refresh') await page.reload({ waitUntil: 'networkidle0' });
      else await page.goto(`${base}/${route}`, { waitUntil: 'networkidle0' });
      await delay(1250);
      const { frames, starts } = await page.evaluate(() => window.routeMotion);
      assert.equal(starts, 1, `${route} ${mode}: one heading entrance`);
      assert(frames.some(frame => frame.opacity > 0 && frame.opacity < .98 && Math.abs(frame.x) > .1), 'Heading moves and fades');
      assert(frames.every((frame, index) => !index || frame.opacity >= frames[index - 1].opacity - .025), 'Hydration must not hide the heading again');
      assert.equal(frames.at(-1).opacity, 1);
      console.log(`PASS ${route}: ${mode}, one smooth heading entrance without flash`);
    }
    if (route === 'champions') {
      const frames = await page.evaluate(async () => {
        const section = document.querySelector('[data-home-reveal="how-steps"]');
        window.scrollTo({ top: section.getBoundingClientRect().top + scrollY - 170, behavior: 'instant' });
        const frames = [], start = performance.now();
        while (performance.now() - start < 1400) {
          await new Promise(requestAnimationFrame);
          frames.push([...section.children].map(el => Number(getComputedStyle(el).opacity)));
        }
        return frames;
      });
      assert(frames.some(frame => frame[0] > 0 && frame[0] < .98), 'Steps enter with GSAP on scroll');
      assert(frames.some(frame => frame[0] > frame[2] + .1), 'Steps enter in staggered order');
      assert(frames.at(-1).every(opacity => opacity === 1));
      console.log('PASS Champions: staggered GSAP steps finish fully visible');
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${base}/${route}`, { waitUntil: 'networkidle0' });
    await delay(1200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    assert(await page.$$eval('[data-route-enter]', elements => elements.every(el => getComputedStyle(el).opacity === '1' && getComputedStyle(el).transform === 'none')));
    await page.setJavaScriptEnabled(false);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    await delay(1250);
    assert(await page.$$eval('[data-route-enter]', elements => elements.every(el => getComputedStyle(el).opacity === '1')));
    assert.deepEqual(errors, []);
    console.log(`PASS ${route}: mobile, reduced-motion and no-JavaScript fallback`);
    await context.close();
  }
} finally { await browser.close(); }
