import { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase, DB_PREFIX } from "@/lib/supabaseClient";
import { SEED_PRODUCTS } from "@/lib/mockData";
import CopyLink from "@/app/components/CopyLink";

interface Props {
  params: Promise<{ slug: string }>;
}

// 1. Dynamic Meta Generator (Crucial for pSEO)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  let title = slug;

  if (supabase) {
    const { data: product } = await supabase
      .from(`${DB_PREFIX}products`)
      .select(`${DB_PREFIX}title`)
      .eq(`${DB_PREFIX}id`, slug)
      .single();

    if (product) {
      title = (product as any)[`${DB_PREFIX}title`];
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
    description: `Read verified founder reviews and critiques for ${title}. See how it performs in live 1v1 startup duels.`,
    openGraph: {
      title: `${title} Reviews & Constructive Critiques | INDIE CLASH`,
      description: `Read verified founder reviews and critiques for ${title}. See how it performs in live 1v1 startup duels.`,
      url: `https://www.indieclash.com/reviews/${slug}`,
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
      description: `Read verified founder reviews and critiques for ${title}. See how it performs in live 1v1 startup duels.`,
      images: [`/api/og/versus?slug=${slug}`],
    },
  };
}

// 2. Pre-generate popular review params at build time (SSG)
export async function generateStaticParams() {
  return SEED_PRODUCTS.map(p => ({
    slug: p.id,
  }));
}

export const revalidate = 1800; // Recache background every 30 minutes

const renderLogo = (logoStr: string, className = "w-12 h-12 object-contain") => {
  if (!logoStr) return null;
  const isImg = logoStr.startsWith("data:image") || logoStr.startsWith("http") || logoStr.startsWith("/");
  if (isImg) {
    return <img src={logoStr} alt="Logo" className={`${className} inline-block shrink-0 rounded-md object-contain`} />;
  }
  return <span className="inline-block shrink-0 text-5xl">{logoStr}</span>;
};

