"use client";

import { useEffect, useState } from "react";
import type { SubmissionPlanId } from "@/lib/submissionPlans";
import { consumePreparedCheckout, prepareCheckout } from "@/lib/preparedCheckout";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

type Selection = { userId: string; plan: SubmissionPlanId };

export function useDirectoryCheckout() {
  const { status, userId, requestSubmission } = useSubmissionAccess();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [failure, setFailure] = useState<(Selection & { message: string }) | null>(null);

  useEffect(() => {
    if (!selection) return;
    if (status !== "signed-in" || selection.userId !== userId) {
      setSelection(null);
      return;
    }
    let active = true;
    const { plan } = selection;
    prepareCheckout(userId, plan).then(result => {
      if (!active) return;
      setSelection(null);
      window.location.assign(result.url);
      consumePreparedCheckout(userId, plan);
    }).catch(error => {
      if (!active) return;
      setFailure({ ...selection, message: error instanceof Error ? error.message : "Could not open checkout. Please try again." });
      setSelection(null);
    });
    return () => { active = false; };
  }, [selection, status, userId]);

  function forPlan(plan: SubmissionPlanId) {
    return {
      busy: selection?.plan === plan,
      disabled: status === "checking" || selection !== null,
      error: status === "signed-in" && failure?.userId === userId && failure?.plan === plan ? failure.message : "",
      start: () => {
        if (selection || status === "checking") return;
        if (status !== "signed-in" || !userId) return requestSubmission(`/submit?plan=${plan}`);
        setFailure(null);
        setSelection({ userId, plan });
      },
    };
  }
  return { forPlan };
}
