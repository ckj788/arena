// Reproducible offline payment regression suite. No keys, network or real mail.
import { spawnSync } from 'node:child_process';
const checks = [
  'verify-launch-plans', 'verify-product-website', 'verify-submission-auth',
  'verify-payment-auth', 'verify-stripe-payments', 'verify-pay-first-ui',
  'verify-launch-rate-limits', 'verify-confirmation-emails',
];
for (const check of checks) {
  const result = spawnSync(process.execPath, [`scripts/${check}.mjs`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`PASS: ${checks.length} launch/payment verification suites.`);
