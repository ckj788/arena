"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "@/app/components/NavigationLink";
import { gsap } from "gsap";
import type { Product } from "@/lib/mockData";
import { recordQualifiedExposure } from "@/lib/arenaApi";
import { buildFairDiscoverySequence, hasActiveDiscoveryBoost } from "@/lib/discoveryRanking";
import { discoverySeed, readSession, writeSession, removeSession } from "@/lib/browserStorage";
import { observeQualifiedExposures } from "@/lib/qualifiedExposure";


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
  // Keep the server-painted first deck while restoring the visitor seed.
  // Only the unseen tail is reshuffled; hydration is not a Next action.
  const [firstDeckIds] = useState(() => buildFairDiscoverySequence(products, "initial", BATCH_SIZE).slice(0, BATCH_SIZE).map(product => product.id));
  const [isFirstPass, setIsFirstPass] = useState(true);
  const sectionRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isTransitioningRef = useRef(false);
  const recordedExposureIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let seed = readSession(SEED_KEY);
    if (!seed) {
      seed = discoverySeed();
      writeSession(SEED_KEY, seed);
    }

    const restoreTimer = window.setTimeout(() => {
      setSessionSeed(seed);
      try {
        const storedSeen = JSON.parse(readSession(SEEN_KEY) || "[]");
        if (Array.isArray(storedSeen)) {
          setSeenIds(new Set(storedSeen.filter((id): id is string => typeof id === "string")));
        }
      } catch {
        removeSession(SEEN_KEY);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  const sequence = useMemo(() => {
    if (!isFirstPass) return buildFairDiscoverySequence(products, sessionSeed, BATCH_SIZE);
    const byId = new Map(products.map(product => [product.id, product]));
    const leading = firstDeckIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
    const locked = new Set(firstDeckIds);
    return [...leading, ...buildFairDiscoverySequence(products.filter(product => !locked.has(product.id)), sessionSeed, BATCH_SIZE)];
  }, [products, sessionSeed, isFirstPass, firstDeckIds]);
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
        writeSession(SEEN_KEY, JSON.stringify([...next]));
        return next;
      });
    }, { threshold: 0.5 });
    gridRef.current?.querySelectorAll("[data-qualified-exposure-id]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [isVisible, visibleProducts]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !isTransitioningRef.current) return;
    const media = gsap.matchMedia(sectionRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(grid, { opacity: 0, x: 14, willChange: "transform,opacity" }, {
        opacity: 1, x: 0, duration: 0.36, ease: "power3.out",
        clearProps: "transform,opacity,visibility,willChange",
        onComplete: () => { isTransitioningRef.current = false; setIsTransitioning(false); },
      });
    });
    // Also release the button if reduced motion is enabled mid-transition.
    const release = window.setTimeout(() => {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }, 500);
    return () => { media.revert(); gsap.set(grid, { clearProps: "transform,opacity,visibility,willChange" }); window.clearTimeout(release); };
  }, [activeBatchIndex, sessionSeed]);

  useEffect(() => {
    const grid = gridRef.current;
    const onResize = () => setGridHeight(undefined);
    window.addEventListener("resize", onResize);
    return () => { if (grid) gsap.killTweensOf(grid); window.removeEventListener("resize", onResize); };
  }, []);

  useEffect(() => {
    if (!visibleProducts.length || typeof IntersectionObserver === "undefined") return;
    const elements = Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-qualified-exposure-id]") || []);
    return observeQualifiedExposures(elements, recordedExposureIdsRef.current, recordQualifiedExposure);
  }, [visibleProducts]);

  const showNext = () => {
    if (batchCount <= 1 || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    if (gridRef.current) setGridHeight(gridRef.current.getBoundingClientRect().height);
    onAdvance?.();

    const swapBatch = () => {
      if (activeBatchIndex >= batchCount - 1) {
        const nextSeed = discoverySeed();
        writeSession(SEED_KEY, nextSeed);
        removeSession(SEEN_KEY);
        setSeenIds(new Set());
        setIsFirstPass(false);
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

    // Finish fading before changing text. Swapping a half-visible grid looks
    // like a flash even when every frame is fast. No layout properties animate.
    gsap.to(grid, {
      x: -10,
      opacity: 0,
      duration: 0.12,
      ease: "power2.in",
      willChange: "transform,opacity",
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
