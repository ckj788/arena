import { NextResponse } from "next/server";
import { getOwnedProducts } from "@/lib/server/arenaAdmin";
import { authenticateRequest, jsonError } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, client } = await authenticateRequest(request);
    const products = await getOwnedProducts(user, client);
    return NextResponse.json(
      { productIds: products.map((product) => product.id), products },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
