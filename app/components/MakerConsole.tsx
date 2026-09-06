import React, { useRef, useState } from 'react';
import Link from '@/app/components/NavigationLink';
import ShareProductButton from '@/app/components/ShareProductButton';
import useModalAccessibility from '@/app/components/useModalAccessibility';
import { absoluteUrl } from '@/lib/site';
import { Product, Bracket } from "@/lib/mockData";
import { compareArenaQueue, hasActiveDiscoveryBoost } from "@/lib/discoveryRanking";
import DailyArenaRunCountdown from "@/app/components/DailyArenaRunCountdown";
import useSurfaceMotion from "./useSurfaceMotion";
import { supabase } from "@/lib/supabaseClient";

interface MakerConsoleProps {
  isOpen: boolean;
  products: Product[];
  allProducts: Product[];
  activeBracket: Bracket | null;
  userTwitter: string;
  userSubId: string;
  ownershipStatus: "loading" | "ready" | "error";
  onRetryOwnership: () => void;
  onPushToQueue: (productId: string) => void | Promise<void>;
  renderLogo: (logo: string, className?: string) => React.ReactNode;
  onExportCsv?: (product: Product) => void;
  onSubmitProductClick?: () => void;
  onEditProduct?: (product: Product) => void;
}

export default function MakerConsole({
  isOpen,
  products,
  allProducts,
  activeBracket,
  userTwitter,
  userSubId,
  ownershipStatus,
  onRetryOwnership,
  onPushToQueue,
  renderLogo,
  onExportCsv,
  onSubmitProductClick,
  onEditProduct,
}: MakerConsoleProps) {
  const [selectedProductForPush, setSelectedProductForPush] = useState<Product | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  useSurfaceMotion(isOpen, consoleRef, "[data-console-section]");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [queueError, setQueueError] = useState("");
  useModalAccessibility(isOpen && Boolean(selectedProductForPush), dialogRef, () => {
    if (!isEnqueuing) setSelectedProductForPush(null);
  });
  if (!isOpen) return null;

  const isProductOwner = (p: Product) => {
    if (!supabase && typeof window !== "undefined") {
      try {
        const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
        if (myIds.includes(p.id)) return true;
      } catch {}
    }
    return Boolean(userSubId && p.creator_uid === userSubId);
  };

  const isPushed = (p: Product) => {
    return p.arenaEnqueued ?? (!p.makerAvatar || !p.makerAvatar.includes("pushed=false"));
  };

  const myProducts = products.filter(isProductOwner);

  // Compute Stats for Premium Dashboard Look
  const totalMyProducts = myProducts.length;
  const liveDuelsCount = myProducts.filter(p => p.queueStatus === "active").length;
  const completedCount = myProducts.filter(p => p.queueStatus === "completed").length;
  const queuedCount = myProducts.filter(p => p.queueStatus === "waiting" && isPushed(p)).length;
  const totalVotesCount = myProducts.reduce((acc, p) => acc + (p.votesCount || 0), 0);

  const trackedProducts = myProducts.filter((product) => typeof product.qualifiedImpressions === "number");
  const recordedViews = trackedProducts.reduce((total, product) => total + (product.qualifiedImpressions || 0), 0);

  // Compute global queue for position calculation
  const globalQueue = allProducts
    .filter(p => p.queueStatus === "waiting" && isPushed(p))
    .sort(compareArenaQueue);
  const globalQueueCount = globalQueue.length;
  const arenaIsLive = activeBracket && (activeBracket.status === "active" || activeBracket.status === "preparing");
  const dailyRosterSize = globalQueueCount >= 16
    ? null
    : globalQueueCount >= 8
      ? 8
      : globalQueueCount >= 4
        ? 4
        : globalQueueCount >= 2
          ? 2
          : null;
  const queueGoal = arenaIsLive ? 16 : dailyRosterSize || 16;

  const getQueuePosition = (productId: string): number => {
    const idx = globalQueue.findIndex(p => p.id === productId);
    return idx >= 0 ? idx + 1 : -1;
  };

  return (
    <div ref={consoleRef} className="maker-console w-full max-w-6xl mx-auto px-4 py-10 space-y-6 min-h-[70vh] text-[#E4E4E7]">
      {/* Console title */}
      <div data-console-section className="border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ffbe18]"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            YOUR PRODUCTS
          </h1>
          <p className="text-zinc-400 text-[10px] mt-1.5 font-mono uppercase tracking-wider">
            Connected account: <span className="text-white font-bold">{userTwitter || "Indie Mode"}</span>
          </p>
        </div>
      </div>

      <div data-console-section className="grid grid-cols-3 gap-3">
        {[
          ["Products", ownershipStatus === "ready" ? totalMyProducts : "—"],
          ["Discovery views", ownershipStatus === "ready" && trackedProducts.length ? recordedViews.toLocaleString() : "—"],
          ["Votes", ownershipStatus === "ready" ? totalVotesCount : "—"],
        ].map(([label, value]) => <div key={label} className="glass-panel console-stat p-3 sm:p-5" title={label === "Discovery views" ? "Card visible for 4 seconds at 70% visibility; not unique visitors." : undefined}>
          <span className="block text-xs text-zinc-400">{label}</span>
          <strong className="mt-2 block text-3xl font-semibold text-white">{value}</strong>
        </div>)}
      </div>

      {/* Main List */}
      <div data-console-section className="glass-panel p-5 md:p-7 space-y-6" aria-busy={ownershipStatus === "loading"}>
        <div className="border-b border-white/[0.05] pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-tight font-sans">
              Product profiles
            </h2>
          </div>
          {onSubmitProductClick && (
            <button
              onClick={onSubmitProductClick}
              className="px-4 py-2.5 bg-[#ffbe18] hover:bg-[#e0a612] text-black font-semibold text-xs rounded transition duration-150 cursor-pointer flex items-center gap-1.5 font-mono uppercase tracking-wider"
            >
              ＋ Submit New Product
            </button>
          )}
        </div>

        <div className="space-y-4">
          {ownershipStatus === "loading" ? (
            <div role="status" className="space-y-3 py-6"><span className="text-sm text-zinc-400">Loading your products…</span><div className="h-24 rounded-xl bg-white/[0.04] animate-pulse" /></div>
          ) : ownershipStatus === "error" ? (
            <div role="alert" className="py-10 text-center"><p className="text-sm text-zinc-300">Your products couldn&apos;t load.</p><button type="button" onClick={onRetryOwnership} className="mt-3 rounded-lg border border-white/15 px-4 text-sm text-white">Retry</button></div>
          ) : myProducts.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              No products linked to this account.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] text-left">
              {myProducts.map(p => {
                const pushed = isPushed(p);
                return (
                  <div key={p.id} className="py-6 flex flex-col gap-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-md bg-[#141417] border border-white/[0.06] flex items-center justify-center text-3xl shrink-0">
                        {renderLogo(p.logo, "w-10 h-10")}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-base leading-tight">
                            {p.title}
                          </span>
                          {hasActiveDiscoveryBoost(p) ? (
                            <span className="rounded border border-[#A78BFA]/20 bg-[#A78BFA]/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#A78BFA]">
                              Peer contributor
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{p.tagline}</p>
                        <p className="mt-2 text-xs text-zinc-400">Recorded discovery views: <strong className="text-zinc-200">{typeof p.qualifiedImpressions === "number" ? p.qualifiedImpressions.toLocaleString() : "—"}</strong> · Community votes: {p.votesCount || 0}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {onEditProduct && (
                        <button
                          onClick={() => onEditProduct(p)}
                          className="py-1.5 px-3 border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] text-zinc-350 hover:text-white font-semibold text-[10px] rounded transition duration-150 cursor-pointer font-mono flex items-center gap-1.5"
                        >
                          ✎ Edit Profile
                        </button>
                      )}
                      <Link
                        href={`/products/${encodeURIComponent(p.id)}`}
                        className="py-1.5 px-3 border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] text-zinc-350 hover:text-white font-semibold text-[10px] rounded transition duration-150 cursor-pointer font-mono flex items-center gap-1.5"
                      >
                        View profile →
                      </Link>
                      <ShareProductButton url={absoluteUrl(`/products/${encodeURIComponent(p.id)}`)} />
                      {onExportCsv && (p.queueStatus === "active" || p.queueStatus === "completed") && (
                        <button
                          onClick={() => onExportCsv(p)}
                          className="py-1.5 px-3 border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] text-zinc-350 hover:text-white font-semibold text-[10px] rounded transition duration-150 cursor-pointer font-mono flex items-center gap-1"
                        >
                          📥 Export CSV
                        </button>
                      )}
                      {p.queueStatus === "active" ? (
                        <span className="px-3 py-1 border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[10px] uppercase tracking-wider rounded font-bold animate-pulse">
                          Live Duel ⚔️
                        </span>
                      ) : p.queueStatus === "completed" ? (
                        <span className="px-3 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] uppercase tracking-wider rounded font-bold">
                          Completed 🏆
                        </span>
                      ) : !pushed ? (
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 border border-zinc-700 bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-wider rounded">
                            Showcase 👁️
                          </span>
                          <button
                            onClick={() => { setQueueError(""); setSelectedProductForPush(p); }}
                            className="py-1.5 px-4 bg-white hover:bg-zinc-200 text-black font-semibold text-[11px] rounded transition duration-150 cursor-pointer"
                          >
                            Join Arena
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-mono text-[10px] uppercase tracking-wider rounded flex items-center gap-1 font-bold">
                            Queued ⏳
                          </span>
                          {(() => {
                            const pos = getQueuePosition(p.id);
                            if (pos <= 0) return null;
                            return arenaIsLive ? (
                              <span className="px-2 py-1 border border-[#A78BFA]/15 bg-[#A78BFA]/[0.04] text-[#A78BFA] font-mono text-[9px] uppercase tracking-wider rounded">
                                Next in line · Priority #{pos}
                              </span>
                            ) : (
                              <span className="px-2 py-1 border border-white/[0.06] bg-white/[0.02] text-zinc-400 font-mono text-[9px] uppercase tracking-wider rounded">
                                #{pos} in line
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {ownershipStatus === "ready" && myProducts.length > 0 && <details data-console-section className="glass-panel p-4">
        <summary className="cursor-pointer py-2 text-sm text-zinc-300">Arena overview · {liveDuelsCount} active · {queuedCount} queued · {completedCount} completed</summary>
        <div className="mt-4">
      {/* Arena Status Bar */}
      <div className="bg-[#0b0b0d] border border-white/[0.06] rounded-md p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {arenaIsLive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                Arena is <span className="text-amber-400 font-bold">LIVE</span>
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                Arena is <span className="text-zinc-300 font-bold">IDLE</span>
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Queue: <span className="text-white font-bold">{globalQueueCount}</span>
            {!arenaIsLive && dailyRosterSize ? (
              <> · Daily auto-run: <span className="text-[#A78BFA] font-bold">{dailyRosterSize}</span> in <span className="text-zinc-300 font-bold"><DailyArenaRunCountdown /></span></>
            ) : (
              <> · <span className="text-zinc-300">16 locks automatically</span></>
            )}
          </span>
          {/* Mini progress bar */}
          <div className="w-24 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min((globalQueueCount / queueGoal) * 100, 100)}%`,
                backgroundColor: globalQueueCount >= queueGoal ? '#34d399' : '#a78bfa'
              }}
            />
          </div>
          {globalQueueCount >= 16 && !arenaIsLive ? (
            <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider animate-pulse">
              Auto-lock ready
            </span>
          ) : !arenaIsLive && dailyRosterSize ? (
            <span className="text-[9px] font-mono text-[#A78BFA] font-bold uppercase tracking-wider">
              Daily run secured
            </span>
          ) : null}
        </div>
      </div>


        </div>
      </details>}
      {/* Enter the Arena Benefit Confirmation Modal */}
      {selectedProductForPush && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="join-arena-title" tabIndex={-1} className="glass-panel max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-6 max-w-md w-full space-y-5 relative">
            {/* Header */}
            <div className="border-b border-white/[0.06] pb-3 text-center">
              <h2 id="join-arena-title" className="text-sm font-black tracking-wider text-white uppercase flex items-center justify-center gap-2 font-mono">
                JOIN THE ARENA
              </h2>
            </div>

            <div className="space-y-3 text-sm leading-6 text-zinc-300">
              <p>Enter <strong className="text-white">{selectedProductForPush.title}</strong> in the next available matchup.</p>
              <p className="text-xs text-zinc-400">Matches start automatically. Once matched, your product stays in the Arena until the run ends.</p>
            </div>

            {/* Actions */}
            {queueError && <p role="alert" className="text-sm text-red-300">{queueError}</p>}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isEnqueuing}
                onClick={() => setSelectedProductForPush(null)}
                className="px-4 py-2 bg-zinc-900 border border-white/[0.08] hover:bg-white/[0.04] text-zinc-350 hover:text-white font-semibold rounded text-[10px] font-mono uppercase tracking-wider cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                disabled={isEnqueuing}
                aria-busy={isEnqueuing}
                onClick={async () => {
                  if (isEnqueuing) return;
                  setIsEnqueuing(true);
                  setQueueError("");
                  try {
                    await onPushToQueue(selectedProductForPush.id);
                    setSelectedProductForPush(null);
                  } catch {
                    setQueueError("Unable to join right now. Please try again.");
                  } finally { setIsEnqueuing(false); }
                }}
                className="px-5 py-2 bg-[#ffbe18] hover:bg-[#ffc634] text-black font-extrabold rounded text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/10 transition"
              >
                {isEnqueuing ? "Joining…" : "Join Arena"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
