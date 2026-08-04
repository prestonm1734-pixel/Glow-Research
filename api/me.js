// The signed-in customer's real account: profile, order history, live tracking
// and a points balance derived from their actual orders.
//
// Everything is keyed off the customer id inside the signed session cookie —
// never off anything the browser sends in the request body, or one customer
// could read another's orders by changing a number.

import {
  wc, wcOptional, currentSession, metaValue, pointsForOrders,
  POINTS_PER_DOLLAR, POINTS_PER_DOLLAR_REDEEMED,
} from './_lib.js';

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
async function trackingFromAST(orderId) {
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

function trackingFromMeta(order) {
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
const STATUS_LABELS = {
  pending: 'Awaiting payment',
  'on-hold': 'On hold',
  processing: 'Processing',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
};

export default async function handler(req, res) {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const [customer, orders] = await Promise.all([
      wc(`/customers/${session.id}`),
      wc(`/orders?customer=${session.id}&per_page=50&orderby=date&order=desc`),
    ]);

    const earned = pointsForOrders(orders);
    const spent = parseInt(metaValue(customer, 'glow_points_spent') || 0, 10) || 0;

    // An order that was never paid, or came back, was never handed to a
    // carrier — asking AST about it is a wasted request every time this
    // page loads. Capped on top of that: a customer opening their account
    // is checking on something recent, and 50 near-simultaneous requests
    // out to WordPress for one page load is a real latency/timeout risk,
    // not a hypothetical one.
    const NEVER_SHIPPED = new Set(['pending', 'cancelled', 'failed', 'refunded', 'trash']);
    const toCheck = orders.filter(o => !NEVER_SHIPPED.has(o.status)).slice(0, 20);
    const astHits = await Promise.all(toCheck.map(o => trackingFromAST(o.id)));
    const astByOrderId = new Map(toCheck.map((o, i) => [o.id, astHits[i]]));

    return res.status(200).json({
      name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
      email: customer.email,
      points: Math.max(0, earned - spent),
      lifetime: earned,
      pointsPerDollar: POINTS_PER_DOLLAR,
      pointsPerDollarRedeemed: POINTS_PER_DOLLAR_REDEEMED,
      orders: orders.map(o => {
        const track = astByOrderId.get(o.id) || trackingFromMeta(o);
        return {
          id: o.number,
          date: (o.date_created || '').slice(0, 10),
          status: STATUS_LABELS[o.status] || o.status,
          total: parseFloat(o.total || 0),
          // { number, provider, link } if there is a tracking number at
          // all, with provider/link only when AST (or equivalent meta)
          // actually supplied them — never guessed.
          track,
          // fee_lines today, line_items once real SKUs exist — read both so
          // this keeps working through that switch without a second deploy.
          items: [
            ...(o.line_items || []).map(i => ({ name: i.name, qty: i.quantity })),
            ...(o.fee_lines || []).map(f => ({ name: f.name, qty: 1 })),
          ],
        };
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not load your account.' });
  }
}
