// Read-only public HTML audit. Does not access GSC or submit indexing requests.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'https://www.indieclash.com';
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
async function get(url) {
  try {
    const response = await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(25000)});
    return {url, status: response.status, location: response.headers.get('location'), headerRobots: response.headers.get('x-robots-tag'), type: response.headers.get('content-type'), html: await response.text()};
  } catch (error) { return {url, error: error.message, html: ''}; }
}
async function batch(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += 4) results.push(...await Promise.all(urls.slice(i, i + 4).map(get)));
  return results;
}
const sitemap = await get(`${origin}/sitemap.xml`);
if (sitemap.status !== 200) throw new Error(`Sitemap failed: ${sitemap.status}`);
const urls = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
const pages = await batch(urls);
const links = new Map();
const facts = pages.map(page => {
  for (const match of page.html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(decode(match[1]), page.url);
    if (url.origin !== origin) continue;
    url.hash = '';
    // Ignore UI state query strings; audit their underlying public route.
    url.search = '';
    if (!links.has(url.href)) links.set(url.href, []);
    links.get(url.href).push(page.url);
  }
  const schemas = [...page.html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match => {
    try { const value = JSON.parse(match[1]); return Array.isArray(value) ? value : [value]; } catch { return []; }
  });
  const product = schemas.find(value => ['SoftwareApplication', 'Product'].includes(value['@type']));
  const canonical = page.html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  return {url: page.url, status: page.status, error: page.error, canonical, headerRobots: page.headerRobots,
    noindex: /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(page.html),
    descriptionLength: product?.description?.length,
    title: page.html.match(/<title>([^<]+)<\/title>/)?.[1]};
});
const extraUrls = [...links.keys()].filter(url => !urls.includes(url));
const extras = (await batch(extraUrls)).map(entry => { const copy = { ...entry }; delete copy.html; return { ...copy, sources: [...new Set(links.get(entry.url))].slice(0, 3) }; });
const probes = await batch([
  `${origin}/reviews/solitude`, `${origin}/reviews/trysignalhire`,
  `${origin}/products/indexing-audit-nonexistent`,
  `${origin}/robots.txt`,
]);
const report = {time: new Date().toISOString(), sitemapCount: urls.length, facts, extraLinks: extras,
  probes: probes.map(({html, ...result}) => ({...result, ...(result.url.endsWith('robots.txt') ? {rules: html} : {})}))};
const folder = mkdtempSync(join(tmpdir(), 'indieclash-index-audit-'));
const path = join(folder, 'report.json');
writeFileSync(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({path, sitemapCount: urls.length,
  sitemapIssues: facts.filter(p => p.status !== 200 || p.noindex || !p.canonical || new URL(p.canonical).href !== p.url || p.headerRobots?.includes('noindex')),
  extraLinks: extras, probes: report.probes,
  shortDescriptions: facts.filter(p => p.descriptionLength !== undefined && p.descriptionLength < 160)
}, null, 2));
