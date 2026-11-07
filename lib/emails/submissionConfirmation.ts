import { getSubmissionPlan, launchOrderDashboardPath } from "@/lib/submissionPlans";

export type SubmissionConfirmation = { order_id: string; product_name: string; plan: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function submissionConfirmationEmail(mail: SubmissionConfirmation, siteUrl: string) {
  const plan = getSubmissionPlan(mail.plan);
  const planName = plan?.name ?? mail.plan;
  const orderUrl = new URL(launchOrderDashboardPath(mail.order_id), siteUrl).href;
  const subject = "Submission received. Your launch is in good hands — Indie Clash";
  const promise = "We’ll complete your directory submissions within 10 business days of receiving your complete product details, then email you the submission report.";
  const text = [
    "INDIE CLASH", "", "Your submission is in.", "",
    `We’ve received your submission for ${mail.product_name}. Thank you for trusting us with your launch.`, "",
    promise, "Business days are Monday–Friday, excluding public holidays.", "",
    "WHAT HAPPENS NEXT", "1. We review your product details and previous listings.",
    "2. We submit your product to the directories included in your plan and email you a report of the submissions made.", "",
    `Product: ${mail.product_name}`, `Plan: ${planName}`, `Order reference: ${mail.order_id}`, "",
    `View your order: ${orderUrl}`, "Sign in with the account used to purchase this order.", "",
    "Directory approval and publication times are determined by each platform.",
    "If you need to update anything, reply to this email.", "", "A little momentum for your next chapter.", "— Indie Clash",
  ].join("\n");
  const product = escapeHtml(mail.product_name), tier = escapeHtml(planName), reference = escapeHtml(mail.order_id), href = escapeHtml(orderUrl);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Submission received — Indie Clash</title>
<style>@media only screen and (max-width:620px){.outer{padding:20px 10px!important}.content{padding:30px 24px!important}.headline{font-size:34px!important;line-height:38px!important}.brand{padding:0 14px 24px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#f4f1eb;color:#2c2923;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Your submission is received. We’ll complete your directory submissions within 10 business days and email your report.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1eb"><tr><td class="outer" align="center" style="padding:44px 20px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td class="brand" style="padding:0 4px 28px;font-size:23px;font-weight:700;letter-spacing:-1px">Indie–Clash<span style="color:#b48436">.</span></td></tr>
<tr><td style="border:1px solid #ded8cd;border-top:3px solid #b48436;border-radius:8px;background-color:#fffdf8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="content" style="padding:42px 40px">
<p style="margin:0 0 25px;color:#8d734d;font-family:'Courier New',monospace;font-size:10px;line-height:16px;letter-spacing:2px;text-transform:uppercase">01 / Submission received</p>
<h1 class="headline" style="margin:0 0 22px;font-size:42px;line-height:46px;font-weight:600;letter-spacing:-1.8px;color:#24221e">Your submission<br>is in<span style="color:#b48436">.</span></h1>
<p style="margin:0 0 30px;font-size:15px;line-height:25px;color:#716a60">We’ve received your submission for <strong style="color:#2c2923;font-weight:600">${product}</strong>. Thank you for trusting us with your launch.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4d7bf;background-color:#f7f2e8"><tr><td style="padding:24px">
<p style="margin:0 0 12px;font-family:'Courier New',monospace;font-size:10px;line-height:15px;letter-spacing:1.5px;color:#8d734d">YOUR LAUNCH TIMELINE</p>
<p style="margin:0 0 12px;font-size:30px;line-height:35px;letter-spacing:-1px;color:#2c2923">Within 10 business days</p>
<p style="margin:0;font-size:14px;line-height:23px;color:#716a60">${promise} Business days are Monday–Friday, excluding public holidays.</p>
</td></tr></table>
<p style="margin:32px 0 18px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.8px;color:#8d734d">WHAT HAPPENS NEXT</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td width="35" valign="top" style="padding:0 0 20px;font-family:'Courier New',monospace;font-size:12px;line-height:23px;color:#b48436">01</td><td style="padding:0 0 20px;font-size:14px;line-height:23px;color:#716a60"><strong style="color:#2c2923">A thoughtful review.</strong><br>We review your product details and previous listings before starting.</td></tr>
<tr><td width="35" valign="top" style="padding:0 0 26px;font-family:'Courier New',monospace;font-size:12px;line-height:23px;color:#b48436">02</td><td style="padding:0 0 26px;font-size:14px;line-height:23px;color:#716a60"><strong style="color:#2c2923">The work, then your report.</strong><br>We submit to the directories in your plan, then send your submission report to this email address.</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e0d5">
<tr><td style="padding:20px 0 10px;font-size:12px;color:#8a8174">Your plan</td><td align="right" style="padding:20px 0 10px;font-size:12px;color:#2c2923">${tier}${plan?.directories ? ` · ${plan.directories}+ directories` : ""}</td></tr>
<tr><td colspan="2" style="padding:0 0 24px;font-family:'Courier New',monospace;font-size:10px;line-height:18px;color:#8a8174;word-break:break-all">ORDER / ${reference}</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2c2923" style="border-radius:4px;mso-padding-alt:16px 24px"><a href="${href}" style="display:inline-block;padding:16px 24px;color:#fffdf8;text-decoration:none;font-size:13px;font-weight:600;line-height:18px">View your order &nbsp; →</a></td></tr></table>
<p style="margin:14px 0 0;font-size:11px;line-height:18px;color:#8a8174">Sign in with the account used to purchase this order.</p>
<p style="margin:28px 0 0;padding-top:22px;border-top:1px solid #e6e0d5;font-size:12px;line-height:20px;color:#8a8174">Directory approval and publication times are determined by each platform. If you need to update anything, reply to this email.</p>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:25px 18px 0;font-size:11px;line-height:20px;color:#9a8d7b">A little momentum for your next chapter.<br><span style="color:#716a60">Indie Clash</span></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
