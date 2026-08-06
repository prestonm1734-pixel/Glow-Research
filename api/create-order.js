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
import {
  emailShell, heading, paragraph, eyebrow, fine, esc, sendEmail, money,
} from './_email.js';

const ADMIN_TO = 'preston@glowresearch.shop';
const SUPPORT = 'support@glowresearch.shop';

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

    // Awaited, because the function can be frozen the moment the response is
    // sent. Neither send can throw, and neither is allowed to fail the order:
    // the order exists in WooCommerce by this point, and telling the shopper
    // otherwise would have them place it twice.
    const order = { number: data.number, email, items, shippingMethod, shipping, notes };
    await Promise.all([
      sendEmail({
        to: email,
        replyTo: SUPPORT,
        subject: `Order ${data.number} confirmed — Glow Research`,
        text: orderText(order),
        html: orderHtml(order),
      }),
      sendEmail({
        to: ADMIN_TO,
        replyTo: email,
        subject: `New order ${data.number} — ${money(orderTotal(order))}`,
        text: adminText(order),
        html: adminHtml(order),
      }),
    ]);

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

/* ================== the emails ==================
   Two go out per order: a confirmation to the shopper and an alert to the
   desk. Both are built from the checkout payload rather than re-read from
   WooCommerce — the payload is what the shopper just agreed to on screen, so
   an email built from it can never disagree with the page they saw.

   Written for a live store with payment connected. Until a processor is
   actually wired in, orders are still created as `pending` above and nothing
   is charged, so do not open checkout to real customers before that lands —
   these emails will tell them they have paid. */

function orderTotal(o) {
  const sub = o.items.reduce((n, i) => n + i.unitSale * i.qty, 0);
  return sub + (o.shippingMethod ? o.shippingMethod.cost : 0);
}

function addressLines(s) {
  return [
    [s.firstName, s.lastName].filter(Boolean).join(' '),
    s.address1,
    s.address2,
    [s.city, s.state, s.zip].filter(Boolean).join(', '),
  ].filter(Boolean);
}

function itemsTable(o) {
  const sub = o.items.reduce((n, i) => n + i.unitSale * i.qty, 0);
  const ship = o.shippingMethod ? o.shippingMethod.cost : 0;

  const line = (label, value, strong) => `
    <tr>
      <td style="padding:7px 16px 7px 0;font-size:${strong ? '15' : '13'}px;color:${strong ? '#0a0a0a' : '#6e6e73'};${strong ? 'font-weight:700;' : ''}">${label}</td>
      <td style="padding:7px 0;font-size:${strong ? '15' : '13'}px;color:#0a0a0a;text-align:right;white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${value}</td>
    </tr>`;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${o.items.map(i => `
        <tr>
          <td style="padding:9px 16px 9px 0;font-size:14px;color:#0a0a0a;vertical-align:top;">
            ${esc(i.name)}${i.variant ? `<span style="color:#6e6e73;"> — ${esc(i.variant)}</span>` : ''}
            ${i.qty > 1 ? `<span style="color:#6e6e73;"> &times;${i.qty}</span>` : ''}
          </td>
          <td style="padding:9px 0;font-size:14px;color:#0a0a0a;text-align:right;vertical-align:top;white-space:nowrap;">${money(i.unitSale * i.qty)}</td>
        </tr>`).join('')}
      <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #e4e4e7;"></td></tr>
      ${line('Subtotal', money(sub))}
      ${line(o.shippingMethod ? esc(o.shippingMethod.label) : 'Shipping', ship ? money(ship) : 'Free')}
      ${line('Total', money(sub + ship), true)}
    </table>`;
}

function orderHtml(o) {
  return emailShell({
    preheader: `Order ${esc(o.number)} is confirmed. Tracking follows as soon as it ships.`,
    footerNote: 'You are receiving this because an order was placed with this email address at glowresearch.shop.',
    sections: [
      heading('Order confirmed.') +
      paragraph(`Thanks — we have your order and your payment of <strong style="color:#0a0a0a;">${money(orderTotal(o))}</strong>. Its number is <strong style="color:#0a0a0a;">${esc(o.number)}</strong>; quote that in any reply and we will find it straight away.`) +
      paragraph('You will get a second email with tracking the moment your box leaves the building.', { last: true }),

      eyebrow('What you ordered') + itemsTable(o),

      eyebrow('Shipping to') +
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#0a0a0a;">${addressLines(o.shipping).map(esc).join('<br>')}</p>` +
      (o.shippingMethod ? `<p style="margin:12px 0 0;font-size:13px;color:#6e6e73;">${esc(o.shippingMethod.label)}</p>` : ''),

      eyebrow('What happens next') +
      fine('<strong style="color:#0a0a0a;">1.</strong> Your vials are pulled, sealed, and packed in a plain, unmarked box — the same afternoon if you ordered before 2:00 PM PT on a weekday.') +
      fine('<strong style="color:#0a0a0a;">2.</strong> It goes out on 2-day FedEx with tracking.') +
      fine('<strong style="color:#0a0a0a;">3.</strong> The tracking number appears against this order in your account the moment it is issued.') +
      `<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#86868b;">
        <strong style="color:#55554f;">Research use only.</strong> Not for human or animal consumption.
        No dosing or administration guidance is provided with this order.
      </p>`,
    ],
  });
}

