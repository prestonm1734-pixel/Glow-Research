// TikTok's Events API: the server-side mirror of js/tiktok-pixel.js's
// browser events, for the one event that matters most to get right —
// CompletePayment. A browser pixel alone misses sales whenever the tab
// closes before the redirect finishes, an ad blocker eats the request, or
// browser tracking prevention throttles it; this fires straight from the
// server that already knows the sale happened, independent of any of that.
//
// Called from api/_place-order.js, which both api/create-order.js (the
// browser's own call) and api/stripe-webhook.js (the backstop for when the
// browser never comes back) run through — so this fires on both paths, not
// just the one where a browser happened to be present at the end. Same
// reasoning, same call site, as api/_meta-capi.js's sendMetaPurchaseEvent().
//
// Uses Node's built-in crypto, same reasoning as the rest of api/_lib.js:
// no package.json, no dependency for what the standard library already
// does.

import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// Never throws, and never awaited by its caller for anything but logging:
// a TikTok API hiccup must not affect whether an order gets created or a
// confirmation email goes out. The purchase already happened either way.
export async function sendTikTokPurchaseEvent({
  pixelId, accessToken, eventId, eventSourceUrl, email, phone, ttclid, ttp, clientIp, userAgent, value, currency,
}) {
  if (!pixelId || !accessToken) return; // not configured yet — see TIKTOK_PIXEL_ID / TIKTOK_CAPI_ACCESS_TOKEN

  const user = {
    ...(email ? { email: [sha256(email)] } : {}),
    ...(phone ? { phone: [sha256(phone.replace(/[^\d]/g, ''))] } : {}),
    ...(ttclid ? { ttclid } : {}),
    ...(ttp ? { ttp } : {}),
    ...(clientIp ? { ip: clientIp } : {}),
    ...(userAgent ? { user_agent: userAgent } : {}),
  };

  try {
    const resp = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': accessToken },
      body: JSON.stringify({
        event_source: 'web',
        event_source_id: pixelId,
        data: [{
          event: 'CompletePayment',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // matches the browser pixel's event_id — see js/analytics.js's forwardToTikTok()
          user,
          properties: { value, currency: currency || 'USD' },
          page: { url: eventSourceUrl },
        }],
      }),
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || (body && body.code !== 0)) {
      console.error('TikTok Events API rejected the CompletePayment event:', body || resp.status);
    }
  } catch (err) {
    console.error('TikTok Events API request failed:', err.message);
  }
}
