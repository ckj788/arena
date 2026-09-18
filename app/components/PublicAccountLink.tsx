"use client";

import { useEffect, useState } from "react";
import Link from "./NavigationLink";
import { supabase } from "@/lib/supabaseClient";
import { withDeadline } from "@/lib/requestSafety";

export default function PublicAccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let changed = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) setSignedIn(Boolean(session));
    });
    void withDeadline(supabase.auth.getSession(), 10_000).then(({ data }) => {
      if (active && !changed) setSignedIn(Boolean(data.session));
    }).catch(() => {});
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <Link href={signedIn ? "/?view=console" : "/?signin=1"} className="inline-flex min-h-10 shrink-0 items-center px-2 text-[11px] text-zinc-300 hover:text-white sm:text-xs">{signedIn ? "My Console" : "Sign in"}</Link>;
}
