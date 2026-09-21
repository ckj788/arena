import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const product = {
  id: 'fixture-product', title: 'Fixture Product', url: 'https://fixture.example',
  submittedAt: '2026-09-21T00:00:00Z', moderationStatus: 'approved',
};
const opponent = { ...product, id: 'opponent', title: 'Opponent' };
const row = {
  shipandbattle_id: product.id, shipandbattle_product_a_id: product.id,
  shipandbattle_product_b_id: 'opponent', shipandbattle_winner_id: product.id,
};
let failAt = 'matches';
let productAttempts = 0;
const supabase = {
  from(table) {
    const query = {
      select() { return query; }, order() { return query; }, or() { return query; },
      in() { return query; }, limit() { return query; },
      abortSignal() {
        if (table === 'products') {
          productAttempts++;
          return Promise.resolve(productAttempts === 1
            ? { data: null, error: { message: 'TypeError: fetch failed' } }
            : { data: [product, opponent], error: null });
        }
        if (table === failAt) return Promise.resolve({ data: null, error: { message: 'Simulated timeout' } });
        if (table === 'matches') return Promise.resolve({ data: [row], error: null });
        return Promise.resolve({ data: [], error: null });
      },
    };
    return query;
  },
};
const mocks = {
  'server-only': {},
  react: { cache: fn => fn },
  'next/cache': { unstable_cache: fn => fn },
  '@/lib/arenaStore': { fetchCloudProducts: async () => [product], fromDbProduct: row => row },
  '@/lib/mockData': { SEED_PRODUCTS: [] },
  '@/lib/supabaseClient': { DB_PREFIX: 'shipandbattle_', publicArenaTable: table => table, supabase },
  '@/lib/productSafety': { isVisibleProduct: item => item.moderationStatus !== 'restricted' },
};
const source = ts.transpileModule(fs.readFileSync('lib/server/publicSeoData.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const testModule = { exports: {} };
vm.runInNewContext(source, {
  module: testModule, exports: testModule.exports, console: { warn() {} }, AbortSignal,
  require(name) { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import: ${name}`); },
});
for (const failingTable of ['matches', 'votes']) {
  failAt = failingTable;
  const data = await testModule.exports.getProductSeoData(product.id);
  assert.equal(data.product.id, product.id, `${failingTable} failure hides product`);
  assert.equal(data.product.url, product.url, `${failingTable} failure hides website`);
  assert.equal(data.critiques.length, 0);
  assert.equal(data.matchups.length, failingTable === 'matches' ? 0 : 1);
}
assert(productAttempts >= 2, 'Transient product read was not retried');
assert.equal(await testModule.exports.getProductSeoData('missing'), null);
console.log('PASS: product remains available when Arena matches or critiques fail; missing products remain missing.');
