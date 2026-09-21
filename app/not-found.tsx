import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6 text-center text-zinc-900">
      <div className="space-y-5">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-400">404 · Page not found</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950">This page could not be found.</h1>
        <p className="text-sm text-zinc-600">The link may be outdated, or this record is no longer available.</p>
        <Link href="/" className="inline-flex rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800">
          Return to the arena
        </Link>
      </div>
    </main>
  );
}
