"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "@/app/components/NavigationLink";
import { gsap } from "gsap";
import type { Product } from "@/lib/mockData";
import { recordQualifiedExposure } from "@/lib/arenaApi";
import { buildFairDiscoverySequence, hasActiveDiscoveryBoost } from "@/lib/discoveryRanking";


const BATCH_SIZE = 6;
const SEED_KEY = "indieclash_discovery_session_seed_v1";
const SEEN_KEY = "indieclash_discovery_seen_v1";

interface FairDiscoverySectionProps {
  products: Product[];
  renderLogo: (logo: string, className?: string) => React.ReactNode;
  onAdvance?: () => void;
}

function FairDiscoverySection({ products, renderLogo, onAdvance }: FairDiscoverySectionProps) {
  const [batchIndex, setBatchIndex] = useState(0);
  const [sessionSeed, setSessionSeed] = useState("initial");
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [isVisible, setIsVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridHeight, setGridHeight] = useState<number>();
  const animatedBatchRef = useRef("");
  const sectionRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isTransitioningRef = useRef(false);
  const recordedExposureIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let seed = sessionStorage.getItem(SEED_KEY);
    if (!seed) {
      seed = crypto.randomUUID();
      sessionStorage.setItem(SEED_KEY, seed);
    }

    const restoreTimer = window.setTimeout(() => {
      setSessionSeed(seed);
      try {
        const storedSeen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]");
        if (Array.isArray(storedSeen)) {
          setSeenIds(new Set(storedSeen.filter((id): id is string => typeof id === "string")));
        }
      } catch {
        sessionStorage.removeItem(SEEN_KEY);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  const sequence = useMemo(
    () => buildFairDiscoverySequence(products, sessionSeed, BATCH_SIZE),
    [products, sessionSeed],
  );
  const batchCount = Math.ceil(sequence.length / BATCH_SIZE);
  const activeBatchIndex = batchCount ? batchIndex % batchCount : 0;
  const visibleProducts = useMemo(() => {
    const start = activeBatchIndex * BATCH_SIZE;
    return sequence.slice(start, start + BATCH_SIZE);
  }, [activeBatchIndex, sequence]);
  const seenCount = useMemo(
    () => sequence.reduce((count, product) => count + Number(seenIds.has(product.id)), 0),
    [seenIds, sequence],
  );

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.2);
    }, { threshold: [0.2] });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !visibleProducts.length) return;
    const observer = new IntersectionObserver((entries) => {
      const ids = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)
        .map((entry) => (entry.target as HTMLElement).dataset.qualifiedExposureId)
        .filter((id): id is string => Boolean(id));
      if (!ids.length) return;
      setSeenIds((current) => {
        if (ids.every((id) => current.has(id))) return current;
        const next = new Set([...current, ...ids]);
        try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...next])); } catch {}
        return next;
      });
    }, { threshold: 0.5 });
    gridRef.current?.querySelectorAll("[data-qualified-exposure-id]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [isVisible, visibleProducts]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const batchKey = `${activeBatchIndex}:${sessionSeed}`;
    if (!grid || animatedBatchRef.current === batchKey) return;
    animatedBatchRef.current = batchKey;
    const media = gsap.matchMedia(sectionRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(grid, { opacity: 0.55, x: 8 }, {
        opacity: 1, x: 0, duration: 0.22, ease: "power2.out",
        clearProps: "transform,opacity,visibility",
        onComplete: () => { isTransitioningRef.current = false; setIsTransitioning(false); },
      });
    });
    // Also release the button if reduced motion is enabled mid-transition.
    const release = window.setTimeout(() => {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }, 250);
    return () => { media.revert(); gsap.set(grid, { clearProps: "transform,opacity,visibility" }); window.clearTimeout(release); };
  }, [activeBatchIndex, sessionSeed]);

  useEffect(() => {
    const grid = gridRef.current;
    const onResize = () => setGridHeight(undefined);
    window.addEventListener("resize", onResize);
    return () => { if (grid) gsap.killTweensOf(grid); window.removeEventListener("resize", onResize); };
  }, []);

  useEffect(() => {
    if (!visibleProducts.length || typeof IntersectionObserver === "undefined") return;
    const timers = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const productId = element.dataset.qualifiedExposureId;
        if (!productId || recordedExposureIdsRef.current.has(productId)) continue;
        const storageKey = `indieclash_exposure_${productId}_${new Date().toISOString().slice(0, 10)}`;
        if (sessionStorage.getItem(storageKey)) {
          recordedExposureIdsRef.current.add(productId);
          observer.unobserve(element);
          continue;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.7 && document.visibilityState === "visible") {
          if (timers.has(productId)) continue;
          timers.set(productId, window.setTimeout(() => {
            timers.delete(productId);
            if (document.visibilityState !== "visible") return;
            recordedExposureIdsRef.current.add(productId);
            sessionStorage.setItem(storageKey, "1");
            observer.unobserve(element);
            void recordQualifiedExposure(productId).catch(() => {
              // Telemetry must never interrupt discovery.
            });
          }, 4_000));
        } else {
          const timer = timers.get(productId);
          if (timer) window.clearTimeout(timer);
          timers.delete(productId);
        }
      }
    }, { threshold: [0.7] });

    const elements = gridRef.current?.querySelectorAll<HTMLElement>("[data-qualified-exposure-id]") || [];
    elements.forEach((element) => observer.observe(element));
    const cancelHiddenTimers = () => {
      if (document.visibilityState === "visible") return;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
    document.addEventListener("visibilitychange", cancelHiddenTimers);

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("visibilitychange", cancelHiddenTimers);
    };
  }, [visibleProducts]);

  const showNext = () => {
    if (batchCount <= 1 || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    if (gridRef.current) setGridHeight(gridRef.current.getBoundingClientRect().height);
    onAdvance?.();

    const swapBatch = () => {
      if (activeBatchIndex >= batchCount - 1) {
        const nextSeed = crypto.randomUUID();
        sessionStorage.setItem(SEED_KEY, nextSeed);
        sessionStorage.removeItem(SEEN_KEY);
        setSeenIds(new Set());
        setSessionSeed(nextSeed);
        setBatchIndex(0);
      } else {
        setBatchIndex((current) => current + 1);
      }
    };

    const grid = gridRef.current;
    if (!grid || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swapBatch();
      isTransitioningRef.current = false;
      setIsTransitioning(false);
      return;
    }

    // One short compositor-only movement gives immediate feedback. The new
    // deck mounts before the eye can perceive an empty loading state.
    gsap.to(grid, {
      x: -6,
      opacity: 0.55,
      duration: 0.07,
      ease: "power1.in",
      force3D: true,
      overwrite: true,
      onComplete: swapBatch,
    });
  };

  return (
    <section ref={sectionRef} id="new-and-unseen-section" data-home-reveal="discovery" className="border-t border-white/[0.05] py-12 md:py-16">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="border-l-2 border-[#A78BFA] pl-4 text-xl font-bold uppercase tracking-tight text-white">WORTH A CLOSER LOOK</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Products with fewer recorded views, shown first.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Link href="/underrated" prefetch className="inline-flex min-h-11 items-center text-sm text-zinc-300 hover:text-white">Explore all {products.length} products →</Link>
          {batchCount > 1 && <div className="flex items-center gap-4">
            <span className="text-xs tabular-nums text-zinc-400">{seenCount} of {products.length} explored</span>
            <button type="button" onClick={showNext} disabled={isTransitioning} aria-controls="discovery-grid" aria-busy={isTransitioning}
              className="min-h-11 min-w-36 rounded-md border border-[#A78BFA]/30 bg-[#A78BFA]/[0.07] px-4 text-sm text-[#c4b5fd] transition-colors hover:bg-[#A78BFA]/[0.14] disabled:cursor-wait">
              {isTransitioning ? "Changing products…" : activeBatchIndex >= batchCount - 1 ? "Explore again ↻" : `Next ${Math.min(BATCH_SIZE, products.length - ((activeBatchIndex + 1) * BATCH_SIZE))} products →`}
            </button>
          </div>}
        </div>
      </div>

      {visibleProducts.length ? (
        <div
          id="discovery-grid"
          ref={gridRef}
          style={{ minHeight: gridHeight }}
          className="grid gap-px overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3"
          aria-label="Products to discover"
        >
          {visibleProducts.map((product) => (
            <article
              key={product.id}
              data-qualified-exposure-id={product.id}
              data-discovery-card
              className="product-card group relative flex h-80 flex-col bg-[#08080a] p-5 transition-colors duration-150 hover:bg-[#0c0c0f]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-black/40">
                  {renderLogo(product.logo, "w-7 h-7")}
                </span>
                {hasActiveDiscoveryBoost(product) && <span className="text-xs text-[#c4b5fd]">Peer contributor</span>}
              </div>
              <div className="mt-5 flex-1">
                <Link href={`/products/${encodeURIComponent(product.id)}`} prefetch className="card-primary-link line-clamp-2 text-lg font-semibold text-white transition-colors group-hover:text-[#ffbe18]">
                  {product.title}
                </Link>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">{product.tagline}</p>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-xs text-zinc-400">
                <span className="min-w-0 truncate">By {product.makerName}</span>
                <span className="shrink-0 text-zinc-300" aria-hidden="true">View product ↗</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/[0.08] p-10 text-center font-mono text-xs text-zinc-600">
          [ Discovery queue is waiting for its first launch. ]
        </div>
      )}
      {batchCount > 1 && <div className="mt-5 flex justify-center md:hidden">
        <button type="button" disabled={isTransitioning} aria-controls="discovery-grid" aria-busy={isTransitioning}
          onClick={() => {
            showNext();
            sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
            sectionRef.current?.querySelector<HTMLButtonElement>("button[aria-controls='discovery-grid']")?.focus({ preventScroll: true });
          }}
          className="min-h-11 rounded-md border border-[#A78BFA]/30 px-5 text-sm text-[#c4b5fd]">
          {isTransitioning ? "Changing products…" : activeBatchIndex >= batchCount - 1 ? "Explore again ↑" : "See the next products ↑"}
        </button>
      </div>}
    </section>
  );
}

// The Arena clock updates the parent every second. Discovery only needs to
// render again when its own state or the product collection changes.
export default React.memo(
  FairDiscoverySection,
  (previous, next) => previous.products === next.products && previous.renderLogo === next.renderLogo && previous.onAdvance === next.onAdvance,
);
