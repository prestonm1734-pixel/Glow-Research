// ===================== Glow Research — age / RUO gate =====================
// Shown once per browser session (sessionStorage, not localStorage): a new
// tab is a fresh confirmation, closing the tab and reopening the site later
// asks again. This is deliberately lighter than the order-time attestation
// api/create-order.js enforces — that one is server-side, permanent per
// order, and cannot be bypassed by clearing storage. This one is a browse-time
// gesture, not a legal record, so a lighter, session-scoped memory is the
// right amount of friction: a returning visitor mid-session is not asked
// again on every page, but a new visit starts clean.
//
// Loaded at the TOP of <body> rather than with the other scripts at the
// bottom: the overlay has to be in the DOM before the page below it paints.
(function () {
  var KEY = 'glow-age-ok-session';

  function accepted() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function remember() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* private mode: gate reappears next page, harmless */ }
  }

  function mount() {
    if (accepted()) return;

    var el = document.createElement('div');
    el.className = 'age-gate';
    el.id = 'ageGate';
    el.innerHTML =
      '<div class="age-gate-panel" id="ageGatePanel" tabindex="-1">' +
        '<div class="age-gate-logo">GLOW<span class="spark">*</span></div>' +
        '<p class="age-gate-eyebrow">Research Use Only</p>' +
        '<h2 class="age-gate-title">You must be 21 or older to enter</h2>' +
        '<p class="age-gate-copy">' +
          'This site sells laboratory research compounds, not for use in humans or ' +
          'animals. By entering you confirm you are 21 or older and agree to our ' +
          '<a href="ruo-agreement.html">RUO Agreement</a> and ' +
          '<a href="terms.html">Terms of Sale</a>.' +
        '</p>' +
        '<button type="button" class="btn btn-primary age-gate-enter" id="ageGateEnter">I am 21+, agree and enter</button>' +
        '<button type="button" class="age-gate-exit" id="ageGateExit">Leave the site</button>' +
      '</div>';

    document.body.appendChild(el);
    document.documentElement.classList.add('age-gate-open');

    var enter = el.querySelector('#ageGateEnter');
    var exit = el.querySelector('#ageGateExit');

    enter.addEventListener('click', function () {
      remember();
      document.documentElement.classList.remove('age-gate-open');
      el.classList.add('is-going');
      setTimeout(function () { el.remove(); }, 300);
    });

    exit.addEventListener('click', function () {
      window.location.href = 'https://www.google.com';
    });

    // A gate is not dismissible: no Esc, no click-outside. Keep focus inside
    // it with a manual trap, since the two buttons are the only interactive
    // elements and nothing behind the overlay should be reachable by Tab.
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = el.querySelectorAll('a[href], button');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // focus lands on the panel rather than the Enter button: focusing a
    // control programmatically trips :focus-visible in Chromium, so the
    // panel (not styled with a visible focus ring) is the neutral choice.
    el.querySelector('#ageGatePanel').focus();
  }

  // document.body exists because this script sits inside it, but guard anyway
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