export default async function ReviewPage({ params }: Props) {
  const { slug } = await params;

  let product: any = null;
  let reviews: any[] = [];
  let winCount = 0;
  let totalMatches = 0;

  if (supabase) {
    const { data: p } = await supabase
      .from(`${DB_PREFIX}products`)
      .select("*")
      .eq(`${DB_PREFIX}id`, slug)
      .single();

    if (p) {
      const rawP = p as any;
      product = {
        id: rawP[`${DB_PREFIX}id`],
        title: rawP[`${DB_PREFIX}title`],
        tagline: rawP[`${DB_PREFIX}tagline`],
        url: rawP[`${DB_PREFIX}url`],
        shipTimeframe: rawP[`${DB_PREFIX}ship_timeframe`],
        makerName: rawP[`${DB_PREFIX}maker_name`],
        makerTwitter: rawP[`${DB_PREFIX}maker_twitter`],
        makerAvatar: rawP[`${DB_PREFIX}maker_avatar`],
        logo: rawP[`${DB_PREFIX}logo`],
        votesCount: rawP[`${DB_PREFIX}votes_count`],
      };

      // Query voter feedback (critiques)
      const { data: votes } = await supabase
        .from(`${DB_PREFIX}votes`)
        .select("*")
        .eq(`${DB_PREFIX}voted_product_id`, slug)
        .limit(20);

      if (votes) {
        reviews = votes.map((v: any) => ({
          id: v[`${DB_PREFIX}id`],
          voter: v[`${DB_PREFIX}voter_username`],
          winnerFeedback: v[`${DB_PREFIX}feedback_winner`],
          loserFeedback: v[`${DB_PREFIX}feedback_loser`],
          createdAt: v[`${DB_PREFIX}created_at`],
        }));
      }

      // Query win-loss records to calculate winrate
      const { data: matches } = await supabase
        .from(`${DB_PREFIX}matches`)
        .select("*")
        .or(`${DB_PREFIX}product_a_id.eq.${slug},${DB_PREFIX}product_b_id.eq.${slug}`);

      if (matches) {
        totalMatches = matches.length;
        winCount = matches.filter((m: any) => m[`${DB_PREFIX}winner_id`] === slug).length;
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
  const ratingValue = (winRate / 20).toFixed(1);

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      {/* Structured Data (JSON-LD) for Search Engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.title,
            "image": product.logo && (product.logo.startsWith("http") || product.logo.startsWith("/")) ? product.logo : undefined,
            "description": product.tagline,
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
              "availability": "https://schema.org/InStock"
            },
            "aggregateRating": totalMatches > 0 ? {
              "@type": "AggregateRating",
              "ratingValue": ratingValue,
              "bestRating": "5",
              "worstRating": "0",
              "ratingCount": totalMatches
            } : undefined
          })
        }}
      />

      {/* 🌌 Background ambient gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0c0c0e] via-[#0B0B0C] to-[#0B0B0C] pointer-events-none" />

      {/* ⚔️ Sticky Header */}
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

      <main className="relative max-w-4xl mx-auto px-4 py-12 animate-fade-in-blur">
        {/* SEO Breadcrumbs */}
        <nav className="text-xs text-zinc-500 mb-8 flex items-center gap-2 font-mono">
          <a href="/" className="hover:text-white transition">INDIE CLASH</a>
          <span>/</span>
          <span className="text-[#faf5ef]/60">PRODUCT REVIEWS</span>
          <span>/</span>
          <span className="text-white font-semibold">{product.title} Reviews</span>
        </nav>

        {/* 🏆 Header Profile Card */}
        <div className="bg-[#121215]/85 border border-white/[0.06] p-8 rounded-xl mb-12 relative overflow-hidden backdrop-blur-md">
          
          
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#141417] border border-white/[0.06] flex items-center justify-center select-none shrink-0 overflow-hidden rounded-lg">
              {renderLogo(product.logo, "w-14 h-14")}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                {product.title}
              </h1>
              <p className="text-sm text-zinc-400 mt-1.5 font-light leading-relaxed">
                "{product.tagline}"
              </p>
            </div>
          </div>

          <hr className="border-white/[0.06] my-6" />

          {/* Grid Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-center sm:text-left">
            <div className="bg-[#141417] p-4 rounded-lg border border-white/[0.06]">
              <span className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">Total Duels</span>
              <span className="text-2xl font-semibold text-white">{totalMatches} duels</span>
            </div>
            <div className="bg-[#141417] p-4 rounded-lg border border-white/[0.06]">
              <span className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">Total Votes</span>
              <span className="text-2xl font-semibold text-white">{product.votesCount} votes</span>
            </div>
          </div>

          {/* Social details bar */}
          <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-wrap gap-4 items-center justify-between text-sm font-mono">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Maker:</span>
              <span className="text-white font-bold">{product.makerName}</span>
              <a 
                href={`https://twitter.com/${product.makerTwitter?.replace(/^@/, "")}`}
                target="_blank"
                className="text-white hover:underline"
              >
                ({product.makerTwitter})
              </a>
            </div>
            <div className="flex gap-3">
              <a 
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out the founder critiques and 1v1 duel stats for ${product.title} on @IndieClash! ⚔️\n\nhttps://www.indieclash.com/reviews/${product.id}`)}`}
                target="_blank"
                className="px-4 py-2 rounded-xl border border-[#ffbe18]/30 hover:border-[#ffbe18]/60 hover:bg-[#ffbe18]/5 text-white font-semibold text-sm transition font-mono flex items-center gap-1.5"
              >
                📢 Share on X
              </a>
              <a 
                href={product.url}
                target="_blank"
                className="px-4 py-2 rounded-xl bg-[#ffbe18] text-black font-semibold hover:scale-105 hover:bg-[#e0a612] transition shadow-md"
              >
                Visit Startup Website ➔
              </a>
            </div>
          </div>
        </div>

        {/* 🏆 Embed Backlink Badge Widget */}
        <section className="bg-[#121215]/85 border border-white/[0.08] p-6 sm:p-8 rounded-xl mb-12 relative overflow-hidden backdrop-blur-md">
          
          <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
            🏆 Claim Your Badge & Boost Your SEO Rank
          </h2>
          <p className="text-xs text-zinc-400 mb-6 font-light leading-relaxed">
            Showcase your startup's performance in the Indie Clash arena. Place this live badge on your website or GitHub README to increase search authority and drive traffic back to your critiques feed.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-[#141417] p-5 rounded-2xl border border-white/[0.06] items-center">
            {/* Badge preview */}
            <div className="md:col-span-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/[0.06] pb-6 md:pb-0 md:pr-6 shrink-0 text-center">
              <span className="text-[10px] font-mono text-zinc-500 mb-2 uppercase tracking-widest block">Badge Preview</span>
              <a 
                href={`https://www.indieclash.com/reviews/${product.id}`}
                target="_blank"
                className="inline-block transition-transform hover:scale-105"
              >
                <img 
                  src={`https://img.shields.io/badge/%E2%9A%94%EF%B8%8F_Indie_Clash-Voted_on_Arena-ffbe18?style=flat-square`} 
                  alt="Voted on Indie Clash" 
                  className="rounded-sm object-contain"
                />
              </a>
            </div>
            
            {/* Embed Code Copy */}
            <div className="md:col-span-8 space-y-4">
              <div>
                <span className="text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-widest block">Direct SEO Review Link</span>
                <CopyLink value={`https://www.indieclash.com/reviews/${product.id}`} />
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-widest block">HTML Embed Code (for website homepage/footer)</span>
                <textarea 
                  readOnly
                  value={`<a href="https://www.indieclash.com/reviews/${product.id}" target="_blank"><img src="https://img.shields.io/badge/%E2%9A%94%EF%B8%8F_Indie_Clash-Voted_on_Arena-ffbe18?style=flat-square" alt="Voted on Indie Clash" /></a>`}
                  className="w-full h-14 bg-zinc-950 border border-white/[0.08] rounded-md p-2 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-zinc-400 select-all leading-normal"
                />
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-widest block">Markdown Code (for GitHub README)</span>
                <textarea 
                  readOnly
                  value={`[![Voted on Indie Clash](https://img.shields.io/badge/%E2%9A%94%EF%B8%8F_Indie_Clash-Voted_on_Arena-ffbe18?style=flat-square)](https://www.indieclash.com/reviews/${product.id})`}
                  className="w-full h-14 bg-zinc-950 border border-white/[0.08] rounded-md p-2 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-zinc-400 select-all leading-normal"
                />
              </div>
              <div className="text-[10px] text-white font-mono text-right italic">
                💡 Hint: Click inside any box to select code, then copy and paste!
              </div>
            </div>
          </div>
        </section>

        {/* 🛡️ The Critique Feed */}
        <section className="space-y-6 mb-12">
          <div className="border-b border-white/[0.06] pb-4 flex justify-between items-baseline">
            <h2 className="text-2xl font-semibold text-white">
              🛡️ Founder Critiques Feed
            </h2>
            <span className="text-xs font-mono text-zinc-500">{reviews.length} Verified Reviews</span>
          </div>

          <div className="space-y-6">
            {reviews.map((r, i) => (
              <div 
                key={i} 
                className="bg-[#120d09]/40 border border-white/[0.06] p-6 rounded-2xl hover:border-white/[0.08] transition relative group"
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-white">🛡️ verified voter</span>
                    <span className="text-zinc-650">|</span>
                    <span className="text-white/90">{r.voter}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-650">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Just now"}
                  </span>
                </div>

                <div className="space-y-3 font-light text-sm text-zinc-400 leading-relaxed">
                  <div className="pl-4 border-l-2 border-white/[0.1] bg-white/[0.02] py-1.5 pr-2 rounded-r">
                    <strong className="block text-xs font-mono text-white uppercase tracking-wider mb-1">✨ Positive Highlights:</strong>
                    "{r.winnerFeedback || "Incredibly clean layout, simplifies core functions perfectly."}"
                  </div>

                  <div className="pl-4 border-l-2 border-white/[0.06] bg-white/[0.02] py-1.5 pr-2 rounded-r">
                    <strong className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">⚠️ Constructive Critique:</strong>
                    "{r.loserFeedback || "Needs some tooltips on layout setup options for better accessibility."}"
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 🚀 Dynamic Final CTA Banner */}
        <section className="relative rounded-3xl bg-gradient-to-r from-[#ffbe18]/15 via-[#ffbe18]/5 to-transparent border border-white/[0.08] p-8 md:p-12 overflow-hidden shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
          <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3">
              Want critiques for your own startup?
            </h2>
            <p className="text-sm md:text-base text-zinc-400 font-light max-w-xl">
              Submit your project, challenge other makers, trade verified critiques, and scale your domain authority on search engines.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto shrink-0">
            <a 
              href="/"
              className="w-full sm:w-auto bg-[#ffbe18] hover:bg-[#e0a612] text-black font-semibold text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition text-center"
            >
              Challenge {product.title} Now ➔
            </a>
          </div>
        </section>
      </main>

      {/* 🛡️ Footer */}
      <footer className="border-t border-white/[0.06] py-12 bg-[#141417] font-mono text-xs text-zinc-650 mt-16 relative">
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
