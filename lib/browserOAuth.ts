import type { SupabaseClient } from "@supabase/supabase-js";

export const OAUTH_RETURN_TO_KEY = "indieclash_oauth_return_to_v1";
export const OAUTH_SUBMISSION_TARGET_KEY = "indieclash_oauth_submission_target_v1";
export const OAUTH_RESTORE_EVENT = "indieclash:restore-after-auth";

export function isSubmissionPath(path: string) {
  return ["/submit", "/submit/details", "/submit/checkout"].some(route => path === route || path.startsWith(`${route}?`));
}

export function oauthReturnDestination(returnTo: string | null, submissionTarget: string | null, failed: boolean, origin: string) {
  return safeOAuthReturnPath(!failed && submissionTarget && isSubmissionPath(submissionTarget) ? submissionTarget : returnTo, origin);
}

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
    if (destination.origin !== origin || destination.pathname.startsWith("//") || destination.pathname.startsWith("/auth/")) return "/";
    for (const key of ["code", "error", "error_code", "error_description"]) destination.searchParams.delete(key);
    const fragment = new URLSearchParams(destination.hash.slice(1));
    if (["error", "error_code", "error_description"].some(key => fragment.has(key))) destination.hash = "";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

const oauthFailureMessages = {
  pkce_code_verifier_not_found: "Sign-in returned to a different site, or this browser lost its sign-in data. Start sign-in again and finish in the same tab.",
  bad_code_verifier: "This sign-in attempt no longer matches your browser. Close any other sign-in tabs and start again here.",
  flow_state_expired: "This sign-in attempt expired. Start a new sign-in from this page.",
  flow_state_not_found: "This sign-in link is no longer valid. Start a new sign-in from this page.",
  access_denied: "Sign-in was cancelled or denied by the provider. You can try again when you are ready.",
  signup_disabled: "New account sign-ups are currently unavailable.",
  provider_email_needs_verification: "Verify your email with your sign-in provider, then try again.",
  unexpected_failure: "The sign-in service could not finish your request. If it keeps happening, contact support.",
  request_timeout: "The sign-in service could not respond. Check your connection and try again.",
  over_request_rate_limit: "There were too many sign-in attempts. Wait a moment and try again.",
  sign_in_failed: "Sign-in could not finish. Please start a new sign-in from this page.",
};

export function oauthFailureCode(error: unknown): keyof typeof oauthFailureMessages {
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string; name?: string } : {};
  if (detail.code && Object.hasOwn(oauthFailureMessages, detail.code)) return detail.code as keyof typeof oauthFailureMessages;
  if (/verifier.*(missing|not found)|PKCE code verifier/i.test(detail.message || "")) return "pkce_code_verifier_not_found";
  if (detail.name === "AuthRetryableFetchError" || /timed out/i.test(detail.message || "")) return "request_timeout";
  return "sign_in_failed";
}

export function oauthFailureMessage(error: unknown) {
  return oauthFailureMessages[oauthFailureCode(error)];
}
