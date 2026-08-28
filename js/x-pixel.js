// X's (Twitter's) own base pixel code, loaded on every page like
// js/meta-pixel.js and js/tiktok-pixel.js are. X_PIXEL_ID (js/products-data.js)
// is the single switch: empty and this does nothing at all, no script loads,
// no page event fires, until a real ID from X Ads Manager replaces it.
//
// js/analytics.js is what actually fires the funnel events through
// window.twq once it exists, gated further by X_EVENT_IDS — X needs a
// separate per-event tracking ID for each named event, not just the base
// Pixel ID this file configures, so a funnel event with no ID assigned yet
// simply never fires rather than calling twq with nothing to point it at.
// Kept separate from analytics.js for the same reason the other two pixel
// files are: it is third-party by definition, sending data to X, and one
// file per destination means the privacy policy can point at exactly the
// one responsible for each.
(function () {
  // privacy.html's disclosure of this file's own capability, same pattern as
  // js/meta-pixel.js and js/tiktok-pixel.js. Runs before the early return, on
  // every page, because this is the one file that always knows the true
  // state of X_PIXEL_ID.
  if (typeof X_PIXEL_ID !== 'undefined' && X_PIXEL_ID) {
    var note3 = document.getElementById('xPixelNote3');
    if (note3) note3.textContent = 'We also run an X (Twitter) advertising pixel, which ' +
      'sends X a record of pages viewed and, once configured, products viewed, items ' +
      'added to cart, and completed purchases, so X can measure and target advertising. ' +
      'See section 4 for what that involves and section 5 for the cookie it sets.';

    var note4 = document.getElementById('xPixelNote4');
    if (note4) note4.textContent = 'receives page views and, once configured, products ' +
      'viewed, items added to cart, and completed purchases, so X can measure and ' +
      "target advertising. This leaves this site and is governed by X's own privacy " +
      'policy.';

    var note5 = document.getElementById('xPixelNote5');
    if (note5) note5.textContent = "X's advertising pixel sets cookies of its own once " +
      "enabled, used to identify your browser to X. These are governed by X's own " +
      'privacy policy, not ours.';
  }

  if (typeof X_PIXEL_ID === 'undefined' || !X_PIXEL_ID) return;

  // X's own snippet, unminified. No dependency is added by this — it is X's
  // script loaded from X's own CDN, the same way connect.facebook.net and
  // analytics.tiktok.com are loaded directly in the other two pixel files.
  /* eslint-disable */
  !function (e, t, n, s, u, a) {
    e.twq || (s = e.twq = function () {
      s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
    }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0, u.src = 'https://static.ads-twitter.com/uwt.js',
      a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a));
  }(window, document, 'script');
  twq('config', X_PIXEL_ID);
  /* eslint-enable */
})();
