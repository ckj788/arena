"use client";

import { useRouter } from "next/navigation";
import { SUBMISSION_PLANS } from "@/lib/submissionPlans";
import { useDirectoryCheckout } from "./DirectoryCheckout";

const Check = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const planPresentation = {
  starter: { badge: "First launch", description: "A practical start for your first launch" },
  growth: { badge: "Recommended", description: "Wider coverage for growing startups" },
  pro: { badge: "Best value", description: "Our broadest directory coverage" },
};
const features = ["100% manual submissions", "Review of your existing listings", "Submissions within 10 business days", "Money-back guarantee"];

export default function PlanPicker({ cancelled = false }: { cancelled?: boolean }) {
  const router = useRouter();
  const payment = useDirectoryCheckout();
  const paidPlans = SUBMISSION_PLANS.filter(plan => plan.id !== "free");

  return <div className="launch-plan-picker">
    <section className="launch-free-plan" aria-labelledby="free-listing-title" data-home-reveal="free-listing" data-route-enter="up">
      <div className="launch-free-copy">
        <div className="launch-free-heading"><h2 id="free-listing-title">Free Product Listing</h2></div>
        <p>Get your product on IndieClash and join a community of indie makers.</p>
        <ul className="launch-free-benefits">{["Create a product profile", "Get discovered by the community", "Join the Arena"].map(feature => <li key={feature}><span className="launch-feature-check"><Check /></span>{feature}</li>)}</ul>
      </div>
      <div className="launch-free-action">
        <button type="button" className="launch-card-choice" onClick={() => router.push("/submit/details?plan=free")}>Submit Your Product <span aria-hidden="true">→</span></button>
      </div>
    </section>
    <section aria-labelledby="launch-services-title">
      <div className="launch-service-intro" data-home-reveal="services-heading" data-route-enter="up">
        <h2 id="launch-services-title">Want to Reach More Directories?</h2>
        <p>Expand your reach with our optional manual directory submission services.</p>
      </div>
      <div className="launch-paid-plans">
        {paidPlans.map(plan => {
          const option = payment.forPlan(plan.id);
          return <article key={plan.id} className={`launch-plan-card${plan.id === "growth" ? " launch-plan-featured" : ""}`} data-plan={plan.id} data-home-reveal={plan.id} data-route-enter="up">
            <span className="launch-plan-badge">{planPresentation[plan.id].badge}</span>
            <div className="launch-card-heading"><h3>{plan.name}</h3><p>{planPresentation[plan.id].description}</p></div>
            <div className="launch-price"><strong>${plan.price}</strong><span>USD · one-time</span></div>
            <p className="launch-volume">{plan.directories}+ directory submissions</p>
            <ul className="launch-plan-features">{features.map(feature => <li key={feature}><span className="launch-feature-check"><Check /></span>{feature}</li>)}</ul>
            <button type="button" className="launch-card-choice" aria-label={`Get started with ${plan.name}`} aria-busy={option.busy} disabled={option.disabled} onClick={option.start}>Get started</button>
            {option.error && <div className="launch-plan-error"><p role="alert">{option.error}</p></div>}
          </article>;
        })}
      </div>
    </section>
    {cancelled && <p role="status" className="launch-checkout-note">Payment was not completed. Choose a plan when you are ready to continue.</p>}
    <p className="launch-checkout-note">Paid plans: pay securely with Stripe first, then add your product details. We submit within 10 business days of receiving your complete details. Free listings go straight to the submission form.</p>
  </div>;
}
