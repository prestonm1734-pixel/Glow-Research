// Sign-up and sign-in. One endpoint with an `action`, because the two share
// almost all of their logic and splitting them would duplicate it.
//
// The account IS the WooCommerce customer record — there is no second user
// table. That means someone who checked out as a guest already has a record,
// and signing up with that same email claims it, inheriting their order
// history and points rather than starting a second empty account.

import {
  wc, wcConfig, findCustomerByEmail, metaValue, hashPassword, verifyPassword,
  makeToken, sessionCookie, readBody, isEmail,
  POINTS_PER_DOLLAR, POINTS_PER_DOLLAR_REDEEMED,
} from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, fine, button, esc, sendEmail } from './_email.js';

const PW_META = 'glow_password';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Checked before anything else touches WooCommerce. Signing the session is
  // the last step of signing up, so leaving this to the catch below meant a
  // misconfigured deploy created a real customer record and *then* failed —
  // the account existed but nobody could ever be told they had it.
  if (!process.env.SESSION_SECRET || !wcConfig()) {
    return res.status(500).json({ error: 'Accounts are not configured yet.' });
  }

  const { action, email, password, name } = readBody(req);

  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your password.' });
  }
  // The length rule belongs to setting a password, not to checking one. On
  // login a too-short password is simply a wrong password, and saying
  // otherwise both confuses the honest case and hands out the rule.
  if (action === 'signup' && password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    if (action === 'signup') return await signUp(res, cleanEmail, password, name);
    if (action === 'login') return await signIn(res, cleanEmail, password);
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not reach the store.' });
  }
}

async function signUp(res, email, password, name) {
  const parts = String(name || '').trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ');
  const hash = hashPassword(password);

  const existing = await findCustomerByEmail(email);

  if (existing) {
    // Already has a password: this is someone signing up twice. Do not
    // overwrite it — that would be an account takeover by anyone who knows
    // the address.
    if (metaValue(existing, PW_META)) {
      return res.status(409).json({ error: 'An account already exists for this email. Sign in instead.' });
    }
    // Guest checkout record: claim it, keeping their orders and points.
    const updated = await wc(`/customers/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        first_name: first || existing.first_name,
        last_name: last || existing.last_name,
        meta_data: [{ key: PW_META, value: hash }],
      }),
    });
    await welcome(updated);
    return finish(res, updated);
  }

  const created = await wc('/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: first,
      last_name: last,
      username: email,
      meta_data: [{ key: PW_META, value: hash }],
    }),
  });
  await welcome(created);
  return finish(res, created);
}

/* Sent on sign-up only, never on sign-in. Awaited because the function can be
   frozen once the response goes out, but it cannot fail the sign-up: the
   account exists by now, and an error here would send them round again into
   the "an account already exists" wall. */
async function welcome(customer) {
  const name = (customer.first_name || '').trim();
  const link = 'https://glowresearch.shop/account.html';

  await sendEmail({
    to: customer.email,
    replyTo: 'support@glowresearch.shop',
    subject: 'Your Glow Research account is ready',
    html: emailShell({
      preheader: 'Order history, live tracking, and points on every order.',
      footerNote: 'You are receiving this because an account was created with this email address at glowresearch.shop.',
      sections: [
        heading('Your account is ready.') +
        paragraph(`${name ? esc(name) + ', your' : 'Your'} account is set up and signed in on this address.`) +
        button(link, 'Go to your account'),

        eyebrow("What's in it") +
        fine('<strong style="color:#0a0a0a;">Every order in one place.</strong> That includes anything you bought as a guest with this email.') +
        fine(`<strong style="color:#0a0a0a;">Live tracking.</strong> The carrier's number appears against an order the moment it is issued.`) +
        fine(`<strong style="color:#0a0a0a;">Points.</strong> ${POINTS_PER_DOLLAR} for every $1 spent, redeemed at ${POINTS_PER_DOLLAR_REDEEMED} points per $1 off a future order.`),
      ],
    }),
    text: [
      'Your account is ready.',
      '',
      `${name ? name + ', your' : 'Your'} account is set up and signed in on this address.`,
      '',
      link,
      '',
      "WHAT'S IN IT",
      '  - Every order in one place, including anything you bought as a guest',
      '    with this email.',
      "  - Live tracking: the carrier's number appears against an order the",
      '    moment it is issued.',
      `  - Points: ${POINTS_PER_DOLLAR} for every $1 spent, redeemed at ${POINTS_PER_DOLLAR_REDEEMED} points per $1 off a future order.`,
      '',
      'Glow Research',
    ].join('\n'),
  });
}

async function signIn(res, email, password) {
  const customer = await findCustomerByEmail(email);
  const stored = customer ? metaValue(customer, PW_META) : null;

  // Same message either way: telling them which half was wrong tells an
  // attacker which addresses have accounts.
  if (!customer || !stored || !verifyPassword(password, stored)) {
    return res.status(401).json({ error: 'That email and password do not match.' });
  }
  return finish(res, customer);
}

function finish(res, customer) {
  res.setHeader('Set-Cookie', sessionCookie(makeToken(customer.id, customer.email)));
  return res.status(200).json({
    email: customer.email,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
  });
}
