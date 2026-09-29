import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/productTaxonomy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: mod, exports: mod.exports });
const taxonomy = mod.exports;
const migration = fs.readFileSync('lib/migrations/20260929_expand_product_categories.sql', 'utf8');
const constraint = migration.split('shipandbattle_category IN (')[1].split(')')[0];
const databaseValues = [...constraint.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.deepEqual(databaseValues.sort(), Array.from(taxonomy.PRODUCT_CATEGORIES, category => category.value).sort());
const labels = new Set(['AI', 'DEV TOOL', 'PRODUCTIVITY', 'MARKETING', 'DESIGN', 'VIDEO', 'FOUNDER', 'SAAS']);
for (const category of taxonomy.PRODUCT_CATEGORIES) {
  assert(labels.has(taxonomy.feedCategoryLabel(category.value)), category.value);
  assert.equal(taxonomy.profileCategoryLabel(category.value), category.label);
}
assert.equal(taxonomy.feedCategoryLabel('ai-video-generators'), 'VIDEO');
assert.equal(taxonomy.profileCategoryLabel('ai-video-generators'), 'AI Video Generators');
assert.equal(taxonomy.feedCategoryLabel('seo'), 'MARKETING');
assert.equal(taxonomy.feedCategoryLabel('marketing'), 'MARKETING');
for (const value of [undefined, '', 'invalid', '__proto__']) {
  assert.equal(taxonomy.feedCategoryLabel(value), null);
  assert.equal(taxonomy.profileCategoryLabel(value), null);
}
assert.equal(taxonomy.PUBLIC_CATEGORIES_ENABLED, false);
assert.equal(taxonomy.categoryLabel('seo'), null);
console.log(`PASS: ${databaseValues.length} SQL/application categories match; feed and profile labels resolve; category browsing stays disabled.`);
