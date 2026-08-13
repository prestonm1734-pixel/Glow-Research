// Vercel serverless function. Completes a password reset: checks the token
// emailed by /api/forgot-password against the hash stored on the customer
// record, then sets the new password and signs them in.

import {
  wc, wcConfig, findCustomerByEmail, metaValue, hashPassword,
  makeToken, sessionCookie, readBody, isEmail,
} from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, fine, button, esc } from './_email.js';
import crypto from 'node:crypto';

const SUPPORT = 'support@glowresearch.shop';

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

    // Tell them their password changed. Deliberately after the write and
    // deliberately not fatal: the password is already changed by this point,
    // so a mail failure must not report the reset as failed and send them
    // round again with a token that no longer exists.
    // Awaited rather than left running: once the response is sent the function
    // can be frozen mid-flight, and a security notice that only sometimes
    // arrives is worse than useless. It never throws.
    await notifyChanged(updated.email);

    res.setHeader('Set-Cookie', sessionCookie(makeToken(updated.id, updated.email)));
    return res.status(200).json({
      email: updated.email,
      name: [updated.first_name, updated.last_name].filter(Boolean).join(' '),
    });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the store.' });
  }
}

/* ---------- "your password was changed" ----------
   The one email that catches a takeover. Whoever completed the reset holds
   the inbox the link went to, so this cannot stop them — what it does is put
   a timestamped record in front of the real owner while the trail is still
   warm, which is the difference between noticing today and noticing at the
   next order.

   Swallows every failure: by the time this runs the password is already
   changed, and the caller must not be told otherwise. */
async function notifyChanged(email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('reset-password: RESEND_API_KEY is not set, no change notice sent.');
    return;
  }

  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date()) + ' PT';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Glow Research <onboarding@resend.dev>',
        to: email,
        reply_to: SUPPORT,
        subject: 'Your Glow Research password was changed',
        text: changedText(email, when),
        html: changedHtml(email, when),
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('reset-password: change notice rejected.', resp.status, errBody);
    }
  } catch (e) {
    console.error('reset-password: change notice failed.', e);
  }
}

function changedHtml(email, when) {
  return emailShell({
    preheader: `Changed ${when}. If this was not you, contact us right away.`,
    footerNote: 'You are receiving this because the password on this Glow Research account was changed.',
    sections: [
      heading('Your password was changed.') +
      paragraph(`The password on the Glow Research account for <strong style="color:#0a0a0a;">${esc(email)}</strong> was reset and is now active.`) +
      paragraph(`<span style="color:#6e6e73;">Changed ${esc(when)}</span>`, { last: true }),

      eyebrow('If this was not you') +
      fine('Someone else may have access to this email address or to the account. Contact us right away and we will lock it down.') +
      button(`mailto:${SUPPORT}?subject=${encodeURIComponent('I did not change my password')}`, 'Contact support') +
      fine(`Or email <a href="mailto:${SUPPORT}" style="color:#0a0a0a;">${SUPPORT}</a> directly.`),
    ],
  });
}

function changedText(email, when) {
  return [
    'Your password was changed.',
    '',
    `The password on the Glow Research account for ${email} was reset and is`,
    'now active.',
    '',
    `Changed ${when}`,
    '',
    'IF THIS WAS NOT YOU',
    'Someone else may have access to this email address or to the account.',
    `Contact us right away at ${SUPPORT} and we will lock it down.`,
    '',
    'Glow Research',
  ].join('\n');
}
