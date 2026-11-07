# Submission confirmation emails

The paid directory-service details endpoint queues a confirmation when the final
product information is first received. It does not email on incomplete drafts,
payment retries, duplicate submissions or page refresh. Free public listings are
not part of this email flow. No messages are sent until configuration is supplied.

1. Apply `lib/migrations/20261031_confirmation_emails.sql` in Supabase manually.
   It adds a private outbox, an atomic order-update trigger and a service-only
   claim function. Existing completed orders are not backfilled or emailed.
   Then apply `lib/migrations/20261107_confirmation_email_modes.sql`. It isolates
   live/test email claims using the owning order's mode and indexes paid history.
   Deploy the updated sender only after this migration; a missing function keeps
   messages pending rather than sending them through the wrong environment.
2. Add/verify a domain you control in Resend. A paid business mailbox is not
   required to send; domain DNS verification is required for customer recipients.
   Follow Resend's exact DNS records, without replacing existing inbound MX records.
3. Set server-only environment variables locally and in Vercel:

   ```dotenv
   RESEND_API_KEY=<sending API key>
   RESEND_FROM_EMAIL=Indie Clash <notifications@indieclash.com>
   RESEND_REPLY_TO=<your existing reply inbox, e.g. Gmail>
   STRIPE_CHECKOUT_BASE_URL=https://www.indieclash.com
   ```

   Use `onboarding@resend.dev` only for testing to your own Resend account email.
   Do not put keys in chat, source control or NEXT_PUBLIC variables. Restart local
   dev after changing environment values. Resend is not an inbound Gmail mailbox;
   replies go to RESEND_REPLY_TO if configured. This does not change Supabase OAuth.

Email order links use the same `STRIPE_CHECKOUT_BASE_URL` as payment returns.
Set it to the deployed HTTPS origin in Vercel and localhost for local testing.
The older `EMAIL_SITE_URL` setting is no longer used. The Dashboard link retains
the order ID through sign-in so the owning account can open the matching order.

Submission saves before sending. Next.js `after()` dispatches the email without
making the browser wait for the email API. Failed sends stay pending in the outbox.
The submission response schedules up to three brief delivery attempts in the
background, within a 60-second function budget. Interrupted functions and longer
outages still need the durable queue. Configure a trusted scheduler to invoke
`GET` or `POST /api/payments/emails/retry` every 5–10 minutes using
`Authorization: Bearer <CRON_SECRET>`. No recurring job is installed automatically;
use a scheduler/hosting plan that supports this frequency. Alert on non-2xx
responses, `failed > 0`, or `configured: false`. Monitor pending/sending rows whose
attempts reach 5 or age reaches 23 hours; they need operator reconciliation.
The endpoint claims at most five emails and permits at most five attempts per
message. Claims have a two-minute lease and unique token; Resend gets a stable
per-order idempotency key. Sent rows are never reclaimed.

Resend keeps idempotency keys for 24 hours; automatic claiming stops after 23
hours to avoid blindly retrying an uncertain send after that window. Inspect
older pending/sending rows and reconcile with Resend before any manual resend.
`sent` means Resend accepted the API request, not proof of inbox delivery. Delivery
webhooks are not configured yet. Changing the sender/site URL during retries can
change the idempotent payload; keep configuration stable while messages are pending.

Dashboard links let paid customers resume their product details. The **Save**
button stores incomplete paid drafts and uploaded image URLs in the private order,
so the same account can resume on another device. This is explicit save, not
autosave. Draft saves never queue a confirmation message.
