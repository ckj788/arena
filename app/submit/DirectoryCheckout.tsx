"use client";

import { useEffect, useState } from "react";
import { SUBMISSION_PLANS, type SubmissionPlanId } from "@/lib/submissionPlans";
import { CHECKOUT_PREPARATION_LIFETIME, consumePreparedCheckout, prepareCheckout } from "@/lib/preparedCheckout";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

type PaymentOptions = { userId: string; links: Partial<Record<SubmissionPlanId, string>>; errors: Partial<Record<SubmissionPlanId, string>> };

export function useDirectoryCheckout(selectedPlan: SubmissionPlanId | null = null) {
  const { status, userId, requestSubmission } = useSubmissionAccess();
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (status !== "signed-in" || !userId) return;
    let active = true;
    for (const plan of SUBMISSION_PLANS.filter(plan => plan.id !== "free")) {
      prepareCheckout(userId, plan.id).then(result => {
        if (active) setOptions(previous => ({
          userId,
          links: { ...(previous?.userId === userId ? previous.links : {}), [plan.id]: result.url },
          errors: { ...(previous?.userId === userId ? previous.errors : {}), [plan.id]: "" },
        }));
      }).catch(failure => {
        if (active) setOptions(previous => ({
          userId,
          links: { ...(previous?.userId === userId ? previous.links : {}), [plan.id]: undefined },
          errors: { ...(previous?.userId === userId ? previous.errors : {}), [plan.id]: failure instanceof Error ? failure.message : "Payment options could not load." },
        }));
      });
    }
    const timer = setTimeout(() => {
      setOptions(null);
      setRetry(value => value + 1);
    }, CHECKOUT_PREPARATION_LIFETIME);
    return () => { active = false; clearTimeout(timer); };
  }, [status, userId, retry]);

  const current = status === "signed-in" && options?.userId === userId ? options : null;
  const error = selectedPlan ? current?.errors[selectedPlan] || "" : "";
  const href = selectedPlan ? current?.links[selectedPlan] : undefined;
  return {
    href, error, signedOut: status === "signed-out" || status === "error",
    signIn: () => requestSubmission(`/submit${selectedPlan ? `?plan=${selectedPlan}` : ""}`),
    consume: () => { if (userId && selectedPlan) consumePreparedCheckout(userId, selectedPlan); },
    reload: () => { setOptions(null); setRetry(value => value + 1); },
  };
}
