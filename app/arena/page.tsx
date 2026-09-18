import type { Metadata } from "next";
import ArenaClient from "../ArenaClient";
import { getArenaPageData } from "@/lib/server/arenaPageData";
import { absoluteUrl, serializeJsonLd } from "@/lib/site";

export const revalidate = 60;
const title = "Arena — Indie Product Battles";
const description = "Explore live indie product matchups, compare what makers have built, and leave honest feedback before you vote. Arena participation is optional and free.";

export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "/arena" },
  openGraph: { title, description, url: "/arena", type: "website", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default async function ArenaPage() {
  const { products, pastChampions, bracket } = await getArenaPageData();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: title, description, url: absoluteUrl("/arena"),
      isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    }) }} />
    <ArenaClient page="arena" initialProducts={products} initialPastChampions={pastChampions || []} initialBracket={bracket} />
  </>;
}
