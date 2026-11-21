import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";
import { catalogueProducts } from "@/lib/cataloguePages";
import { getCataloguePages, initialCataloguePages } from "./cataloguePages";
import { isVisibleProduct } from "@/lib/productSafety";
import { ARENA_SECONDS, ARENA_TAG, CATALOGUE_SECONDS, CATALOGUE_TAG, CHAMPIONS_TAG } from "./cachePolicy";

// Separate live matches from winners and the catalogue. Voting must not turn
// Discover and Champions into live ISR pages through a shared snapshot tag.
export const getArenaBracket = cache(unstable_cache(async () => {
  return fetchCloudBracket(catalogueProducts(await getCataloguePages()));
}, ["arena-bracket-cards-v2"], { revalidate: ARENA_SECONDS, tags: [ARENA_TAG, CATALOGUE_TAG] }));

export const getPastChampions = cache(unstable_cache(async () => {
  return fetchCloudPastChampions(catalogueProducts(await getCataloguePages()).filter(isVisibleProduct));
}, ["arena-champions-cards-v2"], { revalidate: CATALOGUE_SECONDS, tags: [CHAMPIONS_TAG, CATALOGUE_TAG] }));

export async function getArenaPageData() {
  const [pages, pastChampions, bracket] = await Promise.all([
    initialCataloguePages(),
    getPastChampions().catch(() => []),
    getArenaBracket().catch(() => null),
  ]);
  return { pages, pastChampions, bracket };
}
