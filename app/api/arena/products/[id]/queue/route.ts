import { NextResponse } from "next/server";
import { enqueueOwnedProduct } from "@/lib/server/arenaAdmin";
import { assertJsonRequest, authenticateRequest, consumeUserRateLimit, HttpError, jsonError } from "@/lib/server/auth";
import { invalidateArenaPublic } from "@/lib/server/cache";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertJsonRequest(request, 1_024);
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/i.test(id)) {
      throw new HttpError(400, "Invalid product ID.");
    }
    const { user, client } = await authenticateRequest(request);
    await consumeUserRateLimit(client, "queue");
    const bracketStarted = await enqueueOwnedProduct(user, id);
    invalidateArenaPublic([`/products/${encodeURIComponent(id)}`]);
    return NextResponse.json({ bracketStarted });
  } catch (error) {
    return jsonError(error);
  }
}
