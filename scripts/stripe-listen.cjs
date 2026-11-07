/* eslint-disable @typescript-eslint/no-require-imports -- This is a standalone CommonJS CLI launcher. */
// Forward sandbox events only. Keep API/signing secrets out of terminal output.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd(), true);
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!/^(sk|rk)_test_/.test(key || '') || (process.env.STRIPE_MODE || 'test') !== 'test') {
  throw new Error('A Stripe test key and test mode are required for the local listener.');
}
const base = new URL(process.env.STRIPE_CHECKOUT_BASE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Local listener requires a localhost return URL.');
const cliRoot = path.dirname(require.resolve('@stripe/cli/package.json'));
const platform = require(path.join(cliRoot, 'platforms.json'))[`${process.platform}-${process.arch}`];
const executable = path.join(path.dirname(require.resolve(`${platform.pkg}/package.json`)), 'bin', platform.bin);
const child = spawn(executable, ['listen', '--events', 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired', '--forward-to', new URL('/api/payments/webhook', base).href], {
  env: { ...process.env, STRIPE_API_KEY: key, NO_PROXY: 'localhost,127.0.0.1,::1', ...(process.env.INDIECLASH_DEV_PROXY ? { HTTPS_PROXY: process.env.INDIECLASH_DEV_PROXY, HTTP_PROXY: process.env.INDIECLASH_DEV_PROXY } : {}) },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let ready = false;
let buffer = '';
function receive(chunk) {
  buffer = (buffer + chunk.toString()).slice(-16_000);
  const secret = buffer.match(/whsec_[A-Za-z0-9]+/);
  if (!ready && secret) {
    const file = path.join(process.cwd(), '.env.local');
    let text = fs.readFileSync(file, 'utf8');
    text = /^STRIPE_WEBHOOK_SECRET\s*=/m.test(text)
      ? text.replace(/^STRIPE_WEBHOOK_SECRET\s*=.*$/m, `STRIPE_WEBHOOK_SECRET=${secret[0]}`)
      : `${text}\nSTRIPE_WEBHOOK_SECRET=${secret[0]}\n`;
    fs.writeFileSync(file, text);
    ready = true;
    console.log('Stripe sandbox listener ready. Signing secret saved to .env.local (value hidden).');
  }
  const statuses = chunk.toString().matchAll(/\[(\d{3})\]\s+POST/g);
  for (const match of statuses) console.log(`Local webhook response: HTTP ${match[1]}`);
}
child.stdout.on('data', receive);
child.stderr.on('data', receive);
child.on('error', () => { console.error('Could not start Stripe CLI. Check the local installation.'); process.exitCode = 1; });
child.on('exit', code => { console.log(`Stripe sandbox listener stopped (${code ?? 'signal'}).`); process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
