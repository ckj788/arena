import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// Run against a local production build. Block mutations and use an isolated
// browser profile: this suite never submits products, votes or real exposures.
const base = process.env.UI_TEST_URL || 'http://localhost:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const executablePath = process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-ui-'));
const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];
const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = await browser.newPage();
let fixtureUser = null;
let ownedProductId = '';
let ownedReplyMode = 'success';
let ownedProduct = null;
page.on('pageerror', (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (fixtureUser && url.pathname === '/api/arena/products/mine') return request.respond({ status: ownedReplyMode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(ownedReplyMode === 'error' ? { error: 'Test unavailable' } : { productIds: ownedReplyMode === 'empty' ? [] : [ownedProductId], products: ownedReplyMode === 'empty' ? [] : [ownedProduct] }) });
  if (fixtureUser && url.pathname === '/auth/v1/user') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureUser) });
  if (url.pathname.endsWith('/queue') && request.method() === 'POST') return request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test: queue temporarily unavailable' }) });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
  }
  // Keep client revalidation from changing fixture order during UI assertions.
  if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
  return request.continue();
});
const clickText = async (text) => {
  const buttons = await page.$$('button');
  for (const button of buttons) {
    if ((await button.evaluate((el) => el.textContent.trim())) === text && await button.isVisible()) { await button.click(); return; }
  }
  throw new Error(`Visible button not found: ${text}`);
};
const openHome = async (width = 1365, height = 900) => {
  await page.setViewport({ width, height });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#discovery-grid');
  await delay(1800);
};
try {
  await openHome();
  await page.screenshot({ path: path.join(output, 'desktop-home.png') });
  assert(await page.$eval('.hero-title', (el) => Number(getComputedStyle(el).opacity) === 1));
  assert(await page.$eval('#launches-section', (el) => el.getBoundingClientRect().top < innerHeight));
  results.push('Desktop: visible hero and early product section');
  await clickText('Sign in');
  await page.waitForSelector('.auth-dialog');
  await delay(400);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.auth-dialog')).opacity) >= 0.999, { timeout: 3000 });
  const glassStyle = await page.$eval('.auth-dialog', (el) => ({ opacity: getComputedStyle(el).opacity, blur: getComputedStyle(el).backdropFilter }));
  if (glassStyle.blur === 'none') console.log(await page.$eval('.auth-dialog', (el) => {
    const matches = [];
    const visit = (rules) => { for (const rule of rules) { try { if (rule.selectorText && el.matches(rule.selectorText) && rule.cssText.includes('backdrop')) matches.push(rule.cssText); } catch {} if (rule.cssRules) visit(rule.cssRules); } };
    for (const sheet of document.styleSheets) { try { visit(sheet.cssRules); } catch {} }
    return { classes: el.className, inline: el.style.cssText, supported: CSS.supports('backdrop-filter', 'blur(1px)'), matches };
  }));
  assert(glassStyle.blur !== 'none', JSON.stringify(glassStyle));
  await page.screenshot({ path: path.join(output, 'desktop-sign-in.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.auth-dialog'));
  assert(await page.evaluate(() => document.body.style.overflow !== 'hidden'));
  results.push('Glass sign-in: GSAP entry, Escape exit, restored scrolling');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some((el) => el.textContent.includes('Pause feed'))), false);
  await page.focus('.release-feed');
  assert(await page.$eval('.marquee-vertical-container', (el) => getComputedStyle(el).animationPlayState === 'paused'));
  await page.$eval('.release-feed', (el) => el.blur());
  results.push('Feed pauses on focus without an extra button');
  await page.$eval('#new-and-unseen-section', (el) => el.scrollIntoView());
  await delay(350);
  const first = await page.$$eval('#discovery-grid a', (els) => els.map((el) => el.getAttribute('href')));
  const beforeHeight = await page.$eval('#discovery-grid', (el) => el.getBoundingClientRect().height);
  const next = await page.$('[aria-controls="discovery-grid"]');
  await next.click();
  await page.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
  const second = await page.$$eval('#discovery-grid a', (els) => els.map((el) => el.getAttribute('href')));
  assert(second.every((id) => !first.includes(id)));
  assert(Math.abs(beforeHeight - await page.$eval('#discovery-grid', (el) => el.getBoundingClientRect().height)) < 2);
  // Repeated presses must not skip a deck or leave the control disabled.
  await next.click({ count: 3, delay: 10 });
  await page.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
  await page.screenshot({ path: path.join(output, 'desktop-discovery.png') });
  results.push('Discovery: distinct decks, stable height, repeated-click recovery');
  const href = await page.$eval('#discovery-grid a', (el) => el.getAttribute('href'));
  const card = await page.$('#discovery-grid article');
  const box = await card.boundingBox();
  const began = Date.now();
  await page.mouse.click(box.x + box.width - 16, box.y + 70);
  await page.waitForFunction((url) => location.pathname === url, {}, href);
  await page.waitForSelector('article h1');
  results.push(`Whole-card product navigation: ${Date.now() - began}ms (local)`);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#discovery-grid');
  assert(await page.$eval('#launches-section', (el) => getComputedStyle(el).opacity === '1'));
  results.push('Back navigation preserves visible home content');
  await page.goto(`${base}/products`, { waitUntil: 'domcontentloaded' });
  await delay(500);
  await page.$eval('.card-secondary-link[href^="http"]', (el) => el.scrollIntoView({ block: 'center' }));
  await delay(100);
  const external = await page.$eval('.card-secondary-link[href^="http"]', (el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + 15, rect.y + 15);
    return { ok: el.contains(hit), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: hit?.outerHTML.slice(0, 400), style: { zIndex: getComputedStyle(el).zIndex, position: getComputedStyle(el).position } };
  });
  assert(external.ok, `Primary card link must not intercept the website link: ${JSON.stringify(external)}`);
  assert.equal(await page.$eval('body', (el) => Boolean(el.querySelector('a a'))), false);
  results.push('Directory: independent external links and no nested anchors');

  for (const width of [390, 320]) {
    await openHome(width, 844);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await clickText('Submit Product');
    await page.waitForSelector('[role="dialog"][aria-labelledby="product-form-title"]');
    assert(await page.evaluate(() => document.body.style.overflow === 'hidden'));
    assert(await page.$eval('[role="dialog"]', (el) => el.contains(document.activeElement)));
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert(await page.$eval('[role="dialog"] button[type="submit"]', (el) => el === document.activeElement));
    await page.keyboard.press('Tab');
    assert(await page.$eval('[aria-label="Close product submission"]', (el) => el === document.activeElement));
    assert(await page.$eval('#product-title', (el) => el.labels.length > 0 && parseInt(getComputedStyle(el).fontSize) >= 16));
    await delay(250);
    await page.screenshot({ path: path.join(output, `mobile-${width}-submit.png`) });
    // A shortened viewport approximates the layout space left by a keyboard.
    await page.setViewport({ width, height: 450 });
    await page.$eval('[role="dialog"]', (el) => { el.scrollTop = el.scrollHeight; });
    assert(await page.$eval('[role="dialog"] button[type="submit"]', (el) => el.getBoundingClientRect().bottom <= innerHeight));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert(await page.evaluate(() => document.body.style.overflow !== 'hidden'));
    results.push(`Mobile ${width}px: layout, form labels, focus trap, dismissal, short viewport footer`);
    await page.setViewport({ width, height: 844 });
    const mobileDeck = await page.$$eval('#discovery-grid a', (els) => els.map((el) => el.getAttribute('href')));
    await clickText('See the next products ↑');
    await page.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
    const newMobileDeck = await page.$$eval('#discovery-grid a', (els) => els.map((el) => el.getAttribute('href')));
    assert(newMobileDeck.every((id) => !mobileDeck.includes(id)));
    assert(await page.$eval('#new-and-unseen-section', (el) => Math.abs(el.getBoundingClientRect().top) < 200));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    results.push(`Mobile ${width}px: bottom discovery control changes products and returns to section`);
  }
  // Simulated browser session only; the API and database never receive it.
  await openHome();
  ownedProductId = await page.$eval('#launches-section a[href^="/products/"]', (el) => el.getAttribute('href').split('/').pop());
  const env = fs.readFileSync('.env.local', 'utf8');
  const publicUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  if (publicUrl) {
    const uid = '00000000-0000-4000-8000-000000000001';
    fixtureUser = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'ui-test@example.invalid', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'ui-test-maker' } };
    ownedProduct = { id: ownedProductId, title: 'Owned fixture product', tagline: 'Private owner data survives public refresh', url: 'https://example.invalid', makerName: 'UI Test', makerTwitter: 'ui-test-maker', logo: '🚀', submittedAt: new Date().toISOString(), queueStatus: 'waiting', arenaEnqueued: false, creator_uid: uid, votesCount: 0 };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.test-only`;
    const session = { access_token: token, refresh_token: 'test-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: fixtureUser };
    const key = `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
    await page.evaluateOnNewDocument(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session });
    // Reproduce the reported history: Terms -> Home -> My Console -> Back.
    await page.goto(`${base}/terms`, { waitUntil: 'domcontentloaded' });
    await openHome();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'My Console'));
    await page.evaluate(() => window.scrollTo({ top: 420, behavior: 'instant' }));
    const homeScroll = await page.evaluate(() => scrollY);
    const beforeConsole = await page.evaluate(() => history.length);
    // Do not let Puppeteer scroll an off-screen header button before clicking:
    // this assertion specifically checks the position saved by navigation.
    await page.evaluate(() => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'My Console').click());
    await page.waitForSelector('.maker-console');
    assert.equal(new URL(page.url()).searchParams.get('view'), 'console');
    assert.equal(await page.evaluate(() => history.length), beforeConsole + 1);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('.maker-console') && Boolean(document.querySelector('#launches-section')));
    await delay(150);
    assert.equal(new URL(page.url()).pathname, '/');
    assert(Math.abs(await page.evaluate(() => scrollY) - homeScroll) < 5, 'Back restores the home position');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maker-console');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maker-console');
    assert.equal(new URL(page.url()).searchParams.get('view'), 'console');
    results.push('History: Terms -> Home -> Console -> Back returns Home; Forward and reload restore Console');
    await page.waitForFunction(() => !document.querySelector('.maker-console [aria-busy="true"]'));
    assert(await page.$eval('.maker-console', (el) => el.textContent.includes('Discovery views')));
    assert.equal(await page.$('.maker-console button[title="Retry"]'), null);
    await page.waitForFunction(() => [...document.querySelectorAll('.maker-console [data-console-section]')].every((el) => Number(getComputedStyle(el).opacity) >= 0.999));
    await page.screenshot({ path: path.join(output, 'desktop-console.png') });
    await page.click('.maker-console a[href^="/products/"]');
    await page.waitForSelector('article h1');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maker-console');
    await page.waitForFunction(() => !document.querySelector('.maker-console [aria-busy="true"]'));
    assert.equal(new URL(page.url()).searchParams.get('view'), 'console');
    results.push('History: product detail Back returns to Console, not Home');
    const joinButton = await page.evaluate(() => [...document.querySelectorAll('.maker-console button')].some((el) => el.textContent.trim() === 'Join Arena'));
    if (joinButton) {
      await clickText('Join Arena');
      await page.waitForSelector('[aria-labelledby="join-arena-title"]');
      await page.click('[aria-labelledby="join-arena-title"] button[aria-busy]');
      await page.waitForFunction(() => document.querySelector('[aria-labelledby="join-arena-title"]')?.textContent.includes('Unable to join'));
      await page.keyboard.press('Escape');
      results.push('Console: failed enqueue remains recoverable and does not claim success');
    }
    await clickText('Return to Arena ➔');
    await page.waitForSelector('#new-and-unseen-section');
    assert.equal(new URL(page.url()).hash, '#arena-section');
    assert.equal(new URL(page.url()).searchParams.has('view'), false);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maker-console');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#arena-section');
    await page.click('a[href="/#champions-section"]');
    await page.waitForFunction(() => location.hash === '#champions-section');
    const anchorLength = await page.evaluate(() => history.length);
    await page.click('a[href="/#champions-section"]');
    assert.equal(await page.evaluate(() => history.length), anchorLength, 'Repeated anchor does not duplicate history');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => location.hash === '#arena-section');
    results.push('History: Return to Arena and section anchors support Back/Forward without duplicate entries');
    assert(await page.$eval('#launches-section', (el) => getComputedStyle(el).opacity === '1'));
    results.push('Simulated signed-in console: product overview and return preserve discovery/feed');
    ownedReplyMode = 'error';
    await openHome();
    await clickText('My Console');
    await page.waitForFunction(() => document.querySelector('.maker-console [role="alert"]')?.textContent.includes("couldn't load"));
    assert(!(await page.$eval('.maker-console', (el) => el.textContent)).includes('No products linked'));
    ownedReplyMode = 'success';
    await clickText('Retry');
    await page.waitForFunction(() => !document.querySelector('.maker-console [aria-busy="true"]') && !document.querySelector('.maker-console [role="alert"]'));
    assert(await page.$('.maker-console a[href^="/products/"]'));
    results.push('Ownership failure is not shown as zero products; Retry restores products');
    ownedReplyMode = 'empty';
    await page.evaluate((id) => localStorage.setItem('my_arena_products', JSON.stringify([id])), ownedProductId);
    await openHome();
    await clickText('My Console');
    await page.waitForFunction(() => document.querySelector('.maker-console')?.textContent.includes('No products linked'));
    assert.equal(await page.$('.maker-console a[href^="/products/"]'), null);
    results.push('Cloud ownership ignores stale/forged local product IDs');
    await openHome(390, 844);
    await clickText('My Console');
    await page.waitForSelector('.maker-console');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#launches-section');
    assert.equal(await page.$('.maker-console'), null);
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maker-console');
    await clickText('Back to Arena');
    await page.waitForFunction(() => location.hash === '#arena-section' && !document.querySelector('.maker-console'));
    results.push('Mobile: Console Back/Forward and Back to Arena follow the same history rules');
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await openHome();
  assert(await page.$eval('.marquee-vertical-container', (el) => getComputedStyle(el).animationName === 'none'));
  const frameA = await page.$eval('canvas', (el) => el.toDataURL());
  await delay(150);
  assert.equal(await page.$eval('canvas', (el) => el.toDataURL()), frameA);
  await page.$eval('#new-and-unseen-section', (el) => el.scrollIntoView());
  await clickText('Next 6 products →');
  await page.waitForFunction(() => !document.querySelector('[aria-controls="discovery-grid"]').disabled);
  assert(await page.$eval('#discovery-grid', (el) => getComputedStyle(el).opacity === '1'));
  results.push('Reduced motion: static canvas/feed, functional discovery');

  assert.deepEqual(errors, [], `Browser exceptions: ${errors.join('; ')}`);
  console.log(JSON.stringify({ results, screenshots: output, browserErrors: errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  console.log(JSON.stringify({ completed: results, screenshots: output, browserErrors: errors }, null, 2));
  throw error;
} finally { await browser.close(); }
