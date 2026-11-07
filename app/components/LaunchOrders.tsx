"use client";

import { useEffect, useState } from "react";
import Link from "./NavigationLink";
import { ApiRequestError, authenticatedJson } from "@/lib/arenaApi";
import { getSubmissionPlan } from "@/lib/submissionPlans";
import type { LaunchOrderSummary } from "@/lib/launchOrders";

type Order = LaunchOrderSummary;
const displayDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
export default function LaunchOrders({ userId, focusedOrderId }: { userId: string; focusedOrderId?: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    authenticatedJson<{ orders: Order[] }>("/api/payments/orders", undefined, "GET").then(async result => {
      if (!active) return;
      // An email can refer to an older order beyond the recent history limit.
      if (focusedOrderId && !result.orders.some(order => order.id === focusedOrderId)) {
        try {
          const { order } = await authenticatedJson<{ order: Order }>(`/api/payments/orders/${focusedOrderId}`, undefined, "GET");
          if (order.status === "paid") result.orders.unshift(order);
        } catch (failure) {
          if (!(failure instanceof ApiRequestError && failure.status === 404)) throw failure;
        }
      }
      if (active) { setOrders(result.orders); setError(""); }
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not load your launch orders."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, focusedOrderId, revision]);
  useEffect(() => {
    if (!focusedOrderId) return;
    const target = document.getElementById(`launch-order-${focusedOrderId}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center" });
  }, [focusedOrderId, orders]);
  return <section data-console-section id="order-history" className="glass-panel border border-zinc-200/80 bg-white p-5 md:p-7 space-y-5" aria-label="Order history" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="launch-eyebrow mb-2">Your launch, at a glance</p><h2 className="text-xl font-semibold tracking-tight">Order history</h2></div>
      <button type="button" className="submission-back-link" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>{loading ? "Loading…" : "Refresh orders"}</button>
    </div>
    <p className="text-sm leading-6 text-zinc-500">Your latest 50 paid orders stay here, including orders awaiting product information. Unpaid checkouts are not shown.</p>
    {!loading && !error && focusedOrderId && !orders.some(order => order.id === focusedOrderId) && <p role="status" className="text-sm text-stone-600">This order is unavailable. Sign in with the account used to purchase it.</p>}
    {loading && !orders.length ? <p role="status">Loading orders…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="submission-back-link mt-3" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry orders</button></div> : !orders.length ? <p className="text-sm text-zinc-500">No paid orders yet. Your free product profiles are listed separately.</p> : <ul className="divide-y divide-zinc-200">{orders.map(order => <li key={order.id} id={`launch-order-${order.id}`} tabIndex={order.id === focusedOrderId ? -1 : undefined} className={`flex flex-wrap items-center justify-between gap-4 py-5 ${order.id === focusedOrderId ? "rounded-md bg-amber-50 px-3" : ""}`}>
      <div className="min-w-0 flex-1">
        <strong className="break-words text-base tracking-tight">{order.product_name || `${getSubmissionPlan(order.plan)?.name} directory submissions`}</strong>
        <p className="mt-1 text-sm text-stone-600">{getSubmissionPlan(order.plan)?.name} · {new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amount_total / 100)}</p>
        <p className={`mt-2 text-sm font-medium ${order.status === "paid" ? "text-emerald-700" : "text-stone-500"}`}>{order.status === "paid" ? order.details_submitted_at ? "Paid · Details received" : order.draft_saved_at ? "Paid · Draft saved" : "Paid · Awaiting product details" : order.status === "pending" ? "Payment pending" : order.status === "expired" ? "Checkout expired" : "Payment failed"}</p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-500">
          {order.created_at && <div><dt className="inline">Placed </dt><dd className="inline">{displayDate(order.created_at)}</dd></div>}
          {order.paid_at && <div><dt className="inline">Paid </dt><dd className="inline">{displayDate(order.paid_at)}</dd></div>}
          {order.details_submitted_at && <div><dt className="inline">Details received </dt><dd className="inline">{displayDate(order.details_submitted_at)}</dd></div>}
        </dl>
        <p className="mt-2 break-all font-mono text-[10px] text-stone-400">Order {order.id}</p>
        {order.status === "paid" && order.details_submitted_at && <p className="mt-3 max-w-xl text-xs leading-5 text-stone-500">Your details are received. Directory submissions will be completed within 10 business days, with the report sent to your delivery email.</p>}
      </div>
      <Link className={order.status === "paid" && !order.details_submitted_at ? "exhibition-button" : "submission-back-link"} href={order.status === "paid" && !order.details_submitted_at ? `/submit/details?order=${order.id}` : `/submit/result?order=${order.id}`}>{order.status === "paid" && !order.details_submitted_at ? order.draft_saved_at ? "Continue editing →" : "Complete product details →" : "View order →"}</Link>
    </li>)}</ul>}
  </section>;
}
