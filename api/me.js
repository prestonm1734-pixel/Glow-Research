// The signed-in customer's real account: profile, order history, live tracking
// and a points balance derived from their actual orders.
//
// Everything is keyed off the customer id inside the signed session cookie —
// never off anything the browser sends in the request body, or one customer
// could read another's orders by changing a number.

import {
  wc, currentSession, metaValue, pointsForOrders,
  POINTS_PER_DOLLAR, POINTS_PER_DOLLAR_REDEEMED,
  trackingFromAST, trackingFromMeta, STATUS_LABELS,
} from './_lib.js';

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
