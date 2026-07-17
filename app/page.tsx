import ArenaClient from "./ArenaClient";
import { fetchCloudProducts, fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";

// Force dynamic rendering to ensure that Vercel server queries the database
// on every HTTP request, always returning the freshest data.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Fetch products, then use them in memory to get champions and bracket in parallel
  const initialProducts = await fetchCloudProducts();
  const [initialPastChampions, initialBracket] = await Promise.all([
    fetchCloudPastChampions(initialProducts),
    fetchCloudBracket(initialProducts)
  ]);

  return (
    <ArenaClient
      initialProducts={initialProducts}
      initialPastChampions={initialPastChampions || []}
      initialBracket={initialBracket}
    />
  );
}
