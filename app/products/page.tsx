import type { Metadata } from "next";
import Link from "next/link";
import type { Product } from "@/lib/mockData";
import { fetchCloudProducts } from "@/lib/arenaStore";
import {
  absoluteUrl,
  publicHttpUrl,
  serializeJsonLd,
  trustedProductImageUrl,
} from "@/lib/site";

export const dynamic = "force-dynamic";

const directoryDescription =
  "Discover newly launched indie products, visit their official websites, explore maker profiles, and follow real 1v1 arena results and builder feedback.";

export const metadata: Metadata = {
  title: "New Indie Products — Launches, Makers and Arena Results",
  description: directoryDescription,
  alternates: { canonical: "/products" },
  openGraph: {
    title: "Discover New Indie Products",
    description: directoryDescription,
    url: "/products",
    siteName: "Indie Clash",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "New indie products on Indie Clash" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Discover New Indie Products",
    description: directoryDescription,
    images: ["/og-image.png"],
  },
};

function ProductMark({ product }: { product: Product }) {
  const image = trustedProductImageUrl(product.logo);
  if (image) {
    return <img src={image} alt={`${product.title} logo`} className="h-10 w-10 rounded-lg object-contain" />;
  }
  // Legacy rows may contain an entire base64 image or an arbitrary remote URL.
  // Never render those untrusted/oversized values as visible fallback text.
  const compactSymbol = product.logo
    && product.logo.length <= 8
    && !product.logo.includes(":")
    && !product.logo.includes("/")
    ? product.logo
    : "🚀";
  return <span className="text-3xl" aria-hidden="true">{compactSymbol}</span>;
}

export default async function ProductsPage() {
  const products = (await fetchCloudProducts())
    .slice()
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const canonicalUrl = absoluteUrl("/products");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonicalUrl,
    name: "New Indie Products",
    description: directoryDescription,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/products/${encodeURIComponent(product.id)}`),
        name: product.title,
      })),
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Indie Clash", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Products", item: canonicalUrl },
      ],
    },
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white antialiased selection:bg-white selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#17121f] via-[#0B0B0C] to-[#0B0B0C]" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">INDIE CLASH</Link>
          <div className="flex items-center gap-3">
            <Link href="/#arena-section" className="hidden text-xs text-zinc-400 transition hover:text-white sm:inline">Live arena</Link>
            <Link href="/" className="rounded-lg bg-[#ffbe18] px-4 py-2 text-xs font-semibold text-black">Submit a product</Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/" className="transition hover:text-white">Indie Clash</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-zinc-300">Products</span>
        </nav>

        <section className="mb-12 max-w-4xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A78BFA]">Indie product directory</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Discover new indie products</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">{directoryDescription}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-zinc-400">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">{products.length} public profiles</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">Followed official-site links</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">Authenticated builder feedback</span>
          </div>
        </section>

        {products.length ? (
          <section aria-labelledby="product-directory-heading">
            <div className="mb-5 flex items-end justify-between border-b border-white/[0.08] pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Latest first</p>
                <h2 id="product-directory-heading" className="mt-1 text-2xl font-semibold">All product launches</h2>
              </div>
              <span className="font-mono text-xs text-zinc-600">Updated continuously</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const website = publicHttpUrl(product.url);
                const submittedAt = new Date(product.submittedAt);
                const hasDate = !Number.isNaN(submittedAt.getTime());
                return (
                  <article key={product.id} className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#121215]/80 p-5 transition hover:-translate-y-0.5 hover:border-white/[0.15]">
                    <div className="flex items-start gap-4">
                      <Link href={`/products/${encodeURIComponent(product.id)}`} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/25">
                        <ProductMark product={product} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold">
                          <Link href={`/products/${encodeURIComponent(product.id)}`} className="transition hover:text-[#ffbe18]">{product.title}</Link>
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{product.tagline}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-4 text-xs text-zinc-500">
                      <span>By {product.makerName}</span>
                      {hasDate ? <time dateTime={submittedAt.toISOString()}>{submittedAt.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" })}</time> : null}
                      <span>{product.votesCount} votes</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                      <Link href={`/products/${encodeURIComponent(product.id)}`} className="rounded-lg border border-white/[0.1] px-3 py-2 transition hover:bg-white/[0.05]">View product profile</Link>
                      {website ? (
                        <a href={website} target="_blank" rel="noopener" className="rounded-lg px-3 py-2 text-[#ffbe18] transition hover:bg-[#ffbe18]/10">
                          Visit {product.title} official website ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-white/[0.1] p-10 text-center text-zinc-500">
            Product profiles are temporarily unavailable. Please check back shortly.
          </section>
        )}

        <section className="mt-16 grid gap-5 border-t border-white/[0.08] pt-10 md:grid-cols-3">
          {[
            ["Permanent product profiles", "Every accepted launch receives a crawlable profile with its maker, official website, launch details, and arena history."],
            ["Useful community signals", "Matchups and critique-locked voting create original feedback instead of a page containing only an outbound link."],
            ["Connected discovery", "Products link to matchups and related profiles so visitors and search crawlers can keep exploring the directory."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-xl border border-white/[0.07] bg-[#121215]/60 p-5">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-white/[0.06] py-10 text-center text-xs text-zinc-600">
        <div className="mb-3 flex justify-center gap-5">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
        </div>
        © 2026 Indie Clash. Discover, compare, and support independent products.
      </footer>
    </div>
  );
}
