// Vercel serverless function. Runs server-side only — the WooCommerce keys
// are read from environment variables and never reach the browser.
// Receives the checkout payload from js/checkout.js and creates a matching
// order in WooCommerce so it shows up for fulfillment/Rapid CRM.
//
// The order is attached to a customer record, created on the spot if this
// email has never ordered before. That is what makes order history, tracking
// and points work later: without it every order is an orphan and there is
// nothing for an account page to read.

import {
  currentSession, readBody, isEmail, stripeGet, priceOrderWithTax, STATUS_LABELS,
} from './_lib.js';
import { placeOrder, alertOrphanedPayment } from './_place-order.js';
import { PAYMENTS_LIVE } from '../js/products-data.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // See PAYMENTS_LIVE in js/products-data.js. Below this point the handler
  // creates a real WooCommerce order and emails the shopper that their
  // payment was received, which is only true once a payment has actually
  // been verified against Stripe further down. js/checkout.js shows an
  // honest state instead of the form for the same reason, but that is a
  // client-side courtesy, not the gate: this check is what actually stops an
  // order being created if it is ever bypassed, hit directly, or the
  // client-side copy drifts.
  if (!PAYMENTS_LIVE) {
    return res.status(503).json({
      error: 'We are not able to take orders online yet. Email support@glowresearch.shop and we will help you directly.',
    });
  }

  const body = readBody(req);
  const { customer, shipping, billing, items, shippingMethod, notes, termsAccepted, paymentIntentId, promoCode } = body;

  if (!customer || !isEmail(customer.email) || !shipping || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Missing required order details.' });
  }

  if (termsAccepted !== true) {
    return res.status(400).json({ error: 'The RUO agreement and Terms of Sale must be accepted to place an order.' });
  }

  if (typeof paymentIntentId !== 'string' || !paymentIntentId) {
    return res.status(400).json({ error: 'Missing payment confirmation.' });
  }

  const email = customer.email.trim().toLowerCase();

  // Priced fresh against the live catalog — never off i.unitSale, which is
  // whatever the browser sent and is not evidence of anything. This is the
  // same function api/create-payment-intent.js priced the PaymentIntent from,
  // tax included, so the two are checked against each other just below rather
  // than trusted independently. `shipping` (the address the order is going
  // to) is what tax is calculated against — the same address the client's
  // last create-payment-intent call would have sent, so a consistent address
  // reprices to the same tax figure both times.
  let priced;
  try {
    priced = await priceOrderWithTax(items, shippingMethod && shippingMethod.id, shipping, promoCode);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // The PaymentIntent is Stripe's record, not the browser's claim about it.
  // confirmPayment() resolving without an error in js/checkout.js means the
  // browser saw success; it does not mean the browser was telling the truth,
  // so the order is not created on that alone. Re-fetching by ID and reading
  // status directly from Stripe is the actual gate.
  let intent;
  try {
    intent = await stripeGet(`/payment_intents/${paymentIntentId}`);
  } catch (err) {
    return res.status(502).json({ error: 'Could not verify payment with the processor.' });
  }

  if (intent.status !== 'succeeded') {
    return res.status(402).json({ error: `Payment has not completed (status: ${intent.status}).` });
  }

  // The order that gets created has to be the order that was actually paid
  // for. If the cart changed between the PaymentIntent being confirmed and
  // this request — a second tab, a race, a tampered payload — the freshly
  // priced total will not match what Stripe actually collected, and that is
  // treated as a hard stop rather than an order priced from whichever number
  // is more convenient.
  const chargedCents = Math.round(priced.total * 100);
  if (intent.amount_received !== chargedCents) {
    await alertOrphanedPayment(paymentIntentId, email, intent.amount_received,
      `The cart repriced to ${(chargedCents / 100).toFixed(2)} but Stripe collected ` +
      `${(intent.amount_received / 100).toFixed(2)}, so no order was created.`);
    return res.status(409).json({
      error: 'The order total no longer matches the amount charged. Email support@glowresearch.shop with this reference: ' + paymentIntentId,
    });
  }

  // Idempotency: a retried request (the browser resubmitting, the redirect-
  // return path in js/checkout.js running twice) must not create a second
  // WooCommerce order for one payment. Stripe's own metadata on the intent is
  // where the first attempt would have recorded the order it made, checked
  // before this attempt makes another.
  const existingOrderId = (intent.metadata || {}).woo_order_id;
  if (existingOrderId) {
    return res.status(200).json({
      orderId: Number(existingOrderId),
      orderNumber: (intent.metadata || {}).woo_order_number || existingOrderId,
      discount: Number((intent.metadata || {}).discount) || 0,
      promoCode: (intent.metadata || {}).promo_code || null,
      total: intent.amount_received / 100,
    });
  }

  try {
    const result = await placeOrder({
      paymentIntentId, intent, priced, email, customer, shipping, billing,
      shippingMethod, notes, session: currentSession(req),
      // For the Meta Conversions API Purchase event (api/_meta-capi.js) —
      // present here because a real browser made this request, absent on
      // the webhook backstop path, which has no client to read these from.
      clientIp: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    // priced already carries discount/promo — placeOrder() reads them straight
    // off priced rather than needing separate params here.

    // The status is WooCommerce's own, mapped through the same STATUS_LABELS
    // the account page reads, so the confirmation page states what the store
    // actually recorded rather than a word hardcoded into thank-you.html.
    return res.status(200).json({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      status: STATUS_LABELS[result.status] || result.status || '',
      tax: result.tax,
      // Stripe's own record of what was actually collected, not the cart's
      // re-derived subtotal — this is what js/checkout.js reports to the
      // dashboard as the purchase's revenue.
      total: intent.amount_received / 100,
    });
  } catch (err) {
    // placeOrder() has already alerted the desk if WooCommerce refused the
    // order outright; a failure past that point (an email that would not
    // send, say) still means the order exists, so this response is the same
    // "we could not confirm cleanly" message either way.
    return res.status(502).json({ error: err.message || 'Could not reach the store backend.' });
  }
}
