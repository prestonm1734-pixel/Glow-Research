// ===================== Glow Research — launch offer =====================
// Collects an email address in exchange for the launch discount code.
//
// One surface: the standing form in the footer of index.html and welcome.html.
// It is not an interruption, so nothing suppresses it. Someone who scrolled
// past it in March can still ask in June, and the only thing it remembers is
// whether the address has already been given, so it shows the code back rather
// than asking twice for something already handed over.
//
// There were two popups here, a bar along the foot of the homepage and a
// dialog on the catalog and the product pages, both on a delay. They were
// removed because nearly all of this store's traffic arrives from a Facebook
// ad, and an offer thrown over a page someone landed on seconds ago reads as
// spam from a supplier they have not decided to trust yet. The footer asks the
// same question of someone who has read enough of the page to reach it.
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

  var footerHost = document.getElementById('offerFooter');
  if (!footerHost) return;

  /* ---------------- state ---------------- */

  // One record, and the only thing this file remembers about anyone. It means
  // the code has already been handed over, permanently, so the footer shows it
  // back rather than asking a second time for an address already given.
  //
  // The popup kept two more, one permanent and one session-scoped, both to
  // avoid asking twice. Neither ever gated this form and both went with it.
  // Whatever those keys still hold in a returning visitor's storage is now
  // ignored rather than read.
  var UNLOCKED = 'glow-offer-code';

  // Both stores throw in Safari private mode rather than returning null, and
  // an offer popup is never worth taking the page down over.
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* session only */ } }

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
  // in. One surface left, so it is a constant, but it stays a named one: the
  // dashboard slices the capture funnel by this value, and the same bare
  // string repeated at five call sites is how those slices drift apart.
  var FORM_LOCATION = 'footer';

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
          form_location: FORM_LOCATION,
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
          formLocation: FORM_LOCATION,
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
            form_location: FORM_LOCATION,
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
            form_location: FORM_LOCATION,
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
        form_location: FORM_LOCATION,
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
})();
