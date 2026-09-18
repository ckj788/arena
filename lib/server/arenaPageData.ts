import "server-only";
import { unstable_cache } from "next/cache";
import { fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";
import { getPublicProducts } from "@/lib/server/publicSeoData";

// Share the same public snapshot across Discover, Arena and Champions.
// Keep the existing versioned cache key and invalidation tag.
export const getArenaPageData = unstable_cache(async () => {
  const products = await getPublicProducts();
  const [pastChampions, bracket] = await Promise.all([
    fetchCloudPastChampions(products),
    fetchCloudBracket(products),
  ]);
  return { products, pastChampions, bracket };
}, ["arena-home-v5"], { revalidate: 60, tags: ["arena-public"] });
