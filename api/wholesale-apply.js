// Vercel serverless function. Receives the wholesale application from
// wholesale.html and emails it to the wholesale desk via Resend's HTTP API —
// no database, no CRM. The form exists to get the details in front of a
// person by email, same as the page copy promises ("No portal, no sales
// call"), so this endpoint's only job is making sure that email actually
// goes out.

import { readBody, isEmail } from './_lib.js';

const WHOLESALE_TO = 'wholesale@glowresearch.shop';

function esc(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: WHOLESALE_TO,
        reply_to: email,
        subject: `Wholesale application — ${company}`,
        html: `
          <p><strong>Contact:</strong> ${esc(name)}</p>
          <p><strong>Company:</strong> ${esc(company)}</p>
          <p><strong>Email:</strong> ${esc(email)}</p>
          <p><strong>Expected monthly volume:</strong> ${esc(volume)}</p>
          <p><strong>Compounds of interest:</strong><br>${esc(compounds).replace(/\n/g, '<br>')}</p>
        `,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('wholesale-apply: Resend rejected the email.', resp.status, errBody);
      return res.status(502).json({ error: 'Could not send your application. Please email wholesale@glowresearch.shop directly.' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('wholesale-apply:', e);
    return res.status(502).json({ error: 'Could not send your application. Please email wholesale@glowresearch.shop directly.' });
  }
}
