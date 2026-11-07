"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SUBMISSION_PLANS, type SubmissionPlanId } from "@/lib/submissionPlans";
import { useDirectoryCheckout } from "./DirectoryCheckout";

const Check = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const planPresentation = {
  starter: { badge: "First launch", description: "A practical start for your first launch", hoursSaved: 30 },
  growth: { badge: "Recommended", description: "Wider coverage for growing startups", hoursSaved: 60 },
  pro: { badge: "Best value", description: "Our broadest directory coverage", hoursSaved: 120 },
};

export default function PlanPicker({ initialPlan = null, cancelled = false }: { initialPlan?: SubmissionPlanId | null; cancelled?: boolean }) {
  const [selected, setSelected] = useState<SubmissionPlanId | null>(initialPlan);
  const router = useRouter();
  const payment = useDirectoryCheckout(selected);
  const paidPlans = SUBMISSION_PLANS.filter(plan => plan.id !== "free");
  const current = SUBMISSION_PLANS.find(plan => plan.id === selected);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (selected === "free") { router.push("/submit/details?plan=free"); return; }
    if (payment.href) window.location.assign(payment.href);
  }

  return <form onSubmit={submit} className="launch-plan-picker">
    <fieldset>
      <legend className="sr-only">Choose your launch plan</legend>
      <div className="launch-paid-plans">
        {paidPlans.map(plan => <label key={plan.id} className={`launch-plan-card${plan.id === "growth" ? " launch-plan-featured" : ""}${selected === plan.id ? " is-selected" : ""}`}>
          <input className="sr-only" type="radio" name="plan" value={plan.id} checked={selected === plan.id} onChange={() => setSelected(plan.id)} required />
          <span className="launch-plan-badge">{planPresentation[plan.id].badge}</span>
          <div className="launch-card-heading"><h2>{plan.name}</h2><p>{planPresentation[plan.id].description}</p></div>
          <div className="launch-price"><strong>${plan.price}</strong><span>USD · one-time</span></div>
          <p className="launch-volume">{plan.directories}+ directory submissions</p>
          <p className="launch-unit-price">{plan.id === "pro" ? "≈ " : ""}${plan.unitPrice} per directory</p>
          <ul className="launch-plan-features">
            <li className="launch-time-saved"><strong>Save an estimated {planPresentation[plan.id].hoursSaved} hours</strong></li>
            <li>100% manual submissions</li>
            <li>Review of your existing listings</li>
            <li>Submissions within 10 business days</li>
            <li>Money-back guarantee</li>
          </ul>
          <span className="launch-card-choice">{selected === plan.id ? `${plan.name} selected` : `Choose ${plan.name}`}</span>
        </label>)}
      </div>
      <label className={`launch-free-plan ${selected === "free" ? "is-selected" : ""}`}>
        <input className="sr-only" type="radio" name="plan" value="free" checked={selected === "free"} onChange={() => setSelected("free")} required />
        <span className="launch-radio-mark" aria-hidden="true">{selected === "free" ? <Check /> : null}</span>
        <div className="launch-free-copy"><span className="launch-eyebrow">Indie Clash only</span><h2>Free listing</h2><p>Publish a product profile on Indie Clash and optionally join the Arena.</p></div>
        <div className="launch-free-price"><strong>Free</strong><span>No payment required</span></div>
      </label>
    </fieldset>
    <div className="launch-selection-bar">
      <div aria-live="polite"><span className="launch-eyebrow">Your starting point</span><p>{current ? `${current.name}${current.price ? ` · $${current.price} one-time` : " · $0"}` : "Choose a plan to continue."}</p></div>
      {selected !== "free" && payment.href
        ? <a className="exhibition-button" href={payment.href}>Get Started <span aria-hidden="true">→</span></a>
        : selected !== "free" && payment.signedOut
          ? <button type="button" className="exhibition-button" disabled={!selected} onClick={payment.signIn}>Get Started <span aria-hidden="true">→</span></button>
          : <button type="submit" className="exhibition-button" disabled={!selected || selected !== "free"}>{current?.id === "free" ? "Submit for free" : "Get Started"} <span aria-hidden="true">→</span></button>}
    </div>
    {cancelled && <p role="status" className="launch-checkout-note">Payment was not completed. Choose a plan when you are ready to continue.</p>}
    {selected && selected !== "free" && !payment.href && !payment.signedOut && !payment.error && <p role="status" className="launch-checkout-note">{payment.missing ? "Payment is not available yet. You can still submit for free." : "Loading payment options…"}</p>}
    {payment.error && <p role="alert" className="mb-4 text-sm text-red-700">{payment.error}</p>}
    {payment.error && <button type="button" className="submission-back-link mb-4" onClick={payment.reload}>Reload payment options</button>}
    <p className="launch-checkout-note">Paid plans: pay securely with Stripe first, then add your product details. We submit within 10 business days of receiving your complete details. Free listings go straight to the submission form.</p>
  </form>;
}
