import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// Dynamic database prefix configuration to isolate environments (e.g. "indie_" vs "shipandbattle_")
export const DB_PREFIX = process.env.NEXT_PUBLIC_DB_PREFIX || "shipandbattle_";

// Never silently connect a local/dev build to a hard-coded production project.
// Missing configuration intentionally enables the existing local sandbox mode.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
    })
  : null;
