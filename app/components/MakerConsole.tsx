import React from 'react';
import { Product } from "@/lib/mockData";

interface MakerConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  userTwitter: string;
  userSubId: string;
  onPushToQueue: (productId: string) => void;
  renderLogo: (logo: string, className?: string) => React.ReactNode;
  onExportCsv?: (product: Product) => void;
  onSubmitProductClick?: () => void;
}

export default function MakerConsole({
  isOpen,
  onClose,
  products,
  userTwitter,
  userSubId,
  onPushToQueue,
  renderLogo,
  onExportCsv,
  onSubmitProductClick
}: MakerConsoleProps) {
  if (!isOpen) return null;

  const isProductOwner = (p: Product) => {
    if (typeof window !== "undefined") {
      try {
        const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
        if (myIds.includes(p.id)) return true;
      } catch (e) {}
    }
    if (p.makerAvatar && p.makerAvatar.includes("#")) {
      try {
        const hash = p.makerAvatar.split("#")[1];
        const params = new URLSearchParams(hash);
        const creator = params.get("creator");
        const uid = params.get("uid");
        if (userSubId && uid && uid === userSubId) return true;
        if (userTwitter && creator && creator.replace(/^@/, "").toLowerCase() === userTwitter.replace(/^@/, "").toLowerCase()) return true;
      } catch (e) {}
    }
    if (userSubId && (p as any).creator_uid && (p as any).creator_uid === userSubId) {
      return true;
    }
    return false;
  };

  const isPushed = (p: Product) => {
    if (!p.makerAvatar) return true;
    if (p.makerAvatar.includes("pushed=false")) return false;
    return true;
  };

  const myProducts = products.filter(isProductOwner);

  // Compute Stats for Premium Dashboard Look
  const totalMyProducts = myProducts.length;
  const liveDuelsCount = myProducts.filter(p => p.queueStatus === "active").length;
  const completedCount = myProducts.filter(p => p.queueStatus === "completed").length;
  const queuedCount = myProducts.filter(p => p.queueStatus === "waiting" && isPushed(p)).length;
  const totalVotesCount = myProducts.reduce((acc, p) => acc + (p.votesCount || 0), 0);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-12 animate-fade-in-blur space-y-8 min-h-[70vh] text-[#E4E4E7]">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ffbe18]"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            MAKER CONTROL CENTER
          </h1>
          <p className="text-zinc-400 text-[10px] mt-1.5 font-mono uppercase tracking-wider">
            Connected account: <span className="text-white font-bold">{userTwitter || "Indie Mode"}</span>
          </p>
        </div>
        
        <button 
          onClick={onClose}
          className="px-5 py-2.5 bg-zinc-900 border border-white/[0.08] hover:bg-white/[0.04] text-white font-semibold rounded-md transition duration-150 cursor-pointer text-xs flex items-center gap-2 self-start sm:self-auto font-mono uppercase tracking-wider"
        >
          ← Return to Colosseum
        </button>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#0b0b0d] p-4 rounded-md border border-white/[0.06] space-y-1">
          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Total Projects</span>
          <span className="text-2xl font-bold text-white block">{totalMyProducts}</span>
        </div>
        <div className="bg-[#0b0b0d] p-4 rounded-md border border-white/[0.06] space-y-1">
          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Active Duels</span>
          <span className="text-2xl font-bold text-amber-400 block">{liveDuelsCount}</span>
        </div>
        <div className="bg-[#0b0b0d] p-4 rounded-md border border-white/[0.06] space-y-1">
          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Queued Waitlist</span>
          <span className="text-2xl font-bold text-cyan-400 block">{queuedCount}</span>
        </div>
        <div className="bg-[#0b0b0d] p-4 rounded-md border border-white/[0.06] space-y-1">
          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Completed Runs</span>
          <span className="text-2xl font-bold text-emerald-400 block">{completedCount}</span>
        </div>
        <div className="bg-[#0b0b0d] p-4 rounded-md border border-white/[0.06] space-y-1">
          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Accumulated Votes</span>
          <span className="text-2xl font-bold text-purple-400 block">{totalVotesCount}</span>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-[#0b0b0d] border border-white/[0.08] rounded-md p-6 md:p-8 space-y-6">
        <div className="border-b border-white/[0.05] pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-tight font-sans">
              Your Roster
            </h2>
            <span className="text-[10px] font-mono text-zinc-550">{totalMyProducts} entries found</span>
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
          {myProducts.length === 0 ? (
            <div className="py-20 border border-dashed border-white/[0.06] rounded-md text-center text-zinc-550 font-mono">
              [ You have not submitted any projects to Indie-Clash yet. ]
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] text-left">
              {myProducts.map(p => {
                const pushed = isPushed(p);
                return (
                  <div key={p.id} className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-6 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-md bg-[#141417] border border-white/[0.06] flex items-center justify-center text-3xl shrink-0">
                        {renderLogo(p.logo, "w-10 h-10")}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-base leading-tight">
                            {p.title}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{p.tagline}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 self-start md:self-auto shrink-0">
                      <a
                        href={`/reviews/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-3 border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] text-zinc-350 hover:text-white font-semibold text-[10px] rounded transition duration-150 cursor-pointer font-mono flex items-center gap-1.5"
                      >
                        🔗 Reviews Page
                      </a>
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
                            onClick={() => onPushToQueue(p.id)}
                            className="py-1.5 px-4 bg-white hover:bg-zinc-200 text-black font-semibold text-[11px] rounded transition duration-150 cursor-pointer"
                          >
                            Push to Arena 🚀
                          </button>
                        </div>
                      ) : (
                        <span className="px-3 py-1 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-mono text-[10px] uppercase tracking-wider rounded flex items-center gap-1 font-bold">
                          Queued ⏳
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
