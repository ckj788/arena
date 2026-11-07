import { authenticatedJson } from "./arenaApi";
import type { SubmissionPlanId } from "./submissionPlans";

type Checkout = { userId: string; orderId: string; url: string };
type Attempt = { requestId: string; startedAt: number; requested?: boolean; promise?: Promise<Checkout>; result?: Checkout };
const attempts = new Map<string, Attempt>();
export const CHECKOUT_PREPARATION_LIFETIME = 15 * 60_000;

function requestId() {
  const random = crypto.randomUUID();
  const time = Date.now().toString(16).padStart(12, "0");
  return `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15)}`;
}

// Share in-flight work across Strict Mode/remounts. Account-scoped and memory
// only, so a reload after changing deployment configuration gets fresh URLs.
export function prepareCheckout(userId: string, plan: SubmissionPlanId) {
  const key = `${userId}:${plan}`;
  let attempt = attempts.get(key);
  if (!attempt || Date.now() - attempt.startedAt >= CHECKOUT_PREPARATION_LIFETIME) {
    attempt = { requestId: requestId(), startedAt: Date.now() };
    attempts.set(key, attempt);
  }
  if (attempt.result) return Promise.resolve(attempt.result);
  if (attempt.promise) return attempt.promise;
  const current = attempt;
  const resume = current.requested === true;
  current.requested = true;
  current.promise = authenticatedJson<Checkout>("/api/payments/checkout", { plan, requestId: current.requestId, resume })
    .then(result => {
      if (result.userId !== userId) throw new Error("Your account changed. Reload payment options.");
      current.result = result;
      return result;
    })
    .finally(() => { current.promise = undefined; });
  return current.promise;
}

export function consumePreparedCheckout(userId: string, plan: SubmissionPlanId) {
  attempts.delete(`${userId}:${plan}`);
}
