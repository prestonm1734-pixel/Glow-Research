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
  //
  // Owned by js/identity.js, which loads first on every page and needs the
  // same ID to send Meta as external_id. Delegated rather than reimplemented
  // so there is exactly one answer to "which visitor is this": if this file
  // minted its own, the dashboard and the ad account would be counting two
  // different populations off the same browser. The fallback covers only the
  // case where identity.js failed to load at all, and is deliberately not a
  // second copy of the minting logic: a per-page ID is obviously wrong in the
  // data rather than quietly half-right.
  function visitor() {
    if (window.GlowIdentity) return GlowIdentity.visitor();
    return { id: 'no-identity', isNew: false };
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
      // Meta, Google, TikTok and X's own click identifiers, present on the
      // landing URL when an ad was clicked through to get here. Read once at
      // landing like the UTMs above, and left null the rest of the time
      // rather than re-read from a URL that no longer carries them.
      fbclid: get('fbclid'),
      gclid: get('gclid'),
      ttclid: get('ttclid'),
      twclid: get('twclid'),
    };
    try { sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx)); } catch (e) { /* private mode */ }
    return ctx;
  }

  // Meta and TikTok set these cookies themselves once their pixels have
  // loaded (_fbp/_ttp always, _fbc only after an ad click carrying fbclid).
  // Read here rather than duplicated: this is the one place any caller — the
  // pixel forwards below, or api/create-payment-intent.js via ids() — gets
  // them from, so there is one implementation of "how to read a cookie" in
  // this file, not several slightly different ones.
  // Verbatim, no decodeURIComponent: every cookie read here holds an opaque
  // advertising identifier that the platform compares byte for byte against
  // the one it issued. Decoding a percent escape inside one produces an ID
  // that matches nothing. See the same note in js/identity.js.
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? m[1] : '';
  }

  // Our own event names mapped to Meta's standard ones, with just enough of
  // each event's own properties translated into the fields Meta expects.
  // Not every internal event has a Meta equivalent: scroll depth, form
  // funnel and errors have no standard ads event to map to, so they simply
  // never reach Meta at all.
  //
  // Returns the mapping rather than sending it, because two things now send
  // the same event and they must not disagree about what it says. The pixel
  // copy goes out through fbq below; the server copy goes out through
  // api/meta-event.js. One mapping, two transports.
  //
  // pageview is absent on purpose: js/meta-pixel.js fires Meta's PageView
  // itself on load, and relayMeta() below pairs with that one directly.
  function metaEventFor(eventType, properties) {
    var p = properties || {};
    if (eventType === 'product_viewed') {
      return { name: 'ViewContent', data: {
        content_ids: p.sku ? [p.sku] : undefined,
        content_type: 'product',
        value: p.price || undefined,
        currency: 'USD',
      } };
    }
    if (eventType === 'cart_add') {
      return { name: 'AddToCart', data: {
        content_ids: p.sku ? [p.sku] : undefined,
        content_type: 'product',
        value: p.price || undefined,
        currency: 'USD',
      } };
    }
    if (eventType === 'checkout_started') {
      return { name: 'InitiateCheckout', data: {
        content_ids: (p.items || []).map(function (i) { return i.sku; }).filter(Boolean),
        content_type: 'product',
        num_items: p.itemCount || undefined,
        value: p.value || undefined,
        currency: 'USD',
      } };
    }
    if (eventType === 'purchase_completed') {
      // The same shape AddToCart and InitiateCheckout already send, so the
      // funnel describes one set of products end to end. The server copy
      // (api/_place-order.js) builds the same fields from the priced order
      // rather than from here, since this one is only as trustworthy as the
      // page it runs on; both carry the same SKUs, which is what matters.
      var bought = (p.items || []).filter(function (i) { return i && i.sku; });
      return { name: 'Purchase', data: {
        content_ids: bought.length ? bought.map(function (i) { return i.sku; }) : undefined,
        content_type: bought.length ? 'product' : undefined,
        contents: bought.length ? bought.map(function (i) {
          return { id: i.sku, quantity: i.qty || 1, item_price: i.price };
        }) : undefined,
        num_items: p.itemCount || undefined,
        order_id: p.orderNumber ? String(p.orderNumber) : undefined,
        value: p.revenue || 0,
        currency: 'USD',
      } };
    }
    return null;
  }

  function forwardToMeta(mapped, metaEventId) {
    if (typeof window.fbq !== 'function') return;
    fbq('track', mapped.name, mapped.data, metaEventId ? { eventID: metaEventId } : undefined);
  }

  // The server-side copy of the same event, posted to our own domain instead
  // of Meta's. connect.facebook.net and facebook.com are on every mainstream
  // blocklist, so the fbq call above is simply gone for a good share of real
  // visitors; this one is same-origin, so it leaves, and api/meta-event.js
  // completes the trip server to server where no extension can reach it.
  //
  // The shared event_id is what makes two copies safe: Meta collapses the
  // pair into one event. Without it this would double every count, which is
  // why api/meta-event.js rejects an event that arrives without one.
  //
  // Purchase is not relayed here even though it maps above. It already goes
  // server-side from api/_place-order.js, off a Stripe PaymentIntent the
  // server verified itself, and a public endpoint that accepted a Purchase
  // would let a stranger post revenue into the ad account. api/meta-event.js
  // enforces the same list; this is the near half of it.
  var RELAYED = { PageView: 1, ViewContent: 1, AddToCart: 1, InitiateCheckout: 1 };

  function relayMeta(name, data, metaEventId) {
    if (!RELAYED[name] || !metaEventId) return;
    try {
      // Every match key js/identity.js holds, on all four of these events
      // rather than only on the purchase. This is what the server copy is
      // scored on: without it the event arrives carrying an IP and a
      // User-Agent, which is the bottom of Meta's match quality scale, and a
      // poorly matched event is worth a fraction of a well matched one to
      // both attribution and optimisation.
      //
      // fbc/fbp come from identity.js rather than straight off the cookie
      // jar because it reconstructs them when Meta's pixel was blocked and
      // never wrote them, which is precisely the visitor this relay exists
      // for. Reading document.cookie here instead would send nothing for
      // them, on exactly the traffic that most needs the server copy.
      var match = window.GlowIdentity ? GlowIdentity.matchPayload() : {};
      var payload = {
        eventName: name,
        eventId: metaEventId,
        eventSourceUrl: location.href,
        customData: data || null,
      };
      Object.keys(match).forEach(function (k) { payload[k] = match[k]; });

      fetch('/api/meta-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // Same mapping as forwardToMeta() above, TikTok's pixel and event names in
  // place of Meta's. eventId is the same Stripe PaymentIntent ID passed to
  // forwardToMeta — TikTok's Events API dedupes on it exactly the same way,
  // via api/_tiktok-capi.js.
  function forwardToTikTok(eventType, properties, eventId) {
    if (typeof window.ttq !== 'function' && !(window.ttq && window.ttq.track)) return;
    var p = properties || {};
    var opts = eventId ? { event_id: eventId } : undefined;
    var contents = p.sku ? [{ content_id: p.sku, content_type: 'product', content_name: p.name }] : undefined;

    if (eventType === 'product_viewed') {
      ttq.track('ViewContent', { contents: contents, value: p.price || undefined, currency: 'USD' }, opts);
    } else if (eventType === 'cart_add') {
      ttq.track('AddToCart', { contents: contents, value: p.price || undefined, currency: 'USD' }, opts);
    } else if (eventType === 'checkout_started') {
      var lineContents = (p.items || []).filter(function (i) { return i.sku; }).map(function (i) {
        return { content_id: i.sku, content_type: 'product', quantity: i.qty || 1, price: i.price || undefined };
      });
      ttq.track('InitiateCheckout', {
        contents: lineContents.length ? lineContents : undefined,
        quantity: p.itemCount || undefined,
        value: p.value || undefined,
        currency: 'USD',
      }, opts);
    } else if (eventType === 'purchase_completed') {
      ttq.track('CompletePayment', { value: p.revenue || 0, currency: 'USD' }, opts);
    }
  }

  // X (Twitter) needs a per-event tracking ID, not just the base Pixel ID —
  // set in X_EVENT_IDS (js/products-data.js) once each named event exists in
  // X Ads Manager's Events Manager. An event with no ID assigned yet is
  // skipped rather than calling twq with nothing to point it at, the same
  // way js/x-pixel.js no-ops entirely while X_PIXEL_ID itself is empty.
  function forwardToX(eventType, properties, eventId) {
    if (typeof window.twq !== 'function') return;
    if (typeof X_EVENT_IDS === 'undefined') return;
    var p = properties || {};
    // twq takes exactly three arguments — conversion_id for dedup rides
    // inside the event data object itself, unlike Meta's/TikTok's separate
    // options argument, so every branch below merges it in rather than
    // passing it alongside.
    var dedup = eventId ? { conversion_id: eventId } : {};
    var xEventId;

    if (eventType === 'product_viewed') xEventId = X_EVENT_IDS.viewContent;
    else if (eventType === 'cart_add') xEventId = X_EVENT_IDS.addToCart;
    else if (eventType === 'checkout_started') xEventId = X_EVENT_IDS.initiateCheckout;
    else if (eventType === 'purchase_completed') xEventId = X_EVENT_IDS.purchase;
    else return;

    if (!xEventId) return; // that event has not been created in X Ads Manager yet

    if (eventType === 'product_viewed' || eventType === 'cart_add') {
      twq('event', xEventId, Object.assign({ content_ids: p.sku ? [p.sku] : undefined, value: p.price || undefined, currency: 'USD' }, dedup));
    } else if (eventType === 'checkout_started') {
      twq('event', xEventId, Object.assign({
        content_ids: (p.items || []).map(function (i) { return i.sku; }).filter(Boolean),
        value: p.value || undefined,
        currency: 'USD',
      }, dedup));
    } else if (eventType === 'purchase_completed') {
      twq('event', xEventId, Object.assign({ value: p.revenue || 0, currency: 'USD' }, dedup));
    }
  }

  // eventId is only ever passed by the purchase call sites (js/checkout.js,
  // js/express-pay.js), set to the Stripe PaymentIntent ID — the one value
  // this browser call and both server-side Conversions API calls (Meta's and
  // TikTok's) for the same purchase already agree on, which is what lets
  // each platform deduplicate its own browser and server events into one
  // instead of double-counting a sale.
  function track(eventType, properties, eventId) {
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
          ttclid: ctx.ttclid || null,
          eventType: eventType,
          properties: properties || null,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
    // One id per event, shared by the pixel copy and the server copy so Meta
    // can pair them. A purchase already has one that both ends agree on (the
    // Stripe PaymentIntent, passed in by the caller); everything else has no
    // natural shared key, so one is minted here, at the single point both
    // transports are dispatched from.
    try {
      var mapped = metaEventFor(eventType, properties);
      if (mapped) {
        var metaId = eventId || randomId();
        forwardToMeta(mapped, metaId);
        relayMeta(mapped.name, mapped.data, metaId);
      }
    } catch (e) {}
    try { forwardToTikTok(eventType, properties, eventId); } catch (e) {}
    try { forwardToX(eventType, properties, eventId); } catch (e) {}
  }

  // Read by js/checkout.js and js/express-pay.js so the PaymentIntent
  // metadata carries the same IDs an order's earlier funnel events used,
  // which is what lets the dashboard tie a completed purchase back to the
  // session that produced it instead of counting orders on their own, and
  // separately lets api/_meta-capi.js, api/_tiktok-capi.js and api/_x-capi.js
  // send fbc/fbp, ttclid/ttp and twclid along with the server-side Purchase
  // event for better match quality with each platform. ttclid/twclid are
  // read from the same landing session context fbclid/gclid come from —
  // unlike Meta's fbc cookie, which is set by the pixel from fbclid
  // automatically, TikTok's and X's APIs want the raw click ID itself
  // rather than deriving it from a cookie.
  function ids() {
    var ctx = sessionContext(false);
    return {
      sessionId: sessionId(),
      // Also what api/_place-order.js sends Meta as external_id on the
      // Purchase event, which is what ties a sale back to the anonymous
      // page views and add-to-carts that led to it. Both paths read it from
      // the PaymentIntent's metadata, so the webhook backstop carries it too
      // even with no browser left to ask.
      anonId: visitor().id,
      // The page the purchase is actually being made on, which is not always
      // the checkout: js/express-pay.js runs the wallet sheet on product
      // pages too, and a sale started there ends there. Both server-side
      // order paths report this to Meta, TikTok and X as the event's source
      // URL, so a wallet purchase from /product/<slug>/ is no longer filed
      // under checkout.html. Query string dropped rather than sent: it can
      // carry the click IDs and UTMs, which have their own fields already and
      // have no business sitting in Stripe metadata.
      sourceUrl: location.origin + location.pathname,
      fbc: (window.GlowIdentity ? GlowIdentity.fbc() : cookie('_fbc')) || null,
      fbp: (window.GlowIdentity ? GlowIdentity.fbp() : cookie('_fbp')) || null,
      ttclid: (ctx && ctx.ttclid) || null,
      ttp: cookie('_ttp') || null,
      twclid: (ctx && ctx.twclid) || null,
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

  // Meta's PageView is sent by js/meta-pixel.js, not by track() above, so its
  // server-side copy is paired here against the id that file minted for it.
  // Loaded before this one on every page, so the id is already there; absent
  // only when META_PIXEL_ID is empty and the pixel no-ops, which is exactly
  // when there is nothing to mirror.
  if (window.GlowMetaPageViewId) relayMeta('PageView', null, window.GlowMetaPageViewId);

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
  // Which third-party scripts are actually on this page. The only clue
  // available for a cross-origin error, since the browser withholds
  // everything else about it.
  function thirdPartyHosts() {
    var seen = {};
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src;
      if (!src || src.indexOf(location.origin) === 0) continue;
      try { seen[new URL(src).host] = 1; } catch (e2) { /* malformed src */ }
    }
    return Object.keys(seen).join(' ');
  }

  // Three different failures arrive on this one event and they were all being
  // filed as the same thing, which is why the dashboard fills up with rows
  // that say "Script error." and nothing else.
  //
  //   resource_load   one of OUR OWN files failed to load at all. Fires on
  //                   the element rather than on window, with no message and
  //                   no line, and only in the capture phase, which is why
  //                   this listener captures. A real defect: the page asked
  //                   for something on this origin and did not get it.
  //   third_party_blocked
  //                   the same event, for a file on somebody else's origin.
  //                   Split out because it is almost never a fault here: it
  //                   is an ad blocker or Safari's tracking prevention
  //                   stopping a pixel, which is what those are for. Filed as
  //                   resource_load it was indistinguishable from a genuine
  //                   404 of ours, and since blocked pixels are constant and
  //                   real 404s are rare, the dashboard's error panel was
  //                   entirely made of them. That is the same burying problem
  //                   cross_origin was split out to solve.
  //
  //                   Recorded rather than dropped: the rate is the
  //                   measurement that justifies the server-side Conversions
  //                   API, since it is the share of traffic the browser
  //                   pixels never see. The host is put in the message so it
  //                   is legible without needing to read the source column.
  //   cross_origin    a script from another origin threw. The browser gives
  //                   "Script error." and deliberately withholds the message,
  //                   the file and the line. This is never our own code:
  //                   everything in js/ is same-origin and reports properly,
  //                   so filing it as a site error buries the real ones.
  //                   Recorded with the third-party hosts present instead,
  //                   which is the only thing there is to go on.
  //   exception       an actual error in our own code, reported as before.
  //
  // All three stay on the js_error event rather than becoming new event
  // types, because the dashboard is a separate repo and a new type would land
  // somewhere nothing reads. kind is what tells them apart.
  //
  // Deliberately not attempted: adding crossorigin="anonymous" to the
  // third-party tags to unmask the real message. That only works if the CDN
  // also sends Access-Control-Allow-Origin, and if it does not, the attribute
  // stops the script loading at all. Trading a working pixel for a better log
  // line is the wrong way round.
  // The advertising pixels, named rather than inferred from the origin.
  //
  // Being third-party is not what makes a failed load unremarkable, which is
  // what an earlier version of this got wrong. js.stripe.com is third-party
  // too, and if it fails to load the checkout does not work: that is the
  // loudest thing this file could possibly report, and an origin test would
  // have quietly filed it as somebody else's problem.
  //
  // What these three have in common is not their origin but their
  // consequence. A blocker stops them on a large share of visits by design,
  // and losing one costs measurement rather than function, because
  // api/_meta-capi.js and its siblings send the same events from the server.
  // Anything not on this list is treated as load-bearing until someone
  // decides otherwise, which is the safer direction to be wrong in.
  var PIXEL_HOSTS = [
    'connect.facebook.net',
    'analytics.tiktok.com',
    'static.ads-twitter.com',
  ];
  function hostOf(url) {
    try { return new URL(url, location.href).host; } catch (e2) { return ''; }
  }
  function isPixelHost(url) {
    // No URL at all cannot be judged, so it is not waved through.
    return !!url && PIXEL_HOSTS.indexOf(hostOf(url)) !== -1;
  }

  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName &&
        /^(SCRIPT|IMG|LINK|VIDEO|SOURCE)$/.test(el.tagName)) {
      var url = el.src || el.href || '';
      var tag = el.tagName.toLowerCase();
      var pixel = isPixelHost(url);
      track('js_error', {
        kind: pixel ? 'third_party_blocked' : 'resource_load',
        message: pixel
          ? tag + ' blocked: ' + hostOf(url)
          : tag + ' failed to load',
        source: url.slice(0, 300),
        line: null,
      });
      return;
    }
    if (!e.filename && /^Script error/.test(e.message || '')) {
      track('js_error', {
        kind: 'cross_origin',
        message: 'Script error. Thrown by a third-party script; the browser withholds the detail.',
        source: thirdPartyHosts(),
        line: null,
      });
      return;
    }
    track('js_error', {
      kind: 'exception',
      message: (e.message || '').slice(0, 200),
      source: (e.filename || '').replace(location.origin, ''),
      line: e.lineno || null,
    });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    track('js_error', {
      kind: 'unhandled_rejection',
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
