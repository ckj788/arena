import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { getAdminClient, HttpError, jsonError, readJsonRequest } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const SAFE_PRODUCT_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
const BOT_USER_AGENT = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse/i;

export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get("user-agent") || "";
    if (!userAgent || BOT_USER_AGENT.test(userAgent)) {
      return NextResponse.json({ recorded: 0 });
    }

    const body = await readJsonRequest(request) as { productIds?: unknown };
    if (!Array.isArray(body.productIds) || body.productIds.length < 1 || body.productIds.length > 6) {
      throw new HttpError(400, "One to six product IDs are required.");
    }
    const productIds = [...new Set(body.productIds)].filter(
      (value): value is string => typeof value === "string" && SAFE_PRODUCT_ID.test(value),
    );
    if (productIds.length === 0) throw new HttpError(400, "No valid product IDs were provided.");

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const dailySalt = new Date().toISOString().slice(0, 10);
    const secret = process.env.CRON_SECRET || process.env.ADMIN_API_SECRET;
    if (!secret) throw new HttpError(503, "Exposure tracking is not configured.");
    const visitorHash = createHash("sha256")
      .update(`${secret}:${dailySalt}:${forwardedFor}:${userAgent}`)
      .digest("hex");

    const client = getAdminClient();
    const { data, error } = await client.rpc(`${DB_PREFIX}record_product_exposures`, {
      p_product_ids: productIds,
      p_visitor_hash: visitorHash,
    });
    if (error) {
      // Safe rollout order: the UI may be deployed moments before an operator
      // applies the additive migration. Discovery stays usable in that window.
      if (error.code === "PGRST202" || error.code === "42883") {
        return NextResponse.json({ recorded: 0, configured: false });
      }
      console.error("[EXPOSURE] Unable to record qualified exposure:", error.message);
      throw new HttpError(500, "Unable to record exposure.");
    }

    return NextResponse.json({ recorded: typeof data === "number" ? data : 0 });
  } catch (error) {
    return jsonError(error);
  }
}
