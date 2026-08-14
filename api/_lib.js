// Shared helpers for the Glow Research serverless endpoints.
// Files prefixed with _ are not routed by Vercel, so this is internal only.
//
// Everything here uses Node's built-in crypto — the site has no package.json
// and no build step, so adding an npm dependency would mean introducing a
// toolchain for what the standard library already does correctly.

import crypto from 'node:crypto';
import { GLOW_PRODUCTS, unitPriceAt, round2 } from '../js/products-data.js';

/* ============================ Stripe ============================ */
// No SDK: the site has no package.json and installs nothing, so this talks to
// Stripe's REST API with fetch, the same way wc() below talks to
// WooCommerce's. Stripe's API takes form-encoded bodies, not JSON, and nests
// objects as bracketed keys (metadata[order_email]=x) — flattenForm() does
// that translation once so every caller can just pass a plain object.

function stripeSecret() {
  const s = process.env.STRIPE_SECRET_KEY;
  if (!s) throw new Error('Stripe is not configured yet.');
  return s;
}

function flattenForm(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      // Stripe reads an array as indexed keys — payment_method_types[0]=card
      // — not a bare payment_method_types=card. URLSearchParams stringifies
      // an array value with no brackets at all (String(['card']) === 'card'),
      // which Stripe's parser does not recognise as the array field it is:
      // it is silently ignored rather than rejected, so a caller that missed
      // this would never see an error, only a request that quietly did not
      // do what it asked. Handled once, here, so no other caller has to
      // remember it.
      v.forEach((item, i) => {
        const itemKey = `${key}[${i}]`;
        if (item && typeof item === 'object') flattenForm(item, itemKey, out);
        else out[itemKey] = item;
      });
    } else if (typeof v === 'object') {
      flattenForm(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

// POST — every write (create/update a PaymentIntent) goes through here.
export async function stripe(path, body = {}) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(flattenForm(body)).toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || 'Stripe rejected the request.');
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    throw err;
  }
  return data;
}

// GET — used to independently verify a PaymentIntent's status server-side
// before api/create-order.js trusts that a payment actually succeeded. A
// client claiming success is not evidence; Stripe's own record of the intent
// is, which is the entire reason this function exists as a separate call
// rather than trusting whatever the browser hands back from confirmPayment().
export async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecret()}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || 'Stripe rejected the request.');
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    throw err;
  }
  return data;
}

/* ============================ order pricing ============================ */
// Every dollar figure Stripe is asked to charge, and every dollar figure
// WooCommerce is told an order is worth, is computed here — never read off
// whatever the browser sent. A cart line names a product and a quantity;
// what it costs is looked up fresh against the live catalog and priced with
// the same unitPriceAt() the buy box itself uses, so a price cannot be edited
// in devtools between "add to cart" and "pay."
//
// SHIPPING_RATES mirrors the SHIPPING table in js/checkout.js by hand. That
// file drives what the checkout page displays; this is what actually gets
// billed. They have to be kept in step deliberately — a browser choosing a
// shipping method is a display choice, not something the server can take on
// faith, so there is no way to derive one table from the other across the
// browser/Node boundary without turning checkout.js into a second
// products-data.js. Two rows, changed rarely: a drift here surfaces
// immediately as a checkout that charges the wrong amount, not silently.
export const SHIPPING_RATES = [
  { id: '2day', cost: 12.95, freeOver: 400 },
  { id: 'overnight', cost: 39.95, freeOver: null },
];

