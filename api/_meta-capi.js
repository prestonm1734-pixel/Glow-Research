// Meta's Conversions API: the server-side mirror of js/meta-pixel.js's
// browser events, for the one event that matters most to get right —
// Purchase. A browser pixel alone misses sales whenever the tab closes
// before the redirect finishes, an ad blocker eats the request, or Safari's
// tracking prevention throttles it; this fires straight from the server
// that already knows the sale happened, independent of any of that.
//
// Called from api/_place-order.js, which both api/create-order.js (the
// browser's own call) and api/stripe-webhook.js (the backstop for when the
// browser never comes back) run through — so this fires on both paths, not
// just the one where a browser happened to be present at the end.
//
// Uses Node's built-in crypto, same reasoning as the rest of api/_lib.js:
// no package.json, no dependency for what the standard library already
// does.

import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// Never throws, and never awaited by its caller for anything but logging:
// a Meta API hiccup must not affect whether an order gets created or a
// confirmation email goes out. The purchase already happened either way.
export async function sendMetaPurchaseEvent({
  pixelId, accessToken, eventId, eventSourceUrl, email, phone, fbc, fbp, clientIp, userAgent, value, currency,
}) {
  if (!pixelId || !accessToken) return; // not configured yet — see META_PIXEL_ID / META_CAPI_ACCESS_TOKEN

  const userData = {
    ...(email ? { em: [sha256(email)] } : {}),
    ...(phone ? { ph: [sha256(phone.replace(/[^\d]/g, ''))] } : {}),
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
    ...(clientIp ? { client_ip_address: clientIp } : {}),
    ...(userAgent ? { client_user_agent: userAgent } : {}),
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        data: [{
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // matches the browser pixel's eventID — see js/analytics.js's forwardToMeta()
          event_source_url: eventSourceUrl,
          action_source: 'website',
          user_data: userData,
          custom_data: { value, currency: currency || 'USD' },
        }],
      }),
    });
    if (!resp.ok) {
      console.error('Meta Conversions API rejected the Purchase event:', await resp.text());
    }
  } catch (err) {
    console.error('Meta Conversions API request failed:', err.message);
  }
}
