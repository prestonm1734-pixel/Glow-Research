// Vercel serverless function. Takes the email address the launch-offer popup
// collected and answers with the discount code, then sends the same code on to
// that address.
//
// The code is deliberately not in the page. js/launch-offer.js ships the offer
// copy but not the value, so the only way GLOW20 reaches a browser is through
// this endpoint, after an address has been given. That is the whole point of
// the popup: the code is the thing being traded for.
//
// It is also why this endpoint asks Stripe rather than trusting
// LAUNCH_OFFER.code. PRINCIPLES.md rules out claiming what the system cannot
// show is true, and "your code is GLOW20, that's 20% off" is exactly such a
// claim: the catalog cannot know whether that promotion is still live, still
// within its redemption cap, or still worth 20%. Stripe can. So the reveal is
// built from Stripe's answer, and a dead code produces an honest failure
// instead of a code that gets rejected at checkout an hour later.

import { readBody, isEmail, resolvePromoCode } from './_lib.js';
import { emailShell, heading, paragraph, eyebrow, fine, esc, sendEmail } from './_email.js';
import { PAYMENTS_LIVE, LAUNCH_OFFER_LIVE, LAUNCH_OFFER } from '../js/products-data.js';

const SUPPORT = 'support@glowresearch.shop';

// resolvePromoCode() prices a discount against a cart, and checks the coupon's
// minimum_amount against it. There is no cart here, so it is handed a subtotal
// high enough to clear any sane minimum: this call is asking "is this code
// alive and what is it worth", not "what does it take off this order". The
// real pricing still happens in create-payment-intent.js against the real cart,
// where a minimum that is not met is caught properly.
const PROBE_SUBTOTAL_CENTS = 100000000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Both flags, because both have to hold for the offer to mean anything: a
  // code is worthless while checkout cannot take an order, and the promotion
  // being over has to close this route as well as hide the popup.
  if (!LAUNCH_OFFER_LIVE || !PAYMENTS_LIVE) {
    return res.status(503).json({ error: 'This offer has ended.' });
  }

  const body = readBody(req);
  const email = (body.email || '').trim().toLowerCase();

  // Same honeypot as contact.js: a field no human sees. 200 rather than an
  // error, so a bot gets nothing to tune against.
  if ((body.website || '').trim()) return res.status(200).json({ ok: true });

  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const resolved = await resolvePromoCode(LAUNCH_OFFER.code, PROBE_SUBTOTAL_CENTS);
  if (!resolved.ok) {
    // The visitor did their half. Do not show them Stripe's reason for
    // refusing a code they never typed.
    console.error('unlock-offer: launch code did not resolve', LAUNCH_OFFER.code, resolved.error);
    return res.status(503).json({ error: 'This offer has ended.' });
  }

  // What Stripe says it is worth, never what the catalog assumed. If the two
  // have drifted the site is quoting a discount it does not give, which is a
  // defect worth a log line even though the reveal below is still correct.
  const percentOff = resolved.percentOff;
  if (percentOff && percentOff !== LAUNCH_OFFER.percentOff) {
    console.error(
      `unlock-offer: LAUNCH_OFFER.percentOff is ${LAUNCH_OFFER.percentOff} but Stripe ` +
      `reports ${percentOff} for ${resolved.code}. The popup copy is overstating or ` +
      'understating the discount; update js/products-data.js.'
    );
  }

  const code = resolved.code;

  // Record the lead before the mail goes out. Neither step is allowed to fail
  // the request, but of the two this is the one that must not be lost: an
  // address that was captured and never stored is the whole point of the popup
  // thrown away, while an email that did not arrive still leaves a lead with
  // the code on screen.
  await recordLead({ email, code, body });

  // Not fatal. The address was given in exchange for the code, and the code is
  // in the response either way, so a mail failure must not read to the visitor
  // as though the trade did not happen.
  await sendEmail({
    to: email,
    replyTo: SUPPORT,
    subject: LAUNCH_OFFER.emailSubject,
    text: codeText(code),
    html: codeHtml(code),
  });

  return res.status(200).json({
    ok: true,
    code,
    percentOff: percentOff || null,
    amountOffCents: resolved.amountOffCents || null,
  });
}

/* Stores the address, and with it the page and the campaign that produced it,
   in the dashboard's leads table. That join is the reason the popup exists:
   "which ad created this email, and did that person later buy" is only
   answerable if the lead row carries the session and the UTMs alongside the
   address, since `visits` holds the funnel for that session and `orders` holds
   the session that produced a purchase.

   Never throws. The visitor has already given their address and is owed the
   code; a storage outage is ours to see in the logs, not theirs to be refused
   over. It is logged loudly because a silent failure here is an invisible hole
   in the lead list. */
async function recordLead({ email, code, body }) {
  const endpoint = process.env.LEADS_ENDPOINT;
  const secret = process.env.LEADS_INGEST_SECRET;
  if (!endpoint || !secret) {
    console.error(
      'unlock-offer: LEADS_ENDPOINT or LEADS_INGEST_SECRET is not set — ' +
      `lead for ${email} was NOT stored. Set both in Vercel.`
    );
    return;
  }

  const utm = body.utm || {};
  const ids = body.analytics || {};

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        email,
        sourcePage: body.sourcePage || null,
        formLocation: body.formLocation || null,
        formId: body.formId || null,
        triggerType: body.triggerType || null,
        utmSource: utm.source || null,
        utmMedium: utm.medium || null,
        utmCampaign: utm.campaign || null,
        utmContent: utm.content || null,
        // The two IDs that join this address back to its funnel rows.
        sessionId: ids.sessionId || null,
        anonId: ids.anonId || null,
        discountCode: code,
      }),
    });
    if (!resp.ok) {
      console.error('unlock-offer: leads endpoint rejected the lead', email, resp.status, await resp.text().catch(() => ''));
    }
  } catch (e) {
    console.error('unlock-offer: could not reach the leads endpoint', email, e.message);
  }
}

// Both bodies say the same two sentences the popup does, from the same strings,
// so the email cannot drift from what the visitor was just shown on screen.
function codeText(code) {
  return [
    LAUNCH_OFFER.emailBody(code),
    LAUNCH_OFFER.facts,
    '',
    'Enter it at checkout on glowresearch.shop.',
  ].join('\n');
}

function codeHtml(code) {
  return emailShell({
    preheader: LAUNCH_OFFER.emailBody(code),
    sections: [
      eyebrow(esc(LAUNCH_OFFER.eyebrow)) +
      heading(esc(LAUNCH_OFFER.emailBody(code))) +
      paragraph('Enter it at checkout on glowresearch.shop.', { last: true }),

      fine(esc(LAUNCH_OFFER.facts)),
    ],
    footerNote: 'You are receiving this because you asked for the launch code on glowresearch.shop.',
  });
}
