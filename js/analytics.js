// Beacons page views and behavioural events to the internal dashboard (a
// separate repo, glow-dashboard), so "who's on the site right now", "where
// do people drop off", and "which campaign brought them" all reflect real
// traffic. Fire-and-forget: a failed or blocked beacon (ad blockers commonly
// catch analytics calls) must never affect the page it's sitting on, so
// every failure is swallowed silently. window.GlowAnalytics.track() is the
// hook other scripts use for events that aren't automatic, e.g. js/cart.js
// on an add; everything in this file's own IIFE below is automatic and needs
// no other script to call it.
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

  // Landing page, referrer, UTM parameters and ad click IDs only exist on the
  // URL that started the session, not on every page after it, so they are
  // captured once per session and reused on every event fired from here on.
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
      // Meta and Google's own click identifiers, present on the landing URL
      // when an ad was clicked through to get here. Read once at landing like
      // the UTMs above, and left null the rest of the time rather than
      // re-read from a URL that no longer carries them.
      fbclid: get('fbclid'),
      gclid: get('gclid'),
    };
    try { sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx)); } catch (e) { /* private mode */ }
    return ctx;
  }

  // Meta sets these two cookies itself once the pixel below has loaded
  // (_fbp always, _fbc only after an ad click carrying fbclid). Read here
  // rather than duplicated: this is the one place any caller — the pixel
  // forward below, or api/create-payment-intent.js via ids() — gets them
  // from, so there is one implementation of "how to read a cookie" in this
  // file, not several slightly different ones.
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // Our own event names mapped to Meta's standard ones, with just enough of
  // each event's own properties translated into the fields Meta's Pixel
  // expects. Not every internal event has a Meta equivalent — pageview is
  // skipped because js/meta-pixel.js already sends its own PageView on load,
  // and everything else (scroll depth, form funnel, errors) has no standard
  // ads event to map to, so it simply never reaches fbq at all.
  function forwardToMeta(eventType, properties, metaEventId) {
    if (typeof window.fbq !== 'function') return;
    var p = properties || {};
    var opts = metaEventId ? { eventID: metaEventId } : undefined;

    if (eventType === 'product_viewed') {
      fbq('track', 'ViewContent', {
        content_ids: p.sku ? [p.sku] : undefined,
        content_type: 'product',
        value: p.price || undefined,
        currency: 'USD',
      }, opts);
    } else if (eventType === 'cart_add') {
      fbq('track', 'AddToCart', {
        content_ids: p.sku ? [p.sku] : undefined,
        content_type: 'product',
        value: p.price || undefined,
        currency: 'USD',
      }, opts);
    } else if (eventType === 'checkout_started') {
      fbq('track', 'InitiateCheckout', { num_items: p.itemCount || undefined }, opts);
    } else if (eventType === 'purchase_completed') {
      fbq('track', 'Purchase', { value: p.revenue || 0, currency: 'USD' }, opts);
    }
  }

  // metaEventId is only ever passed by the purchase call sites (js/checkout.js,
  // js/express-pay.js), set to the Stripe PaymentIntent ID — the one value
  // both this browser call and the server-side Conversions API call for the
  // same purchase already agree on, which is what lets Meta deduplicate the
  // two into one event instead of double-counting a sale.
  function track(eventType, properties, metaEventId) {
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
          fbclid: ctx.fbclid || null,
          gclid: ctx.gclid || null,
          eventType: eventType,
          properties: properties || null,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
    try { forwardToMeta(eventType, properties, metaEventId); } catch (e) {}
  }

  // Read by js/checkout.js and js/express-pay.js so the PaymentIntent
  // metadata carries the same IDs an order's earlier funnel events used,
  // which is what lets the dashboard tie a completed purchase back to the
  // session that produced it instead of counting orders on their own, and
  // separately lets api/_meta-capi.js send fbc/fbp along with the
  // server-side Purchase event for better match quality with Meta.
  function ids() {
    return {
      sessionId: sessionId(),
      anonId: visitor().id,
      fbc: cookie('_fbc') || null,
      fbp: cookie('_fbp') || null,
    };
  }

  // Assigns and remembers a variant for a named experiment, stable for this
  // visitor rather than re-rolled on every page. No experiment reads this
  // yet — it is the assignment primitive, not a running test — a caller
  // wires one up by naming a set of variants here and passing the result in
  // whatever it calls track() with. Hashing anonId rather than picking
  // randomly each call is what makes the assignment stable across pages
  // without needing a server round trip to remember it.
  function variant(experimentName, variants) {
    var key = 'glow-exp-' + experimentName;
    try {
      var stored = localStorage.getItem(key);
      if (stored && variants.indexOf(stored) !== -1) return stored;
    } catch (e) { /* fall through to a fresh assignment, held only for this call */ }

    var hash = 0;
    var input = visitor().id + experimentName;
    for (var i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    var chosen = variants[Math.abs(hash) % variants.length];
    try { localStorage.setItem(key, chosen); } catch (e) {}
    return chosen;
  }

  window.GlowAnalytics = { track: track, ids: ids, variant: variant };
  track('pageview');

  // Content/education pages (about, how-we-test, ruo-agreement, coa, terms)
  // carry a <body data-content-page="..."> the same way a product page
  // carries data-product-slug — a plain HTML attribute rather than a
  // per-page inline script, so tagging a new page is a one-line edit here
  // instead of another <script> block to keep in sync.
  if (document.body.dataset.contentPage) {
    track('content_page_viewed', { page: document.body.dataset.contentPage });
  }

  /* ================= automatic engagement tracking =================
     Everything below fires on its own, on every page, with no other script
     calling in. Kept in the same file as track() rather than a separate one:
     "no dependencies" in js/ means these can never import a shared tracker
     from anywhere else, and this is the one file every page already loads
     for the pageview beacon above.

     Deliberately not attempted here: dead_click. A real dead-click signal
     needs to know whether a click produced any visible effect (DOM change,
     navigation, a request), which this file has no way to observe from a
     bare click listener — flagging clicks by tag name alone (a <div> with a
     click handler this file cannot see) would mostly be wrong. Left out
     rather than shipped as a guess. */

  var loaded = Date.now();
  var firstInteractionSent = false;
  var maxScroll = 0;
  var scrollFired = {};
  var startedForms = Object.create(null);

  function onFirstInteraction() {
    if (firstInteractionSent) return;
    firstInteractionSent = true;
    track('time_to_first_interaction', { ms: Date.now() - loaded });
  }
  ['click', 'keydown', 'scroll'].forEach(function (evt) {
    document.addEventListener(evt, onFirstInteraction, { once: true, passive: true, capture: true });
  });

  function scrollDepthPct() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    if (scrollable <= 0) return 100;
    return Math.min(100, Math.round((window.scrollY / scrollable) * 100));
  }
  var SCROLL_MARKS = [25, 50, 75, 90, 100];
  window.addEventListener('scroll', function () {
    var pct = scrollDepthPct();
    if (pct > maxScroll) maxScroll = pct;
    SCROLL_MARKS.forEach(function (mark) {
      if (pct >= mark && !scrollFired[mark]) {
        scrollFired[mark] = true;
        track('scroll_' + mark);
      }
    });
  }, { passive: true });

  // Outbound vs. internal nav, judged by hostname, not by rewriting every
  // link on the site with a tracking attribute.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return;
    var isOutbound;
    try { isOutbound = new URL(a.href, location.href).hostname !== location.hostname; }
    catch (e2) { isOutbound = false; }
    if (isOutbound) {
      track('outbound_click', { href: a.href, text: (a.textContent || '').trim().slice(0, 80) });
    } else if (a.closest('#mainNav')) {
      track('navigation_click', { href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 80) });
    }
  }, true);

  // CTAs are whatever already carries the site's own button classes, not a
  // second attribute someone has to remember to add on top. cta_viewed fires
  // once per element the first time it's at least half on screen.
  var ctaSeen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.btn, button[type="submit"]');
    if (!btn) return;
    track('cta_clicked', {
      text: (btn.textContent || '').trim().slice(0, 80),
      href: btn.getAttribute && btn.getAttribute('href') || null,
    });
  }, true);
  if (typeof IntersectionObserver !== 'undefined' && ctaSeen) {
    var ctaObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || ctaSeen.has(entry.target)) return;
        ctaSeen.add(entry.target);
        ctaObserver.unobserve(entry.target);
        track('cta_viewed', { text: (entry.target.textContent || '').trim().slice(0, 80) });
      });
    }, { threshold: 0.5 });
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('.btn-primary').forEach(function (el) { ctaObserver.observe(el); });
    });
  }

  // Three or more clicks on the same element inside 700ms — a real person
  // does not click one button that fast on purpose, which is what makes this
  // worth flagging even as a coarse heuristic (a genuinely broken control,
  // not necessarily frustration).
  var rageTarget = null, rageCount = 0, rageTimer = null;
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (el === rageTarget) {
      rageCount++;
    } else {
      rageTarget = el;
      rageCount = 1;
    }
    clearTimeout(rageTimer);
    rageTimer = setTimeout(function () { rageTarget = null; rageCount = 0; }, 700);
    if (rageCount === 3) {
      track('rage_click', { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 80) });
    }
  }, true);

  // Generic across every <form> on the page: the first field focused starts
  // it, a real submit finishes it, and leaving the page (or the tab going
  // background) with a started-but-unsubmitted form counts as abandoned.
  // No form field values are ever read, only which form and whether it went
  // anywhere.
  function formLabel(form) {
    return form.id || form.getAttribute('name') || form.className || 'form';
  }
  document.addEventListener('focusin', function (e) {
    var form = e.target.closest && e.target.closest('form');
    if (!form || startedForms[formLabel(form)]) return;
    startedForms[formLabel(form)] = form;
    track('form_started', { form: formLabel(form) });
  });
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    delete startedForms[formLabel(form)];
    track('form_submitted', { form: formLabel(form) });
  });

  function flushAbandonedForms() {
    Object.keys(startedForms).forEach(function (label) {
      track('form_abandoned', { form: label });
    });
    startedForms = Object.create(null);
  }

  // page_exit carries what the session actually did on this page: how far
  // down it scrolled and how long it was the visible tab, not just that it
  // was open. Bounce/engaged-session are left as a dashboard-side query over
  // this figure rather than a threshold baked into shipped JS — a decision
  // about what counts as "engaged" is a business call, easier to change in
  // SQL than in a script cached on every visitor's browser.
  var activeMs = 0, lastResume = document.visibilityState === 'visible' ? Date.now() : null;
  var exitSent = false;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (lastResume) activeMs += Date.now() - lastResume;
      lastResume = null;
      sendExit();
    } else if (document.visibilityState === 'visible') {
      lastResume = Date.now();
      // Tab came back: this is a new stretch of active time, and closing it
      // again (or finally unloading) should send its own page_exit.
      exitSent = false;
    }
  });
  window.addEventListener('pagehide', sendExit);

  // Uncaught exceptions and rejected promises, so "iPhone Safari converts
  // worse than Android Chrome" (if it's true) can be checked against "iPhone
  // Safari also throws twice as often" rather than guessed at. Message and
  // filename only, never the full stack: a stack trace can echo query-string
  // values or other page state into a column with no auth in front of it.
  window.addEventListener('error', function (e) {
    track('js_error', {
      message: (e.message || '').slice(0, 200),
      source: (e.filename || '').replace(location.origin, ''),
      line: e.lineno || null,
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    track('js_error', {
      message: ('' + ((reason && reason.message) || reason)).slice(0, 200),
      source: 'unhandledrejection',
      line: null,
    });
  });

  // Core Web Vitals, read directly off PerformanceObserver rather than the
  // web-vitals library: js/ carries no dependencies, and these three entry
  // types are what that library wraps anyway. Each fires once, the final
  // value for that page view, since retiming a metric that already changed
  // its own weighting mid-visit would make it harder to read, not easier.
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(function (list, obs) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) track('web_vital', { name: 'LCP', value: Math.round(last.startTime) });
        obs.disconnect();
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    try {
      var clsValue = 0;
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        });
      }).observe({ type: 'layout-shift', buffered: true });
      window.addEventListener('pagehide', function () {
        track('web_vital', { name: 'CLS', value: Math.round(clsValue * 1000) / 1000 });
      }, { once: true });
    } catch (e) {}

    try {
      new PerformanceObserver(function (list, obs) {
        var first = list.getEntries()[0];
        if (first) track('web_vital', { name: 'FID', value: Math.round(first.processingStart - first.startTime) });
        obs.disconnect();
      }).observe({ type: 'first-input', buffered: true });
    } catch (e) {}
  }

  function sendExit() {
    if (exitSent) return;
    exitSent = true;
    if (lastResume) { activeMs += Date.now() - lastResume; lastResume = null; }
    flushAbandonedForms();
    track('page_exit', { activeMs: activeMs, scrollDepth: maxScroll });
    activeMs = 0;
  }
})();
