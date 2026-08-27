// ===================== Glow Research — launch offer =====================
// Collects an email address in exchange for the launch discount code.
//
// Two surfaces, chosen per page by data-launch-offer on <body>:
//
//   bar    a strip along the foot of the page, used on the homepage. Someone
//          who has just arrived is still deciding whether this is a real
//          supplier; taking the screen away from them to sell a discount is
//          the wrong trade, so the page stays readable underneath.
//   modal  a dialog, used on the catalog and the product pages, where the
//          visitor has already chosen to look at what is for sale.
//
// Cart and checkout get neither, and the file is not loaded there: interrupting
// someone who is already buying can only cost an order.
//
// The code itself is NOT in this file, and must not be put here. The page ships
// the offer's words and no value; api/unlock-offer.js hands the code back after
// an address is in, having first confirmed with Stripe that it is still live.
// Anything else would be giving away the thing being asked for, and would let
// the page promise a discount that checkout then refuses.
(function () {
  // products-data.js declares these with `const` in a classic script, which
  // puts them in the global lexical scope rather than on window, so they are
  // reached as bare identifiers behind a typeof guard like everywhere else.
  if (typeof LAUNCH_OFFER_LIVE === 'undefined' || !LAUNCH_OFFER_LIVE) return;
  if (typeof LAUNCH_OFFER === 'undefined' || !LAUNCH_OFFER) return;
  var CFG = LAUNCH_OFFER;

  var variant = document.body.getAttribute('data-launch-offer');
  if (variant !== 'bar' && variant !== 'modal') return;

  // Two records, because they answer different questions. "Already has the
  // code" is permanent and worth restoring on sight. "Said no" only means not
  // now, so it lapses: a fortnight is long enough not to nag and short enough
  // that a promotion is not silenced for a returning visitor forever.
  var UNLOCKED = 'glow-offer-code';
  var DISMISSED = 'glow-offer-dismissed';
  var DISMISS_DAYS = 14;

  // localStorage throws in Safari private mode rather than returning null, and
  // an offer popup is never worth taking the page down over.
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* session only */ } }

  function dismissedRecently() {
    var at = Number(get(DISMISSED) || 0);
    return at > 0 && (Date.now() - at) < DISMISS_DAYS * 864e5;
  }

  if (get(UNLOCKED) || dismissedRecently()) return;

  var el = null;
  var shown = false;
  var lastFocus = null;

  /* ---------------- markup ---------------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // The form is the same in both surfaces; only the frame around it differs.
  function formHtml() {
    return '' +
      '<form class="lo-form" novalidate>' +
        '<label class="lo-sr" for="loEmail">Email address</label>' +
        '<input type="email" id="loEmail" class="lo-input" required ' +
               'autocomplete="email" inputmode="email" placeholder="you@lab.com" />' +
        // Honeypot, matched by the check in api/unlock-offer.js. Off-screen
        // rather than display:none, which some bots skip, and hidden from
        // assistive tech so nobody is asked to fill it.
        '<input type="text" name="website" class="lo-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />' +
        '<button type="submit" class="btn btn-primary lo-submit">' + esc(CFG.cta) + '</button>' +
      '</form>' +
      '<p class="lo-msg" role="status" aria-live="polite"></p>';
  }

  function build() {
    var wrap = document.createElement('div');

    if (variant === 'bar') {
      wrap.className = 'lo-bar';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', CFG.eyebrow);
      wrap.innerHTML =
        '<div class="lo-bar-inner">' +
          '<div class="lo-copy">' +
            '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
            '<p class="lo-title">' + esc(CFG.barTitle) + '</p>' +
            '<p class="lo-ask">' + esc(CFG.ask) + '</p>' +
          '</div>' +
          '<div class="lo-action">' + formHtml() + '</div>' +
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
        formHtml() +
        '<p class="lo-facts">' + esc(CFG.facts) + '</p>' +
      '</div>';
    return wrap;
  }

  /* ---------------- open / close ---------------- */

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

    el = build();
    document.body.appendChild(el);
    // let the element land before the transition class, or it animates from
    // wherever the browser first painted it
    requestAnimationFrame(function () { el.classList.add('is-open'); });

    el.querySelector('.lo-close').addEventListener('click', function () { close(true); });
    el.querySelector('.lo-form').addEventListener('submit', submit);

    if (variant === 'modal') {
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
    if (remember) set(DISMISSED, String(Date.now()));
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

  /* ---------------- submit ---------------- */

  function submit(e) {
    e.preventDefault();
    var form = e.target;
    var input = form.querySelector('.lo-input');
    var btn = form.querySelector('.lo-submit');
    var msg = el.querySelector('.lo-msg');
    var email = (input.value || '').trim();

    // Checked here only to save a round trip on an obvious typo. The address is
    // validated properly server-side, which is the check that counts.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Enter a valid email address.';
      msg.className = 'lo-msg is-error';
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
      body: JSON.stringify({ email: email, website: form.website.value }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok || !res.d.code) {
          throw new Error(res.d && res.d.error ? res.d.error : 'Something went wrong. Try again in a moment.');
        }
        set(UNLOCKED, res.d.code);
        reveal(res.d.code, res.d.percentOff);
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = CFG.cta;
        msg.textContent = err.message;
        msg.className = 'lo-msg is-error';
      });
  }

  // The percentage comes back from the endpoint, which read it off the live
  // coupon, so the sentence states the discount Stripe will actually apply
  // rather than the one the catalog was configured with.
  function reveal(code, percentOff) {
    var pct = percentOff || CFG.percentOff;
    var host = variant === 'bar' ? el.querySelector('.lo-bar-inner') : el.querySelector('.lo-modal');

    host.innerHTML =
      '<button type="button" class="lo-close" aria-label="Close">&times;</button>' +
      '<div class="lo-reveal">' +
        '<span class="lo-eyebrow">' + esc(CFG.eyebrow) + '</span>' +
        '<p class="lo-code">' + esc(CFG.revealTitle(code)) + '</p>' +
        '<p class="lo-ask">' + esc(CFG.revealBody(pct)) + '</p>' +
        '<button type="button" class="btn btn-primary lo-copy-btn" data-code="' + esc(code) + '">Copy code</button>' +
      '</div>';

    host.querySelector('.lo-close').addEventListener('click', function () { close(false); });

    var copyBtn = host.querySelector('.lo-copy-btn');
    copyBtn.addEventListener('click', function () {
      // Clipboard access is not granted everywhere (insecure origin, older
      // Safari). The code is on screen either way, so a failure is silent
      // rather than an error the visitor can do nothing about.
      var done = function () { copyBtn.textContent = 'Copied'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () {});
      }
    });

    if (variant === 'modal') el.querySelector('.lo-modal').focus();
  }

  /* ---------------- triggers ---------------- */

  var fired = false;
  function fire() {
    if (fired) return;
    fired = true;
    open();
  }

  if (variant === 'bar') {
    setTimeout(fire, CFG.barDelayMs);
  } else {
    setTimeout(fire, CFG.modalDelayMs);
    // …or a third of the way down, whichever comes first. Depth is the better
    // signal of the two: it says the visitor chose to keep going.
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      if (max > 0 && (h.scrollTop || document.body.scrollTop) / max >= CFG.modalScrollAt) {
        window.removeEventListener('scroll', onScroll);
        fire();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
