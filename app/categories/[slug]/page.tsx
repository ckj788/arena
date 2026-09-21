import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Product } from "@/lib/mockData";
import { fetchCloudProducts } from "@/lib/arenaStore";
import { PRODUCT_CATEGORIES, PUBLIC_CATEGORIES_ENABLED } from "@/lib/productTaxonomy";
import { compareFairDiscovery } from "@/lib/discoveryRanking";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";
import { productLinkRel } from "@/lib/productSafety";

interface Props { params: Promise<{ slug: string }> }

export const dynamic = "force-dynamic";
const getProducts = cache(fetchCloudProducts);

export function generateStaticParams() {
  if (!PUBLIC_CATEGORIES_ENABLED) return [];
  return PRODUCT_CATEGORIES.map((category) => ({ slug: category.value }));
}

function categoryFromSlug(slug: string) {
  return PRODUCT_CATEGORIES.find((category) => category.value === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!PUBLIC_CATEGORIES_ENABLED) notFound();
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const count = (await getProducts()).filter((product) => product.category === category.value).length;
  const description = `${category.description} Browse recent and underrated launches from indie makers.`;
  return {
    title: `${category.label} Built by Indie Makers`,
    description,
    alternates: { canonical: `/categories/${category.value}` },
    robots: count >= 4 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: `${category.label} Built by Indie Makers`, description, url: `/categories/${category.value}`, siteName: "Indie Clash", type: "website" },
  };
}

function ProductMark({ product }: { product: Product }) {
  const image = trustedProductImageUrl(product.logo);
  if (image) return <img src={image} alt={`${product.title} logo`} className="h-9 w-9 rounded-md object-contain bg-white" />;
  return <span className="text-2xl" aria-hidden="true">{product.logo && product.logo.length <= 8 ? product.logo : "🚀"}</span>;
}

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((product) => {
        const website = publicHttpUrl(product.url);
        return (
          <article key={product.id} className="flex flex-col rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm">
            <div className="flex items-start gap-4">
              <Link href={`/products/${encodeURIComponent(product.id)}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-white shadow-2xs">
                <ProductMark product={product} />
              </Link>
              <div className="min-w-0">
                <h3 className="font-bold text-zinc-950">
                  <Link href={`/products/${encodeURIComponent(product.id)}`} className="hover:text-amber-600 transition">{product.title}</Link>
                </h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">{product.tagline}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              <span>By {product.makerName}</span>
              <span className="font-mono">{product.votesCount} votes</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <Link href={`/products/${encodeURIComponent(product.id)}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-700 shadow-2xs transition hover:bg-zinc-50">
                View profile
              </Link>
              {website ? (
                <a href={website} target="_blank" rel={productLinkRel(product)} className="px-3 py-2 text-amber-600 hover:text-amber-700 font-semibold transition">
                  Visit website ↗
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default async function CategoryPage({ params }: Props) {
  if (!PUBLIC_CATEGORIES_ENABLED) notFound();
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const products = (await getProducts()).filter((product) => product.category === category.value);
  const latest = [...products].sort((a, b) => new Date(b.publishedAt || b.submittedAt).getTime() - new Date(a.publishedAt || a.submittedAt).getTime());
  const unseen = [...products].sort((a, b) => compareFairDiscovery(a, b)).slice(0, 6);
  const canonicalUrl = absoluteUrl(`/categories/${category.value}`);
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": canonicalUrl, name: `${category.label} Built by Indie Makers`, url: canonicalUrl, mainEntity: { "@type": "ItemList", numberOfItems: products.length, itemListElement: latest.map((product, index) => ({ "@type": "ListItem", position: index + 1, name: product.title, url: absoluteUrl(`/products/${product.id}`) })) } };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/80 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-zinc-950">INDIE CLASH</Link>
          <Link href="/categories" className="text-xs text-zinc-500 hover:text-zinc-900">All categories</Link>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-zinc-900">Indie Clash</Link>
          <span className="text-zinc-300">/</span>
          <Link href="/categories" className="transition hover:text-zinc-900">Categories</Link>
          <span className="text-zinc-300">/</span>
          <span className="text-zinc-700 font-medium">{category.label}</span>
        </nav>
        <section className="mb-14 max-w-4xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-violet-700 font-medium">Indie category</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950 sm:text-6xl">{category.label} built by indie makers</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-600">{category.description} Discover recent launches and overlooked products that deserve more attention. Rankings never depend on payment.</p>
          <span className="mt-6 inline-block rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-zinc-600 shadow-2xs">{products.length} products</span>
        </section>
        {products.length ? (
          <div className="space-y-16">
            <section>
              <div className="mb-5 border-b border-zinc-200/80 pb-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Recently launched</p>
                <h2 className="mt-1 text-2xl font-bold text-zinc-950">New {category.label}</h2>
              </div>
              <ProductGrid products={latest} />
            </section>
            <section>
              <div className="mb-5 border-b border-zinc-200/80 pb-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-violet-700 font-medium">Fair discovery</p>
                <h2 className="mt-1 text-2xl font-bold text-zinc-950">Underrated {category.label}</h2>
              </div>
              <ProductGrid products={unseen} />
            </section>
          </div>
        ) : (
          <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center text-zinc-500">
            No products have selected this category yet. The page will become indexable after it has enough useful content.
          </section>
        )}
      </main>
    </div>
  );
}
