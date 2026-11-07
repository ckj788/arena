import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { SUBMISSION_PLANS, getSubmissionPlan } from "@/lib/submissionPlans";
import { HttpError } from "./auth";
import { checkoutBaseUrl, paymentConfiguration, stripeMode, STRIPE_APPLICATION } from "./stripe";

type Link = { id: string; url: string };
type LinkConfiguration = { mode: string; baseUrl: string; links: Record<string, Link> };

function configuration(): LinkConfiguration {
  const value: LinkConfiguration = JSON.parse(process.env.STRIPE_PAYMENT_LINKS || "null");
  if (!paymentConfiguration() || !value || value.mode !== stripeMode()
    || value.baseUrl !== checkoutBaseUrl() || (process.env.STRIPE_PAYMENT_LINK_SIGNING_SECRET?.length ?? 0) < 32) {
    throw new Error("Payment links are not configured for this environment.");
  }
  for (const plan of SUBMISSION_PLANS.filter(plan => plan.id !== "free")) {
    const link = value.links?.[plan.id];
    const url = new URL(link?.url);
    if (!/^plink_[a-zA-Z0-9]+$/.test(link?.id) || url.origin !== "https://buy.stripe.com" || url.search || url.hash) throw new Error("Invalid payment link configuration.");
  }
  return value;
}

export function paymentLinksConfigured() {
  try { configuration(); return true; } catch { return false; }
}

function signature(payload: string) {
  return createHmac("sha256", process.env.STRIPE_PAYMENT_LINK_SIGNING_SECRET!).update(payload).digest("base64url");
}

// This reference only attributes a payment; it grants no access to an order.
// Dashboard and details APIs still require the authenticated order owner.
export function paymentLinksForUser(userId: string) {
  const config = configuration();
  return Object.fromEntries(SUBMISSION_PLANS.filter(plan => plan.id !== "free").map(plan => {
    const payload = `v1_${config.mode}_${plan.id}_${userId}`;
    const url = new URL(config.links[plan.id].url);
    url.searchParams.set("client_reference_id", `${payload}_${signature(payload)}`);
    return [plan.id, url.href];
  }));
}

export function paymentLinkOrderId(sessionId: string) {
  const digest = createHash("sha256").update(`indieclash:payment-link:${sessionId}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && /^cs_(test|live)_[a-zA-Z0-9]{1,240}$/.test(value);
}

export function validatePaidPaymentLink(session: Stripe.Checkout.Session, event: Pick<Stripe.Event, "livemode">) {
  const config = configuration();
  const match = /^v1_(test|live)_(starter|growth|pro)_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/i.exec(session.client_reference_id || "");
  if (!match) throw new HttpError(400, "Missing payment account reference.");
  const [, mode, planId, userId, signed] = match;
  const payload = `v1_${mode}_${planId}_${userId}`;
  const plan = getSubmissionPlan(planId);
  const linkId = typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id;
  if (!timingSafeEqual(Buffer.from(signed), Buffer.from(signature(payload)))
    || mode !== config.mode || session.livemode !== (mode === "live") || event.livemode !== session.livemode
    || linkId !== config.links[planId]?.id || session.metadata?.application !== STRIPE_APPLICATION
    || session.metadata?.plan !== planId || session.mode !== "payment" || session.status !== "complete"
    || session.payment_status !== "paid" || session.currency !== "usd" || !plan || session.amount_total !== plan.price * 100) {
    throw new HttpError(400, "Payment link details do not match the purchased plan.");
  }
  const orderId = paymentLinkOrderId(session.id);
  return { userId, orderId, plan: planId, requestId: orderId,
    inputHash: createHash("sha256").update(`${session.id}:${userId}:${planId}:${session.amount_total}`).digest("hex") };
}
