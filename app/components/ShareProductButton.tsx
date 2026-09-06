"use client";

import { useEffect, useRef, useState } from "react";

export default function ShareProductButton({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div>
    <button type="button" className="min-h-11 rounded-md border border-white/[0.12] px-3 text-sm text-zinc-300 hover:bg-white/[0.05]" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus("idle"), 2500);
      } catch { setStatus("error"); }
    }}>{status === "copied" ? "Link copied ✓" : "Copy share link"}</button>
    <span role="status" className="sr-only">{status === "copied" ? "Product link copied" : ""}</span>
    {status === "error" && <div role="status" className="mt-2 text-xs text-zinc-300">Copy this link:
      <input aria-label="Product share link" readOnly value={url} onFocus={(event) => event.target.select()} className="mt-1 w-full rounded border border-white/20 bg-black p-2" />
    </div>}
  </div>;
}
