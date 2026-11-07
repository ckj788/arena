import { authenticatePaymentRequest, jsonError, readJsonRequest } from "@/lib/server/auth";
import { reconcilePaymentLink } from "@/lib/server/launchPayments";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await authenticatePaymentRequest(request);
    const body = await readJsonRequest(request, 1_024) as { sessionId?: unknown } | null;
    const order = await reconcilePaymentLink(user.id, (await context.params).id, body?.sessionId);
    return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
