import { NextResponse } from "next/server";
import { createProductForUser } from "@/lib/server/arenaAdmin";
import { authenticateRequest, consumeUserRateLimit, jsonError, readJsonRequest } from "@/lib/server/auth";
import { invalidateProductCatalogue } from "@/lib/server/cache";
import { parseProductInput } from "@/lib/server/productInput";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user, client } = await authenticateRequest(request);
    await consumeUserRateLimit(client, "product_submit");
    const product = await createProductForUser(user, parseProductInput(await readJsonRequest(request)));
    invalidateProductCatalogue(product.id);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
