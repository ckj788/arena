import "server-only";
import Stripe from "stripe";
import { fetch as proxyFetch } from "undici";
import { HttpError } from "./auth";

export function stripeMode() {
  return process.env.STRIPE_MODE?.trim() || "test";
}

function configuredKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const mode = stripeMode();
  return (mode === "test" || mode === "live") && new RegExp(`^(sk|rk)_${mode}_`).test(key) ? key : null;
}

export function paymentConfiguration() {
  return Boolean(configuredKey() && process.env.STRIPE_WEBHOOK_SECRET?.trim()
    && process.env.STRIPE_CHECKOUT_BASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Stripe is not configured yet. No payment has been created.");
  if (!configuredKey()) throw new HttpError(503, "Stripe key does not match STRIPE_MODE. Test mode requires a test key; live payments are disabled unless explicitly configured.");
  return new Stripe(key, {
    maxNetworkRetries: 1, timeout: 12_000,
    ...(process.env.NODE_ENV !== "production" && process.env.INDIECLASH_DEV_PROXY_ACTIVE === "1"
      // Node 22's bundled fetch and Undici 7's dispatcher disagree on explicit
      // Content-Length headers. Use the matching fetch implementation locally.
      ? { httpClient: Stripe.createFetchHttpClient(proxyFetch as unknown as typeof fetch) } : {}),
  });
}

export function checkoutBaseUrl() {
  const configured = process.env.STRIPE_CHECKOUT_BASE_URL?.trim();
  if (!configured) throw new HttpError(503, "Payment return URL is not configured.");
  let url: URL;
  try { url = new URL(configured); }
  catch { throw new HttpError(503, "Payment return URL is invalid."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:"))) {
    throw new HttpError(503, "Payment return URL must be an HTTPS site origin (HTTP localhost is allowed in development).");
  }
  return url.origin;
}

export const STRIPE_APPLICATION = "indieclash-directory";
