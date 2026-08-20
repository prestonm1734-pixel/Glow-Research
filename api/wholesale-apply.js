// Vercel serverless function. Receives the wholesale application from
// wholesale.html and emails it to the wholesale desk via Resend's HTTP API —
// no database, no CRM. The form exists to get the details in front of a
// person by email, same as the page copy promises ("No portal, no sales
// call"), so this endpoint's only job is making sure that email actually
// goes out.

import { readBody, isEmail } from './_lib.js';
import { WHOLESALE_MIN } from '../js/products-data.js';
import { emailShell, heading, paragraph, eyebrow, fine, esc } from './_email.js';

const WHOLESALE_TO = 'wholesale@glowresearch.shop';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const name = (body.name || '').trim();
  const company = (body.company || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const volume = (body.volume || '').trim();
  const compounds = (body.compounds || '').trim();

  if (!name || !company || !isEmail(email) || !volume || !compounds) {
    return res.status(400).json({ error: 'Missing required application details.' });
  }

  // The page states a qualifying minimum and the form's `min` attribute is a
  // suggestion to a browser that can skip it, the same reasoning that put the
  // PAYMENTS_LIVE gate on the server rather than in checkout.js. Read from
  // WHOLESALE_TIERS so the number the handler enforces is the number the page
  // prints. Rejected with the figure in the message, since an application
  // bounced without saying why is worse than one that never sent.
  if (!(Number(volume) >= WHOLESALE_MIN)) {
    return res.status(400).json({
      error: `Wholesale starts at ${WHOLESALE_MIN} vials a month. For smaller volumes, bulk pricing on the product pages applies automatically.`,
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fails loudly rather than telling the applicant it worked when nobody
    // will ever see what they submitted.
    console.error('wholesale-apply: RESEND_API_KEY is not set.');
    return res.status(500).json({ error: 'Applications are not being accepted right now. Please email wholesale@glowresearch.shop directly.' });
  }

  // onboarding@resend.dev works unverified, out of the box. Swap
  // RESEND_FROM_EMAIL once glowresearch.shop is verified in Resend so this
  // sends from the real domain instead.
  const from = process.env.RESEND_FROM_EMAIL || 'Glow Research <onboarding@resend.dev>';

  function send(payload) {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, ...payload }),
    });
  }

  try {
    // The desk copy is the one that matters — if this does not land, the
    // application effectively did not happen, so its failure is the request's
    // failure.
    const resp = await send({
      to: WHOLESALE_TO,
      reply_to: email,
      subject: `Wholesale application: ${company}`,
      html: `
        <p><strong>Contact:</strong> ${esc(name)}</p>
        <p><strong>Company:</strong> ${esc(company)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        <p><strong>Expected monthly volume:</strong> ${esc(volume)} vials</p>
        <p><strong>Compounds of interest:</strong><br>${esc(compounds).replace(/\n/g, '<br>')}</p>
      `,
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('wholesale-apply: Resend rejected the email.', resp.status, errBody);
      return res.status(502).json({ error: 'Could not send your application. Please email wholesale@glowresearch.shop directly.' });
    }

    // Applicant acknowledgement. Deliberately after the desk copy and
    // deliberately not fatal: the application is already in, and failing the
    // request here would only prompt a resubmit that duplicates it.
    try {
      const ack = await send({
        to: email,
        reply_to: WHOLESALE_TO,
        subject: 'We have your wholesale application',
        text: applicantText({ name, company, email, volume, compounds }),
        html: applicantHtml({ name, company, email, volume, compounds }),
      });
      if (!ack.ok) {
        const errBody = await ack.json().catch(() => null);
        console.error('wholesale-apply: applicant acknowledgement rejected.', ack.status, errBody);
      }
    } catch (e) {
      console.error('wholesale-apply: applicant acknowledgement failed.', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('wholesale-apply:', e);
    return res.status(502).json({ error: 'Could not send your application. Please email wholesale@glowresearch.shop directly.' });
  }
}

/* ---------- applicant acknowledgement ----------
   Three jobs: prove it arrived, say exactly when they hear back, and put the
   terms that could otherwise kill a deal late (prepayment, no private label,
   US only) in front of them now. Echoing their own numbers back also lets
   them catch a typo in the volume or compound list before we quote it. */

const FINE_PRINT = [
  'Wholesale orders are invoiced and paid in full before we place them. There are no net terms yet.',
  'Ships in standard Glow Research vials. We do not offer private-label or custom branding.',
  'For qualified researchers and institutions inside the United States.',
  'All products are sold strictly for in-vitro laboratory research use.',
];

function applicantHtml(a) {
  const row = (label, value) => `
    <tr>
      <td style="padding:7px 16px 7px 0;font-size:13px;color:#6e6e73;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:7px 0;font-size:14px;color:#0a0a0a;vertical-align:top;">${value}</td>
    </tr>`;

  return emailShell({
    preheader: 'The wholesale desk replies within one business day.',
    footerNote: 'You are receiving this because a wholesale application was submitted with this email address at glowresearch.shop.',
    sections: [
      heading('Application received.') +
      paragraph(`Thanks, ${esc(a.name)}. This is an automatic confirmation that your wholesale application for ${esc(a.company)} came through.`) +
      paragraph('<strong style="color:#0a0a0a;">A real person replies within one business day</strong> with a priced tier sheet for your volume. No portal and no sales call. Everything from here happens over email, and you can reply to this message.') +
      `<div style="border-top:1px solid #ebebed;padding-top:20px;">
        ${eyebrow('What you sent us')}
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row('Contact', esc(a.name))}
          ${row('Company', esc(a.company))}
          ${row('Email', esc(a.email))}
          ${row('Monthly volume', esc(a.volume) + ' vials')}
          ${row('Compounds', esc(a.compounds).replace(/\n/g, '<br>'))}
        </table>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#86868b;">
          Something wrong above? Reply to this email with the correction. No need to apply again.
        </p>
      </div>`,

      eyebrow('Worth knowing up front') + FINE_PRINT.map(fine).join(''),
    ],
  });
}

function applicantText(a) {
  return [
    'Application received.',
    '',
    `Thanks, ${a.name}. This is an automatic confirmation that your wholesale`,
    `application for ${a.company} came through.`,
    '',
    'A real person replies within one business day with a priced tier sheet for',
    'your volume. No portal and no sales call. Everything from here happens over',
    'email, and you can just reply to this message.',
    '',
    'WHAT YOU SENT US',
    `  Contact:        ${a.name}`,
    `  Company:        ${a.company}`,
    `  Email:          ${a.email}`,
    `  Monthly volume: ${a.volume} vials`,
    `  Compounds:      ${a.compounds.replace(/\n/g, '\n                  ')}`,
    '',
    'Something wrong above? Reply to this email with the correction. No need to',
    'apply again.',
    '',
    'WORTH KNOWING UP FRONT',
    ...FINE_PRINT.map(line => `  - ${line}`),
    '',
    'Glow Research',
    '',
    'You are receiving this because a wholesale application was submitted with',
    'this email address at glowresearch.shop.',
  ].join('\n');
}
