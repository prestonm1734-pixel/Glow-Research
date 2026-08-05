// Vercel serverless function. Starts a password reset: looks up the
// customer, stores a hashed single-use token on their WooCommerce record,
// and emails a reset link via Resend's HTTP API.
//
// Always responds with the same generic message whether or not the email
// has an account — the alternative (a different message for "no account
// found") lets anyone check which addresses have signed up here.

import { wc, wcConfig, findCustomerByEmail, readBody, isEmail } from './_lib.js';
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
          html: `
            <p>Someone asked to reset the password on this Glow Research account.</p>
            <p><a href="${link}">Set a new password</a></p>
            <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
          `,
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
