import type { MetadataRoute } from "next";
import { getSitemapRecords, matchSlug } from "@/lib/server/publicSeoData";
import { absoluteUrl } from "@/lib/site";

// The route stays dynamic while its paginated database result is cached in the
// data layer and invalidated after arena writes.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: absoluteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
  const { products, matches } = await getSitemapRecords();
  const productEntries = products.map((product) => {
    const submittedAt = product.submittedAt ? new Date(product.submittedAt) : null;
    return {
      url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
      lastModified: submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });
  const seenMatches = new Set<string>();
  const matchEntries = matches.flatMap((match) => {
    const slug = matchSlug(match);
    if (seenMatches.has(slug)) return [];
    seenMatches.add(slug);
    return [{
      url: absoluteUrl(`/versus/${slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }];
  });

  return [...entries, ...productEntries, ...matchEntries];
}
