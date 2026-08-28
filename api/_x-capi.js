// X's (Twitter's) Conversion API: the server-side mirror of js/x-pixel.js's
// browser Purchase event, for the same reason api/_meta-capi.js and
// api/_tiktok-capi.js exist — a browser pixel alone misses sales whenever
// the tab closes before the redirect finishes, an ad blocker eats the
// request, or tracking prevention throttles it; this fires straight from
// the server that already knows the sale happened, independent of any of
// that.
//
// Called from api/_place-order.js, which both api/create-order.js (the
// browser's own call) and api/stripe-webhook.js (the backstop for when the
// browser never comes back) run through — so this fires on both paths.
//
// xEventId is X_EVENT_IDS.purchase (js/products-data.js) — the per-event
// tracking ID X Ads Manager assigns to the named "Purchase" web event, not
// a dedup key. conversionId is what dedup actually keys on, the same Stripe
// PaymentIntent ID passed to Meta's and TikTok's event_id equivalents,
// matched against js/analytics.js's forwardToX() sending the same value as
// its own conversion_id.
//
// Uses Node's built-in crypto, same reasoning as the rest of api/_lib.js:
// no package.json, no dependency for what the standard library already
// does.

import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// Never throws, and never awaited by its caller for anything but logging:
// an X API hiccup must not affect whether an order gets created or a
// confirmation email goes out. The purchase already happened either way.
export async function sendXPurchaseEvent({
  pixelId, accessToken, xEventId, conversionId, eventSourceUrl, email, phone, twclid, clientIp, userAgent, value, currency,
}) {
  // Not configured yet: no pixel, no token, or the "Purchase" web event has
  // not been created in X Ads Manager to get an event ID from — see
  // X_PIXEL_ID / X_EVENT_IDS.purchase / X_CAPI_ACCESS_TOKEN.
  if (!pixelId || !accessToken || !xEventId) return;

  // At least one of twclid, hashed_email, hashed_phone_number, or the
  // ip_address/user_agent pair is required by X's API — sending none of
  // them would be a request X rejects outright, so there is nothing worth
  // sending rather than a guaranteed-failing call.
  const identifier = {
    ...(twclid ? { twclid } : {}),
    ...(email ? { hashed_email: sha256(email) } : {}),
    ...(phone ? { hashed_phone_number: sha256(phone.replace(/[^\d]/g, '')) } : {}),
    ...(clientIp ? { ip_address: clientIp } : {}),
    ...(userAgent ? { user_agent: userAgent } : {}),
  };
  if (!Object.keys(identifier).length) return;

  try {
    const resp = await fetch(`https://ads-api.x.com/12/measurement/conversions/${pixelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pixel-Token': accessToken },
      body: JSON.stringify({
        conversions: [{
          conversion_time: new Date().toISOString(),
          event_id: xEventId,
          conversion_id: conversionId, // matches the browser pixel's own conversion_id — see js/analytics.js's forwardToX()
          event_source_url: eventSourceUrl,
          identifiers: [identifier],
          value: value != null ? String(value) : undefined,
          currency: currency || 'USD',
        }],
      }),
    });
    if (!resp.ok) {
      console.error('X Conversion API rejected the Purchase event:', await resp.text());
    }
  } catch (err) {
    console.error('X Conversion API request failed:', err.message);
  }
}
