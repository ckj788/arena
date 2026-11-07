"use client";

import { useEffect, useState } from "react";
import ArenaClient from "@/app/ArenaClient";
import Link from "@/app/components/NavigationLink";
import { authenticatedJson } from "@/lib/arenaApi";
import { getSubmissionPlan } from "@/lib/submissionPlans";
import SubmissionLoading from "../SubmissionLoading";
import type { LaunchOrderSummary } from "@/lib/launchOrders";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

type Snapshot = { userId: string; order: LaunchOrderSummary; draft: Record<string, unknown> | null };
export default function PaidOrderDetails({ orderId }: { orderId: string }) {
  const { userId } = useSubmissionAccess();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const current = snapshot?.userId === userId && snapshot.order.id === orderId ? snapshot : null;
  const order = current?.order;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    authenticatedJson<Omit<Snapshot, "userId">>(`/api/payments/orders/${orderId}/draft`, undefined, "GET")
      .then(result => { if (active) { setSnapshot({ userId, ...result }); setError(""); } })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not check this order."); });
    return () => { active = false; };
  }, [orderId, revision, userId]);
  const plan = getSubmissionPlan(order?.plan);
  if (!order && !error) return <SubmissionLoading />;
  if (order?.status === "paid" && !order.details_submitted_at && plan && plan.id !== "free") {
    return <ArenaClient key={`${userId}:${order.id}`} paidOrderId={order.id} initialSubmissionDraft={current?.draft} submissionPlan={plan.id} initialProducts={[]} initialPastChampions={[]} initialBracket={null} />;
  }
  return <main className="payment-result" aria-live="polite"><h1>{error ? "Your order couldn’t load." : order?.details_submitted_at ? "Your details have been received." : order?.status === "pending" ? "Your payment update is on its way." : "Payment was not completed."}</h1>
    {error && <><p role="alert">{error}</p><button type="button" className="exhibition-button mt-5" onClick={() => setRevision(value => value + 1)}>Retry</button></>}
    {order?.status === "pending" && <p>Your order is waiting for a payment update. View its status below; you don’t need to start another payment.</p>}
    <p><Link href={`/submit/result?order=${orderId}`} className="submission-back-link">View order status →</Link></p>
  </main>;
}
