import { getAdminClient, HttpError, jsonError, readJsonRequest, requireAdmin } from "@/lib/server/auth";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { fromDbProduct } from "@/lib/arenaStore";
import { revalidatePath, revalidateTag } from "next/cache";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    if (params.get("access") === "1") return Response.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
    const page = Math.floor(Math.max(0, Math.min(100_000, Number(params.get("page")) || 0)));
    const status = params.get("status") || "unreviewed";
    if (!["unreviewed", "approved", "restricted", "reported"].includes(status)) throw new HttpError(400, "Invalid status.");
    const client = getAdminClient();
    let reports: Array<Record<string, unknown>> = [];
    let query = client.from(`${DB_PREFIX}products`).select("*").order(`${DB_PREFIX}submitted_at`, { ascending: true });
    if (status === "reported") {
      const result = await client.from(`${DB_PREFIX}product_reports`).select("id,product_id,reason,note,created_at")
        .eq("status", "open").order("created_at").range(page * 50, page * 50 + 49);
      if (result.error) throw new Error("Unable to load reports.");
      reports = result.data || [];
      if (!reports.length) return Response.json({ products: [], reports: [], hasMore: false }, { headers: { "Cache-Control": "no-store" } });
      query = query.in(`${DB_PREFIX}id`, [...new Set(reports.map(row => String(row.product_id)))]);
    } else query = query.eq(`${DB_PREFIX}moderation_status`, status).range(page * 50, page * 50 + 49);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load moderation queue. Check the database migration.");
    return Response.json({ products: (data || []).map(fromDbProduct), reports, hasMore: status === "reported" ? reports.length === 50 : data?.length === 50 },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request);
    const body = await readJsonRequest(request, 8_000) as Record<string, unknown>;
    if (!body || typeof body.productId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(body.productId)
      || !["approved", "restricted", "unreviewed", "dismiss"].includes(String(body.action))
      || typeof body.note !== "string" || !body.note.trim() || body.note.length > 1000) throw new HttpError(400, "Choose a decision and add a short reason.");
    const { error } = await getAdminClient().rpc(`${DB_PREFIX}moderate_product`, {
      p_product: body.productId, p_actor: actor?.id || null, p_action: body.action, p_note: body.note.trim(),
    });
    if (error?.code === "P0002") throw new HttpError(404, "Product not found.");
    if (error) throw new Error(`Moderation failed: ${error.code}`);
    // Safety decisions must expire, not serve a stale-while-revalidate copy.
    revalidateTag("arena-public", { expire: 0 });
    revalidatePath("/", "layout");
    revalidatePath("/sitemap.xml");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
