This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Copy `.env.example` to `.env.local` and configure the Supabase public values. Cloud mode also requires the server-only values listed below.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## OAuth: local and production are separate browser origins

In **Supabase → Authentication → URL Configuration**, keep **Site URL** set to `https://www.indieclash.com` and add these **Redirect URLs**:

```text
https://www.indieclash.com/auth/callback
http://localhost:3000/auth/callback
http://localhost:3100/auth/callback
```

If you use `127.0.0.1`, a different port, or a Vercel Preview URL, add that exact origin's `/auth/callback` too. Do not use a global wildcard for production. Use the same address throughout sign-in; don't switch between localhost and production, or between www and non-www. The app intentionally uses `window.location.origin`, not the SEO canonical domain, for OAuth.

If local sign-in lands on the production site, check this allowlist first. PKCE needs the verifier stored in the origin that started sign-in; production cannot read localhost's storage. Signing in again on production only hides the misconfiguration. After fixing the allowlist, return to the original local tab and start a fresh sign-in (old authorization codes are one-use). No SQL is involved.

The browser explicitly exchanges a callback code once, shows success/failure, removes the code from the URL, and restores the submit draft/console without a second page reload. SDK automatic URL detection remains off to avoid a competing exchange. Never share callback codes or tokens in screenshots/logs.

## Required production security setup

Before deploying the hardened cloud workflow:

1. For an existing production database, confirm `lib/migrations/20260822_production_ready.sql` has already been applied. It enables private base tables, safe public views, atomic voting, uniqueness constraints, transactional settlement, rate limits, and the product-logo bucket.
2. Run `lib/migrations/20260903_product_profiles.sql` in the Supabase SQL editor **before deploying this version**. It is additive and rerunnable: it preserves every product, match, vote, critique, and URL while adding richer profiles, fair-exposure counters, exact round deadlines, adaptive bracket sizes, true FIFO enqueue timestamps, peer-review discovery boosts, and owner profile updates.
3. Existing products remain live with their original identity and Arena history. Their owners can use **My Console → Edit Profile** to add the new description, category, pricing, audience, platforms, maker story, and feedback request fields.
4. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only deployment secret. Never expose it through a `NEXT_PUBLIC_` variable.
5. Configure a strong `CRON_SECRET`; Vercel sends it as the Bearer token to `/api/cron/settle`.
6. Configure either `ADMIN_API_SECRET`, `ADMIN_EMAILS`, or both for the protected reset endpoint.

The application intentionally falls back to its local browser sandbox when the public Supabase variables are absent. It no longer contains a hard-coded production project fallback.
If the older production migration reports a unique-index conflict, resolve the reported legacy duplicate open product/bracket records and rerun it; the transaction rolls back instead of applying a partial security state.

The single Vercel cron in `vercel.json` runs daily at `06:00 UTC`. One daily invocation is enough for all formats: deadlines are persisted as exact New York calendar timestamps, voting closes at that timestamp in PostgreSQL, and the next cron invocation settles any due round. A delayed Hobby-plan cron cannot extend voting.

Arena entry is strict FIFO by the time a maker clicks **Push to Arena**. Sixteen queued products lock a Championship roster immediately and voting opens at the next New York midnight. Otherwise the single daily cron starts the largest ready 8/4/2-product run, consuming only the oldest eligible entries; every leftover stays at the front of the next run. Tied and zero-vote matches always settle deterministically: verified vote totals first, earlier product submission second, and stable product ID last. Because every valid vote requires feedback for both products, separate critique counts are necessarily equal in a tied match.

One valid Arena vote requires feedback for both products and activates seven days of +20% **Needs More Eyes** discovery weighting for products owned by that reviewer. The benefit extends the amount of fair discovery a product can receive; it does not alter FIFO, bracket seeding, votes, or winners.

## Search architecture

- `/products/[slug]` is the canonical product identity page. Legacy `/reviews/[slug]` URLs permanently redirect to it.
- `/categories/[slug]` provides a deliberately small eight-category taxonomy. Thin category pages remain `noindex,follow` until they contain at least four products.
- `/underrated` orders real products by qualified visibility rather than payment or raw popularity.
- `/versus/[product-a]-vs-[product-b]` is indexable only when that exact matchup exists in Supabase. Unknown products and fabricated matchups return a real `404` with `noindex`.
- `/sitemap.xml` contains the homepage, product directory, underrated discovery, sufficiently populated category pages, real product pages, and deduplicated real matchup pages. `/robots.txt` keeps public pages crawlable while excluding API and auth endpoints.
- Product and matchup pages emit canonical metadata, Open Graph/Twitter metadata, breadcrumbs, and visible-content-matched JSON-LD. Valid official product-site links are standard followed links; user-supplied social/profile links remain marked `ugc`.

After the production deployment, submit `https://www.indieclash.com/sitemap.xml` in Google Search Console and inspect the homepage plus a representative product and matchup URL.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to optimize the Inter and Outfit font families.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
