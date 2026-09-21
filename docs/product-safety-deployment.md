# Product safety, screenshots and OG crawl access

## Deployment order

1. Take a Supabase backup/export before schema changes. Confirm the previously installed `20260903_product_profiles.sql` is present.
2. Run **`lib/migrations/20260919_product_safety.sql`** in the Supabase SQL editor, in full. It is transactional and repeatable; do not run only its final statements. This task has NOT executed it on production.
3. Run **`lib/migrations/20260919_product_safety_verify.sql`**. Missing lists must be `[]`; index, trigger and privacy checks must be `true`. Check the product counts against your pre-migration count.
4. Deploy the matching application. No additional environment variables are needed: existing `SUPABASE_SERVICE_ROLE_KEY` and comma-separated `ADMIN_EMAILS` are used. Never prefix these with `NEXT_PUBLIC_`.
5. Sign in using an administrator email. My Console shows **Moderation**; the direct path is `/moderation`. The page is noindex, and its API independently enforces administrator authorization.

Do not deploy this app version before the SQL. New submissions/edits require the new columns and duplicate-domain index. The existing `product-logos` bucket is reused; screenshots are resized in the browser and remain under the bucket's existing 1,000,000-byte limit. No new bucket is needed.

## What the rules actually do

- New products publish immediately as `unreviewed`; no mandatory manual queue. As of 2026-09-21, all unrestricted product website links use `noopener noreferrer` (followed), including existing unreviewed products. Moderation status and link-trust metadata remain available for review, but no longer gate followed links. Restricted products remain hidden and any remaining website links use `ugc nofollow noopener noreferrer`. This is link labeling, **not** a malware scan or safety certification. This policy change needs no new SQL.
- Existing products retain normal/trusted links. They are grandfathered, not automatically declared safe. Staff can restrict them at any time. Material edits (including destination paths) reset an approved record to unreviewed; editing cannot unlock a restricted record.
- Duplicate website hosts ignore scheme, `www`, trailing dot, path and port. Distinct hosted subdomains stay separate. GitHub/GitLab repositories are distinguished by owner/repository. Historical duplicates are not deleted or merged; editing their unchanged destination is permitted. Database checks protect against concurrent submissions and preserve uniqueness even if a legacy representative changes domains.
- Reports require Google/GitHub sign-in, allow one report per account/product and at most ten distinct product reports per rolling 24 hours. Reports do not automatically hide listings. Staff can dismiss, approve, restrict or restore, with a required reason saved to a private audit log.
- Restriction removes products from discovery/catalogue/sitemap and makes the product detail return 404. Public match data retains a redacted participant (without external links, screenshots or promotional text); original product rows, ownership, votes and bracket records stay intact. Existing open browsers refresh on their normal data refresh cycle; already downloaded screenshots or third-party search caches cannot be recalled.
- One optional screenshot can be uploaded, edited or removed. Allowed input: PNG/JPEG/WebP up to 5 MB, resized to at most 1600px and under 1 MB before upload. Invalid files show an error. No SVG/HTML or arbitrary remote screenshot URLs.
- `robots.txt` continues blocking private `/api/` paths while explicitly allowing `/api/og/`. Product canonical URLs and established slugs are unchanged.

## Acceptance checks after deployment

- Open `/robots.txt`: both `Disallow: /api/` and `Allow: /api/og/` appear.
- Open a known product's `/api/og/versus?slug=PRODUCT_ID`: expect 200 and an image content type. Test actual social previews separately; crawlers can cache old failures.
- With an ordinary account, add a screenshot to a test product; verify it on the detail page and after reopening Edit. Remove it and verify the field is cleared.
- Try the same website with `www`, a different path and repeated clicks: expect a helpful duplicate response, not another product.
- Report a test product; it must remain visible until an administrator acts. A non-admin cannot load `/api/arena/moderation` or execute its mutations.
- Restrict the test product; verify directory disappearance, detail 404, disabled outbound links and preserved Console/history record. Restore it and confirm it reappears without changing its slug.

Use a staging project/test product for write tests. Do not restrict someone else's real product just to test.

## Local verification

- `node scripts/verify-product-safety.mjs`: input, trust, robots and mocked endpoint tests.
- `node scripts/verify-product-safety-sql.mjs`: PostgreSQL/PGlite isolated migration tests. Install PGlite into a temporary npm cache and set `PGLITE_MODULE` to its `dist/index.js`, or make the package available locally. Does not connect to Supabase.
- `node scripts/verify-reliability.mjs`: existing discovery/network resilience tests.
- `node scripts/verify-api-boundaries.mjs`: local unauthenticated API checks.
- UI fixtures: set `INDIECLASH_SAFETY_FIXTURE=1`, preload `scripts/product-safety-fixture.cjs` with `NODE_OPTIONS=--require=./scripts/product-safety-fixture.cjs`, start local Next dev on port 3110, then run `node scripts/verify-product-safety-ui.mjs`. Uses synthetic data and intercepts all mutations. **Stop the fixture server, unset these process variables and clear generated `.next/dev` artifacts before normal local work. Never use this preload for a real deployment.**

Production compilation/type checks passed during implementation; full prerendering with live data was blocked by intermittent Supabase query timeouts. Isolated UI/SQL tests and a local OG image response (200, image/png) passed. Isolated tests do not prove the live migration has been installed.
