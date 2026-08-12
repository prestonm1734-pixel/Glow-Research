// ===================== Glow Research — checkout =====================
// UI only. Order totals shown here are for display; the real order must be
// priced server-side (WooCommerce) so a tampered browser cannot set its own
// price. Card fields are mounted by the payment processor, never by us.
(function () {
  /* ---------- config ----------
     PLACEHOLDER RATES. Replace with the real published rates before launch,
     and keep them in step with the shipping page. */
  const SHIPPING = [
    { id: '2day', label: 'FedEx 2-Day Express', note: 'Arrives in 2 business days', cost: 12.95, freeOver: 400 },
    { id: 'overnight', label: 'FedEx Overnight', note: 'Next business day, order before 2:00 PM PST', cost: 39.95, freeOver: null },
  ];

  /* Card only for now. Add entries here to offer more (bank transfer, crypto);
     the radio selector appears on its own as soon as there is a second one. */
  const PAY_METHODS = [
    { id: 'card', label: 'Credit or debit card', note: 'Visa, Mastercard, American Express, Discover' },
  ];

  const STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

  let shipId = SHIPPING[0].id;
  // fmtPrice() (js/products-data.js) is where "$65, not $65.00" is decided.
  const money = fmtPrice;

  const $ = id => document.getElementById(id);

  /* ---------- state selects ---------- */
  function fillStates() {
    document.querySelectorAll('select[data-states]').forEach(sel => {
      sel.innerHTML = '<option value="">Select a state</option>' +
        STATES.map(s => `<option>${s}</option>`).join('');
    });
  }

  /* ---------- summary ---------- */

  function shippingCost(sub) {
    const opt = SHIPPING.find(s => s.id === shipId) || SHIPPING[0];
    return (opt.freeOver !== null && sub >= opt.freeOver) ? 0 : opt.cost;
  }

  function renderSummary() {
    const items = window.GlowCart ? window.GlowCart.items() : [];
    const shell = $('coShell');
    const empty = $('coEmpty');
    const notLive = $('coNotLive');

    // Checked before the empty-cart state: whether there is anything to buy is
    // moot if nothing can be bought yet. api/create-order.js enforces this too
    // and is what actually matters — this only saves someone filling out a
    // full order to be told at the end it did not go through.
    if (typeof PAYMENTS_LIVE !== 'undefined' && !PAYMENTS_LIVE) {
      shell.hidden = true;
      empty.hidden = true;
      notLive.hidden = false;
      return;
    }
    notLive.hidden = true;

    if (!items.length) {
      shell.hidden = true;
      empty.hidden = false;
      return;
    }
    shell.hidden = false;
    empty.hidden = true;

    const sub = items.reduce((n, i) => n + i.unitSale * i.qty, 0);
    const saved = items.reduce((n, i) => n + (i.unitOriginal - i.unitSale) * i.qty, 0);
    const ship = shippingCost(sub);

    $('coItems').innerHTML = items.map(i => {
      const onSale = i.unitOriginal > i.unitSale;
      return `
        <div class="co-item">
          <span class="co-thumb">${productThumb(i.name)}</span>
          <div class="co-item-main">
            <p class="co-item-name">${i.name}</p>
            <p class="co-item-meta">${i.variant} &middot; Qty ${i.qty}</p>
          </div>
          <div class="co-item-price">
            ${onSale ? `<span class="co-was">${money(i.unitOriginal * i.qty)}</span>` : ''}
            <span class="co-now">${money(i.unitSale * i.qty)}</span>
          </div>
        </div>`;
    }).join('');

    $('coShipOptions').innerHTML = SHIPPING.map(s => {
      const free = s.freeOver !== null && sub >= s.freeOver;
      return `
        <label class="co-ship ${s.id === shipId ? 'is-on' : ''}">
          <input type="radio" name="shipmethod" value="${s.id}" ${s.id === shipId ? 'checked' : ''} />
          <span class="co-ship-box" aria-hidden="true"></span>
          <span class="co-ship-copy">
            <span class="co-ship-label">${s.label}</span>
            <span class="co-ship-note">${s.note}</span>
          </span>
          <span class="co-ship-cost">${free ? 'Free' : money(s.cost)}</span>
        </label>`;
    }).join('');

    $('coSub').textContent = money(sub);
    $('coShipCost').textContent = ship === 0 ? 'Free' : money(ship);
    $('coTotal').textContent = money(sub + ship);

    const saveRow = $('coSaveRow');
    if (saved > 0) {
      saveRow.hidden = false;
      $('coSaved').textContent = money(saved);
    } else {
      saveRow.hidden = true;
    }

  }

  /* ---------- payment methods ---------- */

  // where the processor mounts its own secure fields; we never render inputs
  const processorSlot = `
    <div class="co-processor">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" stroke="currentColor" stroke-width="2"/>
        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/>
      </svg>
      <p>Secure fields load here once the payment processor is connected. Card details
         go straight to the processor and never touch this site.</p>
    </div>`;

  function renderPayMethods() {
    // One method is not a choice, so skip the radio entirely rather than show
    // a single option the visitor cannot deselect.
    if (PAY_METHODS.length === 1) {
      const m = PAY_METHODS[0];
      $('coPay').innerHTML = `
        <div class="co-pay co-pay-only">
          <div class="co-pay-head is-on is-static">
            <span class="co-ship-copy">
              <span class="co-ship-label">${m.label}</span>
              <span class="co-ship-note">${m.note}</span>
            </span>
          </div>
          <div class="co-pay-body">${processorSlot}</div>
        </div>`;
      return;
    }

    $('coPay').innerHTML = PAY_METHODS.map((m, idx) => `
      <div class="co-pay">
        <label class="co-pay-head ${idx === 0 ? 'is-on' : ''}">
          <input type="radio" name="paymethod" value="${m.id}" ${idx === 0 ? 'checked' : ''} />
          <span class="co-ship-box" aria-hidden="true"></span>
          <span class="co-ship-copy">
            <span class="co-ship-label">${m.label}</span>
            <span class="co-ship-note">${m.note}</span>
          </span>
        </label>
        <div class="co-pay-body" data-for="${m.id}" ${idx === 0 ? '' : 'hidden'}>
          ${processorSlot().replace(/^\s*<div class="co-pay-body" >|<\/div>\s*$/g, '')}
        </div>
      </div>`).join('');

    $('coPay').addEventListener('change', e => {
      if (e.target.name !== 'paymethod') return;
      $('coPay').querySelectorAll('.co-pay-head').forEach(h => {
        h.classList.toggle('is-on', h.contains(e.target));
      });
      $('coPay').querySelectorAll('.co-pay-body').forEach(b => {
        b.hidden = b.dataset.for !== e.target.value;
      });
    });
  }

  /* ---------- signed-in state ----------
     Confirmed against the server, not guessed from the localStorage mirror
     that account.js writes. That mirror is only ever refreshed when
     account.js itself runs, so it goes stale the moment someone signs in
     on a different browser, or clears storage without clearing cookies —
     the HttpOnly session cookie is still good, but the mirror is not, and
     trusting the mirror alone is exactly how a signed-in shopper ends up
     told to "create an account" for an order already sitting in the one
     they have. /api/me reads the real cookie, so this is ground truth. */
  let signedInUser = null;

  async function checkSession() {
    try {
      const resp = await fetch('/api/me', { credentials: 'same-origin' });
      if (!resp.ok) return; // 401 (guest) or accounts not configured — proceed as guest, not an error
      const data = await resp.json();
      signedInUser = { email: data.email, name: data.name };

      $('coSignedIn').hidden = false;
      $('coSignedInEmail').textContent = signedInUser.email;
      $('coMakeAcctRow').hidden = true;
      $('coPassField').hidden = true;
      $('coMakeAcct').checked = false;
      $('coPass').required = false;
      if (signedInUser.email) $('coEmail').value = signedInUser.email;
    } catch (e) { /* network hiccup — proceed as guest */ }
  }

  /* ---------- optional account ---------- */

  // Returns { ok, message, exists } for the confirmation page. Never
  // throws: the order is already placed by the time this runs, so the
  // worst case is telling them the account part did not take.
  async function createAccount(email, password, shipAddr) {
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'signup',
          email,
          password,
          name: [shipAddr.firstName, shipAddr.lastName].filter(Boolean).join(' '),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // 409 means this email already has a password set — a returning
        // customer who did not realise it, or a typo of their usual
        // address. The confirmation page needs to know this specifically:
        // "create an account" is the wrong thing to offer someone who
        // already has one.
        const exists = resp.status === 409;
        return {
          ok: false, exists,
          message: exists
            ? 'An account already exists for this email. Sign in to see this order and its points.'
            : 'Your account could not be created: ' + (data.error || 'please try from the sign-in page.'),
        };
      }

      // mirrors the session cookie so the header reads "Account"
      try {
        localStorage.setItem('glow-session', JSON.stringify({ email: data.email, name: data.name }));
      } catch (e) { /* private mode: the cookie still works */ }

      return { ok: true, message: 'Your account is ready, and this order is already in it.' };
    } catch (e) {
      return { ok: false, message: 'Your account could not be created right now; you can sign up later with this email.' };
    }
  }

  /* ---------- place-order button state ----------
     A ring of eight ticks with staggered negative animation-delays, the
     same spinner iOS and macOS use, rather than a spinning arc (that
     reads as a web-app loader, not this site) or a bare "Placing your
     order…" that never changes and looks stuck the moment the request
     takes longer than an instant. */
  const SPIN_TICKS = 8;
  const SPIN_HTML = '<span class="co-spin" aria-hidden="true">' +
    Array.from({ length: SPIN_TICKS }, (_, i) => {
      const angle = i * (360 / SPIN_TICKS);
      const delay = (i * (0.8 / SPIN_TICKS)).toFixed(3);
      return `<i style="transform:rotate(${angle}deg) translate(0,-6px);animation-delay:-${delay}s"></i>`;
    }).join('') +
    '</span>';

  // Crossfades the label so a status change reads as something happening
  // rather than a flicker, and carries the spinner + aria-busy while a
  // request is actually in flight.
  function setPlaceBtn(btn, label, busy) {
    if (!btn) return;
    const labelEl = btn.querySelector('.co-place-label');
    labelEl.style.opacity = '0';
    setTimeout(() => {
      labelEl.innerHTML = (busy ? SPIN_HTML : '') + '<span>' + label + '</span>';
      labelEl.style.opacity = '1';
    }, 120);
    btn.disabled = !!busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /* ---------- wire up ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    fillStates();
    renderPayMethods();
    renderSummary();
    checkSession();

    // the drawer can change the cart while this page is open
    document.addEventListener('glow-cart-change', renderSummary);

    $('coShipOptions').addEventListener('change', e => {
      if (e.target.name !== 'shipmethod') return;
      shipId = e.target.value;
      renderSummary();
    });

    $('coEditCart').addEventListener('click', e => {
      e.preventDefault();
      window.GlowCart.open();
    });

    // optional account creation: the password field only exists once asked for
    $('coMakeAcct').addEventListener('change', e => {
      $('coPassField').hidden = !e.target.checked;
      $('coPass').required = e.target.checked;
    });

    $('coPromoToggle').addEventListener('click', () => {
      const box = $('coPromoBox');
      box.hidden = !box.hidden;
      $('coPromoToggle').setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) $('coPromo').focus();
    });

    $('coPromoBtn').addEventListener('click', () => {
      $('coPromoMsg').textContent = $('coPromo').value.trim()
        ? 'Promo codes are validated at payment.'
        : 'Enter a code first.';
    });

    $('coForm').addEventListener('submit', async e => {
      e.preventDefault();

      const items = window.GlowCart ? window.GlowCart.items() : [];
      if (!items.length) return;

      // renderSummary() hides the form entirely while this is false, so
      // reaching here means the form was already there when the page loaded
      // (e.g. a cached page from before the flag flipped) — belt-and-suspenders
      // before the network round trip. api/create-order.js refuses this too
      // regardless, so nothing about correctness depends on this check.
      if (typeof PAYMENTS_LIVE !== 'undefined' && !PAYMENTS_LIVE) {
        $('coPlacedMsg').textContent = 'We are not able to take orders online yet. Email support@glowresearch.shop and we will help you directly.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      // The checkbox is `required`, so this only fires if a browser lets the
      // form submit anyway — belt-and-suspenders before the network round trip.
      if (!$('coTerms').checked) {
        $('coPlacedMsg').textContent = 'Please confirm the research-use agreement before placing your order.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      // the referral code rides along with the order so the backend can credit
      // it. Attribution is decided here, at the point of sale, not later.
      const ref = window.GlowReferral ? window.GlowReferral.code() : null;
      const opt = SHIPPING.find(s => s.id === shipId) || SHIPPING[0];
      const sub = items.reduce((n, i) => n + i.unitSale * i.qty, 0);

      const shipAddr = {
        firstName: $('coFirst').value, lastName: $('coLast').value,
        address1: $('coAddr').value, address2: $('coAddr2').value,
        city: $('coCity').value, state: $('coState').value, zip: $('coZip').value,
      };
      // Billing is the shipping address. A card whose billing address differs
      // is handled by the processor's own AVS step, not by six more fields
      // everybody has to scroll past.
      const billAddr = null;

      const submitBtn = $('coForm').querySelector('button[type="submit"]');
      setPlaceBtn(submitBtn, 'Placing your order…', true);
      $('coPlacedMsg').textContent = '';

      try {
        const resp = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            customer: { email: $('coEmail').value },
            shipping: shipAddr,
            billing: billAddr,
            items,
            shippingMethod: { id: opt.id, label: opt.label, cost: shippingCost(sub) },
            referral: ref,
            termsAccepted: true,
          }),
        });
        const data = await resp.json();

        if (!resp.ok) throw new Error(data.error || 'Could not place the order.');

        // The order is placed and must not be undone by a signup problem, so
        // this runs after it and only ever annotates the confirmation.
        let accountMessage = '';
        let accountExists = false;
        // signedInUser comes from a real /api/me check at page load — the
        // authoritative answer. The localStorage mirror is a fallback for
        // the rare case that check itself could not complete.
        let hasAccount = !!signedInUser || !!(window.localStorage && localStorage.getItem('glow-session'));
        // Someone already signed in has nothing to sign up for — the
        // checkbox is hidden for them, but guard here too rather than
        // trust that it was never checked.
        if (!signedInUser && $('coMakeAcct').checked) {
          // a real second request, so it gets its own honest label rather
          // than leaving "Placing your order…" up for a step it is not
          // actually describing anymore
          setPlaceBtn(submitBtn, 'Setting up your account…', true);
          const result = await createAccount($('coEmail').value, $('coPass').value, shipAddr);
          accountMessage = result.message;
          hasAccount = hasAccount || result.ok;
          accountExists = !!result.exists;
        }

        // handed to the confirmation page rather than passed in the URL, so an
        // order number is never enough on its own to pull up someone's receipt
        try {
          sessionStorage.setItem('glow-last-order', JSON.stringify({
            number: data.orderNumber,
            date: new Date().toISOString(),
            email: $('coEmail').value,
            name: [shipAddr.firstName, shipAddr.lastName].filter(Boolean).join(' '),
            items,
            shipping: shipAddr,
            shippingLabel: opt.label,
            shippingCost: shippingCost(sub),
            referral: ref,
            accountMessage,
            hasAccount,
            accountExists,
          }));
        } catch (e) { /* private mode: the fallback message below still shows */ }

        if (window.GlowCart) window.GlowCart.clear();
        location.href = 'thank-you.html';
        return;
      } catch (err) {
        setPlaceBtn(submitBtn, 'Place order', false);
        $('coPlacedMsg').textContent = err.message || 'Something went wrong placing the order. Please try again.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  });
})();
