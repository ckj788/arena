import { PRODUCT_CATEGORIES } from "@/lib/productTaxonomy";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const categories = PRODUCT_CATEGORIES
    .map((category) => `- ${category.label}: ${SITE_URL}/categories/${category.value}`)
    .join("\n");
  const body = `# Indie Clash

> ${SITE_DESCRIPTION}

Indie Clash exists to give independent products durable discovery rather than a single popularity-driven launch moment. Product placement cannot be purchased.

## Core pages
- Homepage and live Arena: ${SITE_URL}/
- Product directory: ${SITE_URL}/products
- Underrated products: ${SITE_URL}/underrated
- Product categories: ${SITE_URL}/categories
- Sitemap: ${SITE_URL}/sitemap.xml

## Categories
${categories}

## How discovery works
- Each accepted product receives a permanent public profile.
- The Latest Releases stream rotates the newest 50 products.
- Needs More Eyes prioritizes products with fewer qualified views.
- A valid two-sided peer critique can temporarily add 20% Needs More Eyes discovery weight; it never changes Arena FIFO or match results.
- Arena entry follows the time a maker joins the queue. Leftovers keep guaranteed priority for the next run, and ties always settle deterministically.
- Arena voting requires authenticated participants to leave constructive feedback.
- Official product website links are normal followed links.

## Content notes
Product descriptions and maker stories are submitted by their makers. Arena critiques are community-authored. Check the linked official product website for current product claims, pricing, and availability.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
