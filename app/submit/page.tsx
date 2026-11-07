import type { Metadata } from "next";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import PlanPicker from "./PlanPicker";
import { getSubmissionPlan } from "@/lib/submissionPlans";

export const metadata: Metadata = {
  title: "Startup Directory Submission Plans",
  description: "Compare manual submission plans for 50+, 100+, or 200+ startup directories, or list your product on Indie Clash for free.",
  alternates: { canonical: "/submit" },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[]; checkout?: string }> }) {
  const params = await searchParams;
  const initialPlan = getSubmissionPlan(params.plan)?.id ?? null;
  return <div className="arena-app launch-page relative min-h-screen overflow-x-hidden text-zinc-950">
    <InteractiveGrid />
    <PublicSiteHeader actionHref="/products" actionLabel="Explore products" />
    <main className="launch-plans-main relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-16">
      <div className="launch-plan-intro">
        <h1>Pick your <span>package</span></h1>
        <p>One-time payment, no subscription. We submit your product by hand and you can follow your order from your dashboard.</p>
      </div>
      <PlanPicker key={initialPlan ?? "choose"} initialPlan={initialPlan} cancelled={params.checkout === "cancelled"} />
    </main>
  </div>;
}
