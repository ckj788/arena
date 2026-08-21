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

## Required production security setup

Before deploying the hardened cloud workflow:

1. Run `lib/migrations/20260821_security_hardening.sql` once in the Supabase SQL editor. It is written for the production `shipandbattle_` prefix and enables RLS, read-only browser access, atomic voting, uniqueness constraints, transactional bracket settlement, and the read indexes used by public product/matchup pages.
2. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only deployment secret. Never expose it through a `NEXT_PUBLIC_` variable.
3. Configure a strong `CRON_SECRET`; Vercel sends it as the Bearer token to `/api/cron/settle`.
4. Configure either `ADMIN_API_SECRET`, `ADMIN_EMAILS`, or both for the protected reset endpoint.

The application intentionally falls back to its local browser sandbox when the public Supabase variables are absent. It no longer contains a hard-coded production project fallback.
If the migration reports a unique-index conflict, resolve the reported legacy duplicate open product/bracket records and rerun it; the transaction rolls back instead of applying a partial security state.

## Search architecture

- `/products/[slug]` is the canonical product identity page. Legacy `/reviews/[slug]` URLs permanently redirect to it.
- `/versus/[product-a]-vs-[product-b]` is indexable only when that exact matchup exists in Supabase. Unknown products and fabricated matchups return a real `404` with `noindex`.
- `/sitemap.xml` contains the homepage, real product pages, and deduplicated real matchup pages. `/robots.txt` keeps public pages crawlable while excluding API and auth endpoints.
- Product and matchup pages emit canonical metadata, Open Graph/Twitter metadata, breadcrumbs, and visible-content-matched JSON-LD. User-submitted outbound links are marked `rel="ugc"`.

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
