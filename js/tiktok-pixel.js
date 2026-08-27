// TikTok's own base pixel code, loaded on every page like js/meta-pixel.js
// is. TIKTOK_PIXEL_ID (js/products-data.js) is the single switch: empty and
// this does nothing at all, no script loads, no page event fires, until a
// real ID from TikTok Events Manager replaces it.
//
// js/analytics.js is what actually fires the funnel events (ViewContent,
// AddToCart, InitiateCheckout, CompletePayment) through window.ttq once it
// exists — this file only sets ttq up and sends the automatic page event.
// Kept separate from analytics.js for the same reason js/meta-pixel.js is:
// that file is the first-party beacon privacy.html describes as staying on
// our own dashboard, and this one is third-party by definition, sending
// data to TikTok. One file per destination means the privacy policy can
// point at exactly the one responsible for each.
(function () {
  // privacy.html's disclosure of this file's own capability, same pattern as
  // js/meta-pixel.js's note-correction below. Runs before the early return,
  // on every page, because this is the one file that always knows the true
  // state of TIKTOK_PIXEL_ID.
  if (typeof TIKTOK_PIXEL_ID !== 'undefined' && TIKTOK_PIXEL_ID) {
    var note3 = document.getElementById('tiktokPixelNote3');
    if (note3) note3.textContent = 'We also run a TikTok advertising pixel, which sends ' +
      'TikTok a record of pages viewed, products viewed, items added to cart, and ' +
      'completed purchases, together with your hashed email or phone when we have it, ' +
      'so TikTok can measure and target advertising. See section 4 for what that ' +
      'involves and section 5 for the cookie it sets.';

    var note4 = document.getElementById('tiktokPixelNote4');
    if (note4) note4.textContent = 'receives page views, products viewed, items added ' +
      'to cart, and completed purchases, together with your hashed email or phone when ' +
      'we have it, so TikTok can measure and target advertising. This leaves this site ' +
      "and is governed by TikTok's own privacy policy.";

    var note5 = document.getElementById('tiktokPixelNote5');
    if (note5) note5.textContent = "TikTok's advertising pixel sets one cookie of its " +
      'own (_ttp) once enabled, used to identify your browser to TikTok. This is ' +
      "governed by TikTok's own privacy policy, not ours.";
  }

  if (typeof TIKTOK_PIXEL_ID === 'undefined' || !TIKTOK_PIXEL_ID) return;

  // TikTok's own snippet, unminified. No dependency is added by this — it is
  // TikTok's script loaded from TikTok's own CDN, the same way
  // connect.facebook.net is loaded directly in js/meta-pixel.js.
  /* eslint-disable */
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once',
      'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
    ttq.setAndDefer = function (t, e) {
      t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) {
      var e = ttq._i[t] || [];
      for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function (e, n) {
      var r = 'https://analytics.tiktok.com/i18n/pixel/events.js', o = n && n.partner;
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
      ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
      ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      n = document.createElement('script'); n.type = 'text/javascript'; n.async = !0; n.src = r + '?sdkid=' + e + '&lib=' + t;
      e = document.getElementsByTagName('script')[0]; e.parentNode.insertBefore(n, e);
    };
    ttq.load(TIKTOK_PIXEL_ID);
    ttq.page();
  }(window, document, 'ttq');
  /* eslint-enable */
})();
