// ===================== Glow Research — age / RUO gate =====================
// Shown once on a visitor's first arrival, on whichever page they land on.
// Acceptance persists in localStorage, so it never appears again afterwards.
//
// This file is loaded at the TOP of <body> rather than with the other scripts
// at the bottom: the overlay has to be in the DOM before the page below it
// paints, otherwise the site flashes into view behind the gate. Building it
// from script (instead of hiding the page from CSS) also means a failure to
// load leaves the site usable rather than blanked out.
(function () {
  var KEY = 'glow-age-ok';

  // localStorage throws in Safari private mode rather than returning null, and
  // a gate that hard-fails there would lock the whole site behind an exception
  function accepted() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* session-only, fine */ }
  }

  if (accepted()) return;

  // The blog posts sit two directories deep, so a bare "about.html" would 404
  // from there. The nav's own depthed links aren't parsed yet at this point in
  // the document, so work the depth out from the path instead.
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
    el.innerHTML =
      // focus lands on the panel rather than the Enter button: focusing a
      // control programmatically trips :focus-visible in Chromium, so the
      // gate would open with a heavy ring already drawn around it
      '<div class="age-gate-panel" id="ageGatePanel" tabindex="-1">' +
        '<span class="age-gate-logo">Glow<span class="spark">✦</span></span>' +
        '<span class="age-gate-eyebrow">Research Use Only</span>' +
        '<h2 class="age-gate-title" id="ageGateTitle">You must be 21 or older to enter</h2>' +
        '<p class="age-gate-copy">' +
          'Glow Research supplies research compounds strictly for in-vitro laboratory ' +
          'use — not for human or veterinary consumption. By entering you confirm ' +
          'you are at least 21 and agree to our ' +
          '<a href="' + root + 'about.html">Research Use Only terms</a>.' +
        '</p>' +
        '<button type="button" class="btn btn-primary age-gate-enter" id="ageGateEnter">' +
          'I am 21 or older — Enter' +
        '</button>' +
        '<button type="button" class="btn btn-outline age-gate-exit" id="ageGateExit">Exit</button>' +
      '</div>';
    return el;
  }

  function mount() {
    var el = build();
    document.body.appendChild(el);
    document.documentElement.classList.add('age-gate-open');

    var enter = el.querySelector('#ageGateEnter');
    var exit = el.querySelector('#ageGateExit');

    enter.addEventListener('click', function () {
      remember();
      document.documentElement.classList.remove('age-gate-open');
      el.classList.add('is-going');
      // let the fade finish before the node goes, but don't leave it in the
      // tree if the transition never fires (reduced-motion, background tab)
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    });

    exit.addEventListener('click', function () {
      window.location.href = 'https://www.google.com';
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
