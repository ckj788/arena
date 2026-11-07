# Stripe Checkout setup

The current plan picker prepares Checkout Sessions in the background to open Stripe Hosted Checkout for a **one-time USD card payment**. No Stripe.js, publishable key, card fields, or secrets are sent to the browser. The Stripe npm SDK is pinned to 23.0.1 (API version `2026-09-30.endive`); its `allowed_payment_method_types: ["card"]` parameter filters the methods enabled in Stripe. Enable card payments in the Stripe account.

Submission entry requires sign-in first: anonymous Submit clicks open a shared login dialog on the source page; signed-in clicks go straight to `/submit`. Successful OAuth continues to the requested plan/details page; cancellation returns to the source page. The plan page is public; paid links are bound to the signed-in account when it opens. Details routes require sign-in. This is the UX gate; payment and publication APIs still independently authenticate every request. Receipts retain their separate private-order sign-in screen.

## Current boundary

The plan page prepares all three paid Checkout Sessions concurrently through authenticated POST /api/payments/checkout requests. Prices and account ownership come from the server. Preparation creates unpaid sessions in Stripe. Supabase orders are inserted only after verified payment. Get Started is a native anchor to the prepared URL. Clicking it only consumes the in-memory cached attempt and begins navigation.

Preparation is account-scoped, shared across remounts, and renewed after 15 minutes. Failed attempts retain their request IDs for idempotent retries. The selected plan becomes available as soon as its own session is ready. A user who clicks before preparation finishes must wait for readiness. Account changes immediately hide the previous account's URLs.

Webhook delivery and authenticated receipt reconciliation use the same paid-order insertion RPC. Both verify server-written ownership, plan, amount, currency and mode. The return page also rejects refunded/disputed payments before recovering a missing order. Previously issued Payment Link sessions retain their existing validation path.

The paid flow is **sign in → choose a plan → pay → add product details**. Free listings skip payment and use the existing publication form. Checkout requires no product text or image upload. Orders start with empty product/service snapshots. Only a verified paid order can accept complete product information, delivery email, prior submissions and fulfillment authorization. Until then, the receipt and Dashboard show **Paid · Awaiting product details**. Product information has a separate `details_submitted_at` completion marker; payment status is never changed by the details form. Browser drafts are scoped per order, and receipt/order-list links let customers resume without paying again.

The service is fulfilled manually. Purchasing for an existing product does not create another product profile. There is no automated supplier integration or operator fulfillment dashboard yet. Refunds and disputes must currently be handled and reconciled manually in Stripe and the order store; the receipt records the original checkout payment, not a complete accounting ledger.

## Configure locally when ready

1. Run `lib/migrations/20261027_launch_payments.sql`, then `lib/migrations/20261029_pay_first.sql` in the intended Supabase project after reviewing them. If the earlier payment schema was already installed, run the second migration to allow checkout without product details and add the completion timestamp; existing complete order snapshots are preserved. The base migration adds two tables and an atomic event-application RPC, with RLS enabled and **no browser roles granted access**. The SQL uses the default `shipandbattle_` prefix; if `NEXT_PUBLIC_DB_PREFIX` differs, adapt the SQL consistently before running it. Existing product profiles are not changed. These files are not automatically applied by the app.
   Run `lib/migrations/20261030_launch_rate_limits.sql` and `lib/migrations/20261031_confirmation_emails.sql`, followed by `lib/migrations/20261104_paid_only_launch_orders.sql` **before testing or deploying this version**. The last migration adds paid-order insertion through the signed webhook. It also lets a Supabase administrator delete test and live orders from `shipandbattle_launch_orders`. The linked confirmation email row is removed, while the private payment event ledger keeps a deletion marker so that Stripe retries cannot restore the order. A database deletion does not refund or alter the Stripe payment. For an older unpaid order with an open Stripe Checkout Session, expire the session in Stripe before deleting its row.
