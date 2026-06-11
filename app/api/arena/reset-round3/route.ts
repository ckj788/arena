import { NextResponse } from "next/server";
import { fetchCloudBracket, saveCloudBracket } from "@/lib/arenaStore";
import { supabase, DB_PREFIX } from "@/lib/supabaseClient";
import { Match } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Fetch active bracket from Supabase
    const bracket = await fetchCloudBracket();
    if (!bracket) {
      return NextResponse.json({ error: "No active bracket found." }, { status: 404 });
    }

    console.log(`[RESET] Active bracket ID: ${bracket.id}, status: ${bracket.status}`);

    // 2. Get the winners from Round 2 matches (Quarterfinals)
    if (!bracket.round2 || bracket.round2.length < 4) {
      return NextResponse.json({ error: "Round 2 matches are incomplete in database." }, { status: 400 });
    }

    const r2Winners = bracket.round2.map(m => {
      if (!m.winnerId) return null;
      return m.winnerId === m.productA.id ? m.productA : m.productB;
    });

    if (r2Winners.some(w => !w)) {
      return NextResponse.json({ error: "Some Round 2 matches do not have a winner saved in the database." }, { status: 400 });
    }

    // 3. Clear existing Round 3 & Round 4 matches in Supabase first to prevent conflicts
    if (supabase) {
      const { error: delErr } = await supabase
        .from(`${DB_PREFIX}matches`)
        .delete()
        .in(`${DB_PREFIX}id`, ["r3_m1", "r3_m2", "r4_m1"]);
      
      if (delErr) {
        console.error("[RESET] Error deleting matches:", delErr);
        return NextResponse.json({ error: "Failed to delete stale matches: " + delErr.message }, { status: 500 });
      }
    }

    // 4. Recreate Round 3 matches
    const round3: Match[] = [
      {
        id: "r3_m1",
        roundNumber: 3,
        productA: r2Winners[0]!,
        productB: r2Winners[1]!,
        votesA: 0,
        votesB: 0,
        votedUserIds: []
      },
      {
        id: "r3_m2",
        roundNumber: 3,
        productA: r2Winners[2]!,
        productB: r2Winners[3]!,
        votesA: 0,
        votesB: 0,
        votedUserIds: []
      }
    ];

    // 5. Build updated bracket
    const restoredBracket = {
      ...bracket,
      status: "active" as const,
      roundStartedAt: new Date().toISOString(),
      round3,
      round4: [],
      winner: undefined
    };

    // 6. Save back to database
    await saveCloudBracket(restoredBracket);

    return NextResponse.json({
      success: true,
      message: "Successfully reverted tournament state back to a fresh Round 3 (Semifinals).",
      roundStartedAt: restoredBracket.roundStartedAt,
      round3Matches: round3.map(m => `${m.productA.title} vs ${m.productB.title}`)
    });
  } catch (error: any) {
    console.error("[RESET ERROR]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
