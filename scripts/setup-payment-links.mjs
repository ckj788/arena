// Run with: node --require ./scripts/local-network.cjs scripts/setup-payment-links.mjs
// Test mode only. Does not charge a card or create a customer/order.
import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { fetch as proxyFetch } from 'undici';

if ((process.env.STRIPE_MODE || 'test') !== 'test' || !/^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '')) throw new Error('This setup script only provisions test-mode payment links.');
const baseUrl = new URL(process.env.STRIPE_CHECKOUT_BASE_URL).origin;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 20000, maxNetworkRetries: 1,
  ...(process.env.INDIECLASH_DEV_PROXY_ACTIVE === '1' ? { httpClient: Stripe.createFetchHttpClient(proxyFetch) } : {}) });
const existing = JSON.parse(process.env.STRIPE_PAYMENT_LINKS || 'null');
const links = {};
const suffix = createHash('sha256').update(baseUrl).digest('hex').slice(0, 12);
for (const [plan, amount, count] of [['starter', 9900, 50], ['growth', 16900, 100], ['pro', 25900, 200]]) {
  let link;
  if (existing?.mode === 'test' && existing.baseUrl === baseUrl && existing.links[plan]) {
    link = await stripe.paymentLinks.retrieve(existing.links[plan].id);
  } else {
    const product = await stripe.products.create({ name: `${plan[0].toUpperCase() + plan.slice(1)} — ${count}+ directory submissions`,
      description: 'One-time manual directory submission service. Not a subscription.',
      default_price_data: { currency: 'usd', unit_amount: amount }, metadata: { application: 'indieclash-directory', plan },
    }, { idempotencyKey: `indieclash-link-product-v1:${suffix}:${plan}` });
    link = await stripe.paymentLinks.create({ line_items: [{ price: product.default_price, quantity: 1 }],
      payment_method_types: ['card'], allow_promotion_codes: false,
      metadata: { application: 'indieclash-directory', plan, flow: 'payment-link' },
      after_completion: { type: 'redirect', redirect: { url: `${baseUrl}/submit/result?session_id={CHECKOUT_SESSION_ID}` } },
    }, { idempotencyKey: `indieclash-payment-link-v1:${suffix}:${plan}` });
  }
  const items = await stripe.paymentLinks.listLineItems(link.id);
  if (link.livemode || !link.active || items.data.length !== 1 || items.data[0].amount_total !== amount
    || items.data[0].currency !== 'usd' || link.metadata.plan !== plan
    || link.after_completion.redirect?.url !== `${baseUrl}/submit/result?session_id={CHECKOUT_SESSION_ID}`) throw new Error(`Unexpected Stripe configuration for ${plan}`);
  links[plan] = { id: link.id, url: link.url };
  console.log(`Verified test ${plan}: $${amount / 100}, one-time, redirect configured.`);
}
let env = fs.readFileSync('.env.local', 'utf8');
const values = { STRIPE_PAYMENT_LINKS: JSON.stringify({ mode: 'test', baseUrl, links }),
  STRIPE_PAYMENT_LINK_SIGNING_SECRET: process.env.STRIPE_PAYMENT_LINK_SIGNING_SECRET || randomBytes(48).toString('hex') };
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, () => line) : `${env.trimEnd()}\n${line}\n`;
}
fs.writeFileSync('.env.local', env);
console.log('Saved test payment link configuration to ignored .env.local. No payment performed.');
