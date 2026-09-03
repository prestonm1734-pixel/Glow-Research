// ===================== Glow Research — launch offer =====================
// Collects an email address in exchange for the launch discount code.
//
// Two surfaces now. The standing form in the footer of index.html and
// welcome.html is not an interruption, so nothing suppresses it: someone who
// scrolled past it in March can still ask in June, and the only thing it
// remembers is whether the address has already been given, so it shows the
// code back rather than asking twice for something already handed over.
//
// The second is a popup, on every page except POPUP_EXCLUDED_PAGES below.
// There was one here before, a bar on the homepage and a dialog on the
// catalog and product pages, both on a fixed delay from load, and it was
// removed because nearly all of this store's traffic arrives from a
// Facebook ad: an offer thrown over a page someone landed on seconds ago
// reads as spam from a supplier they have not decided to trust yet. This
// one is built not to have that problem:
//
//   - it never fires on arrival. Desktop waits for exit intent, the cursor
//     leaving through the top of the viewport, which is the one gesture that
//     only means "I am about to leave." A touch device has no such gesture,
//     so mobile instead waits for ten seconds of reading or a scroll past the
//     halfway point, whichever comes first — a nudge partway through the
//     page, not a greeting at the door.
//   - it shows at most once a browser session, and if closed without an
//     address given, stays quiet for POPUP_COOLDOWN_MS (fourteen days) after.
//   - it never shows to someone already signed in (SESSION_ACCOUNT) or who
//     has already bought something (HAS_ORDERED, written by js/checkout.js
//     and js/express-pay.js the moment an order is placed) — both signals
//     this site already holds, not new ones invented to gate this.
//   - it reads the identical LAUNCH_OFFER object the footer does. Same
//     eyebrow, same title, same 15%, same code. Two surfaces asking the same
//     honest question is not the problem the old popup had; a fabricated
//     reason to ask right now would have been.
//
// The code itself is NOT in this file, and must not be put here. The page ships
// the offer's words and no value; api/unlock-offer.js hands the code back after
// an address is in, having first confirmed with Stripe that it is still live.
// Anything else would give away the thing being asked for, and would let the
// page promise a discount that checkout then refuses. check-claims.js greps
// every served file for the code to keep it that way.
(function () {
  // products-data.js declares these with `const` in a classic script, which
  // puts them in the global lexical scope rather than on window, so they are
  // reached as bare identifiers behind a typeof guard like everywhere else.
  if (typeof LAUNCH_OFFER_LIVE === 'undefined' || !LAUNCH_OFFER_LIVE) return;
  if (typeof LAUNCH_OFFER === 'undefined' || !LAUNCH_OFFER) return;
  var CFG = LAUNCH_OFFER;

  // Not a whole-file gate any more: only index.html and welcome.html carry
  // this element, and every other page still needs the popup below to run.
  var footerHost = document.getElementById('offerFooter');

  /* ---------------- state ---------------- */

  // The code has already been handed over, permanently, so the footer (and
  // the popup) show it back rather than asking a second time for an address
  // already given.
  var UNLOCKED = 'glow-offer-code';

  // Written by js/checkout.js and js/express-pay.js the instant an order is
  // placed, never read by anything but this file. A real purchase is the one
  // signal this site holds that a visitor is already a customer, so it is
  // what suppresses the popup permanently rather than for a cooldown window.
  var HAS_ORDERED = 'glow-has-ordered';

  // Written by js/account.js and js/checkout.js on sign-in (see
  // js/identity.js, which reads the same key). Someone already signed in has
  // already decided to trust this store with an account; asking them to
  // trade an email for a first-order code is asking the wrong question.
  var SESSION_ACCOUNT = 'glow-session';

  // The popup's own memory, kept apart from UNLOCKED above: closing the
  // popup without an address teaches this file nothing about whether the
  // address has been given, only that this is not the moment to ask again.
  var POPUP_SHOWN = 'glow-offer-popup-shown';         // sessionStorage: once a tab session
  var POPUP_DISMISSED_AT = 'glow-offer-popup-dismissed-at'; // localStorage: ms timestamp
  var POPUP_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days

  // Two different reasons a page ends up here, not one. checkout, thank-you
  // and cart are where an interruption can only cost an order, the same
  // list and reasoning tools/check-claims.js holds this file to for those
  // three. welcome is different: it still loads this script, and still
  // shows the footer form below, because that is not a popup and nothing
  // suppresses it. What it does not get is the popup itself — ad traffic
  // arriving there has read nothing yet, and a popup thrown over the page it
  // just landed on is the exact "reads as spam" problem this file's own
  // header explains. Listed twice, /welcome and /welcome.html, because
  // vercel.json rewrites the ad URL without changing what location.pathname
  // reports for whichever address actually loaded the page.
  var POPUP_EXCLUDED_PAGES = ['/checkout.html', '/thank-you.html', '/cart.html', '/welcome', '/welcome.html'];

  // Both stores throw in Safari private mode rather than returning null, and
  // an offer popup is never worth taking the page down over.
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* session only */ } }
  function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- tracking ----------------
     One funnel: viewed -> closed | submitted -> revealed -> copied, with
     errors alongside. js/analytics.js already stamps every beacon with the
     session id and the session's UTM parameters, so nothing here repeats
     them: "which ad produced this address" is answered by the envelope the
     beacon already carries, not by anything this file has to remember.

     The dashboard only records event types it knows (ALLOWED_EVENT_TYPES in
     the glow-dashboard repo). A name added here and not there is dropped on
     arrival, silently. */
  function track(event, props) {
    if (typeof window.GlowAnalytics === 'undefined') return;
    try {
      var base = { page_path: location.pathname };
      for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) base[k] = props[k];
      window.GlowAnalytics.track(event, base);
    } catch (e) { /* analytics must never break the offer */ }
  }

  // Which surface an address came from, in the vocabulary the funnel reports
  // in. Two now, so it travels on the surface object below (surface.formLocation)
  // rather than living as one constant, but every call site still reads it
  // from there rather than writing 'footer' or 'popup' out by hand — the same
  // reason it was a named constant when there was only one value.

  // Only meaningful on a product page. Read from the catalog rather than
  // scraped off the rendered page, so the SKU reported is the one an order
  // would actually be priced against.
  function productProps() {
    var slug = document.body.getAttribute('data-product-slug');
    if (!slug || typeof GLOW_PRODUCTS === 'undefined' || typeof productSlug === 'undefined') return {};
    for (var i = 0; i < GLOW_PRODUCTS.length; i++) {
      // productSlug() takes the name, not the product
      if (productSlug(GLOW_PRODUCTS[i].name) !== slug) continue;
      var p = GLOW_PRODUCTS[i];
      return {
        product_name: p.name,
        product_sku: (p.sizes && p.sizes[0] && p.sizes[0].sku) || null,
      };
    }
    return {};
  }

  /* ---------------- the form, shared by all three surfaces ---------------- */

  function formHtml(idPrefix) {
    return '' +
      '<form class="lo-form" novalidate>' +
        '<label class="lo-sr" for="' + idPrefix + 'Email">Email address</label>' +
        '<input type="email" id="' + idPrefix + 'Email" class="lo-input" required ' +
               'autocomplete="email" inputmode="email" placeholder="Enter your email" />' +
        // Honeypot, matched by the check in api/unlock-offer.js. Off-screen
        // rather than display:none, which some bots skip, and hidden from
        // assistive tech so nobody is asked to fill it.
        '<input type="text" name="website" class="lo-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />' +
        '<button type="submit" class="btn btn-primary lo-submit">' + esc(CFG.cta) + '</button>' +
      '</form>' +
      '<p class="lo-msg" role="status" aria-live="polite"></p>';
  }

  function revealHtml(code, percentOff) {
    return '' +
      '<div class="lo-reveal">' +
        '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
        '<p class="lo-code">' + esc(CFG.revealTitle(code)) + '</p>' +
        '<p class="lo-ask">' + esc(CFG.revealBody(percentOff || CFG.percentOff)) + '</p>' +
        '<button type="button" class="btn btn-primary lo-copy-btn">Copy code</button>' +
      '</div>';
  }

  // `surface` is { variant, formId, root, onRevealed }. Everything that is the
  // same regardless of frame lives here, so the bar, the dialog and the footer
  // cannot drift in behaviour or in what they report.
  function wireForm(surface) {
    var form = surface.root.querySelector('.lo-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('.lo-input');
      var btn = form.querySelector('.lo-submit');
      var msg = surface.root.querySelector('.lo-msg');
      var email = (input.value || '').trim();

      var fail = function (type, message) {
        msg.textContent = message;
        msg.className = 'lo-msg is-error';
        track('email_capture_error', {
          form_id: surface.formId,
          form_location: surface.formLocation,
          error_type: type,
        });
      };

      // Checked here only to save a round trip on an obvious typo. The address
      // is validated properly server-side, which is the check that counts.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail('invalid_email', 'Enter a valid email address.');
        input.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Checking…';
      msg.textContent = '';
      msg.className = 'lo-msg';

      fetch('/api/unlock-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          website: form.website.value,
          // Sent so the lead row records which page and which ad produced the
          // address, alongside the code. The beacon carries the same context
          // for the funnel; this is the durable copy attached to the person.
          formLocation: surface.formLocation,
          formId: surface.formId,
          triggerType: surface.triggerType,
          sourcePage: location.pathname,
          analytics: (window.GlowAnalytics && window.GlowAnalytics.ids) ? window.GlowAnalytics.ids() : null,
          utm: readUtm(),
        }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.d.ok || !res.d.code) {
            var err = new Error(res.d && res.d.error ? res.d.error : 'Something went wrong. Try again in a moment.');
            err.type = res.status === 503 ? 'offer_unavailable' : 'server_error';
            throw err;
          }
          set(UNLOCKED, res.d.code);

          var shared = {
            form_id: surface.formId,
            form_location: surface.formLocation,
            trigger_type: surface.triggerType,
          };
          var withProduct = productProps();
          for (var k in withProduct) shared[k] = withProduct[k];

          track('email_capture_submitted', Object.assign({}, shared, {
            offer_type: 'launch_discount',
            code_revealed: res.d.code,
          }));
          track('discount_code_revealed', {
            code: res.d.code,
            reveal_method: 'email_submit',
            form_location: surface.formLocation,
          });

          showReveal(surface, res.d.code, res.d.percentOff);
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = CFG.cta;
          fail(err.type || 'network_error', err.message);
        });
    });
  }

  function readUtm() {
    try {
      var q = new URLSearchParams(location.search);
      return {
        source: q.get('utm_source') || '',
        medium: q.get('utm_medium') || '',
        campaign: q.get('utm_campaign') || '',
        content: q.get('utm_content') || '',
      };
    } catch (e) { return null; }
  }

  function showReveal(surface, code, percentOff) {
    var body = surface.root.querySelector('.lo-body');
    body.innerHTML = revealHtml(code, percentOff);

    body.querySelector('.lo-copy-btn').addEventListener('click', function () {
      var btn = this;
      track('discount_code_copied', {
        code: code,
        form_location: surface.formLocation,
      });
      // Clipboard access is not granted everywhere (insecure origin, older
      // Safari). The code is on screen either way, so a failure is silent
      // rather than an error the visitor can do nothing about.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { btn.textContent = 'Copied'; }, function () {});
      }
    });

    if (surface.onRevealed) surface.onRevealed();
  }

  /* ---------------- the footer form ----------------
     Always present, never suppressed. If the code is already held it shows
     that instead of asking again for an address already given. */

  if (footerHost) {
    var footerSurface = {
      variant: 'footer',
      formId: 'launch-offer-footer',
      formLocation: 'footer',
      triggerType: 'footer',
      root: footerHost,
      onRevealed: null,
    };
    var held = get(UNLOCKED);
    footerHost.innerHTML =
      '<div class="lo-copy">' +
        '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
        '<h3 class="lo-title">' + esc(CFG.title) + '</h3>' +
        '<p class="lo-ask">' + esc(CFG.ask) + '</p>' +
      '</div>' +
      '<div class="lo-body">' + (held ? revealHtml(held, CFG.percentOff) : formHtml('loFoot')) + '</div>' +
      '<p class="lo-facts">' + esc(CFG.facts) + '</p>';

    if (held) {
      showReveal(footerSurface, held, CFG.percentOff);
    } else {
      wireForm(footerSurface);
      // The footer is not an interruption, so "viewed" means scrolled to,
      // not rendered. Anything else would report a view for every page load.
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          io.disconnect();
          track('email_capture_viewed', {
            form_id: footerSurface.formId,
            form_location: 'footer',
            trigger_type: 'footer',
          });
        }, { threshold: 0.4 });
        io.observe(footerHost);
      }
    }
  }

  /* ---------------- the popup ----------------
     Built entirely here rather than shipped in every page's markup: there is
     nothing for a crawler or a no-JS visitor to read in an overlay that only
     ever appears after a behavioural trigger, so baking empty frames into
     twenty-odd pages would buy nothing check-claims.js could verify against.

     Eligibility is checked once, before anything is armed. Any one of these
     is enough to never show it at all this page view: */
  function popupEligible() {
    if (POPUP_EXCLUDED_PAGES.indexOf(location.pathname) !== -1) return false;
    if (get(UNLOCKED)) return false;           // the code is already held
    if (get(SESSION_ACCOUNT)) return false;    // already signed in
    if (get(HAS_ORDERED)) return false;        // already a customer
    if (sGet(POPUP_SHOWN)) return false;       // already shown this session
    var dismissedAt = parseInt(get(POPUP_DISMISSED_AT), 10);
    if (dismissedAt && (Date.now() - dismissedAt) < POPUP_COOLDOWN_MS) return false;
    return true;
  }

  if (popupEligible()) {
    var popOverlay, popPanel, popSurface;

    function buildPopup() {
      popOverlay = document.createElement('div');
      popOverlay.className = 'lo-pop-overlay';
      popOverlay.hidden = true;
      popOverlay.innerHTML =
        '<div class="lo-pop" role="dialog" aria-modal="true" aria-label="' + esc(CFG.title) + '">' +
          '<button type="button" class="lo-pop-close" aria-label="Close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
              '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '</svg>' +
          '</button>' +
          '<div class="lo-copy">' +
            '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
            '<h3 class="lo-title">' + esc(CFG.title) + '</h3>' +
            '<p class="lo-ask">' + esc(CFG.ask) + '</p>' +
          '</div>' +
          '<div class="lo-body">' + formHtml('loPop') + '</div>' +
          '<p class="lo-facts">' + esc(CFG.facts) + '</p>' +
        '</div>';
      document.body.appendChild(popOverlay);
      popPanel = popOverlay.querySelector('.lo-pop');

      popSurface = {
        variant: 'popup',
        formId: 'launch-offer-popup',
        formLocation: 'popup',
        triggerType: pendingTriggerType,
        root: popPanel,
        onRevealed: null,
      };
      wireForm(popSurface);

      popOverlay.querySelector('.lo-pop-close').addEventListener('click', dismissPopup);
      popOverlay.addEventListener('mousedown', function (e) { if (e.target === popOverlay) dismissPopup(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && popOverlay.classList.contains('is-shown')) dismissPopup();
      });
    }

    function showPopup(triggerType) {
      // Another overlay (cart, search) already has the page's attention.
      // Not queued for later: this is a rare edge case, and a popup arriving
      // the moment someone closes a different one is its own kind of bad
      // timing, worth skipping rather than working around.
      if (document.body.classList.contains('search-locked')) return;

      pendingTriggerType = triggerType;
      if (!popOverlay) buildPopup();
      popSurface.triggerType = triggerType;

      sSet(POPUP_SHOWN, '1');
      popOverlay.hidden = false;
      document.body.classList.add('search-locked');
      // Two frames, same reasoning as the cart drawer's own open(): one for
      // the browser to lay the panel out at its hidden transform, one for
      // that to be the computed style before the class flips, so the
      // transition has a start state to animate from instead of jumping.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { popOverlay.classList.add('is-shown'); });
      });

      track('email_capture_viewed', {
        form_id: popSurface.formId,
        form_location: 'popup',
        trigger_type: triggerType,
      });
    }

    function dismissPopup() {
      popOverlay.classList.remove('is-shown');
      document.body.classList.remove('search-locked');
      setTimeout(function () { popOverlay.hidden = true; }, 200);
      // Only a cooldown if nothing was submitted: showReveal() swaps the
      // panel's markup on success, so a form still being on screen when this
      // runs is what "closed without submitting" actually means here.
      if (popOverlay.querySelector('.lo-form')) {
        set(POPUP_DISMISSED_AT, String(Date.now()));
        track('email_capture_closed', {
          form_id: popSurface.formId,
          form_location: 'popup',
          trigger_type: popSurface.triggerType,
        });
      }
    }

    var pendingTriggerType = null;

    /* ---- triggers ----
       Exactly one of these ever fires per page view: whichever wins calls
       showPopup() and every listener below tears itself down, armed or not. */

    var canHover = window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (canHover) {
      // Exit intent: the cursor leaving through the top edge of the
      // viewport, which is the one motion that only means "leaving" rather
      // than "reaching for a tab, a bookmark, or a second monitor." Armed
      // after a short delay rather than from the first paint, so the cursor
      // settling into the page on load cannot itself read as an exit.
      var armed = false;
      var armTimer = setTimeout(function () { armed = true; }, 1000);
      var onExitIntent = function (e) {
        if (!armed || e.clientY > 0 || e.relatedTarget || e.toElement) return;
        document.removeEventListener('mouseout', onExitIntent);
        clearTimeout(armTimer);
        showPopup('exit_intent');
      };
      document.addEventListener('mouseout', onExitIntent);
    } else {
      // No cursor to leave through the top of anything, so a touch device
      // gets a nudge partway through the page instead: ten seconds of
      // reading, or a scroll past halfway, whichever comes first.
      var mobileTimer = setTimeout(function () {
        window.removeEventListener('scroll', onMobileScroll);
        showPopup('mobile_timer');
      }, 10000);
      var onMobileScroll = function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - doc.clientHeight;
        if (max <= 0 || (scrollY / max) < 0.5) return;
        window.removeEventListener('scroll', onMobileScroll);
        clearTimeout(mobileTimer);
        showPopup('mobile_scroll');
      };
      window.addEventListener('scroll', onMobileScroll, { passive: true });
    }
  }
})();
