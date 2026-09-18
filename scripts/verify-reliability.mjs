import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// In-memory fault injection only. Never connects to Supabase or writes a vote.
function load(file, mocks = {}, globals = {}) {
  const filename = path.resolve(file);
  const compiledModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: compiledModule, exports: compiledModule.exports, URL, Date, Map, Set, Promise, AbortController, AbortSignal,
    setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`), mocks, globals);
      throw new Error(`Unexpected dependency: ${name}`);
    }, ...globals,
  });
  return compiledModule.exports;
}

for (const enabled of [false, true]) {
  const { buildFairDiscoverySequence } = load('lib/discoveryRanking.ts', { './productTaxonomy': { PUBLIC_CATEGORIES_ENABLED: enabled } });
  const products = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, url: `https://${i < 8 ? 'same' : `other${i}`}.example`,
    creator_uid: i < 8 ? 'same' : `maker${i}`, category: 'ai-tools', qualifiedImpressions: 0 }));
  for (let seed = 0; seed < 100; seed++) {
    const sequence = buildFairDiscoverySequence(products, `s${seed}`);
    assert.equal(new Set(sequence.map(p => p.id)).size, products.length);
    assert.equal(new Set(sequence.slice(0, 6).map(p => p.creator_uid)).size, 6, `Diversity with categories=${enabled}`);
  }
  const lower = { ...products[0], id: 'low', qualifiedImpressions: 0 };
  const higher = products.slice(1).map(p => ({ ...p, qualifiedImpressions: 10 }));
  assert.equal(buildFairDiscoverySequence([lower, ...higher], 's')[0].id, 'low');
}
console.log('PASS: 200 discovery passes, maker/domain diversity, no missing products, exposure debt first');

const safety = load('lib/requestSafety.ts', {}, { fetch: async () => ({ json: () => new Promise(() => {}) }) });
await assert.rejects(safety.fetchJsonWithDeadline('/test', {}, 15), /timed out/);
await assert.rejects(safety.withDeadline(new Promise(() => {}), 15), /timed out/);
assert.equal(await safety.withDeadline(Promise.resolve(42), 15), 42);
console.log('PASS: stalled response body and session lock time out; successful requests resolve');

const brokenStorage = new Proxy({}, { get() { throw new Error('Storage disabled'); } });
const storage = load('lib/browserStorage.ts', {}, { sessionStorage: brokenStorage });
assert.equal(storage.readSession('x'), null);
storage.writeSession('x', '1'); storage.removeSession('x');
assert.equal(typeof storage.discoverySeed(), 'string');
console.log('PASS: blocked browser storage and missing randomUUID do not break discovery');

let dbResult = { data: null, error: { message: 'Injected database outage' } };
const query = new Proxy({}, { get(_target, key) {
  if (key === 'then') return (resolve, reject) => Promise.resolve(dbResult).then(resolve, reject);
  return () => query;
} });
const store = load('lib/arenaStore.ts', { './supabaseClient': {
  supabase: { from: () => query }, DB_PREFIX: 'shipandbattle_', publicArenaTable: t => t,
} });
await assert.rejects(store.fetchCloudProducts(), /refresh products/);
await assert.rejects(store.fetchCloudBracket(), /refresh the Arena/);
await assert.rejects(store.fetchCloudPastChampions(), /refresh champions/);
dbResult = { data: null, error: null };
assert.equal(await store.fetchCloudBracket(), null);
dbResult = { data: [], error: null };
assert.equal((await store.fetchCloudProducts()).length, 0);
assert.equal((await store.fetchCloudPastChampions()).length, 0);
console.log('PASS: query failure rejects; genuine empty results remain valid (no false-empty caching)');

// A virtual clock tests observer retries without sleeping or making network calls.
let now = 0, timerId = 0, observerCallback, visibilityCallback;
const timers = new Map(), stored = new Map(), recorded = new Set();
const document = { visibilityState: 'visible', addEventListener(_e, cb) { visibilityCallback = cb; }, removeEventListener() {} };
const exposure = load('lib/qualifiedExposure.ts', { './browserStorage': {
  readSession: k => stored.get(k), writeSession: (k, v) => stored.set(k, v),
} }, {
  document,
  setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
  clearTimeout(id) { timers.delete(id); },
  IntersectionObserver: class { constructor(cb) { observerCallback = cb; } observe() {} disconnect() {} },
});
async function tick(ms) {
  now += ms;
  for (const [id, task] of [...timers]) if (task.at <= now) { timers.delete(id); task.fn(); }
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
let calls = 0;
const element = { dataset: { qualifiedExposureId: 'fixture' } };
const stop = exposure.observeQualifiedExposures([element], recorded, async () => { if (++calls === 1) throw new Error('offline'); });
observerCallback([{ target: element, isIntersecting: true, intersectionRatio: 1 }]);
await tick(4000);
assert.equal(calls, 1); assert.equal(recorded.size, 0); assert.equal(stored.size, 0);
await tick(8000);
assert.equal(calls, 2); assert(recorded.has('fixture')); assert.equal(stored.size, 1);
stop();
const other = { dataset: { qualifiedExposureId: 'hidden' } };
const stopHidden = exposure.observeQualifiedExposures([other], recorded, async () => { calls++; });
observerCallback([{ target: other, isIntersecting: true, intersectionRatio: 1 }]);
await tick(2000); document.visibilityState = 'hidden'; visibilityCallback(); await tick(4000);
assert.equal(calls, 2);
document.visibilityState = 'visible'; visibilityCallback(); await tick(3999); assert.equal(calls, 2);
await tick(1); assert.equal(calls, 3);
stopHidden();
console.log('PASS: exposures ack only on success, failed request retries, hidden tab cancels and resumes a full visibility window');
