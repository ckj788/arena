import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Dynamic database prefix configuration to isolate environments (e.g. "indie_" vs "shipandbattle_")
export const DB_PREFIX = process.env.NEXT_PUBLIC_DB_PREFIX || "shipandbattle_";

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
    `⚠️ [INDIE CLASH] Supabase environment variables are not configured. Automatically falling back to local sandbox storage mode (localStorage).`
  );
} else {
  console.log(
    `⚔️ [INDIE CLASH] Supabase connected successfully with prefix "${DB_PREFIX}"! Switched to real-time online duel mode.`
  );
}
