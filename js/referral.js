// ===================== Glow Research — referral attribution =====================
// The half of an affiliate programme that has to live in the browser: catching
// the ?ref= code when someone lands, holding it for the attribution window, and
// handing it to checkout so the order can be credited.
//
// The other half — validating codes, approving commission after the return
// window, and paying anyone — has to be server-side. A payout ledger that lives
// in localStorage is one devtools console away from being edited by the person
// getting paid. See AFFILIATE.md for how the two halves meet.
(function () {
  var KEY = 'glow-ref';
  var WINDOW_DAYS = 30;          // how long a click stays credited
  var DAY = 24 * 60 * 60 * 1000;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      // expire on read rather than on a timer: nothing is running between visits
      if (!v || !v.code || Date.now() - v.at > WINDOW_DAYS * DAY) {
        localStorage.removeItem(KEY);
        return null;
      }
      return v;
    } catch (e) { return null; }
  }

  function save(code, landing) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        code: code,
        at: Date.now(),
        landing: landing,
      }));
    } catch (e) { /* private mode — attribution is best-effort */ }
  }

  // Codes come off a URL anyone can edit, so keep the shape tight before it is
  // stored or echoed back into the page. The server still has to verify that
  // the code actually belongs to an approved affiliate.
  function clean(raw) {
    if (!raw) return null;
    var c = String(raw).trim().toUpperCase();
    return /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(c) ? c : null;
  }

  function capture() {
    var params = new URLSearchParams(location.search);
    var code = clean(params.get('ref'));
    if (!code) return;

    // Last click wins: a visitor who arrives through a second affiliate is
    // credited to that one. Whichever rule you pick, it has to match what the
    // affiliate agreement says, because affiliates do check.
    save(code, location.pathname);

    // Drop the parameter so the code isn't carried into anything the visitor
    // shares, bookmarks, or sends to analytics as part of the page URL.
    params.delete('ref');
    var q = params.toString();
    history.replaceState({}, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  capture();

  window.GlowReferral = {
    // { code, at, landing } or null
    get: read,
    code: function () { var v = read(); return v ? v.code : null; },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    windowDays: WINDOW_DAYS,
  };
})();
