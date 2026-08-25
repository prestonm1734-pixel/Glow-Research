// ===================== Glow Research — checkout =====================
// UI only. Order totals shown here are for display; the real order must be
// priced server-side (WooCommerce) so a tampered browser cannot set its own
// price. Card fields are mounted by the payment processor, never by us.
(function () {
  /* ---------- config ----------
     The published rates. This table only drives what the page displays:
     SHIPPING_RATES in api/_lib.js is the copy that actually gets charged, and
     changing a cost here without changing it there would mean the page quotes
     one number while Stripe collects another. tools/check-claims.js compares
     the two tables by id, cost and free-over threshold on every build, along
     with EXPRESS_SHIPPING in js/express-pay.js, so that drift fails the build
     rather than reaching a shopper. */
  const SHIPPING = [
    { id: '2day', label: 'FedEx 2-Day Express', note: 'Arrives in 2 business days', cost: 14.99, freeOver: 400 },
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

  // Stripe's own script (checkout.html loads it in <head>, ahead of this
  // file) defines the global. Guarded the same way every PAYMENTS_LIVE check
  // in this file is: a script that failed to load must not throw here and
  // take the whole page down over it — renderSummary()'s coNotLive state is
  // already what a visitor sees if payments are not actually live, this is
  // only for the case where they are live but Stripe's script itself did
  // not load.
  const stripeClient = (typeof Stripe !== 'undefined' && typeof STRIPE_PUBLISHABLE_KEY !== 'undefined' && STRIPE_PUBLISHABLE_KEY)
    ? Stripe(STRIPE_PUBLISHABLE_KEY)
    : null;

  // Matches .co-field's own input styling exactly (checkout.html) rather than
  // Stripe's default rounded, blue-focused theme — the fields Stripe draws
  // inside its iframe should read as the same form as the ones around them,
  // not a widget dropped into it. Colours and radius are literals, not CSS
  // custom properties: the iframe cannot read this page's stylesheet, so
  // there is nothing to var() against.
  const STRIPE_APPEARANCE = {
    theme: 'flat',
    variables: {
      fontFamily: '"Sora", system-ui, sans-serif',
      fontSizeBase: '15px',
      colorText: '#0a0a0a',
      colorTextPlaceholder: '#86868b',
      colorDanger: '#b3261e',
      borderRadius: '0px',
      spacingUnit: '3px',
    },
    rules: {
      // Filled, not outlined: a resting border on every field is a second
      // grid of boxes laid over the card fields, which was most of what read
      // as heavy. A flat grey fill reads as one soft surface instead, and the
      // border only appears on the one field actually being typed into.
      '.Input': {
        backgroundColor: '#f5f5f4',
        border: '1px solid transparent',
        padding: '11px 12px',
        boxShadow: 'none',
      },
      '.Input:focus': {
        backgroundColor: '#fff',
        border: '1px solid #0a0a0a',
        boxShadow: 'none',
      },
      '.Input--invalid': {
        border: '1px solid #b3261e',
        backgroundColor: '#fdf3f2',
      },
      '.Label': {
        color: '#86868b',
        fontSize: '.8rem',
        marginBottom: '4px',
      },
    },
  };

  /* ---------- state selects ---------- */
  function fillStates() {
    document.querySelectorAll('select[data-states]').forEach(sel => {
      sel.innerHTML = '<option value="">Select a state</option>' +
        STATES.map(s => `<option>${s}</option>`).join('');
    });
  }

  /* ---------- express pay ----------
     The wallet button above the form, driven by js/express-pay.js, the same
     flow the product buy box runs. What differs is only what is being bought:
     there it is one vial and a quantity, here it is the whole cart. */

  const cartItems = () => (window.GlowCart ? window.GlowCart.items() : []);

  function initExpressPay() {
    if (typeof GlowExpressPay === 'undefined') return;
    GlowExpressPay.init({
      wrap: '#coExpress',
      mount: '#coExpressBtn',
      items: cartItems,
      // GlowCart.items() hands back the tier-adjusted unitSale, the same figure
      // the summary on the right totals from, so the sheet cannot quote a
      // different number from the one on screen.
      subtotal: () => round2(cartItems().reduce((n, i) => n + i.unitSale * i.qty, 0)),
      // What the wallet sheet lists the charge against. One line for a single
      // item, a count once there are several, since the sheet has no room to
      // itemise and "2 items" is honest where naming only the first would not be.
      label: () => {
        const items = cartItems();
        if (items.length === 1) {
          const i = items[0];
          return `${i.name} ${i.variant}${i.qty > 1 ? ` × ${i.qty}` : ''}`;
        }
        const count = items.reduce((n, i) => n + i.qty, 0);
        return `Glow Research (${count} item${count === 1 ? '' : 's'})`;
      },
      canOffer: () => cartItems().length > 0,
      onError: msg => { const el = $('coExpressMsg'); if (el) el.textContent = msg; },
      // The wallet skips this page's own submit, so nothing else clears the
      // cart on the way out. finishOrder() does it for the typed-card path.
      onPlaced: () => { if (window.GlowCart) window.GlowCart.clear(); },
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

    // The higher of the launch list price and the plain per-vial price, same
    // reference lineRef() strikes through in js/cart.js.
    const ref = i => Math.max(Number(i.unitList) || 0, i.unitOriginal);
    const sub = items.reduce((n, i) => n + i.unitSale * i.qty, 0);
    const saved = items.reduce((n, i) => n + (ref(i) - i.unitSale) * i.qty, 0);
    const ship = shippingCost(sub);

    $('coItems').innerHTML = items.map(i => {
      const onSale = ref(i) > i.unitSale;
      return `
        <div class="co-item">
          <span class="co-thumb">${productThumb(i.name)}</span>
          <div class="co-item-main">
            <p class="co-item-name">${i.name}</p>
            <p class="co-item-meta">${i.variant} &middot; Qty ${i.qty}</p>
          </div>
          <div class="co-item-price">
            <span class="co-now">${money(i.unitSale * i.qty)}</span>
            ${onSale ? `<span class="co-was">${money(ref(i) * i.qty)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    // One method is not a choice, the same reasoning renderPayMethods() below
    // applies to a single payment method: nothing to label or select, so a
    // radio input and a hit target around it would be asking for a decision
    // there isn't one to make. The "Shipping" heading already on the page
    // says what this row is.
    if (SHIPPING.length === 1) {
      const s = SHIPPING[0];
      const free = s.freeOver !== null && sub >= s.freeOver;
      $('coShipOptions').innerHTML = `
        <div class="co-ship is-static">
          <span class="co-ship-copy">
            <span class="co-ship-label">${s.label}</span>
            <span class="co-ship-note">${s.note}</span>
          </span>
          <span class="co-ship-cost">${free ? 'Free' : money(s.cost)}</span>
        </div>`;
    } else {
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
    }

    $('coSub').textContent = money(sub);
    $('coShipCost').textContent = ship === 0 ? 'Free' : money(ship);

    const taxRow = $('coTaxRow');
    if (taxRow) {
      taxRow.hidden = taxAmount <= 0;
      if (taxAmount > 0) $('coTaxCost').textContent = money(taxAmount);
    }

    const promoRow = $('coPromoRow');
    if (promoRow) {
      promoRow.hidden = promoDiscount <= 0;
      if (promoDiscount > 0) {
        $('coPromoRowLabel').textContent = appliedPromoCode ? `Promo code (${appliedPromoCode})` : 'Promo code';
        $('coPromoRowAmount').textContent = money(promoDiscount);
      }
    }

    $('coTotal').textContent = money(sub - promoDiscount + ship + taxAmount);

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
  // Where Stripe mounts the Payment Element. #coStripeElement is the iframe's
  // home; #coStripeErr is ours, for a card decline or a network hiccup —
  // Stripe's own errors surface inside the element, this is for everything
  // around it (the PaymentIntent call failing, confirmPayment() rejecting).
  const processorSlot = () => `
    <div id="coStripeElement" class="co-stripe-el">
      <p class="co-stripe-loading">Loading secure payment fields…</p>
    </div>
    <p id="coStripeErr" class="co-stripe-err" hidden></p>`;

  function renderPayMethods() {
    // One method is not a choice, so there is nothing to label or select —
    // the "Payment" <h2> already on the page says what this is, and a method
    // name plus a static header bar above the card fields was saying it a
    // second time. Once PAY_METHODS grows past one (crypto, most likely, per
    // the plan), the radio branch below is what starts the picture the
    // screenshots described: press a method, its own fields appear. Until
    // then, this is just the fields, nothing above them.
    if (PAY_METHODS.length === 1) {
      $('coPay').innerHTML = processorSlot();
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
          ${processorSlot()}
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

  /* ---------- Stripe ----------
     One PaymentIntent per checkout session, created the first time there is
     something to charge and updated in place — never recreated — whenever the
     cart or the shipping method changes afterward. Recreating it would mean
     remounting the Payment Element, which drops whatever the shopper has
     already typed; updating the existing one keeps the mounted fields and
     just changes what they will charge when confirmed.

     api/create-payment-intent.js does the actual pricing, from the live
     catalog, exactly as api/create-order.js will re-verify later — this file
     never computes a total and sends it to be charged, only ever asks the
     server what the total is. stripeClient itself is declared up near the
     top of the file, next to where it is constructed. */
  let elements = null;
  let paymentIntentId = null;
  // Set from api/create-payment-intent.js's own response, never computed
  // here: Stripe Tax is the one place a rate is decided, and this page only
  // ever displays what it said. Zero until a shipping address has enough on
  // it (state + ZIP) to price against, which is the ordinary state of the
  // page before someone has typed one.
  let taxAmount = 0;

  // appliedPromoCode is the code a shopper's "Apply" click validated against
  // /api/apply-promo — a string, never a dollar amount. promoDiscount is the
  // dollar figure, and it only ever comes from a server response
  // (api/apply-promo.js or api/create-payment-intent.js re-validating the
  // same code against Stripe), the same way taxAmount above is never computed
  // in the browser. A code that stops pricing clean between "Apply" and
  // payment is dropped automatically inside ensurePaymentIntent() rather than
  // being able to block checkout entirely.
  let appliedPromoCode = null;
  let promoDiscount = 0;

  // Only what Stripe Tax actually needs (state + ZIP). Anything short of
  // that and the server-side calculation returns null, no request wasted.
  function currentTaxAddress() {
    const state = $('coState') ? $('coState').value : '';
    const zip = $('coZip') ? $('coZip').value : '';
    if (!state || !zip) return null;
    return {
      address1: $('coAddr') ? $('coAddr').value : '',
      address2: $('coAddr2') ? $('coAddr2').value : '',
      city: $('coCity') ? $('coCity').value : '',
      state,
      zip,
    };
  }
  let piInFlight = null; // in-flight promise, so a rapid shipping toggle cannot fire two overlapping requests

  function stripeErr(msg) {
    const el = $('coStripeErr');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  // 'applied' disables the promo input and turns the button into Remove, so
  // pressing it a second time undoes the code rather than re-submitting it.
  // 'idle' is the ordinary state: an empty, editable box. Used both by the
  // Apply/Remove click handler and by ensurePaymentIntent() below, which has
  // to be able to reset this UI on its own when a previously-applied code
  // stops pricing clean server-side — hence living up here rather than
  // nested inside the DOMContentLoaded handler with the click listener.
  function setPromoUI(state) {
    const input = $('coPromo');
    const btn = $('coPromoBtn');
    if (!input || !btn) return;
    if (state === 'applied') {
      input.disabled = true;
      btn.textContent = 'Remove';
    } else {
      input.disabled = false;
      input.value = '';
      btn.textContent = 'Apply';
    }
  }

  // Same line-icon style as .co-secure just below this box on the page: a
  // small stroked SVG, not an emoji. 'ok' draws a check, 'error' draws an X,
  // 'neutral' (the "Checking…" state) and '' (cleared) draw nothing — the
  // color alone would not be enough to tell an applied code from a rejected
  // one for someone who cannot see color, so the icon carries the meaning a
  // plain-text status line on its own never did.
  const PROMO_ICON = {
    ok: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  };
  function setPromoMsg(kind, text) {
    const el = $('coPromoMsg');
    if (!el) return;
    el.className = 'co-promo-msg' + (kind === 'ok' || kind === 'error' ? ' is-' + kind : '');
    // The icon is a fixed, hardcoded SVG string (safe); the message text is
    // never trusted to that same innerHTML, even though every caller today
    // only ever passes a hardcoded string or our own API's error copy — a
    // text node costs nothing and means this stays true if that changes.
    el.innerHTML = PROMO_ICON[kind] || '';
    if (text) el.appendChild(document.createTextNode(text));
  }

  // orderPayload is only ever passed on the final call, right before
  // confirmPayment() — see the submit handler below. Stripe's own metadata on
  // the intent is what api/stripe-webhook.js reads to create the order if the
  // browser never makes it back after payment (tab closed, connection
  // dropped, a redirect that does not resolve), so it has to be the complete,
  // final order: every earlier call in this function (cart change, shipping
  // toggle, address edit) reprices without it.
  async function ensurePaymentIntent(orderPayload) {
    const items = window.GlowCart ? window.GlowCart.items() : [];
    if (!items.length) return;

    // Serialized, not just tracked: a shipping toggle fired twice in quick
    // succession must not let two requests race to set paymentIntentId, or
    // the second response can overwrite it with an intent the first request
    // never saw and update a stale one on the next call.
    if (piInFlight) { try { await piInFlight; } catch (e) { /* handled where it was thrown */ } }

    const run = (async () => {
      try {
        // Two passes at most: one with whatever promo code is currently
        // applied, and — only if that pass fails specifically because the
        // code no longer prices clean (expired, redeemed out, since "Apply"
        // was pressed) — one retry with it dropped. A real failure (network,
        // tax, anything else) never reaches a second pass; it throws straight
        // out to the catch below, same as before this existed.
        let data;
        for (let attempt = 0; attempt < 2; attempt++) {
          const resp = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              items,
              shippingMethodId: shipId,
              email: $('coEmail') ? $('coEmail').value : '',
              address: currentTaxAddress(),
              paymentIntentId,
              ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
              ...(orderPayload ? { order: orderPayload } : {}),
            }),
          });
          data = await resp.json();
          if (resp.ok) break;

          if (appliedPromoCode && attempt === 0) {
            appliedPromoCode = null;
            promoDiscount = 0;
            setPromoUI('idle');
            setPromoMsg('error', (data.error || 'That code is no longer valid.') + ' It has been removed so you can continue.');
            renderSummary();
            continue; // retry once, now with no promo code in the request
          }
          throw new Error(data.error || 'Could not prepare payment.');
        }

        paymentIntentId = data.paymentIntentId;
        taxAmount = data.tax || 0;
        promoDiscount = data.discount || 0;
        renderSummary();

        if (!elements) {
          // First time only: mounting is what makes the fields exist. After
          // this, updates to the PaymentIntent's amount just change what a
          // later confirmPayment() will charge — elements.fetchUpdates()
          // below is what keeps anything Stripe renders live (a wallet
          // button's on-screen amount, mainly) in step with it.
          elements = stripeClient.elements({ clientSecret: data.clientSecret, appearance: STRIPE_APPEARANCE });
          // Card only (the PaymentIntent was created with payment_method_types:
          // ['card']), and no address/name/email fields: the checkout form
          // already collects all three, further up this same page, so Stripe's
          // own copies were the second billing-address form nobody asked for —
          // the actual clutter, more than any colour or corner radius. The real
          // shipping address still goes to Stripe at confirm time, in
          // confirmParams below, so AVS still runs; it is just not re-typed.
          // No `wallets` option, deliberately: the default is auto for both,
          // which is what makes Apple Pay and Google Pay buttons appear on
          // their own above the card fields when a visitor's browser actually
          // has one configured. Apple Pay additionally needs its domain
          // verified in the Stripe Dashboard (Settings > Payment methods >
          // Apple Pay) before it can appear at all — that step happens on
          // Stripe's side and in this repo (the verification file it issues),
          // not in this options object, so there is nothing to set here for
          // either wallet to start working.
          const el = elements.create('payment', {
            fields: { billingDetails: { name: 'never', email: 'never', address: 'never' } },
          });
          el.mount('#coStripeElement');
          el.on('ready', () => {
            const loading = document.querySelector('.co-stripe-loading');
            if (loading) loading.remove();
          });
        } else {
          await elements.fetchUpdates();
        }
        stripeErr('');
      } catch (err) {
        stripeErr(err.message || 'Could not load secure payment fields. Refresh the page to try again.');
      }
    })();

    piInFlight = run;
    try {
      await run;
    } finally {
      if (piInFlight === run) piInFlight = null;
    }
  }

  // The one place that calls api/create-order.js. Used by the normal submit
  // path the moment confirmPayment() resolves without a redirect, and by
  // resumeAfterRedirect() below when it does not — same request, same
  // handling either way, because by this point a card has already been
  // charged and the two paths must not diverge on what happens to that
  // charge.
  //
  // accountCreds is only ever populated on the direct (non-redirect) path.
  // The optional "create an account" checkbox needs a password, and a
  // password is not something to park in sessionStorage on the chance a
  // redirect happens — so a 3D Secure redirect quietly falls back to a guest
  // order rather than persisting one in cleartext to survive the trip. That
  // is a deliberate, narrow gap, not an oversight: the shopper can still make
  // an account afterward with the same email.
  async function finishOrder(payload, stripePaymentIntentId, submitBtn, accountCreds) {
    setPlaceBtn(submitBtn, 'Placing your order…', true);
    $('coPlacedMsg').textContent = '';

    let data;
    try {
      const resp = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, paymentIntentId: stripePaymentIntentId }),
      });
      data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
    } catch (err) {
      // The card has already been charged by this point. Reoffering "Place
      // order" would invite a second attempt at an order that has nothing
      // left to pay for, and confirmPayment() on an already-succeeded
      // PaymentIntent does not behave like a normal retry — so this is a
      // dead end on purpose, with the one reference that lets support find
      // the payment even though no order exists for it yet.
      if (submitBtn) {
        submitBtn.disabled = true;
        const label = submitBtn.querySelector('.co-place-label');
        if (label) label.innerHTML = '<span>Contact support</span>';
      }
      $('coPlacedMsg').textContent = err.message ||
        `Your payment succeeded, but we could not finish placing the order. ` +
        `Email support@glowresearch.shop with this reference: ${stripePaymentIntentId}`;
      $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    let accountMessage = '';
    let accountExists = false;
    let hasAccount = !!signedInUser || !!(window.localStorage && localStorage.getItem('glow-session'));
    if (!signedInUser && accountCreds && accountCreds.makeAcct) {
      setPlaceBtn(submitBtn, 'Setting up your account…', true);
      const result = await createAccount(accountCreds.email, accountCreds.pass, payload.shipping);
      accountMessage = result.message;
      hasAccount = hasAccount || result.ok;
      accountExists = !!result.exists;
    }

    // handed to the confirmation page rather than passed in the URL, so an
    // order number is never enough on its own to pull up someone's receipt
    try {
      sessionStorage.setItem('glow-last-order', JSON.stringify({
        number: data.orderNumber,
        // WooCommerce's own status, already mapped to prose by the API. Absent
        // on the idempotent path (a retry that found the order already made),
        // where thank-you.js simply shows no status rather than guessing one.
        status: data.status || '',
        date: new Date().toISOString(),
        email: payload.customer.email,
        name: [payload.shipping.firstName, payload.shipping.lastName].filter(Boolean).join(' '),
        items: payload.items,
        shipping: payload.shipping,
        shippingLabel: payload.shippingMethod.label,
        shippingCost: payload.shippingMethod.cost,
        // api/create-order.js's own figure, re-derived server-side against
        // Stripe Tax rather than trusted from whatever this page last showed.
        tax: data.tax || 0,
        discount: data.discount || 0,
        promoCode: data.promoCode || null,
        accountMessage,
        hasAccount,
        accountExists,
      }));
      sessionStorage.removeItem('glow-pending-order');
    } catch (e) { /* private mode: the fallback message on thank-you.html still shows */ }

    if (window.GlowCart) window.GlowCart.clear();
    location.href = 'thank-you.html';
  }

  // Runs on every load of this page. Only does anything when the URL carries
  // Stripe's own return params, which only happens on the way back from a
  // redirect-based confirmation (3D Secure, mainly) — the ordinary case,
  // confirmPayment() resolving in place, never touches the URL at all.
  // Returns true when it has fully handled the load (so the caller skips its
  // normal PaymentIntent setup), false otherwise.
  async function resumeAfterRedirect() {
    const params = new URLSearchParams(location.search);
    const clientSecret = params.get('payment_intent_client_secret');
    if (!clientSecret || !stripeClient) return false;

    // Stripped immediately, before anything async: a refresh of this page
    // must not replay the same return params against a PaymentIntent that
    // has already been resolved one way or the other.
    history.replaceState(null, '', location.pathname);

    let paymentIntent;
    try {
      ({ paymentIntent } = await stripeClient.retrievePaymentIntent(clientSecret));
    } catch (err) {
      stripeErr('Could not confirm your payment. Email support@glowresearch.shop if this persists.');
      return true;
    }

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      $('coPlacedMsg').textContent = 'Payment was not completed. You can try again below.';
      return false; // let the normal flow set up a fresh PaymentIntent to retry against
    }

    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('glow-pending-order') || 'null'); } catch (e) { /* fall through */ }

    if (!pending) {
      // The cart, the shipping address and the email typed in before the
      // redirect lived only in this page's DOM and in sessionStorage, and
      // both are gone if this is a fresh tab, private browsing, or storage
      // was cleared mid-flow. The payment still went through; nothing here
      // can safely guess what to bill it to, so this is an honest dead end
      // rather than a silent failure or a guess.
      $('coPlacedMsg').textContent =
        `Your payment succeeded, but this page lost track of your order details. ` +
        `Email support@glowresearch.shop with this reference and we will finish it by hand: ${paymentIntent.id}`;
      $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return true;
    }

    // The button is handed over so the resume shows the same "Placing your
    // order…" state the direct path does. Without it the shopper lands back
    // from their bank on a checkout page that looks idle while the order is
    // being created, which is several seconds of looking like nothing
    // happened at the one moment they most need to see that it did.
    const resumeBtn = $('coForm') ? $('coForm').querySelector('button[type="submit"]') : null;
    await finishOrder(pending, paymentIntent.id, resumeBtn, null);
    return true;
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

  document.addEventListener('DOMContentLoaded', async () => {
    fillStates();
    renderPayMethods();
    renderSummary();
    checkSession();

    // A return trip from a 3D Secure redirect lands back on this exact page
    // with Stripe's own query params attached. That has to be handled before
    // anything else tries to prepare a fresh PaymentIntent for a checkout
    // that, from the shopper's side, is already over.
    const resumed = await resumeAfterRedirect();
    if (!resumed && typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) {
      ensurePaymentIntent();
    }
    if (!resumed) initExpressPay();

    // the drawer can change the cart while this page is open
    document.addEventListener('glow-cart-change', () => {
      renderSummary();
      if (typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) ensurePaymentIntent();
      // The wallet sheet quotes the cart, so it has to follow it: reprice on
      // every change, and withdraw the offer entirely once the cart is empty
      // rather than leaving a button that would pay for nothing.
      if (typeof GlowExpressPay !== 'undefined') {
        GlowExpressPay.reprice();
        GlowExpressPay.setOffered(cartItems().length > 0);
      }
    });

    $('coShipOptions').addEventListener('change', e => {
      if (e.target.name !== 'shipmethod') return;
      shipId = e.target.value;
      renderSummary();
      if (typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) ensurePaymentIntent();
    });

    $('coEditCart').addEventListener('click', e => {
      e.preventDefault();
      window.GlowCart.open();
    });

    // Tax is priced off state + ZIP, so those are the two fields that matter
    // here — 'change' rather than 'input' so a still-being-typed ZIP does not
    // fire a request on every keystroke, only once the field is left.
    ['coState', 'coZip'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) ensurePaymentIntent();
      });
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

    $('coPromoBtn').addEventListener('click', async () => {
      // Second click while a code is applied removes it — the button's own
      // label already told them this (setPromoUI above), so no confirmation.
      if (appliedPromoCode) {
        appliedPromoCode = null;
        promoDiscount = 0;
        setPromoUI('idle');
        setPromoMsg('', '');
        renderSummary();
        if (typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) ensurePaymentIntent();
        return;
      }

      const code = $('coPromo').value.trim();
      if (!code) {
        setPromoMsg('error', 'Enter a code first.');
        return;
      }

      const btn = $('coPromoBtn');
      btn.disabled = true;
      setPromoMsg('neutral', 'Checking…');

      try {
        const items = window.GlowCart ? window.GlowCart.items() : [];
        // Validated against the live cart and shipping method so a minimum-
        // order restriction on the code is checked against what is actually
        // in the cart right now, not a stale figure. This call never changes
        // what gets charged — it only reports what the code is worth — the
        // PaymentIntent itself is only ever updated by ensurePaymentIntent()
        // below, which re-validates the same code against Stripe again.
        const resp = await fetch('/api/apply-promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ code, items, shippingMethodId: shipId }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.valid) {
          setPromoMsg('error', data.error || 'That code doesn’t exist.');
          return;
        }

        appliedPromoCode = data.code;
        setPromoUI('applied');
        setPromoMsg('ok', `Applied: ${money(data.discount)} off.`);

        if (typeof PAYMENTS_LIVE !== 'undefined' && PAYMENTS_LIVE && stripeClient) await ensurePaymentIntent();
        else renderSummary();
      } catch (e) {
        setPromoMsg('error', 'Could not check that code right now. Try again.');
      } finally {
        btn.disabled = false;
      }
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

      if (!stripeClient || !elements) {
        $('coPlacedMsg').textContent = 'Payment is not ready yet. Give it a moment and try again.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      setPlaceBtn(submitBtn, 'Confirming payment…', true);
      $('coPlacedMsg').textContent = '';

      const payload = {
        customer: { email: $('coEmail').value },
        shipping: shipAddr,
        billing: billAddr,
        items,
        shippingMethod: { id: opt.id, label: opt.label, cost: shippingCost(sub) },
        promoCode: appliedPromoCode,
        termsAccepted: true,
      };

      // A shipping toggle or a cart change fires ensurePaymentIntent(), and
      // that request can still be in the air when this button is pressed a
      // moment later. Confirming against a PaymentIntent that has not caught
      // up yet charges the old total, and api/create-order.js then reprices
      // the cart as it now stands, finds the two do not agree, and refuses to
      // create the order — leaving the shopper charged for an order that does
      // not exist, which is the worst outcome this checkout can produce.
      //
      // A plain drain is not enough for tax specifically: only state/zip
      // changing fires ensurePaymentIntent() (see the coState/coZip
      // listeners), so a street address or city typed afterward — with state
      // and zip left alone — would confirm against a PaymentIntent tax was
      // never recalculated for. Calling it once more here, with every address
      // field now filled in, is what makes the amount about to be confirmed
      // match the address about to be submitted. ensurePaymentIntent() drains
      // any call already in flight before starting its own, so this also
      // covers the ordinary race the comment above describes. payload rides
      // along on this call so it lands in the PaymentIntent's own metadata —
      // see the comment on ensurePaymentIntent's orderPayload param.
      await ensurePaymentIntent(payload);

      // Stashed before confirmPayment() runs, not after: a redirect-based
      // confirmation (3D Secure) leaves this page entirely and comes back to
      // a fresh load with none of the above still in memory.
      // resumeAfterRedirect() reads this back out on the way back.
      try { sessionStorage.setItem('glow-pending-order', JSON.stringify(payload)); } catch (e) { /* private mode — see resumeAfterRedirect's own fallback message */ }

      let confirmResult;
      try {
        confirmResult = await stripeClient.confirmPayment({
          elements,
          confirmParams: {
            return_url: location.origin + location.pathname,
            receipt_email: payload.customer.email || undefined,
            // The Payment Element was created with billingDetails all set to
            // 'never' (see ensurePaymentIntent), so nothing was collected for
            // this on screen — it has to be supplied here instead, from the
            // shipping address already on the form, or AVS runs with nothing
            // to check the card against at all rather than the address the
            // shopper actually typed.
            payment_method_data: {
              billing_details: {
                name: [shipAddr.firstName, shipAddr.lastName].filter(Boolean).join(' ') || undefined,
                email: payload.customer.email || undefined,
                address: {
                  line1: shipAddr.address1 || undefined,
                  line2: shipAddr.address2 || undefined,
                  city: shipAddr.city || undefined,
                  state: shipAddr.state || undefined,
                  postal_code: shipAddr.zip || undefined,
                  country: 'US',
                },
              },
            },
          },
          redirect: 'if_required',
        });
      } catch (err) {
        confirmResult = { error: { message: err.message || 'Could not reach the payment processor.' } };
      }

      if (confirmResult.error) {
        // No redirect happened and no charge went through — the ordinary
        // shape of a declined card or an incomplete field. Safe to let them
        // try again with the same mounted fields.
        try { sessionStorage.removeItem('glow-pending-order'); } catch (e) {}
        setPlaceBtn(submitBtn, 'Place order', false);
        $('coPlacedMsg').textContent = confirmResult.error.message || 'Your payment could not be confirmed. Please try again.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      const { paymentIntent } = confirmResult;
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        // Reachable for a payment method that settles asynchronously rather
        // than a redirect or an immediate result — none of the card networks
        // Payment Element offers here behave this way, so this is a backstop
        // for a case this form should not actually produce, not a path
        // someone is expected to hit. The stash is cleared like the decline
        // path above clears it: nothing is going to come back and finish this
        // order, so leaving it behind only risks a later load finding it.
        try { sessionStorage.removeItem('glow-pending-order'); } catch (e) {}
        setPlaceBtn(submitBtn, 'Place order', false);
        $('coPlacedMsg').textContent = 'Your payment is still processing. Refresh this page in a moment.';
        $('coPlacedMsg').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      // signedInUser comes from a real /api/me check at page load — the
      // authoritative answer. Someone already signed in has nothing to sign
      // up for, and the checkbox is hidden for them, but this is read at the
      // point accountCreds is built rather than trusted to have stayed hidden.
      const accountCreds = (!signedInUser && $('coMakeAcct').checked)
        ? { email: $('coEmail').value, pass: $('coPass').value, makeAcct: true }
        : null;

      await finishOrder(payload, paymentIntent.id, submitBtn, accountCreds);
    });
  });
})();
