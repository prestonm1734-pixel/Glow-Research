// Shared by api/create-order.js (the browser's own call, made the moment
// confirmPayment() resolves) and api/stripe-webhook.js (a server-side
// backstop that fires straight from Stripe, so an order still gets created
// even if the browser never makes it back — tab closed, connection dropped,
// a phone that locks mid-redirect). Both callers have already verified with
// Stripe that the PaymentIntent succeeded and priced the cart fresh before
// reaching here; this is only the part that turns a verified payment into a
// WooCommerce order and the two confirmation emails.
//
// Idempotency between the two callers is handled before this file is ever
// reached — both check the intent's own metadata for an existing
// woo_order_id first — plus, for the webhook specifically, a short delay
// that gives the browser's own call first crack at it. See the comment on
// that in api/stripe-webhook.js.

import { wc, stripe, findCustomerByEmail } from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, fine, esc, sendEmail, money } from './_email.js';

const ADMIN_TO = 'preston@glowresearch.shop';
const SUPPORT = 'support@glowresearch.shop';

// Carrier email-to-SMS gateway: free, no third-party SMS account needed, but
// it is genuinely just an email the carrier converts to a text on their end.
// Carriers are increasingly aggressive about filtering that, so delivery is
// best-effort, not guaranteed the way a real SMS API would be. If it turns
// out to be unreliable in practice, swap this one address for a Twilio call
// without touching anything else.
const ADMIN_SMS_TO = '6195925152@txt.att.net';

// Creates the WooCommerce order for a payment Stripe has already verified as
// succeeded, then sends the confirmation and desk emails. Throws on a
// WooCommerce failure after alerting the desk — see alertOrphanedPayment.
export async function placeOrder({ paymentIntentId, intent, priced, email, customer, shipping, billing, shippingMethod, notes, session }) {
  // WooCommerce line_items match by SKU, resolved and priced by priceOrder()
  // (called by the caller, before this function) rather than trusted from
  // whatever the request said. A line that cannot be matched to a SKU — a
  // stale cart line for a renamed or delisted product — would already have
  // failed priceOrder() and thrown before this function was ever called, so
  // by this point every line resolves and fee_lines is only ever a
  // defensive fallback.
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

  // A negative fee line, the same mechanism the tax line below uses in
  // reverse. priced.discount is already re-validated against Stripe by
  // priceOrderWithTax() (see api/_lib.js) before this function is ever
  // called, so it is never a number the browser could have made up.
  if (priced.discount > 0) {
    const label = priced.promo && priced.promo.code ? `Promo code (${priced.promo.code})` : 'Discount';
    fee_lines.push({ name: label, total: (-priced.discount).toFixed(2) });
  }

  const shipping_lines = [{
    method_title: (shippingMethod && shippingMethod.label) || 'Shipping',
    method_id: priced.shippingMethodId,
    total: priced.shipping.toFixed(2),
  }];

  // A fee line, not a WooCommerce tax_lines entry: tax_lines expects a rate
  // WooCommerce itself already knows about, and this store has no tax rate
  // table configured there on purpose — Stripe Tax is the one place the rate
  // is computed. A named fee carries the dollar figure into the order and the
  // invoice without WooCommerce needing to agree on how it was reached.
  if (priced.tax > 0) {
    fee_lines.push({ name: 'Sales tax', total: priced.tax.toFixed(2) });
  }

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
    phone: (customer && customer.phone) || '',
  });

  // Tracked so the catch below can tell the two failures apart: WooCommerce
  // refusing to create the order (no order exists, the shopper has paid for
  // nothing) and something after it going wrong (the order exists and is
  // fine). Only the first is worth waking anyone up for.
  let createdOrder = null;

  try {
    const customerId = await resolveCustomer(session, email, shipping);

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
          ...(priced.promo && priced.promo.code ? [{ key: 'promo_code', value: priced.promo.code }] : []),
          { key: 'ruo_terms_accepted', value: 'yes' },
          { key: 'ruo_terms_accepted_at', value: new Date().toISOString() },
          { key: 'stripe_payment_intent_id', value: paymentIntentId },
        ],
      }),
    });
    createdOrder = data;

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

    // Finalizes the calculation into an actual Stripe Tax transaction, keyed
    // to this order number — the record Stripe's own reporting and filing
    // tools read. Best-effort and non-fatal for the same reason as the
    // metadata write just above: the order exists and is paid for either way,
    // and this is bookkeeping on top of that, not a condition of it.
    if (priced.taxCalculationId) {
      try {
        await stripe('/tax/transactions/create_from_calculation', {
          calculation: priced.taxCalculationId,
          reference: String(data.number),
        });
      } catch (e) { /* see comment above */ }
    }

    // Priced from priced.lines, not the raw request body: the confirmation
    // email states a payment was received, so the figures in it have to be
    // the ones Stripe actually verified, not whatever the browser sent.
    const emailItems = priced.lines.map(l => ({ name: l.name, variant: l.variant, qty: l.qty, unitSale: l.unitSale }));
    const emailShipping = { id: priced.shippingMethodId, label: (shippingMethod && shippingMethod.label) || 'Shipping', cost: priced.shipping };

    // Awaited, because the function can be frozen the moment the response is
    // sent. None of the three sends can throw, and none is allowed to fail
    // the order: it exists in WooCommerce by this point, and telling the
    // shopper otherwise would have them place it twice.
    const order = {
      number: data.number, email, items: emailItems, shippingMethod: emailShipping,
      tax: priced.tax, discount: priced.discount, promoCode: (priced.promo && priced.promo.code) || null,
      shipping, notes,
    };
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

    return {
      orderId: data.id, orderNumber: data.number, status: data.status, tax: priced.tax,
      discount: priced.discount, promoCode: (priced.promo && priced.promo.code) || null,
    };
  } catch (err) {
    if (!createdOrder) {
      await alertOrphanedPayment(paymentIntentId, email, intent.amount_received,
        `WooCommerce refused the order: ${err.message || 'no reason given'}`);
    }
    throw err;
  }
}

