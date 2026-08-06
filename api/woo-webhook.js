// Vercel serverless function. Receives WooCommerce order webhooks and sends
// the customer-facing status emails, so WooCommerce's own can be switched off
// and every email a customer gets looks like it came from the same place.
//
// WooCommerce fires `order.updated` on any change, not just a status change,
// and it will happily deliver the same event twice. So the rule here is: only
// email when the status differs from the last one we emailed about, recorded
// on the order itself. That write triggers one more `order.updated`, which
// then sees the statuses match and does nothing — one extra no-op call per
// change rather than a loop.

import { wc, metaValue, trackingFromAST, trackingFromMeta } from './_lib.js';
import { sendEmail } from './_email.js';
import { statusEmail } from './_order-emails.js';
import crypto from 'node:crypto';

// Signature verification needs the bytes exactly as WooCommerce signed them;
// a parsed-and-restringified body will not match.
export const config = { api: { bodyParser: false } };

const LAST_EMAILED = 'glow_last_emailed_status';

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function signatureValid(raw, header, secret) {
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.WOO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('woo-webhook: WOO_WEBHOOK_SECRET is not set — refusing to process.');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }

  const raw = await rawBody(req);
  const sig = req.headers['x-wc-webhook-signature'];

  // Saving a webhook makes WooCommerce ping the URL, and it refuses to
  // activate unless that ping gets a 200. The ping is deliberately unlike a
  // real delivery: no signature header, and a form-encoded `webhook_id=<n>`
  // body rather than JSON. Acknowledging exactly that shape — and nothing
  // else — costs nothing, because the ping carries no order and this does no
  // work on it. Anything with data still has to be signed.
  if (!sig && /^webhook_id=\d+$/.test(raw.toString('utf8').trim())) {
    return res.status(200).json({ ok: true, ping: true });
  }

  // Unsigned or wrongly signed means it did not come from our store. Anyone
  // who could forge this could email our customers, so there is no lenient
  // path here.
  if (!signatureValid(raw, sig, secret)) {
    console.error('woo-webhook: bad or missing signature.');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let order;
  try {
    order = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Malformed payload.' });
  }

  // WooCommerce pings a newly saved webhook with a tiny payload that has no
  // order in it. Acknowledge so the delivery is marked successful.
  if (!order || !order.id || !order.status) {
    return res.status(200).json({ ok: true, skipped: 'no order in payload' });
  }

  const status = order.status;
  const email = (order.billing && order.billing.email) || '';
  const already = metaValue(order, LAST_EMAILED);

  if (already === status) {
    return res.status(200).json({ ok: true, skipped: 'already emailed this status' });
  }

  const build = statusEmail(status);
  if (!build) {
    // A status we deliberately do not email about (pending, trash, draft).
    // Still recorded, so a later change is measured against the real state.
    await remember(order.id, status);
    return res.status(200).json({ ok: true, skipped: `no email for "${status}"` });
  }

  if (!email) {
    console.error(`woo-webhook: order ${order.id} has no billing email.`);
    return res.status(200).json({ ok: true, skipped: 'no email on order' });
  }

  // Only worth a tracking lookup for the email that shows tracking.
  let track = null;
  if (status === 'completed') {
    track = (await trackingFromAST(order.id)) || trackingFromMeta(order);
  }

  const { subject, html, text } = build({ order, track });
  const sent = await sendEmail({
    to: email,
    replyTo: 'support@glowresearch.shop',
    subject,
    html,
    text,
  });

  // Only remember it once it actually went. If the send failed, leaving the
  // meta alone means the next delivery of the same event is a retry rather
  // than a no-op — WooCommerce retries a non-2xx, so return one.
  if (!sent) {
    return res.status(502).json({ error: 'Could not send the notification email.' });
  }

  await remember(order.id, status);
  return res.status(200).json({ ok: true, sent: status });
}

// Never throws: the email has already gone by the time this runs, and a
// failed bookkeeping write must not turn into a WooCommerce retry that
// emails the customer a second time.
async function remember(orderId, status) {
  try {
    await wc(`/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ meta_data: [{ key: LAST_EMAILED, value: status }] }),
    });
  } catch (e) {
    console.error(`woo-webhook: could not record status for order ${orderId}.`, e);
  }
}
