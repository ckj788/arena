import { authenticatePaymentRequest, jsonError } from "@/lib/server/auth";
import { paymentLinksConfigured, paymentLinksForUser } from "@/lib/server/paymentLinks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!paymentLinksConfigured()) return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
    const { user } = await authenticatePaymentRequest(request);
    return Response.json({ configured: true, userId: user.id, links: paymentLinksForUser(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
