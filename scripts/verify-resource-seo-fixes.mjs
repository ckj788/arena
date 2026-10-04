import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function load(file, mocks) {
  const mod = { exports: {} };
  const source = fs.readFileSync(file, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports, URL, console, AbortSignal,
    require(name) {
      assert(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return mod.exports;
}

const site = load('lib/site.ts', {});
const resources = load('lib/launchResources.ts', {});
const link = props => React.createElement('a', props);
const jsx = await import('react/jsx-runtime');
const pageMocks = {
  'react/jsx-runtime': jsx,
  '@/app/components/NavigationLink': { default: link },
  '@/app/components/PublicSiteHeader': { default: () => null },
  '@/app/components/InteractiveGrid': { default: () => null },
  '@/lib/launchResources': resources,
  '@/lib/site': site,
};
const hub = load('app/resources/page.tsx', pageMocks);
assert.equal(hub.metadata.twitter.title, hub.metadata.title);
assert.equal(hub.metadata.twitter.description, hub.metadata.description);
assert.equal(hub.metadata.twitter.images[0], '/og-image.png');
assert.equal(hub.metadata.alternates.canonical, '/resources');
assert(!fs.readFileSync('app/layout.tsx', 'utf8').includes('maidensail.com'));

const directory = load('app/resources/ResourceDirectory.tsx', {
  'react/jsx-runtime': jsx, react: React,
  '@/app/components/NavigationLink': { default: link },
  '@/app/components/useSurfaceMotion': { default: () => {} },
  '@/lib/launchResources': resources,
});
const html = renderToStaticMarkup(React.createElement(directory.default));
const summaries = [...html.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
assert.equal(summaries.length, 12);
for (const [index, item] of resources.LAUNCH_RESOURCES.entries()) {
  assert(item.submissionCondition.length > 20, item.name);
  assert.match(item.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert(summaries[index][1].includes(item.submissionCondition), `${item.name}: condition hidden`);
}
assert(summaries.find(m => m[1].includes('Fazier'))[1].includes('homepage or footer'));
assert(summaries.find(m => m[1].includes('Uneed'))[1].includes('score 10'));
assert.equal(resources.LAUNCH_RESOURCES.filter(item => item.cost === 'Free').length, 8);
assert.equal(resources.LAUNCH_RESOURCES.filter(item => item.cost === 'Check plans').length, 3);

let products = [{ id: 'existing', submittedAt: '2026-09-24T00:00:00Z' }];
let matches = [];
let reads = 0;
let databaseError = false;
const sitemap = load('app/sitemap.ts', {
  '@/lib/site': site,
  '@/lib/launchResources': resources,
  '@/lib/productTaxonomy': { PRODUCT_CATEGORIES: [], PUBLIC_CATEGORIES_ENABLED: false },
  '@/lib/server/publicSeoData': {
    getSitemapRecords: async () => {
      reads++;
      if (databaseError) throw new Error('Database unavailable');
      return { products, matches };
    },
    matchSlug: match => `${match.productAId}-vs-${match.productBId}`,
  },
});
assert.equal(sitemap.dynamic, 'force-dynamic');
assert.equal(sitemap.revalidate, undefined);
const first = await sitemap.default();
assert(first.some(item => item.url.endsWith('/products/existing')));
products = [...products, { id: 'new-product', submittedAt: '2026-10-04T00:00:00Z' }];
matches = [{ productAId: 'existing', productBId: 'new-product' }];
const second = await sitemap.default();
assert.equal(reads, 2);
assert(second.some(item => item.url.endsWith('/products/new-product')));
assert(second.some(item => item.url.endsWith('/versus/existing-vs-new-product')));
assert(second.some(item => item.url.endsWith(resources.RESOURCE_PATH)));
assert.equal(new Set(second.map(item => item.url)).size, second.length);
databaseError = true;
await assert.rejects(sitemap.default(), /Database unavailable/);

// Exercise the actual database reader across multiple pages, not only a mock
// sitemap builder. No service-role client or live database is used.
const prefix = 'shipandbattle_';
const productRows = Array.from({ length: 1005 }, (_, index) => ({
  [prefix + 'id']: `product-${index}`,
  [prefix + 'moderation_status']: 'unreviewed',
  [prefix + 'submitted_at']: '2026-10-04T00:00:00Z',
}));
productRows.push({ [prefix + 'id']: 'restricted', [prefix + 'moderation_status']: 'restricted' });
productRows.push({ [prefix + 'id']: '../invalid' });
const matchRows = [
  { [prefix + 'id']: 'valid-match', [prefix + 'product_a_id']: 'product-0', [prefix + 'product_b_id']: 'product-1004' },
  { [prefix + 'id']: 'restricted-match', [prefix + 'product_a_id']: 'product-0', [prefix + 'product_b_id']: 'restricted' },
];
const ranges = [];
const data = load('lib/server/publicSeoData.ts', {
  'server-only': {},
  react: { cache: fn => fn },
  'next/cache': { unstable_cache: fn => fn },
  '@/lib/arenaStore': {},
  '@/lib/mockData': { SEED_PRODUCTS: [] },
  '@/lib/productSafety': {},
  '@/lib/supabaseClient': {
    DB_PREFIX: prefix,
    publicArenaTable: table => prefix + 'public_' + table,
    supabase: {
      from(table) {
        const rows = table.endsWith('products') ? productRows : matchRows;
        let start;
        let end;
        const query = {
          select() { return query; },
          order() { return query; },
          range(from, to) { start = from; end = to; ranges.push({ table, from, to }); return query; },
          abortSignal() { return Promise.resolve({ data: rows.slice(start, end + 1), error: null }); },
        };
        return query;
      },
    },
  },
});
const records = await data.getSitemapRecords();
assert.equal(records.products.length, 1005);
assert(records.products.some(item => item.id === 'product-1004'));
assert.equal(records.matches.length, 1);
assert(ranges.some(item => item.table.endsWith('products') && item.from === 1000));
console.log('PASS: hidden badge removed; resource sharing metadata; 12 SSR submission conditions; fresh sitemap products/matches; database errors propagate. No live writes.');
