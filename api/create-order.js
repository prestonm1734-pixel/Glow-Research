// Vercel serverless function. Runs server-side only — the WooCommerce keys
// below are read from environment variables and never reach the browser.
// Receives the checkout payload from js/checkout.js and creates a matching
// order in WooCommerce so it shows up for fulfillment/Rapid CRM.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET } = process.env;
  if (!WC_URL || !WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) {
    return res.status(500).json({ error: 'Store is not configured yet.' });
  }

  const body = req.body || {};
  const { customer, shipping, billing, items, shippingMethod, referral, notes } = body;

  if (!customer || !customer.email || !shipping || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Missing required order details.' });
  }

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
    email: customer.email,
    phone: customer.phone || '',
  });

  const orderPayload = {
    status: 'pending', // awaiting payment — flips to processing once a payment processor is wired in
    billing: addr(billing || shipping),
    shipping: addr(shipping),
    fee_lines,
    shipping_lines,
    customer_note: notes || '',
    meta_data: referral ? [{ key: 'referral_code', value: referral }] : [],
  };

  try {
    const auth = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
    const wcRes = await fetch(`${WC_URL.replace(/\/$/, '')}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await wcRes.json();
    if (!wcRes.ok) {
      return res.status(502).json({ error: data.message || 'WooCommerce rejected the order.' });
    }

    return res.status(200).json({ orderId: data.id, orderNumber: data.number });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the store backend.' });
  }
}
