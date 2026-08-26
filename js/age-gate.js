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
  // Temporarily disabled to test whether this gate is suppressing conversion
  // from paid traffic: real ad-click data showed 5 of 12 genuine visitors
  // bouncing at this screen before ever seeing the site, and the required
  // attestation still happens at checkout (#coTerms in checkout.html) before
  // any order can be placed, so removing this earlier browsewall does not
  // remove legal coverage. Revert by deleting this early return.
  return;

  var KEY = 'glow-age-ok';

  // Bump when the wording below changes materially. A stored acceptance of an
  // older version does not carry forward: someone who agreed to a weaker
  // statement has not agreed to this one, and the whole point of recording an
  // attestation is that it says what was actually attested to.
  var ATTESTATION_VERSION = 2;

  // localStorage throws in Safari private mode rather than returning null, and
  // a gate that hard-fails there would lock the whole site behind an exception
  function accepted() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      // v1 stored the string '1' and attested only to age. It is deliberately
      // not honoured here, so those visitors are asked the research-use
      // question once rather than never.
      if (raw.charAt(0) !== '{') return false;
      return JSON.parse(raw).v === ATTESTATION_VERSION;
    } catch (e) { return false; }
  }

  // What was affirmed, and when. A bare '1' recorded that a button was pressed
  // and nothing about what it said; api/create-order.js already writes
  // ruo_terms_accepted_at onto every order for the same reason.
  function remember() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: ATTESTATION_VERSION,
        at: new Date().toISOString(),
        age21: true,
        researchUseOnly: true,
      }));
    } catch (e) { /* session-only, fine */ }
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
        '<h2 class="age-gate-title" id="ageGateTitle">Researcher verification</h2>' +
        '<p class="age-gate-copy">' +
          'Glow Research supplies research compounds to qualified researchers and ' +
          'laboratories for in-vitro use only. Please confirm both before continuing.' +
        '</p>' +
        // Two separate boxes, neither ticked, because the point of an
        // attestation is the affirmative act. A pre-ticked box records that
        // someone did nothing. The second one is the one that matters here:
        // age has no bearing on whether a compound is a research chemical,
        // and it was the only thing the previous gate actually asked.
        '<label class="age-gate-check">' +
          '<input type="checkbox" id="ageGateAge" />' +
          '<span>I am at least <b>21 years of age</b>.</span>' +
        '</label>' +
        '<label class="age-gate-check">' +
          '<input type="checkbox" id="ageGateRuo" />' +
          '<span>I am purchasing for <b>in-vitro laboratory research only</b>, ' +
            'not for human or veterinary use, and I agree to the ' +
            '<a href="' + root + 'ruo-agreement.html">Research Use Only Agreement</a>.</span>' +
        '</label>' +
        '<button type="button" class="btn btn-primary age-gate-enter" id="ageGateEnter" disabled>' +
          'Enter Glow Research' +
        '</button>' +
        '<p class="age-gate-fine">' +
          'By proceeding you affirm the statements above are true. These products are ' +
          'not for human or veterinary use, not for use in diagnostic procedures, and ' +
          'have not been evaluated by the U.S. Food and Drug Administration.' +
        '</p>' +
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
    var age = el.querySelector('#ageGateAge');
    var ruo = el.querySelector('#ageGateRuo');

    // Enter stays disabled until both are ticked. The button is the record of
    // the attestation, so it must not be pressable before the attestation has
    // been made.
    function sync() { enter.disabled = !(age.checked && ruo.checked); }
    age.addEventListener('change', sync);
    ruo.addEventListener('change', sync);
    sync();

    enter.addEventListener('click', function () {
      if (enter.disabled) return;
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
      var focusable = el.querySelectorAll('a[href], button, input[type=checkbox]');
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
