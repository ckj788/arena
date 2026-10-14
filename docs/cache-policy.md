# Public cache policy

The application retains Next.js's existing non-Cache-Components cache model.
Page exports use literal intervals so Next can evaluate them at build time.
Data cache intervals and tags live in `lib/server/cachePolicy.ts`.

| Content | Scheduled refresh | Normal invalidation |
| --- | --- | --- |
| Discover, product directory, underrated, product details | 1 hour | Catalogue changes; activity tags on the two voted products |
| Arena snapshot | 5 minutes | Votes and queue/round changes |
| Champions | 1 hour | Catalogue and queue/round changes |
| Startup launch directories and its recent products | 1 hour | Catalogue changes |
| Resource hub and editorial guides | Deployment | Source changes |
| Sitemap | Every request | Reads the current public catalogue without ISR |
| Legacy raster images | Browser 1 hour, CDN 1 day | Content hash in the URL changes with the image |

Timers cover database edits made outside the application. A timer expires only
when the page/data is requested again; it is not a scheduled background job.
The existing browser refresh continues to read live product/match data, so the
public HTML interval does not set the live vote counter's update frequency.

## Mutation dependencies

- Submit/edit: expire `arena-catalogue` immediately and revalidate the concrete
  product URL, including a previously cached 404. Catalogue tags also update
  dependent product metadata, related products and the resource recent list.
- Vote: resolve the two product IDs from the public match; expire only the live
  bracket, those two product activity tags and the two matchup slug orders.
  Catalogue, Champions and resource pages retain their caches.
- Queue, settlement and administrative round reset: expire the catalogue,
  bracket, champions and recorded activity caches. Settlement only invalidates
  after the database reports an actual transition.
- Moderation: immediately expire all public product projections and activity
  caches. Do not use stale-while-revalidate for restrictions. The root layout
  and static resource guides do not need a global purge.

Never use `revalidatePath('/', 'layout')` for ordinary votes or submissions.
When adding a public cache, use these tags or add its invalidation explicitly;
do not reintroduce a global tag that connects voting to every public page.

## Payloads and images

Discover receives only the catalogue, Champions receives the catalogue and
historical winners, and Arena receives all three snapshots. No second cache
persists the combined snapshot. Legacy raster data URIs are represented by
versioned `/product-images/{id}` URLs; original database values stay intact.
The image handler reads only the public view, rejects restricted products and
stale versions, and never caches database errors as successful responses.
New images continue to use Supabase Storage directly.

## Verification and rollout

`node scripts/verify-cache-policy.mjs` exercises tag isolation, fresh vote
totals, cached-404 recovery, visibility and image response boundaries in memory.
Pricing, safety and resource regression checks remain available alongside it.

Start each integration run with a fresh `.next-fixture/cache/fetch-cache`.
Next's data cache persists across builds, including the previous run's simulated
submissions and moderation decisions. Stop the test server before clearing this
generated test cache; never clear the normal `.next` or production cache here.

Build with `INDIECLASH_SAFETY_FIXTURE=1` and
`NODE_OPTIONS=--require=./scripts/product-safety-fixture.cjs` using
`next build --webpack`. Start that isolated build with
`INDIECLASH_CACHE_MUTATION_FIXTURE=1` and
`NODE_OPTIONS=--require=./scripts/cache-mutation-fixture.cjs`, then run
`scripts/verify-cache-integration.mjs` with that opt-in flag and `UI_TEST_URL`
pointing to the local server. It uses only fake auth and in-memory fixture rows,
verifies actual Next.js tag invalidation, and must never target production.

After deployment, inspect Vercel Usage → ISR Writes grouped by project. Compare
daily usage before/after the deployment rather than expecting the consumed
monthly allowance to reset. These changes reduce avoidable regeneration but
cannot restore an exhausted allowance or guarantee a particular reduction.
