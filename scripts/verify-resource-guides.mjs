import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import puppeteer from 'puppeteer-core';

const guideModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/resourceGuides.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: guideModule, exports: guideModule.exports });
const guides = guideModule.exports.RESOURCE_GUIDES;
assert.equal(guides.length, 3);
assert.equal(new Set(guides.map(guide => guide.slug)).size, guides.length);
const knownPaths = new Set(['/', '/?submit=1', '/products', '/arena', '/resources', '/resources/startup-launch-directories', ...guides.map(guide => `/resources/${guide.slug}`)]);
for (const guide of guides) {
  assert.equal(new Set(guide.sections.map(section => section.id)).size, guide.sections.length);
  const words = guide.sections.flatMap(section => [...section.paragraphs, ...(section.checklist || []), section.example?.text || '']).join(' ').split(/\s+/).length;
  assert(words >= 650, `${guide.slug}: expected a substantive guide, got ${words} words`);
  for (const link of [...guide.sources, ...guide.sections.flatMap(section => section.links || [])]) {
    if (link.href.startsWith('/')) assert(knownPaths.has(link.href), `Unknown internal link ${link.href}`);
    else assert.equal(new URL(link.href).protocol, 'https:');
  }
  console.log(`PASS content: ${guide.slug}, ${words} words, ${guide.sections.length} sections`);
}

