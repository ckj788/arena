"use client";

import { useRouter } from "next/navigation";
import { SUBMISSION_PLANS } from "@/lib/submissionPlans";
import { useDirectoryCheckout } from "./DirectoryCheckout";

const Check = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const planPresentation = {
  starter: {
    badge: "First launch",
    description: "A practical start for your first launch",
    hoursSaved: 30,
    domainRatingBoost: "Early",
  },
  growth: {
    badge: "Recommended",
    description: "Wider coverage for growing startups",
    hoursSaved: 60,
    domainRatingBoost: "Stronger",
  },
  pro: {
    badge: "Best value",
    description: "Our broadest directory & SEO coverage",
    hoursSaved: 120,
    domainRatingBoost: "Maximum",
  },
};

export default function PlanPicker({ cancelled = false }: { cancelled?: boolean }) {
  const router = useRouter();
  const payment = useDirectoryCheckout();
  const paidPlans = SUBMISSION_PLANS.filter(plan => plan.id !== "free");

  return <div className="launch-plan-picker">
    <section className="launch-free-plan" aria-labelledby="free-listing-title" data-home-reveal="free-listing" data-route-enter="up">
      <div className="launch-free-copy">
        <h2 id="free-listing-title">Free Product Listing</h2>
        <p>Get your product on IndieClash, join the Arena, and get community feedback.</p>
      </div>
      <div className="launch-free-action">
        <button type="button" className="launch-card-choice" onClick={() => router.push("/submit/details?plan=free")}>Submit for Free <span aria-hidden="true">→</span></button>
      </div>
    </section>
    <section aria-labelledby="launch-services-title">
      <div className="launch-service-intro" data-home-reveal="services-heading" data-route-enter="up">
        <h2 id="launch-services-title">Want to Reach More Directories?</h2>
        <p>Expand your reach with our 100% manual directory submission services.</p>
      </div>
      <div className="launch-paid-plans">
        {paidPlans.map(plan => {
          const option = payment.forPlan(plan.id);
          const { badge, description, hoursSaved, domainRatingBoost } = planPresentation[plan.id];
          const features = [
            { id: "hours", text: <>Save <strong>~{hoursSaved}+ hours</strong> of manual work</> },
            { id: "backlinks", text: <><strong>{plan.directories}+</strong> permanent SEO backlinks</> },
            { id: "domain-rating", text: <>{domainRatingBoost} Domain Rating <strong>(DR)</strong> boost</> },
            { id: "delivery", text: <>Delivered within <strong>10 business days</strong></> },
            { id: "report", text: <>Complete detailed <strong>report</strong></> },
            { id: "guarantee", text: <><strong>money-back</strong> guarantee</> },
          ];
          return <article key={plan.id} className={`launch-plan-card${plan.id === "growth" ? " launch-plan-featured" : ""}`} data-plan={plan.id} data-home-reveal={plan.id} data-route-enter="up">
            <span className="launch-plan-badge">{badge}</span>
            <div className="launch-card-heading"><h3>{plan.name}</h3><p>{description}</p></div>
            <div className="launch-price"><strong>${plan.price}</strong><span>USD · one-time</span></div>
            <p className="launch-volume">{plan.directories}+ directory submissions</p>
            <ul className="launch-plan-features">{features.map(({ id, text }) => (
              <li key={id}>
                <span className="launch-feature-check" aria-hidden="true"><Check /></span>
                <span>{text}</span>
              </li>
            ))}</ul>
            <button type="button" className="launch-card-choice" aria-label={`Get started with ${plan.name}`} aria-busy={option.busy} disabled={option.disabled} onClick={option.start}>Get started</button>
            {option.error && <div className="launch-plan-error"><p role="alert">{option.error}</p></div>}
          </article>;
        })}
      </div>
    </section>
    {cancelled && <p role="status" className="launch-checkout-note">Payment was not completed. Choose a plan when you are ready to continue.</p>}
  </div>;
}
