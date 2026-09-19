import { authenticateRequest, getAdminClient, HttpError, jsonError, readJsonRequest } from "@/lib/server/auth";
import { DB_PREFIX } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  try {
    const { user } = await authenticateRequest(request);
    const body = await readJsonRequest(request, 8_000) as Record<string, unknown>;
    if (!body || typeof body.productId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(body.productId)
      || !["spam", "unsafe", "duplicate", "impersonation", "other"].includes(String(body.reason))
      || typeof body.note !== "string" || body.note.length > 1000) throw new HttpError(400, "Invalid report.");
    const { error } = await getAdminClient().rpc(`${DB_PREFIX}report_product`, {
      p_product: body.productId, p_reporter: user.id, p_reason: body.reason, p_note: body.note.trim(),
    });
    if (error?.code === "P0001") throw new HttpError(429, "You can report up to 10 products per day.");
    if (error?.code === "23503") throw new HttpError(404, "Product not found.");
    if (error) throw new Error(`Report storage failed: ${error.code}`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
