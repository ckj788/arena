"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[INDIE CLASH] Route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08080a] px-6 text-center text-zinc-300">
      <div className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-400">Arena temporarily unavailable</p>
        <h1 className="text-3xl font-semibold text-white">The bracket failed to load.</h1>
        <p className="text-sm text-zinc-500">No vote or submission was sent by this screen. You can safely try again.</p>
        <button type="button" onClick={reset} className="rounded-md border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
          Try again
        </button>
      </div>
    </main>
  );
}