function orderText(o) {
  const sub = o.items.reduce((n, i) => n + i.unitSale * i.qty, 0);
  const ship = o.shippingMethod ? o.shippingMethod.cost : 0;
  return [
    'Order confirmed.',
    '',
    `Thanks — we have your order and your payment of ${money(sub + ship)}. Its number`,
    `is ${o.number}; quote that in any reply and we will find it straight away.`,
    '',
    'You will get a second email with tracking the moment your box leaves the',
    'building.',
    '',
    'WHAT YOU ORDERED',
    ...o.items.map(i => `  ${i.name}${i.variant ? ' — ' + i.variant : ''}${i.qty > 1 ? ' x' + i.qty : ''}   ${money(i.unitSale * i.qty)}`),
    `  Subtotal: ${money(sub)}`,
    `  ${o.shippingMethod ? o.shippingMethod.label : 'Shipping'}: ${ship ? money(ship) : 'Free'}`,
    `  Total: ${money(sub + ship)}`,
    '',
    'SHIPPING TO',
    ...addressLines(o.shipping).map(l => '  ' + l),
    '',
    'WHAT HAPPENS NEXT',
    '  1. Your vials are pulled, sealed, and packed in a plain, unmarked box —',
    '     the same afternoon if you ordered before 2:00 PM PT on a weekday.',
    '  2. It goes out on 2-day FedEx with tracking.',
    '  3. The tracking number appears against this order in your account the',
    '     moment it is issued.',
    '',
    'Research use only. Not for human or animal consumption. No dosing or',
    'administration guidance is provided with this order.',
    '',
    'Glow Nutrition LLC',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
  ].join('\n');
}

/* Desk copy. Reply-to is the shopper, so collecting payment is one reply
   away rather than a copy-paste out of wp-admin. */
function adminHtml(o) {
  return emailShell({
    preheader: `${money(orderTotal(o))} — ${esc(o.shipping.firstName || '')} ${esc(o.shipping.lastName || '')}`.trim(),
    sections: [
      heading(`New order ${esc(o.number)}.`) +
      paragraph(`<strong style="color:#0a0a0a;">${money(orderTotal(o))}</strong> — paid. Reply to this email to reach the customer directly.`, { last: true }),

      eyebrow('Customer') +
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#0a0a0a;">
        ${addressLines(o.shipping).map(esc).join('<br>')}<br>
        <a href="mailto:${esc(o.email)}" style="color:#0a0a0a;">${esc(o.email)}</a>
      </p>` +
      itemsTable(o) +
      (o.notes ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#55554f;"><strong style="color:#0a0a0a;">Note:</strong> ${esc(o.notes).replace(/\n/g, '<br>')}</p>` : ''),
    ],
  });
}

function adminText(o) {
  return [
    `New order ${o.number} — ${money(orderTotal(o))} (paid)`,
    '',
    'CUSTOMER',
    ...addressLines(o.shipping).map(l => '  ' + l),
    `  ${o.email}`,
    '',
    'ITEMS',
    ...o.items.map(i => `  ${i.name}${i.variant ? ' — ' + i.variant : ''}${i.qty > 1 ? ' x' + i.qty : ''}   ${money(i.unitSale * i.qty)}`),
    `  Total: ${money(orderTotal(o))}`,
    ...(o.notes ? ['', 'NOTE', '  ' + o.notes.replace(/\n/g, '\n  ')] : []),
  ].join('\n');
}
