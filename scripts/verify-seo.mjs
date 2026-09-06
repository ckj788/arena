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

const product = await get('/products/https');
assert.equal(product.status, 200);
const html = await product.text();
assert.match(html, /href="https:\/\/mistol\.ai\/"/);
assert.match(html, /https:\/\/www\.indieclash\.com\/products\/https/);
assert.match(html, /rel="noopener"/);
const directory = await get('/products');
assert.equal(directory.status, 200);
assert.match(await directory.text(), /Discover new indie products/);
console.log('PASS: existing product URL, restored official link, and directory preserved');

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.status, 200);
assert.match(sitemap.headers.get('content-type'), /xml/);
const xml = await sitemap.text();
assert.match(xml, /\/products\/https</);
assert.match(xml, /\/versus\//);
assert(!xml.includes('vercel.app'));
console.log(`PASS: complete sitemap (${(xml.match(/<loc>/g) || []).length} URLs)`);

for (const host of ['arena-chi-coral.vercel.app', 'indieclash.com']) {
  for (const path of ['/', '/products/https?source=test', '/?view=console']) {
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
