// Beacons page views and funnel events to the internal dashboard (a separate
// repo, glow-dashboard), so "who's on the site right now", "where do people
// drop off", and "which campaign brought them" all reflect real traffic.
// Fire-and-forget: a failed or blocked beacon (ad blockers commonly catch
// analytics calls) must never affect the page it's sitting on, so every
// failure is swallowed silently. window.GlowAnalytics.track() is the hook
// other scripts use for events that aren't a page navigation, e.g.
// js/cart.js on an add.
(function () {
  var DASHBOARD_ORIGIN = 'https://glow-dashboard-ruby.vercel.app';
  var SESSION_KEY = 'glow-session-id';
  var VISITOR_KEY = 'glow-visitor-id';
  var CTX_KEY = 'glow-session-ctx';

  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Session-scoped: one per tab lifetime, matches what the live map groups
  // "who's on the site right now" by.
  function sessionId() {
    try {
      var id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = randomId();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      return 'no-storage';
    }
  }

  // Device-scoped: persists across sessions in localStorage, so "new vs
  // returning" and cohort/repeat-visit questions can be answered without any
  // name or email. isNew is only true the one time this ID is minted.
  function visitor() {
    try {
      var id = localStorage.getItem(VISITOR_KEY);
      var isNew = !id;
      if (!id) {
        id = randomId();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return { id: id, isNew: isNew };
    } catch (e) {
      return { id: 'no-storage', isNew: false };
    }
  }

  // Landing page, referrer, and UTM parameters only exist on the URL that
  // started the session, not on every page after it, so they are captured
  // once per session and reused on every event fired from here on.
  function sessionContext(isNewVisitor) {
    try {
      var raw = sessionStorage.getItem(CTX_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through and rebuild */ }

    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    var get = function (k) { return (params && params.get(k)) || ''; };

    var ctx = {
      newVisitor: isNewVisitor,
      landingPage: location.pathname,
      referrer: document.referrer || '',
      utmSource: get('utm_source'),
      utmMedium: get('utm_medium'),
      utmCampaign: get('utm_campaign'),
      utmContent: get('utm_content'),
      utmTerm: get('utm_term'),
    };
    try { sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx)); } catch (e) { /* private mode */ }
    return ctx;
  }

  function track(eventType, properties) {
    try {
      var v = visitor();
      var ctx = sessionContext(v.isNew);
      fetch(DASHBOARD_ORIGIN + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId(),
          anonId: v.id,
          newVisitor: ctx.newVisitor,
          path: location.pathname,
          referrer: ctx.referrer || null,
          landingPage: ctx.landingPage,
          utmSource: ctx.utmSource || null,
          utmMedium: ctx.utmMedium || null,
          utmCampaign: ctx.utmCampaign || null,
          utmContent: ctx.utmContent || null,
          utmTerm: ctx.utmTerm || null,
          eventType: eventType,
          properties: properties || null,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // Read by js/checkout.js and js/express-pay.js so the PaymentIntent
  // metadata carries the same IDs an order's earlier funnel events used,
  // which is what lets the dashboard tie a completed purchase back to the
  // session that produced it instead of counting orders on their own.
  function ids() {
    return { sessionId: sessionId(), anonId: visitor().id };
  }

  window.GlowAnalytics = { track: track, ids: ids };
  track('pageview');
})();
