export const SUBMISSION_PLANS = [
  { id: "starter", name: "Starter", price: 99, directories: 50, note: "A focused first launch.", unitPrice: "1.98" },
  { id: "growth", name: "Growth", price: 169, directories: 100, note: "Give your launch more room.", unitPrice: "1.69" },
  { id: "pro", name: "Pro", price: 259, directories: 200, note: "Your widest launch shortlist.", unitPrice: "1.30" },
  { id: "free", name: "Free", price: 0, directories: 0, note: "A home for your product on Indie Clash.", unitPrice: "0.00" },
] as const;

export type SubmissionPlanId = typeof SUBMISSION_PLANS[number]["id"];
export type SubmissionPlan = typeof SUBMISSION_PLANS[number];

export function getSubmissionPlan(value: unknown): SubmissionPlan | undefined {
  return SUBMISSION_PLANS.find(plan => plan.id === value);
}

export const SUBMISSION_PAGE_DRAFT_KEY = "indieclash_submission_page_draft_v1";

export function launchOrderDashboardPath(orderId: string) {
  return `/?view=console&order=${encodeURIComponent(orderId)}`;
}

export type SubmissionHistory = "" | "none" | "provided" | "unsure";

export type SubmissionServiceDetails = {
  email: string;
  history: SubmissionHistory;
  directories: string;
  consent: boolean;
};

export const EMPTY_SERVICE_DETAILS: SubmissionServiceDetails = { email: "", history: "", directories: "", consent: false };
