// Beacons one page-view per load to the internal dashboard (a separate repo,
// glow-dashboard), so "who's on the site right now" reflects real traffic.
// Fire-and-forget: a failed or blocked beacon (ad blockers commonly catch
// analytics calls) must never affect the page it's sitting on, so every
// failure is swallowed silently.
(function () {
  var DASHBOARD_ORIGIN = 'https://glow-dashboard.vercel.app';
  var KEY = 'glow-session-id';

  function sessionId() {
    try {
      var id = sessionStorage.getItem(KEY);
      if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      return 'no-storage';
    }
  }

  try {
    fetch(DASHBOARD_ORIGIN + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId(),
        path: location.pathname,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(function () {});
  } catch (e) {}
})();
