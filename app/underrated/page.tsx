import type { Metadata } from "next";
import Link from "@/app/components/NavigationLink";
import type { Product } from "@/lib/mockData";
import { getPublicProducts } from "@/lib/server/publicSeoData";
import { categoryLabel } from "@/lib/productTaxonomy";
import { compareFairDiscovery, hasActiveDiscoveryBoost } from "@/lib/discoveryRanking";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";

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
  if (image) return <img src={image} alt={`${product.title} logo`} className="h-9 w-9 rounded-md object-contain" />;
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
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#17121f] via-[#0B0B0C] to-[#0B0B0C]" />
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">INDIE CLASH</Link>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            
            <Link href="/products" className="transition hover:text-white">All products</Link>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-white">Indie Clash</Link><span>/</span><span className="text-zinc-300">Underrated</span>
        </nav>
        <section className="mb-12 max-w-4xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A78BFA]">Fair discovery</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Underrated indie products</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">Products with the least qualified visibility rise first. Nobody can buy this position, and popularity never locks a new maker out.</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-zinc-400">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">{products.length} products</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">Lowest visibility first</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">No paid ranking</span>
          </div>
        </section>

        {products.length ? (
          <section aria-labelledby="underrated-list-heading">
            <div className="mb-5 border-b border-white/[0.08] pb-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">New &amp; unseen</p>
              <h2 id="underrated-list-heading" className="mt-1 text-2xl font-semibold">Products that need more eyes</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const website = publicHttpUrl(product.url);
                const category = categoryLabel(product.category);
                const boosted = hasActiveDiscoveryBoost(product);
                return (
                  <article key={product.id} className="product-card relative flex flex-col rounded-xl border border-white/[0.07] bg-[#121215]/75 p-5 transition hover:-translate-y-0.5 hover:border-white/[0.15]">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/30"><ProductMark product={product} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold"><Link href={`/products/${encodeURIComponent(product.id)}`} className="card-primary-link transition hover:text-[#ffbe18]">{product.title}</Link></h3>
                          {boosted ? <span className="rounded border border-[#A78BFA]/20 bg-[#A78BFA]/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#A78BFA]">Peer boost</span> : null}
                          {category && product.category ? <Link href={`/categories/${product.category}`} className="card-secondary-link font-mono text-[9px] uppercase tracking-wider text-[#A78BFA]">{category}</Link> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{product.tagline}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-zinc-500"><span>By {product.makerName}</span><span>Needs more eyes</span></div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                      <span aria-hidden="true" className="inline-flex min-h-11 items-center text-zinc-300">View product →</span>
                      {website ? <a href={website} target="_blank" rel="noopener" className="card-secondary-link px-3 py-2 text-[#ffbe18]">Visit website ↗</a> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-white/[0.1] p-10 text-center text-zinc-500">The discovery queue is waiting for its first launch.</section>
        )}
      </main>
    </div>
  );
}
