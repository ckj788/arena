import Link from "@/app/components/NavigationLink";
import { getPublicProducts } from "@/lib/server/publicSeoData";

// Independent of the editorial shortlist: no claim that these products launched
// on an external platform, and no paid or quality ranking implied by recency.
export default async function RecentLaunches() {
  let products;
  try {
    products = (await getPublicProducts()).slice().sort((a, b) => {
      const timestamp = (value: string | undefined) => {
        const parsed = Date.parse(value || "");
        return Number.isFinite(parsed) ? parsed : 0;
      };
      return timestamp(b.publishedAt || b.submittedAt) - timestamp(a.publishedAt || a.submittedAt) || a.id.localeCompare(b.id);
    }).slice(0, 3);
  } catch {
    // A catalogue outage must not take down the static comparison guide.
    return <p className="mt-10 text-sm"><Link href="/products" className="underline underline-offset-4">Explore products on Indie Clash →</Link></p>;
  }
  if (!products.length) return null;
  return <section className="mt-12 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 sm:p-8" aria-labelledby="recent-launches">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="recent-launches" className="text-2xl font-semibold">Recently added to Indie Clash</h2><Link href="/products" className="text-sm font-medium underline underline-offset-4">Explore all products →</Link></div>
    <p className="mt-3 text-sm leading-6 text-zinc-600">See how other makers present their products. Latest public submissions, not endorsements or launch results.</p>
    <div className="mt-6 grid gap-4 md:grid-cols-3">{products.map(product => <Link key={product.id} href={`/products/${encodeURIComponent(product.id)}`} className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-amber-400">
      <h3 className="font-semibold">{product.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">{product.tagline}</p><span className="mt-4 block text-xs font-medium">View product profile →</span>
    </Link>)}</div>
  </section>;
}
