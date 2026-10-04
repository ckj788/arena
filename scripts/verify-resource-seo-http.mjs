import assert from 'node:assert/strict';

const base = process.env.RESOURCE_SEO_TEST_URL || 'http://localhost:3144';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local fixture server only');
const get = path => fetch(base + path, { signal: AbortSignal.timeout(15000) });
const snapshots = [];
for (let index = 0; index < 2; index++) {
  const response = await get('/sitemap.xml');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /xml/);
  // Next's metadata-route wrapper emits max-age=0/must-revalidate even for
  // force-dynamic sitemap routes. Verify actual fresh reads below as well.
  assert.match(response.headers.get('cache-control'), /max-age=0, must-revalidate|no-store/);
  const xml = await response.text();
  const marker = xml.match(/<loc>https:\/\/www\.indieclash\.com\/products\/sitemap-snapshot-(\d+)<\/loc>/)?.[1];
  assert(marker, 'Run with resource-seo-fixture.mjs, never a real database');
  snapshots.push(Number(marker));
  assert(!xml.includes('safety-fixture-7'), 'Restricted product must not appear');
  assert(xml.includes('/resources/startup-launch-directories</loc>'));
}
assert(snapshots[1] > snapshots[0], 'Each HTTP sitemap request must read fresh data');
const hubResponse = await get('/resources');
assert.equal(hubResponse.status, 200);
const hub = await hubResponse.text();
assert(hub.includes('name="twitter:title" content="Launch Resources for Indie Makers"'));
assert(hub.includes('name="twitter:image" content="https://www.indieclash.com/og-image.png"'));
assert(!hub.includes('maidensail.com'));
const guideResponse = await get('/resources/startup-launch-directories');
assert.equal(guideResponse.status, 200);
const guide = (await guideResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const summaries = [...guide.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
assert(summaries.find(m => m[1].includes('Fazier'))[1].includes('homepage or footer'));
assert(summaries.find(m => m[1].includes('Uneed'))[1].includes('score 10'));
assert(guide.includes('Official rules reviewed:'));
assert(!guide.includes('maidensail.com'));
console.log('PASS: production HTTP sitemap changes on fresh fixture reads; resource sharing/SSR conditions; hidden badge absent. No live writes.');
