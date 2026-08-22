import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import CopyLink from "@/app/components/CopyLink";
import { getProductSeoData, matchSlug } from "@/lib/server/publicSeoData";
import { absoluteUrl, isPublicImageUrl, publicHttpUrl, serializeJsonLd } from "@/lib/site";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 1800;

function conciseDescription(title: string, tagline: string) {
  const description = `${title}: ${tagline} View its maker, launch details, arena match history, votes, and constructive community feedback.`;
  return description.length <= 160 ? description : `${description.slice(0, 157).trimEnd()}…`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductSeoData(slug);
  if (!data) notFound();

  const { product } = data;
  const canonicalPath = `/products/${encodeURIComponent(product.id)}`;
  const description = conciseDescription(product.title, product.tagline);
  const image = `/api/og/versus?slug=${encodeURIComponent(product.id)}`;

  return {
    title: `${product.title} — Product Profile`,
    description,
    authors: [{ name: product.makerName }],
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${product.title} — Indie Product Profile`,
      description,
      url: canonicalPath,
      siteName: "Indie Clash",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${product.title} on Indie Clash` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.title} — Indie Product Profile`,
      description,
      images: [image],
    },
  };
}

function ProductLogo({ logo, title, className = "h-14 w-14" }: { logo: string; title: string; className?: string }) {
  if (!logo) return <span className="text-4xl" aria-hidden="true">🚀</span>;
  if (logo.startsWith("data:image") || logo.startsWith("http") || logo.startsWith("/")) {
    return <img src={logo} alt={`${title} logo`} className={`${className} rounded-lg object-contain`} />;
  }
  return <span className="text-5xl" aria-hidden="true">{logo}</span>;
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const data = await getProductSeoData(slug);
  if (!data) notFound();

  const { product, critiques, matchups, relatedProducts, wins } = data;
  if (slug !== product.id) permanentRedirect(`/products/${encodeURIComponent(product.id)}`);

  const canonicalPath = `/products/${encodeURIComponent(product.id)}`;
  const canonicalUrl = absoluteUrl(canonicalPath);
  const productWebsite = publicHttpUrl(product.url);
  const publishedDate = product.submittedAt ? new Date(product.submittedAt) : null;
  const validPublishedDate = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate : null;
  const faqEntries = [
    {
      question: `What is ${product.title}?`,
      answer: `${product.title} is an indie product by ${product.makerName}. ${product.tagline}`,
    },
    {
      question: `Who made ${product.title}?`,
      answer: `${product.title} was submitted by ${product.makerName} and shipped in ${product.shipTimeframe}.`,
    },
    {
      question: `Has ${product.title} competed in the Indie Clash arena?`,
      answer: matchups.length
        ? `${product.title} has ${matchups.length} recorded matchup${matchups.length === 1 ? "" : "s"}, ${wins} win${wins === 1 ? "" : "s"}, and ${product.votesCount} arena vote${product.votesCount === 1 ? "" : "s"}.`
        : `${product.title} has a public launch profile but has not entered a recorded arena matchup yet.`,
    },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${canonicalUrl}#product`,
        name: product.title,
        description: product.tagline,
        url: canonicalUrl,
        image: isPublicImageUrl(product.logo)
          ? (product.logo.startsWith("/") ? absoluteUrl(product.logo) : product.logo)
          : undefined,
        sameAs: productWebsite,
        additionalProperty: [
          { "@type": "PropertyValue", name: "Build timeframe", value: product.shipTimeframe },
          { "@type": "PropertyValue", name: "Arena votes", value: product.votesCount },
          { "@type": "PropertyValue", name: "Arena matches", value: matchups.length },
          { "@type": "PropertyValue", name: "Arena wins", value: wins },
        ],
      },
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        name: `${product.title} — Product Profile`,
        description: conciseDescription(product.title, product.tagline),
        url: canonicalUrl,
        datePublished: validPublishedDate?.toISOString(),
        mainEntity: { "@id": `${canonicalUrl}#product` },
        breadcrumb: { "@id": `${canonicalUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Indie Clash", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Products", item: absoluteUrl("/products") },
          { "@type": "ListItem", position: 3, name: product.title, item: canonicalUrl },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${canonicalUrl}#faq`,
        mainEntity: faqEntries.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#17121f] via-[#0B0B0C] to-[#0B0B0C]" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/50 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-semibold tracking-tighter">INDIE CLASH</span>
            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">Products</span>
          </Link>
          <Link href="/products" className="rounded-md border border-white/[0.1] px-3.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.04] hover:text-white">
            Discover products
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-white">Indie Clash</Link>
          <span aria-hidden="true">/</span>
          <Link href="/products" className="transition hover:text-white">Products</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-zinc-300">{product.title}</span>
        </nav>

        <article>
          <header className="mb-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121215]/90 p-6 backdrop-blur sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#17171b]">
                <ProductLogo logo={product.logo} title={product.title} className="h-16 w-16" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#A78BFA]">Indie product profile</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{product.title}</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">{product.tagline}</p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
                  <span>Built by <strong className="font-medium text-zinc-200">{product.makerName}</strong></span>
                  <span>Shipped in {product.shipTimeframe}</span>
                  {validPublishedDate ? <time dateTime={validPublishedDate.toISOString()}>Launched {validPublishedDate.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" })}</time> : null}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-6 sm:grid-cols-4">
              {[
                ["Arena votes", product.votesCount],
                ["Matches", matchups.length],
                ["Wins", wins],
                ["Critiques", critiques.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
                  <strong className="mt-1 block text-2xl font-semibold">{value}</strong>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {productWebsite ? (
                <a href={productWebsite} target="_blank" rel="noopener" className="rounded-xl bg-[#ffbe18] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e0a612]">
                  Visit {product.title} official website ↗
                </a>
              ) : null}
              {product.makerTwitter ? (
                <a href={`https://x.com/${product.makerTwitter.replace(/^@/, "")}`} target="_blank" rel="ugc noopener noreferrer" className="rounded-xl border border-white/[0.1] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.05]">
                  Follow {product.makerTwitter}
                </a>
              ) : null}
              <a href={`https://x.com/intent/post?text=${encodeURIComponent(`${product.title} on Indie Clash\n\n${canonicalUrl}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/[0.1] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.05]">
                Share profile
              </a>
            </div>
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-12">
              <section aria-labelledby="about-heading">
                <div className="mb-5 border-b border-white/[0.08] pb-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Product overview</p>
                  <h2 id="about-heading" className="mt-1 text-2xl font-semibold">About {product.title}</h2>
                </div>
                <p className="text-base leading-8 text-zinc-300">
                  <strong>{product.title}</strong> is an independent product created by {product.makerName}. {product.tagline}
                  {validPublishedDate ? ` It was listed on Indie Clash on ${validPublishedDate.toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })}.` : ""}
                </p>
              </section>

              <section aria-labelledby="critiques-heading">
                <div className="mb-5 flex items-end justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Community signal</p>
                    <h2 id="critiques-heading" className="mt-1 text-2xl font-semibold">Builder feedback</h2>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{critiques.length} entries</span>
                </div>
                {critiques.length ? (
                  <div className="space-y-4">
                    {critiques.map((critique) => (
                      <article key={critique.id} className="rounded-xl border border-white/[0.07] bg-[#121215]/70 p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-zinc-300">{critique.voter}</span>
                          <span className={critique.kind === "support" ? "text-emerald-400" : "text-amber-300"}>
                            {critique.kind === "support" ? "Why this builder picked it" : "Constructive critique"}
                          </span>
                        </div>
                        <p className="leading-7 text-zinc-300">{critique.body}</p>
                        {critique.createdAt ? <time dateTime={critique.createdAt} className="mt-3 block text-[11px] text-zinc-600">{new Date(critique.createdAt).toLocaleDateString("en")}</time> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-sm leading-6 text-zinc-500">
                    No public critique has been recorded for this product yet. Feedback appears here after a real arena vote.
                  </div>
                )}
              </section>

              <section aria-labelledby="matches-heading">
                <div className="mb-5 border-b border-white/[0.08] pb-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Arena history</p>
                  <h2 id="matches-heading" className="mt-1 text-2xl font-semibold">Matchups</h2>
                </div>
                {matchups.length ? (
                  <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-[#121215]/70">
                    {matchups.map(({ match, opponent }) => {
                      const productVotes = match.productAId === product.id ? match.votesA : match.votesB;
                      const opponentVotes = match.productAId === product.id ? match.votesB : match.votesA;
                      return (
                        <Link key={match.id} href={`/versus/${matchSlug(match)}`} className="flex items-center justify-between gap-4 p-5 transition hover:bg-white/[0.03]">
                          <div>
                            <span className="text-sm text-zinc-500">Round {match.roundNumber}</span>
                            <p className="mt-1 font-semibold">{product.title} vs {opponent.title}</p>
                          </div>
                          <span className="shrink-0 font-mono text-sm text-zinc-300">{productVotes}–{opponentVotes} →</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/[0.08] p-8 text-sm text-zinc-500">This product has not entered a recorded matchup yet.</p>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-xl border border-white/[0.08] bg-[#121215]/80 p-5">
                <h2 className="text-lg font-semibold">Shareable launch badge</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">Optionally link visitors to this public profile from your site or README.</p>
                <a href={canonicalUrl} className="mt-5 inline-block">
                  <img src="https://img.shields.io/badge/%E2%9A%94%EF%B8%8F_Indie_Clash-Voted_on_Arena-ffbe18?style=flat-square" alt="Voted on Indie Clash" />
                </a>
                <div className="mt-5 space-y-4">
                  <div>
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Product page</span>
                    <CopyLink value={canonicalUrl} />
                  </div>
                  <div>
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Markdown badge</span>
                    <textarea readOnly value={`[![Voted on Indie Clash](https://img.shields.io/badge/%E2%9A%94%EF%B8%8F_Indie_Clash-Voted_on_Arena-ffbe18?style=flat-square)](${canonicalUrl})`} className="h-20 w-full rounded-md border border-white/[0.08] bg-zinc-950 p-2 font-mono text-[10px] leading-normal text-zinc-400" />
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {relatedProducts.length ? (
            <section className="mt-16 border-t border-white/[0.08] pt-10" aria-labelledby="related-heading">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Keep exploring</p>
              <h2 id="related-heading" className="mt-1 text-2xl font-semibold">More indie products</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedProducts.map((related) => (
                  <Link key={related.id} href={`/products/${encodeURIComponent(related.id)}`} className="rounded-xl border border-white/[0.07] bg-[#121215]/70 p-5 transition hover:-translate-y-0.5 hover:border-white/[0.15]">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                      <ProductLogo logo={related.logo} title={related.title} className="h-8 w-8" />
                    </div>
                    <h3 className="font-semibold">{related.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{related.tagline}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-16 border-t border-white/[0.08] pt-10" aria-labelledby="faq-heading">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Product questions</p>
            <h2 id="faq-heading" className="mt-1 text-2xl font-semibold">Frequently asked questions about {product.title}</h2>
            <div className="mt-6 divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#121215]/70 px-5">
              {faqEntries.map((entry) => (
                <article key={entry.question} className="py-5">
                  <h3 className="font-semibold text-zinc-100">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{entry.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-16 flex flex-col items-start justify-between gap-6 rounded-2xl border border-[#ffbe18]/20 bg-[#ffbe18]/[0.05] p-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Launch your own indie product</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Create a public product profile, enter real 1v1 matchups, and collect useful builder feedback.</p>
            </div>
            <Link href="/" className="shrink-0 rounded-xl bg-[#ffbe18] px-6 py-3 text-sm font-semibold text-black">Submit a product</Link>
          </section>
        </article>
      </main>

      <footer className="relative mt-16 border-t border-white/[0.06] py-10 text-center font-mono text-xs text-zinc-600">
        © 2026 Indie Clash. Products and critiques are submitted by the builder community.
      </footer>
    </div>
  );
}