// A payment Stripe has already captured, with no order to show for it, is the
// one failure the shopper cannot fix and nobody here would otherwise see.
// This puts it in front of the desk with the reference needed to find the
// charge and either finish the order by hand or refund it.
//
// Never throws and never blocks the response the caller is waiting on: the
// alert failing must not turn a bad outcome into a worse one.
export async function alertOrphanedPayment(paymentIntentId, email, amountCents, reason) {
  const amount = money((Number(amountCents) || 0) / 100);
  try {
    await sendEmail({
      to: ADMIN_TO,
      replyTo: email || SUPPORT,
      subject: `Payment taken, no order created: ${paymentIntentId}`,
      text: [
        `A card was charged and the order was not created. The customer has been`,
        `told to email support, and has paid ${amount}.`,
        '',
        `Stripe PaymentIntent: ${paymentIntentId}`,
        `Customer: ${email || 'unknown'}`,
        `Amount captured: ${amount}`,
        '',
        'WHAT HAPPENED',
        `  ${reason}`,
        '',
        'WHAT TO DO',
        '  Open the PaymentIntent in Stripe, then either create the order by hand',
        '  in WooCommerce and reply to this email to confirm it, or refund the',
        '  charge. Do not leave it: the money is captured either way.',
      ].join('\n'),
    });
  } catch (e) { /* see above: this alert is never allowed to fail the request */ }
}

// A signed-in shopper's order belongs to their account. A guest's order is
// matched to an existing customer by email, or gets a new record created.
// Returning 0 (guest order) is the fallback, so a customer-creation hiccup
// costs us the account link but never the order itself. `session` is the
// already-resolved cookie session (api/create-order.js has a request to read
// one from; api/stripe-webhook.js never has one, since Stripe calls this
// server-to-server with no browser cookie to send).
async function resolveCustomer(session, email, shipping) {
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
   WooCommerce a second time, and not the raw checkout payload either: the
   shopper is told they have paid, so the figures have to be the ones Stripe
   verified. */

function orderTotal(o) {
  const sub = o.items.reduce((n, i) => n + i.unitSale * i.qty, 0);
  return sub - (o.discount || 0) + (o.shippingMethod ? o.shippingMethod.cost : 0) + (o.tax || 0);
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
  const tax = o.tax || 0;
  const discount = o.discount || 0;

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
      ${discount > 0 ? line(o.promoCode ? `Promo code (${esc(o.promoCode)})` : 'Discount', '&minus;' + money(discount)) : ''}
      ${line(o.shippingMethod ? esc(o.shippingMethod.label) : 'Shipping', ship ? money(ship) : 'Free')}
      ${tax > 0 ? line('Sales tax', money(tax)) : ''}
      ${line('Total', money(sub - discount + ship + tax), true)}
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
  const tax = o.tax || 0;
  const discount = o.discount || 0;
  return [
    'Order confirmed.',
    '',
    `Thank you. We have your order and your payment of ${money(sub - discount + ship + tax)}.`,
    `Its number is ${o.number}. Quote that in any reply and we will find it straight away.`,
    '',
    'You will get a second email with tracking the moment your box leaves the',
    'building.',
    '',
    'WHAT YOU ORDERED',
    ...o.items.map(i => `  ${i.name}${i.variant ? ' ' + i.variant : ''}${i.qty > 1 ? ' ×' + i.qty : ''}   ${money(i.unitSale * i.qty)}`),
    `  Subtotal: ${money(sub)}`,
    ...(discount > 0 ? [`  ${o.promoCode ? `Promo code (${o.promoCode})` : 'Discount'}: -${money(discount)}`] : []),
    `  ${o.shippingMethod ? o.shippingMethod.label : 'Shipping'}: ${ship ? money(ship) : 'Free'}`,
    ...(tax > 0 ? [`  Sales tax: ${money(tax)}`] : []),
    `  Total: ${money(sub - discount + ship + tax)}`,
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
    ...(o.discount > 0 ? [`  ${o.promoCode ? `Promo code (${o.promoCode})` : 'Discount'}: -${money(o.discount)}`] : []),
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
