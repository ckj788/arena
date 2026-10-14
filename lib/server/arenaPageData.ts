import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";
import { getPublicProducts } from "@/lib/server/publicSeoData";
import { ARENA_SECONDS, ARENA_TAG, CATALOGUE_SECONDS, CATALOGUE_TAG, CHAMPIONS_TAG } from "./cachePolicy";

// Separate live matches from winners and the catalogue. Voting must not turn
// Discover and Champions into live ISR pages through a shared snapshot tag.
export const getArenaBracket = cache(unstable_cache(async () => {
  return fetchCloudBracket(await getPublicProducts());
}, ["arena-bracket-v1"], { revalidate: ARENA_SECONDS, tags: [ARENA_TAG, CATALOGUE_TAG] }));

export const getPastChampions = cache(unstable_cache(async () => {
  return fetchCloudPastChampions(await getPublicProducts());
}, ["arena-champions-v1"], { revalidate: CATALOGUE_SECONDS, tags: [CHAMPIONS_TAG, CATALOGUE_TAG] }));

export async function getArenaPageData() {
  const products = await getPublicProducts().catch(() => []);
  const [pastChampions, bracket] = await Promise.all([
    getPastChampions().catch(() => []),
    getArenaBracket().catch(() => null),
  ]);
  return { products, pastChampions, bracket };
}
