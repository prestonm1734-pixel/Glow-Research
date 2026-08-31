// The one place that answers "who is this visitor, as far as Meta is
// concerned". Loaded before js/meta-pixel.js and js/analytics.js on every
// page, because both of them need the same answers and must not disagree
// about them: the browser pixel sends them as Advanced Matching at init, and
// the Conversions API relay sends the same values server-side. Two transports,
// one source, the same way js/analytics.js keeps one Meta event mapping for
// both of its own.
//
// Why this file exists at all. Meta scores every event on how well it can tie
// it to a real person ("event match quality"), and an event carrying only an
// IP and a User-Agent scores near the floor. Everything here is a match key
// Meta accepts, gathered from what this site already knows rather than from
// anything new asked of the visitor:
//
//   external_id  a stable per-device ID this site mints. The only match key
//                available for a visitor who has never told us anything, so
//                it is what lifts PageView/ViewContent/AddToCart off the
//                floor. Deliberately the same ID the dashboard already uses
//                as anonId, so one visitor is one person in both systems.
//   fbc / fbp    Meta's click ID and browser ID. See ensureFbCookies below
//                for the part that matters: these are normally set by Meta's
//                own pixel, which means they are missing for exactly the
//                blocked visitors the Conversions API exists to recover.
//   email, phone, name, city, state, zip, country
//                only ever what a customer actually typed or what a signed-in
//                session reports. Never guessed, never defaulted.
//
// Nothing here is hashed. Both consumers hash, at the point they send: Meta's
// pixel hashes Advanced Matching parameters with SHA-256 in the browser
// before they leave it, and api/_meta-capi.js hashes server-side. Holding
// plaintext in this file is what lets a single stored profile serve both.
// Values only ever leave this file toward Meta as a hash, which is what
// privacy.html states.
(function () {
  var VISITOR_KEY = 'glow-visitor-id';   // shared with js/analytics.js — same ID, one visitor
  var NEW_FLAG = 'glow-visitor-new';     // see visitor()
  var PROFILE_KEY = 'glow-identity';
  var SESSION_KEY = 'glow-session';      // written by js/account.js and js/checkout.js on sign-in

  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function readLocal(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  // Device-scoped and stable, which is the whole point: Meta can only use
  // external_id to connect two events if it is the same string both times.
  //
  // isNew is tracked through a session flag rather than "there was no ID in
  // localStorage", because this file now mints the ID before js/analytics.js
  // ever looks. Without the flag, analytics.js would find the ID already
  // present on a genuinely first visit and report every new visitor as
  // returning, quietly breaking the dashboard's new-vs-returning split.
  function visitor() {
    var id = readLocal(VISITOR_KEY);
    var isNew = !id;
    if (!id) {
      id = randomId();
      writeLocal(VISITOR_KEY, id);
      try { sessionStorage.setItem(NEW_FLAG, '1'); } catch (e) {}
    } else {
      try { isNew = sessionStorage.getItem(NEW_FLAG) === '1'; } catch (e) { isNew = false; }
    }
    return { id: id, isNew: isNew };
  }

  // Verbatim, with no decodeURIComponent. Meta compares fbc byte for byte
  // against the click ID it issued, so decoding a value that contains a
  // percent escape changes it into one that matches nothing, which is exactly
  // what Meta's "modified fbclid value in fbc parameter" diagnostic reports.
  // These cookies hold opaque identifiers, never text, so there is nothing
  // here that decoding could legitimately be for.
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? m[1] : '';
  }

  // The query value exactly as it arrived, without the decoding
  // URLSearchParams applies. URLSearchParams turns a "+" into a space and
  // "%3D" into "=", either of which produces a click ID Meta never issued.
  function rawParam(name) {
    var q = location.search;
    if (!q) return '';
    var parts = q.charAt(0) === '?' ? q.slice(1).split('&') : q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq > 0 && parts[i].slice(0, eq) === name) return parts[i].slice(eq + 1);
    }
    return '';
  }

  // 90 days, matching what Meta's own pixel sets these to, so a reconstructed
  // cookie does not expire sooner than the real one would have.
  // Written verbatim rather than percent-encoded, for the same reason the
  // read above does not decode: Meta's own pixel reuses an existing _fbc
  // instead of overwriting it, so an encoded value here becomes an encoded
  // value in the pixel's own event too. A value carrying a character that
  // cannot legally sit in a cookie is not stored at all, since storing a
  // stripped version of a click ID is storing the wrong click ID.
  function setCookie(name, value) {
    if (/[;,\s\\"]/.test(value)) return;
    try {
      document.cookie = name + '=' + value +
        ';path=/;max-age=' + (90 * 24 * 60 * 60) + ';SameSite=Lax' +
        (location.protocol === 'https:' ? ';Secure' : '');
    } catch (e) {}
  }

  // The fix that matters most for blocked traffic.
  //
  // _fbc and _fbp are written by Meta's pixel. When the pixel is blocked --
  // ad blocker, tracking prevention, a corporate DNS blocklist -- neither
  // cookie is ever created, so the Conversions API relay that was supposed to
  // rescue that visitor sends an event with no click ID and no browser ID
  // attached. The event arrives, and it is close to unmatchable.
  //
  // Both values are formats this site can produce itself, so it does:
  //   fbc  fb.1.<creation ms>.<fbclid>, built from the fbclid on the landing
  //        URL. This is the single strongest signal there is, because it names
  //        the exact ad click, and it is sitting in the query string of a page
  //        we are already running on.
  //   fbp  fb.1.<creation ms>.<random>, a browser ID. Meta does not care who
  //        minted it, only that the same value comes back on later events.
  // The "1" is the subdomain index for an apex domain like glowresearch.shop.
  //
  // Written to the real cookie names on purpose rather than kept privately:
  // Meta's pixel reads an existing _fbc/_fbp and reuses it instead of
  // overwriting, so doing it this way means the pixel copy and the server copy
  // of an event carry identical IDs. A private store would guarantee they
  // differed for every visitor who has the pixel blocked on one page and not
  // the next.
  function ensureFbCookies() {
    if (!cookie('_fbp')) {
      setCookie('_fbp', 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10));
    }
    if (!cookie('_fbc')) {
      var fbclid = rawParam('fbclid');
      // Only from a real click ID. With no fbclid there is nothing to encode,
      // and a made-up one would be a claim about an ad click that never
      // happened.
      if (fbclid) setCookie('_fbc', 'fb.1.' + Date.now() + '.' + fbclid);
    }
  }

  // Whatever the customer has actually told us, persisted so an email typed at
  // checkout still counts on the next page view and on the purchase. Only ever
  // written by setProfile() below, and only ever from a real form field or a
  // real signed-in session.
  function stored() {
    try {
      var raw = readLocal(PROFILE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  // js/account.js and js/checkout.js both write glow-session on sign-in, and
  // it is the one identity that is true before the visitor types anything on
  // this page. Folded in here rather than requiring every page to call
  // setProfile() after a session check, so a signed-in visitor's very first
  // PageView already carries an email.
  function fromSession() {
    try {
      var raw = readLocal(SESSION_KEY);
      if (!raw) return {};
      var s = JSON.parse(raw);
      var out = {};
      if (s && s.email) out.email = s.email;
      // glow-session stores a display name, not first/last fields. Split on
      // the first space, which is right for the overwhelming majority and
      // wrong in a way that costs nothing: a mis-split name is one weak match
      // key among several, not a claim shown to anyone.
      if (s && s.name) {
        var parts = String(s.name).trim().split(/\s+/);
        if (parts[0]) out.firstName = parts[0];
        if (parts.length > 1) out.lastName = parts[parts.length - 1];
      }
      return out;
    } catch (e) { return {}; }
  }

  var FIELDS = ['email', 'phone', 'firstName', 'lastName', 'city', 'state', 'zip', 'country'];

  function profile() {
    var p = {};
    var session = fromSession();
    var saved = stored();

    // Two people, one browser. If a signed-in session reports a different
    // email than the one saved on this device, the saved profile belongs to
    // whoever was here before, and every field in it is now a claim about
    // the wrong person. Dropped rather than merged: sending the previous
    // customer's name and address to Meta as this one's would be worse than
    // sending nothing, both as a match signal and as a thing to have done
    // with someone's data.
    if (session.email && saved.email &&
        session.email.trim().toLowerCase() !== saved.email.trim().toLowerCase()) {
      saved = {};
      try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
    }

    FIELDS.forEach(function (f) {
      // A value typed on this device wins over the session's copy: someone
      // shipping to a different name and address than their account holds is
      // telling us the fresher fact.
      var v = saved[f] || session[f] || '';
      if (typeof v === 'string' && v.trim()) p[f] = v.trim();
    });
    return p;
  }

  // Called as soon as any of these becomes known: js/checkout.js on field
  // input, js/account.js on sign-in. Empty and whitespace values are dropped
  // rather than stored, so a field the visitor cleared does not overwrite a
  // good value with nothing.
  function setProfile(fields) {
    if (!fields || typeof fields !== 'object') return;
    var next = stored();
    var changed = false;
    FIELDS.forEach(function (f) {
      var v = fields[f];
      if (typeof v !== 'string') return;
      v = v.trim();
      if (!v || next[f] === v) return;
      next[f] = v;
      changed = true;
    });
    if (!changed) return;
    writeLocal(PROFILE_KEY, JSON.stringify(next));
    // js/meta-pixel.js listens, so the pixel re-inits with the richer identity
    // rather than staying on whatever was known when the page loaded.
    try { document.dispatchEvent(new CustomEvent('glow-identity-change')); } catch (e) {}
  }

  // Shaped for fbq('init', id, {...}). Meta's own parameter names, and Meta's
  // pixel hashes every one of them before it sends them.
  //
  // ct/st/zp/country are only present when a customer typed an address. There
  // is no default country here even though this store only ships to the US:
  // asserting a location for a visitor whose location we do not know is a
  // claim we cannot support, and a wrong one lowers match quality rather than
  // raising it.
  function advancedMatching() {
    var p = profile();
    var am = { external_id: visitor().id };
    if (p.email) am.em = p.email;
    if (p.phone) am.ph = p.phone;
    if (p.firstName) am.fn = p.firstName;
    if (p.lastName) am.ln = p.lastName;
    if (p.city) am.ct = p.city;
    if (p.state) am.st = p.state;
    if (p.zip) am.zp = p.zip;
    if (p.country) am.country = p.country;
    return am;
  }

  // Shaped for the body api/meta-event.js accepts. Same facts as
  // advancedMatching(), named the way the server endpoint reads them, with
  // fbc/fbp added: the pixel picks those up from the cookies itself, the
  // server has to be handed them.
  function matchPayload() {
    var p = profile();
    return {
      externalId: visitor().id,
      fbc: cookie('_fbc') || null,
      fbp: cookie('_fbp') || null,
      email: p.email || null,
      phone: p.phone || null,
      firstName: p.firstName || null,
      lastName: p.lastName || null,
      city: p.city || null,
      state: p.state || null,
      zip: p.zip || null,
      country: p.country || null,
    };
  }

  // Runs before anything reads a cookie below, so the first event of the visit
  // already carries both IDs rather than picking them up from the second page.
  //
  // Gated on META_PIXEL_ID for the same reason js/meta-pixel.js is: with no
  // pixel configured, privacy.html states that this site sets no advertising
  // cookies, and writing _fbc/_fbp anyway would make that false. The flag is
  // the one switch, here as everywhere else.
  if (typeof META_PIXEL_ID !== 'undefined' && META_PIXEL_ID) ensureFbCookies();

  // Signing out has to take the identity with it. Without this, the next
  // person on a shared machine keeps sending the previous one's hashed email
  // to Meta on every page they open. The device ID is deliberately left
  // alone: it identifies the browser, not the person, and the dashboard's
  // new-vs-returning counts are built on it surviving.
  function clearProfile() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('glow-identity-change')); } catch (e) {}
  }

  window.GlowIdentity = {
    visitor: visitor,
    profile: profile,
    setProfile: setProfile,
    clearProfile: clearProfile,
    advancedMatching: advancedMatching,
    matchPayload: matchPayload,
    fbc: function () { return cookie('_fbc') || ''; },
    fbp: function () { return cookie('_fbp') || ''; },
  };
})();
