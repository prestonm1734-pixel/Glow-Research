// Vercel serverless function. Receives the contact form from contact.html
// and emails it to support, then acknowledges it back to the sender.
//
// No database and no ticket system: the page promises "one inbox, checked by
// a person", so this endpoint's only job is getting the message into that
// inbox with a reply-to that works.

import { readBody, isEmail } from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, fine, esc, sendEmail } from './_email.js';

const SUPPORT = 'support@glowresearch.shop';
const MAX_MESSAGE = 5000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const reference = (body.reference || '').trim();
  const message = (body.message || '').trim();

  // Honeypot: a field positioned off-screen and hidden from assistive tech, so
  // only a bot filling every input will have touched it. Answering 200 rather
  // than an error means the bot has nothing to tune against.
  if ((body.website || '').trim()) return res.status(200).json({ ok: true });

  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ error: 'Add your name, email, and a message.' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: 'That message is too long. Please keep it under 5,000 characters.' });
  }

  const m = { name, email, reference, message };

  // The support copy is the one that matters — if it does not land, the
  // message effectively was never sent, so its failure is the request's.
  const delivered = await sendEmail({
    to: SUPPORT,
    replyTo: email,
    subject: `Contact form: ${name}${reference ? ` (${reference})` : ''}`,
    text: deskText(m),
    html: deskHtml(m),
  });

  if (!delivered) {
    return res.status(502).json({ error: `Could not send your message. Please email ${SUPPORT} directly.` });
  }

  // Acknowledgement. After the desk copy and not fatal: the message is already
  // in, and failing here would only prompt a resend that duplicates it.
  await sendEmail({
    to: email,
    replyTo: SUPPORT,
    subject: 'We have your message',
    text: ackText(m),
    html: ackHtml(m),
  });

  return res.status(200).json({ ok: true });
}

/* ---------- the emails ---------- */

const asHtml = t => esc(t).replace(/\n/g, '<br>');

function deskHtml(m) {
  return emailShell({
    preheader: m.message.slice(0, 110),
    sections: [
      heading('Contact form.') +
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#0a0a0a;">
        ${esc(m.name)}<br>
        <a href="mailto:${esc(m.email)}" style="color:#0a0a0a;">${esc(m.email)}</a>
        ${m.reference ? `<br><span style="color:#6e6e73;">Ref: ${esc(m.reference)}</span>` : ''}
      </p>` +
      `<div style="border-top:1px solid #ebebed;padding-top:18px;">
        <p style="margin:0;font-size:15px;line-height:1.62;color:#45453f;">${asHtml(m.message)}</p>
      </div>`,
    ],
  });
}

function deskText(m) {
  return [
    `Contact form: ${m.name}`,
    `  ${m.email}`,
    ...(m.reference ? [`  Ref: ${m.reference}`] : []),
    '',
    m.message,
  ].join('\n');
}

/* Their copy quotes the message back. It is the only record they have that
   the form did anything, and it is what they will scroll to when they wonder
   whether they mentioned the order number. */
function ackHtml(m) {
  return emailShell({
    preheader: 'A person reads every message. We reply within one business day.',
    footerNote: 'You are receiving this because a message was sent from this email address at glowresearch.shop.',
    sections: [
      heading('We have your message.') +
      paragraph(`Thanks, ${esc(m.name)}. This is an automatic confirmation that it reached us.`) +
      paragraph('<strong style="color:#0a0a0a;">A person replies within one business day</strong>, straight to this address. You can reply to this email to add anything you left out.', { last: true }),

      eyebrow('What you sent') +
      (m.reference ? `<p style="margin:0 0 12px;font-size:13px;color:#6e6e73;">Ref: ${esc(m.reference)}</p>` : '') +
      `<p style="margin:0;font-size:14px;line-height:1.62;color:#45453f;">${asHtml(m.message)}</p>`,

      eyebrow('Faster answers') +
      fine('<strong style="color:#0a0a0a;">Order or shipping.</strong> Have your order number handy. It is on your confirmation email.') +
      fine('<strong style="color:#0a0a0a;">Certificates of analysis.</strong> Include the lot number from the vial.') +
      fine('<strong style="color:#0a0a0a;">Wholesale and bulk.</strong> The <a href="https://glowresearch.shop/wholesale.html" style="color:#0a0a0a;">wholesale page</a> has the application form and answers most of it.'),
    ],
  });
}

function ackText(m) {
  return [
    'We have your message.',
    '',
    `Thanks, ${m.name}. This is an automatic confirmation that it reached us.`,
    '',
    'A person replies within one business day, straight to this address. You can',
    'reply to this email to add anything you left out.',
    '',
    'WHAT YOU SENT',
    ...(m.reference ? [`  Ref: ${m.reference}`, ''] : []),
    m.message.replace(/^/gm, '  '),
    '',
    'FASTER ANSWERS',
    '  - Order or shipping. Have your order number handy. It is on your',
    '    confirmation email.',
    '  - Certificates of analysis. Include the lot number from the vial.',
    '  - Wholesale and bulk. The wholesale page has the application form and',
    '    answers most of it.',
    '',
    'Glow Research',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
  ].join('\n');
}
