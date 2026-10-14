import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:3164';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.equal(process.env.INDIECLASH_CACHE_MUTATION_FIXTURE, '1', 'Run only against the explicitly opted-in mutation fixture server');
const manifest = JSON.parse(fs.readFileSync('.next-fixture/prerender-manifest.json', 'utf8'));
for (const path of ['/', '/products', '/champions', '/underrated', '/resources/startup-launch-directories', '/products/safety-fixture-0']) {
  assert.equal(manifest.routes[path].initialRevalidateSeconds, 3600, `Unexpected ISR interval for ${path}`);
}
assert.equal(manifest.routes['/arena'].initialRevalidateSeconds, 300);
const hash = value => createHash('sha256').update(value).digest('hex');
async function read(path, status = 200) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, path);
  return response.text();
}
async function mutate(path, body, extraHeaders = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cache-fixture-token', ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  assert(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const before = {};
for (const path of ['/', '/champions', '/resources/startup-launch-directories', '/products/safety-fixture-0', '/products/safety-fixture-1', '/products/safety-fixture-3']) before[path] = await read(path);
await read('/versus/safety-fixture-0-vs-safety-fixture-1');
await mutate('/api/arena/vote', { matchId: 'cache-match', votedProductId: 'safety-fixture-0', winnerFeedback: 'Cache integration positive feedback', loserFeedback: 'Cache integration constructive feedback' });
for (const path of ['/', '/champions', '/resources/startup-launch-directories', '/products/safety-fixture-3']) {
  assert.equal(hash(await read(path)), hash(before[path]), `A vote regenerated an unrelated page: ${path}`);
}
const winner = await read('/products/safety-fixture-0');
const loser = await read('/products/safety-fixture-1');
assert(winner.includes('Cache integration positive feedback'));
assert(loser.includes('Cache integration constructive feedback'));
assert(winner.includes('1 arena vote'));
assert((await read('/versus/safety-fixture-0-vs-safety-fixture-1')).includes('Cache integration positive feedback'));
await read('/products/cache-new', 404);
await mutate('/api/arena/products', { title: 'Cache New Product', tagline: 'A product for isolated production cache testing.', url: 'https://cache-new.example.com', description: 'This product exists only in a local test fixture and verifies immediate catalogue invalidation.', makerName: 'Cache fixture maker', makerTwitter: 'cachefixture', logo: '🚀', pricingModel: 'free' });
assert((await read('/products/cache-new')).includes('Cache New Product'));
assert((await read('/')).includes('Cache New Product'));
assert((await read('/resources/startup-launch-directories')).includes('Cache New Product'));
assert((await read('/sitemap.xml')).includes('/products/cache-new'));
const rawImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const version = hash(rawImage).slice(0, 16);
const imageUrl = `/product-images/safety-fixture-2?asset=logo&v=${version}`;
const html = await read('/');
assert(html.includes('/product-images/safety-fixture-2'));
assert(!html.includes(rawImage), 'Legacy image bytes still embedded in HTML/RSC');
const image = await fetch(base + imageUrl);
assert.equal(image.status, 200);
assert.equal(image.headers.get('content-type'), 'image/png');
assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(rawImage.split(',')[1], 'base64'));
await mutate('/api/arena/moderation', { productId: 'safety-fixture-0', action: 'restricted', note: 'Isolated cache visibility test' }, { 'x-admin-secret': 'fixture-admin-secret' });
await read('/products/safety-fixture-0', 404);
await read('/versus/safety-fixture-0-vs-safety-fixture-1', 404);
assert(!(await read('/sitemap.xml')).includes('/products/safety-fixture-0'));
assert(!(await read('/')).includes('Safety Fixture 0'));
console.log('PASS: production ISR intervals; real Next.js vote invalidation leaves unrelated pages cached; both critiques and vote totals refresh; new product recovers cached 404 and appears in homepage/resources/sitemap; legacy image bytes served separately; moderation immediately hides profile and matchup. Mutations affect only local fixture memory.');
