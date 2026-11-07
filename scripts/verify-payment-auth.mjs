// Real Supabase SDK + locally signed ES256 tokens. No .env or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { generateKeyPairSync, sign, timingSafeEqual, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const origin = 'https://payment-auth-fixture.supabase.co';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-es256', alg: 'ES256', use: 'sig' };
const base = { iss: `${origin}/auth/v1`, sub: randomUUID(), aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600, email: 'fixture@example.com', app_metadata: { provider: 'google', providers: ['google'] } };
function token(changes = {}) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const input = `${encode({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })}.${encode({ ...base, ...changes })}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
let keyReads = 0, userReads = 0, networkAvailable = true;
async function fixtureFetch(input) {
  const url = String(input);
  if (url.endsWith('/.well-known/jwks.json')) {
    keyReads++;
    if (!networkAvailable) throw new TypeError('Fixture network is unavailable');
    return Response.json({ keys: [jwk] });
  }
  if (url.includes('/auth/v1/user')) userReads++;
  throw new Error('Unexpected network request');
}
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/auth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module: mod, exports: mod.exports, Request, Response, Buffer, console, Date, SyntaxError,
  process: { env: { NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public-key' } },
  require(name) {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return { timingSafeEqual };
    if (name === '@/lib/supabaseClient') return { DB_PREFIX: 'fixture_' };
    if (name === '@supabase/supabase-js') return { createClient: (url, key, options) => createClient(url, key, { ...options, global: { ...options.global, fetch: fixtureFetch } }) };
    throw new Error(`Unexpected import ${name}`);
  },
});
const verify = jwt => mod.exports.authenticatePaymentRequest(new Request('http://localhost/api/payments/checkout', { headers: jwt ? { authorization: `Bearer ${jwt}` } : {} }));
await assert.rejects(verify(), error => error.status === 401);
const valid = token();
const first = await verify(valid);
assert.equal(first.user.id, base.sub);
assert.equal(first.user.email, base.email);
assert.equal(keyReads, 1);
networkAvailable = false;
const start = performance.now();
for (let n = 0; n < 10; n++) assert.equal((await verify(valid)).user.id, base.sub);
console.log(`Cached signature verification: ${(performance.now() - start).toFixed(1)}ms total for 10 fixture requests.`);
assert.equal(keyReads, 1, 'New clients reuse the public-key cache, even when Auth is unreachable');
assert.equal(userReads, 0, 'ES256 payment auth never fetches the user record');
for (const changes of [
  { exp: Math.floor(Date.now() / 1000) - 5 }, { iss: 'https://wrong.example/auth/v1' },
  { aud: 'anon' }, { role: 'service_role' }, { sub: 'not-a-user-id' }, { exp: undefined }, { nbf: Math.floor(Date.now() / 1000) + 3600 },
]) await assert.rejects(verify(token(changes)), error => error.status === 401);
await assert.rejects(verify(token({ app_metadata: { provider: 'email' } })), error => error.status === 403);
const parts = valid.split('.');
parts[1] = Buffer.from(JSON.stringify({ ...base, sub: randomUUID() })).toString('base64url');
await assert.rejects(verify(parts.join('.')), error => error.status === 401, 'Changed ownership must fail signature verification');
assert.equal(userReads, 0);
console.log('PASS: actual ES256 signature verification, cached public keys, no per-request Auth/user network call, expired/tampered/wrong-project/wrong-audience/wrong-role tokens denied, provider restrictions preserved. Offline fixtures only.');
