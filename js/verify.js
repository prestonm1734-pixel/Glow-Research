// The researcher gate on verify.html.
//
// What it records is an attestation, not a check: the visitor states a
// researcher type and an email and confirms the terms in the fine print. The
// record is kept in the browser (localStorage, plus a long-lived cookie as a
// second copy) so the visitor is asked once on this device, and js/age-gate.js
// reads it and stays out of the way. Nothing is sent to a server here; the
// email is kept only to prefill checkout on this device.
(function () {
  const form = document.getElementById('vfForm');
  if (!form) return;
  const err = document.getElementById('vfErr');

  // Same version number js/age-gate.js stores, so one acceptance satisfies
  // both: the fine print here attests to everything the age gate asks.
  const VERSION = 3;
  const KEY = 'glow-researcher';
  // 400 days, the longest Chrome keeps a cookie; localStorage has no expiry.
  const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

  function next() {
    const raw = new URLSearchParams(location.search).get('next') || '/';
    // Same-site paths only, so the parameter cannot bounce a visitor to
    // another site.
    return /^\/(?!\/)[\w\-./?=&%#]*$/.test(raw) ? raw : '/';
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const type = form.type.value;
    const email = form.email.value.trim();
    if (!type) { err.textContent = 'Select your type of researcher.'; err.hidden = false; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter a valid email address.'; err.hidden = false; return; }
    err.hidden = true;

    const record = { v: VERSION, at: new Date().toISOString(), type, email, age21: true, researchUseOnly: true };
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch (x) { /* private mode */ }
    try { sessionStorage.setItem('glow-age-ok', JSON.stringify({ v: VERSION, at: record.at, age21: true, researchUseOnly: true })); } catch (x) {}
    document.cookie = `glow_researcher=${VERSION}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;

    if (window.GlowAnalytics) window.GlowAnalytics.track('researcher_verified', { type });
    location.href = next();
  });
})();
