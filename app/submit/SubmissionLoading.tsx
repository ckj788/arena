import PublicSiteHeader from "@/app/components/PublicSiteHeader";

export default function SubmissionLoading() {
  return <div className="arena-app launch-page min-h-screen">
    <PublicSiteHeader actionHref="/products" actionLabel="Explore products" />
    <main className="submission-page-shell" aria-busy="true" aria-label="Loading your product form">
      <div className="submission-page-heading">
        <p className="exhibition-kicker">Your product, properly introduced</p>
        <h1>A little more about your product<span>.</span></h1>
      </div>
      <div className="submission-page-form animate-pulse space-y-7" aria-hidden="true">
        {[1, 2, 3].map(item => <div key={item} className="space-y-3"><div className="h-3 w-24 rounded bg-stone-200/60" /><div className="h-12 rounded-md bg-stone-100" /></div>)}
        <div className="h-32 rounded-md bg-stone-100" />
      </div>
      <aside className="rounded-lg border border-stone-200 bg-white/60 p-7" aria-hidden="true"><div className="animate-pulse space-y-5"><div className="h-3 w-20 rounded bg-stone-200/60" /><div className="h-8 w-2/3 rounded bg-stone-200/40" /><div className="h-20 rounded bg-stone-100" /></div></aside>
    </main>
  </div>;
}
