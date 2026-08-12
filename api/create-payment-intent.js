// Vercel serverless function. Creates or updates the Stripe PaymentIntent
// that js/checkout.js mounts the Payment Element against.
//
// Called twice in a normal checkout: once when the payment form first has
// something to charge, and again whenever the cart or the shipping method
// changes afterward, so the amount Stripe will actually collect never lags
// behind what the page is showing. api/create-order.js is what actually
// matters for correctness — it re-verifies the PaymentIntent against Stripe
// before ever creating a WooCommerce order — but a stale amount here would
// still mean charging someone the wrong total, so this keeps it current
// rather than leaving that entirely to the backstop.

import { readBody, isEmail, stripe } from './_lib.js';
import { priceOrder } from './_lib.js';
import { PAYMENTS_LIVE } from '../js/products-data.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Same gate and the same reasoning as api/create-order.js: a client-side
  // check is a courtesy, this is what actually stops a PaymentIntent being
  // created if the flag is ever false — direct hit, bypassed UI, whatever.
  if (!PAYMENTS_LIVE) {
    return res.status(503).json({
      error: 'We are not able to take orders online yet. Email support@glowresearch.shop and we will help you directly.',
    });
  }

  const { items, shippingMethodId, email, paymentIntentId } = readBody(req);

  let priced;
  try {
    priced = priceOrder(items, shippingMethodId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const amount = Math.round(priced.total * 100);
  // Stripe's own minimum for a USD charge; below this it rejects the intent
  // outright, and a cart cannot honestly reach it given the catalog's prices,
  // but failing with a clear reason beats a confusing Stripe error surfacing
  // through the payment form.
  if (amount < 50) {
    return res.status(400).json({ error: 'The order total is too small to charge.' });
  }

  const metadata = {
    order_email: isEmail(email) ? email.trim().toLowerCase() : '',
    subtotal: priced.subtotal.toFixed(2),
    shipping: priced.shipping.toFixed(2),
    item_count: String(priced.lines.reduce((n, l) => n + l.qty, 0)),
  };

  try {
    let intent;

    // Updating in place — rather than creating a new PaymentIntent on every
    // cart change — is what lets the already-mounted Payment Element keep
    // its client_secret and the shopper keep whatever they have typed.
    // Stripe refuses to update an intent that has moved past
    // requires_payment_method (already succeeded, already canceled, a
    // redirect in flight), so that failure is expected, not exceptional:
    // fall through and mint a fresh one instead of surfacing an error for a
    // perfectly normal case.
    if (paymentIntentId) {
      try {
        intent = await stripe(`/payment_intents/${paymentIntentId}`, {
          amount,
          metadata,
        });
      } catch (e) {
        intent = null;
      }
    }

    if (!intent) {
      intent = await stripe('/payment_intents', {
        amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: metadata.order_email || undefined,
        metadata,
      });
    }

    return res.status(200).json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      total: priced.total,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the payment processor.' });
  }
}
