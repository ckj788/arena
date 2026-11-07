// Local PostgreSQL + fake Resend transport. Never reads .env or sends real mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
function loadTemplate(file, mocks = {}) {
  const result = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: result, exports: result.exports, URL, require: name => mocks[name] });
  return result.exports;
}
const plans = loadTemplate('lib/submissionPlans.ts');
const templates = loadTemplate('lib/emails/submissionConfirmation.ts', { '@/lib/submissionPlans': plans });
const owner = randomUUID(), order = randomUUID();
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);');
  await db.query('INSERT INTO auth.users VALUES ($1)', [owner]);
  await db.exec(fs.readFileSync('lib/migrations/20261027_launch_payments.sql', 'utf8'));
  const sql = fs.readFileSync('lib/migrations/20261031_confirmation_emails.sql', 'utf8');
  await db.exec(sql); await db.exec(sql);
  const modeSql = fs.readFileSync('lib/migrations/20261107_confirmation_email_modes.sql', 'utf8');
  await db.exec(modeSql); await db.exec(modeSql);
  await db.query("INSERT INTO public.shipandbattle_launch_orders(id,user_id,request_id,input_hash,plan,amount_total,currency,livemode,status) VALUES ($1,$2,$3,'fixture','growth',16900,'usd',false,'paid')", [order, owner, randomUUID()]);
  const count = async () => (await db.query('SELECT * FROM public.shipandbattle_confirmation_emails')).rows;
  assert.equal((await count()).length, 0);
  await db.query("UPDATE public.shipandbattle_launch_orders SET product=$1 WHERE id=$2 AND user_id=$3 AND status='paid' AND details_submitted_at IS NULL", [{ draft: { title: 'Partial title' }, draftSavedAt: '2026-10-31T00:00:00Z' }, order, owner]);
  assert.equal((await count()).length, 0, 'Saving a draft does not queue a confirmation email');
  await db.query("UPDATE public.shipandbattle_launch_orders SET product=$1,service_details=$2,details_submitted_at=now() WHERE id=$3", [{ title: 'Fixture Product' }, { email: 'fixture@example.com' }, order]);
  await db.query('UPDATE public.shipandbattle_launch_orders SET details_submitted_at=now() WHERE id=$1', [order]);
  assert.equal((await count()).length, 1, 'Final submission enqueues once');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT * FROM public.shipandbattle_confirmation_emails'), e => e.code === '42501');
  await assert.rejects(db.query('SELECT public.shipandbattle_claim_confirmation_emails(NULL,false)'), e => e.code === '42501');
  await db.exec('RESET ROLE');
  const adapter = {
    async rpc(_name, { p_order_id, p_livemode }) { return { data: (await db.query('SELECT * FROM public.shipandbattle_claim_confirmation_emails($1,$2)', [p_order_id, p_livemode])).rows, error: null }; },
    from() { let changes, filters = []; return {
      update(value) { changes = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
      then(resolve, reject) {
        const entries = Object.entries(changes), params = entries.map(([, value]) => value).concat(filters.map(([, value]) => value));
        const query = `UPDATE public.shipandbattle_confirmation_emails SET ${entries.map(([key], n) => `${key}=$${n + 1}`).join(',')} WHERE ${filters.map(([key], n) => `${key}=$${entries.length + n + 1}`).join(' AND ')}`;
        return db.query(query, params).then(() => ({ error: null })).then(resolve, reject);
      },
    }; },
  };
  const env = { NODE_ENV: 'production', RESEND_FROM_EMAIL: 'Indie Clash <notifications@example.com>', STRIPE_CHECKOUT_BASE_URL: 'https://www.indieclash.com', EMAIL_SITE_URL: 'http://localhost:3000', RESEND_REPLY_TO: 'reply@example.com' };
  const requests = []; let responseStatus = 503;
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/confirmationEmails.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: mod, exports: mod.exports, URL, AbortSignal, Error, console, setTimeout: callback => { queueMicrotask(callback); }, process: { env },
    fetch: async (url, init) => { requests.push({ url, init }); return Response.json({ id: 'email_fixture' }, { status: responseStatus }); },
    require(name) { return { 'server-only': {}, '@/lib/supabaseClient': { DB_PREFIX: 'shipandbattle_' }, '@/lib/emails/submissionConfirmation': templates, './auth': { getAdminClient: () => adapter }, './stripe': { stripeMode: () => env.STRIPE_MODE || 'test', checkoutBaseUrl: () => env.STRIPE_CHECKOUT_BASE_URL } }[name]; },
  });
  const send = () => mod.exports.dispatchConfirmationEmails(order);
  assert.equal((await send()).configured, false);
  assert.equal((await count())[0].attempts, 0, 'Missing configuration preserves the queue');
  env.RESEND_API_KEY = 're_fixture';
  env.STRIPE_MODE = 'live';
  assert.equal((await send()).sent, 0, 'Live sender cannot claim sandbox emails');
  assert.equal((await count())[0].attempts, 0);
  env.STRIPE_MODE = 'test';
  assert.equal((await send()).failed, 1);
  assert.equal((await count())[0].status, 'pending');
  responseStatus = 200;
  assert.equal((await send()).sent, 1);
  assert.equal((await count())[0].status, 'sent');
  assert.equal((await send()).sent, 0);
  assert.equal(requests.length, 2, 'Sent message is never reclaimed');
  assert.equal(requests[0].init.headers['Idempotency-Key'], requests[1].init.headers['Idempotency-Key']);
  assert.equal(requests[0].init.body, requests[1].init.body);
  const payload = JSON.parse(requests[1].init.body);
  assert.equal(payload.to[0], 'fixture@example.com');
  assert.equal(payload.reply_to, 'reply@example.com');
  assert(payload.text.includes('Fixture Product') && payload.text.includes(order));
  assert(payload.html.includes('Within 10 business days') && payload.text.includes('10 business days'));
  assert(payload.html.includes('100+ directories') && payload.html.includes('View your order'));
  assert(payload.text.includes(`https://www.indieclash.com/?view=console&order=${order}`));
  assert(payload.html.includes(`https://www.indieclash.com/?view=console&amp;order=${order}`));
  assert(!payload.html.includes('localhost'), 'Production email uses the payment origin even with a stale email-only setting');
  const hostile = templates.submissionConfirmationEmail({ order_id: order, product_name: '<img src=x onerror="alert(1)"> & test', plan: 'starter' }, 'https://www.indieclash.com');
  assert(!hostile.html.includes('<img src=x') && hostile.html.includes('&lt;img'));
  assert(hostile.html.includes('50+ directories'));
  // Exercise bounded background retries with a persistent provider outage.
  await db.query("UPDATE public.shipandbattle_confirmation_emails SET status='pending', attempts=0 WHERE order_id=$1", [order]);
  responseStatus = 503;
  const beforeRetry = requests.length;
  await mod.exports.deliverSubmissionConfirmation(order);
  assert.equal(requests.length - beforeRetry, 3);
  assert.equal((await count())[0].status, 'pending');
  assert.equal((await count())[0].attempts, 3);
  responseStatus = 200;
  await mod.exports.deliverSubmissionConfirmation(order);
  assert.equal((await count())[0].status, 'sent');
  console.log('PASS: real PostgreSQL trigger/outbox, rerunnable migration, private access, one email per submitted order, disabled configuration, failed-send persistence, retry with stable payload/key, sent-row deduplication and receipt content. No external mail.');

  const paidOnly = fs.readFileSync('lib/migrations/20261104_paid_only_launch_orders.sql', 'utf8');
  await db.exec(paidOnly); await db.exec(paidOnly);
  const record = (...args) => db.query('SELECT public.shipandbattle_record_launch_checkout_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', args);
  const legacy = ['evt_legacy', 'checkout.session.completed', order, owner, 'cs_test_legacy', 'growth', 16900, 'usd', false, 'paid', 'pi_legacy', null, null];
  await db.exec('SET ROLE authenticated');
  await assert.rejects(record(...legacy), e => e.code === '42501');
  await db.exec('RESET ROLE');
  await record(...legacy);
  for (const livemode of [false, true]) {
    const id = randomUUID();
    const mode = livemode ? 'live' : 'test';
    const args = [`evt_${mode}`, 'checkout.session.completed', id, owner, `cs_${mode}_fixture`, 'starter', 9900, 'usd', livemode, 'paid', `pi_${mode}`, randomUUID(), 'hash'];
    const find = async () => (await db.query('SELECT * FROM public.shipandbattle_launch_orders WHERE id=$1', [id])).rows[0];
    await record(...args.map((value, index) => index === 9 ? 'pending' : value));
    assert.equal(await find(), undefined);
    await record(...args); await record(...args);
    const paid = await find();
    assert.equal(paid.user_id, owner);
    assert.equal(paid.status, 'paid');
    assert.equal(paid.livemode, livemode);
    assert.equal(paid.stripe_payment_intent_id, `pi_${mode}`);
    await db.query("UPDATE public.shipandbattle_launch_orders SET product=$1,service_details=$2,details_submitted_at=now() WHERE id=$3", [{ title: 'Fixture Product' }, { email: 'fixture@example.com' }, id]);
    await db.exec('SET ROLE service_role');
    assert.equal((await db.query('DELETE FROM public.shipandbattle_launch_orders WHERE id=$1 RETURNING id', [id])).rows.length, 1);
    await record(...args);
    await record(`evt_replayed_${mode}`, ...args.slice(1));
    await db.exec('RESET ROLE');
    assert.equal(await find(), undefined, 'Webhook retries must not restore deleted orders');
    assert.equal((await count()).some(mail => mail.order_id === id), false);
    assert.equal((await db.query('SELECT id FROM public.shipandbattle_launch_payment_events WHERE order_id=$1', [id])).rows.length, 2);
  }
  await db.query('DELETE FROM public.shipandbattle_launch_orders WHERE id=$1', [order]);
  await record(...legacy);
  assert.equal((await count()).length, 0);
  console.log('PASS: paid-only order creation, private RPC, legacy webhook, admin deletion in both modes, email cascade and webhook replay protection.');
} finally { await db.close(); }
