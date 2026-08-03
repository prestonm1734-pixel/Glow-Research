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
    referral: { code: 'GLOW-R4417', firstRate: 20, rate: 10, clicks: 84, signups: 11, orders: 6, earned: 128.40, pending: 42.10 },
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

    // ?next=affiliate lands them on the affiliate tab once they are in, so the
    // "become an affiliate" journey doesn't dump people on the Overview panel
    var next = new URLSearchParams(location.search).get('next');
    var dest = root() + 'account.html' +
      (next && /^[a-z]+$/.test(next) ? '#' + next : '');

    // already signed in? go straight through
    if (session()) { location.replace(dest); return; }

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
      location.href = dest;
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
          '<div class="ac-stat"><b>20%</b><span>First order</span></div>' +
          '<div class="ac-stat"><b>10%</b><span>Lifetime recurring</span></div>' +
          '<div class="ac-stat"><b>30 days</b><span>Attribution window</span></div>' +
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
    sub.innerHTML = 'Share your link. You earn <strong>' + r.firstRate + '%</strong> on a buyer\'s ' +
      'first order and <strong>' + r.rate + '%</strong> on every order after, for life.';
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
