import assert from 'node:assert/strict';
const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
let checks = 0;
// All requests are unauthorized or rejected before a database mutation.
for (const [path, method] of [
  ['/api/arena/products', 'POST'], ['/api/arena/products/safety-not-real', 'PATCH'],
  ['/api/arena/products/safety-not-real/queue', 'POST'], ['/api/arena/products/mine', 'GET'],
  ['/api/arena/vote', 'POST'], ['/api/arena/logo', 'POST'],
  ['/api/arena/reports', 'POST'], ['/api/arena/moderation', 'GET'], ['/api/arena/moderation', 'POST'],
  ['/api/arena/settle', 'POST'], ['/api/arena/reset-round3', 'POST'], ['/api/cron/settle', 'GET'],
]) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}', signal: AbortSignal.timeout(10000) });
  if (path === '/api/cron/settle' && response.status === 503) {
    assert.match((await response.json()).error, /configuration is incomplete/i);
    console.log('NOTE: local CRON_SECRET is missing; cron fails closed with 503. Production configuration was not inspected.');
  } else assert.equal(response.status, 401, `${method} ${path} requires authorization`);
  checks++;
}
for (const [body, extraHeaders, status] of [
  [{ productIds: ['safety-not-real'] }, { 'sec-fetch-site': 'cross-site' }, 403],
  [null, {}, 400], [{ productIds: [] }, {}, 400],
  [{ productIds: ['../unsafe'] }, {}, 400],
  [{ padding: 'x'.repeat(3000) }, {}, 413],
]) {
  const response = await fetch(`${base}/api/arena/exposure`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'SafetyBoundaryTest', ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, status); checks++;
}
console.log(`PASS: ${checks} API authorization, cross-site, payload-size and input boundaries; no authorized writes`);
