"use client";
import { useRef, useState } from "react";
import { authenticatedJson } from "@/lib/arenaApi";
import Link from "next/link";

export default function ReportProduct({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return <div className="mt-5 text-sm text-zinc-400">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="hover:text-white">Report this product</button>
    {open && <form className="mt-3 max-w-lg space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" onSubmit={async event => {
      event.preventDefault(); if (pending.current || sent) return;
      pending.current = true; setBusy(true); setMessage("");
      try { await authenticatedJson("/api/arena/reports", { productId, reason, note }); setSent(true); setMessage("Report received. A moderator will review it."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send report."); }
      finally { pending.current = false; setBusy(false); }
    }}>
      {!sent && <><label className="block">Reason<select value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-lg bg-zinc-900 p-2 text-white">
        <option value="spam">Spam or misleading listing</option><option value="unsafe">Unsafe website</option><option value="duplicate">Duplicate product</option><option value="impersonation">Impersonation</option><option value="other">Other</option>
      </select></label><label className="block">Details (optional)<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} className="mt-1 block w-full rounded-lg bg-zinc-900 p-2 text-white" /></label>
      <p className="text-xs"><Link href="/?signin=1" className="underline">Sign in</Link> before reporting. Reports do not automatically remove a product.</p>
      <button disabled={busy} className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-50">{busy ? "Sending…" : "Send report"}</button></>}
      {message && <p role="status">{message}</p>}
    </form>}
  </div>;
}
