import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mmessfnkooidqcqfkwgb.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tZXNzZm5rb29pZHFjcWZrd2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDg5NDIsImV4cCI6MjA5MzE4NDk0Mn0.4BlZTtVfbCMNnK-7R1w5znHc87kqN3szQYqkglOZ_Ls";

// Dynamic database prefix configuration to isolate environments (e.g. "indie_" vs "shipandbattle_")
export const DB_PREFIX = process.env.NEXT_PUBLIC_DB_PREFIX || "shipandbattle_";

// Ensure fallback mechanism on both client and server
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    flowType: "implicit",
  },
  global: {
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        cache: "no-store",
      });
    },
  },
});

console.log(
  `⚔️ [INDIE CLASH] Supabase connected successfully with prefix "${DB_PREFIX}"! Switched to real-time online duel mode.`
);
