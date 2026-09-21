import type { Metadata } from "next";
import Link from "@/app/components/NavigationLink";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import type { Product } from "@/lib/mockData";
import { getPublicProducts } from "@/lib/server/publicSeoData";
import { categoryLabel } from "@/lib/productTaxonomy";
import { compareFairDiscovery, hasActiveDiscoveryBoost } from "@/lib/discoveryRanking";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";

export const revalidate = 60;

const pageDescription = "Discover overlooked indie products with low qualified visibility—not paid placements or popularity contests.";

export async function generateMetadata(): Promise<Metadata> {
  const productCount = (await getPublicProducts()).length;
  return {
    title: "Underrated Indie Products That Deserve More Attention",
    description: pageDescription,
    alternates: { canonical: "/underrated" },
    robots: productCount >= 6 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: "Underrated Indie Products",
      description: pageDescription,
      url: "/underrated",
      siteName: "Indie Clash",
      type: "website",
    },
  };
}

function ProductMark({ product }: { product: Product }) {
  const image = trustedProductImageUrl(product.logo);
  if (image) return <img src={image} alt={`${product.title} logo`} className="h-9 w-9 rounded-md object-contain bg-white" />;
  const compactSymbol = product.logo && product.logo.length <= 8 && !product.logo.includes(":") && !product.logo.includes("/") ? product.logo : "🚀";
  return <span className="text-2xl" aria-hidden="true">{compactSymbol}</span>;
}

export default async function UnderratedPage() {
  const products = (await getPublicProducts()).slice().sort((a, b) => compareFairDiscovery(a, b));
  const canonicalUrl = absoluteUrl("/underrated");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonicalUrl,
    name: "Underrated Indie Products",
    description: pageDescription,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.title,
        url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
      })),
    },
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />
      <PublicSiteHeader actionHref="/products" actionLabel="All products" />
      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-zinc-900">Indie Clash</Link>
          <span className="text-zinc-300">/</span>
          <span className="text-zinc-700 font-medium">Underrated</span>
        </nav>
        <section className="mb-12 max-w-4xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-violet-700 font-medium">Fair discovery</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950 sm:text-6xl">Underrated indie products</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">Products with the least qualified visibility rise first. Nobody can buy this position, and popularity never locks a new maker out.</p>
          <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs text-zinc-600">
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1.5 shadow-2xs">{products.length} products</span>
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1.5 shadow-2xs">Lowest visibility first</span>
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1.5 shadow-2xs">No paid ranking</span>
          </div>
        </section>

        {products.length ? (
          <section aria-labelledby="underrated-list-heading">
            <div className="mb-5 border-b border-zinc-200/80 pb-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-medium">New &amp; unseen</p>
              <h2 id="underrated-list-heading" className="mt-1 text-2xl font-bold text-zinc-950">Products that need more eyes</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const website = publicHttpUrl(product.url);
                const category = categoryLabel(product.category);
                const boosted = hasActiveDiscoveryBoost(product);
                return (
                  <article key={product.id} className="product-card relative flex flex-col rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-white shadow-2xs">
                        <ProductMark product={product} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-bold text-zinc-950">
                            <Link href={`/products/${encodeURIComponent(product.id)}`} className="card-primary-link transition hover:text-amber-600">{product.title}</Link>
                          </h3>
                          {boosted ? <span className="rounded border border-violet-200/80 bg-violet-50 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-violet-700">Peer boost</span> : null}
                          {category && product.category ? <Link href={`/categories/${product.category}`} className="card-secondary-link font-mono text-[9px] uppercase tracking-wider text-violet-700 hover:text-violet-800">{category}</Link> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">{product.tagline}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs text-zinc-500">
                      <span>By {product.makerName}</span>
                      <span className="font-mono text-zinc-400">Needs more eyes</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span aria-hidden="true" className="inline-flex min-h-11 items-center text-zinc-700">View product →</span>
                      {website ? (
                        <a href={website} target="_blank" rel={productLinkRel(product)} className="card-secondary-link px-3 py-2 text-amber-600 hover:text-amber-700 transition">
                          Visit website ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center text-zinc-500">The discovery queue is waiting for its first launch.</section>
        )}
      </main>
    </div>
  );
}
