import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { fetchCloudProducts } from "@/lib/arenaStore";
import { PRODUCT_CATEGORIES } from "@/lib/productTaxonomy";
import { absoluteUrl, serializeJsonLd } from "@/lib/site";

export const dynamic = "force-dynamic";
const getProducts = cache(fetchCloudProducts);

export async function generateMetadata(): Promise<Metadata> {
  const categorizedCount = (await getProducts()).filter((product) => product.category).length;
  return {
    title: "Indie Product Categories",
    description: "Browse indie products by practical category, from AI and developer tools to productivity, design, marketing, video, founder tools, and SaaS.",
    alternates: { canonical: "/categories" },
    robots: categorizedCount >= 4 ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CategoriesPage() {
  const products = await getProducts();
  const categories = PRODUCT_CATEGORIES.map((category) => ({
    ...category,
    products: products.filter((product) => product.category === category.value),
  }));
  const canonicalUrl = absoluteUrl("/categories");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonicalUrl,
    name: "Indie Product Categories",
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories.map((category, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: category.label,
        url: absoluteUrl(`/categories/${category.value}`),
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
          <div className="flex items-center gap-4 text-xs text-zinc-400"><Link href="/underrated" className="transition hover:text-white">Underrated</Link><Link href="/products" className="transition hover:text-white">All products</Link></div>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-white">Indie Clash</Link><span>/</span><span className="text-zinc-300">Categories</span>
        </nav>
        <section className="mb-12 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A78BFA]">Focused discovery</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Browse indie product categories</h1>
          <p className="mt-5 text-base leading-7 text-zinc-300">A small, useful taxonomy built around what visitors are actually trying to discover—not hundreds of empty SEO pages.</p>
        </section>
        <section className="grid gap-px overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <Link key={category.value} href={`/categories/${category.value}`} className="group min-h-44 bg-[#0a0a0c] p-5 transition hover:bg-[#101013]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{category.products.length} products</span>
              <h2 className="mt-8 text-lg font-semibold transition group-hover:text-[#ffbe18]">{category.label}</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{category.description}</p>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
