import { HttpError, jsonError } from "@/lib/server/auth";
import { applyCheckoutEvent } from "@/lib/server/launchPayments";
import { getStripe } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new HttpError(503, "Stripe webhook verification is not configured.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Missing Stripe signature.");
    if (Number(request.headers.get("content-length") || 0) > 1_000_000) throw new HttpError(413, "Webhook body is too large.");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "Missing webhook body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) {
          await reader.cancel();
          throw new HttpError(413, "Webhook body is too large.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks);
    const stripe = getStripe();
    let event;
    try { event = stripe.webhooks.constructEvent(body, signature, secret); }
    catch { throw new HttpError(400, "Invalid Stripe signature."); }
    return Response.json(await applyCheckoutEvent(event));
  } catch (error) { return jsonError(error); }
}
