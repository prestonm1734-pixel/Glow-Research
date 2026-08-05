// Vercel serverless function. Completes a password reset: checks the token
// emailed by /api/forgot-password against the hash stored on the customer
// record, then sets the new password and signs them in.

import {
  wc, wcConfig, findCustomerByEmail, metaValue, hashPassword,
  makeToken, sessionCookie, readBody, isEmail,
} from './_lib.js';
import crypto from 'node:crypto';

const PW_META = 'glow_password';
const TOKEN_META = 'glow_reset_token';
const EXPIRES_META = 'glow_reset_expires';

const INVALID = { error: 'This reset link is invalid or has expired. Request a new one.' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SESSION_SECRET || !wcConfig()) {
    return res.status(500).json({ error: 'Accounts are not configured yet.' });
  }

  const { email, token, password } = readBody(req);
  if (!isEmail(email) || typeof token !== 'string' || !token) {
    return res.status(400).json(INVALID);
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const customer = await findCustomerByEmail(cleanEmail);
    const storedHash = customer ? metaValue(customer, TOKEN_META) : null;
    const expires = customer ? parseInt(metaValue(customer, EXPIRES_META) || '0', 10) : 0;

    if (!customer || !storedHash) return res.status(400).json(INVALID);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const a = Buffer.from(tokenHash);
    const b = Buffer.from(storedHash);
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches || !expires || expires < Date.now()) {
      return res.status(400).json(INVALID);
    }

    const updated = await wc(`/customers/${customer.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        meta_data: [
          { key: PW_META, value: hashPassword(password) },
          // single-use: clear the token so the same link cannot be replayed
          { key: TOKEN_META, value: '' },
          { key: EXPIRES_META, value: '' },
        ],
      }),
    });

    res.setHeader('Set-Cookie', sessionCookie(makeToken(updated.id, updated.email)));
    return res.status(200).json({
      email: updated.email,
      name: [updated.first_name, updated.last_name].filter(Boolean).join(' '),
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the store.' });
  }
}
