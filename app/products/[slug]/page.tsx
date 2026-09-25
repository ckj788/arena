import type { Metadata } from "next";
import Link from "@/app/components/NavigationLink";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import { notFound, permanentRedirect } from "next/navigation";
import CopyLink from "@/app/components/CopyLink";
import { getProductSeoData, getPublicProducts, matchSlug } from "@/lib/server/publicSeoData";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";
import ReportProduct from "@/app/components/ReportProduct";
import ProductGallery from "@/app/components/ProductGallery";
import { categoryLabel, pricingLabel } from "@/lib/productTaxonomy";
import { RESOURCE_PATH } from "@/lib/launchResources";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 1800;

export async function generateStaticParams() {
  try {
    const products = await getPublicProducts();
    return products.map((product) => ({ slug: product.id }));
  } catch (error) {
    // Dynamic paths still work when the optional build-time product listing is
    // temporarily unavailable. The route itself validates the requested slug.
    console.warn("[INDIE CLASH] Skipping product prerender during data outage:", error);
    return [];
  }
}

function conciseDescription(title: string, tagline: string, longDescription?: string) {
  const source = longDescription || tagline;
  const description = `${title}: ${source}`;
  return description.length <= 160 ? description : `${description.slice(0, 157).trimEnd()}…`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductSeoData(slug);
  if (!data) notFound();

  const { product } = data;
  const canonicalPath = `/products/${encodeURIComponent(product.id)}`;
  const description = conciseDescription(product.title, product.tagline, product.description);
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
  const image = trustedProductImageUrl(logo);
  if (image) return <img src={image} alt={`${title} logo`} className={`${className} rounded-lg object-contain bg-white`} />;
  const compactSymbol = logo && logo.length <= 8 && !logo.includes(":") && !logo.includes("/") ? logo : "🚀";
  return <span className="text-5xl" aria-hidden="true">{compactSymbol}</span>;
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
  const productCategory = categoryLabel(product.category);
  const productPricing = pricingLabel(product.pricingModel);
  const publishedDate = product.submittedAt ? new Date(product.submittedAt) : null;
  const validPublishedDate = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate : null;
  const faqEntries = [
    {
      question: `What is ${product.title}?`,
      answer: `${product.title} is an indie product by ${product.makerName}. ${product.tagline}`,
    },
    {
      question: `Who made ${product.title}?`,
      answer: `${product.title} was submitted by ${product.makerName}.`,
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
        description: product.description || product.tagline,
        category: productCategory || undefined,
        audience: product.targetAudience ? { "@type": "Audience", audienceType: product.targetAudience } : undefined,
        url: canonicalUrl,
        image: trustedProductImageUrl(product.logo)
          ? (product.logo.startsWith("/") ? absoluteUrl(product.logo) : product.logo)
          : undefined,
        sameAs: productWebsite,
        additionalProperty: [
          { "@type": "PropertyValue", name: "Arena votes", value: product.votesCount },
          { "@type": "PropertyValue", name: "Arena matches", value: matchups.length },
          { "@type": "PropertyValue", name: "Arena wins", value: wins },
          productPricing ? { "@type": "PropertyValue", name: "Pricing", value: productPricing } : undefined,
          product.platforms?.length ? { "@type": "PropertyValue", name: "Platforms", value: product.platforms.join(", ") } : undefined,
        ].filter(Boolean),
      },
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        name: `${product.title} — Product Profile`,
        description: conciseDescription(product.title, product.tagline, product.description),
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
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />

      <PublicSiteHeader actionHref="/products" actionLabel="All products" />

      <main className="relative mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-zinc-950">Indie Clash</Link>
          <span aria-hidden="true">/</span>
          <Link href="/products" className="transition hover:text-zinc-950">Products</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-zinc-700 font-semibold">{product.title}</span>
        </nav>

        <article>
          <header className="mb-10 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
                <ProductLogo logo={product.logo} title={product.title} className="h-16 w-16" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-violet-700 font-semibold">Indie product profile</p>
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">{product.title}</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">{product.tagline}</p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
                  <span>Built by <strong className="font-semibold text-zinc-950">{product.makerName}</strong></span>
                  {validPublishedDate ? <time dateTime={validPublishedDate.toISOString()}>Launched {validPublishedDate.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" })}</time> : null}
                </div>
                {(productCategory || productPricing || product.platforms?.length) ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {productCategory && product.category ? <Link href={`/categories/${product.category}`} className="rounded-full border border-violet-200/80 bg-violet-50 px-3 py-1 text-xs text-violet-700 font-medium transition hover:border-violet-300">{productCategory}</Link> : null}
                    {productPricing ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 font-medium">{productPricing}</span> : null}
                    {product.platforms?.map((platform) => <span key={platform} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 font-medium">{platform}</span>)}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-6 sm:grid-cols-4">
              {[
                ["Arena votes", product.votesCount],
                ["Matches", matchups.length],
                ["Wins", wins],
                ["Critiques", critiques.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 shadow-2xs">
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
                  <strong className="mt-1 block text-2xl font-bold text-zinc-950">{value}</strong>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {productWebsite ? (
                <a href={productWebsite} target="_blank" rel={productLinkRel(product)} className="rounded-xl bg-[#ffbe18] px-5 py-3 text-sm font-semibold text-zinc-950 shadow-xs transition hover:bg-[#e0a612]">
                  Visit {product.title} official website ↗
                </a>
              ) : null}
              {product.makerTwitter ? (
                <a href={`https://x.com/${product.makerTwitter.replace(/^@/, "")}`} target="_blank" rel="ugc noopener noreferrer" className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 hover:text-zinc-950">
                  Follow {product.makerTwitter}
                </a>
              ) : null}
              <a href={`https://x.com/intent/post?text=${encodeURIComponent(`${product.title} on Indie Clash\n\n${canonicalUrl}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 hover:text-zinc-950">
                Share profile
              </a>
            </div>
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-12">
              <section aria-labelledby="about-heading">
                <div className="mb-5 border-b border-zinc-200/80 pb-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Product overview</p>
                  <h2 id="about-heading" className="mt-1 text-2xl font-semibold text-zinc-950">About {product.title}</h2>
                </div>
                <ProductGallery title={product.title} images={(product.screenshots ?? (product.screenshot ? [product.screenshot] : [])).map(trustedProductImageUrl).filter((src): src is string => Boolean(src)).slice(0, 5)} />
                <p className="whitespace-pre-line text-base leading-8 text-zinc-600">
                  {product.description || <><strong>{product.title}</strong> is an independent product created by {product.makerName}. {product.tagline}{validPublishedDate ? ` It was listed on Indie Clash on ${validPublishedDate.toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })}.` : ""}</>}
                </p>
                <ReportProduct productId={product.id} />
                {product.targetAudience ? (
                  <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-5 shadow-2xs">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Built for</span>
                    <p className="mt-2 leading-7 text-zinc-600">{product.targetAudience}</p>
                  </div>
                ) : null}
              </section>

              {product.makerStory ? (
                <section aria-labelledby="maker-story-heading">
                  <div className="mb-5 border-b border-zinc-200/80 pb-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Behind the build</p>
                    <h2 id="maker-story-heading" className="mt-1 text-2xl font-semibold text-zinc-950">Why {product.makerName} built it</h2>
                  </div>
                  <p className="whitespace-pre-line text-base leading-8 text-zinc-600">{product.makerStory}</p>
                </section>
              ) : null}

              {product.feedbackRequest ? (
                <section aria-labelledby="feedback-request-heading" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-2xs">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800 font-semibold">Maker feedback request</p>
                  <h2 id="feedback-request-heading" className="mt-2 text-xl font-semibold text-zinc-950">What feedback would help most?</h2>
                  <p className="mt-3 whitespace-pre-line leading-7 text-zinc-700">{product.feedbackRequest}</p>
                </section>
              ) : null}

              <section aria-labelledby="critiques-heading">
                <div className="mb-5 flex items-end justify-between border-b border-zinc-200/80 pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Community signal</p>
                    <h2 id="critiques-heading" className="mt-1 text-2xl font-semibold text-zinc-950">Builder feedback</h2>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{critiques.length} entries</span>
                </div>
                {critiques.length ? (
                  <div className="space-y-4">
                    {critiques.map((critique) => (
                      <article key={critique.id} className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-zinc-950">{critique.voter}</span>
                          <span className={critique.kind === "support" ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                            {critique.kind === "support" ? "Why this builder picked it" : "Constructive critique"}
                          </span>
                        </div>
                        <p className="leading-7 text-zinc-600">{critique.body}</p>
                        {critique.createdAt ? <time dateTime={critique.createdAt} className="mt-3 block text-[11px] text-zinc-400 font-mono">{new Date(critique.createdAt).toLocaleDateString("en")}</time> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-sm leading-6 text-zinc-500 shadow-2xs">
                    No public critique has been recorded for this product yet. Feedback appears here after a real arena vote.
                  </div>
                )}
              </section>

              <section aria-labelledby="matches-heading">
                <div className="mb-5 border-b border-zinc-200/80 pb-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Arena history</p>
                  <h2 id="matches-heading" className="mt-1 text-2xl font-semibold text-zinc-950">Matchups</h2>
                </div>
                {matchups.length ? (
                  <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
                    {matchups.map(({ match, opponent }) => {
                      const productVotes = match.productAId === product.id ? match.votesA : match.votesB;
                      const opponentVotes = match.productAId === product.id ? match.votesB : match.votesA;
                      return (
                        <Link key={match.id} href={`/versus/${matchSlug(match)}`} className="flex items-center justify-between gap-4 p-5 transition hover:bg-zinc-50">
                          <div>
                            <span className="text-sm text-zinc-500">Round {match.roundNumber}</span>
                            <p className="mt-1 font-semibold text-zinc-950">{product.title} vs {opponent.title}</p>
                          </div>
                          <span className="shrink-0 font-mono text-sm text-zinc-600 font-medium">{productVotes}–{opponentVotes} →</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500 shadow-2xs">This product has not entered a recorded matchup yet.</p>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs p-5">
                <h2 className="text-lg font-semibold text-zinc-950">Shareable launch badge</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">Optionally link visitors to this public profile from your site or README.</p>
                <a href={canonicalUrl} className="mt-5 inline-block">
                  <img src="https://img.shields.io/badge/Featured_on-Indie_Clash-ffbe18?style=flat-square" alt="Featured on Indie Clash" />
                </a>
                <div className="mt-5 space-y-4">
                  <div>
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Product page</span>
                    <CopyLink value={canonicalUrl} />
                  </div>
                  <div>
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Markdown badge</span>
                    <textarea aria-label="Copy launch badge Markdown" readOnly value={`[![Featured on Indie Clash](https://img.shields.io/badge/Featured_on-Indie_Clash-ffbe18?style=flat-square)](${canonicalUrl})`} className="h-20 w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-[10px] leading-normal text-zinc-700 focus:outline-none" />
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {relatedProducts.length ? (
            <section className="mt-16 border-t border-zinc-200/80 pt-10" aria-labelledby="related-heading">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Keep exploring</p>
              <h2 id="related-heading" className="mt-1 text-2xl font-semibold text-zinc-950">More indie products</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedProducts.map((related) => (
                  <Link key={related.id} href={`/products/${encodeURIComponent(related.id)}`} className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-xs">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50">
                      <ProductLogo logo={related.logo} title={related.title} className="h-8 w-8" />
                    </div>
                    <h3 className="font-semibold text-zinc-950">{related.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{related.tagline}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-16 border-t border-zinc-200/80 pt-10" aria-labelledby="faq-heading">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Product questions</p>
            <h2 id="faq-heading" className="mt-1 text-2xl font-semibold text-zinc-950">Frequently asked questions about {product.title}</h2>
            <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs px-5">
              {faqEntries.map((entry) => (
                <article key={entry.question} className="py-5">
                  <h3 className="font-semibold text-zinc-950">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{entry.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-16 flex flex-col items-start justify-between gap-6 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-8 sm:flex-row sm:items-center shadow-xs">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-950">Launch your own indie product</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Create a public product profile, enter real 1v1 matchups, and collect useful builder feedback.</p>
              <Link href={RESOURCE_PATH} className="mt-3 inline-block text-sm font-medium text-violet-700 hover:underline">Explore more places to launch your startup →</Link>
            </div>
            <Link href="/?submit=1" className="shrink-0 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 transition shadow-xs">Submit a product</Link>
          </section>
        </article>
      </main>

      <footer className="relative mt-16 border-t border-zinc-200/80 bg-zinc-50/70 py-10 text-center font-mono text-xs text-zinc-500">
        © 2026 Indie Clash. Products and critiques are submitted by the builder community.
      </footer>
    </div>
  );
}
