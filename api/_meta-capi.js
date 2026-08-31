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

// Meta specifies a normalization for each match key and hashes the normalized
// form on its own side to compare against. Send "New York" where Meta expects
// "newyork" and the hashes cannot match, so the parameter is worse than
// useless: it counts as data sent and never matches anything.
//
//   name, city   letters only. Punctuation and spaces stripped, so
//                "St. Louis" and "saint louis" at least agree with
//                themselves across events.
//   state        two-letter code, lowercased. A spelled-out state name is
//                dropped rather than guessed at.
//   zip          first five digits, so a ZIP+4 matches a plain ZIP.
//   country      ISO two-letter, lowercased.
const clean = v => (typeof v === 'string' ? v.trim() : '');
const hashName = v => (clean(v) ? sha256(clean(v).toLowerCase().replace(/[^a-z]/g, '')) : '');
const hashZip = v => {
  const digits = clean(v).replace(/[^\d]/g, '').slice(0, 5);
  return digits.length === 5 ? sha256(digits) : '';
};
const hashState = v => {
  const s = clean(v).toLowerCase().replace(/[^a-z]/g, '');
  return s.length === 2 ? sha256(s) : '';
};
const hashCountry = v => {
  const c = clean(v).toLowerCase().replace(/[^a-z]/g, '');
  return c.length === 2 ? sha256(c) : '';
};

// external_id is the one match key that is already an opaque identifier, so
// it is the one Meta accepts either hashed or in the clear. Hashed anyway,
// because there is no case where the raw value needs to be readable on Meta's
// side.
//
// This still agrees with the browser pixel, which sends the same ID as a
// plain Advanced Matching parameter, without depending on what Meta's script
// does to it in the browser: Meta compares these values as hashes either way,
// so a value that arrives raw and the same value that arrives hashed both end
// up as the same hash on its side. What matters is that both ends send the
// same ID, which is why js/identity.js is the only thing that mints one.
const hashId = v => (clean(v) ? sha256(clean(v)) : '');

// Never throws, and never awaited by its caller for anything but logging: a
// Meta API hiccup must not affect whether an order gets created, a
// confirmation email goes out, or a page finishes loading. The thing being
// reported already happened either way.
export async function sendMetaEvent({
  pixelId, accessToken, eventName, eventId, eventSourceUrl,
  email, phone, externalId, firstName, lastName, city, state, zip, country,
  fbc, fbp, clientIp, userAgent, customData,
}) {
  if (!pixelId || !accessToken) return; // not configured yet — see META_PIXEL_ID / META_CAPI_ACCESS_TOKEN

  // Every key Meta will accept, sent whenever we hold it and omitted entirely
  // when we do not. An absent key costs match quality; an empty or unmatchable
  // one costs match quality and looks like data, which is worse — so each
  // helper above returns '' for anything it cannot normalize, and '' is
  // dropped here rather than sent.
  //
  // Arrays because that is the shape Meta's API takes for the hashed
  // person-level keys, singular strings for the rest.
  // Digits only, and Meta expects the country code included: a bare
  // ten-digit number hashes to something its side will never match, so the
  // parameter is spent for nothing. Ten digits means a US number here, not a
  // guess. This store ships to the US only, the checkout form offers no other
  // country, and express checkout rejects a non-US shipping address outright.
  // Anything already carrying a country code is left exactly as it is.
  const phoneDigits = phone ? phone.replace(/[^\d]/g, '') : '';
  const hashedPhone = phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits;
  const fnHash = hashName(firstName);
  const lnHash = hashName(lastName);
  const ctHash = hashName(city);
  const stHash = hashState(state);
  const zpHash = hashZip(zip);
  const countryHash = hashCountry(country);
  const externalIdHash = hashId(externalId);

  const userData = {
    ...(email ? { em: [sha256(email)] } : {}),
    ...(hashedPhone ? { ph: [sha256(hashedPhone)] } : {}),
    ...(externalIdHash ? { external_id: [externalIdHash] } : {}),
    ...(fnHash ? { fn: [fnHash] } : {}),
    ...(lnHash ? { ln: [lnHash] } : {}),
    ...(ctHash ? { ct: [ctHash] } : {}),
    ...(stHash ? { st: [stHash] } : {}),
    ...(zpHash ? { zp: [zpHash] } : {}),
    ...(countryHash ? { country: [countryHash] } : {}),
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
        // Meta's Test Events tool only displays a server-side event if the
        // request carries the code that tool hands out, which is why a real,
        // working integration can look empty there without this. Set only as
        // a Vercel environment variable, only for as long as someone is
        // actively watching that tab — a code left in place has no effect on
        // production traffic beyond tagging it, but there is no reason to
        // leave it set once verification is done.
        ...(process.env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE } : {}),
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
// contentIds/contents/numItems are what make this event usable for anything
// beyond a revenue total. Without them Meta knows a sale happened and what it
// was worth but not what was in it, which rules out per-product return on ad
// spend, excluding a buyer from ads for the thing they just bought, and any
// catalog campaign closing its loop. Every other funnel event already carries
// them; this one was the exception.
//
// The IDs must be the same SKUs the browser sends as content_ids on
// ViewContent and AddToCart, and the same IDs the product catalog is keyed
// on, or the three describe unrelated sets of products.
//
// orderId is separate from eventId on purpose. eventId is the Stripe
// PaymentIntent, which is what the browser copy and this one deduplicate
// against; order_id is the WooCommerce order number, which is what a human
// reconciling Meta's reporting against the store's own orders would search
// for. Meta also uses it to reject a genuine duplicate sale.
export function sendMetaPurchaseEvent({ value, currency, contentIds, contents, numItems, orderId, ...rest }) {
  const ids = Array.isArray(contentIds) ? contentIds.filter(Boolean) : [];
  const lines = Array.isArray(contents) ? contents.filter(c => c && c.id) : [];
  return sendMetaEvent({
    ...rest,
    eventName: 'Purchase',
    customData: {
      value,
      currency: currency || 'USD',
      // content_type only means anything alongside content_ids, so the two
      // travel together or neither is sent.
      ...(ids.length ? { content_ids: ids, content_type: 'product' } : {}),
      ...(lines.length ? { contents: lines } : {}),
      ...(numItems > 0 ? { num_items: numItems } : {}),
      ...(orderId ? { order_id: String(orderId) } : {}),
    },
  });
}
