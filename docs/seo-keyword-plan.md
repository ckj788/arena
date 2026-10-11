# Keyword-to-page plan — 2026-10-11

This is a search-intent map, not a claim about verified volume, difficulty or
future rankings. Related variants share one useful page rather than getting
separate near-duplicate URLs. No meta-keywords, hidden keyword blocks or invented
reviews/prices are used.

| Search cluster | Owning page | Implementation |
| --- | --- | --- |
| product discovery platform(s), launch a product | `/` | Platform description and sharing metadata; existing visual headline retained |
| new products, product launches, SaaS product(s) | `/products` | Recent independent software launches, real maker profiles and directory copy |
| startup directories/directory, startup listing sites | `/resources/startup-launch-directories` | Existing URL retained; submission guidance, scope and preparation links added |
| product launch, new product launch, how to launch a product, launch a startup | `/resources/how-to-launch-a-product` | Full release checklist: audience, readiness, assets, channels, launch day and follow-up |
| feedback for products, startup feedback/review, beta testers/tester, beta testing, test your idea | `/resources/find-beta-testers` | Recruitment, invitation template, testing tasks and feedback log; Arena is not presented as managed testing |
| tools for solopreneurs, startup company tools | `/resources/tools-for-solopreneurs` | Task-based launch stack with sources and capability limits |
| open source SEO tools/tool, best free SEO tools/tool | Same tools guide, `#open-source-seo-tools` | Lighthouse and Unlighthouse; auditing distinguished from keyword research and ranking guarantees |
| product demo software/platform | Same tools guide, `#product-demo-software` | Recording versus interactive tours; OBS and Tella examples |
| photo editing software | Same tools guide, `#launch-images` | GIMP for genuine screenshot preparation, not a comprehensive editor ranking |
| lead generation tools/platform | Same tools guide, `#lead-generation-tools` | Inquiry capture versus prospecting; Tally example, permission-based follow-up |

## Intentionally not targeted

- `funding portals`: fundraising is not a service offered by this site.
- `free business listing directory`, `free local directories`: local-business
  yellow pages are a different audience. Generic free-directory queries are not
  promised full coverage by a software launch directory.
- `product launch venues`, `launch party venues`: physical event venues.
- `how to start a startup` and reordered variants: a complete startup formation
  curriculum is outside the product-release guide.
- `startup websites`, `startup company websites`, `startup companies`, `list of
  startups`: confirm whether the SERP expects design examples, company research
  or a software directory before expanding content.
- `saas platform`: broad platform/software intent; descriptive language only.
- `product hunt`, `indie hackers`: relevant references, not brand impersonation
  or substitutes for the official websites.
- `submit your`: incomplete query. Submission calls to action remain descriptive.

## Publication and verification

The three new guides are statically rendered articles within Resources, with
self-canonical URLs, unique metadata, Article/Breadcrumb JSON-LD and sitemap
entries. They do not need a new database table. Dates reflect content edits; the
directory's platform-policy review date is kept separate from its content date.
The disabled public category rollout is unchanged.

After deploying, inspect the three new URLs in GSC's default Google-index view.
Request indexing once for an unindexed URL if live inspection passes. Keep the
existing sitemap; do not create a second one. Review `/resources/` performance
by page and query, and distinguish brand/entity queries from thematic queries.
Assess first after roughly two weeks, but do not interpret that interval as a
guaranteed indexing or ranking deadline.

Useful evidence: indexed status, Google-selected canonical, relevant non-brand
queries, impressions across multiple days and visits that lead to meaningful
product exploration or submissions. Keyword presence alone is not success.
