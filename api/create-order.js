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
  wc, currentSession, findCustomerByEmail, readBody, isEmail,
} from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const { customer, shipping, billing, items, shippingMethod, referral, notes, termsAccepted } = body;

  if (!customer || !isEmail(customer.email) || !shipping || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Missing required order details.' });
  }

  if (termsAccepted !== true) {
    return res.status(400).json({ error: 'The RUO agreement and Terms of Sale must be accepted to place an order.' });
  }

  const email = customer.email.trim().toLowerCase();

  // WooCommerce's line_items require a real product_id/sku, which we don't
  // have yet — the SKU list is coming from the fulfillment partner. fee_lines
  // need no product reference and still record name/qty/price per cart line,
  // fully visible on the order. Swap these to real line_items once SKUs land.
  const fee_lines = items.map(i => ({
    name: [i.name, i.variant, i.qty > 1 ? `x${i.qty}` : null].filter(Boolean).join(' — '),
    total: (i.unitSale * i.qty).toFixed(2),
  }));

  const shipping_lines = shippingMethod
    ? [{ method_title: shippingMethod.label, method_id: shippingMethod.id, total: shippingMethod.cost.toFixed(2) }]
    : [];

  const addr = a => ({
    first_name: a.firstName || '',
    last_name: a.lastName || '',
    address_1: a.address1 || '',
    address_2: a.address2 || '',
    city: a.city || '',
    state: a.state || '',
    postcode: a.zip || '',
    country: 'US',
    email,
    phone: customer.phone || '',
  });

  try {
    const customerId = await resolveCustomer(req, email, shipping);

    const data = await wc('/orders', {
      method: 'POST',
      body: JSON.stringify({
        status: 'pending', // awaiting payment — flips to processing once a payment processor is wired in
        customer_id: customerId,
        billing: addr(billing || shipping),
        shipping: addr(shipping),
        fee_lines,
        shipping_lines,
        customer_note: notes || '',
        meta_data: [
          ...(referral ? [{ key: 'referral_code', value: referral }] : []),
          { key: 'ruo_terms_accepted', value: 'yes' },
          { key: 'ruo_terms_accepted_at', value: new Date().toISOString() },
        ],
      }),
    });

    return res.status(200).json({ orderId: data.id, orderNumber: data.number });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the store backend.' });
  }
}

// A signed-in shopper's order belongs to their account. A guest's order is
// matched to an existing customer by email, or gets a new record created.
// Returning 0 (guest order) is the fallback, so a customer-creation hiccup
// costs us the account link but never the order itself.
async function resolveCustomer(req, email, shipping) {
  const session = currentSession(req);
  if (session && session.id) return session.id;

  try {
    const existing = await findCustomerByEmail(email);
    if (existing) return existing.id;

    const created = await wc('/customers', {
      method: 'POST',
      body: JSON.stringify({
        email,
        username: email,
        first_name: shipping.firstName || '',
        last_name: shipping.lastName || '',
      }),
    });
    return created.id;
  } catch (e) {
    return 0;
  }
}
