import { oauthFailureCode, safeOAuthReturnPath } from "@/lib/browserOAuth";

/**
 * OAuth Callback Route
 * 
 * Handles the redirect from Supabase Auth (after Google/GitHub login).
 * 
 * With PKCE flow:
 * - Success: Supabase sends ?code=... which is forwarded to the safe return URL
 * - Error/Cancel: Supabase sends ?error=... which is forwarded cleanly
 * 
 * This route ensures cancelled logins NEVER crash the main page with error fragments.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const destination = new URL(safeOAuthReturnPath(searchParams.get("next"), origin), origin);

  // Return cancellation to the route where authentication began.
  if (error || errorCode || searchParams.has("error_description")) {
    const reason = oauthFailureCode({ code: errorCode || error, message: searchParams.get("error_description") });
    destination.searchParams.set("error", reason);
  } else if (code) {
    // ArenaClient exchanges the code in the same tab and restores UI state.
    destination.searchParams.set("code", code);
  }

  // Let the browser resolve the validated path against the callback's public
  // origin. The host seen by Next.js may differ behind a proxy or on localhost.
  return new Response(null, {
    status: 307,
    headers: {
      Location: `${destination.pathname}${destination.search}${destination.hash}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
