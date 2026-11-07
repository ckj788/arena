import { authenticatePaymentRequest, jsonError } from "@/lib/server/auth";
import { getLaunchOrder } from "@/lib/server/launchPayments";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await authenticatePaymentRequest(request);
    const order = await getLaunchOrder(user.id, (await context.params).id);
    return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