// Throws rather than returning an error object: every caller is about to
// either charge a card or create an order, and both have to stop hard if the
// cart cannot be priced, not proceed with a partial or zero total.
export function priceOrder(items, shippingMethodId) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('The cart is empty.');
  }

  const lines = items.map(i => {
    // The SKU is the stable identity; the display name is not. A cart lives
    // in localStorage for weeks and outlives a rename — three products were
    // renamed in one commit recently — and matching on the name alone meant
    // every one of those carts died here, at the payment step, with an error
    // the shopper could do nothing about. Carts saved before js/cart.js
    // started recording SKUs have no sku to match on, so the name lookup
    // stays as the fallback rather than being replaced by it.
    let p = null;
    let size = null;
    if (i.sku) {
      p = GLOW_PRODUCTS.find(pr => pr.sizes.some(s => s.sku === i.sku)) || null;
      size = p ? p.sizes.find(s => s.sku === i.sku) : null;
    }
    if (!size) {
      p = GLOW_PRODUCTS.find(pr => pr.name === i.name) || null;
      size = p ? p.sizes.find(s => s.mg === i.variant) : null;
    }
    if (!p || !size) {
      throw new Error(`"${[i.name, i.variant].filter(Boolean).join(' ')}" is no longer in the catalog.`);
    }
    const qty = Math.max(1, Math.floor(Number(i.qty)) || 1);
    const unitSale = unitPriceAt(size.price, qty);
    return { name: p.name, variant: size.mg, sku: size.sku, qty, unitSale, total: round2(unitSale * qty) };
  });

  const subtotal = round2(lines.reduce((n, l) => n + l.total, 0));
  const rate = SHIPPING_RATES.find(s => s.id === shippingMethodId) || SHIPPING_RATES[0];
  const shipping = (rate.freeOver !== null && subtotal >= rate.freeOver) ? 0 : rate.cost;

  return { lines, subtotal, shipping, total: round2(subtotal + shipping), shippingMethodId: rate.id };
}

/* ============================ sales tax ============================ */
// Computed through Stripe Tax, not WooCommerce — WooCommerce never sees a
// tax rate table for this store, only the dollar figure Stripe already
// calculated, attached to the order as a fee line. Stripe Tax needs its own
// registrations added per state in the Dashboard before it will actually
// charge anything; until that happens every calculation legitimately comes
// back $0, which is the correct amount to charge with no registrations on
// file — not a bug in this code.
//
// One tax code covers the whole catalog: every SKU is a physical vial, so
// there is no mix of taxable and exempt goods to tell apart. A product ever
// needing different treatment would carry its own code on that catalog row
// rather than a hardcoded exception here.
const TAX_CODE_GOODS = 'txcd_99999999';
const TAX_CODE_SHIPPING = 'txcd_92010001';

// Returns null rather than throwing when there is nothing to price against
// (no address yet — the ordinary state of the very first PaymentIntent,
// before a shopper has typed a shipping address) or when Stripe Tax itself
// is not reachable (not yet enabled in the Dashboard, no registrations, a
// network hiccup). A checkout that cannot get a tax figure charges nothing
// rather than guessing one — the same reasoning SHIPPING_RATES already
// applies to a shipping method it does not recognise.
export async function calculateTax(lines, shippingCents, address) {
  if (!address || !address.state || !address.zip) return null;

  const body = {
    currency: 'usd',
    customer_details: {
      address: {
        line1: address.address1 || undefined,
        line2: address.address2 || undefined,
        city: address.city || undefined,
        state: address.state,
        postal_code: address.zip,
        country: 'US',
      },
      address_source: 'shipping',
    },
    line_items: lines.map((l, i) => ({
      amount: Math.round(l.total * 100),
      reference: l.sku || `line-${i}`,
      tax_behavior: 'exclusive',
      tax_code: TAX_CODE_GOODS,
    })),
  };
  if (shippingCents > 0) {
    body.shipping_cost = {
      amount: shippingCents,
      tax_behavior: 'exclusive',
      tax_code: TAX_CODE_SHIPPING,
    };
  }

  try {
    const calc = await stripe('/tax/calculations', body);
    return { id: calc.id, amount: round2((calc.tax_amount_exclusive || 0) / 100) };
  } catch (e) {
    return null;
  }
}

// The one function api/create-payment-intent.js and api/create-order.js
// both call: prices the cart and its shipping exactly as priceOrder() always
// has, then adds whatever Stripe Tax says the destination owes. Address-less
// or tax-unreachable calls fall back to zero tax rather than failing the
// whole price, since a checkout with no address yet is not an error state.
export async function priceOrderWithTax(items, shippingMethodId, address) {
  const priced = priceOrder(items, shippingMethodId);
  const tax = await calculateTax(priced.lines, Math.round(priced.shipping * 100), address);
  return {
    ...priced,
    tax: tax ? tax.amount : 0,
    taxCalculationId: tax ? tax.id : null,
    total: round2(priced.total + (tax ? tax.amount : 0)),
  };
}

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
