import type { Metadata } from "next";
import ArenaClient from "./ArenaClient";
import { getArenaPageData } from "@/lib/server/arenaPageData";
import { absoluteUrl, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/site";

export const revalidate = 60;

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
  } = await getArenaPageData();
  const latestProducts = initialProducts
    .slice()
    .sort((a, b) => new Date(b.publishedAt || b.submittedAt).getTime() - new Date(a.publishedAt || a.submittedAt).getTime())
    .slice(0, 50);

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
          itemListElement: latestProducts.map((product, index) => ({
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
