import type { MetadataRoute } from "next";
import { getSitemapRecords, matchSlug } from "@/lib/server/publicSeoData";
import { absoluteUrl } from "@/lib/site";

// The shared Supabase client intentionally uses no-store reads. Marking this
// metadata route dynamic prevents Next from mistaking that read for a static
// generation failure and freezing a homepage-only fallback sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
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
