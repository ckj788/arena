"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedJson } from "@/lib/arenaApi";
import type { Product } from "@/lib/mockData";

type Queue = { products: Product[]; reports: Array<{ id: string; product_id: string; reason: string; note: string }>; hasMore: boolean };
export default function ModerationConsole() {
  const [status, setStatus] = useState("reported");
  const [page, setPage] = useState(0);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current; setBusy(true); setError(""); setQueue(null);
    try { const result = await authenticatedJson<Queue>(`/api/arena/moderation?status=${status}&page=${page}`, undefined, "GET"); if (id === generation.current) setQueue(result); }
    catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "Unable to load."); }
    finally { if (id === generation.current) setBusy(false); }
  }, [status, page]);
  const cancelLoad = useCallback(() => { generation.current++; }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); cancelLoad(); }; }, [load, cancelLoad]);
  async function decide(productId: string, action: string) {
    if (pending.current) return;
    if (!notes[productId]?.trim()) { setError("Add a short reason before making a decision."); return; }
    pending.current = true; setBusy(true); setError("");
    try { await authenticatedJson("/api/arena/moderation", { productId, action, note: notes[productId] }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Decision failed."); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 text-zinc-900">
      <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">← Discover</Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-zinc-950">Moderation</h1>
      <p className="mt-3 text-sm text-zinc-600">Admins only. Reports are private. Restricting a listing preserves its match history.</p>
      <div className="my-6 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          Status
          <select
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-2xs outline-none focus:border-zinc-400"
            value={status}
            onChange={e => { setPage(0); setStatus(e.target.value); }}
          >
            <option value="reported">Reported</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="restricted">Restricted</option>
            <option value="approved">Approved</option>
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {error && <p role="alert" className="mb-5 text-sm font-medium text-rose-600">{error} <Link href="/" className="underline">Return home to sign in</Link></p>}
      {busy && <p role="status" className="text-sm text-zinc-500">Loading…</p>}
      {queue?.products.length === 0 && <p className="text-sm text-zinc-500">No products in this queue.</p>}
      {queue?.products.map(product => (
        <article key={product.id} className="mb-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <Link href={`/products/${encodeURIComponent(product.id)}`} className="text-xl font-bold text-zinc-950 hover:text-amber-600 transition">
            {product.title}
          </Link>
          <p className="mt-2 break-all font-mono text-xs text-zinc-500">{product.url}</p>
          <p className="mt-2 text-sm text-zinc-700">{product.tagline}</p>
          <p className="mt-2 font-mono text-xs text-zinc-400">{product.moderationStatus} · {product.linkTrust}</p>
          {queue.reports.filter(r => r.product_id === product.id).map(r => (
            <p key={r.id} className="mt-3 rounded-lg border border-zinc-200/60 bg-zinc-50 p-3 text-sm text-zinc-700">
              <strong className="text-zinc-900">{r.reason}:</strong> {r.note || "No details"}
            </p>
          ))}
          <label className="mt-4 block text-sm font-medium text-zinc-700">
            Decision reason
            <input
              maxLength={1000}
              value={notes[product.id] || ""}
              onChange={e => setNotes({ ...notes, [product.id]: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-sm text-zinc-900 outline-none transition focus:bg-white focus:border-zinc-400"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {[["approved", "Approve link"], ["restricted", "Restrict"], ["unreviewed", "Restore as unreviewed"], ["dismiss", "Dismiss reports"]].map(([action, label]) => (
              <button
                key={action}
                disabled={busy}
                onClick={() => void decide(product.id, action)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      ))}
      <div className="mt-6 flex items-center gap-4 text-sm font-medium text-zinc-700">
        <button disabled={busy || page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 shadow-2xs hover:bg-zinc-50 disabled:opacity-30">Previous</button>
        <span className="text-zinc-500 font-mono text-xs">Page {page + 1}</span>
        <button disabled={busy || !queue?.hasMore} onClick={() => setPage(page + 1)} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 shadow-2xs hover:bg-zinc-50 disabled:opacity-30">Next</button>
      </div>
    </main>
  );
}
