# Payment flow review — 2026-11-07

## Scope and result

Reviewed pricing selection, signed Payment Links, legacy Checkout compatibility,
webhooks, receipt reconciliation, owner-only order APIs, draft/image saving,
final submission, Dashboard history and confirmation mail. No deployment, real
payment, production database mutation or external email was performed.

Local checks pass. Production acceptance is still required; this is not a claim
that the live Stripe endpoint or the remote database has been configured.

## Improvements in this revision

- Paid product forms no longer fetch public products, brackets/champions or the
  maker's product list, and no longer start the Arena polling/countdown loops.
  They also no longer replace the public product memory cache with empty props.
- Paid-form image uploads run concurrently and wait for all results. Successful
  uploads are retained when another fails; edits made during Save are preserved.
- A final submission whose response was lost returns the existing receipt on
  retry, without overwriting submitted details or generating another email.
- Receipt state is discarded on sign-out/account changes. Temporary Stripe 5xx
  during missing-order recovery now participates in the bounded polling loop.
- Mail claims are isolated by the owning order's live/test mode. Submission
  delivery gets three brief background attempts; failed work remains in the
  durable outbox. Scheduler GET and manual POST both require CRON_SECRET.
- Added a paid-order history index and made PostgreSQL tests reproducible with a
  pinned dev dependency rather than an ignored scratch-directory dependency.

## Verification evidence

- `npm run verify:payments`: eight suites pass, covering tier prices, URL input,
  OAuth navigation, actual ES256 signatures, private API ownership/mode checks,
  signed webhooks, paid-only creation, receipt recovery, incomplete drafts,
  final-submission protection, PostgreSQL event deduplication, admin deletion,
  rate limits, email isolation/retries and escaped email content.
- Production webpack build and TypeScript pass. Local Supabase connections
  timed out during public-page generation, invoking the existing seed fallback.
  Do not treat this local build's product pages as production data verification.
- Browser tests against the production build with intercepted fixture data:
  three payment tiers begin native navigation in 39/22/39 ms; zero click-time
  payment API requests. This excludes loading the actual Stripe page.
- Incomplete Save and restoration after refresh pass. Paid form makes no public
  Arena/owned-product requests. Simulated webhook absence plus one Stripe 503
  recovers automatically. Signing out removes the previous paid receipt.
- ESLint passes on the payment modules/scripts. ArenaClient has one existing
  unnecessary-dependency warning; it is not a runtime failure.

## Required before accepting real money

1. Apply all payment migrations in order, including
   `lib/migrations/20261107_confirmation_email_modes.sql`, before deploying the
   new mail sender. It changes the email-claim RPC signature; do not apply to an
   old deployed sender without coordinating the release. Previous completed
   orders and drafts are preserved, and historical mail is not backfilled.
2. Configure live Stripe keys/links, the stable attribution signing secret,
   canonical return URL and webhook secret. Test actual delivery with the
   customer closing the browser immediately after payment, plus duplicate and
   delayed webhook delivery. The return page cannot replace this test.
3. Configure the email retry endpoint with an authenticated external scheduler
   every 5–10 minutes. Alert on failures and manually reconcile exhausted/older
   queue rows. Sent means provider acceptance, not guaranteed inbox placement.
4. Refunds/disputes and supplier fulfillment/report delivery remain manual.
   Refunds currently do not automatically update the app's paid label or close
   the details form. Reconcile in the order store before further fulfillment.
   The advertised money-back guarantee also needs an explicit operational policy;
   this revision does not invent refund eligibility or deadlines.
5. Verify deployed Supabase connectivity and the genuine product catalogue; the
   local build timeout is distinct from passing payment code tests.

## Maintainability

Payment server logic, route handlers, pricing and email templates are separated,
and compatibility code is not on the new click-to-pay path. The primary remaining
coupling is the 4,000+ line ArenaClient reused for the submission form. This review
removed its paid-form background work but did not risk a broad Arena rewrite.
A later focused change should extract the shared product form with the existing
free/paid regression tests. Refund synchronization and operator fulfillment are
separate missing capabilities, not features silently covered by this revision.
