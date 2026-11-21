import type { Product, Match, Bracket } from "@/lib/mockData";
import Link from "@/app/components/NavigationLink";
import { publicHttpUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";
import { getArenaFormatName, type BracketSize } from "@/lib/arenaStore";
import { formatToHMS } from "@/lib/timeHelpers";
import ClashSculpture from "@/app/components/ClashSculpture";
import DailyArenaRunCountdown from "@/app/components/DailyArenaRunCountdown";
interface Props {
  bracket: Bracket | null;
  activeMatch: Match | null;
  currentRoundMatches: Match[];
  queuedProducts: Product[];
  lineupProducts: Product[];
  rosterTarget: BracketSize;
  fallbackBracketSize: number | null;
  activeBracketSize: BracketSize;
  activeRoundNum: number;
  activeRoundRemainingMs: number;
  countdownToMidnightMs: number;
  currentSeasonStr: string;
  activeMatchCritiques: Array<{ id: string; voter: string; provider: string; role: string; text: string; date: string }>;
  renderLogo: (logo: string, className?: string) => React.ReactNode;
  synthClick: (frequency?: number, type?: OscillatorType, duration?: number) => void;
  setActiveMatch: (match: Match) => void;
  setActiveCardProduct: (product: Product) => void;
  pushToast: (message: string, type: "info") => void;
  onVote: (match: Match, product: Product) => void;
}

export default function ArenaBoard({
  bracket,
  activeMatch,
  currentRoundMatches,
  queuedProducts,
  lineupProducts,
  rosterTarget,
  fallbackBracketSize,
  activeBracketSize,
  activeRoundNum,
  activeRoundRemainingMs,
  countdownToMidnightMs,
  currentSeasonStr,
  activeMatchCritiques,
  renderLogo,
  synthClick,
  setActiveMatch,
  setActiveCardProduct,
  pushToast,
  onVote
}: Props) {
  return (
    <section id="arena-section" className="scroll-mt-32 py-10 md:py-14 relative">

      <div data-home-reveal="arena-heading" data-route-enter="left" className="exhibition-route-heading exhibition-arena-heading mb-10 flex flex-col gap-5">
        <div>
          <p className="exhibition-kicker mb-5">The independent arena</p>
          <h1 className="text-zinc-950">
            ARENA · PRODUCT BATTLES
          </h1>
          <p className="text-sm text-zinc-600 mt-3">
            Two products. Honest feedback. Your vote.
          </p>
          <Link href="/champions#how-it-works-section" className="mt-4 inline-flex min-h-8 items-center gap-2 text-xs font-medium text-violet-700 hover:text-violet-900">How it works <span aria-hidden="true">↗</span></Link>
        </div>
        {bracket && bracket.status === "active" && (
          <div className="flex shrink-0">
            <span className="bg-white border border-zinc-200/90 shadow-2xs px-3.5 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffbe18] animate-pulse inline-block" />
              Round Closes In: <span className="text-zinc-950 font-semibold">{formatToHMS(activeRoundRemainingMs)}</span>
            </span>
          </div>
        )}
        <ClashSculpture variant="arena" />
      </div>

      {/* Arena Queue Status Bar */}
      <div data-home-reveal="arena-status" data-route-enter="up" style={{ "--route-delay": "70ms" } as React.CSSProperties} className="mb-8 bg-white border border-zinc-200/80 shadow-xs rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            {bracket && activeBracketSize < 16 ? "Adaptive Run" : <>Season <span className="text-zinc-950 font-bold">{currentSeasonStr}</span></>}
          </span>
          {bracket ? (
            <>
              <span className="text-zinc-300">|</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-violet-700 font-semibold">{getArenaFormatName(activeBracketSize)}</span>
            </>
          ) : null}
          <span className="text-zinc-300">|</span>
          {bracket && (bracket.status === "active" || bracket.status === "preparing") ? (
            <span className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1.5 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
              LIVE
            </span>
          ) : (
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
              Accepting entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Queue: <span className="text-zinc-950 font-bold">{queuedProducts.length}</span>
            {!bracket && queuedProducts.length >= 16 ? (
              <> <span className="text-zinc-300">|</span> <span className="font-bold text-emerald-700">Locking championship</span></>
            ) : !bracket && fallbackBracketSize ? (
              <> <span className="text-zinc-300">|</span> Daily auto-run: <span className="font-bold text-violet-700">{fallbackBracketSize} players</span> <span className="font-bold text-zinc-700"><DailyArenaRunCountdown /></span></>
            ) : !bracket ? (
              <> <span className="text-zinc-300">|</span> Daily minimum: <span className="font-bold text-zinc-700">2 players</span></>
            ) : (
              <> <span className="text-zinc-300">|</span> Next full run starts at <span className="font-bold text-zinc-700">16</span></>
            )}
            {!bracket && queuedProducts.length > rosterTarget && (
              <>
                {" "}<span className="text-zinc-300">|</span>{" "}
                FIFO carryover: <span className="text-amber-700 font-bold">+{queuedProducts.length - rosterTarget}</span> first in the next run
              </>
            )}
          </span>
          <div className="w-20 h-1.5 bg-zinc-100 border border-zinc-200/60 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min((queuedProducts.length / (bracket ? 16 : rosterTarget)) * 100, 100)}%`,
                backgroundColor: queuedProducts.length >= (bracket ? 16 : rosterTarget) ? '#059669' : '#7c3aed'
              }}
            />
          </div>
        </div>
      </div>

      {bracket && bracket.status === "active" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: Matchup Slate (Grid of matches) */}
          <div data-home-reveal="arena-slate" data-route-enter="left" style={{ "--route-delay": "140ms" } as React.CSSProperties} className="lg:col-span-5 space-y-4">
            <div className="bg-white border border-zinc-200/80 shadow-xs p-4 rounded-xl">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-semibold">
                MATCH SLATE // ROUND STATUS
              </span>
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-xs font-mono font-bold text-zinc-950 uppercase">
                  {activeRoundNum === 1 ? "Round of 16" : activeRoundNum === 2 ? "Quarterfinals" : activeRoundNum === 3 ? "Semifinals" : "Grand Finals"}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {currentRoundMatches.filter(m => !m.winnerId).length} Active Duels
                </span>
              </div>
            </div>

            <div className="space-y-3 max-h-[70vh] lg:max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
              {currentRoundMatches.map((duel) => {
                const isDuelActive = !duel.winnerId && activeRoundRemainingMs > 0;
                const awaitingSettlement = !duel.winnerId && activeRoundRemainingMs <= 0;
                const isSelected = activeMatch?.id === duel.id;
                const sumVotes = duel.votesA + duel.votesB;
                const ratioA = sumVotes > 0 ? Math.round((duel.votesA / sumVotes) * 100) : 50;
                const ratioB = sumVotes > 0 ? 100 - ratioA : 50;

                return (
                  <div
                    key={duel.id}
                    onClick={() => {
                      synthClick(250, "sine", 0.05);
                      setActiveMatch(duel);
                      pushToast(`Inspecting matchup: ${duel.productA.title} vs ${duel.productB.title}`, "info");
                    }}
                    className={`p-4 bg-white border rounded-xl cursor-pointer transition-[background-color,border-color,box-shadow,translate] duration-200 text-left hover:border-zinc-300 hover:bg-zinc-50/80 hover:-translate-y-0.5 match-card-item ${
                      isSelected ? "border-zinc-900 bg-zinc-50/90 shadow-xs ring-1 ring-zinc-900/10" : "border-zinc-200/80 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3 text-[9px] font-mono text-zinc-500">
                      <span>MATCH ID: {duel.id.slice(0, 8)}</span>
                      {isDuelActive ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1 uppercase tracking-wider font-semibold">
                          <span className="w-1 h-1 rounded-full bg-emerald-600 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="text-zinc-600 bg-zinc-100 border border-zinc-200 px-1.5 py-0.2 rounded uppercase tracking-wider font-medium">
                          {awaitingSettlement ? "Awaiting settlement" : "Concluded"}
                        </span>
                      )}
                    </div>

                    {/* Versus Symmetrical Lineup */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-base shrink-0">{renderLogo(duel.productA?.logo, "w-5 h-5")}</span>
                        <span className={`text-xs truncate ${isSelected ? "text-zinc-950 font-bold" : "text-zinc-800 font-semibold"}`}>
                          {duel.productA?.title || "Pending"}
                        </span>
                      </div>

                      <span className="text-[10px] font-mono font-semibold text-zinc-400 shrink-0 px-2">VS</span>

                      <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
                        <span className={`text-xs truncate ${isSelected ? "text-zinc-950 font-bold" : "text-zinc-800 font-semibold"}`}>
                          {duel.productB?.title || "Pending"}
                        </span>
                        <span className="text-base shrink-0">{renderLogo(duel.productB?.logo, "w-5 h-5")}</span>
                      </div>
                    </div>

                    {/* Settle status preview / Score slider */}
                    <div className="mt-3.5 space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                        <span>{ratioA}% ({duel.votesA}v)</span>
                        <span>{duel.votesB}v ({ratioB}%)</span>
                      </div>
                      <div className="h-1 bg-zinc-100 border border-zinc-200/60 w-full rounded-full overflow-hidden flex">
                        <div className="bg-zinc-900 h-full transition-all duration-500 ease-out" style={{ width: `${ratioA}%` }} />
                        <div className="bg-zinc-200 h-full flex-1" />
                      </div>
                    </div>

                    {/* Winner stamp if concluded */}
                    {!isDuelActive && duel.winnerId && (
                      <div className="mt-2 text-[9px] font-mono text-center text-violet-700 bg-violet-50 border border-violet-200/80 py-0.5 rounded uppercase tracking-wider font-semibold">
                        Winner: {duel.winnerId === duel.productA?.id ? (duel.productA?.title || "Pending") : (duel.productB?.title || "Pending")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Combat Inspector Panel (Sticky) */}
          <div data-home-reveal="arena-inspector" data-route-enter="right" style={{ "--route-delay": "220ms" } as React.CSSProperties} className="lg:col-span-7 lg:sticky lg:top-20 space-y-4">
            {activeMatch ? (
              (() => {
                const duel = activeMatch;
                const isDuelActive = !duel.winnerId && activeRoundRemainingMs > 0;
                const awaitingSettlement = !duel.winnerId && activeRoundRemainingMs <= 0;
                const sumVotes = duel.votesA + duel.votesB;
                const ratioA = sumVotes > 0 ? Math.round((duel.votesA / sumVotes) * 100) : 50;
                const ratioB = sumVotes > 0 ? 100 - ratioA : 50;


                return (
                  <div className="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shadow-xs p-6 md:p-8 space-y-6 inspector-panel">

                    {/* Title Bar */}
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-4 inspector-title">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-wider font-semibold bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded text-zinc-700">
                          ROUND {activeRoundNum} {"//"} BATTLE INSPECTOR
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {duel.productA && duel.productB ? (
                          <a
                            href={`/versus/${duel.productA.id}-vs-${duel.productB.id}`}
                            className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 transition hover:text-zinc-950 font-medium"
                          >
                            Public matchup ↗
                          </a>
                        ) : null}
                        {isDuelActive ? (
                          <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            DECISION OPEN
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded uppercase tracking-wider font-medium">
                            {awaitingSettlement ? "AWAITING SETTLEMENT" : "CONCLUDED"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Interactive Duel Clash Head to Head */}
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">

                      {/* Product A block */}
                      <div className="md:col-span-3 p-4 bg-zinc-50/70 border border-zinc-200/80 rounded-xl text-left flex flex-col justify-between min-h-[160px] inspector-card-a">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-base">{renderLogo(duel.productA?.logo, "w-6 h-6")}</span>
                            <span className="text-[9px] font-mono text-zinc-500">{duel.productA?.makerTwitter}</span>
                          </div>
                          <h3 className="truncate text-base font-bold text-zinc-950">
                            {duel.productA ? <a href={`/products/${duel.productA.id}`} className="transition hover:text-violet-700">{duel.productA.title}</a> : "Pending"}
                          </h3>
                          <p className="text-[11px] text-zinc-600 line-clamp-2 mt-1 leading-relaxed">{duel.productA?.tagline}</p>
                        </div>
                        <div className="mt-4 space-y-2">
                          {publicHttpUrl(duel.productA?.url) && (
                            <a
                              href={publicHttpUrl(duel.productA?.url)}
                              target="_blank"
                              rel={productLinkRel(duel.productA!)}
                              className="w-full py-1.5 px-3 text-[10px] font-bold rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-950 transition-all text-center flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer shadow-2xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Visit Demo 🔗
                            </a>
                          )}
                          <button
                            onClick={() => {
                              onVote(duel, duel.productA);
                            }}
                            disabled={!isDuelActive || !duel.productA}
                            className={`w-full py-2 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer uppercase tracking-wider ${
                              !isDuelActive
                              ? duel.winnerId === duel.productA?.id
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed"
                                : "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                              : !duel.productA
                                ? "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs active:scale-[0.99]"
                            }`}
                          >
                            {duel.winnerId === duel.productA?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR A" : awaitingSettlement ? "VOTING CLOSED" : "DEFEATED"}
                          </button>
                        </div>
                      </div>

                      {/* VS center block */}
                      <div className="md:col-span-1 flex flex-col items-center justify-center py-2 inspector-vs">
                        <span className="text-zinc-400 font-mono tracking-widest text-[9px] uppercase font-bold">VS</span>
                        <div className="flex flex-col items-center mt-2 leading-tight">
                          <span className="font-mono font-bold text-lg text-zinc-950">{ratioA}%</span>
                          <span className="font-mono font-semibold text-zinc-500 text-[10px]">{ratioB}%</span>
                        </div>
                        <span className="text-[8px] font-mono text-zinc-500 mt-2 uppercase tracking-widest">{sumVotes} Voted</span>
                      </div>

                      {/* Product B block */}
                      <div className="md:col-span-3 p-4 bg-zinc-50/70 border border-zinc-200/80 rounded-xl text-left flex flex-col justify-between min-h-[160px] inspector-card-b">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-base">{renderLogo(duel.productB?.logo, "w-6 h-6")}</span>
                            <span className="text-[9px] font-mono text-zinc-500">{duel.productB?.makerTwitter}</span>
                          </div>
                          <h3 className="truncate text-base font-bold text-zinc-950">
                            {duel.productB ? <a href={`/products/${duel.productB.id}`} className="transition hover:text-violet-700">{duel.productB.title}</a> : "Pending"}
                          </h3>
                          <p className="text-[11px] text-zinc-600 line-clamp-2 mt-1 leading-relaxed">{duel.productB?.tagline}</p>
                        </div>
                        <div className="mt-4 space-y-2">
                          {publicHttpUrl(duel.productB?.url) && (
                            <a
                              href={publicHttpUrl(duel.productB?.url)}
                              target="_blank"
                              rel={productLinkRel(duel.productB!)}
                              className="w-full py-1.5 px-3 text-[10px] font-bold rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-950 transition-all text-center flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer shadow-2xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Visit Demo 🔗
                            </a>
                          )}
                          <button
                            onClick={() => {
                              onVote(duel, duel.productB);
                            }}
                            disabled={!isDuelActive || !duel.productB}
                            className={`w-full py-2 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer uppercase tracking-wider ${
                              !isDuelActive
                              ? duel.winnerId === duel.productB?.id
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed"
                                : "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                              : !duel.productB
                                ? "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs active:scale-[0.99]"
                            }`}
                          >
                            {duel.winnerId === duel.productB?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR B" : awaitingSettlement ? "VOTING CLOSED" : "DEFEATED"}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Symmetrical Tug of War Slider bar */}
                    <div className="space-y-1.5">
                      <div className="h-1.5 bg-zinc-100 border border-zinc-200/60 w-full rounded-full overflow-hidden flex">
                        <div className="bg-zinc-900 h-full transition-all duration-500 ease-out" style={{ width: `${ratioA}%` }} />
                        <div className="bg-zinc-200 h-full flex-1" />
                      </div>
                    </div>

                    {/* Peer Critiques chronicles */}
                    <div className="pt-4 border-t border-zinc-200/80 space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-200/60 pb-2">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 font-semibold">
                          PEER CRITIQUE CHRONICLES ({activeMatchCritiques.length})
                        </h4>
                        <span className="text-[8px] font-mono text-zinc-500 uppercase">
                          verified feedback stream
                        </span>
                      </div>

                      {/* Comments list inside inspector */}
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                        {activeMatchCritiques.map((c) => {
                          const isProductA = c.role.includes(duel.productA.title) || c.text.toLowerCase().includes(duel.productA.title.toLowerCase());
                          const badgeColor = isProductA
                            ? "bg-zinc-900 text-white border border-zinc-900"
                            : "bg-white text-zinc-700 border border-zinc-200 shadow-2xs";
                          const auditedName = isProductA ? duel.productA.title : duel.productB.title;
                          return (
                            <div
                              key={c.id}
                              className="p-3 bg-zinc-50 border border-zinc-200/80 hover:border-zinc-300 transition duration-150 rounded-xl text-left space-y-1"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono font-bold text-zinc-950">{c.voter}</span>
                                  <span className={`text-[8px] font-mono uppercase px-1.5 py-0.2 rounded ${badgeColor}`}>
                                    audited {auditedName}
                                  </span>
                                </div>
                                <span className="text-[9px] text-zinc-400 font-mono">{c.date}</span>
                              </div>
                              <p className="text-[11px] text-zinc-600 leading-relaxed pl-1">
                                {c.text}
                              </p>
                            </div>
                          );
                        })}

                        {activeMatchCritiques.length === 0 && (
                          <div className="p-6 text-center text-zinc-500 font-mono text-[10px] border border-dashed border-zinc-200 rounded-xl">
                            [ No verified peer critiques enqueued for this matchup. ]
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })()
            ) : (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-12 text-center text-zinc-500 font-mono text-xs shadow-xs">
                [ SELECT A MATCHUP FROM THE LEFT SLATE TO INSPECT ]
              </div>
            )}
          </div>

        </div>
      ) : (
        /* ========================================================
            WAITLIST QUEUE PREPARING SCREEN
           ======================================================== */
        <div data-home-reveal="arena-queue" data-route-enter="up" style={{ "--route-delay": "140ms" } as React.CSSProperties} className="bg-white border border-zinc-200/90 shadow-sm p-8 sm:p-12 text-zinc-950 text-center max-w-2xl mx-auto rounded-2xl">

          {/* Sleek countdown timer pill */}
          {lineupProducts.length >= 16 && (
            <div className="flex justify-center mb-6">
              <span className="bg-zinc-50 border border-zinc-200/90 px-3.5 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Cycle Closes: <span className="text-zinc-950 font-semibold">{formatToHMS(countdownToMidnightMs)}</span>
              </span>
            </div>
          )}

          <div className="inline-block relative w-36 h-36 mb-6">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="62"
                stroke="#f4f4f5"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r="62"
                stroke="#18181b"
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={390}
                strokeDashoffset={390 - (390 * Math.min(lineupProducts.length, rosterTarget)) / rosterTarget}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col justify-center items-center">
              {bracket?.status === "preparing" ? (
                <>
                  <span className="text-xl font-bold text-zinc-950 font-mono tracking-tight">{formatToHMS(countdownToMidnightMs)}</span>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Starts In</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-zinc-950">{Math.min(lineupProducts.length, rosterTarget)} / {rosterTarget}</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Ready</span>
                </>
              )}
            </div>
          </div>

          <h2 className="text-lg sm:text-xl font-sans font-semibold tracking-tight uppercase mb-3 text-zinc-950">
            {bracket?.status === "preparing" ? `${getArenaFormatName(activeBracketSize)} Ready` : "Assembling Next Arena"}
          </h2>
          <p className="text-xs text-zinc-600 max-w-md mx-auto leading-relaxed">
            Sixteen products lock a Championship roster immediately, with voting opening at the next New York midnight. The daily cutoff also starts the largest ready 8, 4, or 2-product run automatically.
          </p>
          <p className="mt-3 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
            Tie rule: the higher verified vote total wins, and every vote contains two critiques. A tied count advances the earlier submission; exact timestamp ties use a stable product-ID decision. Zero-vote matches still advance.
          </p>

          {/* Roster Slots Grid (Street Fighter style character select) */}
          <div className="mt-8 pt-6 border-t border-zinc-200/80 max-w-md mx-auto">
            <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-4 font-semibold">
              Roster Lineup ({Math.min(lineupProducts.length, rosterTarget)} / {rosterTarget})
            </span>
            <div className={`grid gap-2.5 justify-center ${rosterTarget >= 8 ? "grid-cols-[repeat(4,2.75rem)] sm:grid-cols-[repeat(8,2.75rem)]" : rosterTarget === 4 ? "grid-cols-[repeat(4,2.75rem)]" : "grid-cols-[repeat(2,2.75rem)]"}`}>
              {Array.from({ length: rosterTarget }).map((_, idx) => {
                const prod = lineupProducts[idx];
                if (prod) {
                  return (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.preventDefault();
                        synthClick(300, "sine", 0.05);
                        setActiveCardProduct(prod);
                      }}
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-lg select-none border transition-all duration-300 bg-white border-zinc-200/90 text-zinc-900 shadow-2xs hover:scale-105 cursor-pointer hover:border-violet-400 hover:shadow-xs"
                      title={prod.title}
                    >
                      {renderLogo(prod.logo, "w-7 h-7 object-contain")}
                    </button>
                  );
                }
                return (
                  <div
                    key={idx}
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-lg select-none border transition-all duration-300 bg-zinc-50 border-dashed border-zinc-200 text-zinc-400"
                    title="Empty Slot"
                  >
                    <span className="text-[10px] font-mono font-light opacity-50">?</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
