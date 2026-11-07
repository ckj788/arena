"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/NavigationLink";
import AuthProviderButton from "@/app/components/AuthProviderButton";
import { authenticatedJson, ApiRequestError, AuthSessionExpiredError } from "@/lib/arenaApi";
import { getSubmissionPlan, launchOrderDashboardPath } from "@/lib/submissionPlans";
import { supabase } from "@/lib/supabaseClient";
import { OAUTH_RETURN_TO_KEY, OAUTH_SUBMISSION_TARGET_KEY } from "@/lib/browserOAuth";
import { withDeadline } from "@/lib/requestSafety";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

type Order = { id: string; plan: string; amount_total: number; currency: string; status: "pending" | "paid" | "expired" | "failed"; created_at: string; paid_at: string | null; details_submitted_at: string | null; product_id?: string | null };

type Props = { orderId: string; sessionId?: string; canReconcile: boolean };

export default function PaymentResult(props: Props) {
  const { userId, status } = useSubmissionAccess();
  // Discard the previous receipt and in-flight responses on account changes.
  return <PaymentReceipt key={`${props.orderId}:${status}:${userId ?? ""}`} {...props} />;
}

function PaymentReceipt({ orderId, sessionId, canReconcile }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [provider, setProvider] = useState<"google" | "github" | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const orderPath = `/api/payments/orders/${orderId}`;

    async function readOrder() {
      try {
        return (await authenticatedJson<{ order: Order }>(orderPath, undefined, "GET")).order;
      } catch (failure) {
        if (!(sessionId && failure instanceof ApiRequestError && failure.status === 404)) throw failure;
        // Check Stripe once every four polls while payment is still pending.
        if (!canReconcile || disposed || polls % 4 !== 0) return null;
        try {
          return (await authenticatedJson<{ order: Order }>(`${orderPath}/reconcile`, { sessionId })).order;
        } catch (reconcileFailure) {
          if (reconcileFailure instanceof ApiRequestError && (reconcileFailure.code === "payment_pending" || reconcileFailure.status >= 500)) return null;
          throw reconcileFailure;
        }
      }
    }

    async function check() {
      try {
        if (!supabase) throw new Error("Sign-in is not configured.");
        const session = await withDeadline(supabase.auth.getSession(), 10_000);
        if (session.error) throw session.error;
        if (!session.data.session) { if (!disposed) { setOrder(null); setNeedsSignIn(true); } return; }
        const result = await readOrder();
        if (disposed) return;
        setOrder(result);
        setError("");
        setNeedsSignIn(false);
        const pending = !result || result.status === "pending";
        setWaiting(pending);
        if (pending) {
          if (++polls < 12) timer = setTimeout(check, 2_000);
          else setError("Payment confirmation is taking longer than expected. Keep your Stripe receipt and refresh this order before trying another payment.");
        }
      } catch (failure) {
        if (!disposed) {
          setWaiting(false);
          setNeedsSignIn(failure instanceof AuthSessionExpiredError);
          setOrder(null);
          setError(failure instanceof Error ? failure.message : "Could not load your order.");
        }
      } finally { if (!disposed) setLoading(false); }
    }
    void check();
    return () => { disposed = true; clearTimeout(timer); };
  }, [orderId, sessionId, canReconcile, refresh]);

  async function signIn(selected: "google" | "github") {
    if (provider || !supabase) return;
    setProvider(selected);
    setError("");
    try {
      sessionStorage.setItem(OAUTH_RETURN_TO_KEY, `/submit/result?order=${orderId}${sessionId ? `&session_id=${sessionId}` : ""}`);
      sessionStorage.removeItem(OAUTH_SUBMISSION_TARGET_KEY);
      const { data, error } = await withDeadline(supabase.auth.signInWithOAuth({ provider: selected,
        options: { redirectTo: new URL("/auth/callback", window.location.origin).href, skipBrowserRedirect: true },
      }), 15_000);
      if (error) throw error;
      if (!data.url) throw new Error("Could not open sign-in.");
      window.location.assign(data.url);
    } catch (failure) {
      setProvider(null);
      setError(failure instanceof Error ? failure.message : "Could not open sign-in.");
    }
  }

  async function startAnotherLaunch() {
    if (!supabase || !order || order.status !== "paid" || !order.details_submitted_at) return;
    setError("");
    try {
      const session = await withDeadline(supabase.auth.getSession(), 10_000);
      if (session.error) throw session.error;
      const userId = session.data.session?.user.id;
      if (!userId) { setNeedsSignIn(true); return; }
      localStorage.removeItem(`indieclash_pay_first_v1:${userId}:${order.plan}`);
      router.push("/submit");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not start another launch."); }
  }

  const titles = { paid: "Payment confirmed.", pending: "Waiting for payment confirmation.", expired: "This checkout has expired.", failed: "Payment was not completed." };
  return <main className="payment-result" aria-live="polite" aria-busy={loading}>
    <p className="launch-eyebrow">Your launch order</p>
    <h1>{needsSignIn ? "Sign in to view your order." : order ? titles[order.status] : loading ? "Checking your order…" : waiting ? titles.pending : "Your order status"}</h1>
    {waiting && !order && !error && <p>We’re confirming your payment. Keep this page open or refresh the order in a moment.</p>}
    {order && <>
      <dl><dt>Plan</dt><dd>{getSubmissionPlan(order.plan)?.name}</dd><dt>Total</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amount_total / 100)}</dd><dt>Order reference</dt><dd>{order.id}</dd></dl>
      <p>{order.status === "paid" ? order.details_submitted_at ? "Payment and product details received. Your order is ready for manual review before fulfillment." : "Payment confirmed — awaiting product details. Add your product information and images now, or continue later from Dashboard. You do not need to pay again." : order.status === "pending" ? "Payment confirmation can take a moment. If you have already paid, keep this order reference and check again; do not make another payment." : "No fulfillment has started for this order. If your bank shows a charge, contact support with this order reference before paying again."}</p>
      {order.status === "paid" && !order.details_submitted_at && <p><Link href={`/submit/details?order=${order.id}`} className="exhibition-button">Add product details →</Link></p>}
      {order.product_id && <p><Link href={`/products/${encodeURIComponent(order.product_id)}`} className="submission-back-link">View product profile →</Link></p>}
      {order.status === "paid" && order.details_submitted_at && <p><button type="button" className="submission-back-link" onClick={() => void startAnotherLaunch()}>Start a separate launch order →</button></p>}
      <p><Link href={launchOrderDashboardPath(order.id)} className="submission-back-link">Dashboard →</Link></p>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {needsSignIn ? <>
      <p>Use the same account that started checkout. Order details are private.</p>
      {(["google", "github"] as const).map(name => <AuthProviderButton key={name} provider={name} busy={provider === name} disabled={provider !== null} onClick={() => void signIn(name)} />)}
    </> : (!order || order.status === "pending") && <button type="button" className="exhibition-button mt-6" disabled={loading} onClick={() => { setError(""); setLoading(true); setRefresh(value => value + 1); }}>Refresh order</button>}
    <p><Link href="/products" className="submission-back-link">Back to products ↗</Link></p>
  </main>;
}
