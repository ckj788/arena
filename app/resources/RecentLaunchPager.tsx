"use client";

import { Children, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";

export default function RecentLaunchPager({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const count = Math.ceil(cards.length / 6);
  const active = count ? page % count : 0;
  const start = active * 6;
  const last = active === count - 1;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const release = () => {
      gsap.set(grid, { clearProps: "transform,opacity,willChange" });
      locked.current = false;
      setBusy(false);
    };
    if (locked.current) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) release();
      else gsap.fromTo(grid, { opacity: 0, x: 14 }, {
        opacity: 1, x: 0, duration: 0.36, ease: "power3.out", onComplete: release,
      });
    }
    const timer = locked.current ? window.setTimeout(release, 600) : undefined;
    const resize = () => { grid.style.minHeight = ""; };
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      gsap.killTweensOf(grid);
    };
  }, [active]);

  const next = () => {
    const grid = gridRef.current;
    if (!grid || locked.current || count <= 1) return;
    locked.current = true;
    setBusy(true);
    grid.style.minHeight = `${grid.getBoundingClientRect().height}px`;
    const swap = () => setPage(last ? 0 : active + 1);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) swap();
    else gsap.to(grid, {
      x: -10, opacity: 0, duration: 0.12, ease: "power2.in",
      willChange: "transform,opacity", overwrite: true, onComplete: swap,
    });
  };

  return <>
    {count > 1 && <div className="mt-5 flex flex-wrap items-center justify-end gap-4">
      <span role="status" className="text-xs tabular-nums text-zinc-500">{start + 1}–{Math.min(start + 6, cards.length)} of {cards.length} products</span>
      <button type="button" onClick={next} disabled={busy} aria-controls="recent-launch-grid" className="min-h-11 min-w-36 rounded-md border border-violet-200 bg-violet-50/80 px-4 text-sm font-medium text-violet-700 shadow-2xs transition-colors hover:bg-violet-100 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-violet-600">
        {busy ? "Changing products…" : last ? "Explore again ↻" : `Next ${Math.min(6, cards.length - start - 6)} products →`}
      </button>
    </div>}
    <div id="recent-launch-grid" ref={gridRef} aria-busy={busy} className="mt-6 grid auto-rows-min gap-px overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-200/60 shadow-xs md:grid-cols-2 lg:grid-cols-3">
      {cards.slice(start, start + 6)}
    </div>
  </>;
}
