// Meta's Conversions API: the server-side mirror of the browser events
// js/analytics.js sends through the pixel. A browser pixel alone misses
// events whenever the tab closes before a redirect finishes, an ad blocker
// eats the request, or Safari's tracking prevention throttles it; this
// fires from a server, independent of all of that.
//
// Two callers, for two different reasons:
//
//   api/_place-order.js  Purchase, from the order path that both
//                        api/create-order.js (the browser's own call) and
//                        api/stripe-webhook.js (the backstop for when the
//                        browser never comes back) run through. The server
//                        knows the sale happened because Stripe told it, so
//                        this fires whether or not a browser was ever there.
//
//   api/meta-event.js    the rest of the funnel (PageView, ViewContent,
//                        AddToCart, InitiateCheckout), relayed from the
//                        browser through our own domain. The server cannot
//                        know about a product view on its own, so the browser
//                        has to say so; routing that through a first-party
//                        endpoint is what gets it past the blocklists that
//                        stop connect.facebook.net.
//
// Every event carries an event_id matching the browser pixel's eventID for
// the same action, which is how Meta collapses the two copies into one
// instead of counting the action twice.
//
// Uses Node's built-in crypto, same reasoning as the rest of api/_lib.js:
// no package.json, no dependency for what the standard library already does.

import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// Never throws, and never awaited by its caller for anything but logging: a
// Meta API hiccup must not affect whether an order gets created, a
// confirmation email goes out, or a page finishes loading. The thing being
// reported already happened either way.
export async function sendMetaEvent({
  pixelId, accessToken, eventName, eventId, eventSourceUrl,
  email, phone, fbc, fbp, clientIp, userAgent, customData,
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
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // matches the browser pixel's eventID — see js/analytics.js
          event_source_url: eventSourceUrl,
          action_source: 'website',
          user_data: userData,
          ...(customData ? { custom_data: customData } : {}),
        }],
      }),
    });
    if (!resp.ok) {
      console.error(`Meta Conversions API rejected the ${eventName} event:`, await resp.text());
    }
  } catch (err) {
    console.error(`Meta Conversions API ${eventName} request failed:`, err.message);
  }
}

// The one caller that existed before the funnel events did. Kept as a named
// wrapper rather than folded into its call site so the money event reads as
// its own thing: value and currency are required for Purchase in a way they
// are not for a page view, and this is where that is stated once.
export function sendMetaPurchaseEvent({ value, currency, ...rest }) {
  return sendMetaEvent({
    ...rest,
    eventName: 'Purchase',
    customData: { value, currency: currency || 'USD' },
  });
}
