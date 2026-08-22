import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import ArenaClient from "./ArenaClient";
import { fetchCloudProducts, fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";
import { absoluteUrl, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/site";

export const revalidate = 60;

const getHomepageData = unstable_cache(async () => {
  const products = await fetchCloudProducts();
  const [pastChampions, bracket] = await Promise.all([
    fetchCloudPastChampions(products),
    fetchCloudBracket(products),
  ]);
  return { products, pastChampions, bracket };
// Keep the cache key versioned. The v2 entry may contain the temporary empty
// fallback produced before the production-safe Supabase views were installed,
// and Next's data cache persists across deployments.
}, ["arena-home-v3"], { revalidate: 60, tags: ["arena-public"] });

export const metadata: Metadata = {
  title: { absolute: "Discover New Indie Products | Indie Clash" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default async function Page() {
  const {
    products: initialProducts,
    pastChampions: initialPastChampions,
    bracket: initialBracket,
  } = await getHomepageData();

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${absoluteUrl("/")}#organization`,
        name: "Indie Clash",
        url: absoluteUrl("/"),
        logo: absoluteUrl("/og-image.png"),
      },
      {
        "@type": "WebSite",
        "@id": `${absoluteUrl("/")}#website`,
        name: "Indie Clash",
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${absoluteUrl("/")}#organization` },
      },
      {
        "@type": "CollectionPage",
        "@id": absoluteUrl("/"),
        name: "Discover New Indie Products",
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${absoluteUrl("/")}#website` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: initialProducts.slice(0, 30).map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
            name: product.title,
          })),
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeJsonLd) }}
      />
      <ArenaClient
        initialProducts={initialProducts}
        initialPastChampions={initialPastChampions || []}
        initialBracket={initialBracket}
      />
    </>
  );
}
