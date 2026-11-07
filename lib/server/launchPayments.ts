import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { getSubmissionPlan } from "@/lib/submissionPlans";
import { getAdminClient, HttpError } from "./auth";
import { parseProductInput } from "./productInput";
import { checkoutBaseUrl, getStripe, stripeMode, STRIPE_APPLICATION } from "./stripe";
import { isCheckoutSessionId, validatePaidPaymentLink } from "./paymentLinks";

const ordersTable = `${DB_PREFIX}launch_orders`;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function orderLiveMode() {
  const mode = stripeMode();
  if (mode !== "live" && mode !== "test") throw new HttpError(503, "Order mode is not configured.");
  return mode === "live";
}

function checkoutOrderId(userId: string, requestId: string) {
  const digest = createHash("sha256").update(`${userId}:${requestId}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function paidCheckoutReference(session: Stripe.Checkout.Session) {
  const { application, user_id: userId, order_id: orderId, request_id: requestId, input_hash: inputHash, plan: planId } = session.metadata ?? {};
  const plan = getSubmissionPlan(planId);
  const expectedHash = createHash("sha256").update(JSON.stringify({ flow: "pay-first", plan: planId, amount: session.amount_total })).digest("hex");
  if (application !== STRIPE_APPLICATION || !userId || !UUID_PATTERN.test(userId)
    || !requestId || !UUID_PATTERN.test(requestId) || requestId[14] !== "7"
    || orderId !== checkoutOrderId(userId, requestId) || session.client_reference_id !== orderId
    || !plan || plan.id === "free" || session.amount_total !== plan.price * 100
    || inputHash !== expectedHash || session.currency !== "usd" || session.mode !== "payment"
    || session.status !== "complete" || session.payment_status !== "paid" || session.livemode !== orderLiveMode()) {
    throw new HttpError(400, "Payment details do not match the purchased plan.");
  }
  return { userId, orderId, requestId, inputHash, plan: plan.id };
}

export function parseCheckoutInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid checkout details.");
  const value = body as Record<string, unknown>;
  const plan = getSubmissionPlan(value.plan);
  if (!plan || plan.id === "free") throw new HttpError(400, "Choose a paid directory submission plan.");
  if (typeof value.requestId !== "string" || !UUID_PATTERN.test(value.requestId)) throw new HttpError(400, "A valid checkout request ID is required.");
  const amount = plan.price * 100;
  const hash = createHash("sha256").update(JSON.stringify({ flow: "pay-first", plan: plan.id, amount })).digest("hex");
  const requestId = value.requestId.toLowerCase();
  const payBeforeOrder = requestId[14] === "7";
  if (payBeforeOrder) {
    const age = Date.now() - Number.parseInt(requestId.slice(0, 13).replace("-", ""), 16);
    if (age < -300_000) throw new HttpError(400, "Your device clock is ahead. Check it and retry.");
    if (age >= 23 * 3600_000) throw new HttpError(410, "This checkout attempt has ended. Check your Dashboard before starting another payment.");
  }
  return { requestId, plan, amount, hash, payBeforeOrder, resume: value.resume === true };
}

export function parseLaunchDetails(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid product details.");
  const value = body as Record<string, unknown>;
  const service = value.serviceDetails as Record<string, unknown> | undefined;
  if (!service || service.consent !== true) throw new HttpError(400, "Please authorize this product submission and the use of its details for fulfillment.");
  if (typeof service.email !== "string" || service.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(service.email.trim())) throw new HttpError(400, "Enter a valid report email.");
  if (typeof service.history !== "string" || !["none", "provided", "unsure"].includes(service.history)) throw new HttpError(400, "Tell us about your previous directory submissions.");
  if (typeof service.directories !== "string" || service.directories.length > 8000) throw new HttpError(400, "Previous directory details must be 8,000 characters or fewer.");
  if (service.history === "provided" && !service.directories.trim()) throw new HttpError(400, "Include your previous directory submissions.");
  const product = parseProductInput(value.product);
  const serviceDetails = {
    email: service.email.trim(), history: service.history,
    directories: service.history === "provided" ? service.directories.trim() : "", consent: true,
  };
  return { product, serviceDetails };
}

function databaseFailure(operation: string, error: { code?: string; message: string } | null): never {
  console.error("[LAUNCH PAYMENTS] Database request failed", { operation, code: error?.code, message: error?.message });
  throw new HttpError(503, "Orders are temporarily unavailable. Please retry; if you may already have paid, check your order before making another payment.");
}

export async function consumeLaunchRateLimit(client: SupabaseClient, action: "checkout" | "launch_details") {
  const { error } = await client.rpc(`${DB_PREFIX}consume_launch_rate_limit`, { p_action: action });
  if (!error) return;
  if (error.code === "P0001" && error.message === "launch rate limit exceeded") {
    throw new HttpError(429, "Too many payment requests. Please wait until the next hour and retry the same order. Your product submission allowance is unaffected.");
  }
  databaseFailure("check payment request limit", error);
}

export async function createLaunchCheckout(user: Pick<User, "id" | "email">, input: ReturnType<typeof parseCheckoutInput>) {
  const stripe = getStripe();
  const base = checkoutBaseUrl();
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) throw new HttpError(503, "Payment verification is not configured. Checkout is unavailable.");
  if (input.payBeforeOrder) {
    // Stable across retries, unique to the authenticated owner and attempt.
    const orderId = checkoutOrderId(user.id, input.requestId);
    const created = await openStripeCheckout(stripe, user, input, orderId, base);
    const session = input.resume ? await stripe.checkout.sessions.retrieve(created.id) : created;
    if (session.status === "complete") return { orderId, url: `${base}/submit/result?order=${orderId}&session_id=${session.id}` };
    if (session.status === "expired") throw new HttpError(410, "This Stripe checkout has expired. Check your Dashboard before starting another payment.");
    if (!session.url) throw new HttpError(502, "Stripe did not return a checkout URL. Retry with the same details.");
    return { orderId, url: session.url };
  }
  const client = getAdminClient();
  const livemode = orderLiveMode();
  const columns = "id,input_hash,status,stripe_session_id,amount_total,currency,livemode,created_at";
  // Existing browser attempts can resume their previously persisted orders.
  const { data: order, error } = await client.from(ordersTable).select(columns)
    .eq("user_id", user.id).eq("request_id", input.requestId).maybeSingle();
  if (error) databaseFailure("read checkout order", error);
  if (!order) throw new HttpError(410, "This earlier checkout is no longer available. Start a new checkout.", "legacy_checkout_missing");
  if (order.input_hash !== input.hash || order.livemode !== livemode || order.amount_total !== input.amount || order.currency !== "usd") throw new HttpError(409, "Checkout details have changed. Return to your plan and start a new checkout.");
  const resultUrl = `${base}/submit/result?order=${order.id}`;
  if (order.status === "paid") return { orderId: order.id as string, url: resultUrl };
  if (["expired", "failed"].includes(order.status)) throw new HttpError(410, `This checkout has ended. Order reference: ${order.id}. Check for any charge before starting again.`);
  if (order.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (session.status === "complete") return { orderId: order.id as string, url: resultUrl };
    if (session.status === "expired") throw new HttpError(410, `This checkout has expired. Order reference: ${order.id}. You can start a new checkout after checking for any charge.`);
    if (session.status !== "open" || !session.url) throw new HttpError(409, "This checkout has expired. Return to your plan to start again.");
    return { orderId: order.id as string, url: session.url };
  }
  // Stripe retains idempotency keys for at least 24 hours. An unbound older
  // order needs reconciliation, not a new charge after that safety window.
  if (Date.now() - Date.parse(order.created_at) >= 23 * 60 * 60 * 1000) {
    throw new HttpError(409, "This checkout needs a payment status review. Contact support before starting another payment.");
  }
  const session = await openStripeCheckout(stripe, user, input, order.id, base);
  if (!session.url) throw new HttpError(502, "Stripe did not return a checkout URL. Retry with the same details.");
  const { error: bindError } = await client.from(ordersTable)
    .update({ stripe_session_id: session.id }).eq("id", order.id).eq("user_id", user.id).is("stripe_session_id", null);
  if (bindError) databaseFailure("attach checkout session", bindError);
  return { orderId: order.id as string, url: session.url };
}

function openStripeCheckout(stripe: Stripe, user: Pick<User, "id" | "email">, input: ReturnType<typeof parseCheckoutInput>, orderId: string, base: string) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    allowed_payment_method_types: ["card"],
    client_reference_id: orderId,
    ...(user.email ? { customer_email: user.email } : {}),
    line_items: [{ quantity: 1, price_data: {
      currency: "usd", unit_amount: input.amount,
      product_data: { name: `${input.plan.name} — ${input.plan.directories}+ directory submissions`, description: "One-time manual directory submission service. Not a subscription." },
    } }],
    metadata: { application: STRIPE_APPLICATION, order_id: orderId, user_id: user.id, plan: input.plan.id,
      ...(input.payBeforeOrder ? { request_id: input.requestId, input_hash: input.hash } : {}) },
    payment_intent_data: { metadata: { application: STRIPE_APPLICATION, order_id: orderId } },
    success_url: `${base}/submit/result?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/submit?plan=${input.plan.id}&checkout=cancelled`,
  }, { idempotencyKey: `launch-order:${orderId}` });
}

async function recordPaidCheckout(session: Stripe.Checkout.Session, reference: ReturnType<typeof validatePaidPaymentLink>, eventId: string, eventType: string) {
  const { error } = await getAdminClient().rpc(`${DB_PREFIX}record_launch_checkout_event`, {
    p_event_id: eventId, p_event_type: eventType, p_order_id: reference.orderId, p_user_id: reference.userId,
    p_session_id: session.id, p_plan: reference.plan, p_amount: session.amount_total,
    p_currency: session.currency, p_livemode: session.livemode, p_status: "paid",
    p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    p_request_id: reference.requestId, p_input_hash: reference.inputHash,
  });
  if (error) databaseFailure("record paid payment link", error);
}

export async function reconcilePaymentLink(userId: string, orderId: string, sessionId: unknown) {
  if (!isCheckoutSessionId(sessionId) || !UUID_PATTERN.test(orderId)) {
    throw new HttpError(400, "Invalid checkout reference.");
  }
  if (sessionId.startsWith("cs_live_") !== orderLiveMode()) throw new HttpError(404, "Order not found.");
  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] });
  } catch (failure) {
    if (failure instanceof Error && "code" in failure && failure.code === "resource_missing") {
      throw new HttpError(404, "Stripe could not find this checkout.");
    }
    throw new HttpError(503, "Stripe confirmation is temporarily unavailable. Refresh this order before trying another payment.");
  }
  if (session.status === "expired") throw new HttpError(410, "This checkout has expired.");
  if (session.status !== "complete" || session.payment_status !== "paid") {
    throw new HttpError(409, "Stripe has not confirmed payment yet.", "payment_pending");
  }
  const reference = session.payment_link
    ? validatePaidPaymentLink(session, { livemode: session.livemode })
    : paidCheckoutReference(session);
  if (reference.orderId !== orderId) throw new HttpError(400, "Invalid checkout reference.");
  if (reference.userId !== userId) throw new HttpError(403, "Sign in with the Indie Clash account that started this checkout.");
  const intent = session.payment_intent;
  const charge = intent && typeof intent !== "string" ? intent.latest_charge : null;
  if (!intent || typeof intent === "string" || intent.status !== "succeeded"
    || !charge || typeof charge === "string" || charge.amount_refunded > 0 || charge.disputed) {
    throw new HttpError(409, "This payment needs a review. Contact support with your Stripe receipt.");
  }
  // The SQL uses the same order ID as the webhook and honors deletion markers.
  await recordPaidCheckout(session, reference, `stripe-reconcile:${session.id}`, "checkout.session.completed");
  return getLaunchOrder(userId, orderId);
}

export async function applyCheckoutEvent(event: Stripe.Event) {
  const states: Record<string, string> = {
    "checkout.session.completed": "pending", "checkout.session.async_payment_succeeded": "paid",
    "checkout.session.async_payment_failed": "failed", "checkout.session.expired": "expired",
  };
  if (!Object.hasOwn(states, event.type)) return { ignored: true };
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.application !== STRIPE_APPLICATION) return { ignored: true };
  if (event.livemode !== orderLiveMode()) throw new HttpError(400, "Payment event mode does not match this environment.");
  if (session.payment_link) {
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) || session.payment_status !== "paid") return { ignored: true };
    await recordPaidCheckout(session, validatePaidPaymentLink(session, event), event.id, event.type);
    return { received: true };
  }
  const orderId = session.metadata.order_id;
  const userId = session.metadata.user_id;
  if (!orderId || !userId || !UUID_PATTERN.test(orderId) || !UUID_PATTERN.test(userId)
    || session.client_reference_id !== orderId || session.mode !== "payment"
    || !Number.isInteger(session.amount_total) || session.currency !== "usd"
    || session.livemode !== event.livemode) throw new HttpError(400, "Invalid payment event details.");
  if (states[event.type] === "paid" && session.payment_status !== "paid") throw new HttpError(400, "Payment is not paid.");
  const status = session.payment_status === "paid" ? "paid" : states[event.type];
  const { request_id: requestId, input_hash: inputHash, plan } = session.metadata;
  if (requestId) {
    const expectedHash = createHash("sha256").update(JSON.stringify({ flow: "pay-first", plan, amount: session.amount_total })).digest("hex");
    if (!UUID_PATTERN.test(requestId) || requestId[14] !== "7" || inputHash !== expectedHash) throw new HttpError(400, "Invalid checkout reference.");
    if (status !== "paid" || (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded")) return { ignored: true };
    await recordPaidCheckout(session, paidCheckoutReference(session), event.id, event.type);
    return { received: true };
  }
  const { error } = await getAdminClient().rpc(`${DB_PREFIX}record_launch_checkout_event`, {
    p_event_id: event.id, p_event_type: event.type, p_order_id: orderId, p_user_id: userId,
    p_session_id: session.id, p_plan: session.metadata.plan, p_amount: session.amount_total,
    p_currency: session.currency, p_livemode: session.livemode, p_status: status,
    p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    p_request_id: requestId || null, p_input_hash: inputHash || null,
  });
  if (error) databaseFailure("apply payment event", error);
  return { received: true };
}

const orderSummary = "id,plan,amount_total,currency,status,created_at,paid_at,details_submitted_at,livemode,product_name:product->>title,draft_saved_at:product->>draftSavedAt";

export async function getLaunchOrder(userId: string, orderId: string) {
  if (!UUID_PATTERN.test(orderId)) throw new HttpError(400, "Invalid order ID.");
  const { data, error } = await getAdminClient().from(ordersTable)
    .select(orderSummary)
    .eq("id", orderId).eq("user_id", userId).eq("livemode", orderLiveMode()).maybeSingle();
  if (error) databaseFailure("read order", error);
  if (!data) throw new HttpError(404, "Order not found.");
  return data;
}

export async function listLaunchOrders(userId: string) {
  const { data, error } = await getAdminClient().from(ordersTable)
    .select(orderSummary)
    .eq("user_id", userId).eq("livemode", orderLiveMode()).eq("status", "paid").order("created_at", { ascending: false }).limit(50);
  if (error) databaseFailure("list orders", error);
  return data ?? [];
}

export async function getLaunchOrderDraft(userId: string, orderId: string) {
  if (!UUID_PATTERN.test(orderId)) throw new HttpError(400, "Invalid order ID.");
  const { data, error } = await getAdminClient().from(ordersTable)
    .select(`${orderSummary},draft:product->draft`)
    .eq("id", orderId).eq("user_id", userId).eq("livemode", orderLiveMode()).maybeSingle();
  if (error) databaseFailure("read order draft", error);
  if (!data) throw new HttpError(404, "Order not found.");
  const { draft, ...order } = data;
  return { order, draft: order.status === "paid" && !order.details_submitted_at ? draft ?? null : null };
}

export async function saveLaunchOrderDraft(userId: string, orderId: string, body: unknown) {
  if (!UUID_PATTERN.test(orderId)) throw new HttpError(400, "Invalid order ID.");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid draft.");
  const draft = body as Record<string, unknown>;
  // The private order stores a form snapshot until final submission replaces it
  // with the validated product. No required fields or final status change here.
  const { data, error } = await getAdminClient().from(ordersTable)
    .update({ product: { draft, draftSavedAt: new Date().toISOString() } })
    .eq("id", orderId).eq("user_id", userId).eq("livemode", orderLiveMode()).eq("status", "paid").is("details_submitted_at", null)
    .select("id").maybeSingle();
  if (error) databaseFailure("save order draft", error);
  if (!data) throw new HttpError(409, "This order is unavailable for draft saving. Check your Dashboard.");
  return { orderId };
}

export async function saveLaunchDetails(userId: string, orderId: string, input: ReturnType<typeof parseLaunchDetails>) {
  const order = await getLaunchOrder(userId, orderId);
  if (order.status !== "paid") throw new HttpError(403, "Payment must be confirmed before submitting product details.");
  if (order.details_submitted_at) throw new HttpError(409, "These order details have already been received. View your order status.", "details_already_received");
  const { data, error } = await getAdminClient().from(ordersTable).update({
    product: input.product, service_details: input.serviceDetails, details_submitted_at: new Date().toISOString(),
  }).eq("id", orderId).eq("user_id", userId).eq("livemode", orderLiveMode()).eq("status", "paid").is("details_submitted_at", null).select("id").maybeSingle();
  if (error) databaseFailure("save order details", error);
  if (!data) throw new HttpError(409, "The order has changed. Check its status before submitting again.");
  return { orderId };
}
