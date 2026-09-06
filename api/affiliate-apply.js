// Vercel serverless function. Receives the affiliate application from
// affiliates.html and emails it to the affiliate desk via Resend's HTTP API —
// no database, no CRM, same as api/wholesale-apply.js. GoAffPro is what
// actually tracks links and pays commission; this endpoint's only job is
// getting the application in front of a person so they can decide who gets
// set up as an affiliate there. Approving someone is a manual step on
// GoAffPro's dashboard, not something this file does.

import { readBody, isEmail } from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, esc } from './_email.js';

const AFFILIATE_TO = 'affiliates@glowresearch.shop';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const platform = (body.platform || '').trim();
  const audience = (body.audience || '').trim();
  const plan = (body.plan || '').trim();

  if (!name || !isEmail(email) || !platform || !audience || !plan) {
    return res.status(400).json({ error: 'Missing required application details.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fails loudly rather than telling the applicant it worked when nobody
    // will ever see what they submitted.
    console.error('affiliate-apply: RESEND_API_KEY is not set.');
    return res.status(500).json({ error: 'Applications are not being accepted right now. Please email affiliates@glowresearch.shop directly.' });
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
      to: AFFILIATE_TO,
      reply_to: email,
      subject: `Affiliate application: ${name}`,
      html: `
        <p><strong>Name:</strong> ${esc(name)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        <p><strong>Platform / handle or site:</strong> ${esc(platform)}</p>
        <p><strong>Audience size:</strong> ${esc(audience)}</p>
        <p><strong>How they plan to promote us:</strong><br>${esc(plan).replace(/\n/g, '<br>')}</p>
      `,
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('affiliate-apply: Resend rejected the email.', resp.status, errBody);
      return res.status(502).json({ error: 'Could not send your application. Please email affiliates@glowresearch.shop directly.' });
    }

    // Applicant acknowledgement. Deliberately after the desk copy and
    // deliberately not fatal: the application is already in, and failing the
    // request here would only prompt a resubmit that duplicates it.
    try {
      const ack = await send({
        to: email,
        reply_to: AFFILIATE_TO,
        subject: 'We have your affiliate application',
        text: applicantText({ name, email, platform, audience, plan }),
        html: applicantHtml({ name, email, platform, audience, plan }),
      });
      if (!ack.ok) {
        const errBody = await ack.json().catch(() => null);
        console.error('affiliate-apply: applicant acknowledgement rejected.', ack.status, errBody);
      }
    } catch (e) {
      console.error('affiliate-apply: applicant acknowledgement failed.', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('affiliate-apply:', e);
    return res.status(502).json({ error: 'Could not send your application. Please email affiliates@glowresearch.shop directly.' });
  }
}

/* ---------- applicant acknowledgement ----------
   Same three jobs as wholesale-apply.js's: prove it arrived, say when they
   hear back, and echo their own answers back so they can catch a typo before
   anyone reviews it. No commission rate or terms stated here — nothing is
   promised until a person has actually looked at the application, and
   whatever GoAffPro is configured to pay is the truth, not this email. */

function applicantHtml(a) {
  const row = (label, value) => `
    <tr>
      <td style="padding:7px 16px 7px 0;font-size:13px;color:#6e6e73;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:7px 0;font-size:14px;color:#0a0a0a;vertical-align:top;">${value}</td>
    </tr>`;

  return emailShell({
    preheader: 'We review every application by hand and reply within a few business days.',
    footerNote: 'You are receiving this because an affiliate application was submitted with this email address at glowresearch.shop.',
    sections: [
      heading('Application received.') +
      paragraph(`Thanks, ${esc(a.name)}. This is an automatic confirmation that your affiliate application came through.`) +
      paragraph('A real person reviews every application by hand and replies within a few business days with next steps. No portal to check in the meantime, and you can reply to this message if anything changes.') +
      `<div style="border-top:1px solid #ebebed;padding-top:20px;">
        ${eyebrow('What you sent us')}
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row('Name', esc(a.name))}
          ${row('Email', esc(a.email))}
          ${row('Platform / handle or site', esc(a.platform))}
          ${row('Audience size', esc(a.audience))}
          ${row('Promotion plan', esc(a.plan).replace(/\n/g, '<br>'))}
        </table>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#86868b;">
          Something wrong above? Reply to this email with the correction. No need to apply again.
        </p>
      </div>`,
    ],
  });
}

function applicantText(a) {
  return [
    'Application received.',
    '',
    `Thanks, ${a.name}. This is an automatic confirmation that your affiliate`,
    'application came through.',
    '',
    'A real person reviews every application by hand and replies within a few',
    'business days with next steps. No portal to check in the meantime, and',
    'you can just reply to this message if anything changes.',
    '',
    'WHAT YOU SENT US',
    `  Name:            ${a.name}`,
    `  Email:           ${a.email}`,
    `  Platform / site: ${a.platform}`,
    `  Audience size:   ${a.audience}`,
    `  Promotion plan:  ${a.plan.replace(/\n/g, '\n                   ')}`,
    '',
    'Something wrong above? Reply to this email with the correction. No need to',
    'apply again.',
    '',
    'Glow Research',
    '',
    'You are receiving this because an affiliate application was submitted with',
    'this email address at glowresearch.shop.',
  ].join('\n');
}
