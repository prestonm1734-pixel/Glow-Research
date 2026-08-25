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

import { readBody, isEmail, stripe, encodeOrderMetadata } from './_lib.js';
import { priceOrderWithTax } from './_lib.js';
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

  const { items, shippingMethodId, email, address, paymentIntentId, order, promoCode, analytics } = readBody(req);

  let priced;
  try {
    // Tax needs a destination, which is not always known yet — called for the
    // first time the moment there is something to charge, well before a
    // shipping address exists. priceOrderWithTax() prices that call at $0 tax
    // rather than failing it; a later call, once the address is on the form,
    // repriced the same way ensurePaymentIntent() already reprices a shipping
    // method change. promoCode is re-validated against Stripe inside
    // priceOrderWithTax() itself — never trusted as a dollar figure sent from
    // the browser, only ever as the code string js/checkout.js has applied.
    priced = await priceOrderWithTax(items, shippingMethodId, address, promoCode);
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
    tax: priced.tax.toFixed(2),
    tax_calculation_id: priced.taxCalculationId || '',
    item_count: String(priced.lines.reduce((n, l) => n + l.qty, 0)),
    discount: priced.discount.toFixed(2),
    promo_code: (priced.promo && priced.promo.code) || '',
    // The dashboard's own IDs (js/analytics.js), carried through so
    // api/orders/sync in the glow-dashboard repo can tie a completed order
    // back to the session whose funnel events led to it. Not sanitized
    // beyond the string cast: they are opaque IDs this server minted no
    // guarantees about, but never rendered or executed anywhere, only stored
    // and compared as text.
    session_id: (analytics && String(analytics.sessionId || '')) || '',
    anon_id: (analytics && String(analytics.anonId || '')) || '',
  };

  // Only present on the final pricing call, right before confirmPayment() —
  // see the orderPayload comment in js/checkout.js. Metadata updates merge
  // rather than replace, so once these chunks land they survive for
  // api/stripe-webhook.js to read even though this field is absent from every
  // earlier call that only repriced the cart or a shipping change.
  if (order && order.termsAccepted === true && order.shipping && order.customer) {
    Object.assign(metadata, encodeOrderMetadata({
      email: isEmail(order.customer.email) ? order.customer.email.trim().toLowerCase() : '',
      phone: order.customer.phone || '',
      shipping: order.shipping,
      billing: order.billing || null,
      items: (items || []).map(i => ({ sku: i.sku, name: i.name, variant: i.variant, qty: i.qty })),
      shippingMethodId,
      shippingLabel: (order.shippingMethod && order.shippingMethod.label) || '',
      notes: order.notes || '',
      promoCode: promoCode || null,
    }));
  }

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
        // Explicit, not automatic_payment_methods: automatic would surface
        // whatever is switched on in the Stripe Dashboard — wallets, buy-now-
        // pay-later, bank debit — which is how the payment form ends up with
        // a row of tabs nobody asked for. Card only, on purpose: it is the
        // only method here that settles synchronously, which is what lets
        // api/create-order.js treat "succeeded" as "safe to ship." Bank debit
        // settles over several business days as `processing`, not
        // `succeeded`, and nothing in this codebase currently reopens an
        // order once a delayed payment like that finally clears — so it is
        // left out rather than offered and quietly stuck.
        payment_method_types: ['card'],
        receipt_email: metadata.order_email || undefined,
        metadata,
      });
    }

    return res.status(200).json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      total: priced.total,
      tax: priced.tax,
      discount: priced.discount,
      promoCode: (priced.promo && priced.promo.code) || null,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the payment processor.' });
  }
}
