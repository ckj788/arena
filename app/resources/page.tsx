import type { Metadata } from "next";
import Link from "@/app/components/NavigationLink";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import { RESOURCE_PATH, LAUNCH_RESOURCES } from "@/lib/launchResources";
import { absoluteUrl, serializeJsonLd } from "@/lib/site";

export const metadata: Metadata = {
  title: "Launch Resources for Indie Makers",
  description: "Choose where to launch your startup, prepare a useful product profile, and turn your launch into conversations with real users.",
  alternates: { canonical: "/resources" },
  openGraph: { title: "Launch Resources for Indie Makers", description: "Practical launch preparation and a source-backed directory of product launch platforms.", url: "/resources", images: ["/og-image.png"] },
};

export default function ResourcesPage() {
  return <div className="arena-app relative min-h-screen overflow-x-hidden bg-[#fafafa] text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white">
    <InteractiveGrid />
    <PublicSiteHeader activePage="resources" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Launch resources for indie makers", url: absoluteUrl("/resources"), hasPart: { "@type": "WebPage", name: "Startup launch directories", url: absoluteUrl(RESOURCE_PATH) } }) }} />
    <main className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Resources for makers</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Give your launch a better starting point.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">Find the right places to share your work. Show what it does. Start conversations with people who might actually use it.</p>
      <Link href={RESOURCE_PATH} className="mt-12 block rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white p-8 shadow-xs transition hover:border-amber-400 sm:p-10">
        <span className="text-xs font-medium uppercase tracking-wider text-amber-800">The launch directory · {LAUNCH_RESOURCES.length} platforms</span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Where to launch your startup</h2>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-600">Compare submission costs, launch timing and audience fit. Includes free options, Product Hunt alternatives and links to each platform’s official rules.</p>
        <span className="mt-6 inline-block font-semibold">Explore launch platforms →</span>
      </Link>
      <section className="mt-16" aria-labelledby="launch-preparation">
        <h2 id="launch-preparation" className="text-2xl font-semibold">Before you submit anywhere</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            ["01", "Make it understandable", "Explain who the product helps, what they can do with it, and one concrete use case. Use a screenshot of the working product rather than only a logo."],
            ["02", "Match the audience", "Choose two or three relevant communities. Read their rules and tailor your introduction. A beta signup page and a working developer tool need different launch venues."],
            ["03", "Stay for the feedback", "Be available for questions. Ask about a specific workflow, note where people get stuck, and improve the product before your next launch."],
          ].map(([number, title, copy]) => <article key={number} className="rounded-2xl border border-zinc-200 bg-white p-6"><span className="font-mono text-sm text-amber-700">{number}</span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-zinc-600">{copy}</p></article>)}
        </div>
      </section>
      <div className="mt-14 flex flex-wrap items-center gap-5 border-t border-zinc-200 pt-8"><Link href="/?submit=1" className="rounded-lg bg-amber-400 px-5 py-3 font-semibold hover:bg-amber-300">Publish your product for free →</Link><Link href="/products" className="text-sm text-zinc-600 hover:text-zinc-950">See what other makers are building →</Link></div>
    </main>
  </div>;
}
