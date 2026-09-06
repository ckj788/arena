import { NextResponse } from "next/server";
import { updateOwnedProduct } from "@/lib/server/arenaAdmin";
import { authenticateRequest, consumeUserRateLimit, HttpError, jsonError, readJsonRequest } from "@/lib/server/auth";
import { invalidateArenaPublic } from "@/lib/server/cache";
import { parseProductInput } from "@/lib/server/productInput";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id)) throw new HttpError(400, "Invalid product ID.");
    const { user, client } = await authenticateRequest(request);
    await consumeUserRateLimit(client, "product_update");
    const product = await updateOwnedProduct(user, id, parseProductInput(await readJsonRequest(request)));
    invalidateArenaPublic([`/products/${encodeURIComponent(id)}`]);
    return NextResponse.json({ product });
  } catch (error) {
    return jsonError(error);
  }
}
