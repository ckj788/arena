import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import { notFound, permanentRedirect } from "next/navigation";
import { getVersusSeoData } from "@/lib/server/publicSeoData";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";
import CopyLink from "@/app/components/CopyLink";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 1800;

function descriptionFor(productA: string, productB: string) {
  return `Compare ${productA} and ${productB} in their recorded Indie Clash matchup. See the actual vote result, product details, makers, and builder feedback.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getVersusSeoData(slug);
  if (!data) notFound();

  const { productA, productB, match, canonicalSlug } = data;
  const canonicalPath = `/versus/${canonicalSlug}`;
  const description = descriptionFor(productA.title, productB.title);
  const image = `/api/og/versus?slug=${encodeURIComponent(canonicalSlug)}`;
  const winner = match.winnerId === productA.id ? productA : match.winnerId === productB.id ? productB : null;
  const loser = winner?.id === productA.id ? productB : winner ? productA : null;
  const socialTitle = winner && loser ? `${winner.title} won vs ${loser.title}` : `${productA.title} vs ${productB.title}`;

  return {
    title: socialTitle,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${socialTitle} — Arena Matchup`,
      description,
      url: canonicalPath,
      siteName: "Indie Clash",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${productA.title} vs ${productB.title}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${socialTitle} — Arena Matchup`,
      description,
      images: [image],
    },
  };
}

function ProductLogo({ logo, title }: { logo: string; title: string }) {
  const image = trustedProductImageUrl(logo);
  if (image) return <img src={image} alt={`${title} logo`} className="h-12 w-12 rounded-lg object-contain bg-white" />;
  const compactSymbol = logo && logo.length <= 8 && !logo.includes(":") && !logo.includes("/") ? logo : "🚀";
  return <span className="text-5xl" aria-hidden="true">{compactSymbol}</span>;
}

export default async function VersusPage({ params }: Props) {
  const { slug } = await params;
  const data = await getVersusSeoData(slug);
  if (!data) notFound();
  if (slug !== data.canonicalSlug) permanentRedirect(`/versus/${data.canonicalSlug}`);

  const { productA, productB, match, critiques, canonicalSlug } = data;
  const canonicalUrl = absoluteUrl(`/versus/${canonicalSlug}`);
  const totalVotes = match.votesA + match.votesB;
  const percentA = totalVotes ? Math.round((match.votesA / totalVotes) * 100) : 50;
  const percentB = totalVotes ? 100 - percentA : 50;
  const productAUrl = absoluteUrl(`/products/${encodeURIComponent(productA.id)}`);
  const productBUrl = absoluteUrl(`/products/${encodeURIComponent(productB.id)}`);
  const productAWebsite = publicHttpUrl(productA.url);
  const productBWebsite = publicHttpUrl(productB.url);
  const winner = match.winnerId === productA.id ? productA : match.winnerId === productB.id ? productB : null;
  const loser = winner?.id === productA.id ? productB : winner ? productA : null;
  const shareText = winner && loser
    ? `⚔️ ${winner.title} just won an Indie Clash 1v1 against ${loser.title}. Read the real builder critiques: ${canonicalUrl}`
    : "";
  const shareUrl = shareText ? `https://x.com/intent/post?text=${encodeURIComponent(shareText)}` : "";
  const productAImage = trustedProductImageUrl(productA.logo);
  const productBImage = trustedProductImageUrl(productB.logo);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${productAUrl}#product`,
        name: productA.title,
        description: productA.tagline,
        url: productAUrl,
        image: productAImage ? (productAImage.startsWith("/") ? absoluteUrl(productAImage) : productAImage) : undefined,
        sameAs: productAWebsite,
      },
      {
        "@type": "Product",
        "@id": `${productBUrl}#product`,
        name: productB.title,
        description: productB.tagline,
        url: productBUrl,
        image: productBImage ? (productBImage.startsWith("/") ? absoluteUrl(productBImage) : productBImage) : undefined,
        sameAs: productBWebsite,
      },
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        name: `${productA.title} vs ${productB.title}`,
        description: descriptionFor(productA.title, productB.title),
        url: canonicalUrl,
        about: [{ "@id": `${productAUrl}#product` }, { "@id": `${productBUrl}#product` }],
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: 2,
          itemListElement: [
            { "@type": "ListItem", position: 1, item: { "@id": `${productAUrl}#product` } },
            { "@type": "ListItem", position: 2, item: { "@id": `${productBUrl}#product` } },
          ],
        },
        breadcrumb: { "@id": `${canonicalUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Indie Clash", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Arena matchups", item: absoluteUrl("/arena") },
          { "@type": "ListItem", position: 3, name: `${productA.title} vs ${productB.title}`, item: canonicalUrl },
        ],
      },
    ],
  };

  const productCards = [
    { product: productA, votes: match.votesA, percent: percentA, website: productAWebsite },
    { product: productB, votes: match.votesB, percent: percentB, website: productBWebsite },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />

      <PublicSiteHeader actionHref="/arena" actionLabel="Enter Arena" />

      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-zinc-900">Indie Clash</Link>
          <span aria-hidden="true" className="text-zinc-300">/</span>
          <Link href="/arena" className="transition hover:text-zinc-900">Arena matchups</Link>
          <span aria-hidden="true" className="text-zinc-300">/</span>
          <span aria-current="page" className="text-zinc-700 font-medium">{productA.title} vs {productB.title}</span>
        </nav>

        <header className="mb-12 text-center">
          <span className="inline-flex rounded-full border border-violet-200/80 bg-violet-50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-700 font-medium">
            Recorded round {match.roundNumber} matchup
          </span>
          <h1 className="mx-auto mt-5 max-w-5xl text-3xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
            <Link href={`/products/${productA.id}`} className="transition hover:text-amber-600">{productA.title}</Link>
            <span className="mx-3 font-light italic text-zinc-400">vs</span>
            <Link href={`/products/${productB.id}`} className="transition hover:text-amber-600">{productB.title}</Link>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-zinc-600 sm:text-base">A real Indie Clash matchup with its recorded result, product details, and vote-by-vote builder feedback.</p>
        </header>

        <section aria-label="Match result" className="mb-10 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs sm:p-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <strong className="block text-3xl font-bold text-zinc-950">{percentA}%</strong>
              <span className="text-sm text-zinc-500">{productA.title} · {match.votesA} votes</span>
            </div>
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1 font-mono text-xs text-zinc-600">{totalVotes} total votes</span>
            <div className="text-right">
              <strong className="block text-3xl font-bold text-zinc-950">{percentB}%</strong>
              <span className="text-sm text-zinc-500">{productB.title} · {match.votesB} votes</span>
            </div>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100 border border-zinc-200/60" role="img" aria-label={`${productA.title} ${percentA} percent, ${productB.title} ${percentB} percent`}>
            <div className="bg-zinc-900" style={{ width: `${percentA}%` }} />
            <div className="bg-violet-600" style={{ width: `${percentB}%` }} />
          </div>
          {match.winnerId ? (
            <p className="mt-4 text-center text-sm text-zinc-500">Winner: <strong className="text-zinc-950">{match.winnerId === productA.id ? productA.title : productB.title}</strong></p>
          ) : (
            <p className="mt-4 text-center text-sm text-zinc-500">This matchup is still open.</p>
          )}
          {winner && loser ? (
            <div className="mt-6 grid gap-3 border-t border-zinc-100 pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <CopyLink value={shareText} />
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener"
                className="rounded-md bg-zinc-900 px-4 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-zinc-800 shadow-xs"
              >
                Share result on X ↗
              </a>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="comparison-heading">
          <h2 id="comparison-heading" className="sr-only">Product comparison</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {productCards.map(({ product, votes, percent, website }) => (
              <article key={product.id} className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs transition hover:border-zinc-300 sm:p-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-2xs">
                    <ProductLogo logo={product.logo} title={product.title} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-zinc-950"><Link href={`/products/${product.id}`} className="transition hover:text-amber-600">{product.title}</Link></h3>
                    <span className="font-mono text-xs text-zinc-500">{votes} votes · {percent}%</span>
                  </div>
                </div>
                <p className="mt-6 min-h-14 text-sm leading-7 text-zinc-600">{product.tagline}</p>
                <dl className="mt-6 space-y-3 border-t border-zinc-100 pt-5 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">Maker</dt><dd className="text-right text-zinc-800 font-medium">{product.makerName}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">Build timeframe</dt><dd className="text-zinc-800 font-medium">{product.shipTimeframe}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">All-time arena votes</dt><dd className="text-zinc-800 font-medium">{product.votesCount}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={`/products/${product.id}`} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 shadow-2xs">View profile</Link>
                  {website ? <a href={website} target="_blank" rel={productLinkRel(product)} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 shadow-xs">Visit {product.title} official website ↗</a> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="feedback-heading">
          <div className="mb-6 border-b border-zinc-200/80 pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Vote context</p>
            <h2 id="feedback-heading" className="mt-1 text-2xl font-bold text-zinc-950">Builder feedback from this matchup</h2>
          </div>
          {critiques.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {[productA, productB].map((product) => {
                const productFeedback = critiques.map((critique) => ({
                  id: critique.id,
                  voter: critique.voter,
                  body: critique.votedProductId === product.id ? critique.winnerFeedback : critique.loserFeedback,
                  kind: critique.votedProductId === product.id ? "Reason for the vote" : "Constructive critique",
                })).filter((item) => item.body.trim());
                return (
                  <div key={product.id}>
                    <h3 className="mb-4 font-bold text-zinc-950">Feedback about <Link href={`/products/${product.id}`} className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900">{product.title}</Link></h3>
                    <div className="space-y-4">
                      {productFeedback.map((feedback) => (
                        <article key={`${product.id}-${feedback.id}`} className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-2xs">
                          <div className="mb-3 flex flex-wrap justify-between gap-2 font-mono text-[11px]"><span className="text-zinc-800 font-semibold">{feedback.voter}</span><span className="text-violet-700 font-medium">{feedback.kind}</span></div>
                          <p className="text-sm leading-7 text-zinc-600">{feedback.body}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-sm text-zinc-500">No public critique was submitted in this matchup.</p>
          )}
        </section>

        <section className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-8 sm:flex-row sm:items-center shadow-xs">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950">Put your product in the arena</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Publish a real product profile, face other builders, and collect actionable feedback.</p>
          </div>
          <Link href="/?submit=1" className="shrink-0 rounded-xl bg-[#ffbe18] px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-[#e0a612] shadow-xs">Submit a product</Link>
        </section>
      </main>

      <footer className="relative mt-16 border-t border-zinc-200/80 bg-zinc-50/50 py-10 text-center font-mono text-xs text-zinc-500">
        © 2026 Indie Clash. Match results are based on recorded community votes.
      </footer>
    </div>
  );
}
