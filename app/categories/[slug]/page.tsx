import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Product } from "@/lib/mockData";
import { fetchCloudProducts } from "@/lib/arenaStore";
import { PRODUCT_CATEGORIES } from "@/lib/productTaxonomy";
import { compareFairDiscovery } from "@/lib/discoveryRanking";
import { absoluteUrl, publicHttpUrl, serializeJsonLd, trustedProductImageUrl } from "@/lib/site";

interface Props { params: Promise<{ slug: string }> }

export const dynamic = "force-dynamic";
const getProducts = cache(fetchCloudProducts);

export function generateStaticParams() {
  return PRODUCT_CATEGORIES.map((category) => ({ slug: category.value }));
}

function categoryFromSlug(slug: string) {
  return PRODUCT_CATEGORIES.find((category) => category.value === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
  if (image) return <img src={image} alt={`${product.title} logo`} className="h-9 w-9 rounded-md object-contain" />;
  return <span className="text-2xl" aria-hidden="true">{product.logo && product.logo.length <= 8 ? product.logo : "🚀"}</span>;
}

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((product) => {
        const website = publicHttpUrl(product.url);
        return (
          <article key={product.id} className="flex flex-col rounded-xl border border-white/[0.07] bg-[#121215]/75 p-5 transition hover:-translate-y-0.5 hover:border-white/[0.15]">
            <div className="flex items-start gap-4">
              <Link href={`/products/${encodeURIComponent(product.id)}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/30"><ProductMark product={product} /></Link>
              <div className="min-w-0"><h3 className="font-semibold"><Link href={`/products/${encodeURIComponent(product.id)}`} className="hover:text-[#ffbe18]">{product.title}</Link></h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{product.tagline}</p></div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-zinc-500"><span>By {product.makerName}</span><span>{product.votesCount} votes</span></div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><Link href={`/products/${encodeURIComponent(product.id)}`} className="rounded-md border border-white/[0.1] px-3 py-2 hover:bg-white/[0.05]">View profile</Link>{website ? <a href={website} target="_blank" rel="noopener" className="px-3 py-2 text-[#ffbe18]">Visit website ↗</a> : null}</div>
          </article>
        );
      })}
    </div>
  );
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const products = (await getProducts()).filter((product) => product.category === category.value);
  const latest = [...products].sort((a, b) => new Date(b.publishedAt || b.submittedAt).getTime() - new Date(a.publishedAt || a.submittedAt).getTime());
  const unseen = [...products].sort((a, b) => compareFairDiscovery(a, b)).slice(0, 6);
  const canonicalUrl = absoluteUrl(`/categories/${category.value}`);
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": canonicalUrl, name: `${category.label} Built by Indie Makers`, url: canonicalUrl, mainEntity: { "@type": "ItemList", numberOfItems: products.length, itemListElement: latest.map((product, index) => ({ "@type": "ListItem", position: index + 1, name: product.title, url: absoluteUrl(`/products/${product.id}`) })) } };

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#17121f] via-[#0B0B0C] to-[#0B0B0C]" />
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 py-4 backdrop-blur-md"><div className="mx-auto flex max-w-6xl items-center justify-between px-4"><Link href="/" className="text-xl font-semibold tracking-tight">INDIE CLASH</Link><Link href="/categories" className="text-xs text-zinc-400 hover:text-white">All categories</Link></div></header>
      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500"><Link href="/">Indie Clash</Link><span>/</span><Link href="/categories">Categories</Link><span>/</span><span className="text-zinc-300">{category.label}</span></nav>
        <section className="mb-14 max-w-4xl"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A78BFA]">Indie category</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{category.label} built by indie makers</h1><p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">{category.description} Discover recent launches and overlooked products that deserve more attention. Rankings never depend on payment.</p><span className="mt-6 inline-block rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-400">{products.length} products</span></section>
        {products.length ? <div className="space-y-16"><section><div className="mb-5 border-b border-white/[0.08] pb-4"><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Recently launched</p><h2 className="mt-1 text-2xl font-semibold">New {category.label}</h2></div><ProductGrid products={latest} /></section><section><div className="mb-5 border-b border-white/[0.08] pb-4"><p className="font-mono text-[10px] uppercase tracking-wider text-[#A78BFA]">Fair discovery</p><h2 className="mt-1 text-2xl font-semibold">Underrated {category.label}</h2></div><ProductGrid products={unseen} /></section></div> : <section className="rounded-xl border border-dashed border-white/[0.1] p-10 text-center text-zinc-500">No products have selected this category yet. The page will become indexable after it has enough useful content.</section>}
      </main>
    </div>
  );
}
