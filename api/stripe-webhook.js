// Vercel serverless function. Server-side backstop for order creation.
//
// The normal path is entirely client-driven: js/checkout.js calls
// api/create-order.js itself the moment confirmPayment() resolves. That
// works for every ordinary checkout, but it depends on the browser still
// being there to make that second call — a closed tab, a dropped
// connection, or a phone that locks right after the charge succeeds all
// leave Stripe holding a captured payment with nothing in WooCommerce to
// show for it, and nothing in the client-side code ever runs to notice.
//
// This listens for payment_intent.succeeded directly from Stripe's own
// servers, so an order still gets created even when the browser never comes
// back. It is deliberately a backstop, not a race: see the delay below.

import crypto from 'node:crypto';
import { stripeGet, decodeOrderMetadata, priceOrderWithTax } from './_lib.js';
import { placeOrder, alertOrphanedPayment } from './_place-order.js';

// Signature verification needs the bytes exactly as Stripe signed them; a
// parsed-and-restringified body will not match.
export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe signs `${timestamp}.${rawBody}` with the endpoint's signing secret
// and sends both in the Stripe-Signature header. No SDK: this project talks
// to Stripe with fetch everywhere else too (see api/_lib.js), so the
// verification is the same handful of lines the SDK would run internally.
// A 5-minute tolerance matches Stripe's own default, wide enough for normal
// clock drift and retry delays without accepting a stale, replayed request.
function signatureValid(raw, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map(p => p.split('=')).filter(p => p.length === 2)
  );
  const { t, v1 } = parts;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET is not set — refusing to process.');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }

  const raw = await rawBody(req);
  const sig = req.headers['stripe-signature'];

  // Unsigned or wrongly signed means it did not come from Stripe. Anyone who
  // could forge this could trigger a WooCommerce order for nothing, so there
  // is no lenient path here.
  if (!signatureValid(raw, sig, secret)) {
    console.error('stripe-webhook: bad or missing signature.');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Malformed payload.' });
  }

  // Every other event type (refunds, disputes, methods attaching) is Stripe
  // telling us something already reflected elsewhere or not yet acted on by
  // this codebase. Acknowledging with 200 rather than 400 is deliberate:
  // Stripe retries a non-2xx, and there is nothing here to retry for an
  // event this endpoint was never meant to handle.
  if (!event || event.type !== 'payment_intent.succeeded') {
    return res.status(200).json({ ok: true, skipped: event && event.type });
  }

  const paymentIntentId = event.data.object.id;

  // The client-side path (js/checkout.js -> api/create-order.js) is the
  // normal one and runs the instant confirmPayment() resolves, ordinarily
  // finishing well inside a second. This webhook typically arrives around
  // the same moment, so without a delay the two would race to create the
  // same order — both would see no woo_order_id yet and both would try.
  // Waiting here, then re-fetching the intent fresh, gives the browser's own
  // call first crack at it; this only proceeds if that still has not
  // happened by the time the wait is over, which is the actual "browser
  // never came back" case this endpoint exists for.
  await new Promise(r => setTimeout(r, 6000));

  let intent;
  try {
    intent = await stripeGet(`/payment_intents/${paymentIntentId}`);
  } catch (err) {
    console.error('stripe-webhook: could not re-fetch the PaymentIntent.', err);
    return res.status(502).json({ error: 'Could not verify the payment.' });
  }

  if (intent.status !== 'succeeded') {
    // A later event (a dispute, say) landing on an intent that has since
    // moved off "succeeded" — nothing to do here.
    return res.status(200).json({ ok: true, skipped: `intent status is ${intent.status}` });
  }

  if ((intent.metadata || {}).woo_order_id) {
    return res.status(200).json({ ok: true, skipped: 'order already exists' });
  }

  const order = decodeOrderMetadata(intent.metadata);
  if (!order || !order.email || !order.shipping || !Array.isArray(order.items) || !order.items.length) {
    // The metadata this depends on is only ever written on the last pricing
    // call before confirmPayment() (see js/checkout.js) — a PaymentIntent
    // that somehow reached "succeeded" without one behind it is not
    // something this endpoint can turn into an order on its own, and it is
    // exactly the case alertOrphanedPayment exists for: paid, with nothing
    // to show for it, and no order body to reconstruct one from.
    await alertOrphanedPayment(paymentIntentId, order && order.email, intent.amount_received,
      'The PaymentIntent succeeded but carries no reconstructable order in its metadata, ' +
      'and the browser never completed api/create-order.js either.');
    return res.status(200).json({ ok: true, skipped: 'no order metadata to reconstruct' });
  }

  let priced;
  try {
    priced = await priceOrderWithTax(order.items, order.shippingMethodId, order.shipping, order.promoCode);
  } catch (err) {
    await alertOrphanedPayment(paymentIntentId, order.email, intent.amount_received,
      `Could not reprice the cart to reconstruct the order: ${err.message || 'no reason given'}`);
    return res.status(200).json({ ok: true, skipped: 'could not reprice' });
  }

  // Same hard stop as api/create-order.js: the order created has to be the
  // order that was actually paid for. A total that has drifted since the
  // charge (a price change, a repriced tax rate) is not something to guess
  // through — it goes to the desk instead.
  const chargedCents = Math.round(priced.total * 100);
  if (intent.amount_received !== chargedCents) {
    await alertOrphanedPayment(paymentIntentId, order.email, intent.amount_received,
      `The cart reconstructed to ${(chargedCents / 100).toFixed(2)} but Stripe collected ` +
      `${(intent.amount_received / 100).toFixed(2)}, so no order was created.`);
    return res.status(200).json({ ok: true, skipped: 'amount mismatch' });
  }

  try {
    const result = await placeOrder({
      paymentIntentId,
      intent,
      priced,
      email: order.email,
      customer: { email: order.email, phone: order.phone },
      shipping: order.shipping,
      billing: order.billing,
      shippingMethod: { id: order.shippingMethodId, label: order.shippingLabel },
      notes: order.notes,
      session: null, // no browser cookie on a server-to-server call — see resolveCustomer in _place-order.js
    });
    return res.status(200).json({ ok: true, orderId: result.orderId, orderNumber: result.orderNumber });
  } catch (err) {
    // placeOrder() has already alerted the desk if WooCommerce refused the
    // order. Returning 200 either way: retrying this event would only repeat
    // the same failure, and the desk already has what it needs to finish the
    // order by hand.
    return res.status(200).json({ ok: false, error: err.message || 'Could not create the order.' });
  }
}
