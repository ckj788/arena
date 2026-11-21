import { getArenaBracket, getPastChampions } from "@/lib/server/arenaPageData";

export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  if (view !== "bracket" && view !== "champions" && view !== "arena") return new Response(null, { status: 400 });
  try {
    const [bracket, champions] = await Promise.all([
      view !== "champions" ? getArenaBracket() : undefined,
      view !== "bracket" ? getPastChampions() : undefined,
    ]);
    return Response.json({ bracket, champions }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
