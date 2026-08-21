import { NextResponse } from "next/server";
import { enqueueOwnedProduct } from "@/lib/server/arenaAdmin";
import { assertJsonRequest, authenticateRequest, HttpError, jsonError } from "@/lib/server/auth";

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
    const { user } = await authenticateRequest(request);
    const bracketStarted = await enqueueOwnedProduct(user, id);
    return NextResponse.json({ bracketStarted });
  } catch (error) {
    return jsonError(error);
  }
}
