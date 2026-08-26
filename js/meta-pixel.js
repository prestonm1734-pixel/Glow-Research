// Meta's standard base pixel code, loaded on every page like js/analytics.js
// is. META_PIXEL_ID (js/products-data.js) is the single switch: empty and
// this does nothing at all, no script loads, no PageView fires, until a real
// ID from Meta Events Manager replaces it.
//
// js/analytics.js is what actually fires the funnel events (ViewContent,
// AddToCart, InitiateCheckout, Purchase) through window.fbq once it exists —
// this file only sets fbq up and sends the automatic PageView. Kept separate
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
  // Automatic Advanced Matching is on for this pixel (Meta Events Manager,
  // not a setting this codebase controls) — it scans visible page fields for
  // an email or phone and sends those to Meta too, on top of the hashed
  // email/phone this codebase deliberately sends via Conversions API on a
  // purchase. The two live-state notes below cover both: the deliberate
  // send AND the pixel's own automatic one, since the policy has to describe
  // what actually happens, not just the part this codebase chose to build.
  if (typeof META_PIXEL_ID !== 'undefined' && META_PIXEL_ID) {
    var note3 = document.getElementById('metaPixelNote3');
    if (note3) note3.textContent = "We run Meta's advertising pixel and Conversions " +
      'API. Together they send Meta a record of pages viewed, products viewed, items ' +
      'added to cart, and completed purchases, together with your hashed email or ' +
      'phone when we have it or when the pixel finds one on the page you are on, so ' +
      'Meta can measure and target advertising. See section 4 for what that involves ' +
      'and section 5 for the cookies it sets.';

    var note4 = document.getElementById('metaPixelNote4');
    if (note4) note4.textContent = 'receives page views, products viewed, items ' +
      'added to cart, and completed purchases, together with your hashed email or ' +
      'phone when we have it or when the pixel finds one visible on the page you are ' +
      "on (a checkout or sign-in field, for example), so Meta can measure and target " +
      "advertising. This leaves this site and is governed by Meta's own privacy policy.";

    var note5 = document.getElementById('metaPixelNote5');
    if (note5) note5.textContent = "Meta's advertising pixel sets two cookies of " +
      'its own (_fbc and _fbp) once enabled, used to match your visit to an ad ' +
      "click and identify your browser to Meta. These are governed by Meta's own " +
      'privacy policy, not ours.';
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

  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
})();
