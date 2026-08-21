import { NextResponse } from "next/server";
import { resetArenaToRoundThree } from "@/lib/server/arenaAdmin";
import { assertJsonRequest, jsonError, requireAdmin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 1_024);
    await requireAdmin(request);
    const round3Matches = await resetArenaToRoundThree();
    return NextResponse.json({
      success: true,
      message: "Tournament restored to a fresh semifinal round.",
      round3Matches,
    });
  } catch (error) {
    return jsonError(error);
  }
}
