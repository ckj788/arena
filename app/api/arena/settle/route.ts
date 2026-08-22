import { NextResponse } from "next/server";
import { settleArenaIfDue } from "@/lib/server/arenaAdmin";
import { assertJsonRequest, authenticateRequest, consumeUserRateLimit, jsonError } from "@/lib/server/auth";
import { invalidateArenaPublic } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

// A mutation must never be exposed as GET. Any authenticated user may request
// a due-time check, but the server refuses to advance a round before its deadline.
export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 1_024);
    const { client } = await authenticateRequest(request);
    await consumeUserRateLimit(client, "settle");
    const result = await settleArenaIfDue();
    if (result.changed) invalidateArenaPublic();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
