function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200/80 ${className}`} />;
}

export default function ProductsLoading() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100/40 via-[#fafafa] to-[#fafafa]" />
      <header className="relative border-b border-zinc-200/80 bg-white/80 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-bold tracking-tight text-zinc-950">INDIE CLASH</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-violet-700 font-medium">Loading products…</span>
        </div>
      </header>
      <main aria-busy="true" aria-live="polite" className="relative mx-auto max-w-6xl animate-pulse px-4 py-12 motion-reduce:animate-none sm:py-16">
        <span className="sr-only">Loading product directory</span>
        <SkeletonLine className="h-3 w-28" />
        <SkeletonLine className="mt-8 h-12 w-full max-w-2xl" />
        <SkeletonLine className="mt-5 h-5 w-full max-w-3xl" />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <div className="flex gap-4">
                <div className="h-14 w-14 shrink-0 rounded-xl bg-zinc-100 border border-zinc-200/60" />
                <div className="flex-1">
                  <SkeletonLine className="h-5 w-2/5" />
                  <SkeletonLine className="mt-3 h-3 w-4/5" />
                  <SkeletonLine className="mt-2 h-3 w-3/5" />
                </div>
              </div>
              <SkeletonLine className="mt-6 h-8 w-32" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
