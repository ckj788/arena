import type { MetadataRoute } from "next";
import { getSitemapRecords, matchSlug } from "@/lib/server/publicSeoData";
import { absoluteUrl } from "@/lib/site";
import { PRODUCT_CATEGORIES } from "@/lib/productTaxonomy";

// Cache the complete XML with ISR, not a partial fallback. A failed regeneration
// leaves the previous successful sitemap in place. Arena writes also invalidate
// /sitemap.xml. With no successful snapshot, fail rather than publish missing URLs.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/products"),
      changeFrequency: "daily",
      priority: 0.9,
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
  const categorizedCount = products.filter((product) => product.category).length;
  const discoveryEntries: MetadataRoute.Sitemap = [
    ...(categorizedCount >= 4 ? [{
      url: absoluteUrl("/categories"),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }] : []),
    ...(products.length >= 6 ? [{
      url: absoluteUrl("/underrated"),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }] : []),
  ];
  const productEntries = products.map((product) => {
    const timestamp = product.updatedAt || product.submittedAt;
    const submittedAt = timestamp ? new Date(timestamp) : null;
    return {
      url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
      lastModified: submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });
  const categoryEntries = PRODUCT_CATEGORIES.flatMap((category) => {
    const categoryProducts = products.filter((product) => product.category === category.value);
    if (categoryProducts.length < 4) return [];
    const latestTimestamp = categoryProducts
      .map((product) => product.updatedAt || product.submittedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const latestDate = latestTimestamp ? new Date(latestTimestamp) : null;
    return [{
      url: absoluteUrl(`/categories/${category.value}`),
      lastModified: latestDate && !Number.isNaN(latestDate.getTime()) ? latestDate : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }];
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

  return [...entries, ...discoveryEntries, ...categoryEntries, ...productEntries, ...matchEntries];
}
