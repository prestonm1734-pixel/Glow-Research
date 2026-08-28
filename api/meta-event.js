// First-party relay for the funnel events Meta's pixel sends from the
// browser, so the same events arrive a second time from a server.
//
// Why this exists when js/meta-pixel.js already sends them. The pixel loads
// from connect.facebook.net and posts to facebook.com, both of which every
// mainstream blocklist carries, so a meaningful share of real traffic never
// reports a page view or an add to cart at all. This endpoint is on
// glowresearch.shop, same origin as the page, which is what gets the event
// out of the browser. From there it goes server to server, where nothing on
// the visitor's machine can stop it.
//
// The server also knows two things the browser cannot state about itself:
// the real client IP and the unspoofed User-Agent. Both are match-quality
// signals for Meta, and both are read from the request here rather than
// accepted from the body.
//
// Purchase is deliberately NOT relayable through this endpoint. See ALLOWED.

import { META_PIXEL_ID } from '../js/products-data.js';
import { sendMetaEvent } from './_meta-capi.js';

// This endpoint is public and unauthenticated, because it has to be: it is
// called by anonymous visitors before they have any identity. That makes
// every event it accepts something a stranger can forge, which decides the
// list.
//
// The four here are optimisation signal. Forged ones cost ad spend
// efficiency, which is bad but recoverable, and Meta's own volume anomaly
// detection is the backstop.
//
// Purchase is not on the list and must not be added. A forged Purchase
// carrying a value would corrupt reported revenue and ROAS, which is the
// number every bidding decision is made against, and it would be
// indistinguishable from a real sale after the fact. Purchase already
// reaches Meta server-side from api/_place-order.js, which fires only after
// api/create-order.js or api/stripe-webhook.js has independently verified a
// PaymentIntent as succeeded. That is the whole difference: that path proves
// the sale, this one only relays a claim.
const ALLOWED = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout']);

// custom_data is passed to Meta, so it is rebuilt field by field rather than
// forwarded as-is: an arbitrary object from a request body has no business
// reaching the ad account, and an unbounded array is a way to make our own
// egress somebody else's toy.
function cleanCustomData(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  if (Array.isArray(raw.content_ids)) {
    const ids = raw.content_ids
      .filter(id => typeof id === 'string' && id.length <= 64)
      .slice(0, 50);
    if (ids.length) out.content_ids = ids;
  }
  if (raw.content_type === 'product') out.content_type = 'product';
  if (typeof raw.value === 'number' && isFinite(raw.value) && raw.value >= 0) {
    out.value = Math.min(raw.value, 1e6);
  }
  if (typeof raw.num_items === 'number' && isFinite(raw.num_items) && raw.num_items > 0) {
    out.num_items = Math.min(Math.round(raw.num_items), 999);
  }
  if (out.value !== undefined) out.currency = 'USD';
  return Object.keys(out).length ? out : undefined;
}

// Meta records event_source_url as the page the event happened on, so it has
// to be one of our pages. A caller-supplied URL is otherwise a way to make
// our pixel report traffic on a site we do not own.
function ownUrl(raw, host) {
  if (typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    if (u.hostname !== host && u.hostname !== 'glowresearch.shop') return undefined;
    return u.toString();
  } catch (e) {
    return undefined;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { eventName, eventId, eventSourceUrl, fbc, fbp, customData } = body;

  if (!ALLOWED.has(eventName)) return res.status(400).json({ error: 'unsupported event' });
  // Without an event_id this cannot be paired with the browser's copy, and an
  // unpaired duplicate is worse than a missing one: it inflates every count.
  if (typeof eventId !== 'string' || !eventId || eventId.length > 100) {
    return res.status(400).json({ error: 'eventId required' });
  }

  // Awaited, not fired and forgotten. The serverless function is frozen the
  // moment this handler returns, so an un-awaited fetch is a coin flip over
  // whether the event ever leaves. sendMetaEvent() swallows its own failures,
  // so awaiting it cannot turn a Meta outage into an error on this endpoint.
  await sendMetaEvent({
    pixelId: META_PIXEL_ID,
    accessToken: process.env.META_CAPI_ACCESS_TOKEN,
    eventName,
    eventId,
    eventSourceUrl: ownUrl(eventSourceUrl, req.headers.host),
    fbc: typeof fbc === 'string' && fbc.length <= 200 ? fbc : undefined,
    fbp: typeof fbp === 'string' && fbp.length <= 200 ? fbp : undefined,
    clientIp: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    customData: cleanCustomData(customData),
  });

  // Nothing for the browser to do with a result: the page has already
  // rendered and the pixel has already sent its own copy.
  return res.status(204).end();
}
