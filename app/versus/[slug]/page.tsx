import { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase, DB_PREFIX } from "@/lib/supabaseClient";
import { SEED_PRODUCTS } from "@/lib/mockData";

interface Props {
  params: Promise<{ slug: string }>;
}

// 1. Dynamic Meta Generator (Crucial for pSEO)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parts = slug.split("-vs-");
  if (parts.length !== 2) return {};

  const [slugA, slugB] = parts;

  let titleA = slugA;
  let titleB = slugB;

  if (supabase) {
    const { data: products } = await supabase
      .from(`${DB_PREFIX}products`)
      .select(`${DB_PREFIX}title`)
      .in(`${DB_PREFIX}id`, [slugA, slugB]);

    if (products && products.length >= 2) {
      titleA = (products[0] as any)[`${DB_PREFIX}title`];
      titleB = (products[1] as any)[`${DB_PREFIX}title`];
    }
  } else {
    const pA = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugA.toLowerCase());
    const pB = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugB.toLowerCase());
    if (pA && pB) {
      titleA = pA.title;
      titleB = pB.title;
    }
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  titleA = cap(titleA);
  titleB = cap(titleB);

  return {
    title: `${titleA} vs ${titleB} | Community Comparison & Live Duel on INDIE CLASH`,
    description: `Honest side-by-side comparison of ${titleA} and ${titleB}. Read verified maker critiques, live tournament votes, and deep peer reviews.`,
    openGraph: {
      title: `${titleA} vs ${titleB} — Who Wins this Startup Duel?`,
      description: `Compare ${titleA} and ${titleB} features, ship timeframes, and developer votes. Trade deep peer reviews on INDIE CLASH.`,
      url: `https://www.indieclash.com/versus/${slug}`,
      siteName: "INDIE CLASH",
      images: [
        {
          url: `/api/og/versus?slug=${slug}`,
          width: 1200,
          height: 630,
          alt: `${titleA} vs ${titleB} Startup Duel`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${titleA} vs ${titleB} — Who Wins this Startup Duel?`,
      description: `Compare ${titleA} and ${titleB} features, ship timeframes, and developer votes. Trade deep peer reviews on INDIE CLASH.`,
      images: [`/api/og/versus?slug=${slug}`],
    },
  };
}

// 2. Pre-generate popular matchups at build time (SSG)
export async function generateStaticParams() {
  return [
    { slug: "zenjournal-vs-logocraft" },
    { slug: "quickcron-vs-cardioai" },
    { slug: "typeflow-vs-siteshot" },
  ];
}

export const revalidate = 1800; // Settle cache every 30 minutes in background

const renderLogo = (logoStr: string, className = "w-10 h-10 object-contain") => {
  if (!logoStr) return null;
  const isImg = logoStr.startsWith("data:image") || logoStr.startsWith("http") || logoStr.startsWith("/");
  if (isImg) {
    return <img src={logoStr} alt="Logo" className={`${className} inline-block shrink-0 rounded-md object-contain`} />;
  }
  return <span className="inline-block shrink-0 text-4xl">{logoStr}</span>;
};

export default async function VersusPage({ params }: Props) {
  const { slug } = await params;
  const parts = slug.split("-vs-");
  if (parts.length !== 2) notFound();

  const [slugA, slugB] = parts;

  let productA: any = null;
  let productB: any = null;
  let matchesVotes: any[] = [];

  if (supabase) {
    const { data: pA } = await supabase
      .from(`${DB_PREFIX}products`)
      .select("*")
      .eq(`${DB_PREFIX}id`, slugA)
      .single();

    const { data: pB } = await supabase
      .from(`${DB_PREFIX}products`)
      .select("*")
      .eq(`${DB_PREFIX}id`, slugB)
      .single();

    if (pA && pB) {
      const rawPA = pA as any;
      const rawPB = pB as any;
      productA = {
        id: rawPA[`${DB_PREFIX}id`],
        title: rawPA[`${DB_PREFIX}title`],
        tagline: rawPA[`${DB_PREFIX}tagline`],
        url: rawPA[`${DB_PREFIX}url`],
        shipTimeframe: rawPA[`${DB_PREFIX}ship_timeframe`],
        makerName: rawPA[`${DB_PREFIX}maker_name`],
        makerTwitter: rawPA[`${DB_PREFIX}maker_twitter`],
        makerAvatar: rawPA[`${DB_PREFIX}maker_avatar`],
        logo: rawPA[`${DB_PREFIX}logo`],
        votesCount: rawPA[`${DB_PREFIX}votes_count`],
      };

      productB = {
        id: rawPB[`${DB_PREFIX}id`],
        title: rawPB[`${DB_PREFIX}title`],
        tagline: rawPB[`${DB_PREFIX}tagline`],
        url: rawPB[`${DB_PREFIX}url`],
        shipTimeframe: rawPB[`${DB_PREFIX}ship_timeframe`],
        makerName: rawPB[`${DB_PREFIX}maker_name`],
        makerTwitter: rawPB[`${DB_PREFIX}maker_twitter`],
        makerAvatar: rawPB[`${DB_PREFIX}maker_avatar`],
        logo: rawPB[`${DB_PREFIX}logo`],
        votesCount: rawPB[`${DB_PREFIX}votes_count`],
      };

      const { data: vData } = await supabase
        .from(`${DB_PREFIX}votes`)
        .select("*")
        .in(`${DB_PREFIX}voted_product_id`, [slugA, slugB])
        .limit(10);
      
      if (vData) {
        matchesVotes = vData.map((v: any) => ({
          id: v[`${DB_PREFIX}id`],
          voter: v[`${DB_PREFIX}voter_username`],
          votedId: v[`${DB_PREFIX}voted_product_id`],
          winnerFeedback: v[`${DB_PREFIX}feedback_winner`],
          loserFeedback: v[`${DB_PREFIX}feedback_loser`],
        }));
      }
    }
  }

  if (!productA || !productB) {
    const seedA = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugA.toLowerCase());
    const seedB = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugB.toLowerCase());

    if (!seedA || !seedB) {
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      productA = {
        id: slugA,
        title: capitalize(slugA),
        tagline: "Innovative developer utility shipped in public sprint.",
        url: `https://${slugA}.xyz`,
        shipTimeframe: "48h",
        makerName: "Indie Builder",
        makerTwitter: `@${slugA}_maker`,
        makerAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces",
        logo: "🚀",
        votesCount: 42,
      };

      productB = {
        id: slugB,
        title: capitalize(slugB),
        tagline: "High-performance micro-SaaS created in a 24h sprint.",
        url: `https://${slugB}.xyz`,
        shipTimeframe: "24h",
        makerName: "SaaS Gladiator",
        makerTwitter: `@${slugB}_maker`,
        makerAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces",
        logo: "⚔️",
        votesCount: 37,
      };
    } else {
      productA = seedA;
      productB = seedB;
    }

    matchesVotes = [
      {
        id: "v1",
        voter: "@sam_indie",
        votedId: productA.id,
        winnerFeedback: "Beautiful minimalism! Focuses entirely on lightning fast load speed.",
        loserFeedback: "Features are a bit sparse. Needs a standard CSV download button.",
      },
      {
        id: "v2",
        voter: "@chloe_codes",
        votedId: productB.id,
        winnerFeedback: "The dynamic real-time reporting is incredibly intuitive and gorgeous.",
        loserFeedback: "Mobile viewport has minor horizontal overflows on the leaderboard.",
      },
      {
        id: "v3",
        voter: "@lucas_ship",
        votedId: productA.id,
        winnerFeedback: "Excellent typography and off-white CSS color layout. Restores focus.",
        loserFeedback: "The input box cursor reset delays the flow when typing quickly.",
      }
    ];
  }

  const votesA = productA.votesCount || 0;
  const votesB = productB.votesCount || 0;
  const totalVotes = votesA + votesB || 1;
  const percentA = Math.round((votesA / totalVotes) * 100);
  const percentB = 100 - percentA;

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      {/* 🌌 Background grid and ambient glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0c0c0e] via-[#0B0B0C] to-[#0B0B0C] pointer-events-none" />
      
      {/* ⚔️ Premium header container */}
      <header className="relative border-b border-white/[0.06] py-4 backdrop-blur-md bg-black/20 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2 group">
            <span className="text-2xl font-semibold tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent group-hover:text-zinc-300 transition">
              INDIE CLASH
            </span>
            <span className="text-[10px] font-mono border border-white/[0.08] px-1.5 py-0.5 rounded bg-white/[0.02] text-zinc-400 tracking-wider font-mono uppercase">
              Arena
            </span>
          </a>
          <a 
            href="/"
            className="text-xs border border-white/[0.1] hover:bg-white/[0.04] text-zinc-300 hover:text-white transition px-3.5 py-1.5 rounded-md"
          >
            Enter Arena ➔
          </a>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-12 animate-fade-in-blur">
        {/* H1 SEO Breadcrumbs */}
        <nav className="text-xs text-zinc-500 mb-8 flex items-center gap-2 font-mono">
          <a href="/" className="hover:text-white transition">INDIE CLASH</a>
          <span>/</span>
          <span className="text-zinc-450">VERSUS ARENA</span>
          <span>/</span>
          <span className="text-white font-semibold">{productA.title} vs {productB.title}</span>
        </nav>

        {/* 🏆 Versus Duel Screen Banner */}
        <div className="relative text-center mb-16">
          <div className="inline-block relative mb-4">
            
            <div className="relative bg-[#121215] border border-white/[0.06] px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <span>Season 1 Matchup</span>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-4">
            {productA.title} <span className="text-zinc-500 font-light italic text-3xl md:text-5xl mx-2">vs</span> {productB.title}
          </h1>
          <p className="text-base md:text-lg text-zinc-450 max-w-2xl mx-auto font-light leading-relaxed">
            A battle of minimalist execution. Read authentic peer critiques, see the builder community votes, and analyze their scores.
          </p>
        </div>

        {/* ⚡ Dynamic Clash Split Meter */}
        <div className="relative bg-[#121215]/80 border border-white/[0.06] p-8 rounded-xl mb-16 overflow-hidden backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
          
          <div className="flex justify-between items-end mb-4 font-mono text-sm">
            <div className="text-left">
              <span className="block text-2xl font-semibold text-white">{percentA}%</span>
              <span className="text-xs text-zinc-500">{productA.title} ({votesA} votes)</span>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/[0.08] bg-black flex items-center justify-center font-semibold text-xs text-white shadow">
              VS
            </div>
            <div className="text-right">
              <span className="block text-2xl font-semibold text-white">{percentB}%</span>
              <span className="text-xs text-zinc-500">{productB.title} ({votesB} votes)</span>
            </div>
          </div>

          {/* ⚔️ Dual Gradient Progress Bar */}
          <div className="w-full h-1 bg-zinc-900 overflow-hidden flex relative select-none rounded-full">
            <div style={{ width: `${percentA}%` }} className="h-full bg-white transition-all duration-1000 ease-out" />
            <div style={{ width: `${percentB}%` }} className="h-full bg-zinc-800 transition-all duration-1000 ease-out flex-1" />
          </div>
        </div>

        {/* 💻 Side-by-Side Product Matrices */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Product A Matrix Card */}
          <div className="bg-[#121215] border border-white/[0.06] p-8 rounded-xl hover:border-white/[0.12] transition duration-300 relative group overflow-hidden">
            
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-[#141417] border border-white/[0.06] flex items-center justify-center overflow-hidden">
                {renderLogo(productA.logo, "w-10 h-10")}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white tracking-tight">{productA.title}</h3>
              </div>
            </div>

            <p className="text-zinc-400 text-sm font-light mb-8 leading-relaxed italic h-12">
              "{productA.tagline}"
            </p>

            <hr className="border-white/[0.06] mb-6" />

            <div className="space-y-3.5 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Makers Name:</span>
                <span className="text-white/90">{productA.makerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Maker Twitter:</span>
                <a 
                  href={`https://twitter.com/${productA.makerTwitter?.replace(/^@/, "")}`}
                  target="_blank"
                  className="text-zinc-400 hover:underline text-zinc-300 transition"
                >
                  {productA.makerTwitter}
                </a>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-zinc-500">Product Live URL:</span>
                <a 
                  href={productA.url} 
                  target="_blank"
                  className="text-xs bg-white/10 border border-orange-500/30 text-zinc-400 hover:bg-white/20 transition px-3 py-1 rounded-lg"
                >
                  Visit Live Site ➔
                </a>
              </div>
            </div>
          </div>

          {/* Product B Matrix Card */}
          <div className="bg-[#121215] border border-white/[0.06] p-8 rounded-xl hover:border-white/[0.12] transition duration-300 relative group overflow-hidden">
            

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-[#141417] border border-white/[0.06] flex items-center justify-center overflow-hidden">
                {renderLogo(productB.logo, "w-10 h-10")}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white tracking-tight">{productB.title}</h3>
              </div>
            </div>

            <p className="text-zinc-400 text-sm font-light mb-8 leading-relaxed italic h-12">
              "{productB.tagline}"
            </p>

            <hr className="border-white/[0.06] mb-6" />

            <div className="space-y-3.5 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Makers Name:</span>
                <span className="text-white/90">{productB.makerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Maker Twitter:</span>
                <a 
                  href={`https://twitter.com/${productB.makerTwitter?.replace(/^@/, "")}`}
                  target="_blank"
                  className="text-zinc-400 hover:underline text-zinc-300 transition"
                >
                  {productB.makerTwitter}
                </a>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-zinc-500">Product Live URL:</span>
                <a 
                  href={productB.url} 
                  target="_blank"
                  className="text-xs bg-zinc-600/10 border border-indigo-500/30 text-zinc-400 hover:bg-zinc-600/20 transition px-3 py-1 rounded-lg"
                >
                  Visit Live Site ➔
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 🛡️ The Critique Vault — Direct Peer Critiques split columns */}
        <section className="bg-[#120d09]/30 border border-white/[0.06] p-8 rounded-3xl mb-16">
          <h2 className="text-2xl font-semibold text-white mb-2 flex items-center gap-2">
            🛡️ The Critique Vault
          </h2>
          <p className="text-sm text-zinc-450 mb-8 font-light max-w-xl">
            Verified builders on Google & GitHub voted and left honest, zero-sugar critiques to help makers validate their idea.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Column A */}
            <div className="space-y-6">
              <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                Verified Critiques: {productA.title}
              </h3>
              
              <div className="space-y-4">
                {matchesVotes.filter(v => v.votedId === productA.id || v.winnerFeedback).slice(0, 3).map((v, i) => (
                  <div key={i} className="border border-white/[0.06] bg-[#141417] p-5 rounded-lg border border-white/[0.06] text-sm leading-relaxed relative hover:border-white/[0.15] transition">
                    <span className="absolute -top-2 left-4 px-2 py-0.5 bg-zinc-950 border border-white/[0.08] rounded text-[10px] font-mono text-zinc-500">
                      {v.voter}
                    </span>
                    <div className="pt-2 space-y-2">
                      <p className="text-white/90 font-medium">✨ Good points:</p>
                      <p className="text-zinc-400 font-light italic">"{v.winnerFeedback || "Incredibly clean layout, simplifies core functions perfectly."}"</p>
                      <p className="text-zinc-400/90 font-medium pt-1">⚠️ Constructive Critique:</p>
                      <p className="text-zinc-450 font-light text-xs italic">"{v.loserFeedback || "Needs some tooltips on layout setup options for better accessibility."}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column B */}
            <div className="space-y-6">
              <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                Verified Critiques: {productB.title}
              </h3>

              <div className="space-y-4">
                {matchesVotes.filter(v => v.votedId === productB.id || v.loserFeedback).slice(0, 3).map((v, i) => (
                  <div key={i} className="border border-white/[0.06] bg-[#141417] p-5 rounded-lg border border-white/[0.06] text-sm leading-relaxed relative hover:border-white/[0.15] transition">
                    <span className="absolute -top-2 left-4 px-2 py-0.5 bg-zinc-950 border border-white/[0.08] rounded text-[10px] font-mono text-zinc-500">
                      {v.voter}
                    </span>
                    <div className="pt-2 space-y-2">
                      <p className="text-white/90 font-medium">✨ Good points:</p>
                      <p className="text-zinc-400 font-light italic">"{v.winnerFeedback || "Dynamic visual statistics are absolutely state-of-the-art."}"</p>
                      <p className="text-zinc-400/90 font-medium pt-1">⚠️ Constructive Critique:</p>
                      <p className="text-zinc-450 font-light text-xs italic">"{v.loserFeedback || "Layout has minor padding offsets on tablet screens when rotating."}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 🚀 Dynamic Final CTA Banner */}
        <section className="relative rounded-3xl bg-[#121215] border border-white/[0.08] p-8 md:p-12 overflow-hidden flex flex-col md:flex-row justify-between items-center gap-8 rounded-xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
          <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3">
              Is your product ready to enter the Arena?
            </h2>
            <p className="text-sm md:text-base text-[#faf5ef]/70 font-light max-w-xl">
              Submit your project, duel other makers, collect zero-sugar critiques from verified founders, and rank on the leaderboards.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto shrink-0">
            <a 
              href="/"
              className="w-full sm:w-auto bg-[#ffbe18] hover:bg-[#e0a612] text-black font-semibold text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition text-center"
            >
              Challenge {productA.title} Now ➔
            </a>
          </div>
        </section>
      </main>

      {/* 🛡️ Footer */}
      <footer className="border-t border-white/[0.06] py-12 bg-[#0B0B0C] font-mono text-xs text-zinc-650 mt-16 relative">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            © 2026 INDIE CLASH. Voted and shipped by public creators.
          </div>
          <div className="flex gap-6">
            <a href="/" className="hover:text-white transition">Colosseum Arena</a>
            <a href="/" className="hover:text-white transition">Leaderboard</a>
            <a href="/" className="hover:text-white transition">Critique Vault</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
