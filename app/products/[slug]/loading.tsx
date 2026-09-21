function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/80 ${className}`} />;
}

export default function ProductProfileLoading() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />
      <header className="relative border-b border-zinc-200/80 bg-white/80 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-bold tracking-tight text-zinc-950">INDIE CLASH</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-violet-700 font-medium">Opening profile…</span>
        </div>
      </header>
      <main aria-busy="true" aria-live="polite" className="relative mx-auto max-w-5xl animate-pulse px-4 py-10 motion-reduce:animate-none sm:py-14">
        <span className="sr-only">Loading product profile</span>
        <SkeletonLine className="mb-8 h-3 w-48" />
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="h-24 w-24 shrink-0 rounded-2xl bg-zinc-100 border border-zinc-200/60" />
            <div className="flex-1">
              <SkeletonLine className="h-3 w-36" />
              <SkeletonLine className="mt-5 h-11 w-3/5" />
              <SkeletonLine className="mt-5 h-5 w-4/5" />
              <SkeletonLine className="mt-3 h-4 w-2/5" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-6 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 rounded-xl bg-zinc-50 border border-zinc-200/60" />)}
          </div>
        </section>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <SkeletonLine className="h-7 w-48" />
            <SkeletonLine className="mt-6 h-4 w-full" />
            <SkeletonLine className="mt-3 h-4 w-11/12" />
            <SkeletonLine className="mt-3 h-4 w-4/5" />
          </div>
          <div className="h-52 rounded-xl border border-zinc-200/80 bg-white shadow-xs" />
        </div>
      </main>
    </div>
  );
}
