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
  stripe, stripeGet, priceOrder,
} from './_lib.js';
import {
  emailShell, heading, paragraph, eyebrow, fine, esc, sendEmail, money,
} from './_email.js';
import { PAYMENTS_LIVE } from '../js/products-data.js';

const ADMIN_TO = 'preston@glowresearch.shop';
const SUPPORT = 'support@glowresearch.shop';

// Carrier email-to-SMS gateway: free, no third-party SMS account needed, but
// it is genuinely just an email the carrier converts to a text on their end.
// Carriers are increasingly aggressive about filtering that, so delivery is
// best-effort, not guaranteed the way a real SMS API would be. If it turns
// out to be unreliable in practice, swap this one address for a Twilio call
// without touching anything else.
const ADMIN_SMS_TO = '6195925152@txt.att.net';

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
  const { customer, shipping, billing, items, shippingMethod, referral, notes, termsAccepted, paymentIntentId } = body;

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
  // so the two are checked against each other just below rather than trusted
  // independently.
  let priced;
  try {
    priced = priceOrder(items, shippingMethod && shippingMethod.id);
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
    });
  }

  // WooCommerce line_items match by SKU, resolved and priced by priceOrder()
  // above rather than trusted from the cart payload. A line that cannot be
  // matched to a SKU — a stale cart line for a renamed or delisted product —
  // would already have failed priceOrder() and returned 400 above, so by this
  // point every line resolves and fee_lines is only ever a defensive fallback.
  const line_items = [];
  const fee_lines = [];
  priced.lines.forEach(l => {
    const total = l.total.toFixed(2);
    if (l.sku) {
      line_items.push({ sku: l.sku, quantity: l.qty, subtotal: total, total });
    } else {
      fee_lines.push({
        name: [l.name, l.variant, l.qty > 1 ? `×${l.qty}` : null].filter(Boolean).join(' '),
        total,
      });
    }
  });

  const shipping_lines = [{
    method_title: (shippingMethod && shippingMethod.label) || 'Shipping',
    method_id: priced.shippingMethodId,
    total: priced.shipping.toFixed(2),
  }];

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
        status: 'processing', // paid — Stripe verified above, before this call is ever made
        customer_id: customerId,
        billing: addr(billing || shipping),
        shipping: addr(shipping),
        line_items,
        fee_lines,
        shipping_lines,
        customer_note: notes || '',
        meta_data: [
          ...(referral ? [{ key: 'referral_code', value: referral }] : []),
          { key: 'ruo_terms_accepted', value: 'yes' },
          { key: 'ruo_terms_accepted_at', value: new Date().toISOString() },
          { key: 'stripe_payment_intent_id', value: paymentIntentId },
        ],
      }),
    });

    // Best-effort, non-fatal: the WooCommerce order already exists by this
    // point, and losing this write only weakens the idempotency check further
    // up for a retry that (per Stripe) is now unlikely anyway, since the
    // intent has moved past requires_payment_method. It must not undo an
    // order that was already created and already paid for.
    try {
      await stripe(`/payment_intents/${paymentIntentId}`, {
        metadata: { woo_order_id: String(data.id), woo_order_number: String(data.number) },
      });
    } catch (e) { /* see comment above */ }

    // Priced from priced.lines, not the raw request body: the confirmation
    // email states a payment was received, so the figures in it have to be
    // the ones Stripe actually verified, not whatever the browser sent.
    const emailItems = priced.lines.map(l => ({ name: l.name, variant: l.variant, qty: l.qty, unitSale: l.unitSale }));
    const emailShipping = { id: priced.shippingMethodId, label: (shippingMethod && shippingMethod.label) || 'Shipping', cost: priced.shipping };

    // Awaited, because the function can be frozen the moment the response is
    // sent. None of the three sends can throw, and none is allowed to fail
    // the order: it exists in WooCommerce by this point, and telling the
    // shopper otherwise would have them place it twice.
    const order = { number: data.number, email, items: emailItems, shippingMethod: emailShipping, shipping, notes };
    await Promise.all([
      sendEmail({
        to: email,
        replyTo: SUPPORT,
        subject: `Order ${data.number} confirmed`,
        text: orderText(order),
        html: orderHtml(order),
      }),
      sendEmail({
        to: ADMIN_TO,
        replyTo: email,
        subject: `New order ${data.number} for ${money(orderTotal(order))}`,
        text: adminText(order),
        html: adminHtml(order),
      }),
      sendAdminText(order),
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
   desk. Built from `priced` and the WooCommerce response, not re-read from
   WooCommerce a second time — but also not the raw checkout payload anymore:
   see emailItems/emailShipping above. The shopper is told they have paid, so
   the figures have to be the ones Stripe verified, not whatever the browser
   sent, even though in the ordinary case the two agree exactly. */

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
            ${esc(i.name)}${i.variant ? `<span style="color:#6e6e73;"> ${esc(i.variant)}</span>` : ''}
            ${i.qty > 1 ? `<span style="color:#6e6e73;"> &times;${i.qty}</span>` : ''}
          </td>
          <td style="padding:9px 0;font-size:14px;color:#0a0a0a;text-align:right;vertical-align:top;white-space:nowrap;">${money(i.unitSale * i.qty)}</td>
        </tr>`).join('')}
      <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #ebebed;"></td></tr>
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
      paragraph(`Thank you. We have your order and your payment of <strong style="color:#0a0a0a;">${money(orderTotal(o))}</strong>. Its number is <strong style="color:#0a0a0a;">${esc(o.number)}</strong>. Quote that in any reply and we will find it straight away.`) +
      paragraph('You will get a second email with tracking the moment your box leaves the building.', { last: true }),

      eyebrow('What you ordered') + itemsTable(o),

      eyebrow('Shipping to') +
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#0a0a0a;">${addressLines(o.shipping).map(esc).join('<br>')}</p>` +
      (o.shippingMethod ? `<p style="margin:12px 0 0;font-size:13px;color:#6e6e73;">${esc(o.shippingMethod.label)}</p>` : ''),

      eyebrow('What happens next') +
      fine('<strong style="color:#0a0a0a;">1.</strong> Your vials are pulled, sealed, and packed in a plain, unmarked box. Orders placed before 2:00 PM PT on a weekday go out the same afternoon.') +
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
    `Thank you. We have your order and your payment of ${money(sub + ship)}.`,
    `Its number is ${o.number}. Quote that in any reply and we will find it straight away.`,
    '',
    'You will get a second email with tracking the moment your box leaves the',
    'building.',
    '',
    'WHAT YOU ORDERED',
    ...o.items.map(i => `  ${i.name}${i.variant ? ' ' + i.variant : ''}${i.qty > 1 ? ' ×' + i.qty : ''}   ${money(i.unitSale * i.qty)}`),
    `  Subtotal: ${money(sub)}`,
    `  ${o.shippingMethod ? o.shippingMethod.label : 'Shipping'}: ${ship ? money(ship) : 'Free'}`,
    `  Total: ${money(sub + ship)}`,
    '',
    'SHIPPING TO',
    ...addressLines(o.shipping).map(l => '  ' + l),
    '',
    'WHAT HAPPENS NEXT',
    '  1. Your vials are pulled, sealed, and packed in a plain, unmarked box.',
    '     Orders placed before 2:00 PM PT on a weekday go out the same afternoon.',
    '  2. It goes out on 2-day FedEx with tracking.',
    '  3. The tracking number appears against this order in your account the',
    '     moment it is issued.',
    '',
    'Research use only. Not for human or animal consumption. No dosing or',
    'administration guidance is provided with this order.',
    '',
    'Glow Research',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
  ].join('\n');
}

