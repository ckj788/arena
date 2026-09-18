import type { Metadata } from "next";
import ArenaClient from "../ArenaClient";
import { getArenaPageData } from "@/lib/server/arenaPageData";
import { absoluteUrl, serializeJsonLd } from "@/lib/site";

export const revalidate = 60;
const title = "Champions — Indie Clash Hall of Valor";
const description = "Discover past Indie Clash Arena winners, explore their products, and learn how free launches, fair discovery, and peer-feedback battles work.";

export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "/champions" },
  openGraph: { title, description, url: "/champions", type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default async function ChampionsPage() {
  const { products, pastChampions, bracket } = await getArenaPageData();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: title, description, url: absoluteUrl("/champions"),
      isPartOf: { "@id": `${absoluteUrl("/")}#website` },
      mainEntity: { "@type": "ItemList", itemListElement: (pastChampions || []).map((product, index) => ({
        "@type": "ListItem", position: index + 1, name: product.title,
        url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
      })) },
    }) }} />
    <ArenaClient page="champions" initialProducts={products} initialPastChampions={pastChampions || []} initialBracket={bracket} />
  </>;
}
