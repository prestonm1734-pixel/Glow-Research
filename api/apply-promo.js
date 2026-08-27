// Vercel serverless function. Validates a promo code against Stripe and
// reports back what it is worth, so js/checkout.js can show "Applied: 20%
// off" the moment someone presses Apply rather than waiting for the next
// PaymentIntent round trip. This endpoint never changes anything — it only
// answers "is this code good, and for how much" — the actual charge is only
// ever set by api/create-payment-intent.js, which re-validates the same code
// itself rather than trusting whatever this endpoint said a moment earlier.

import { readBody, priceOrder, resolvePromoCodeForOrder } from './_lib.js';
import { PAYMENTS_LIVE } from '../js/products-data.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!PAYMENTS_LIVE) {
    return res.status(503).json({
      error: 'We are not able to take orders online yet. Email support@glowresearch.shop and we will help you directly.',
    });
  }

  const { code, items, shippingMethodId } = readBody(req);

  let priced;
  try {
    priced = priceOrder(items, shippingMethodId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const resolved = await resolvePromoCodeForOrder(code, priced);
  if (!resolved.ok) {
    return res.status(200).json({ valid: false, error: resolved.error });
  }

  return res.status(200).json({ valid: true, code: resolved.code, discount: resolved.discount });
}
