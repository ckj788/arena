import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/app/components/NavigationLink";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import { RESOURCE_GUIDES } from "@/lib/resourceGuides";
import { RESOURCE_PATH } from "@/lib/launchResources";
import { absoluteUrl, serializeJsonLd, SITE_NAME } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return RESOURCE_GUIDES.map(guide => ({ slug: guide.slug }));
}

function getGuide(slug: string) {
  const guide = RESOURCE_GUIDES.find(item => item.slug === slug);
  if (!guide) notFound();
  return guide;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  const path = `/resources/${guide.slug}`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: path },
    openGraph: {
      title: guide.title, description: guide.description, url: path,
      type: "article", publishedTime: guide.publishedAt, modifiedTime: guide.updatedAt,
      images: ["/og-image.png"],
    },
    twitter: { card: "summary_large_image", title: guide.title, description: guide.description, images: ["/og-image.png"] },
  };
}

const linkClass = "text-violet-700 underline decoration-violet-200 underline-offset-4 hover:decoration-violet-700";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  const url = absoluteUrl(`/resources/${guide.slug}`);
  return <div className="arena-app relative min-h-screen overflow-x-hidden bg-[#fafafa] text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white">
    <InteractiveGrid />
    <PublicSiteHeader activePage="resources" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article", "@id": `${url}#article`, headline: guide.title,
          description: guide.description, url, mainEntityOfPage: url, inLanguage: "en",
          datePublished: guide.publishedAt, dateModified: guide.updatedAt,
          author: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
          publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
          isPartOf: { "@type": "CollectionPage", url: absoluteUrl("/resources") },
        },
        {
          "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Resources", item: absoluteUrl("/resources") },
            { "@type": "ListItem", position: 3, name: guide.title, item: url },
          ],
        },
      ],
    }) }} />
    <main className="relative z-10 mx-auto max-w-6xl px-5 py-10 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-10 flex flex-wrap gap-2 text-xs leading-6 text-zinc-500">
        <Link href="/">Indie Clash</Link><span aria-hidden="true">/</span><Link href="/resources">Resources</Link><span aria-hidden="true">/</span><span aria-current="page">{guide.category}</span>
      </nav>
      <article>
        <header className="max-w-4xl border-b border-zinc-200 pb-10">
          <p className="exhibition-kicker">{guide.category}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{guide.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-600">{guide.description}</p>
          <p className="mt-6 text-xs leading-6 text-zinc-500">By <Link href="/" className="hover:underline">{SITE_NAME}</Link> · Published <time dateTime={guide.publishedAt}>{new Date(`${guide.publishedAt}T00:00:00Z`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time> · Editorial guidance, not a promise of launch results</p>
        </header>
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="rounded-2xl border border-zinc-200 bg-white p-5 lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">In this guide</p>
            <ol className="mt-4 space-y-3 text-sm leading-6">
              {guide.sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="flex min-h-11 items-center py-1 text-zinc-600 hover:text-zinc-950">{section.title}</a></li>)}
            </ol>
          </nav>
          <div className="min-w-0 max-w-3xl rounded-2xl border border-zinc-200 bg-white/95 p-5 sm:p-8">
            {guide.sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="mb-12 scroll-mt-24">
              <h2 id={`${section.id}-heading`} className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{section.title}</h2>
              {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-5 text-base leading-8 text-zinc-600">{paragraph}</p>)}
              {section.checklist && <ul className="mt-6 list-disc space-y-3 rounded-2xl border border-zinc-200 bg-white py-6 pl-10 pr-6 text-sm leading-7 text-zinc-700">{section.checklist.map(item => <li key={item}>{item}</li>)}</ul>}
              {section.example && <aside className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-6"><h3 className="font-semibold">{section.example.title}</h3><p className="mt-3 text-sm leading-7 text-zinc-700">{section.example.text}</p></aside>}
              {section.links && <ul className="mt-6 space-y-3 text-sm leading-6">{section.links.map(link => <li key={link.href}>{link.href.startsWith("/") ? <Link href={link.href} className={linkClass}>{link.label} →</Link> : <a href={link.href} className={linkClass}>{link.label} ↗</a>}</li>)}</ul>}
            </section>)}
            <section aria-labelledby="guide-sources" className="border-t border-zinc-200 pt-8">
              <h2 id="guide-sources" className="text-xl font-semibold">Sources and editorial notes</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-600">This guide combines our practical recommendations with the linked official descriptions. Examples are illustrative, not measured customer results. Features and terms can change; verify them with the provider. No affiliate links.</p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">{guide.sources.map(source => <li key={source.href}>{source.href.startsWith("/") ? <Link href={source.href} className={linkClass}>{source.label}</Link> : <a href={source.href} className={linkClass}>{source.label}</a>}</li>)}</ul>
            </section>
          </div>
        </div>
      </article>
      <section className="mt-14 border-t border-zinc-200 pt-10" aria-labelledby="next-guide">
        <h2 id="next-guide" className="text-2xl font-semibold">Keep building your launch plan</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <Link href={RESOURCE_PATH} className="exhibition-resource-card border p-6"><p className="text-xs uppercase tracking-wider text-amber-800">Choose a channel</p><h3 className="mt-3 text-lg font-semibold">Startup directories and listing sites</h3><p className="mt-3 text-sm leading-7 text-zinc-600">Compare audience, submission cost and timing.</p><span className="mt-4 block text-sm font-semibold">Read the directory →</span></Link>
          {RESOURCE_GUIDES.filter(item => item.slug !== guide.slug).map(item => <Link key={item.slug} href={`/resources/${item.slug}`} className="exhibition-resource-card border p-6"><p className="text-xs uppercase tracking-wider text-amber-800">{item.category}</p><h3 className="mt-3 text-lg font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-zinc-600">{item.description}</p><span className="mt-4 block text-sm font-semibold">Read the guide →</span></Link>)}
        </div>
      </section>
      <div className="mt-10 flex flex-wrap items-center gap-5">
        <Link href="/?submit=1" className="rounded-lg bg-amber-400 px-5 py-3 font-semibold hover:bg-amber-300">Publish your product for free →</Link>
        <Link href="/products" className="text-sm text-zinc-600 hover:underline">Discover new indie products →</Link>
      </div>
    </main>
  </div>;
}
