"use client";

import { useEffect, useRef, useState } from "react";
import { withDeadline } from "@/lib/requestSafety";

export default function ShareProductButton({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
        onClick={async () => {
          try {
            await withDeadline(navigator.clipboard.writeText(url), 3_000);
            setStatus("copied");
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setStatus("idle"), 2500);
          } catch { setStatus("error"); }
        }}
      >
        {status === "copied" ? "Link copied ✓" : "Copy share link"}
      </button>
      <span role="status" className="sr-only">{status === "copied" ? "Product link copied" : ""}</span>
      {status === "error" && (
        <div role="status" className="mt-2 text-xs text-zinc-600">
          Copy this link:
          <input
            aria-label="Product share link"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-xs text-zinc-700 outline-none focus:border-zinc-400 focus:bg-white"
          />
        </div>
      )}
    </div>
  );
}
