// The signed-in customer's real account: profile, order history, live tracking
// and a points balance derived from their actual orders.
//
// Everything is keyed off the customer id inside the signed session cookie —
// never off anything the browser sends in the request body, or one customer
// could read another's orders by changing a number.

import {
  wc, currentSession, metaValue, pointsForOrders,
  POINTS_PER_DOLLAR, POINTS_PER_DOLLAR_REDEEMED,
} from './_lib.js';

// Where a tracking number might land depends on which plugin the fulfillment
// partner writes through, so check the common keys rather than betting on one.
const TRACKING_KEYS = [
  '_tracking_number', 'tracking_number',
  '_wc_shipment_tracking_number', '_aftership_tracking_number',
];

function trackingFor(order) {
  const meta = order.meta_data || [];

  for (const key of TRACKING_KEYS) {
    const hit = meta.find(m => m.key === key);
    if (hit && hit.value) return String(hit.value);
  }

  // The Shipment Tracking plugin stores an array of shipments instead of a
  // plain string.
  const items = meta.find(m => m.key === '_wc_shipment_tracking_items');
  if (items && Array.isArray(items.value) && items.value.length) {
    const first = items.value[0];
    if (first && first.tracking_number) return String(first.tracking_number);
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

    return res.status(200).json({
      name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
      email: customer.email,
      points: Math.max(0, earned - spent),
      lifetime: earned,
      pointsPerDollar: POINTS_PER_DOLLAR,
      pointsPerDollarRedeemed: POINTS_PER_DOLLAR_REDEEMED,
      orders: orders.map(o => {
        const tracking = trackingFor(o);
        return {
          id: o.number,
          date: (o.date_created || '').slice(0, 10),
          status: STATUS_LABELS[o.status] || o.status,
          total: parseFloat(o.total || 0),
          track: tracking,
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
