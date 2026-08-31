// Meta's standard base pixel code, loaded on every page like js/analytics.js
// is. META_PIXEL_ID (js/products-data.js) is the single switch: empty and
// this does nothing at all, no script loads, no PageView fires, until a real
// ID from Meta Events Manager replaces it.
//
// js/analytics.js is what actually fires the funnel events (ViewContent,
// AddToCart, InitiateCheckout, Purchase): through window.fbq once it exists,
// and a second time through api/meta-event.js so the event still arrives when
// this file's script is blocked. This file only sets fbq up and sends the
// automatic PageView, minting the id that pairs the two copies of it. Separate
// from analytics.js on purpose: that file is the first-party beacon
// privacy.html describes as staying on our own dashboard, and this one is
// third-party by definition, sending data to Meta. Two files means the
// privacy policy can point at exactly the one responsible for each.
(function () {
  // privacy.html's disclosure of this file's own capability. Runs before the
  // early return below, and on every page (harmlessly, since the three IDs
  // only exist on privacy.html) rather than only on privacy.html, because
  // this is the one file that always knows the true state of META_PIXEL_ID —
  // baking that logic into privacy.html's own page-specific script would
  // mean two places could disagree about it. Only touches the DOM when the
  // flag is actually on; the default text already baked into privacy.html
  // covers the off state correctly on its own.
  //
  // Both the pixel and the Conversions API now send Advanced Matching
  // parameters this codebase assembles itself (js/identity.js), on every
  // event rather than only on a purchase: a random per-device identifier
  // always, and hashed contact and address details once a customer has
  // entered them. Automatic Advanced Matching in Events Manager, which scans
  // visible page fields, is on top of that and is not a setting this codebase
  // controls. The notes below have to describe all of it, since the policy
  // states what actually happens and not just the part built here.
  if (typeof META_PIXEL_ID !== 'undefined' && META_PIXEL_ID) {
    var note3 = document.getElementById('metaPixelNote3');
    if (note3) note3.textContent = "We run Meta's advertising pixel and Conversions " +
      'API. Together they send Meta a record of pages viewed, products viewed, items ' +
      'added to cart, and completed purchases, each one tagged with a random ' +
      'identifier for your device, and with your hashed email, phone, name and ' +
      'delivery city, state and postcode once you have entered them or when the ' +
      'pixel finds a contact field on the page you are on, so Meta can measure and ' +
      'target advertising. See section 4 for what that involves and section 5 for ' +
      'the cookies it sets.';

    var note4 = document.getElementById('metaPixelNote4');
    if (note4) note4.textContent = 'receives page views, products viewed, items ' +
      'added to cart, and completed purchases, each tagged with a random identifier ' +
      'for your device, and with your hashed email, phone, name and delivery city, ' +
      'state and postcode once you have entered them or when the pixel finds a ' +
      'contact field visible on the page you are on (a checkout or sign-in field, ' +
      'for example), so Meta can measure and target advertising. None of it reaches ' +
      'Meta in readable form: the pixel hashes these details in your browser, and the ' +
      'copy that goes by way of our own server is hashed there before it is passed ' +
      "on. This leaves this site and is governed by Meta's own privacy policy.";

    var note5 = document.getElementById('metaPixelNote5');
    if (note5) note5.textContent = "Meta's advertising pixel uses two cookies " +
      '(_fbc and _fbp), used to match your visit to an ad click and identify your ' +
      'browser to Meta. We set these ourselves when the pixel has not, so that the ' +
      'same identifiers reach Meta from our server when your browser blocks the ' +
      "pixel. Their contents are governed by Meta's own privacy policy, not ours.";
  }

  if (typeof META_PIXEL_ID === 'undefined' || !META_PIXEL_ID) return;

  // Meta's own snippet, unminified. No dependency is added by this — it is
  // Meta's script loaded from Meta's own CDN, the same way js.stripe.com is
  // loaded directly rather than bundled.
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // Advanced Matching, passed explicitly rather than left to the Automatic
  // Advanced Matching setting in Events Manager. That setting works by
  // scanning the page for anything that looks like an email or a phone, so it
  // finds nothing at all on a product page or a home page, and on a checkout
  // page it only finds a field once it has been filled. js/identity.js knows
  // what this site actually knows about the visitor: a stable per-device
  // external_id on every single page view, plus a real email, phone, name and
  // address once a customer has given them, still there on the next visit.
  //
  // Meta's script hashes every one of these with SHA-256 before it leaves the
  // browser. Plaintext goes in, only hashes go out.
  fbq('init', META_PIXEL_ID, window.GlowIdentity ? GlowIdentity.advancedMatching() : {});

  // An identity learned mid-visit is the common case, not the exception: the
  // visitor types an email at checkout on a page whose pixel initialised
  // while they were still anonymous. Re-initialising with the richer set
  // means the events after that point carry it. Meta treats a repeat init on
  // the same pixel ID as an update to the matching parameters, not a second
  // pixel, so this does not double anything.
  document.addEventListener('glow-identity-change', function () {
    if (window.GlowIdentity) fbq('init', META_PIXEL_ID, GlowIdentity.advancedMatching());
  });

  // PageView carries an explicit event id so the server-side copy sent by
  // js/analytics.js through api/meta-event.js can be paired with this one and
  // counted once. Every other funnel event mints its id inside analytics.js,
  // at the point it dispatches both copies; PageView is the exception because
  // it is fired here, and only this file knows when.
  //
  // Published on window rather than passed, because analytics.js is a
  // separate file loaded after this one and js/ takes no imports. The name is
  // deliberately specific: it is a handoff between two known files, not an
  // API.
  var pageViewId = 'pv-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  window.GlowMetaPageViewId = pageViewId;
  fbq('track', 'PageView', {}, { eventID: pageViewId });
})();
