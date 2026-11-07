import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ArenaClient from "@/app/ArenaClient";
import { getSubmissionPlan } from "@/lib/submissionPlans";
import { UUID_PATTERN } from "@/lib/server/launchPayments";
import PaidOrderDetails from "./PaidOrderDetails";

export const metadata: Metadata = {
  title: "Your Product Details",
  alternates: { canonical: "/submit/details" },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function SubmissionDetailsPage({ searchParams }: {
  searchParams: Promise<{ plan?: string | string[]; order?: string | string[] }>;
}) {
  const params = await searchParams;
  if (params.order !== undefined) {
    if (typeof params.order !== "string" || !UUID_PATTERN.test(params.order)) redirect("/submit");
    return <PaidOrderDetails orderId={params.order} />;
  }
  const plan = getSubmissionPlan(params.plan);
  if (!plan) redirect("/submit");
  if (plan.id !== "free") redirect(`/submit/checkout?plan=${plan.id}`);
  return <ArenaClient submissionPlan="free" initialProducts={[]} initialPastChampions={[]} initialBracket={null} />;
}
