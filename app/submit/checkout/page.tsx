import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSubmissionPlan } from "@/lib/submissionPlans";

export const metadata: Metadata = { title: "Pay for Your Launch", robots: { index: false, follow: false, googleBot: { index: false, follow: false } } };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[]; checkout?: string }> }) {
  const params = await searchParams;
  const plan = getSubmissionPlan(params.plan);
  if (!plan) redirect("/submit");
  if (plan.id === "free") redirect("/submit/details?plan=free");
  // Keep old links and existing Stripe cancellation URLs working, without
  // restarting payment automatically or adding another confirmation screen.
  redirect(`/submit?plan=${plan.id}${params.checkout === "cancelled" ? "&checkout=cancelled" : ""}`);
}
