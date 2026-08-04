// ===================== Glow Research — account =====================
// Real accounts, backed by WooCommerce customer records through /api/*.
//
// The session itself is an HttpOnly cookie set by the server, which this file
// deliberately cannot read — that is the point of HttpOnly. The localStorage
// flag below mirrors it for one job only: deciding whether the header says
// "Sign In" or "Account". It grants nothing. Every endpoint re-checks the
// cookie server-side, so a forged flag gets an empty page and a 401.
//
// Still sample data: the affiliate/partner panel. There is no backend for
// referrals yet, and it is marked as such in the UI.
(function () {
  var SESSION = 'glow-session';

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // UI hint only — see the note above.
  function session() {
    var raw = read(SESSION);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  // depth-aware link, same reasoning as the age gate: this file is shared and
  // may one day be pulled in from a nested page
  function root() {
    var segs = location.pathname.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    var depth = /\.html?$/i.test(last) ? segs.length - 1 : segs.length;
    return depth > 0 ? new Array(depth + 1).join('../') : '';
  }

  /* The referral figures below are still sample data — there is no referral
     backend yet. Orders, points and tracking are real and come from /api/me. */
  var SAMPLE = {
    referral: { code: 'GLOW-R4417', rate: 10, clicks: 84, signups: 11, orders: 6, earned: 128.40, pending: 42.10 },
  };

  /* Points earn at 1 per $1 and redeem at 100 per $1 off — a flat 1% back.
     The redemption rate is whatever the API says it is, so the tiers below
     are derived from it rather than hardcoded alongside it: change the rate
     server-side and these follow, instead of quietly disagreeing. */
  var REDEEM_RATE = 100;
  var REWARD_DOLLARS = [5, 10, 25];

  function rewards() {
    return REWARD_DOLLARS.map(function (d) {
      return { cost: d * REDEEM_RATE, dollars: d, label: '$' + d + ' off any order' };
    });
  }

  // what a balance is worth, rounded down to whole dollars. Formatted without
  // cents because it is always a whole number — "$13.00" is just noise.
  function pointsValue(points) {
    return Math.floor(points / REDEEM_RATE);
  }
  function pointsValueText(points) {
    return '$' + pointsValue(points).toLocaleString();
  }

  var money = function (n) { return '$' + n.toFixed(2); };
  var when = function (iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ================= sign-in page ================= */
  function initSignIn() {
    var form = document.getElementById('siForm');
    if (!form) return;

    // ?next=affiliate lands them on the affiliate tab once they are in, so the
    // "become an affiliate" journey doesn't dump people on the Overview panel
    var next = new URLSearchParams(location.search).get('next');
    var dest = root() + 'account.html' +
      (next && /^[a-z]+$/.test(next) ? '#' + next : '');

    // already signed in? go straight through
    if (session()) { location.replace(dest); return; }

    var tabs = document.querySelectorAll('.si-tab');
    var nameField = document.getElementById('siNameField');
    var agreeField = document.getElementById('siAgreeField');
    var agreeBox = document.getElementById('siAgree');
    var submit = document.getElementById('siSubmit');
    var mode = 'in';

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        mode = t.dataset.mode;
        tabs.forEach(function (x) {
          var on = x === t;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        nameField.hidden = mode !== 'up';
        document.getElementById('siName').required = mode === 'up';
        // only account creation needs the RUO/Terms acknowledgement — signing
        // back in to an existing account already accepted it once
        agreeField.hidden = mode !== 'up';
        agreeBox.required = mode === 'up';
        submit.textContent = mode === 'up' ? 'Create account' : 'Sign in';

        // tell the password manager which one it is looking at, and only show
        // the length rule where it applies
        var pass = document.getElementById('siPassword');
        var hint = document.getElementById('siPassHint');
        pass.setAttribute('autocomplete', mode === 'up' ? 'new-password' : 'current-password');
        if (hint) hint.hidden = mode !== 'up';
        var m = document.getElementById('siMsg');
        if (m) { m.hidden = true; m.textContent = ''; }
      });
    });

    var msg = document.getElementById('siMsg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (mode === 'up' && !agreeBox.checked) { agreeBox.reportValidity(); return; }

      var email = document.getElementById('siEmail').value.trim();
      var password = document.getElementById('siPassword').value;
      var name = mode === 'up' ? document.getElementById('siName').value.trim() : '';

      submit.disabled = true;
      if (msg) { msg.hidden = false; msg.textContent = mode === 'up' ? 'Creating your account…' : 'Signing in…'; }

      api('/api/auth', { action: mode === 'up' ? 'signup' : 'login', email: email, password: password, name: name })
        .then(function (user) {
          // mirrors the real cookie for the header label only
          write(SESSION, JSON.stringify({ email: user.email, name: user.name }));
          location.href = dest;
        })
        .catch(function (err) {
          submit.disabled = false;
          if (msg) { msg.hidden = false; msg.textContent = err.message; }
        });
    });
  }

  /* ================= account dashboard ================= */
  function initAccount() {
    var shell = document.getElementById('acShell');
    if (!shell) return;

    var s = session();
    // The flag is only a hint; /api/me is what actually decides. Redirect early
    // when it is absent purely to avoid a pointless request.
    if (!s) { location.replace(root() + 'signin.html'); return; }

    document.getElementById('acWho').textContent = s.name || 'Researcher';
    document.getElementById('acEmail').textContent = s.email || '—';

    document.getElementById('acOrders').innerHTML = '<p class="ac-msg">Loading your orders…</p>';

    api('/api/me')
      .then(function (data) {
        document.getElementById('acWho').textContent = data.name || 'Researcher';
        document.getElementById('acEmail').textContent = data.email || '—';
        write(SESSION, JSON.stringify({ email: data.email, name: data.name }));

        // the server owns the rate; only fall back if it did not send one
        if (data.pointsPerDollarRedeemed > 0) REDEEM_RATE = data.pointsPerDollarRedeemed;

        renderOverview(data);
        renderOrders(data);
        renderRewards(data);
      })
      .catch(function (err) {
        // the cookie is gone or was never valid — the flag lied, so clear it
        if (/not signed in/i.test(err.message)) {
          drop(SESSION);
          location.replace(root() + 'signin.html');
          return;
        }
        document.getElementById('acOrders').innerHTML =
          '<p class="ac-msg">' + err.message + '</p>';
      });

    renderAffiliate(SAMPLE);

    // panel switching
    var navBtns = document.querySelectorAll('.ac-nav-btn');
    function show(target) {
      navBtns.forEach(function (b) {
        var on = b.dataset.panel === target;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.ac-panel').forEach(function (p) {
        p.hidden = p.dataset.panel !== target;
      });
    }
    navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { show(btn.dataset.panel); });
    });

    // deep link: affiliate.html sends people straight to their affiliate tab
    var hash = (location.hash || '').replace('#', '');
    if (hash && document.querySelector('.ac-panel[data-panel="' + hash + '"]')) show(hash);

    document.getElementById('acSignOut').addEventListener('click', function () {
      drop(SESSION);
      // clear the real session too — dropping the local flag only changes the
      // header label, it does not sign anyone out
      var go = function () { location.href = root() + 'index.html'; };
      api('/api/logout').then(go, go);
    });
  }

  function renderOverview(d) {
    document.getElementById('acPoints').textContent = d.points.toLocaleString();
    document.getElementById('acLifetime').textContent = d.lifetime.toLocaleString();
    document.getElementById('acOrderCount').textContent = d.orders.length;

    // next reward the balance has not reached yet
    var next = rewards().find(function (r) { return r.cost > d.points; });
    var bar = document.getElementById('acProgress');
    var note = document.getElementById('acProgressNote');
    if (next) {
      bar.style.width = Math.min(100, (d.points / next.cost) * 100) + '%';
      note.textContent = (next.cost - d.points).toLocaleString() + ' points to ' + next.label;
    } else {
      bar.style.width = '100%';
      note.textContent = 'Every reward unlocked';
    }

    // a balance means nothing without its cash value, which is the whole
    // point of a 100-to-1 scheme
    var worth = document.getElementById('acPointsWorth');
    if (worth) {
      worth.textContent = d.points > 0
        ? 'Worth ' + pointsValueText(d.points) + ' off'
        : 'Earn 1 point per $1 spent';
    }
  }

  // anything interpolated below comes from the store, so escape it rather than
  // trusting that a product or status string never contains a bracket
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderOrders(d) {
    var box = document.getElementById('acOrders');

    if (!d.orders.length) {
      box.innerHTML = '<p class="ac-msg">No orders yet. Anything you order will show up here ' +
        'with its tracking as soon as it ships.</p>';
      return;
    }

    box.innerHTML = d.orders.map(function (o) {
      var lines = o.items.map(function (i) {
        return '<li><span>' + esc(i.name) + (i.qty > 1 ? ' × ' + i.qty : '') + '</span></li>';
      }).join('');

      // tracking replaces the total once there is a number to click; before
      // that the total is the more useful thing to show
      var right = o.track
        ? '<a class="ac-track" href="https://www.fedex.com/fedextrack/?trknbr=' +
          esc(o.track.replace(/\s/g, '')) + '" target="_blank" rel="noopener">Track ' +
          '<span aria-hidden="true">&rarr;</span></a>'
        : '<span class="ac-total">' + money(o.total) + '</span>';

      return '' +
        '<article class="ac-order">' +
          '<header class="ac-order-head">' +
            '<div>' +
              '<span class="ac-order-id">#' + esc(o.id) + '</span>' +
              '<span class="ac-order-date">' + when(o.date) + '</span>' +
            '</div>' +
            '<span class="ac-status ac-status--' + esc(o.status.toLowerCase().replace(/\s/g, '-')) + '">' +
              esc(o.status) + '</span>' +
          '</header>' +
          '<ul class="ac-order-items">' + lines + '</ul>' +
          '<footer class="ac-order-foot">' +
            '<span class="ac-order-coa">COA available for every lot shipped</span>' + right +
          '</footer>' +
        '</article>';
    }).join('');
  }

  function renderRewards(d) {
    document.getElementById('acRewardBalance').textContent = d.points.toLocaleString();
    var box = document.getElementById('acRewards');

    var sub = document.getElementById('acRewardWorth');
    if (sub) sub.textContent = pointsValueText(d.points) + ' of rewards available';

    var list = rewards();
    box.innerHTML = list.map(function (r, i) {
      var ready = d.points >= r.cost;
      return '' +
        '<div class="ac-reward' + (ready ? ' is-ready' : '') + '">' +
          '<div class="ac-reward-main">' +
            '<span class="ac-reward-label">' + r.label + '</span>' +
            '<span class="ac-reward-cost">' + r.cost.toLocaleString() + ' points</span>' +
          '</div>' +
          '<button type="button" class="btn ' + (ready ? 'btn-primary' : 'btn-outline') + ' ac-reward-btn"' +
            (ready ? ' data-reward="' + i + '"' : ' disabled') + '>' +
            (ready ? 'Redeem' : (r.cost - d.points).toLocaleString() + ' to go') +
          '</button>' +
        '</div>';
    }).join('');

    // Automatic redemption is not built — it needs a coupon applied at
    // checkout. Rather than leave a button that silently does nothing, it
    // hands over the one thing support needs to do it by hand.
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-reward]');
      if (!btn) return;
      var r = list[+btn.dataset.reward];
      var note = document.getElementById('acRedeemNote');
      if (!note) return;
      note.hidden = false;
      note.innerHTML = 'To claim <strong>' + r.label + '</strong>, email ' +
        '<a href="mailto:support@glowresearch.shop?subject=' +
        encodeURIComponent('Redeem ' + r.cost + ' points — ' + r.label) +
        '">support@glowresearch.shop</a> and we will apply it to your next order. ' +
        'Redeeming from this page is not automatic yet.';
      note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /* ================= affiliate =================
     Three states rather than one. Being a customer and being an affiliate are
     different things, so the panel has to know which one it is looking at:

       none      not applied — the pitch and the application form
       pending   applied, waiting on review
       approved  link, stats, payouts

     Status lives on the session here because there is no backend; a real
     implementation reads it off the account and never trusts the client,
     since "approved" is what unlocks getting paid. */
  var AFF_KEY = 'glow-aff-status';
  function affStatus() { return read(AFF_KEY) || 'none'; }

  function renderAffiliate(d) {
    var body = document.getElementById('acAffBody');
    var sub = document.getElementById('acAffSub');
    if (!body) return;
    var st = affStatus();

    if (st === 'approved') { affApproved(d, body, sub); return; }
    if (st === 'pending') { affPending(body, sub); return; }
    affApply(body, sub);
  }

  function affApply(body, sub) {
    sub.textContent = 'Earn commission referring qualified research buyers. Applications are reviewed by hand.';
    body.innerHTML = '' +
      '<div class="ac-card">' +
        '<div class="ac-stats" style="margin-bottom:18px">' +
          '<div class="ac-stat"><b>10%</b><span>Starting commission</span></div>' +
          '<div class="ac-stat"><b>60 days</b><span>Attribution window</span></div>' +
          '<div class="ac-stat"><b>Monthly</b><span>Payouts</span></div>' +
        '</div>' +
        '<form id="acAffForm">' +
          '<div class="si-field"><label for="acAffSite">Where you will share</label>' +
            '<input type="url" id="acAffSite" required placeholder="https://your-site.com or a channel URL" /></div>' +
          '<div class="si-field"><label for="acAffAudience">Audience</label>' +
            '<select id="acAffAudience" required>' +
              '<option value="">Select the closest fit</option>' +
              '<option>Academic or institutional researchers</option>' +
              '<option>Independent research lab</option>' +
              '<option>Lab supply or equipment reseller</option>' +
              '<option>Scientific publication or newsletter</option>' +
              '<option>Other</option>' +
            '</select></div>' +
          '<div class="si-field"><label for="acAffReach">Monthly reach</label>' +
            '<select id="acAffReach" required>' +
              '<option value="">Select a range</option>' +
              '<option>Under 1,000</option><option>1,000 to 10,000</option>' +
              '<option>10,000 to 50,000</option><option>50,000 or more</option>' +
            '</select></div>' +
          '<label class="ac-agree">' +
            '<input type="checkbox" id="acAffAgree" required />' +
            '<span>I have read the <a href="affiliate.html">programme rules</a> and agree not to make ' +
            'therapeutic claims, publish dosing guidance, or promote these products for human use.</span>' +
          '</label>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:18px">Submit application</button>' +
        '</form>' +
      '</div>';

    document.getElementById('acAffForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!document.getElementById('acAffAgree').checked) return;
      write(AFF_KEY, 'pending');
      renderAffiliate(SAMPLE);
    });
  }

  function affPending(body, sub) {
    sub.textContent = 'Your application is with us.';
    body.innerHTML = '' +
      '<div class="ac-card">' +
        '<h2>Under review</h2>' +
        '<p class="ac-bar-note">We review every application by hand and answer within one ' +
        'business day. You will get an email at the address on this account, and your link ' +
        'and dashboard appear here once you are approved.</p>' +
      '</div>' +
      '<p class="ac-note"><strong>Sample flow.</strong> Applications are not being received ' +
      'automatically yet — email support@glowresearch.shop and we will set you up.</p>';
  }

  function affApproved(d, body, sub) {
    var r = d.referral;
    sub.innerHTML = 'Share your link. You earn <strong>' + r.rate + '%</strong> of every order it brings in.';
    body.innerHTML = '' +
      '<div class="ac-card">' +
        '<label class="ac-eyebrow" for="acRefLink">Your referral link</label>' +
        '<div class="ac-ref-row">' +
          '<input type="text" id="acRefLink" readonly aria-label="Your referral link" />' +
          '<button type="button" class="btn btn-primary" id="acRefCopy">Copy</button>' +
        '</div>' +
        '<div class="ac-stats">' +
          '<div class="ac-stat"><b>' + r.clicks + '</b><span>Clicks</span></div>' +
          '<div class="ac-stat"><b>' + r.signups + '</b><span>Sign-ups</span></div>' +
          '<div class="ac-stat"><b>' + r.orders + '</b><span>Orders</span></div>' +
          '<div class="ac-stat"><b>' + money(r.earned) + '</b><span>Paid out</span></div>' +
          '<div class="ac-stat"><b>' + money(r.pending) + '</b><span>Pending</span></div>' +
        '</div>' +
      '</div>' +
      '<p class="ac-note"><strong>Research buyers only.</strong> Referral links may not be ' +
      'promoted with claims of human benefit, dosing guidance, or any therapeutic use. ' +
      'Accounts doing so are closed and commission is withheld.</p>';

    var input = document.getElementById('acRefLink');
    input.value = location.origin + '/?ref=' + r.code;

    var btn = document.getElementById('acRefCopy');
    btn.addEventListener('click', function () {
      input.select();
      var done = function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
      };
      // clipboard API needs a secure context; select() above is the fallback
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, done);
      else { try { document.execCommand('copy'); } catch (e) {} done(); }
    });
  }

  /* ================= header state ================= */
  // the nav's Sign In turns into Account once there is a session
  function initHeaderLink() {
    var link = document.querySelector('.nav-signin');
    if (!link) return;
    var s = session();
    link.setAttribute('href', root() + (s ? 'account.html' : 'signin.html'));
    var label = link.querySelector('.nav-signin-label');
    if (label && s) label.textContent = 'Account';
  }

  function boot() { initHeaderLink(); initSignIn(); initAccount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
