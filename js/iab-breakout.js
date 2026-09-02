// Breaks out of Facebook and Instagram's in-app browser into the device's real
// browser, so the session continues somewhere Apple Pay, Google Pay and autofill
// actually work.
//
// Why it is worth doing at all. Meta's apps open links in a WKWebView (iOS) or
// a Chrome Custom Tab-like WebView (Android) rather than the default browser.
// Two things this store depends on break in there:
//
//   js/express-pay.js gates the wallet buttons on canMakePayment(), which is
//   false in Facebook's iOS webview, so the fastest checkout path silently
//   does not render at all.
//
//   _fbc, _fbp and the external_id js/identity.js mints live in the webview's
//   own cookie and storage jar, separate from Safari's. A returning visitor is
//   a new visitor there, which quietly costs the Conversions API the match
//   quality the rest of that work exists to buy.
//
// Loaded first and NOT deferred, on purpose. Every millisecond before the
// breakout is a millisecond of a page the visitor is about to leave, and
// anything that runs first is work thrown away.
//
// ---------------------------------------------------------------------------
// WHAT ACTUALLY WORKS, because the two platforms are not comparable here.
//
// Android has a supported escape: an intent:// URL. It is reliable across
// Facebook, Instagram, Messenger and Threads, and carries its own fallback.
//
// iOS has no Apple-approved escape. x-safari-https:// is undocumented, Apple
// can withdraw it whenever it likes, and reports are that inside Meta's apps
// it only fires through window.open rather than a location assignment. It is
// attempted here because it was asked for, and it is attempted in the order
// most likely to work, but it should be assumed to fail more often than not.
// Nothing downstream depends on it succeeding.
(function () {
  var ua = navigator.userAgent || '';

  // The identifiers Meta's webviews carry. FBAN is the app name, FBAV the app
  // version, and Instagram's webview says so outright.
  if (!/FBAN|FBAV|Instagram/i.test(ua)) return;

  // Meta's own crawlers carry FBAN-adjacent strings while fetching a page to
  // build a link preview, and an ad review bot renders the landing page before
  // the ad is approved. Redirecting either one means the preview is generated
  // from an intent:// URL instead of the page. Checked before anything else
  // fires, because this is the failure that costs an ad account rather than a
  // session.
  if (/facebookexternalhit|facebookcatalog|Facebot|bot|crawler|spider|preview/i.test(ua)) return;

  // Once per session, whatever happens. Two reasons, and the second is the one
  // that bites: a breakout that half works can land the visitor back here, and
  // without this the page would bounce them again immediately, forever.
  var TRIED = 'glow-iab-tried';
  try {
    if (sessionStorage.getItem(TRIED)) return;
    sessionStorage.setItem(TRIED, '1');
  } catch (e) {
    // Private mode throws rather than returning null. With no way to remember
    // an attempt there is no way to guarantee the loop above cannot happen, so
    // this does nothing at all rather than risk it.
    return;
  }

  // The cart lives in localStorage (glow-cart-v1, js/cart.js), and the real
  // browser has a different localStorage. Breaking out with items in the cart
  // hands the visitor an empty one in Safari, which is worse than the webview
  // they were already checking out in. The breakout is only ever worth it on
  // arrival, before anything has been added.
  try {
    var cart = localStorage.getItem('glow-cart-v1');
    if (cart && cart !== '[]') return;
  } catch (e) { /* no storage: treat as an empty cart and carry on */ }

  // Belt and braces on the same point. Even with an empty cart, a visitor who
  // has reached the checkout or the receipt is mid-transaction, and moving
  // browsers under them there is never the right call.
  if (/\/(checkout|thank-you|signin|account|reset-password)\.html/.test(location.pathname)) return;

  var href = location.href;
  var isAndroid = /Android/i.test(ua);

  if (isAndroid) {
    // Deliberately no package=com.android.chrome, which the spec called for.
    // Naming Chrome sends every Samsung Internet and Firefox user down the
    // fallback branch instead of out to the browser they actually use, and
    // Samsung Internet is not a rounding error on Samsung hardware. Without
    // the package, action VIEW plus category BROWSABLE routes to whatever the
    // device's default browser is, which is what the objective asks for and a
    // superset of what naming Chrome would have got.
    //
    // S.browser_fallback_url is what makes this safe to fire blind: if nothing
    // can handle the intent, Android loads that URL instead of erroring.
    var target = href.replace(/^https?:\/\//, '');
    location.replace(
      'intent://' + target +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'S.browser_fallback_url=' + encodeURIComponent(href) + ';end'
    );
    return;
  }

  // iOS. Only from https, and this is a guard rather than a formality: the
  // scheme swap below is a string replace anchored on "https://", so on any
  // other protocol it silently returns the URL unchanged and the two calls
  // underneath would navigate the page to exactly where it already is. Caught
  // by testing against a local http server, where it did precisely that.
  // Production is https throughout, so this only ever skips a case that cannot
  // reach a real visitor.
  if (location.protocol !== 'https:') return;

  // window.open first, because that is the call reported to work inside Meta's
  // apps; the location assignment the spec specified is the fallback rather
  // than the first attempt, since on its own it tends to no-op.
  //
  // Not attempted: the hidden anchor with target="_blank" and a synthetic
  // click. Inside a WKWebView that opens another tab of the same in-app
  // browser rather than Safari, so it does not reach the objective, and
  // without a real user gesture it is blocked as a popup anyway. It would have
  // added a failure mode that looks like success.
  var safari = href.replace(/^https:\/\//, 'x-safari-https://');
  try {
    var w = window.open(safari, '_blank');
    if (w) return;
  } catch (e) { /* fall through */ }
  location.href = safari;
})();
