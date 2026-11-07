import { authenticatePaymentRequest, jsonError } from "@/lib/server/auth";
import { listLaunchOrders } from "@/lib/server/launchPayments";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { user } = await authenticatePaymentRequest(request);
    return Response.json({ orders: await listLaunchOrders(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
