// The customer-facing order status emails, sent by api/woo-webhook.js when
// an order moves. Files prefixed with _ are not routed by Vercel.
//
// statusEmail(status) returns a builder, or null for a status we deliberately
// stay quiet about. Returning null rather than a generic "your order changed"
// is the point: an email nobody needed is worse than no email, and `pending`
// fires the moment an order is created, when create-order.js has already sent
// the confirmation.

import { emailShell, heading, paragraph, eyebrow, fine, button, esc, money } from './_email.js';

const SUPPORT = 'support@glowresearch.shop';

const RUO_NOTE = `<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#86868b;">
  <strong style="color:#55554f;">Research use only.</strong> Not for human or animal consumption.
  No dosing or administration guidance is provided with this order.
</p>`;

/* WooCommerce sends the whole order, so the line items are already here — no
   second request to render what they bought. fee_lines is read alongside
   line_items because the store is still on fee_lines until real SKUs land. */
function lines(order) {
  return [
    ...(order.line_items || []).map(i => ({ name: i.name, qty: i.quantity, total: i.total })),
    ...(order.fee_lines || []).map(f => ({ name: f.name, qty: 1, total: f.total })),
  ];
}

function itemsHtml(order) {
  const rows = lines(order).map(i => `
    <tr>
      <td style="padding:8px 16px 8px 0;font-size:14px;color:#0a0a0a;vertical-align:top;">
        ${esc(i.name)}${i.qty > 1 ? `<span style="color:#6e6e73;"> ×${i.qty}</span>` : ''}
      </td>
      <td style="padding:8px 0;font-size:14px;color:#0a0a0a;text-align:right;white-space:nowrap;vertical-align:top;">${money(i.total)}</td>
    </tr>`).join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${rows}
      <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #ebebed;"></td></tr>
      <tr>
        <td style="padding:8px 16px 8px 0;font-size:15px;font-weight:700;color:#0a0a0a;">Total</td>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0a0a0a;text-align:right;white-space:nowrap;">${money(order.total)}</td>
      </tr>
    </table>`;
}

function itemsText(order) {
  return [
    ...lines(order).map(i => `  ${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}   ${money(i.total)}`),
    `  Total: ${money(order.total)}`,
  ];
}

function shipLines(order) {
  const s = order.shipping || {};
  return [
    [s.first_name, s.last_name].filter(Boolean).join(' '),
    s.address_1, s.address_2,
    [s.city, s.state, s.postcode].filter(Boolean).join(', '),
  ].filter(Boolean);
}

const footerNote = 'You are receiving this because it concerns an order placed with this email address at glowresearch.shop.';

/* ---------- shipped ----------
   The one people actually open. Tracking leads, everything else follows it.
   The number is shown as text even when we have a link, because a tracking
   number gets pasted into a carrier site far more often than the link in an
   email gets clicked. */
function completed({ order, track }) {
  const num = order.number;
  const sections = [];

  let head = heading('Your order is on its way.') +
    paragraph(`Order <strong style="color:#0a0a0a;">${esc(num)}</strong> has shipped.`);

  if (track && track.number) {
    head += `<p style="margin:0 0 6px;font-size:13px;color:#6e6e73;">
        ${track.provider ? esc(track.provider) + ' tracking number' : 'Tracking number'}
      </p>
      <p style="margin:0 0 ${track.link ? '18' : '0'}px;font-family:'SFMono-Regular',Consolas,monospace;font-size:17px;font-weight:700;letter-spacing:.02em;color:#0a0a0a;word-break:break-all;">
        ${esc(track.number)}
      </p>`;
    if (track.link) head += button(track.link, 'Track this shipment');
  } else {
    // AST has not been given a number yet. Saying "it shipped" without one is
    // still the useful half of the message; inventing a link is not.
    head += paragraph('Your tracking number appears against this order in your account as soon as the carrier issues it.', { last: true });
  }
  sections.push(head);

  sections.push(eyebrow('What shipped') + itemsHtml(order));

  const addr = shipLines(order);
  if (addr.length) {
    sections.push(
      eyebrow('Shipping to') +
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#0a0a0a;">${addr.map(esc).join('<br>')}</p>` +
      RUO_NOTE
    );
  }

  const text = [
    'Your order is on its way.',
    '',
    `Order ${num} has shipped.`,
    '',
    ...(track && track.number
      ? [`${track.provider ? track.provider + ' tracking' : 'Tracking'} number: ${track.number}`,
         ...(track.link ? ['', track.link] : [])]
      : ['Your tracking number appears against this order in your account as soon',
         'as the carrier issues it.']),
    '',
    'WHAT SHIPPED',
    ...itemsText(order),
    ...(addr.length ? ['', 'SHIPPING TO', ...addr.map(l => '  ' + l)] : []),
    '',
    'Research use only. Not for human or animal consumption. No dosing or',
    'administration guidance is provided with this order.',
    '',
    'Glow Research',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
  ].join('\n');

  return {
    subject: `Order ${num} has shipped`,
    html: emailShell({
      preheader: track && track.number ? `Tracking: ${track.number}` : 'Tracking follows shortly.',
      footerNote,
      sections,
    }),
    text,
  };
}

