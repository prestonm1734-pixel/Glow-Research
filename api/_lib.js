// Shared helpers for the Glow Research serverless endpoints.
// Files prefixed with _ are not routed by Vercel, so this is internal only.
//
// Everything here uses Node's built-in crypto — the site has no package.json
// and no build step, so adding an npm dependency would mean introducing a
// toolchain for what the standard library already does correctly.

import crypto from 'node:crypto';

/* ============================ WooCommerce ============================ */

export function wcConfig() {
  const { WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET } = process.env;
  if (!WC_URL || !WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) return null;
  return {
    base: WC_URL.replace(/\/$/, ''),
    auth: 'Basic ' + Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64'),
  };
}

// Shared request plumbing. `path` is the full path after the store's base
// URL, so callers outside the `/wp-json/wc/v3` namespace (a tracking plugin,
// say) can use it too.
async function wcRequest(path, options = {}) {
  const cfg = wcConfig();
  if (!cfg) throw new Error('Store is not configured yet.');

  const res = await fetch(`${cfg.base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: cfg.auth,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);
  return { res, data };
}

// Thin wrapper over the WooCommerce REST API. Throws on a non-2xx so callers
// can let one try/catch cover both transport and API-level failures.
export async function wc(path, options = {}) {
  const { res, data } = await wcRequest(`/wp-json/wc/v3${path}`, options);
  if (!res.ok) {
    const err = new Error((data && data.message) || 'The store rejected the request.');
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

// For endpoints that may legitimately not be there — an optional plugin
// that isn't installed yet, a feature not turned on for this store. "Not
// there" and "briefly unreachable" are treated the same way: the caller
// gets null and moves on, rather than one missing plugin taking the rest
// of a page down with a thrown error.
export async function wcOptional(path) {
  try {
    const { res, data } = await wcRequest(path);
    return res.ok ? data : null;
  } catch (e) {
    return null;
  }
}

/* ============================ passwords ============================ */
// scrypt with a per-user random salt. Stored on the WooCommerce customer as
// meta rather than in a database of our own, so there is exactly one record
// of a customer and it lives where the orders do.

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  try {
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(keyHex, 'hex');
    // constant-time compare; a length mismatch is rejected before timingSafeEqual,
    // which throws on differing lengths
    if (key.length !== expected.length) return false;
    return crypto.timingSafeEqual(key, expected);
  } catch (e) {
    return false;
  }
}

/* ============================ sessions ============================ */
// Signed token in an HttpOnly cookie. No server-side session store: the
// signature is what makes it trustworthy, and the expiry is inside the
// payload so a copied cookie cannot outlive it.

const SESSION_DAYS = 30;

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set.');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function makeToken(customerId, email) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = Buffer.from(JSON.stringify({ id: customerId, email, exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 86400;
  return `glow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return 'glow_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function currentSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)glow_session=([^;]+)/);
  return match ? readToken(decodeURIComponent(match[1])) : null;
}

/* ============================ customers ============================ */

export async function findCustomerByEmail(email) {
  const list = await wc(`/customers?email=${encodeURIComponent(email)}&role=all`);
  return Array.isArray(list) && list.length ? list[0] : null;
}

export function metaValue(record, key) {
  const meta = (record && record.meta_data) || [];
  const hit = meta.find(m => m.key === key);
  return hit ? hit.value : null;
}

/* ============================ points ============================ */
// Derived from real orders every time rather than kept as a running total.
// A stored counter drifts the first time an order is refunded or edited in
// wp-admin; a derived one cannot.

// 1 point per $1 spent, 100 points redeems for $1 off — a flat 1% back.
// Both numbers are sent to the client so the account page never has to
// restate the rate and drift out of step with what is actually awarded.
export const POINTS_PER_DOLLAR = 1;
export const POINTS_PER_DOLLAR_REDEEMED = 100;

// Orders that never became revenue must not earn points.
const VOID_STATUSES = new Set(['cancelled', 'failed', 'refunded', 'trash']);

export function pointsForOrders(orders) {
  return orders.reduce((sum, o) => {
    if (VOID_STATUSES.has(o.status)) return sum;
    return sum + Math.floor(parseFloat(o.total || 0) * POINTS_PER_DOLLAR);
  }, 0);
}

/* ============================ misc ============================ */

export function readBody(req) {
  // Vercel parses JSON bodies, but a string can still arrive if the
  // content-type was not set by the caller.
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

export function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/* ============================ tracking ============================ */

// Advanced Shipment Tracking (and AST Pro) register a dedicated REST
// endpoint per order, and it resolves the carrier's real tracking URL for
// us — a predefined provider's own link, or whatever custom link the
// fulfillment partner set. That is strictly better than the meta-scraping
// fallback below, which only ever had a bare number and no way to know
// which carrier it belonged to (a page that then had to guess FedEx and
// was wrong every time it wasn't FedEx).
//
// wcOptional() never throws: if the plugin is not installed, or a call
// happens to fail, this resolves to null and the order falls back to the
// meta scan rather than taking the whole account page down.
export async function trackingFromAST(orderId) {
  const items = await wcOptional(`/wp-json/wc-shipment-tracking/v3/orders/${orderId}/shipment-trackings`);
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const t = list[list.length - 1]; // most recently added shipment
  if (!t || !t.tracking_number) return null;
  return {
    number: String(t.tracking_number),
    provider: t.tracking_provider || t.custom_tracking_provider || null,
    link: t.tracking_link || t.custom_tracking_link || null,
  };
}

// Fallback for stores without AST: some plugins (or a manual entry) leave a
// bare tracking number in order meta with no way to know the carrier, so
// this can offer a number but never a trustworthy link.
const TRACKING_META_KEYS = [
  '_tracking_number', 'tracking_number',
  '_wc_shipment_tracking_number', '_aftership_tracking_number',
];

export function trackingFromMeta(order) {
  const meta = order.meta_data || [];

  for (const key of TRACKING_META_KEYS) {
    const hit = meta.find(m => m.key === key);
    if (hit && hit.value) return { number: String(hit.value), provider: null, link: null };
  }

  // AST also writes this same array into order meta; reachable here without
  // a second request if the REST API ever returns it, though in practice
  // trackingFromAST() above is what surfaces it.
  const items = meta.find(m => m.key === '_wc_shipment_tracking_items');
  if (items && Array.isArray(items.value) && items.value.length) {
    const first = items.value[0];
    if (first && first.tracking_number) {
      return {
        number: String(first.tracking_number),
        provider: first.tracking_provider || first.custom_tracking_provider || null,
        link: first.tracking_link || first.custom_tracking_link || null,
      };
    }
  }
  return null;
}

// WooCommerce statuses are lowercase slugs; the account UI shows prose.
export const STATUS_LABELS = {
  pending: 'Awaiting payment',
  'on-hold': 'On hold',
  processing: 'Processing',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
};