const base = process.env.UI_TEST_URL || 'http://localhost:3144';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only inspect a local fixture');
const sitemapResponse = await fetch(`${base}/sitemap.xml`);
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
assert(sitemap.includes('/products/safety-fixture-0</loc>'), 'Requires the isolated fixture build');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(locations).size, locations.length);
for (const guide of guides) {
  const url = `https://www.indieclash.com/resources/${guide.slug}`;
  assert(locations.includes(url), `${guide.slug}: missing from sitemap`);
  assert(sitemap.includes(`<lastmod>${guide.updatedAt}T00:00:00.000Z</lastmod>`));
}
const llms = await (await fetch(`${base}/llms.txt`)).text();
for (const guide of guides) assert(llms.includes(`/resources/${guide.slug}`));

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'indieclash-resource-guides-'));
const browser = await puppeteer.launch({ executablePath: process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setRequestInterception(true);
page.on('request', request => {
  const url = new URL(request.url());
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return request.respond({ status: 200, contentType: 'application/json', body: '{}' });
  if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/_vercel/')) return request.abort();
  return request.continue();
});
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setJavaScriptEnabled(false);
  const titles = new Set();
  for (const guide of guides) {
    const route = `/resources/${guide.slug}`;
    const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    assert.equal(await page.$$eval('h1', nodes => nodes.length), 1);
    assert.equal(await page.$eval('h1', node => node.textContent), guide.title);
    const title = await page.title();
    assert(title.includes(guide.title));
    titles.add(title);
    assert.equal(await page.$eval('meta[name="description"]', node => node.content), guide.description);
    assert.equal(await page.$eval('link[rel="canonical"]', node => node.href), `https://www.indieclash.com${route}`);
    assert.equal(await page.$eval('meta[property="og:url"]', node => node.content), `https://www.indieclash.com${route}`);
    assert.equal(await page.$eval('meta[name="twitter:title"]', node => node.content), guide.title);
    assert(!(await page.$eval('meta[name="robots"]', node => node.content)).includes('noindex'));
    const structured = await page.$$eval('script[type="application/ld+json"]', nodes => nodes.flatMap(node => JSON.parse(node.textContent)['@graph'] || []));
    const article = structured.find(item => item['@type'] === 'Article');
    assert.equal(article.headline, guide.title);
    assert.equal(article.url, `https://www.indieclash.com${route}`);
    assert.equal(article.datePublished, guide.publishedAt);
    assert.equal(article.dateModified, guide.updatedAt);
    assert(structured.some(item => item['@type'] === 'BreadcrumbList'));
    assert(await page.$$eval('nav[aria-label="On this page"] a', nodes => nodes.length === 6 && nodes.every(node => document.getElementById(node.hash.slice(1)))));
    assert(await page.$('a[href="/?submit=1"]'));
    assert(await page.$('a[href="/products"]'));
    console.log(`PASS no-JS HTTP/SEO: ${route}`);
  }
  assert.equal(titles.size, guides.length);
  assert.equal((await page.goto(`${base}/resources/not-a-real-guide`, { waitUntil: 'domcontentloaded' })).status(), 404);
  assert((await page.$eval('meta[name="robots"]', node => node.content)).includes('noindex'));
  await page.goto(`${base}/resources`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('link[rel="canonical"]', node => node.href), 'https://www.indieclash.com/resources');
  assert(await page.$('main a[href="/resources/startup-launch-directories"]'), 'The original directory remains linked from the hub');
  assert(await page.$$eval('header a', nodes => nodes.filter(node => node.textContent.trim() === 'Resources').every(node => node.getAttribute('href') === '/resources')));
  for (const guide of guides) assert(await page.$(`a[href="/resources/${guide.slug}"]`));
  const parts = await page.$eval('script[type="application/ld+json"]', node => JSON.parse(node.textContent).hasPart);
  assert.equal(parts.length, 4);
  await page.goto(`${base}/resources/startup-launch-directories`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('link[rel="canonical"]', node => node.href), 'https://www.indieclash.com/resources/startup-launch-directories');
  assert(await page.$('main a[href="/resources"]'), 'The original directory links back to the hub');
  assert(await page.$$eval('nav[aria-label="On this page"] a', nodes => nodes.every(node => document.getElementById(node.hash.slice(1)))));
  await page.goto(`${base}/products`, { waitUntil: 'domcontentloaded' });
  assert((await page.title()).includes('New Indie Products & Recent Product Launches'));
  assert(await page.$('a[href="/resources/how-to-launch-a-product"]'));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert((await page.title()).includes('Discover New Indie Products & Launch Yours'));
  assert((await page.$eval('h1', node => node.textContent)).includes('Every Product'));

  await page.setJavaScriptEnabled(true);
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(`${base}/resources/startup-launch-directories`, { waitUntil: 'domcontentloaded' });
    const resourceLink = await page.evaluateHandle(() => [...document.querySelectorAll('header a')].find(node => node.textContent.trim() === 'Resources' && node.getBoundingClientRect().width > 0));
    await resourceLink.asElement().click();
    await page.waitForFunction(() => location.pathname === '/resources');
    await page.waitForSelector('main a[href="/resources/startup-launch-directories"]');
    await page.click('main a[href="/resources/startup-launch-directories"]');
    await page.waitForFunction(() => location.pathname === '/resources/startup-launch-directories');
    await page.waitForSelector('main h1');
    assert.equal(await page.$eval('main h1', node => node.textContent), 'Startup launch directories.');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/resources');
    for (const guide of guides) assert(await page.$(`main a[href="/resources/${guide.slug}"]`));
    console.log(`PASS shared Resources navigation and original directory round trip: ${width}px`);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of ['/resources', ...guides.map(guide => `/resources/${guide.slug}`)]) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main h1');
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
      if (width !== 320) await page.screenshot({ path: path.join(output, `${route.split('/').at(-1)}-${width}.png`) });
    }
  }
  await page.goto(`${base}/resources/tools-for-solopreneurs`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav[aria-label="On this page"]');
  await page.click('nav[aria-label="On this page"] a[href="#open-source-seo-tools"]');
  assert.equal(new URL(page.url()).hash, '#open-source-seo-tools');
  await page.waitForFunction(() => {
    const rect = document.getElementById('open-source-seo-tools').getBoundingClientRect();
    return rect.top >= 0 && rect.top < innerHeight;
  });
  await page.screenshot({ path: path.join(output, 'tools-body-mobile.png') });
  await page.goto(`${base}/resources`, { waitUntil: 'domcontentloaded' });
  await page.click('a[href="/resources/how-to-launch-a-product"]');
  await page.waitForFunction(() => location.pathname === '/resources/how-to-launch-a-product');
  await page.waitForSelector('h1');
  assert.equal(await page.$eval('h1', node => node.textContent), guides[0].title);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS: sitemap, article schema, 404, no-JS reading, hub links, client navigation, TOC and desktop/mobile layouts; no database writes', screenshots: output }, null, 2));
} finally {
  await browser.close();
}
