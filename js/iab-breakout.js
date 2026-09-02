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

  // ---------------------------------------------------------------------
  // iOS. Not a redirect, a link the visitor taps. That difference is the
  // whole fix.
  //
  // Firing the escape from script produced Facebook's own gate: "this web
  // page is trying to open an app outside of Facebook". The reason is in
  // WKWebView's navigation delegate, which hands the host app a
  // navigationType with every navigation. A genuine tap on an anchor arrives
  // as .linkActivated. Anything script did, window.open and a location
  // assignment alike, arrives as .other. Facebook gates .other and lets
  // .linkActivated through, which is a reasonable thing for them to do: one
  // of those is the visitor asking to leave and the other is a page deciding
  // for them.
  //
  // So the page stops deciding. A real anchor carrying the scheme, tapped by
  // a real finger, is the case Facebook already trusts, and it is why other
  // sites appear to open instantly: they are not redirecting, they are being
  // clicked.
  //
  // Android keeps its automatic redirect above, because intent:// is a
  // supported OS handoff rather than an app launch to be vetted.
  if (location.protocol !== 'https:') return;

  // Dismissal is its own key. TRIED above is set on arrival and would hide the
  // bar on the second page view, when the visitor has neither used it nor
  // refused it.
  var HIDDEN = 'glow-iab-hidden';
  try { if (sessionStorage.getItem(HIDDEN)) return; } catch (e) {}

  var safari = location.href.replace(/^https:\/\//, 'x-safari-https://');

  function mount() {
    var bar = document.createElement('div');
    bar.className = 'iab-bar';

    // An <a> with a real href, not a button with a handler. A handler would
    // call window.open and land back on .other, which is the gate this exists
    // to avoid.
    var link = document.createElement('a');
    link.className = 'iab-bar-open';
    link.href = safari;
    link.innerHTML = 'Open in Safari <span aria-hidden="true">&rarr;</span>';

    var why = document.createElement('span');
    why.className = 'iab-bar-why';
    // Short enough to hold one line at 390px. The longer version of this wrapped
    // and padded the bar taller than the thing it was explaining.
    why.textContent = 'Your tab stays open';

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'iab-bar-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () {
      try { sessionStorage.setItem(HIDDEN, '1'); } catch (e) {}
      bar.parentNode && bar.parentNode.removeChild(bar);
      document.documentElement.classList.remove('has-iab-bar');
    });

    bar.appendChild(link);
    bar.appendChild(why);
    bar.appendChild(close);
    document.body.appendChild(bar);
    document.documentElement.classList.add('has-iab-bar');

    // And the same link, clicked for them on their first touch anywhere on the
    // page. This is the part that feels automatic.
    //
    // The distinction the gate draws is not "did script do it" on its own, it
    // is what WKWebView reports as navigationType. A synthetic click on an
    // anchor is an anchor activation, and fired from inside a real gesture it
    // carries that gesture with it, which is a different case from the same
    // call on page load with no user interaction behind it. An earlier version
    // of this file rejected the synthetic click outright; that was right for
    // firing it on load and wrong as a general rule, which is the distinction
    // it missed.
    //
    // Anything counts as the gesture: a scroll, a tap, a swipe. The visitor
    // touches the page and is in Safari, without a dialog and without having
    // aimed at anything. If it does not work, nothing happens and the bar is
    // still sitting there to be tapped, which is why this is worth trying
    // rather than reasoning about.
    var fired = false;
    function escapeOnGesture(e) {
      if (fired) return;
      // Tapping the dismiss control means "no", so it must not be the gesture
      // that triggers the thing being dismissed.
      if (e && e.target && e.target.closest && e.target.closest('.iab-bar-close')) return;
      fired = true;
      try { link.click(); } catch (e2) {}
    }
    ['touchstart', 'pointerdown', 'click'].forEach(function (evt) {
      document.addEventListener(evt, escapeOnGesture, { once: true, capture: true, passive: true });
    });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
