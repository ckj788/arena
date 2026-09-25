import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import ts from 'typescript';

// Pure URL checks, followed by read-only requests to a local production build.
// No sign-in, submissions, exposure writes, or cron/settlement calls.
const siteSource = readFileSync(new URL('../lib/site.ts', import.meta.url), 'utf8');
const siteModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(siteSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: siteModule.exports, module: siteModule, URL, process });
const { publicHttpUrl } = siteModule.exports;
for (const [input, expected] of [
  ['https://HTTPS://mistol.ai', 'https://mistol.ai/'],
  ['https:// http://Mergedeck.com', 'http://mergedeck.com/'],
  ['https://https://http://example.com/a?q=https://b.com', 'http://example.com/a?q=https://b.com'],
  [' https://example.com/a%20b?x=1#demo ', 'https://example.com/a%20b?x=1#demo'],
  ['https://example.com/?next=https://other.com', 'https://example.com/?next=https://other.com'],
  ['javascript:alert(1)', undefined], ['data:text/html,test', undefined],
  ['https://', undefined], ['https://https://', undefined],
  ['https://user:password@example.com', undefined],
  ['https://example.com/a b', undefined], ['https://exam\tple.com', undefined],
  ['https://example.com\\@evil.com', undefined], ['//example.com', undefined],
]) assert.equal(publicHttpUrl(input), expected, input);
console.log('PASS: legacy URL repair and unsafe URL rejection (14 cases)');

const base = process.env.SEO_TEST_URL || 'http://localhost:3107';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only test a local server');
assert.equal(new URL(base).protocol, 'http:');
// Node fetch may overwrite Host; raw HTTP is necessary to test host routing.
const get = (path, headers = {}) => new Promise((resolve, reject) => {
  const request = http.get(`${base}${path}`, { headers }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
      status: response.statusCode, headers: response.headers,
    })));
    response.on('error', reject);
  });
  request.setTimeout(30_000, () => request.destroy(new Error('Local SEO test timed out')));
  request.on('error', reject);
});
for (const agent of ['Mozilla/5.0 Chrome/130.0.0.0', 'Googlebot']) {
  const response = await get('/products/seo-nonexistent-test-20260906', { 'user-agent': agent });
  assert.equal(response.status, 404, `Missing product with ${agent}`);
  assert.match(await response.text(), /noindex/);
}
console.log('PASS: missing products return HTTP 404 for browsers and crawlers');

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.status, 200);
assert.match(sitemap.headers.get('content-type'), /xml/);
const xml = await sitemap.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(urls).size, urls.length, 'Sitemap contains duplicate URLs');
assert(urls.every(url => new URL(url).origin === 'https://www.indieclash.com'), 'Sitemap must use the canonical origin');
const productUrl = urls.find(url => new URL(url).pathname.startsWith('/products/'));
assert(productUrl, 'Sitemap must contain a public product');
const productPath = new URL(productUrl).pathname;
const product = await get(productPath);
assert.equal(product.status, 200);
const html = await product.text();
assert(html.includes(productUrl));
assert.match(html, /official website/);
const directory = await get('/products');
assert.equal(directory.status, 200);
assert.match(await directory.text(), /Discover new indie products/);
console.log('PASS: existing product URL, restored official link, and directory preserved');

assert.match(xml, /<loc>https:\/\/www\.indieclash\.com\/arena<\/loc>/);
assert.match(xml, /<loc>https:\/\/www\.indieclash\.com\/champions<\/loc>/);
assert(!xml.includes('vercel.app'));
console.log(`PASS: complete sitemap (${(xml.match(/<loc>/g) || []).length} URLs)`);

const resourcePath = '/resources/startup-launch-directories';
const canonicals = new Set();
for (const path of ['/', '/arena', '/champions', '/products', '/resources', resourcePath, productPath]) {
  assert(urls.includes(`https://www.indieclash.com${path}`), `${path} missing from sitemap`);
  const response = await get(path, { 'user-agent': 'Googlebot' });
  assert.equal(response.status, 200, path);
  const body = await response.text();
  const canonical = body.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  assert(canonical, `${path}: missing canonical`);
  assert.equal(new URL(canonical).href, `https://www.indieclash.com${path}`, path);
  assert(!canonicals.has(canonical), `Duplicate canonical: ${path}`);
  canonicals.add(canonical);
  assert.equal((body.match(/<h1(?:\s|>)/g) || []).length, 1, `${path}: one H1`);
  assert.match(body, /<title>[^<]+<\/title>/);
  assert.match(body, /<meta name="description" content="[^"]+"/);
  assert(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(body), `${path}: unexpected noindex`);
  const schemas = [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert(schemas.length, `${path}: structured data missing`);
  for (const schema of schemas) JSON.parse(schema[1]);
  if (path === '/products' || path === productPath) {
    const main = [...body.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/g)].map(match => match[1]).join('');
    assert(main.includes(`href="${resourcePath}"`), `${path}: resource link missing from content`);
  }
}
console.log('PASS: seven public pages have unique canonicals, metadata, one H1, valid JSON-LD and resource content links');
const robots = await get('/robots.txt');
assert.equal(robots.status, 200);
const rules = await robots.text();
assert.match(rules, /Allow: \/api\/og\//);
assert.match(rules, /Disallow: \/api\//);
assert.match(rules, /Sitemap: https:\/\/www\.indieclash\.com\/sitemap.xml/);
const og = await get('/og-image.png');
assert.equal(og.status, 200);
assert.match(og.headers.get('content-type'), /image\//);
console.log('PASS: robots exposes sitemap and allows OG exception; default sharing image loads');

for (const host of ['arena-chi-coral.vercel.app', 'indieclash.com']) {
  for (const path of ['/', '/arena', '/champions', '/products/https?source=test', '/?view=console']) {
    const response = await get(path, { host });
    assert.equal(response.status, 308, `${host}${path}`);
    assert.equal(new URL(response.headers.get('location')).href, `https://www.indieclash.com${path}`);
  }
}
for (const host of ['www.indieclash.com', 'localhost:3107', 'arena-preview-test.vercel.app', 'arena-chi-coral.vercel.app.evil.com']) {
  const response = await get('/robots.txt', { host });
  assert.equal(response.status, 200, `Must not redirect ${host}`);
}
console.log('PASS: exact alias redirects preserve paths/queries; local and preview hosts unaffected');
