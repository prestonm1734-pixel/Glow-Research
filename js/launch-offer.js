// ===================== Glow Research — launch offer =====================
// Collects an email address in exchange for the launch discount code.
//
// Three surfaces, all sharing one form, one set of copy and one set of events:
//
//   bar     a strip along the foot of the homepage. Someone who has just
//           arrived is still deciding whether this is a real supplier; taking
//           the screen away to sell a discount is the wrong trade, so the page
//           stays readable underneath.
//   modal   a dialog on the catalog and the product pages, where the visitor
//           has already chosen to look at what is for sale.
//   footer  the standing form in the footer. Not an interruption, so none of
//           the suppression below applies to it: someone who dismissed the
//           popup in March should still be able to ask for the code in June.
//
// Cart and checkout get no popup and the file is not loaded there: interrupting
// someone who is already buying can only cost an order.
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

  var popupVariant = document.body.getAttribute('data-launch-offer');
  var footerHost = document.getElementById('offerFooter');
  if (popupVariant !== 'bar' && popupVariant !== 'modal') popupVariant = null;
  if (!popupVariant && !footerHost) return;

  /* ---------------- state ---------------- */

  // Three records, because they answer three different questions.
  //
  //   UNLOCKED   they have the code. Permanent.
  //   DISMISSED  they closed the popup. Permanent: being asked twice for
  //              something you already declined is what makes these hateful.
  //   SEEN       the popup has been on screen once this visit. Session-scoped,
  //              so walking homepage to catalog to a product page is asked
  //              once, not three times. It lapses with the tab, which is the
  //              point: ignoring is not the same act as refusing.
  //
  // None of the three gate the footer form.
  var UNLOCKED = 'glow-offer-code';
  var DISMISSED = 'glow-offer-dismissed';
  var SEEN = 'glow-offer-seen';

  // Both stores throw in Safari private mode rather than returning null, and
  // an offer popup is never worth taking the page down over.
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* session only */ } }
  function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* page only */ } }

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

  // Which page this address came from, in the vocabulary the funnel reports
  // in. Derived from the surface rather than the URL, so a form is always
  // labelled by where it actually is.
  function locationOf(variant) {
    if (variant === 'footer') return 'footer';
    if (variant === 'bar') return 'homepage';
    return document.body.hasAttribute('data-product-slug') ? 'product' : 'catalog';
  }

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
          form_location: locationOf(surface.variant),
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
          formLocation: locationOf(surface.variant),
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
            form_location: locationOf(surface.variant),
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
            form_location: locationOf(surface.variant),
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
        form_location: locationOf(surface.variant),
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
      triggerType: 'footer',
      root: footerHost,
      onRevealed: null,
    };
    var held = get(UNLOCKED);
    footerHost.innerHTML =
      '<div class="lo-copy">' +
        '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
        '<h3 class="lo-title">' + esc(CFG.modalTitle) + '</h3>' +
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

  /* ---------------- the popup ---------------- */

  if (!popupVariant) return;
  if (get(UNLOCKED) || get(DISMISSED) || sGet(SEEN)) return;

  var el = null;
  var shown = false;
  var openedAt = 0;
  var lastFocus = null;
  var triggerType = null;

  var surface = {
    variant: popupVariant,
    formId: 'launch-offer-' + popupVariant,
    triggerType: null,
    root: null,
    onRevealed: function () {
      if (popupVariant === 'modal') el.querySelector('.lo-modal').focus();
    },
  };

  function build() {
    var wrap = document.createElement('div');
    var head =
      '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
      '<p class="lo-title">' + esc(popupVariant === 'bar' ? CFG.barTitle : CFG.modalTitle) + '</p>' +
      '<p class="lo-ask">' + esc(CFG.ask) + '</p>';

    if (popupVariant === 'bar') {
      wrap.className = 'lo-bar';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', CFG.eyebrow);
      wrap.innerHTML =
        '<div class="lo-bar-inner">' +
          '<div class="lo-copy">' + head + '</div>' +
          '<div class="lo-body">' + formHtml('loBar') + '</div>' +
          '<button type="button" class="lo-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<p class="lo-facts">' + esc(CFG.facts) + '</p>';
      return wrap;
    }

    wrap.className = 'lo-overlay';
    wrap.innerHTML =
      '<div class="lo-modal" role="dialog" aria-modal="true" aria-labelledby="loTitle" tabindex="-1">' +
        '<button type="button" class="lo-close" aria-label="Close">&times;</button>' +
        '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
        '<h2 class="lo-title" id="loTitle">' + esc(CFG.modalTitle) + '</h2>' +
        '<p class="lo-ask">' + esc(CFG.ask) + '</p>' +
        '<div class="lo-body">' + formHtml('loMod') + '</div>' +
        '<p class="lo-facts">' + esc(CFG.facts) + '</p>' +
      '</div>';
    return wrap;
  }

  // The cart drawer and the search modal are also full-screen layers. Opening
  // over one of them would bury whatever the visitor deliberately opened, so
  // the offer waits and tries again rather than competing for the screen.
  function screenIsBusy() {
    return !!document.querySelector(
      '.cart-overlay.open, .search-overlay.open, .qa-overlay.open, .age-gate'
    );
  }

  function open() {
    if (shown || get(UNLOCKED)) return;
    if (screenIsBusy()) { setTimeout(open, 4000); return; }
    shown = true;
    // Recorded as it opens, not as it closes: navigating away mid-popup still
    // counts as having been asked.
    sSet(SEEN, '1');
    openedAt = Date.now();

    el = build();
    surface.root = el;
    surface.triggerType = triggerType;
    document.body.appendChild(el);
    // let the element land before the transition class, or it animates from
    // wherever the browser first painted it
    requestAnimationFrame(function () { el.classList.add('is-open'); });

    el.querySelector('.lo-close').addEventListener('click', function () { close(true); });
    wireForm(surface);

    var viewed = {
      form_id: surface.formId,
      form_location: locationOf(popupVariant),
      trigger_type: triggerType,
    };
    var prod = productProps();
    for (var k in prod) viewed[k] = prod[k];
    track('email_capture_viewed', viewed);

    if (popupVariant === 'modal') {
      lastFocus = document.activeElement;
      document.documentElement.classList.add('lo-locked');
      // focus the panel, not the input: focusing a control programmatically
      // trips :focus-visible in Chromium, so the dialog would open with a ring
      // already drawn around the field
      el.querySelector('.lo-modal').focus();
      el.addEventListener('keydown', trap);
      el.addEventListener('mousedown', function (e) {
        // click-outside closes: unlike the age gate this is an offer, not a
        // condition of entry, so it must always be escapable
        if (e.target === el) close(true);
      });
    }
  }

  function close(remember) {
    if (!el) return;
    // remember=true is a deliberate close (the X, Escape, a click outside).
    // Closing the reveal passes false: they took the code, which UNLOCKED
    // already records, and that is not a refusal.
    if (remember) {
      set(DISMISSED, String(Date.now()));
      track('email_capture_closed', {
        form_id: surface.formId,
        form_location: locationOf(popupVariant),
        trigger_type: triggerType,
        time_visible_seconds: Math.round((Date.now() - openedAt) / 1000),
      });
    }
    document.documentElement.classList.remove('lo-locked');
    el.classList.remove('is-open');
    var node = el;
    el = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    // don't leave it in the tree if the transition never fires
    // (reduced-motion, background tab)
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 300);
  }

  function trap(e) {
    if (e.key === 'Escape') { close(true); return; }
    if (e.key !== 'Tab') return;
    var f = el.querySelectorAll('button, input:not(.lo-hp), a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- triggers ---------------- */

  var fired = false;
  function fire(how) {
    if (fired) return;
    fired = true;
    triggerType = how;
    open();
  }

  if (popupVariant === 'bar') {
    setTimeout(function () { fire('delay'); }, CFG.barDelayMs);
  } else {
    setTimeout(function () { fire('delay'); }, CFG.modalDelayMs);
    // …or a third of the way down, whichever comes first. Depth is the better
    // signal of the two: it says the visitor chose to keep going.
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      if (max > 0 && (h.scrollTop || document.body.scrollTop) / max >= CFG.modalScrollAt) {
        window.removeEventListener('scroll', onScroll);
        fire('scroll');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
