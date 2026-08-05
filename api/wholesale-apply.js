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
      subject: `Wholesale application — ${company}`,
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
        subject: 'We have your wholesale application — Glow Research',
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
   them catch a typo in the volume or compound list before we quote it.

   Inline styles and a system font stack because email clients strip <style>
   blocks and will not load webfonts; light surface because Gmail's dark mode
   inverts backgrounds and a near-black design comes out muddy. */

const FINE_PRINT = [
  'Wholesale orders are invoiced and paid in full before we place them — there are no net terms yet.',
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

  return `
<div style="margin:0;padding:0;background:#f5f5f7;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

    <div style="font-size:21px;font-weight:700;letter-spacing:-.02em;color:#0a0a0a;padding-bottom:26px;">Glow&#10022;</div>

    <div style="background:#ffffff;padding:34px 32px;">
      <h1 style="margin:0 0 14px;font-size:23px;line-height:1.15;letter-spacing:-.03em;font-weight:600;color:#0a0a0a;">Application received.</h1>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.62;color:#45453f;">
        Thanks, ${esc(a.name)} — this is an automatic confirmation that your wholesale
        application for ${esc(a.company)} came through.
      </p>

      <p style="margin:0 0 26px;font-size:15px;line-height:1.62;color:#45453f;">
        <strong style="color:#0a0a0a;">A real person replies within one business day</strong>
        with a priced tier sheet for your volume. No portal and no sales call — everything
        from here happens over email, and you can just reply to this message.
      </p>

      <div style="border-top:1px solid #e4e4e7;padding-top:20px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#86868b;padding-bottom:10px;">What you sent us</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row('Contact', esc(a.name))}
          ${row('Company', esc(a.company))}
          ${row('Email', esc(a.email))}
          ${row('Monthly volume', esc(a.volume) + ' vials')}
          ${row('Compounds', esc(a.compounds).replace(/\n/g, '<br>'))}
        </table>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#86868b;">
          Something wrong above? Reply to this email with the correction — no need to apply again.
        </p>
      </div>
    </div>

    <div style="background:#ffffff;border-top:1px solid #e4e4e7;padding:24px 32px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#86868b;padding-bottom:12px;">Worth knowing up front</div>
      ${FINE_PRINT.map(line => `
        <p style="margin:0 0 9px;font-size:13px;line-height:1.55;color:#55554f;">${line}</p>`).join('')}
    </div>

    <div style="padding:22px 4px 0;font-size:12px;line-height:1.6;color:#86868b;">
      <strong style="color:#55554f;">Glow Nutrition LLC</strong><br>
      10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States<br>
      <span style="color:#a1a1a6;">You are receiving this because a wholesale application was submitted with this email address at glowresearch.shop.</span>
    </div>

  </div>
</div>`;
}

function applicantText(a) {
  return [
    'Application received.',
    '',
    `Thanks, ${a.name} — this is an automatic confirmation that your wholesale`,
    `application for ${a.company} came through.`,
    '',
    'A real person replies within one business day with a priced tier sheet for',
    'your volume. No portal and no sales call — everything from here happens over',
    'email, and you can just reply to this message.',
    '',
    'WHAT YOU SENT US',
    `  Contact:        ${a.name}`,
    `  Company:        ${a.company}`,
    `  Email:          ${a.email}`,
    `  Monthly volume: ${a.volume} vials`,
    `  Compounds:      ${a.compounds.replace(/\n/g, '\n                  ')}`,
    '',
    'Something wrong above? Reply to this email with the correction — no need to',
    'apply again.',
    '',
    'WORTH KNOWING UP FRONT',
    ...FINE_PRINT.map(line => `  - ${line}`),
    '',
    'Glow Nutrition LLC',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
    '',
    'You are receiving this because a wholesale application was submitted with',
    'this email address at glowresearch.shop.',
  ].join('\n');
}
