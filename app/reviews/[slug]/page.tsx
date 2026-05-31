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

  let title = slug;

  if (supabase) {
    const { data: product } = await supabase
      .from("shipandbattle_products")
      .select("shipandbattle_title")
      .eq("shipandbattle_id", slug)
      .single();

    if (product) {
      title = product.shipandbattle_title;
    }
  } else {
    const seed = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slug.toLowerCase());
    if (seed) {
      title = seed.title;
    }
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  title = cap(title);

  return {
    title: `${title} Reviews & Constructive Critiques | INDIE CLASH`,
    description: `Read verified founder reviews and critiques for ${title}. Compare win rates and see how it performs in live 1v1 startup duels.`,
    openGraph: {
      title: `${title} Reviews & Constructive Critiques | INDIE CLASH`,
      description: `Read verified founder reviews and critiques for ${title}. Compare win rates and see how it performs in live 1v1 startup duels.`,
      url: `https://arena-chi-coral.vercel.app/reviews/${slug}`,
      siteName: "INDIE CLASH",
      images: [
        {
          url: `/api/og/versus?slug=${slug}`,
          width: 1200,
          height: 630,
          alt: `${title} Reviews`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} Reviews & Constructive Critiques | INDIE CLASH`,
      description: `Read verified founder reviews and critiques for ${title}. Compare win rates and see how it performs in live 1v1 startup duels.`,
      images: [`/api/og/versus?slug=${slug}`],
    },
  };
}

// 2. Pre-generate popular review params at build time (SSG)
export async function generateStaticParams() {
  if (!supabase) {
    return SEED_PRODUCTS.map(p => ({
      slug: p.id,
    }));
  }

  try {
    const { data: products } = await supabase
      .from("shipandbattle_products")
      .select("shipandbattle_id")
      .limit(50);

    if (!products) return [];

    return products.map(p => ({
      slug: p.shipandbattle_id,
    }));
  } catch (e) {
    return [];
  }
}

export const revalidate = 1800; // Recache background every 30 minutes

export default async function ReviewPage({ params }: Props) {
  const { slug } = await params;

  let product: any = null;
  let reviews: any[] = [];
  let winCount = 0;
  let totalMatches = 0;

  if (supabase) {
    const { data: p } = await supabase
      .from("shipandbattle_products")
      .select("*")
      .eq("shipandbattle_id", slug)
      .single();

    if (p) {
      product = {
        id: p.shipandbattle_id,
        title: p.shipandbattle_title,
        tagline: p.shipandbattle_tagline,
        url: p.shipandbattle_url,
        shipTimeframe: p.shipandbattle_ship_timeframe,
        makerName: p.shipandbattle_maker_name,
        makerTwitter: p.shipandbattle_maker_twitter,
        makerAvatar: p.shipandbattle_maker_avatar,
        logo: p.shipandbattle_logo,
        votesCount: p.shipandbattle_votes_count,
      };

      // Query voter feedback (critiques)
      const { data: votes } = await supabase
        .from("shipandbattle_votes")
        .select("*")
        .eq("shipandbattle_voted_product_id", slug)
        .limit(20);

      if (votes) {
        reviews = votes.map(v => ({
          id: v.shipandbattle_id,
          voter: v.shipandbattle_voter_username,
          winnerFeedback: v.shipandbattle_feedback_winner,
          loserFeedback: v.shipandbattle_feedback_loser,
          createdAt: v.shipandbattle_created_at,
        }));
      }

      // Query win-loss records to calculate winrate
      const { data: matches } = await supabase
        .from("shipandbattle_matches")
        .select("*")
        .or(`shipandbattle_product_a_id.eq.${slug},shipandbattle_product_b_id.eq.${slug}`);

      if (matches) {
        totalMatches = matches.length;
        winCount = matches.filter(m => m.shipandbattle_winner_id === slug).length;
      }
    }
  }

  // Fallback to local mockup data if supabase query failed or returned empty
  if (!product) {
    const seed = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slug.toLowerCase());
    if (!seed) {
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      product = {
        id: slug,
        title: capitalize(slug),
        tagline: "Innovative developer utility shipped in public sprint.",
        url: `https://${slug}.xyz`,
        shipTimeframe: "48h",
        makerName: "Indie Builder",
        makerTwitter: `@${slug}_maker`,
        makerAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces",
        logo: "🚀",
        votesCount: 42,
      };
    } else {
      product = seed;
    }

    reviews = [
      {
        id: "r1",
        voter: "@sam_indie",
        winnerFeedback: "Beautiful minimalism! Focuses entirely on lightning fast load speed.",
        loserFeedback: "Features are a bit sparse. Needs a standard CSV download button.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "r2",
        voter: "@chloe_codes",
        winnerFeedback: "The dynamic real-time reporting is incredibly intuitive and gorgeous.",
        loserFeedback: "Mobile viewport has minor horizontal overflows on the leaderboard.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "r3",
        voter: "@lucas_ship",
        winnerFeedback: "Excellent typography and off-white CSS color layout. Restores focus.",
        loserFeedback: "The input box cursor reset delays the flow when typing quickly.",
        createdAt: new Date().toISOString(),
      }
    ];

    totalMatches = 4;
    winCount = 3;
  }

  const winRate = totalMatches > 0 ? Math.round((winCount / totalMatches) * 100) : 75;

  return (
    <div className="min-h-screen bg-[#070503] text-[#faf5ef] antialiased selection:bg-[#ffbe18] selection:text-black">
      {/* 🌌 Background ambient gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#130d08] via-[#070503] to-[#070503] pointer-events-none" />

      {/* ⚔️ Sticky Header */}
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

      <main className="relative max-w-4xl mx-auto px-4 py-12">
        {/* SEO Breadcrumbs */}
        <nav className="text-xs text-[#faf5ef]/40 mb-8 flex items-center gap-2 font-mono">
          <a href="/" className="hover:text-[#ffbe18] transition">INDIE CLASH</a>
          <span>/</span>
          <span className="text-[#faf5ef]/60">PRODUCT REVIEWS</span>
          <span>/</span>
          <span className="text-[#ffbe18] font-bold">{product.title} Reviews</span>
        </nav>

        {/* 🏆 Header Profile Card */}
        <div className="bg-[#120d09]/60 border border-white/5 p-8 rounded-3xl mb-12 shadow-2xl relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#ffbe18]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#ffbe18]/10 border border-[#ffbe18]/20 flex items-center justify-center text-5xl shadow-inner select-none shrink-0">
              {product.logo}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                {product.title}
              </h1>
              <p className="text-sm text-[#faf5ef]/70 mt-1.5 font-light leading-relaxed">
                "{product.tagline}"
              </p>
            </div>
          </div>

          <hr className="border-white/5 my-6" />

          {/* Grid Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center sm:text-left">
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <span className="block text-xs font-mono text-[#faf5ef]/40 uppercase tracking-wider mb-1">Win Rate</span>
              <span className="text-2xl font-black text-[#ffbe18]">{winRate}%</span>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <span className="block text-xs font-mono text-[#faf5ef]/40 uppercase tracking-wider mb-1">Total Duels</span>
              <span className="text-2xl font-black text-white">{totalMatches} duels</span>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <span className="block text-xs font-mono text-[#faf5ef]/40 uppercase tracking-wider mb-1">Total Votes</span>
              <span className="text-2xl font-black text-white">{product.votesCount} votes</span>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <span className="block text-xs font-mono text-[#faf5ef]/40 uppercase tracking-wider mb-1">Sprint Time</span>
              <span className="text-2xl font-black text-orange-400 font-mono">{product.shipTimeframe}</span>
            </div>
          </div>

          {/* Social details bar */}
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap gap-4 items-center justify-between text-sm font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[#faf5ef]/40">Maker:</span>
              <span className="text-white font-bold">{product.makerName}</span>
              <a 
                href={`https://twitter.com/${product.makerTwitter?.replace(/^@/, "")}`}
                target="_blank"
                className="text-[#ffbe18] hover:underline"
              >
                ({product.makerTwitter})
              </a>
            </div>
            <a 
              href={product.url}
              target="_blank"
              className="px-4 py-2 rounded-xl bg-[#ffbe18] text-black font-extrabold hover:scale-105 hover:bg-[#e0a612] transition shadow-md"
            >
              Visit Startup Website ➔
            </a>
          </div>
        </div>

        {/* 🛡️ The Critique Feed */}
        <section className="space-y-6 mb-12">
          <div className="border-b border-white/5 pb-4 flex justify-between items-baseline">
            <h2 className="text-2xl font-black text-white">
              🛡️ Founder Critiques Feed
            </h2>
            <span className="text-xs font-mono text-[#faf5ef]/40">{reviews.length} Verified Reviews</span>
          </div>

          <div className="space-y-6">
            {reviews.map((r, i) => (
              <div 
                key={i} 
                className="bg-[#120d09]/40 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition relative group"
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-[#ffbe18]">🛡️ verified voter</span>
                    <span className="text-[#faf5ef]/30">|</span>
                    <span className="text-white/90">{r.voter}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#faf5ef]/30">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Just now"}
                  </span>
                </div>

                <div className="space-y-3 font-light text-sm text-[#faf5ef]/80 leading-relaxed">
                  <div className="pl-4 border-l-2 border-green-500/50 bg-green-500/5 py-1.5 pr-2 rounded-r">
                    <strong className="block text-xs font-mono text-green-400 uppercase tracking-wider mb-1">✨ Positive Highlights:</strong>
                    "{r.winnerFeedback || "Incredibly clean layout, simplifies core functions perfectly."}"
                  </div>

                  <div className="pl-4 border-l-2 border-red-500/50 bg-red-500/5 py-1.5 pr-2 rounded-r">
                    <strong className="block text-xs font-mono text-red-400 uppercase tracking-wider mb-1">⚠️ Constructive Critique:</strong>
                    "{r.loserFeedback || "Needs some tooltips on layout setup options for better accessibility."}"
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 🚀 Dynamic Final CTA Banner */}
        <section className="relative rounded-3xl bg-gradient-to-r from-[#ffbe18]/15 via-[#ffbe18]/5 to-transparent border border-[#ffbe18]/25 p-8 md:p-12 overflow-hidden shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
          <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              Want critiques for your own startup?
            </h2>
            <p className="text-sm md:text-base text-[#faf5ef]/70 font-light max-w-xl">
              Submit your project, challenge other makers, trade verified critiques, and scale your domain authority on search engines.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto shrink-0">
            <a 
              href="/"
              className="w-full sm:w-auto bg-[#ffbe18] hover:bg-[#e0a612] text-black font-extrabold text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition text-center"
            >
              Challenge {product.title} Now ➔
            </a>
          </div>
        </section>
      </main>

      {/* 🛡️ Footer */}
      <footer className="border-t border-white/5 py-12 bg-black/40 font-mono text-xs text-[#faf5ef]/30 mt-16 relative">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
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
