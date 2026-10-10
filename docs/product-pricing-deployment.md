# Optional product pricing

1. Run `lib/migrations/20261010_product_pricing.sql` in the Supabase SQL editor **before** deploying the updated app.
2. Run `lib/migrations/20261010_product_pricing_verify.sql`. All six boolean checks should be true. Confirm the product count is unchanged.
3. Deploy the application. Makers can add one optional plan when submitting, or use **Console → Edit Profile** later. Clearing plan details removes the saved quote.
4. Inspect an existing product without a quote: its JSON-LD retains WebPage and BreadcrumbList, with no incomplete Product and no dangling `#product` reference.
5. Inspect a product with a complete quote: the visible plan name, amount, currency, billing period and official pricing link match its Product/Offer JSON-LD. Use Google's Rich Results Test before requesting GSC product-snippet validation.

The migration adds one nullable JSONB column and its public, moderation-redacted projection. It does not backfill prices, delete products, change URLs, or expose owner IDs. It preserves existing safety policies and grants no new write access.

Pricing is maker-provided, not independently verified by Indie Clash. Only use 0 for an actual free plan, not a trial or a free submission. Never convert Arena votes into reviews or ratings. Paid/Freemium labels alone do not create Offers. Current support covers free, one-time, monthly and yearly plans in the listed currencies; usage-based prices can remain unquoted.

Local tests use isolated fixtures and intercept all browser writes. They do not install the production migration or submit real products. If the database migration has not been installed, do not deploy the pricing editor. Database errors must remain visible; the app does not silently drop submitted pricing.

## Local verification

Run `node scripts/verify-product-pricing.mjs` for input, persistence and API unit tests (in-memory database only). For SSR and browser tests, start Next with `INDIECLASH_SAFETY_FIXTURE=1`, `NODE_OPTIONS=--require=./scripts/product-safety-fixture.cjs` and port 3110, then run `node scripts/verify-product-pricing-ui.mjs`. The explicit fixture flag uses `.next-fixture` to keep test data out of the normal build cache. Never deploy that test build.
