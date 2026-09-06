"use client";

import { useEffect, useTransition } from "react";
import Link from "@/app/components/NavigationLink";

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  useEffect(() => { console.error("[INDIE CLASH] Route error:", error); }, [error]);
  return <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16 text-white">
    <p className="text-xs uppercase tracking-widest text-[#A78BFA]">Indie Clash</p>
    <h1 className="mt-4 text-3xl font-semibold">This page couldn’t load.</h1>
    <p className="mt-4 text-base leading-7 text-zinc-400">Please try again in a moment. If you were editing a form, keep your original tab open.</p>
    <div className="mt-7 flex flex-wrap gap-3">
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => retry())} className="min-h-11 rounded-md bg-[#ffbe18] px-5 text-sm font-semibold text-black">{pending ? "Retrying…" : "Try again"}</button>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-md border border-white/20 px-5 text-sm text-zinc-300">Back to home</Link>
    </div>
  </main>;
}
