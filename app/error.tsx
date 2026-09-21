"use client";

import { useEffect, useTransition } from "react";
import Link from "@/app/components/NavigationLink";

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  useEffect(() => { console.error("[INDIE CLASH] Route error:", error); }, [error]);
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16 text-zinc-900">
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-violet-700">Indie Clash</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-950">This page couldn’t load.</h1>
      <p className="mt-4 text-base leading-7 text-zinc-600">Please try again in a moment. If you were editing a form, keep your original tab open.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(() => retry())}
          className="min-h-11 rounded-xl bg-[#ffbe18] px-5 text-sm font-semibold text-zinc-950 shadow-xs transition hover:bg-[#e0a612]"
        >
          {pending ? "Retrying…" : "Try again"}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
