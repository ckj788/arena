import { useMemo } from "react";
import type { Product, Match, Bracket } from "@/lib/mockData";
import Link from "@/app/components/NavigationLink";
import { publicHttpUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";
import { feedCategoryLabel } from "@/lib/productTaxonomy";
import FairDiscoverySection from "./FairDiscoverySection";
interface Props {
  visibleProducts: Product[];
  bracket: Bracket | null;
  activeMatch: Match | null;
  renderLogo: (logo: string, className?: string) => React.ReactNode;
  renderDiscoveryFeedBadge: (product: Product) => React.ReactNode;
  synthClick: (frequency?: number, type?: OscillatorType, duration?: number) => void;
  handleDiscoveryAdvance: () => void;
}

export default function DiscoverFeed({
  visibleProducts,
  bracket,
  activeMatch,
  renderLogo,
  renderDiscoveryFeedBadge,
  synthClick,
  handleDiscoveryAdvance
}: Props) {
  const showcaseProducts = useMemo(() => {
    // Preserve the newest-first rolling feed while keeping it bounded to the
    // latest 50 permanent product profiles.
    const sorted = [...visibleProducts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return sorted.slice(0, 50);
  }, [visibleProducts]);
  return (
    <>
    {/* LATEST RELEASES (Product Discovery Feed Style) */}
    <section id="launches-section" className="pt-8 pb-12 md:pt-10 md:pb-16">

      <div data-home-reveal="launches-heading" className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-left space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="exhibition-index" aria-hidden="true">01 /</span>
            <h2 className="exhibition-section-title">Latest launches</h2>
            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full flex items-center gap-1.5 shrink-0" style={{ transform: "translateZ(0)" }}>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Newest 50 · Rolling
            </span>
          </div>
          <p className="text-sm text-zinc-500 pl-4">
            Freshly launched by indie makers.
          </p>
        </div>
        <div className="flex items-center sm:self-center pl-4 sm:pl-0">
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-zinc-600 hover:text-zinc-950 transition group"
            onClick={() => synthClick(280, "sine", 0.05)}
          >
            Browse all products
            <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
          </Link>
        </div>
      </div>
      {/* Motion stops on hover or keyboard focus without an extra control. */}
      <div
        data-home-reveal="launches-feed"
        tabIndex={0}
        aria-label="Latest products. Focus to pause scrolling."
        onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
        className="release-feed border border-zinc-300/80 bg-white shadow-xs rounded-2xl overflow-hidden h-[460px] sm:h-[540px] relative"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.02) 2%, black 15%, black 85%, rgba(0,0,0,0.02) 98%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.02) 2%, black 15%, black 85%, rgba(0,0,0,0.02) 98%, transparent)',
        }}
      >
        {showcaseProducts.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 font-mono text-xs">
            [ No waitlist submissions enqueued in waiting room. ]
          </div>
        ) : (
          <div
            className="flex flex-col marquee-vertical-container"
            style={{
              animationName: 'marquee-vertical',
              animationDuration: `${Math.max(15, showcaseProducts.length * 2.2)}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              willChange: 'transform'
            }}
          >
            {/* Double the list to make seamless looping possible */}
            {[...showcaseProducts, ...showcaseProducts].map((item, index) => {
              const website = publicHttpUrl(item.url);
              const isQueued = item.arenaEnqueued ?? (!item.makerAvatar || !item.makerAvatar.includes("pushed=false"));
              const makerHandle = item.makerTwitter ? (item.makerTwitter.startsWith("@") ? item.makerTwitter : `@${item.makerTwitter}`) : null;
              const categoryTag = feedCategoryLabel(item.category);
              return (
                <div
                  key={`${item.id}-dup-${index}`}
                  data-feed-duplicate={index >= showcaseProducts.length || undefined}
                  aria-hidden={index >= showcaseProducts.length || undefined}
                  inert={index >= showcaseProducts.length || undefined}
                  className="group px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-zinc-50/80 transition-colors duration-150 border-b border-zinc-200/70 last:border-b-0 min-h-[76px] box-border"
                >
                  {/* Left side: Squircle badge + text info */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Link
                      href={`/products/${encodeURIComponent(item.id)}`}
                      className="shrink-0 transition-transform duration-150 group-hover:scale-[1.03]"
                      onClick={() => synthClick(320, "sine", 0.04)}
                    >
                      {renderDiscoveryFeedBadge(item)}
                    </Link>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/products/${encodeURIComponent(item.id)}`}
                          className="font-bold text-zinc-950 text-sm sm:text-base hover:underline hover:text-orange-600 transition-colors cursor-pointer truncate max-w-[200px] sm:max-w-xs"
                          onClick={() => synthClick(320, "sine", 0.04)}
                        >
                          {item.title}
                        </Link>

                        {makerHandle ? (
                          <a
                            href={`https://x.com/${item.makerTwitter ? item.makerTwitter.replace(/^@/, "") : ""}`}
                            target="_blank"
                            rel="ugc noopener noreferrer"
                            className="text-xs font-mono text-zinc-400 hover:text-zinc-700 hover:underline transition-colors shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {makerHandle}
                          </a>
                        ) : null}

                        {isQueued ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide uppercase bg-violet-50 text-violet-700 border border-violet-200/70 shrink-0">
                            queued
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide uppercase bg-zinc-100 text-zinc-600 border border-zinc-200/70 shrink-0">
                            showcase
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-zinc-500 truncate mt-1 max-w-xl">
                        {item.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Right side: Category pill + Circular action button */}
                  <div className="shrink-0 flex items-center gap-3">
                    {categoryTag ? <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-600 bg-zinc-100/90 border border-zinc-200/70">
                      {categoryTag}
                    </span> : null}

                    {website ? (
                      <a
                        href={website}
                        target="_blank"
                        rel={productLinkRel(item)}
                        className="w-9 h-9 rounded-full border border-zinc-200/80 bg-white hover:bg-zinc-100 hover:border-zinc-300 text-zinc-500 hover:text-zinc-900 shadow-2xs flex items-center justify-center transition-all duration-150 shrink-0"
                        aria-label={`Visit ${item.title}`}
                        title={`Visit ${item.title}`}
                        onClick={() => synthClick(360, "sine", 0.04)}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </a>
                    ) : (
                      <Link
                        href={`/products/${encodeURIComponent(item.id)}`}
                        className="w-9 h-9 rounded-full border border-zinc-200/80 bg-white hover:bg-zinc-100 hover:border-zinc-300 text-zinc-500 hover:text-zinc-900 shadow-2xs flex items-center justify-center transition-all duration-150 shrink-0"
                        aria-label={`View ${item.title}`}
                        title={`View ${item.title}`}
                        onClick={() => synthClick(360, "sine", 0.04)}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>

    <FairDiscoverySection
      products={visibleProducts}
      renderLogo={renderLogo}
      onAdvance={handleDiscoveryAdvance}
    />

    <section id="arena-preview" aria-labelledby="arena-preview-title" className="border-t border-zinc-200/80 py-10 md:py-14">
      <div data-home-reveal="arena-preview" className="exhibition-arena-preview glass-panel flex flex-col gap-6 border p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-700">
            <span className={`h-1.5 w-1.5 rounded-full ${bracket?.status === "active" ? "bg-emerald-500" : "bg-violet-600"}`} />
            {bracket?.status === "active" ? "Live in the Arena" : "The Arena"}
          </p>
          <h2 id="arena-preview-title" className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
            {bracket?.status === "active" && activeMatch?.productA && activeMatch?.productB
              ? `${activeMatch.productA.title} vs ${activeMatch.productB.title}`
              : "Two products. Honest feedback."}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Meet the makers, compare their products, and help them improve.</p>
        </div>
        <Link href="/arena" prefetch className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 self-start rounded-lg border border-violet-200 bg-violet-50/80 px-5 text-sm font-semibold text-violet-700 shadow-2xs transition hover:border-violet-300 hover:bg-violet-100 md:self-center">
          Explore the Arena <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
    </>
  );
}
