import { NextResponse } from "next/server";
import { fetchCloudBracket, saveCloudBracket, advanceTournamentRound, getActiveRound } from "@/lib/arenaStore";
import { getRoundRemainingMs, getMillisecondsToNextNYMidnight } from "@/lib/timeHelpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret (if configured)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Fetch the active bracket from Supabase
    const bracket = await fetchCloudBracket();
    if (!bracket) {
      return NextResponse.json({ message: "No active bracket found." });
    }

    if (bracket.status === "preparing") {
      const ms = getMillisecondsToNextNYMidnight(bracket.roundStartedAt);
      if (ms <= 0) {
        console.log("[CRON] Preparing bracket timer expired. Starting season...");
        const activeBracket = {
          ...bracket,
          status: "active" as const,
          roundStartedAt: new Date().toISOString()
        };
        await saveCloudBracket(activeBracket);
        return NextResponse.json({
          message: "Tournament started successfully.",
          status: activeBracket.status,
          roundStartedAt: activeBracket.roundStartedAt
        });
      }
      return NextResponse.json({ 
        message: "Bracket is preparing. Countdown to midnight active.",
        remainingMs: ms,
        closesInHours: (ms / (1000 * 60 * 60)).toFixed(2)
      });
    }

    if (bracket.status === "active") {
      const roundNum = getActiveRound(bracket);
      const ms = getRoundRemainingMs(roundNum, bracket.roundStartedAt || new Date().toISOString());

      console.log(`[CRON] Active round: ${roundNum}, remaining ms: ${ms}`);

      // 3. If the round has expired, advance it!
      if (ms <= 0) {
        console.log("[CRON] Round expired. Advancing round...");
        const advanced = advanceTournamentRound(bracket);
        await saveCloudBracket(advanced);
        return NextResponse.json({ 
          message: "Round advanced successfully.",
          oldRound: roundNum,
          newRound: getActiveRound(advanced),
          status: advanced.status
        });
      }

      return NextResponse.json({ 
        message: "Round is still active.",
        remainingMs: ms,
        closesInHours: (ms / (1000 * 60 * 60)).toFixed(2)
      });
    }

    return NextResponse.json({ message: `Bracket status is ${bracket.status}` });
  } catch (error: any) {
    console.error("[CRON ERROR]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