2. Set these server-only values in `.env.local` (or the deployment's environment settings). Do not send keys in chat or commit `.env.local`:

   ```dotenv
   STRIPE_SECRET_KEY=<Stripe sandbox secret key>
   STRIPE_WEBHOOK_SECRET=<signing secret for this endpoint>
   STRIPE_CHECKOUT_BASE_URL=http://localhost:3000
   ```

   Existing Supabase URL, anon key, and service role key must also be configured. Use the **exact same origin** in the browser and `STRIPE_CHECKOUT_BASE_URL`, including `localhost` versus `127.0.0.1`, to retain the session and draft on return. Production return URLs must use HTTPS.

   The secret key determines test/live mode automatically from its sk_test_, rk_test_, sk_live_ or rk_live_ prefix. Configure the corresponding webhook signing secret for that mode. No publishable key is needed for Hosted Checkout.
   New Checkout Sessions need only STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CHECKOUT_BASE_URL and the existing Supabase settings. Test/live mode is inferred from the key. No manual products, price IDs, Payment Links JSON or link-signing secret are required. Switching the key also requires the matching webhook signing secret, followed by redeployment.

   If this deployment previously issued Payment Links, retain its existing STRIPE_PAYMENT_LINKS and STRIPE_PAYMENT_LINK_SIGNING_SECRET values until outstanding sessions are settled. They are used only for old-session compatibility. Existing saved orders remain accessible independently of those settings.

3. Restart the local development server with `npm run dev`. If Node needs your local proxy, set `INDIECLASH_DEV_PROXY` to its HTTP proxy address in `.env.local`; the dev-only preload routes Node fetch through it. In this opt-in development process, Stripe uses Undici's fetch with the matching proxy dispatcher, avoiding Node 22's bundled-fetch incompatibility with explicit Content-Length headers. Build/start and Vercel do not load this adapter and Stripe retains its default Node HTTP transport.

   Run `npm run stripe:listen` in a second terminal. This uses the locally installed official Stripe CLI with the test API key from `.env.local`, forwards the four supported events, and saves its signing secret to `.env.local` without printing it. Keep the listener running while testing. A manual equivalent is:

   ```sh
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:3000/api/payments/webhook
   ```

   Use the signing secret printed by that CLI listener as the **local** webhook secret. It differs from a Dashboard endpoint's secret.
4. For deployment, register the HTTPS `/api/payments/webhook` endpoint in Stripe, using snapshot events and the SDK's API version above. Subscribe to the same four events. Sandbox and live endpoint secrets and API keys must not be mixed. Configure production separately after sandbox verification.

## Endpoints and payment integrity

Private payment endpoints verify signed session claims and enforce issuer, audience/role, expiration, user ID and OAuth provider. The legacy checkout endpoint retains its timing/quota behavior for older clients; the current picker never calls it.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/payments/links` | Compatibility endpoint for previously deployed Payment Link clients. |
| `GET /api/payments/config` | Reports configuration presence only; it does not check credentials, account eligibility, or database installation. Never returns keys. |
| `POST /api/payments/checkout` | Requires a verified account, validates the plan and request ID, and returns a Stripe Checkout link. Existing legacy attempts can resume a stored order. |
| `POST /api/payments/webhook` | Verifies the signature over the unmodified request body. A confirmed paid event creates the private order atomically. |
| `GET /api/payments/orders/:id` | Requires authentication and returns only the owning user's order summary. |
| `GET /api/payments/orders` | Returns the owning user's latest 50 paid order summaries for Dashboard. Unpaid checkouts stay internal. |
| `PUT /api/payments/orders/:id/details` | Requires the owning user's confirmed paid order and complete product/service information; atomically accepts details once. |

The legacy session endpoint takes `{ requestId, plan, resume }`. New request IDs are timestamped UUIDs with a bounded retry window. The server maps plans to **9,900 / 16,900 / 25,900 USD cents**. Product fields, image uploads and directory history are collected after payment.

After confirmed payment, the details endpoint accepts `{ product, serviceDetails }`. `product` follows the existing product submission validation. `serviceDetails` contains `email`, `history` (`none`, `provided`, `unsure`), `directories`, and `consent: true`. History is required; a provided list must be nonempty. Both the details page and the API enforce ownership/payment status; forging `plan` or `order` query parameters cannot unlock an unpaid order. A duplicate submission returns a conflict instead of overwriting details that may already be in fulfillment.

For legacy session checkouts, the same account and request ID still reuse the original order/session. Existing receipts and cancellation URLs remain supported. Prepared Checkout Sessions use account-scoped attempt IDs and persist orders only after payment. Each attempt maps deterministically to one order; webhook retries reuse that order and deletion markers prevent restoring an administrator-deleted order.

Only signed events matching the stored order, account, plan, amount, currency, mode, and session can mark payment complete. The database locks the order, deduplicates events by Stripe event ID, and never downgrades a paid order when an older pending/expired event arrives. A return to `success_url`, a URL parameter, or an unpaid `checkout.session.completed` does **not** prove payment. The receipt polls the private endpoint for a bounded period and offers manual refresh. Webhook/store failures return non-2xx so Stripe can retry.

Payment APIs are dynamic with no-store responses, and the details/receipt pages are noindex. Product/resource content and existing ISR settings are unchanged by the payment integration.

## Verification

Apply `lib/migrations/20261107_confirmation_email_modes.sql` before deploying this
revision. It changes the email-claim RPC signature and adds the paid-history index.
Sandbox/live history, drafts and email claims are isolated by the secret key's mode.

The paid form does not load public products, matchups or the account's existing
product list, and does not start Arena polling/countdowns. Uploaded images are
processed concurrently; successful uploads survive a failed sibling upload.
If a final submission succeeded but its response was lost, retrying returns the
existing receipt instead of overwriting the completed order or sending new mail.

```sh
npm run verify:payments
node scripts/verify-launch-plans.mjs
node scripts/verify-stripe-payments.mjs
node scripts/verify-pay-first-ui.mjs
node --require ./scripts/local-network.cjs scripts/verify-payment-link-navigation.mjs
node scripts/verify-stripe-transport.mjs
npx tsc --noEmit --incremental false
```

For browser checks against a locally running production build, set
`VERIFY_BASE_URL=http://localhost:3001` and run
`node --require ./scripts/local-network.cjs scripts/verify-payment-recovery-browser.mjs`
and `scripts/verify-payment-link-navigation.mjs` with the same Node preloader.
These intercept all payment/auth/store operations; they do not make a payment.

## Release acceptance

- Configure the Stripe key, matching webhook signing secret and canonical HTTPS return origin. The server supplies all three fixed USD prices.
- Register the live webhook on this application's `/api/payments/webhook` (not
  another project) and verify its signature secret through an actual delivery.
