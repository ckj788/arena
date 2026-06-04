import ArenaClient from "./ArenaClient";
import { fetchCloudProducts, fetchCloudPastChampions, fetchCloudBracket } from "@/lib/arenaStore";

// Force dynamic rendering to ensure that Vercel server queries the database
// on every HTTP request, always returning the freshest data.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Fetch products, past champions, and the active bracket from Supabase in parallel on the server
  const [initialProducts, initialPastChampions, initialBracket] = await Promise.all([
    fetchCloudProducts(),
    fetchCloudPastChampions(),
    fetchCloudBracket()
  ]);

  return (
    <ArenaClient
      initialProducts={initialProducts}
      initialPastChampions={initialPastChampions || []}
      initialBracket={initialBracket}
    />
  );
}
