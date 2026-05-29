import { NextResponse } from "next/server";

/**
 * OAuth Callback Route
 * 
 * Handles the redirect from Supabase Auth (after Google/GitHub login).
 * 
 * With PKCE flow:
 * - Success: Supabase sends ?code=... which gets exchanged for a session
 * - Error/Cancel: Supabase sends ?error=... which we catch and redirect cleanly
 * 
 * This route ensures cancelled logins NEVER crash the main page with error fragments.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // If OAuth was cancelled or errored, redirect home cleanly
  if (error) {
    console.warn(`[Auth Callback] OAuth cancelled: ${error} - ${searchParams.get("error_description")}`);
    return NextResponse.redirect(`${origin}/`);
  }

  // If we have a code, redirect to home with the code in query params
  // The Supabase client on the main page will detect and exchange it
  if (code) {
    // Forward the code to the main page - Supabase JS with PKCE + detectSessionInUrl 
    // will automatically pick it up from the URL
    const url = new URL(origin);
    url.searchParams.set("code", code);
    return NextResponse.redirect(url.toString());
  }

  // Fallback: just go home
  return NextResponse.redirect(`${origin}/`);
}
