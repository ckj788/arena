import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

let slots = [], cursor = 0, effects = [], session = null, sessionError = null, authListener;
const pushes = [], oauthCalls = [], external = [], storage = new Map();
let sessionReads = 0;
const router = { push: path => pushes.push(path) };
const react = {
  createContext: () => ({ Provider: 'Provider' }),
  useContext: context => context.value,
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
  useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useEffect: callback => effects.push(callback),
};
const client = { auth: {
  getSession: async () => { sessionReads++; return { data: { session }, error: sessionError }; },
  onAuthStateChange: callback => { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  signInWithOAuth: async options => { oauthCalls.push(options); return { data: { url: 'https://fixture.supabase.co/auth/authorize' }, error: null }; },
} };
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, URL, URLSearchParams, queueMicrotask,
    window: { location: { origin: 'http://localhost:3000', pathname: '/resources', search: '?tab=guides', assign: value => external.push(value) } },
    sessionStorage: { setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return jsx; assert(name in mocks, `Unexpected import ${name}`); return mocks[name]; },
  });
  return mod.exports;
}
const auth = load('lib/browserOAuth.ts');
const Button = () => null;
const provider = load('app/components/SubmissionAccess.tsx', {
  'next/navigation': { useRouter: () => router }, '@/lib/supabaseClient': { supabase: client },
  '@/lib/requestSafety': { withDeadline: promise => promise }, '@/lib/browserOAuth': auth,
  './AuthProviderButton': { default: Button }, './ClashLogo': { default: () => null }, './useModalAccessibility': { default() {} },
});
function render() { cursor = 0; effects = []; return provider.default({ children: 'Current public page' }); }
function nodes(element) { return !element || typeof element !== 'object' ? [] : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)]; }
let tree = render();
effects[0]();
await new Promise(setImmediate);
await tree.props.value.requestSubmission();
assert.equal(pushes.length, 0, 'Anonymous click must not leave the current page');
tree = render();
assert(nodes(tree).some(node => node.props?.role === 'dialog'), 'Anonymous click opens sign-in');
assert.equal(tree.props.children[0], 'Current public page');
nodes(tree).find(node => node.props?.['aria-label'] === 'Close sign in').props.onClick();
assert.equal(nodes(render()).some(node => node.props?.role === 'dialog'), false, 'Dismiss keeps user on the source page');
await tree.props.value.requestSubmission('/submit/details?plan=growth');
tree = render();
nodes(tree).find(node => node.type === Button && node.props.provider === 'google').props.onClick();
await new Promise(setImmediate);
assert.equal(storage.get(auth.OAUTH_RETURN_TO_KEY), '/resources?tab=guides', 'Cancellation return location is preserved');
assert.equal(storage.get(auth.OAUTH_SUBMISSION_TARGET_KEY), '/submit/details?plan=growth');
assert.equal(oauthCalls[0].options.redirectTo, 'http://localhost:3000/auth/callback');
assert.equal(external.length, 1);
session = { user: { id: 'fixture-user' } };
authListener('SIGNED_IN', session);
assert.equal(pushes.at(-1), '/submit/details?plan=growth');
tree = render();
const readsAfterLogin = sessionReads;
await tree.props.value.requestSubmission('/submit');
await tree.props.value.requestSubmission('/submit?plan=pro');
assert.equal(sessionReads, readsAfterLogin, 'Known signed-in navigation reuses shared auth state');
assert.equal(tree.props.value.userId, 'fixture-user');
slots = []; pushes.length = 0;
tree = render();
await tree.props.value.requestSubmission();
assert.equal(pushes.at(-1), '/submit', 'Signed-in click goes straight to plan selection');
assert.equal(nodes(render()).some(node => node.props?.role === 'dialog'), false);
slots = []; pushes.length = 0; sessionError = new Error('Auth unavailable');
tree = render(); await tree.props.value.requestSubmission();
assert.equal(pushes.length, 0, 'Auth failure cannot unlock submission');
assert(nodes(render()).some(node => node.props?.role === 'alert'));
sessionError = null; session = null;
authListener('SIGNED_OUT', null);
tree = render();
assert.equal(tree.props.value.userId, null, 'Sign-out removes the cached account');
const beforeSignedOut = pushes.length;
await tree.props.value.requestSubmission('/submit');
assert.equal(pushes.length, beforeSignedOut, 'Sign-out cannot reuse a previously signed-in fast path');

for (const target of ['/submit', '/submit/details?plan=pro']) {
  assert.equal(auth.oauthReturnDestination('/resources', target, false, 'https://www.indieclash.com'), target);
  assert.equal(auth.oauthReturnDestination('/resources', target, true, 'https://www.indieclash.com'), '/resources');
}
assert.equal(auth.oauthReturnDestination('/resources', '//evil.example', false, 'https://www.indieclash.com'), '/resources');
assert.equal(auth.oauthReturnDestination('//evil.example', null, false, 'https://www.indieclash.com'), '/');
const boundary = fs.readFileSync('app/submit/layout.tsx', 'utf8');
assert(boundary.includes('status === "signed-in"'));
assert(boundary.includes('path === "/submit/result"'), 'Receipts retain their own private authentication');
assert(!boundary.includes('Checking your sign-in'));
let gatePath = '/submit', gateStatus = 'checking';
const layout = load('app/submit/layout.tsx', {
  'next/navigation': { usePathname: () => gatePath, useSearchParams: () => new URLSearchParams() },
  '@/app/components/SubmissionAccess': { useSubmissionAccess: () => ({ status: gateStatus, requestSubmission() {} }) },
  '@/app/components/NavigationLink': { default: () => null }, '@/app/components/PublicSiteHeader': { default: () => null },
  './SubmissionLoading': { default: () => null },
}).default;
function gateResult() { const node = layout({ children: 'PRIVATE FORM' }).props.children; return node.type(node.props); }
assert.equal(gateResult(), 'PRIVATE FORM', 'Public plan content does not wait on session restoration');
gatePath = '/submit/details';
assert.notEqual(gateResult(), 'PRIVATE FORM', 'Private form stays hidden while auth restores');
gateStatus = 'signed-out';
assert.notEqual(gateResult(), 'PRIVATE FORM');
gateStatus = 'signed-in';
assert.equal(gateResult(), 'PRIVATE FORM');
console.log('PASS: anonymous submit prompts before navigation, modal dismissal, signed-in direct navigation, preserved plan after OAuth, success/cancel destinations, session failures and safe return paths. All auth and navigation mocked.');
