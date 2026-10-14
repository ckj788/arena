import { NextResponse } from "next/server";
import { settleArenaIfDue } from "@/lib/server/arenaAdmin";
import { jsonError, requireCronSecret } from "@/lib/server/auth";
import { invalidateArenaState } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Fail closed: CRON_SECRET is mandatory, not optional.
    requireCronSecret(request);
    const result = await settleArenaIfDue({ allowScheduledStart: true });
    if (result.changed) invalidateArenaState();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
