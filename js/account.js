// ===================== Glow Research — account =====================
// Real accounts, backed by WooCommerce customer records through /api/*.
//
// The session itself is an HttpOnly cookie set by the server, which this file
// deliberately cannot read — that is the point of HttpOnly. The localStorage
// flag below mirrors it for one job only: deciding whether the header says
// "Sign In" or "Account". It grants nothing. Every endpoint re-checks the
// cookie server-side, so a forged flag gets an empty page and a 401.
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

  /* ring-of-eight-ticks spinner for any button that submits to the network —
     see .btn-label / .btn-spin in css/style.css */
  var SPIN_TICKS = 8;
  function spinHtml() {
    var ticks = '';
    for (var i = 0; i < SPIN_TICKS; i++) {
      var angle = i * (360 / SPIN_TICKS);
      var delay = (i * (0.8 / SPIN_TICKS)).toFixed(3);
      ticks += '<i style="transform:rotate(' + angle + 'deg) translate(0,-5px);animation-delay:-' + delay + 's"></i>';
    }
    return '<span class="btn-spin" aria-hidden="true">' + ticks + '</span>';
  }
  function setBtnBusy(btn, label, busy) {
    if (!btn) return;
    var labelEl = btn.querySelector('.btn-label');
    if (!labelEl) { btn.disabled = !!busy; return; }
    labelEl.style.opacity = '0';
    setTimeout(function () {
      labelEl.innerHTML = (busy ? spinHtml() : '') + '<span>' + label + '</span>';
      labelEl.style.opacity = '1';
    }, 120);
    btn.disabled = !!busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // fmtPrice() (js/products-data.js) is where "$65, not $65.00" is decided.
  var money = fmtPrice;
  var when = function (iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ================= sign-in page ================= */
  function initSignIn() {
    var form = document.getElementById('siForm');
    if (!form) return;

    var params = new URLSearchParams(location.search);
    var dest = root() + 'account.html';

    // already signed in? go straight through
    if (session()) { location.replace(dest); return; }

    // the thank-you page sends people here with ?email= when it already
    // knows this address has an account — filling it in means the one
    // extra step is typing a password, not the address too
    var prefill = params.get('email');
    if (prefill) document.getElementById('siEmail').value = prefill;

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
        setBtnBusy(submit, mode === 'up' ? 'Create account' : 'Sign in', false);

        // tell the password manager which one it is looking at, and only show
        // the length rule where it applies
        var pass = document.getElementById('siPassword');
        var hint = document.getElementById('siPassHint');
        pass.setAttribute('autocomplete', mode === 'up' ? 'new-password' : 'current-password');
        if (hint) hint.hidden = mode !== 'up';
        // a new account has no old password to forget
        var forgot = document.getElementById('siForgot');
        var forgotNote = document.getElementById('siForgotNote');
        if (forgot) forgot.hidden = mode !== 'in';
        if (forgotNote) forgotNote.hidden = true;
        var m = document.getElementById('siMsg');
        if (m) { m.hidden = true; m.textContent = ''; }
      });
    });

    var forgotBtn = document.getElementById('siForgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', function () {
        var note = document.getElementById('siForgotNote');
        var emailField = document.getElementById('siEmail');
        var email = emailField.value.trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          note.hidden = false;
          note.textContent = 'Enter your account email above first, then click "Forgot password?" again.';
          emailField.focus();
          return;
        }

        setBtnBusy(forgotBtn, 'Sending…', true);
        note.hidden = true;

        api('/api/forgot-password', { email: email })
          .then(function (data) {
            note.hidden = false;
            note.textContent = data.message || 'If that email has an account, a reset link is on its way.';
          })
          .catch(function (err) {
            note.hidden = false;
            note.textContent = err.message || 'Could not send a reset link right now. Email support@glowresearch.shop instead.';
          })
          .then(function () { setBtnBusy(forgotBtn, 'Forgot password?', false); });
      });
    }

    var msg = document.getElementById('siMsg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (mode === 'up' && !agreeBox.checked) { agreeBox.reportValidity(); return; }

      var email = document.getElementById('siEmail').value.trim();
      var password = document.getElementById('siPassword').value;
      var name = mode === 'up' ? document.getElementById('siName').value.trim() : '';

      setBtnBusy(submit, mode === 'up' ? 'Creating account…' : 'Signing in…', true);
      if (msg) { msg.hidden = true; msg.textContent = ''; }

      api('/api/auth', { action: mode === 'up' ? 'signup' : 'login', email: email, password: password, name: name })
        .then(function (user) {
          // mirrors the real cookie for the header label only
          write(SESSION, JSON.stringify({ email: user.email, name: user.name }));
          location.href = dest;
        })
        .catch(function (err) {
          setBtnBusy(submit, mode === 'up' ? 'Create account' : 'Sign in', false);
          if (msg) { msg.hidden = false; msg.textContent = err.message; }
        });
    });
  }

  /* ================= reset-password page ================= */
  function initResetPassword() {
    var form = document.getElementById('rpForm');
    if (!form) return;

    var params = new URLSearchParams(location.search);
    var email = (params.get('email') || '').trim();
    var token = params.get('token') || '';

    var emailField = document.getElementById('rpEmail');
    var passField = document.getElementById('rpPassword');
    var pass2Field = document.getElementById('rpPassword2');
    var submit = document.getElementById('rpSubmit');
    var msg = document.getElementById('rpMsg');

    if (email) emailField.value = email;

    // no token in the URL means this was opened directly, not from an
    // emailed link — there is nothing to submit
    if (!email || !token) {
      passField.disabled = true;
      pass2Field.disabled = true;
      submit.disabled = true;
      msg.hidden = false;
      msg.classList.add('is-error');
      msg.textContent = 'This link is missing its reset token. Request a new one from the sign-in page.';
      return;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.classList.remove('is-error');

      if (passField.value.length < 8) {
        msg.hidden = false;
        msg.classList.add('is-error');
        msg.textContent = 'Password must be at least 8 characters.';
        return;
      }
      if (passField.value !== pass2Field.value) {
        msg.hidden = false;
        msg.classList.add('is-error');
        msg.textContent = 'Passwords do not match.';
        return;
      }

      setBtnBusy(submit, 'Setting password…', true);
      msg.hidden = true;

      api('/api/reset-password', { email: email, token: token, password: passField.value })
        .then(function (user) {
          write(SESSION, JSON.stringify({ email: user.email, name: user.name }));
          location.href = root() + 'account.html';
        })
        .catch(function (err) {
          setBtnBusy(submit, 'Set new password', false);
          msg.hidden = false;
          msg.classList.add('is-error');
          msg.textContent = err.message;
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

    // deep link: a URL fragment lands straight on that panel (e.g. #orders)
    var hash = (location.hash || '').replace('#', '');
    if (hash && document.querySelector('.ac-panel[data-panel="' + hash + '"]')) show(hash);

    document.getElementById('acSignOut').addEventListener('click', function () {
      drop(SESSION);
      // The advertising identity too, or the next person to use this browser
      // carries the last one's hashed email to Meta on every page.
      if (window.GlowIdentity) GlowIdentity.clearProfile();
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

      // Tracking replaces the total once there is a number to show; before
      // that the total is the more useful thing.
      //
      // A link only renders when /api/me actually resolved one — from the
      // shipment-tracking plugin, once it is installed, which knows the
      // real carrier and the real URL. Without it, every number used to get
      // sent to FedEx's tracker regardless of which carrier actually shipped
      // it, which resolved for exactly the orders that happened to be FedEx
      // and quietly 404'd for everything else. A number with no confirmed
      // carrier is shown as plain text instead of a guess.
      var right = '<span class="ac-total">' + money(o.total) + '</span>';
      if (o.track && o.track.number) {
        right = o.track.link
          ? '<a class="ac-track" href="' + esc(o.track.link) + '" target="_blank" rel="noopener">Track ' +
            '<span aria-hidden="true">&rarr;</span></a>'
          : '<span class="ac-track-num">' + esc(o.track.number) + '</span>';
      }

      var status = o.status || 'Order placed';
      return '' +
        '<article class="ac-order">' +
          '<header class="ac-order-head">' +
            '<div>' +
              '<span class="ac-order-id">#' + esc(o.id) + '</span>' +
              '<span class="ac-order-date">' + when(o.date) + '</span>' +
            '</div>' +
            // An order with no status throws here and takes the whole orders
            // panel down with it, so the customer sees a raw JS error where
            // their order history should be. One missing field is not worth
            // that, so it falls back to a neutral label.
            '<span class="ac-status ac-status--' + esc(status.toLowerCase().replace(/\s/g, '-')) + '">' +
              esc(status) + '</span>' +
          '</header>' +
          '<ul class="ac-order-items">' + lines + '</ul>' +
          '<footer class="ac-order-foot">' +
            // Wording comes from COA_COPY in js/products-data.js so this and
            // the cart, FAQ and product page cannot drift apart. It upgrades to
            // a per-batch link automatically when COAS_PUBLISHED flips.
            '<span class="ac-order-coa">' + esc(COA_COPY.orderNote) + '</span>' + right +
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
        encodeURIComponent('Redeem ' + r.cost + ' points: ' + r.label) +
        '">support@glowresearch.shop</a> and we will apply it to your next order. ' +
        'Redeeming from this page is not automatic yet.';
      note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  function boot() { initHeaderLink(); initSignIn(); initResetPassword(); initAccount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
