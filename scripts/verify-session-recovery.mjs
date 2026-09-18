import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('lib/arenaApi.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
  .replace('import { supabase } from "./supabaseClient";', 'const supabase = globalThis.__testSupabase;')
  .replace('import { fetchJsonWithDeadline, withDeadline } from "./requestSafety";', 'const { fetchJsonWithDeadline, withDeadline } = globalThis.__testRequests;');
assert(!compiled.includes('from "./'), 'Test must replace runtime imports');

const state = { token: 'old', refreshes: 0, signouts: 0, calls: [], mode: 'recover' };
const session = (token) => ({ access_token: token, refresh_token: 'refresh', user: { id: 'maker' } });
globalThis.__testSupabase = { auth: {
  getSession: async () => ({ data: { session: session(state.token) }, error: null }),
  refreshSession: async () => {
    state.refreshes++;
    if (state.mode === 'invalid') return { data: { session: null }, error: new Error('Invalid refresh token') };
    state.token = 'fresh';
    return { data: { session: session(state.token) }, error: null };
  },
  signOut: async () => { state.signouts++; return { error: null }; },
} };
globalThis.__testRequests = {
  withDeadline: (promise) => promise,
  fetchJsonWithDeadline: async (path, init) => {
    const token = init.headers.Authorization.slice(7);
    state.calls.push({ path, token, method: init.method });
    const status = state.mode === 'outage' ? 503 : token === 'fresh' ? 200 : 401;
    return { response: { ok: status === 200, status }, payload: status === 200 ? path === '/api/arena/logo' ? { url: 'https://example.invalid/logo.png' } : { productIds: [], products: [] } : { error: status === 401 ? 'Invalid or expired session.' : 'Unavailable' } };
  },
};
const events = new EventTarget();
globalThis.window = events;
let expirations = 0;
events.addEventListener('indieclash:auth-expired', () => { expirations++; });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.deepEqual(await api.fetchOwnedArenaProducts(), { productIds: [], products: [] });
assert.deepEqual(state.calls.map(({ token }) => token), ['old', 'fresh']);
assert.equal(state.refreshes, 1);
assert.equal(expirations, 0);

state.token = 'old';
state.calls = [];
assert.equal(await api.uploadArenaLogo('data:image/png;base64,iVBORw0KGgo='), 'https://example.invalid/logo.png');
assert.deepEqual(state.calls.map(({ token }) => token), ['old', 'fresh']);

state.token = 'old';
state.mode = 'invalid';
state.calls = [];
await assert.rejects(api.fetchOwnedArenaProducts(), api.AuthSessionExpiredError);
assert.equal(state.calls.length, 1, 'Invalid refresh must not retry with a rejected token');
assert.equal(state.signouts, 1);
assert.equal(expirations, 1);

state.mode = 'outage';
state.calls = [];
await assert.rejects(api.fetchOwnedArenaProducts(), /Unavailable/);
assert.equal(state.calls.length, 1, 'Transient server failures must not retry a request');
assert.equal(expirations, 1);
console.log('Session recovery: 401 refresh/retry, invalid-session reauth, and no 5xx retry passed.');
