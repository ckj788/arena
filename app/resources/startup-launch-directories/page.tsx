import type { Metadata } from "next";
import { Suspense } from "react";
import RecentLaunches from "../RecentLaunches";
import LaunchGuideSections from "../LaunchGuideSections";
import Link from "@/app/components/NavigationLink";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import ResourceDirectory from "../ResourceDirectory";
import { LAUNCH_RESOURCES, RESOURCE_PATH, RESOURCE_REVIEWED_AT } from "@/lib/launchResources";
import { absoluteUrl, serializeJsonLd } from "@/lib/site";

const title = `${LAUNCH_RESOURCES.length} Startup Launch Directories: Free & Paid Platforms`;
export const revalidate = 60;
const description = "Compare startup directories and product launch platforms by cost, audience and launch timing. Official sources, free options and practical Product Hunt alternatives.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: RESOURCE_PATH },
  openGraph: { title, description, url: RESOURCE_PATH, type: "article", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default function LaunchDirectoriesPage() {
  const canonical = absoluteUrl(RESOURCE_PATH);
  return <div className="arena-app relative min-h-screen overflow-x-hidden bg-[#fafafa] text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white">
    <InteractiveGrid />
    <PublicSiteHeader activePage="resources" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
      "@context": "https://schema.org", "@graph": [
        { "@type": "CollectionPage", "@id": canonical, name: title, description, url: canonical, dateModified: RESOURCE_REVIEWED_AT, mainEntity: { "@type": "ItemList", numberOfItems: LAUNCH_RESOURCES.length, itemListElement: LAUNCH_RESOURCES.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.url.startsWith("/") ? absoluteUrl(item.url) : item.url })) } },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Indie Clash", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Resources", item: absoluteUrl("/resources") },
          { "@type": "ListItem", position: 3, name: "Startup launch directories", item: canonical },
        ] },
      ],
    }) }} />
    <main className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap gap-2 text-xs text-zinc-500"><Link href="/">Indie Clash</Link><span>/</span><Link href="/resources">Resources</Link><span>/</span><span aria-current="page">Launch directories</span></nav>
      <header className="mb-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">A practical launch shortlist</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Startup launch directories.</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600">Compare {LAUNCH_RESOURCES.length} product launch platforms by cost, audience and waiting time. Find a practical starting point for your next launch.</p>
        <p className="mt-5 text-xs text-zinc-500">Reviewed <time dateTime={RESOURCE_REVIEWED_AT}>September 24, 2026</time> · Maintained by Indie Clash · No affiliate links</p>
      </header>
      <nav aria-label="On this page" className="mb-7 flex flex-wrap gap-1 border-y border-zinc-200 py-2">
        {[["compare-platforms", "Compare platforms"], ["free-directories", "Free options"], ["product-hunt-alternatives", "Product Hunt alternatives"], ["launch-by-stage", "Choose by stage"], ["launch-faq", "Questions"]].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950">{label} ↓</a>)}
      </nav>
      <section aria-labelledby="compare-platforms"><h2 id="compare-platforms" className="mb-5 scroll-mt-24 text-2xl font-semibold">Compare {LAUNCH_RESOURCES.length} places to launch your startup</h2><ResourceDirectory /></section>
      <LaunchGuideSections />
      <section className="mt-12" aria-labelledby="launch-sequence">
        <h2 id="launch-sequence" className="text-2xl font-semibold">A practical first-launch sequence</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[["01 · Prepare one useful profile", "Bring a working URL, a plain-language use case, real screenshots and a specific feedback question. Reuse the facts, but adapt your introduction to each community."], ["02 · Choose one conversation", "Start where your audience already participates. Be present to answer questions; a discussion about a working demo is different from a directory listing."], ["03 · Improve before expanding", "Use questions and objections to improve your product page. Add another platform when you have time to support it, not just to accumulate links."]].map(([heading, body]) => <li key={heading} className="rounded-xl border border-zinc-200 bg-white p-5"><h3 className="font-semibold">{heading}</h3><p className="mt-3 text-sm leading-7 text-zinc-600">{body}</p></li>)}
        </ol>
      </section>
      <Suspense fallback={<div className="mt-12 min-h-48 rounded-2xl border border-zinc-200 p-6 text-sm text-zinc-500">Loading recent Indie Clash launches…</div>}><RecentLaunches /></Suspense>
      <section className="mt-12 max-w-3xl text-sm leading-7 text-zinc-600" aria-labelledby="research-notes">
        <h2 id="research-notes" className="text-xl font-semibold text-zinc-950">How this list is maintained</h2>
        <p className="mt-3">We read the linked official pages for submission rules and costs. We have not purchased every plan or completed every submission. “Check plans” means a current price or free tier could not be confirmed. Backlink claims are attributed to the platform unless verified in our own code.</p>
        <p className="mt-3">Policies and queues change. Follow the source links before submitting. Indie Clash is included as our own service and follows the same alphabetical ordering. A product profile can remain available after launch, but every platform can remove content under its rules.</p>
      </section>
      <div className="mt-12 flex flex-wrap gap-5 border-t border-zinc-200 pt-8"><Link href="/?submit=1" className="rounded-lg bg-amber-400 px-5 py-3 font-semibold hover:bg-amber-300">Launch on Indie Clash for free →</Link><Link href="/resources" className="self-center text-sm text-zinc-600">Launch preparation checklist →</Link></div>
    </main>
  </div>;
}
