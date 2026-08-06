// Vercel serverless function. Starts a password reset: looks up the
// customer, stores a hashed single-use token on their WooCommerce record,
// and emails a reset link via Resend's HTTP API.
//
// Always responds with the same generic message whether or not the email
// has an account — the alternative (a different message for "no account
// found") lets anyone check which addresses have signed up here.

import { wc, wcConfig, findCustomerByEmail, readBody, isEmail } from './_lib.js';
import { emailShell, heading, paragraph, fine, button, esc } from './_email.js';
import crypto from 'node:crypto';

const TOKEN_META = 'glow_reset_token';
const EXPIRES_META = 'glow_reset_expires';
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const GENERIC_OK = { ok: true, message: 'If that email has an account, a reset link is on its way.' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SESSION_SECRET || !wcConfig()) {
    return res.status(500).json({ error: 'Accounts are not configured yet.' });
  }

  const { email } = readBody(req);
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fails loudly to whoever is watching logs rather than silently doing
    // nothing while telling the visitor an email is on its way.
    console.error('forgot-password: RESEND_API_KEY is not set.');
    return res.status(500).json({ error: 'Password resets are not available right now. Email support@glowresearch.shop and we will reset it by hand.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const customer = await findCustomerByEmail(cleanEmail);
    if (customer) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await wc(`/customers/${customer.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          meta_data: [
            { key: TOKEN_META, value: tokenHash },
            { key: EXPIRES_META, value: String(Date.now() + RESET_TTL_MS) },
          ],
        }),
      });

      const origin = req.headers.origin ||
        `${(req.headers['x-forwarded-proto'] || 'https')}://${req.headers.host}`;
      const link = `${origin}/reset-password.html?email=${encodeURIComponent(cleanEmail)}&token=${token}`;
      const from = process.env.RESEND_FROM_EMAIL || 'Glow Research <onboarding@resend.dev>';

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from,
          to: cleanEmail,
          subject: 'Reset your Glow Research password',
          text: resetText(link),
          html: resetHtml(link),
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => null);
        console.error('forgot-password: Resend rejected the email.', resp.status, errBody);
      }
    }
  } catch (e) {
    // Logged for us, never surfaced — a lookup or store hiccup must not
    // leak whether the address has an account.
    console.error('forgot-password:', e);
  }

  return res.status(200).json(GENERIC_OK);
}

/* ---------- the email ----------
   A reset email is read in a hurry and half of them are read on a phone, so
   there is one action and nothing competing with it. The raw URL is repeated
   below the button because clients mangle buttons often enough, and the
   "didn't ask for this" line says the password has not changed yet — that is
   the thing someone reading an unexpected reset email actually wants to know. */

function resetHtml(link) {
  return emailShell({
    preheader: 'Set a new password. This link expires in one hour.',
    footerNote: 'You are receiving this because a password reset was requested for this email address at glowresearch.shop.',
    sections: [
      heading('Reset your password.') +
      paragraph('Someone asked to reset the password on the Glow Research account for this email address. Use the button below to set a new one.') +
      button(link, 'Set a new password') +
      paragraph('<span style="color:#6e6e73;">Or paste this link into your browser:</span><br>' +
        `<a href="${esc(link)}" style="color:#0a0a0a;word-break:break-all;font-size:13px;">${esc(link)}</a>`, { last: true }),

      fine('<strong style="color:#0a0a0a;">This link expires in one hour</strong> and can only be used once.') +
      fine('If you did not ask for this, you can ignore this email — your password has not changed, and the link stops working on its own.'),
    ],
  });
}

function resetText(link) {
  return [
    'Reset your password.',
    '',
    'Someone asked to reset the password on the Glow Research account for this',
    'email address. Open the link below to set a new one:',
    '',
    link,
    '',
    'This link expires in one hour and can only be used once.',
    '',
    'If you did not ask for this, you can ignore this email — your password has',
    'not changed, and the link stops working on its own.',
    '',
    'Glow Research',
    '10755 Scripps Poway Pkwy #376, San Diego, CA 92131, United States',
  ].join('\n');
}
