import type { Product } from "@/lib/mockData";
import Link from "@/app/components/NavigationLink";
import { publicHttpUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";

interface Props {
  pastChampions: Product[];
  renderLogo: (logo: string, className?: string) => React.ReactNode;
}

export default function ChampionsSection({
  pastChampions,
  renderLogo
}: Props) {
  return (
    <>
    {/* THE HALL OF VALOR — HISTORIC CHAMPIONS */}
    <section id="champions-section" className="scroll-mt-32 py-10 md:py-14">
      <div data-home-reveal="champions-heading" data-route-enter="left" className="exhibition-route-heading exhibition-champions-heading mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="text-left">
          <p className="exhibition-kicker mb-5">Hall of Valor</p>
          <h1 className="text-zinc-950">
            Champions
          </h1>
          <p className="text-sm text-zinc-600 mt-3">
            Meet the products that won their Arena runs.
          </p>
        </div>
        <Link href="/arena" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900">Explore the Arena <span aria-hidden="true">→</span></Link>
      </div>

      {pastChampions && pastChampions.length > 0 ? (
        <div className="exhibition-champions-grid">
          {pastChampions.map((c, idx) => (
            <div
              key={c.id}
              data-home-reveal={`champion-${c.id}`}
              data-route-enter="up"
              style={{ "--route-delay": `${140 + (idx % 4) * 70}ms` } as React.CSSProperties}
              className="exhibition-champion border hover:border-zinc-300 hover:-translate-y-1 transition-[background-color,border-color,box-shadow,translate] duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-2xl flex items-center justify-center">
                    {renderLogo(c.logo, "w-8 h-8")}
                  </span>
                  <span className="border border-zinc-200 text-[9px] font-mono px-2 py-0.5 uppercase bg-zinc-100 text-zinc-700 rounded tracking-wider font-semibold">
                    SEASON {String(idx + 1).padStart(2, "0")}
                  </span>
                </div>
                <Link
                  href={`/products/${encodeURIComponent(c.id)}`}
                  className="font-sans text-xs hover:underline uppercase block mb-1 text-zinc-950 font-bold tracking-wide hover:text-violet-700 transition"
                >
                  {c.title}
                </Link>
                <p className="text-[10px] leading-relaxed line-clamp-2 mb-4 text-zinc-600 font-sans">{c.tagline}</p>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-200/80 pt-3.5 text-[10px] font-mono text-zinc-500">
                <div className="flex items-center space-x-2">
                  <img src={c.makerAvatar} alt="Maker" className="w-5 h-5 border border-zinc-200 rounded-md shrink-0 object-cover" />
                  <a
                    href={`https://x.com/${c.makerTwitter.replace(/^@/, "")}`}
                    target="_blank"
                    rel="ugc noopener noreferrer"
                    className="hover:underline font-semibold text-zinc-600 hover:text-zinc-950"
                  >
                    {c.makerTwitter}
                  </a>
                </div>
                {publicHttpUrl(c.url) ? (
                  <a
                    href={publicHttpUrl(c.url)}
                    target="_blank"
                    rel={productLinkRel(c)}
                    className="text-[10px] uppercase font-mono underline text-zinc-900 hover:text-violet-700 font-semibold transition-colors"
                  >
                    DEMO
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div data-home-reveal="champions-empty" data-route-enter="up" style={{ "--route-delay": "140ms" } as React.CSSProperties} className="exhibition-champions-empty border p-10 sm:p-16 text-center text-zinc-500 font-mono text-xs mx-auto flex flex-col items-center justify-center space-y-3">
          <svg className="w-8 h-8 text-zinc-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
          </svg>
          <span>[ NO CHAMPION HAS CONQUERED THE ARENA YET ]</span>
          <span className="text-[10px] text-zinc-600">Be the first to claim eternal glory and enter the Hall of Valor!</span>
        </div>
      )}
    </section>

    {/* HOW IT WORKS SECTION */}
    <section id="how-it-works-section" className="scroll-mt-32 py-12 md:py-16 border-t border-zinc-200/80">
      <div data-home-reveal="how-heading" data-route-enter="left" className="mb-12">
        <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-zinc-950 border-l-2 border-zinc-950 pl-4 font-sans">
          HOW IT WORKS
        </h2>
        <p className="text-xs text-zinc-600 mt-2 font-sans">
          Free to launch. Fair discovery. Optional battles for useful feedback.
        </p>
      </div>

      <div data-home-reveal="how-steps" className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Step 1 */}
        <div data-route-enter="up" style={{ "--route-delay": "140ms" } as React.CSSProperties} className="bg-white border border-zinc-200/90 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-300 shadow-xs transition-colors duration-200">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-4xl font-extrabold font-mono text-zinc-300">01</span>
              <span className="text-[9px] font-mono text-zinc-400 tracking-wider">STEP_01</span>
            </div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-950 mb-3 font-semibold">
              PUBLISH YOUR PRODUCT
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed font-sans font-medium">
              Submit for free and get a permanent product page. Latest Launches highlights new arrivals; fair discovery gives overlooked products another chance to be seen.
            </p>
          </div>
          <div className="mt-8 pt-4 border-t border-zinc-100 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
            [ STAGE_1 : $0 FEE ]
          </div>
        </div>

        {/* Step 2 */}
        <div data-route-enter="up" style={{ "--route-delay": "210ms" } as React.CSSProperties} className="bg-white border border-zinc-200/90 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-300 shadow-xs transition-colors duration-200">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-4xl font-extrabold font-mono text-zinc-300">02</span>
              <span className="text-[9px] font-mono text-zinc-400 tracking-wider">STEP_02</span>
            </div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-950 mb-3 font-semibold">
              JOIN THE ARENA
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed font-sans font-medium">
              Opt in from Dashboard. Sixteen products lock a Championship roster; otherwise the daily cutoff starts the largest ready 8, 4, or 2-product run. Earlier queue entries go first.
            </p>
          </div>
          <div className="mt-8 pt-4 border-t border-zinc-100 text-[9px] font-mono text-emerald-700 uppercase tracking-widest font-semibold">
            [ OPTIONAL · FREE TO ENTER ]
          </div>
        </div>

        {/* Step 3 */}
        <div data-route-enter="up" style={{ "--route-delay": "280ms" } as React.CSSProperties} className="bg-white border border-zinc-200/90 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-300 shadow-xs transition-colors duration-200">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-4xl font-extrabold font-mono text-zinc-300">03</span>
              <span className="text-[9px] font-mono text-zinc-400 tracking-wider">STEP_03</span>
            </div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-950 mb-3 font-semibold">
              LEARN FROM EVERY MATCH
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed font-sans font-medium">
              Sign in and leave feedback for both products before voting. Winners advance, and every maker keeps their product page and the feedback they received.
            </p>
          </div>
          <div className="mt-8 pt-4 border-t border-zinc-100 text-[9px] font-mono text-violet-700 uppercase tracking-widest font-semibold">
            [ DUAL CRITIQUE FEEDBACK ]
          </div>
        </div>

      </div>
    </section>
    </>
  );
}
