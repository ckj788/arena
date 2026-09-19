"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authenticatedJson } from "@/lib/arenaApi";

export default function ModerationLink({ userId }: { userId: string }) {
  const [adminId, setAdminId] = useState("");
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void authenticatedJson<{ allowed: boolean }>("/api/arena/moderation?access=1", undefined, "GET")
      .then(result => { if (active && result.allowed) setAdminId(userId); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);
  return userId && adminId === userId ? <Link href="/moderation" className="mt-3 inline-block text-xs text-zinc-400 hover:text-white">Moderation →</Link> : null;
}
