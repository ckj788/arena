import Link from "@/app/components/NavigationLink";
import { getPublicProducts } from "@/lib/server/publicSeoData";
import { trustedProductImageUrl } from "@/lib/site";
import { categoryLabel } from "@/lib/productTaxonomy";
import RecentLaunchPager from "./RecentLaunchPager";

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
    });
  } catch {
    // A catalogue outage must not take down the static comparison guide.
    return <p className="mt-10 text-sm"><Link href="/products" className="underline underline-offset-4">Explore products on Indie Clash →</Link></p>;
  }
  if (!products.length) return null;
  return <section className="mt-12 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 sm:p-8" aria-labelledby="recent-launches">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="recent-launches" className="text-2xl font-semibold">Recently added to Indie Clash</h2><Link href="/products" className="text-sm font-medium underline underline-offset-4">Explore all products →</Link></div>
    <p className="mt-3 text-sm leading-6 text-zinc-600">Explore the latest launches from independent makers.</p>
    <RecentLaunchPager>{products.map(product => {
      const logo = trustedProductImageUrl(product.logo);
      const category = categoryLabel(product.category);
      const date = new Date(product.publishedAt || product.submittedAt);
      const hasDate = Number.isFinite(date.getTime());
      return <Link key={product.id} href={`/products/${encodeURIComponent(product.id)}`} aria-label={`View ${product.title}`} className="group flex min-w-0 flex-col bg-white p-5 transition-colors duration-150 hover:bg-zinc-50/90 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600">
        <div className="flex items-center justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200/80 bg-white shadow-2xs" aria-hidden="true">
            {logo ? (
              // Public Storage and legacy raster assets share the homepage URL policy.
              <img src={logo} alt="" width={28} height={28} loading="lazy" decoding="async" className="h-7 w-7 object-contain" />
            ) : <span className="text-xl">{product.logo && [...product.logo].length <= 8 ? product.logo : "🚀"}</span>}
          </span>
          {category ? <span className="truncate text-xs text-zinc-500">{category}</span> : null}
        </div>
        <h3 className="mt-4 line-clamp-2 min-h-12 text-base font-semibold leading-6 text-zinc-950 transition-colors group-hover:text-amber-600">{product.title}</h3>
        <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-zinc-600">{product.tagline}</p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          <span className="min-w-0 truncate">By {product.makerName || "Anonymous Maker"}</span>
          {hasDate ? <time className="shrink-0" dateTime={date.toISOString()}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time> : null}
          <span aria-hidden="true" className="text-zinc-700">↗</span>
        </div>
      </Link>;
    })}</RecentLaunchPager>
  </section>;
}
