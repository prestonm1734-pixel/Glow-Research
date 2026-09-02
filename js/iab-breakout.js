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
    // package=com.android.chrome, which an earlier version of this file
    // deliberately left out and was wrong to.
    //
    // The reasoning for omitting it was that naming Chrome ignores whichever
    // browser the visitor actually prefers, and Samsung Internet is not a
    // rounding error on Samsung hardware. That is still true. What it missed
    // is what an unnamed package does in practice: with no target, the intent
    // is ambiguous, every installed browser has registered for https, and
    // Android has to ask. The visitor gets "this web page is trying to open an
    // app outside of Facebook" and a decision to make, at the exact moment the
    // point of the exercise was to be somewhere else already. Chrome's own
    // documentation is explicit that naming the package "ensures exactly the
    // same behavior as if the user had selected Chrome from the chooser list",
    // which is to say: no chooser.
    //
    // A prompt most people decline is worth less than a browser some people
    // did not choose, so this now names Chrome and opens instantly. Chrome
    // ships with Play Services, so it is present on effectively every Android
    // device this store will see, including the Samsung ones.
    //
    // S.browser_fallback_url is what makes it safe anyway: on a device with no
    // Chrome, Android loads that URL instead of erroring, which leaves the
    // visitor in the webview exactly as if none of this had run.
    var target = href.replace(/^https?:\/\//, '');
    location.replace(
      'intent://' + target +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'package=com.android.chrome;' +
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
    if (w) {
      // The one way this fails badly rather than harmlessly. Every other
      // outcome leaves the visitor exactly where they were, which is the
      // webview they were already in; this one can leave them looking at a
      // blank tab, because window.open can hand back a real window even when
      // the scheme inside it never resolves.
      //
      // So the window is closed again unless leaving actually happened. If it
      // did, this page is backgrounded and the timer does not run at all, or
      // runs against a stub that is already gone and close() is a no-op.
      // Judged on visibilityState rather than on anything about the window
      // itself, since a blank cross-scheme window tells us nothing when read
      // from here.
      setTimeout(function () {
        try {
          if (document.visibilityState === 'visible' && !w.closed) w.close();
        } catch (e2) { /* cross-origin or already gone */ }
      }, 900);
      return;
    }
  } catch (e) { /* fall through */ }
  location.href = safari;
})();
