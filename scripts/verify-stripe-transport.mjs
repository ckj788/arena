// Exercise the real Stripe SDK and app configuration against a loopback fixture.
// No .env files, real API keys, Supabase connections, or Stripe requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher, fetch as proxyFetch } from 'undici';

const requests = [];
const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  requests.push({ method: request.method, headers: request.headers, body });
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ id: 'cs_test_fixture', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/fixture' }));
});
const previous = getGlobalDispatcher();
const dispatcher = new EnvHttpProxyAgent({ httpProxy: 'http://127.0.0.1:9', httpsProxy: 'http://127.0.0.1:9', noProxy: 'localhost,127.0.0.1,::1' });
setGlobalDispatcher(dispatcher);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  class FixtureStripe extends Stripe {
    constructor(key, options) { super(key, { ...options, host: '127.0.0.1', port: server.address().port, protocol: 'http', maxNetworkRetries: 0 }); }
  }
  class HttpError extends Error {}
  const env = { NODE_ENV: 'development', INDIECLASH_DEV_PROXY_ACTIVE: '1', STRIPE_SECRET_KEY: 'sk_test_local_fixture' };
  const fixtureModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/stripe.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports, process: { env }, URL,
    require(name) { return { 'server-only': {}, stripe: { default: FixtureStripe }, undici: { fetch: proxyFetch }, './auth': { HttpError } }[name]; },
  });
  const sdk = fixtureModule.exports.getStripe();
  const result = await sdk.checkout.sessions.create({
    mode: 'payment', allowed_payment_method_types: ['card'],
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 16900, product_data: { name: 'Growth — 100+ directory submissions' } } }],
    success_url: 'http://localhost:3000/submit/result', cancel_url: 'http://localhost:3000/submit/checkout?plan=growth',
  }, { idempotencyKey: 'launch-order:local-fixture' });
  assert.equal(result.id, 'cs_test_fixture');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(Number(requests[0].headers['content-length']), requests[0].body.byteLength);
  assert.equal(requests[0].headers['idempotency-key'], 'launch-order:local-fixture');
  assert.equal(new URLSearchParams(requests[0].body.toString()).get('line_items[0][price_data][unit_amount]'), '16900');
  env.NODE_ENV = 'production';
  assert.equal(fixtureModule.exports.getStripe().getApiField('httpClient').getClientName(), 'node', 'Production keeps the default Stripe transport');
  console.log('PASS: real SDK Checkout POST with the local proxy dispatcher, valid Content-Length, fixed amount, Unicode product name and idempotency header. Production keeps its default transport. Loopback fixture only.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await dispatcher.close();
  setGlobalDispatcher(previous);
}
