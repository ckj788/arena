import { NextResponse } from "next/server";
import { safeOAuthReturnPath } from "@/lib/browserOAuth";

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
  const destination = new URL(safeOAuthReturnPath(searchParams.get("next"), origin), origin);
  const redirect = () => {
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };

  // Return cancellation to the route where authentication began.
  if (error) {
    destination.searchParams.set("error", error);
    const description = searchParams.get("error_description");
    if (description) destination.searchParams.set("error_description", description);
    return redirect();
  }

  // Return the PKCE code to the route where authentication began.
  // The Supabase client on the main page will detect and exchange it
  if (code) {
    // ArenaClient exchanges the code in the same tab and restores UI state.
    destination.searchParams.set("code", code);
    return redirect();
  }

  // Fallback: just go home
  return redirect();
}
