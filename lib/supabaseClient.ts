import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Ensure fallback mechanism on both client and server; if env variables are missing, return null to fall back to local sandbox mode.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: false,
          flowType: "implicit",
        },
      })
    : null;

if (!supabase) {
  console.warn(
    "⚠️ [INDIE CLASH] Supabase environment variables are not configured. Automatically falling back to local sandbox storage mode (localStorage)."
  );
} else {
  console.log(
    "⚔️ [INDIE CLASH] Supabase database connected successfully! Switched to real-time online duel mode."
  );
}
