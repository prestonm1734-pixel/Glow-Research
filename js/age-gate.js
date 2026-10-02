// ===================== Glow Research — age / RUO gate =====================
// Shown once per browser session, on whichever page they land on. Acceptance
// is remembered in sessionStorage rather than localStorage, so it resets when
// the session ends: a new tab or a closed-and-reopened browser is asked
// again, navigating within one session is not.
//
// This file is loaded at the TOP of <body> rather than with the other scripts
// at the bottom: the overlay has to be in the DOM before the page below it
// paints, otherwise the site flashes into view behind the gate. Building it
// from script (instead of hiding the page from CSS) also means a failure to
// load leaves the site usable rather than blanked out. That same ordering is
// why the copy below is written out by hand rather than read from
// js/products-data.js: that file loads near the foot of the page, well after
// this one has already run.
(function () {
  var KEY = 'glow-age-ok';

  // Bump when the wording below changes materially. A stored acceptance of an
  // older version does not carry forward: someone who agreed to a weaker
  // statement has not agreed to this one, and the whole point of recording an
  // attestation is that it says what was actually attested to.
  var ATTESTATION_VERSION = 3;

  // sessionStorage throws in Safari private mode rather than returning null,
  // and a gate that hard-fails there would lock the whole site behind an
  // exception.
  function accepted() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return false;
      if (raw.charAt(0) !== '{') return false;
      return JSON.parse(raw).v === ATTESTATION_VERSION;
    } catch (e) { return false; }
  }

  // What was affirmed, and when. A bare '1' recorded that a button was pressed
  // and nothing about what it said; api/create-order.js already writes
  // ruo_terms_accepted_at onto every order for the same reason.
  function remember() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        v: ATTESTATION_VERSION,
        at: new Date().toISOString(),
        age21: true,
        researchUseOnly: true,
      }));
    } catch (e) { /* private mode: gate reappears next page, harmless */ }
  }

  if (accepted()) return;

  // The product pages sit two directories deep, so a bare "terms.html" would
  // 404 from there. The nav's own depthed links aren't parsed yet at this
  // point in the document, so work the depth out from the path instead.
  function prefix() {
    var segs = location.pathname.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    var depth = /\.html?$/i.test(last) ? segs.length - 1 : segs.length;
    return depth > 0 ? new Array(depth + 1).join('../') : '';
  }

  function build() {
    var root = prefix();
    var el = document.createElement('div');
    el.className = 'age-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ageGateTitle');
    // No backdrop image: the page behind stays visible through a light wash
    // set in css/style.css, which is the point of this being a floating card.
    el.innerHTML =
      // focus lands on the panel rather than the button: focusing a control
      // programmatically trips :focus-visible in Chromium, so the gate would
      // open with a heavy ring already drawn around it
      '<div class="age-gate-panel" id="ageGatePanel" tabindex="-1">' +
        '<span class="age-gate-logo">Glow<span class="spark">&#10022;</span></span>' +
        '<h2 class="age-gate-title" id="ageGateTitle">Age Disclaimer</h2>' +
        '<p class="age-gate-copy">' +
          'You must be at least 21 years old to enter Glow Research and review ' +
          'products intended for laboratory research use only.' +
        '</p>' +
        '<div class="age-gate-actions">' +
          '<button type="button" class="age-gate-enter" id="ageGateEnter">' +
            'I am 21 or older <span aria-hidden="true">&rarr;</span>' +
          '</button>' +
          // Same facts the footer and the RUO Agreement already state, in the
          // same words: not for human or animal use, and what entering means.
          '<p class="age-gate-fine">' +
            'Not for human or veterinary use. By entering you agree to our ' +
            '<a href="' + root + 'terms.html">Terms</a> &amp; ' +
            '<a href="' + root + 'ruo-agreement.html">RUO Agreement</a>.' +
          '</p>' +
        '</div>' +
      '</div>';
    return el;
  }

  function mount() {
    var el = build();
    document.body.appendChild(el);
    document.documentElement.classList.add('age-gate-open');

    var enter = el.querySelector('#ageGateEnter');

    enter.addEventListener('click', function () {
      remember();
      document.documentElement.classList.remove('age-gate-open');
      el.classList.add('is-going');
      // let the fade finish before the node goes, but don't leave it in the
      // tree if the transition never fires (reduced-motion, background tab)
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    });

    // A gate is not dismissible: no Esc, no click-outside. Keep focus inside
    // it so a keyboard user can't tab into the page they haven't agreed to.
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = el.querySelectorAll('a[href], button');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    el.querySelector('#ageGatePanel').focus();
  }

  // document.body exists because this script sits inside it, but guard anyway
  // in case the tag is ever moved back down to the foot of the page
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
