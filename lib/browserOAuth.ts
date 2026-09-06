import type { SupabaseClient } from "@supabase/supabase-js";

export const OAUTH_RETURN_TO_KEY = "indieclash_oauth_return_to_v1";
export const OAUTH_RESTORE_EVENT = "indieclash:restore-after-auth";

// Both React Strict Mode and a remount may ask for the same one-use code.
// Keep one in-flight/result promise per client, without enabling the SDK's
// automatic URL exchange as a second competing consumer.
const exchanges = new WeakMap<SupabaseClient, {
  code: string;
  promise: ReturnType<SupabaseClient["auth"]["exchangeCodeForSession"]>;
}>();

export function exchangeOAuthCodeOnce(client: SupabaseClient, code: string) {
  const previous = exchanges.get(client);
  if (previous?.code === code) return previous.promise;
  const promise = client.auth.exchangeCodeForSession(code);
  exchanges.set(client, { code, promise });
  return promise;
}

export function safeOAuthReturnPath(requested: string | null, origin: string) {
  if (!requested?.startsWith("/") || requested.startsWith("//")) return "/";
  try {
    const destination = new URL(requested, origin);
    if (destination.origin !== origin || destination.pathname.startsWith("/auth/")) return "/";
    for (const key of ["code", "error", "error_code", "error_description"]) destination.searchParams.delete(key);
    if (new URLSearchParams(destination.hash.slice(1)).has("error")) destination.hash = "";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export function oauthFailureMessage(error: unknown) {
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  if (detail.code === "pkce_code_verifier_not_found" || /verifier.*(missing|not found)|PKCE code verifier/i.test(detail.message || "")) {
    return "Sign-in returned to a different site, or this browser lost its sign-in data. Start and finish on the same address. For local testing, add this site's /auth/callback URL to Supabase Redirect URLs.";
  }
  if (detail.code === "access_denied") return "Sign-in was cancelled. You can try again when you are ready.";
  return "Sign-in could not finish. The link may have expired or the connection failed. Please try again from this page.";
}
