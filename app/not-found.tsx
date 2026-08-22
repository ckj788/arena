import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08080a] px-6 text-center text-zinc-300">
      <div className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">404 · Arena record not found</p>
        <h1 className="text-3xl font-semibold text-white">This matchup has left the bracket.</h1>
        <p className="text-sm text-zinc-500">The URL may be outdated, or the product was never entered.</p>
        <Link href="/" className="inline-flex rounded-md border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
          Return to the arena
        </Link>
      </div>
    </main>
  );
}
