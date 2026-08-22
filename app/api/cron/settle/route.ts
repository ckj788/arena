import { NextResponse } from "next/server";
import { settleArenaIfDue } from "@/lib/server/arenaAdmin";
import { jsonError, requireCronSecret } from "@/lib/server/auth";
import { invalidateArenaPublic } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Fail closed: CRON_SECRET is mandatory, not optional.
    requireCronSecret(request);
    const result = await settleArenaIfDue();
    if (result.changed) invalidateArenaPublic();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
