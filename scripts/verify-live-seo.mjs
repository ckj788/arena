import assert from 'node:assert/strict';

const origin = 'https://www.indieclash.com';
const request = (url, options = {}) => fetch(url, {
  ...options,
  signal: AbortSignal.timeout(20_000),
  headers: { 'user-agent': 'IndieClash deployment verification', ...options.headers },
});

for (const alias of ['https://indieclash.com/test-path?source=verify', 'http://indieclash.com/test-path?source=verify']) {
  let current = alias;
  for (let hop = 0; hop < 3 && new URL(current).origin !== origin; hop++) {
    const response = await request(current, { redirect: 'manual' });
    assert([301, 308].includes(response.status), `${current}: expected permanent redirect, got ${response.status}`);
    current = new URL(response.headers.get('location'), current).href;
  }
  assert.equal(current, `${origin}/test-path?source=verify`);
}

const sitemapResponse = await request(`${origin}/sitemap.xml`);
assert.equal(sitemapResponse.status, 200, 'sitemap status');
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert(urls.length > 10, `sitemap only contains ${urls.length} URLs`);
assert.equal(new Set(urls).size, urls.length, 'sitemap contains duplicate URLs');
assert(urls.every(url => new URL(url).origin === origin), 'sitemap contains a noncanonical origin');

for (let start = 0; start < urls.length; start += 8) {
  const pageResults = await Promise.all(urls.slice(start, start + 8).map(async url => {
    const response = await request(url, { redirect: 'manual' });
    const contentType = response.headers.get('content-type') || '';
    const html = contentType.includes('text/html') ? await response.text() : '';
    return { url, status: response.status, html };
  }));
  for (const { url, status, html } of pageResults) {
    assert.equal(status, 200, `${url}: sitemap URL returned ${status}`);
    if (html) {
      const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
      assert(canonical, `${url}: canonical missing`);
      assert.equal(new URL(canonical).href, url, `${url}: canonical mismatch`);
      assert(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html), `${url}: unexpected noindex`);
    }
  }
}

const required = ['/', '/products', '/arena', '/champions', '/resources', '/resources/startup-launch-directories'];
for (const path of required) {
  assert(urls.includes(`${origin}${path}`), `${path} missing from sitemap`);
  const response = await request(`${origin}${path}`);
  assert.equal(response.status, 200, `${path}: status ${response.status}`);
  const html = await response.text();
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  assert(canonical, `${path}: canonical missing`);
  assert.equal(new URL(canonical).href, `${origin}${path}`, `${path}: wrong canonical`);
  assert(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html), `${path}: unexpected noindex`);
}

const productUrl = urls.find(url => new URL(url).pathname.startsWith('/products/'));
assert(productUrl, 'no product in sitemap');
const productResponse = await request(productUrl);
assert.equal(productResponse.status, 200, 'sample product status');
const productHtml = await productResponse.text();
assert(productHtml.includes('href="/resources/startup-launch-directories"'), 'deployed product is missing resource content link');

const directoryHtml = await (await request(`${origin}/products`)).text();
assert(directoryHtml.includes('href="/resources/startup-launch-directories"'), 'deployed directory is missing resource content link');
const directoryMarkup = directoryHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
for (const match of directoryMarkup.matchAll(/href="(\/products\/[^"?#]+)"/g)) {
  assert(urls.includes(`${origin}${match[1]}`), `Published directory product missing from sitemap: ${match[1]}`);
}
const resourceHub = await (await request(`${origin}/resources`)).text();
assert(resourceHub.includes('name="twitter:title" content="Launch Resources for Indie Makers"'), 'resource hub inherits homepage sharing title');
assert(!resourceHub.includes('maidensail.com'), 'hidden badge is still deployed');
const guideHtml = await (await request(`${origin}/resources/startup-launch-directories`)).text();
const summaries = [...guideHtml.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
const fazier = summaries.find(match => match[1].includes('Fazier'));
const uneed = summaries.find(match => match[1].includes('Uneed'));
assert(fazier?.[1].includes('homepage or footer'), 'Fazier free condition missing from visible summary');
assert(uneed?.[1].includes('score 10'), 'Uneed free condition missing from visible summary');

const robotsResponse = await request(`${origin}/robots.txt`);
assert.equal(robotsResponse.status, 200, 'robots status');
const robots = await robotsResponse.text();
assert.match(robots, /Allow: \/api\/og\//);
assert.match(robots, /Disallow: \/api\//);
assert.match(robots, /Sitemap: https:\/\/www\.indieclash\.com\/sitemap.xml/);

const imageResponse = await request(`${origin}/og-image.png`);
assert.equal(imageResponse.status, 200, 'OG image status');
assert.match(imageResponse.headers.get('content-type') || '', /image\//);

console.log(`PASS: live deployment, canonical redirects, ${urls.length}-URL sitemap, directory coverage, resource links/sharing/conditions, robots and OG image.`);