/* Desk copy. Reply-to is the shopper, so collecting payment is one reply
   away rather than a copy-paste out of wp-admin. */
function adminHtml(o) {
  return emailShell({
    preheader: `${money(orderTotal(o))} from ${esc(o.shipping.firstName || '')} ${esc(o.shipping.lastName || '')}`.trim(),
    sections: [
      heading(`New order ${esc(o.number)}.`) +
      paragraph(`<strong style="color:#0a0a0a;">${money(orderTotal(o))}</strong>, paid. Reply to this email to reach the customer directly.`, { last: true }),

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
    `New order ${o.number} for ${money(orderTotal(o))} (paid)`,
    '',
    'CUSTOMER',
    ...addressLines(o.shipping).map(l => '  ' + l),
    `  ${o.email}`,
    '',
    'ITEMS',
    ...o.items.map(i => `  ${i.name}${i.variant ? ' ' + i.variant : ''}${i.qty > 1 ? ' ×' + i.qty : ''}   ${money(i.unitSale * i.qty)}`),
    `  Total: ${money(orderTotal(o))}`,
    ...(o.notes ? ['', 'NOTE', '  ' + o.notes.replace(/\n/g, '\n  ')] : []),
  ].join('\n');
}

/* Carrier email-to-SMS gateway. Body only, no HTML, no subject line, because
   most gateways either drop the subject or fold it into the body as an extra
   line, and a long body gets silently truncated or split into several texts.
   One line: order number, amount, buyer name. Everything else is a reply-tap
   away in the two emails that just went out. */
function sendAdminText(o) {
  const name = [o.shipping.firstName, o.shipping.lastName].filter(Boolean).join(' ') || o.email;
  return sendEmail({
    to: ADMIN_SMS_TO,
    subject: 'Glow order',
    text: `Glow order ${o.number}: ${money(orderTotal(o))} from ${name}`,
  });
}
