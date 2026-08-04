// Configuration check. Reports whether each environment variable is present
// and whether the store answers — never their values, so this is safe to hit
// from a browser while setting the site up.

import { wcConfig } from './_lib.js';

export default async function handler(req, res) {
  const env = {
    WC_URL: process.env.WC_URL ? 'set' : 'MISSING',
    WC_CONSUMER_KEY: process.env.WC_CONSUMER_KEY ? 'set' : 'MISSING',
    WC_CONSUMER_SECRET: process.env.WC_CONSUMER_SECRET ? 'set' : 'MISSING',
    SESSION_SECRET: process.env.SESSION_SECRET ? 'set' : 'MISSING',
  };

  const out = { env, store: 'not checked' };

  const cfg = wcConfig();
  if (cfg) {
    // A cheap authenticated call: proves the URL resolves and the key pair is
    // accepted, without creating or reading anything meaningful.
    try {
      const r = await fetch(`${cfg.base}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: cfg.auth },
      });
      if (r.ok) out.store = 'reachable, credentials accepted';
      else if (r.status === 401) out.store = 'reachable, but the API key was rejected (401)';
      else out.store = `reachable, but returned HTTP ${r.status}`;
    } catch (e) {
      out.store = 'could not be reached from the server';
    }
  }

  out.ready = Object.values(env).every(v => v === 'set') && out.store.startsWith('reachable, credentials');

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
}
