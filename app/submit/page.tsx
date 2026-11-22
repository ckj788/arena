import type { Metadata } from "next";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import PlanPicker from "./PlanPicker";
import PlanPickerMain from "./PlanPickerMain";
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
    <PlanPickerMain>
      <div className="launch-plan-intro" data-home-reveal="launch-heading" data-route-enter="up">
        <h1>Launch for Free. <span>Grow When You’re Ready.</span></h1>
        <p>Publish your product on IndieClash for free, get discovered by the community, and receive real feedback.<br />Looking for more exposure? Explore our optional promotion services below.</p>
      </div>
      <PlanPicker key={initialPlan ?? "choose"} cancelled={params.checkout === "cancelled"} />
    </PlanPickerMain>
  </div>;
}
