"use client";

import { useEffect, useState } from "react";
import { authenticatedJson } from "@/lib/arenaApi";
import { type SubmissionPlanId } from "@/lib/submissionPlans";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

type PaymentOptions = { userId: string; configured: boolean; links: Partial<Record<SubmissionPlanId, string>> };

export function useDirectoryCheckout(selectedPlan: SubmissionPlanId | null = null) {
  const { status, userId, requestSubmission } = useSubmissionAccess();
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [failure, setFailure] = useState<{ userId: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (status !== "signed-in" || !userId) return;
    let active = true;
    // Bind all three reusable links while the page opens, never on Get Started.
    // This creates neither a Stripe session nor a database order.
    authenticatedJson<PaymentOptions>("/api/payments/links", undefined, "GET").then(value => {
      if (value.configured && value.userId !== userId) throw new Error("Your account changed. Reload payment options.");
      if (active) { setOptions({ ...value, userId }); setFailure(null); }
    }).catch(error => {
      if (active) setFailure({ userId, message: error instanceof Error ? error.message : "Payment links could not load." });
    });
    return () => { active = false; };
  }, [status, userId, retry]);

  const current = status === "signed-in" && options?.userId === userId ? options : null;
  const error = status === "signed-in" && failure?.userId === userId ? failure.message : "";
  const href = selectedPlan && current?.configured ? current.links[selectedPlan] : undefined;
  return {
    href, error, signedOut: status === "signed-out" || status === "error", missing: current?.configured === false,
    signIn: () => requestSubmission(`/submit${selectedPlan ? `?plan=${selectedPlan}` : ""}`),
    reload: () => { setFailure(null); setRetry(value => value + 1); },
  };
}
