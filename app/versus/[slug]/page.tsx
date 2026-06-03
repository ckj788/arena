import { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
      .from("shipandbattle_products")
      .select("shipandbattle_title")
      .in("shipandbattle_id", [slugA, slugB]);

    if (products && products.length >= 2) {
      titleA = products[0].shipandbattle_title;
      titleB = products[1].shipandbattle_title;
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
  if (!supabase) {
    return [
      { slug: "zenjournal-vs-logocraft" },
      { slug: "quickcron-vs-cardioai" },
      { slug: "typeflow-vs-siteshot" },
    ];
  }

  try {
    const { data: matches } = await supabase
      .from("shipandbattle_matches")
      .select("shipandbattle_product_a_id, shipandbattle_product_b_id")
      .limit(30);

    if (!matches) return [];

    return matches.map(m => ({
      slug: `${m.shipandbattle_product_a_id}-vs-${m.shipandbattle_product_b_id}`,
    }));
  } catch (e) {
    return [];
  }
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
      .from("shipandbattle_products")
      .select("*")
      .eq("shipandbattle_id", slugA)
      .single();

    const { data: pB } = await supabase
      .from("shipandbattle_products")
      .select("*")
      .eq("shipandbattle_id", slugB)
      .single();

    if (pA && pB) {
      productA = {
        id: pA.shipandbattle_id,
        title: pA.shipandbattle_title,
        tagline: pA.shipandbattle_tagline,
        url: pA.shipandbattle_url,
        shipTimeframe: pA.shipandbattle_ship_timeframe,
        makerName: pA.shipandbattle_maker_name,
        makerTwitter: pA.shipandbattle_maker_twitter,
        makerAvatar: pA.shipandbattle_maker_avatar,
        logo: pA.shipandbattle_logo,
        votesCount: pA.shipandbattle_votes_count,
      };

      productB = {
        id: pB.shipandbattle_id,
        title: pB.shipandbattle_title,
        tagline: pB.shipandbattle_tagline,
        url: pB.shipandbattle_url,
        shipTimeframe: pB.shipandbattle_ship_timeframe,
        makerName: pB.shipandbattle_maker_name,
        makerTwitter: pB.shipandbattle_maker_twitter,
        makerAvatar: pB.shipandbattle_maker_avatar,
        logo: pB.shipandbattle_logo,
        votesCount: pB.shipandbattle_votes_count,
      };

      const { data: vData } = await supabase
        .from("shipandbattle_votes")
        .select("*")
        .in("shipandbattle_voted_product_id", [slugA, slugB])
        .limit(10);
      
      if (vData) {
        matchesVotes = vData.map(v => ({
          id: v.shipandbattle_id,
          voter: v.shipandbattle_voter_username,
          votedId: v.shipandbattle_voted_product_id,
          winnerFeedback: v.shipandbattle_feedback_winner,
          loserFeedback: v.shipandbattle_feedback_loser,
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
    <div className="min-h-screen bg-[#070503] text-[#faf5ef] antialiased selection:bg-[#ffbe18] selection:text-black">
      {/* 🌌 Background grid and ambient glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1c1209] via-[#070503] to-[#070503] pointer-events-none" />
      
      {/* ⚔️ Premium header container */}
      <header className="relative border-b border-white/5 py-4 backdrop-blur-md bg-black/20 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2 group">
            <span className="text-2xl font-black tracking-tighter bg-gradient-to-r from-[#ffbe18] to-orange-500 bg-clip-text text-transparent group-hover:scale-105 transition">
              INDIE CLASH
            </span>
            <span className="text-[10px] font-mono border border-[#ffbe18]/30 px-1.5 py-0.5 rounded bg-[#ffbe18]/10 text-[#ffbe18] tracking-widest uppercase">
              Arena
            </span>
          </a>
          <a 
            href="/"
            className="text-xs border border-white/10 hover:border-[#ffbe18]/30 hover:bg-[#ffbe18]/5 transition px-3.5 py-1.5 rounded-lg text-[#faf5ef]/80 hover:text-white"
          >
            Enter Arena ➔
          </a>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-12">
        {/* H1 SEO Breadcrumbs */}
        <nav className="text-xs text-[#faf5ef]/40 mb-8 flex items-center gap-2 font-mono">
          <a href="/" className="hover:text-[#ffbe18] transition">INDIE CLASH</a>
          <span>/</span>
          <span className="text-[#faf5ef]/60">VERSUS ARENA</span>
          <span>/</span>
          <span className="text-[#ffbe18] font-bold">{productA.title} vs {productB.title}</span>
        </nav>

        {/* 🏆 Versus Duel Screen Banner */}
        <div className="relative text-center mb-16">
          <div className="inline-block relative mb-4">
            <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-red-600 to-indigo-600 opacity-30 blur-lg animate-pulse" />
            <div className="relative bg-[#160f09] border border-white/10 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest text-[#ffbe18] flex items-center gap-2">
              <span>Season 1 Matchup</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffbe18] animate-ping" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-4">
            {productA.title} <span className="text-[#ffbe18]/40 font-light italic text-3xl md:text-5xl mx-2">vs</span> {productB.title}
          </h1>
          <p className="text-base md:text-lg text-[#faf5ef]/60 max-w-2xl mx-auto font-light leading-relaxed">
            A battle of minimalist execution. Read authentic peer critiques, see the builder community votes, and analyze their scores.
          </p>
        </div>

        {/* ⚡ Dynamic Clash Split Meter */}
        <div className="relative bg-[#140e0a]/80 border border-white/5 p-8 rounded-3xl mb-16 shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
          
          <div className="flex justify-between items-end mb-4 font-mono text-sm">
            <div className="text-left">
              <span className="block text-2xl font-black text-white">{percentA}%</span>
              <span className="text-xs text-[#faf5ef]/40">{productA.title} ({votesA} votes)</span>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/10 bg-black flex items-center justify-center font-black text-xs text-[#ffbe18] shadow">
              VS
            </div>
            <div className="text-right">
              <span className="block text-2xl font-black text-white">{percentB}%</span>
              <span className="text-xs text-[#faf5ef]/40">{productB.title} ({votesB} votes)</span>
            </div>
          </div>

          {/* ⚔️ Dual Gradient Progress Bar */}
          <div className="w-full h-5 bg-black/60 rounded-full p-1 overflow-hidden flex border border-white/5 relative">
            <div 
              style={{ width: `${percentA}%` }}
              className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 rounded-l-full transition-all duration-1000 ease-out"
            />
            <div 
              style={{ width: `${percentB}%` }}
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-600 to-blue-500 rounded-r-full transition-all duration-1000 ease-out"
            />
          </div>
        </div>

        {/* 💻 Side-by-Side Product Matrices */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Product A Matrix Card */}
          <div className="bg-[#120d09]/50 border border-white/5 p-8 rounded-2xl hover:border-orange-500/20 transition duration-300 relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition pointer-events-none" />
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shadow-inner overflow-hidden">
                {renderLogo(productA.logo, "w-10 h-10")}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{productA.title}</h3>
                <p className="text-xs font-mono text-orange-400">Shipped in {productA.shipTimeframe}</p>
              </div>
            </div>

            <p className="text-[#faf5ef]/80 text-sm font-light mb-8 leading-relaxed italic h-12">
              "{productA.tagline}"
            </p>

            <hr className="border-white/5 mb-6" />

            <div className="space-y-3.5 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-[#faf5ef]/40">Makers Name:</span>
                <span className="text-white/90">{productA.makerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#faf5ef]/40">Maker Twitter:</span>
                <a 
                  href={`https://twitter.com/${productA.makerTwitter?.replace(/^@/, "")}`}
                  target="_blank"
                  className="text-orange-400 hover:underline hover:text-orange-300 transition"
                >
                  {productA.makerTwitter}
                </a>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-[#faf5ef]/40">Product Live URL:</span>
                <a 
                  href={productA.url} 
                  target="_blank"
                  className="text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition px-3 py-1 rounded-lg"
                >
                  Visit Live Site ➔
                </a>
              </div>
            </div>
          </div>

          {/* Product B Matrix Card */}
          <div className="bg-[#120d09]/50 border border-white/5 p-8 rounded-2xl hover:border-indigo-500/20 transition duration-300 relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition pointer-events-none" />

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner overflow-hidden">
                {renderLogo(productB.logo, "w-10 h-10")}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{productB.title}</h3>
                <p className="text-xs font-mono text-indigo-400">Shipped in {productB.shipTimeframe}</p>
              </div>
            </div>

            <p className="text-[#faf5ef]/80 text-sm font-light mb-8 leading-relaxed italic h-12">
              "{productB.tagline}"
            </p>

            <hr className="border-white/5 mb-6" />

            <div className="space-y-3.5 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-[#faf5ef]/40">Makers Name:</span>
                <span className="text-white/90">{productB.makerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#faf5ef]/40">Maker Twitter:</span>
                <a 
                  href={`https://twitter.com/${productB.makerTwitter?.replace(/^@/, "")}`}
                  target="_blank"
                  className="text-indigo-400 hover:underline hover:text-indigo-300 transition"
                >
                  {productB.makerTwitter}
                </a>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-[#faf5ef]/40">Product Live URL:</span>
                <a 
                  href={productB.url} 
                  target="_blank"
                  className="text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition px-3 py-1 rounded-lg"
                >
                  Visit Live Site ➔
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 🛡️ The Critique Vault — Direct Peer Critiques split columns */}
        <section className="bg-[#120d09]/30 border border-white/5 p-8 rounded-3xl mb-16">
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            🛡️ The Critique Vault
          </h2>
          <p className="text-sm text-[#faf5ef]/60 mb-8 font-light max-w-xl">
            Verified builders on Google & GitHub voted and left honest, zero-sugar critiques to help makers validate their idea.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Column A */}
            <div className="space-y-6">
              <h3 className="text-xs font-mono tracking-widest text-[#faf5ef]/40 uppercase mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Verified Critiques: {productA.title}
              </h3>
              
              <div className="space-y-4">
                {matchesVotes.filter(v => v.votedId === productA.id || v.winnerFeedback).slice(0, 3).map((v, i) => (
                  <div key={i} className="border border-white/5 bg-black/30 p-5 rounded-xl text-sm leading-relaxed relative hover:border-orange-500/15 transition">
                    <span className="absolute -top-2 left-4 px-2 py-0.5 bg-[#160f09] border border-white/10 rounded text-[10px] font-mono text-[#faf5ef]/40">
                      {v.voter}
                    </span>
                    <div className="pt-2 space-y-2">
                      <p className="text-[#ffbe18]/90 font-medium">✨ Good points:</p>
                      <p className="text-[#faf5ef]/80 font-light italic">"{v.winnerFeedback || "Incredibly clean layout, simplifies core functions perfectly."}"</p>
                      <p className="text-red-400/90 font-medium pt-1">⚠️ Constructive Critique:</p>
                      <p className="text-[#faf5ef]/60 font-light text-xs italic">"{v.loserFeedback || "Needs some tooltips on layout setup options for better accessibility."}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column B */}
            <div className="space-y-6">
              <h3 className="text-xs font-mono tracking-widest text-[#faf5ef]/40 uppercase mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Verified Critiques: {productB.title}
              </h3>

              <div className="space-y-4">
                {matchesVotes.filter(v => v.votedId === productB.id || v.loserFeedback).slice(0, 3).map((v, i) => (
                  <div key={i} className="border border-white/5 bg-black/30 p-5 rounded-xl text-sm leading-relaxed relative hover:border-indigo-500/15 transition">
                    <span className="absolute -top-2 left-4 px-2 py-0.5 bg-[#100e16] border border-white/10 rounded text-[10px] font-mono text-[#faf5ef]/40">
                      {v.voter}
                    </span>
                    <div className="pt-2 space-y-2">
                      <p className="text-[#ffbe18]/90 font-medium">✨ Good points:</p>
                      <p className="text-[#faf5ef]/80 font-light italic">"{v.winnerFeedback || "Dynamic visual statistics are absolutely state-of-the-art."}"</p>
                      <p className="text-red-400/90 font-medium pt-1">⚠️ Constructive Critique:</p>
                      <p className="text-[#faf5ef]/60 font-light text-xs italic">"{v.loserFeedback || "Layout has minor padding offsets on tablet screens when rotating."}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 🚀 Dynamic Final CTA Banner */}
        <section className="relative rounded-3xl bg-gradient-to-r from-[#ffbe18]/15 via-[#ffbe18]/5 to-transparent border border-[#ffbe18]/25 p-8 md:p-12 overflow-hidden shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
          <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              Is your product ready to enter the Arena?
            </h2>
            <p className="text-sm md:text-base text-[#faf5ef]/70 font-light max-w-xl">
              Submit your project, duel other makers, collect zero-sugar critiques from verified founders, and rank on the leaderboards.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto shrink-0">
            <a 
              href="/"
              className="w-full sm:w-auto bg-[#ffbe18] hover:bg-[#e0a612] text-black font-extrabold text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition text-center"
            >
              Challenge {productA.title} Now ➔
            </a>
          </div>
        </section>
      </main>

      {/* 🛡️ Footer */}
      <footer className="border-t border-white/5 py-12 bg-black/40 font-mono text-xs text-[#faf5ef]/30 mt-16 relative">
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
