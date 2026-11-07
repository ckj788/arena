import { authenticatePaymentRequest, jsonError, readJsonRequest } from "@/lib/server/auth";
import { consumeLaunchRateLimit, createLaunchCheckout, parseCheckoutInput } from "@/lib/server/launchPayments";
import { paymentConfiguration } from "@/lib/server/stripe";
import { HttpError } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let quotaHour = 0;
const checkoutCounts = new Map<string, number>();

async function checkCheckoutQuota(userId: string) {
  const hour = Math.floor(Date.now() / 3600_000);
  if (hour !== quotaHour) { checkoutCounts.clear(); quotaHour = hour; }
  const count = checkoutCounts.get(userId) ?? 0;
  if (count >= 20) throw new HttpError(429, "Too many payment requests. Please wait until the next hour and retry the same checkout.");
  checkoutCounts.set(userId, count + 1);
}

export async function POST(request: Request) {
  const timings: string[] = [];
  async function timed<T>(name: string, operation: () => Promise<T>) {
    const start = performance.now();
    try { return await operation(); }
    finally { timings.push(`${name};dur=${(performance.now() - start).toFixed(1)}`); }
  }
  function respond(response: Response) {
    response.headers.set("Server-Timing", timings.join(", "));
    return response;
  }
  try {
    if (!paymentConfiguration()) throw new HttpError(503, "Stripe checkout is not configured yet. No order or payment has been created.");
    const { user, client } = await timed("auth", () => authenticatePaymentRequest(request));
    const input = parseCheckoutInput(await readJsonRequest(request, 128_000));
    await timed("quota", () => input.payBeforeOrder ? checkCheckoutQuota(user.id) : consumeLaunchRateLimit(client, "checkout"));
    const result = await timed("checkout", () => createLaunchCheckout(user, input));
    return respond(Response.json({ ...result, userId: user.id }, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) { return respond(jsonError(error)); }
}
