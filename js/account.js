// ===================== Glow Research — account =====================
// UI layer only. There is no auth backend yet, exactly as there is no payment
// processor yet on checkout: the sign-in form below does not verify anything,
// and the orders, points and referral figures are seeded sample data so the
// screens can be designed and reviewed before the backend exists.
//
// WIRING IT UP LATER
//   signIn()  -> replace the localStorage write with the auth provider's
//                session call; keep the same redirect.
//   loadAccount() -> replace SAMPLE with the API response.
// The password field is deliberately never read, stored, or transmitted, so
// nobody can type a real credential into a form that would only pretend to
// use it.
(function () {
  var SESSION = 'glow-session';

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function session() {
    var raw = read(SESSION);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // depth-aware link, same reasoning as the age gate: this file is shared and
  // may one day be pulled in from a nested page
  function root() {
    var segs = location.pathname.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    var depth = /\.html?$/i.test(last) ? segs.length - 1 : segs.length;
    return depth > 0 ? new Array(depth + 1).join('../') : '';
  }

  /* ================= sample account =================
     Points work like a coffee-shop card: 10 per dollar spent, redeemable at
     fixed tiers. Kept as plain data so swapping in a real API response means
     changing one object, not the rendering below. */
  var SAMPLE = {
    name: 'Researcher',
    tier: 'Standard',
    points: 1240,
    lifetime: 3180,
    orders: [
      { id: 'GR-4417', date: '2026-07-24', status: 'Delivered', total: 159.30,
        items: [{ name: 'BPC-157', variant: '5mg', qty: 2, lot: 'B7-2291' }] },
      { id: 'GR-4382', date: '2026-07-09', status: 'In transit', track: '7749 1183 2205',
        items: [{ name: 'Semaglutide', variant: '5mg', qty: 1, lot: 'S4-1180' },
                { name: 'Selank', variant: '5mg', qty: 1, lot: 'K2-0774' }] },
      { id: 'GR-4310', date: '2026-06-18', status: 'Delivered', total: 214.20,
        items: [{ name: 'GLP3-RT', variant: '10mg', qty: 1, lot: 'G9-3364' },
                { name: 'TB-500', variant: '5mg', qty: 1, lot: 'T5-2210' }] },
    ],
    referral: { code: 'GLOW-R4417', rate: 10, clicks: 84, signups: 11, orders: 6, earned: 128.40, pending: 42.10 },
  };

  var REWARDS = [
    { cost: 750,  label: '$10 off any order' },
    { cost: 1500, label: '$25 off any order' },
    { cost: 3000, label: '10% off a full order' },
  ];

  var money = function (n) { return '$' + n.toFixed(2); };
  var when = function (iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ================= sign-in page ================= */
  function initSignIn() {
    var form = document.getElementById('siForm');
    if (!form) return;

    // already signed in? go straight through
    if (session()) { location.replace(root() + 'account.html'); return; }

    var tabs = document.querySelectorAll('.si-tab');
    var nameField = document.getElementById('siNameField');
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
        submit.textContent = mode === 'up' ? 'Create account' : 'Sign in';
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('siEmail').value.trim();
      var name = mode === 'up' ? document.getElementById('siName').value.trim() : '';
      // note what is NOT here: the password is never read off the form
      write(SESSION, JSON.stringify({ email: email, name: name || SAMPLE.name }));
      location.href = root() + 'account.html';
    });
  }

  /* ================= account dashboard ================= */
  function initAccount() {
    var shell = document.getElementById('acShell');
    if (!shell) return;

    var s = session();
    if (!s) { location.replace(root() + 'signin.html'); return; }

    var data = SAMPLE;
    document.getElementById('acWho').textContent = s.name || data.name;
    document.getElementById('acEmail').textContent = s.email || '—';

    renderOverview(data);
    renderOrders(data);
    renderRewards(data);
    renderAffiliate(data);

    // panel switching
    var navBtns = document.querySelectorAll('.ac-nav-btn');
    navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.dataset.panel;
        navBtns.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.ac-panel').forEach(function (p) {
          p.hidden = p.dataset.panel !== target;
        });
      });
    });

    document.getElementById('acSignOut').addEventListener('click', function () {
      drop(SESSION);
      location.href = root() + 'index.html';
    });
  }

  function renderOverview(d) {
    document.getElementById('acPoints').textContent = d.points.toLocaleString();
    document.getElementById('acLifetime').textContent = d.lifetime.toLocaleString();
    document.getElementById('acOrderCount').textContent = d.orders.length;

    // next reward the balance has not reached yet
    var next = REWARDS.find(function (r) { return r.cost > d.points; });
    var bar = document.getElementById('acProgress');
    var note = document.getElementById('acProgressNote');
    if (next) {
      bar.style.width = Math.min(100, (d.points / next.cost) * 100) + '%';
      note.textContent = (next.cost - d.points).toLocaleString() + ' points to ' + next.label;
    } else {
      bar.style.width = '100%';
      note.textContent = 'Every reward unlocked';
    }
  }

  function renderOrders(d) {
    document.getElementById('acOrders').innerHTML = d.orders.map(function (o) {
      var lots = o.items.map(function (i) {
        return '<li><span>' + i.name + ' · ' + i.variant + ' × ' + i.qty + '</span>' +
               '<code>Lot ' + i.lot + '</code></li>';
      }).join('');
      var right = o.status === 'In transit'
        ? '<a class="ac-track" href="https://www.fedex.com/fedextrack/?trknbr=' +
          o.track.replace(/\s/g, '') + '" target="_blank" rel="noopener">Track ' +
          '<span aria-hidden="true">&rarr;</span></a>'
        : '<span class="ac-total">' + money(o.total) + '</span>';
      return '' +
        '<article class="ac-order">' +
          '<header class="ac-order-head">' +
            '<div>' +
              '<span class="ac-order-id">' + o.id + '</span>' +
              '<span class="ac-order-date">' + when(o.date) + '</span>' +
            '</div>' +
            '<span class="ac-status ac-status--' + o.status.toLowerCase().replace(/\s/g, '-') + '">' +
              o.status + '</span>' +
          '</header>' +
          '<ul class="ac-order-items">' + lots + '</ul>' +
          '<footer class="ac-order-foot">' +
            '<span class="ac-order-coa">COA available for every lot above</span>' + right +
          '</footer>' +
        '</article>';
    }).join('');
  }

  function renderRewards(d) {
    document.getElementById('acRewardBalance').textContent = d.points.toLocaleString();
    document.getElementById('acRewards').innerHTML = REWARDS.map(function (r) {
      var ready = d.points >= r.cost;
      return '' +
        '<div class="ac-reward' + (ready ? ' is-ready' : '') + '">' +
          '<div class="ac-reward-main">' +
            '<span class="ac-reward-label">' + r.label + '</span>' +
            '<span class="ac-reward-cost">' + r.cost.toLocaleString() + ' points</span>' +
          '</div>' +
          '<button type="button" class="btn ' + (ready ? 'btn-primary' : 'btn-outline') + ' ac-reward-btn"' +
            (ready ? '' : ' disabled') + '>' +
            (ready ? 'Redeem' : (r.cost - d.points).toLocaleString() + ' to go') +
          '</button>' +
        '</div>';
    }).join('');
  }

  function renderAffiliate(d) {
    var r = d.referral;
    var link = location.origin + '/?ref=' + r.code;
    document.getElementById('acRefLink').value = link;
    document.getElementById('acRefRate').textContent = r.rate + '%';
    document.getElementById('acRefClicks').textContent = r.clicks;
    document.getElementById('acRefSignups').textContent = r.signups;
    document.getElementById('acRefOrders').textContent = r.orders;
    document.getElementById('acRefEarned').textContent = money(r.earned);
    document.getElementById('acRefPending').textContent = money(r.pending);

    var btn = document.getElementById('acRefCopy');
    btn.addEventListener('click', function () {
      var input = document.getElementById('acRefLink');
      input.select();
      var done = function () {
        var was = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = was; }, 1600);
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
