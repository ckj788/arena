import "server-only";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { submissionConfirmationEmail } from "@/lib/emails/submissionConfirmation";
import { getAdminClient } from "./auth";
import { checkoutBaseUrl, stripeMode } from "./stripe";

type Confirmation = { id: string; order_id: string; recipient: string; product_name: string; plan: string; claim_token: string };

export function confirmationEmailBody(mail: Confirmation, siteUrl: string) {
  return submissionConfirmationEmail(mail, siteUrl).text;
}

export async function dispatchConfirmationEmails(orderId?: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return { configured: false, sent: 0, failed: 0 };
  // Orders, payment returns and email links must use the same site origin.
  const siteUrl = checkoutBaseUrl();
  const mode = stripeMode();
  if (mode !== "live" && mode !== "test") throw new Error("Email order mode is not configured.");
  const db = getAdminClient();
  const { data, error } = await db.rpc(`${DB_PREFIX}claim_confirmation_emails`, { p_order_id: orderId ?? null, p_livemode: mode === "live" });
  if (error) throw new Error("Confirmation email queue is unavailable.");
  let sent = 0, failed = 0;
  for (const mail of (data ?? []) as Confirmation[]) {
    let changes: Record<string, unknown>;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `launch-details/${mail.order_id}` },
        body: JSON.stringify({ from, to: [mail.recipient], ...submissionConfirmationEmail(mail, siteUrl),
          ...(process.env.RESEND_REPLY_TO?.trim() ? { reply_to: process.env.RESEND_REPLY_TO.trim() } : {}) }),
      });
      if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error("Resend did not return an email ID");
      changes = { status: "sent", resend_id: result.id, locked_until: null, last_error: null };
      sent++;
    } catch (failure) {
      changes = { status: "pending", locked_until: null, last_error: failure instanceof Error && /^Resend HTTP \d+$/.test(failure.message) ? failure.message : "Email request failed" };
      failed++;
    }
    const { error: updateError } = await db.from(`${DB_PREFIX}confirmation_emails`).update(changes).eq("id", mail.id).eq("claim_token", mail.claim_token);
    if (updateError) throw new Error("Could not record confirmation email status.");
  }
  return { configured: true, sent, failed };
}

// Runs after the details response. Brief provider failures should not require
// the customer to submit again. Durable queue + provider idempotency still own
// deduplication; an external scheduler can recover interrupted executions.
export async function deliverSubmissionConfirmation(orderId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await dispatchConfirmationEmails(orderId);
      if (!result.configured || result.failed === 0) return;
    } catch {
      console.error("[CONFIRMATION EMAIL] Delivery deferred; inspect the email queue.");
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
  }
  console.error("[CONFIRMATION EMAIL] Retry exhausted; inspect pending confirmation emails.");
}
