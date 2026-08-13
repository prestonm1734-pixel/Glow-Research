// ===================== Glow Research — order confirmation =====================
// Renders the receipt for the order just placed.
//
// The details are handed over in sessionStorage by checkout.js rather than
// fetched by order number from the URL. That is deliberate: an endpoint that
// returns an order for whoever names its number lets anyone read other
// people's addresses by counting upwards. Nothing here is trusted for
// anything — it is a receipt for an order the server already recorded — and
// the authoritative copy is in the account, behind the session cookie.
(function () {
  var KEY = 'glow-last-order';

  var shell = document.getElementById('tyShell');
  var none = document.getElementById('tyNone');
  if (!shell) return;

  var order = null;
  try {
    var raw = sessionStorage.getItem(KEY);
    if (raw) order = JSON.parse(raw);
  } catch (e) { /* private mode, or nothing stored */ }

  if (!order || !order.number) { none.hidden = false; return; }
  shell.hidden = false;

  // Two frames after unhiding: one for the browser to lay the shell out, one
  // for the hidden start values to be the computed style. Setting the class in
  // the same frame gives the transitions no start state and they jump.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { shell.classList.add('is-in'); });
  });

  // fmtPrice() (js/products-data.js) is where "$65, not $65.00" is decided.
  var money = function (n) { return fmtPrice(Number(n || 0)); };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function set(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ---------- header ---------- */

  // "Thank you, Ada." reads better than a bare "Thank you." when we have it
  var first = (order.name || '').trim().split(/\s+/)[0];
  set('tyName', first ? ', ' + first : '');

  set('tyNumber', '#' + order.number);
  set('tyEmail', order.email || 'your email');

  // WooCommerce's own word for where this order stands, handed over by
  // api/create-order.js. Absent on the idempotent path, and shown as nothing
  // rather than as a guess: this page has no way to know a status the store
  // did not tell it.
  var statusEl = document.getElementById('tyStatus');
  if (order.status) {
    statusEl.hidden = false;
    statusEl.textContent = order.status;
  }

  /* ---------- what happens next ----------
     PAYMENT_COPY (js/products-data.js) keys off PAYMENTS_LIVE, so the payment
     step describes what the checkout this order came through actually does.
     The step is marked done only while payments are live, because that is the
     only case where money has already changed hands by the time this renders. */
  set('tyStepPayTitle', PAYMENT_COPY.stepTitle);
  set('tyStepPayBody', PAYMENT_COPY.stepBody);
  if (PAYMENTS_LIVE) document.getElementById('tyStepPay').classList.add('is-done');

  var d = order.date ? new Date(order.date) : new Date();
  set('tyDate', isNaN(d.getTime())
    ? ''
    // short form: this now sits in one compact meta line, not its own field
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

  /* ---------- items and totals ---------- */

  var items = Array.isArray(order.items) ? order.items : [];
  document.getElementById('tyItems').innerHTML = items.map(function (i) {
    var line = i.unitSale * i.qty;
    return '<li>' +
      '<span>' + esc(i.name) +
        (i.variant ? ' <span class="ty-item-qty">' + esc(i.variant) + '</span>' : '') +
        ' <span class="ty-item-qty">&times; ' + (i.qty || 1) + '</span>' +
      '</span>' +
      '<span class="ty-item-price">' + money(line) + '</span>' +
    '</li>';
  }).join('');

  var sub = items.reduce(function (n, i) { return n + i.unitSale * i.qty; }, 0);
  var saved = items.reduce(function (n, i) {
    return n + ((i.unitOriginal || i.unitSale) - i.unitSale) * i.qty;
  }, 0);
  var ship = Number(order.shippingCost || 0);

  var rows = '';
  rows += '<div><span>Subtotal</span><span>' + money(sub) + '</span></div>';
  if (saved > 0) rows += '<div><span>You saved</span><span>&minus;' + money(saved) + '</span></div>';
  rows += '<div><span>' + esc(order.shippingLabel || 'Shipping') + '</span><span>' +
    (ship === 0 ? 'Free' : money(ship)) + '</span></div>';
  rows += '<div class="ty-grand"><span>Total</span><span>' + money(sub + ship) + '</span></div>';
  document.getElementById('tyTotals').innerHTML = rows;

  /* ---------- address ---------- */

  var a = order.shipping || {};
  var name = [a.firstName, a.lastName].filter(Boolean).join(' ');
  var cityLine = [a.city, a.state].filter(Boolean).join(', ');
  document.getElementById('tyAddr').innerHTML =
    (name ? '<strong>' + esc(name) + '</strong>' : '') +
    [a.address1, a.address2].filter(Boolean).map(esc).join('<br />') +
    (a.address1 ? '<br />' : '') +
    esc(cityLine) + (a.zip ? ' ' + esc(a.zip) : '') +
    '<br />United States';

  /* ---------- account note ---------- */

  var note = document.getElementById('tyAccountNote');
  if (order.accountMessage) {
    note.hidden = false;
    note.innerHTML = '<strong>Your account.</strong> ' + esc(order.accountMessage);
  }

  // A guest with no account cannot follow "track this order" anywhere useful,
  // so point them at signing up with the email the order already carries —
  // which claims this order rather than starting an empty account.
  //
  // order.accountExists means checkout tried to sign them up and the store
  // said this email already has a password. Offering "Create an account"
  // there would be telling someone with a real account to make another one
  // — the honest next step for them is signing in to the one they have.
  if (!order.hasAccount) {
    var btn = document.getElementById('tyOrdersBtn');
    var email = order.email || '';
    btn.setAttribute('href', order.accountExists
      ? 'signin.html?email=' + encodeURIComponent(email)
      : 'signin.html');
    btn.innerHTML = order.accountExists
      ? 'Sign in to track it <span aria-hidden="true">&rarr;</span>'
      : 'Create an account to track it <span aria-hidden="true">&rarr;</span>';

    // Only reached when nobody ever tried creating an account this trip —
    // accountMessage is always set on every createAccount() outcome
    // (success, already-exists, or failure), including the accountExists
    // case above, which the block at the top of this function already
    // renders with the right wording.
    if (!order.accountMessage) {
      note.hidden = false;
      note.innerHTML = '<strong>Track this order.</strong> Create an account with ' +
        esc(email || 'the email above') +
        ' and this order, its tracking and its points will already be in it.';
    }
  }

  if (order.referral) {
    var lede = document.getElementById('tyLede');
    lede.innerHTML += ' Referral <strong>' + esc(order.referral) + '</strong> has been credited.';
  }

  /* ---------- one-shot ----------
     Clearing it means a refresh still works (this ran first) but a later
     visit shows the "no recent order" state rather than a stale receipt.
     Deferred so a refresh mid-render cannot lose it. */
  window.addEventListener('pageshow', function () {
    setTimeout(function () {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    }, 1500);
  });
})();
