import type { Metadata } from "next";
import ArenaClient from "./ArenaClient";
import { fetchCloudProducts, fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";
import { absoluteUrl, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/site";

// Force dynamic rendering to ensure that Vercel server queries the database
// on every HTTP request, always returning the freshest data.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Discover New Indie Products | Indie Clash" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default async function Page() {
  // Fetch products, then use them in memory to get champions and bracket in parallel
  const initialProducts = await fetchCloudProducts();
  const [initialPastChampions, initialBracket] = await Promise.all([
    fetchCloudPastChampions(initialProducts),
    fetchCloudBracket(initialProducts)
  ]);

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