/* ---------- paid / being packed ---------- */
function processing({ order }) {
  const num = order.number;
  return {
    subject: `Order ${num} is being packed`,
    html: emailShell({
      preheader: 'Payment cleared. We are packing it now.',
      footerNote,
      sections: [
        heading('We are packing your order.') +
        paragraph(`Payment on order <strong style="color:#0a0a0a;">${esc(num)}</strong> has cleared and it is being picked and packed now.`) +
        paragraph('You will get tracking by email the moment it leaves the building.', { last: true }),

        eyebrow('Your order') + itemsHtml(order) + RUO_NOTE,
      ],
    }),
    text: [
      'We are packing your order.',
      '',
      `Payment on order ${num} has cleared and it is being picked and packed now.`,
      '',
      'You will get tracking by email the moment it leaves the building.',
      '',
      'YOUR ORDER',
      ...itemsText(order),
      '',
      'Glow Research',
      '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    ].join('\n'),
  };
}

/* ---------- on hold ----------
   Vague on purpose about the cause: on-hold gets used for a failed payment,
   a stock problem, or a manual review, and guessing wrong in an email is
   worse than saying we will explain in the next one. */
function onHold({ order }) {
  const num = order.number;
  return {
    subject: `Order ${num} is on hold`,
    html: emailShell({
      preheader: 'We have paused it and will be in touch shortly.',
      footerNote,
      sections: [
        heading('Your order is on hold.') +
        paragraph(`We have paused order <strong style="color:#0a0a0a;">${esc(num)}</strong> while we sort something out. Nothing has shipped.`) +
        paragraph('Someone will email you shortly with the detail. If you would rather not wait, just reply to this message.', { last: true }),

        eyebrow('The order') + itemsHtml(order),
      ],
    }),
    text: [
      'Your order is on hold.',
      '',
      `We have paused order ${num} while we sort something out. Nothing has shipped.`,
      '',
      'Someone will email you shortly with the detail. If you would rather not',
      'wait, just reply to this message.',
      '',
      'THE ORDER',
      ...itemsText(order),
      '',
      'Glow Research',
      '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    ].join('\n'),
  };
}

/* ---------- cancelled ---------- */
function cancelled({ order }) {
  const num = order.number;
  return {
    subject: `Order ${num} was cancelled`,
    html: emailShell({
      preheader: 'Nothing shipped, and you have not been charged.',
      footerNote,
      sections: [
        heading('Your order was cancelled.') +
        paragraph(`Order <strong style="color:#0a0a0a;">${esc(num)}</strong> has been cancelled. Nothing shipped, and any authorisation on your card is released.`) +
        paragraph(`If you did not expect this, reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#0a0a0a;">${SUPPORT}</a> and we will look into it.`, { last: true }),

        eyebrow('What was cancelled') + itemsHtml(order),
      ],
    }),
    text: [
      'Your order was cancelled.',
      '',
      `Order ${num} has been cancelled. Nothing shipped, and any authorisation on`,
      'your card is released.',
      '',
      'If you did not expect this, reply to this email or write to',
      `${SUPPORT} and we will look into it.`,
      '',
      'WHAT WAS CANCELLED',
      ...itemsText(order),
      '',
      'Glow Research',
      '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    ].join('\n'),
  };
}

/* ---------- refunded ----------
   WooCommerce marks the whole order refunded here; a partial refund does not
   reach this status, so the copy can safely speak about the order total. */
function refunded({ order }) {
  const num = order.number;
  return {
    subject: `Refund issued for order ${num}`,
    html: emailShell({
      preheader: `${money(order.total)} is on its way back to you.`,
      footerNote,
      sections: [
        heading('Your refund is on its way.') +
        paragraph(`We have refunded <strong style="color:#0a0a0a;">${money(order.total)}</strong> against order <strong style="color:#0a0a0a;">${esc(num)}</strong>.`) +
        paragraph('Refunds go back to the card you paid with. Most banks post it within five to ten business days. That timing is theirs, not ours.', { last: true }),

        eyebrow('What was refunded') + itemsHtml(order),
      ],
    }),
    text: [
      'Your refund is on its way.',
      '',
      `We have refunded ${money(order.total)} against order ${num}.`,
      '',
      'Refunds go back to the card you paid with. Most banks post it within five',
      'to ten business days. That timing is theirs, not ours.',
      '',
      'WHAT WAS REFUNDED',
      ...itemsText(order),
      '',
      'Glow Research',
      '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    ].join('\n'),
  };
}

/* ---------- failed ---------- */
function failed({ order }) {
  const num = order.number;
  return {
    subject: `Payment did not go through on order ${num}`,
    html: emailShell({
      preheader: 'Nothing was charged and nothing has shipped.',
      footerNote,
      sections: [
        heading('Your payment did not go through.') +
        paragraph(`The payment on order <strong style="color:#0a0a0a;">${esc(num)}</strong> was declined, so nothing has been charged and nothing has shipped.`) +
        paragraph('Banks decline for all sorts of reasons and rarely tell us which. Placing the order again with the same card usually works; if it does not, reply here and we will sort it out with you.', { last: true }),

        eyebrow('What you tried to order') + itemsHtml(order),
      ],
    }),
    text: [
      'Your payment did not go through.',
      '',
      `The payment on order ${num} was declined, so nothing has been charged and`,
      'nothing has shipped.',
      '',
      'Banks decline for all sorts of reasons and rarely tell us which. Placing',
      'the order again with the same card usually works; if it does not, reply',
      'here and we will sort it out with you.',
      '',
      'WHAT YOU TRIED TO ORDER',
      ...itemsText(order),
      '',
      'Glow Research',
      '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    ].join('\n'),
  };
}

const BUILDERS = {
  processing,
  completed,
  'on-hold': onHold,
  cancelled,
  refunded,
  failed,
};

export function statusEmail(status) {
  return BUILDERS[status] || null;
}