- Test paid checkout and then close the browser before returning. Exactly one
  private order must still appear in Dashboard. Resend the same event and verify
  no duplicate; simulate temporary DB failure and verify Stripe retry recovers it.
- Verify all three totals in a deployed sandbox, owner isolation, cross-device
  Save, final submission and the confirmation-email Dashboard link.
- Configure email queue retries and alerts as described in `resend-setup.md`.
- Refunds/disputes and fulfillment/report delivery are still manual operations.
  A Stripe refund currently does not automatically disable this app's form or
  update its historical paid label. Reconcile the order before further fulfillment.
- The signing secret and configured link IDs must remain stable while checkouts
  are outstanding. A shared or manually edited payment link can lose account
  attribution; never assign an unverified payment based only on a matching email.

Passing offline tests/build is not proof that deployed webhook delivery, OAuth
redirects, database migrations, Resend domain or network access are configured.

The automated payment tests run offline with fake credentials, signed fixture events and mocked storage; they cannot confirm that a real Supabase migration or Stripe account is configured. Before enabling live payments, use sandbox checkout to verify all three totals, success and cancel returns, owner-only receipt access, repeated requests, repeated webhook delivery, delayed notifications, and a declined card. Confirm the private order is marked paid exactly once and no duplicate product is published. Also test re-authentication after returning to the receipt. Do not fulfill an order on the basis of the redirect alone.

Official references: [Hosted Checkout](https://docs.stripe.com/checkout/quickstart?lang=node), [webhook signature verification](https://docs.stripe.com/webhooks/signature), [idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Payment Link references: https://docs.stripe.com/payment-links/url-parameters and https://docs.stripe.com/payment-links/post-payment.
