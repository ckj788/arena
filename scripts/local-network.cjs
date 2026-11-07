/* eslint-disable @typescript-eslint/no-require-imports -- Node --require needs a CommonJS preloader. */
// Opt-in local development routing; this file is not loaded by build/start.
require('@next/env').loadEnvConfig(process.cwd(), true);
const localProxy = process.env.INDIECLASH_DEV_PROXY?.trim();
if (localProxy && process.env.NODE_ENV !== 'production') {
  const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new EnvHttpProxyAgent({ httpProxy: localProxy, httpsProxy: localProxy, noProxy: 'localhost,127.0.0.1,::1' }));
  process.env.INDIECLASH_DEV_PROXY_ACTIVE = '1';
}
