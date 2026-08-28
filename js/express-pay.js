// ===================== Glow Research — express wallet pay =====================
// The Apple Pay / Google Pay flow, shared by every page that offers one.
//
// A native wallet button, not a styled lookalike: Stripe's Payment Request
// Button renders whatever the browser's own sheet looks like, and
// canMakePayment() only resolves true once the visitor's device actually has
// one configured, so the block stays hidden everywhere else. Nothing on any
// page claims wallet support it cannot show.
//
// It skips the cart and the checkout form entirely: the sheet collects name,
// email, phone and shipping address, and those go straight to
// api/create-order. It posts to the same api/create-payment-intent and
// api/create-order the typed-card checkout uses, so a wallet purchase is
// priced and verified identically. Nothing here trusts the browser for an
// amount.
//
// This file exists because that flow is now offered from two places, the
// product buy box and the top of checkout, and a second copy of order-placing
// logic in a payment path is the last thing this codebase should carry. What
// differs between the two callers is only what is being bought, which is why
// init() takes it as functions rather than reading a product or a cart itself.
//
// No imports, per CLAUDE.md: loaded by a <script> tag and read off the global,
// the same way js/products-data.js is.
//
// EXPRESS_SHIPPING mirrors the SHIPPING table in js/checkout.js and
// SHIPPING_RATES in api/_lib.js by hand, the same duplication CLAUDE.md
// already accepts between those two. check-claims.js pins all three together.
(function () {
  // Set by init(). Everything product- or cart-specific reaches this file
  // through it: items(), subtotal(), label(), canOffer(), and the mount points.
  let cfg = null;

  const EXPRESS_SHIPPING = [
    { id: '2day', label: 'FedEx 2-Day Express', cost: 12.95, freeOver: 250 },
  ];

  function expressShippingCost(id, subtotal) {
    const rate = EXPRESS_SHIPPING.find(r => r.id === id) || EXPRESS_SHIPPING[0];
    return (rate.freeOver !== null && subtotal >= rate.freeOver) ? 0 : rate.cost;
  }

  function expressShippingOptions(subtotal) {
    return EXPRESS_SHIPPING.map(r => {
      const cost = expressShippingCost(r.id, subtotal);
      return { id: r.id, label: r.label, detail: cost === 0 ? 'Free' : '', amount: Math.round(cost * 100) };
    });
  }

  let expressPR = null;
  let expressStripeClient = null;
  // Carried across every price call for one wallet session so
  // api/create-payment-intent.js updates the same PaymentIntent in place
  // rather than minting a new one on every address or shipping-option
  // change, the identical reasoning js/checkout.js's ensurePaymentIntent()
  // already follows.
  let expressPaymentIntentId = null;
  // Stripe's shippingoptionchange event does not repeat the address, only
  // shippingaddresschange does — cached here so a shipping-option change can
  // still reprice tax against the address the sheet is currently showing.
  let expressLastAddress = null;

  // Stripe's PaymentAddress shape (from a paymentRequest event) translated to
  // the {address1, city, state, zip} shape api/_lib.js's calculateTax()
  // reads. Apple Pay in particular withholds the street line and city until
  // after the sheet is authorized, for the shopper's privacy — region and
  // postal code are what is available before then, and are enough for
  // Stripe Tax to price against; the full address arrives with the
  // paymentmethod event and is what actually gets billed and shipped to.
  function expressTaxAddress(a) {
    if (!a) return null;
    return {
      address1: (a.addressLine && a.addressLine[0]) || '',
      address2: (a.addressLine && a.addressLine[1]) || '',
      city: a.city || '',
      state: a.region || '',
      zip: a.postalCode || '',
    };
  }

  // The one call every step of the wallet flow prices through: same
  // endpoint, same catalog-derived pricing, same Stripe Tax calculation
  // js/checkout.js uses. Returns null on any failure rather than throwing,
  // so a tax-service hiccup mid-sheet degrades to "no tax yet" instead of
  // breaking the payment sheet open in front of someone.
  async function expressPriceRemote(shippingId, address, email) {
    try {
      const resp = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cfg.items(),
          shippingMethodId: shippingId,
          address,
          email,
          paymentIntentId: expressPaymentIntentId,
          ...(window.GlowAnalytics ? { analytics: window.GlowAnalytics.ids() } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      expressPaymentIntentId = data.paymentIntentId;
      return data;
    } catch (err) {
      return null;
    }
  }

  async function handleExpressPayment(ev) {
    showError('');
    const shippingId = (ev.shippingOption && ev.shippingOption.id) || EXPRESS_SHIPPING[0].id;
    const shippingRate = EXPRESS_SHIPPING.find(r => r.id === shippingId) || EXPRESS_SHIPPING[0];
    const addr = ev.shippingAddress || {};
    const nameParts = ((addr.recipient || ev.payerName || '').trim()).split(/\s+/).filter(Boolean);
    const shipping = {
      firstName: nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
      address1: (addr.addressLine && addr.addressLine[0]) || '',
      address2: (addr.addressLine && addr.addressLine[1]) || '',
      city: addr.city || '',
      state: addr.region || '',
      zip: addr.postalCode || '',
    };
    const email = ev.payerEmail || '';
    const items = cfg.items();

    // One more price call with the full address the sheet just handed over
    // (street and city included, unlike the address-change preview above),
    // so the amount confirmed below is priced from exactly what is about to
    // be billed and shipped to — not the partial-address estimate the sheet
    // was showing a moment earlier.
    const piData = await expressPriceRemote(shippingId, shipping, email);
    if (!piData) {
      ev.complete('fail');
      showError('Could not start payment.');
      return;
    }

    if (window.GlowAnalytics) window.GlowAnalytics.track('payment_attempted');

    let confirmResult;
    try {
      confirmResult = await expressStripeClient.confirmCardPayment(
        piData.clientSecret,
        { payment_method: ev.paymentMethod.id },
        { handleActions: false },
      );
    } catch (err) {
      confirmResult = { error: { message: err.message } };
    }

    if (confirmResult.error) {
      if (window.GlowAnalytics) {
        window.GlowAnalytics.track('payment_failed', {
          errorType: confirmResult.error.type || 'unknown',
          errorCode: confirmResult.error.code || confirmResult.error.decline_code || 'unknown',
        });
      }
      ev.complete('fail');
      showError(confirmResult.error.message || 'Your payment could not be confirmed.');
      return;
    }

    // The sheet closes here. A required 3D Secure challenge is handled below,
    // after it is gone, the same order js/checkout.js follows for the same
    // reason: Stripe does not keep the wallet sheet open for it.
    ev.complete('success');

    let paymentIntent = confirmResult.paymentIntent;
    if (paymentIntent && paymentIntent.status === 'requires_action') {
      const actionResult = await expressStripeClient.confirmCardPayment(piData.clientSecret);
      if (actionResult.error) {
        showError(actionResult.error.message || 'Your payment could not be confirmed.');
        return;
      }
      paymentIntent = actionResult.paymentIntent;
    }

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      showError('Your payment is still processing. Refresh this page in a moment.');
      return;
    }

    // The card is charged by this point. A failure past here is the same dead
    // end finishOrder() in js/checkout.js treats it as, for the same reason:
    // reoffering the button would invite a second charge for an order that
    // already has nothing left to pay for.
    let orderData;
    try {
      const resp = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          customer: { email, phone: ev.payerPhone || '' },
          shipping,
          billing: shipping,
          items,
          shippingMethod: { id: shippingId, label: shippingRate.label },
          termsAccepted: true,
          paymentIntentId: piData.paymentIntentId,
        }),
      });
      orderData = await resp.json();
      if (!resp.ok) throw new Error(orderData.error);
    } catch (err) {
      showError(err.message ||
        `Your payment succeeded, but we could not finish placing the order. ` +
        `Email support@glowresearch.shop with this reference: ${piData.paymentIntentId}`);
      return;
    }

    try {
      sessionStorage.setItem('glow-last-order', JSON.stringify({
        number: orderData.orderNumber,
        status: orderData.status || '',
        date: new Date().toISOString(),
        email,
        name: [shipping.firstName, shipping.lastName].filter(Boolean).join(' '),
        items,
        shipping,
        shippingLabel: shippingRate.label,
        shippingCost: expressShippingCost(shippingId, cfg.subtotal()),
        // api/create-order.js's own figure, re-derived server-side against
        // Stripe Tax rather than trusted from the sheet's last preview.
        tax: orderData.tax || 0,
        hasAccount: false,
      }));
    } catch (e) { /* private mode: thank-you.html shows its no-recent-order state */ }

    if (window.GlowAnalytics) {
      // piData.paymentIntentId doubles as the Meta event ID, same reasoning
      // as the identical line in js/checkout.js.
      window.GlowAnalytics.track('purchase_completed', {
        orderNumber: orderData.orderNumber,
        revenue: orderData.total,
        itemCount: items.reduce((n, i) => n + (i.qty || 1), 0),
      }, piData.paymentIntentId);
    }
    if (cfg.onPlaced) cfg.onPlaced();
    // Depth-aware, and it has to be. This runs on the product page as well as
    // checkout, and the product pages now live at /peptides/<slug>/, two
    // directories down. A bare "thank-you.html" resolved against that path,
    // so a wallet payment that had already been captured and already become an
    // order landed the buyer on a 404 instead of their confirmation. Nobody
    // passes thankYouHref, so this fallback is the live path, not a spare.
    // pageHref() is not guarded: js/products-data.js is loaded ahead of this
    // file on both pages that mount the wallet, which check-claims.js pins.
    location.href = cfg.thankYouHref || pageHref('thank-you.html');
  }

  function init(config) {
    cfg = config;
    const wrap = document.querySelector(cfg.wrap);
    const mount = document.querySelector(cfg.mount);
    if (!wrap || !mount) return;
    if (typeof Stripe === 'undefined') return;
    if (typeof PAYMENTS_LIVE === 'undefined' || !PAYMENTS_LIVE) return;
    if (typeof STRIPE_PUBLISHABLE_KEY === 'undefined' || !STRIPE_PUBLISHABLE_KEY) return;

    const stripeClient = Stripe(STRIPE_PUBLISHABLE_KEY);
    expressStripeClient = stripeClient;

    expressPR = stripeClient.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: { label: cfg.label(), amount: Math.round(cfg.subtotal() * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
      requestShipping: true,
      shippingOptions: expressShippingOptions(cfg.subtotal()),
    });

    const elements = stripeClient.elements();
    const btn = elements.create('paymentRequestButton', {
      paymentRequest: expressPR,
      style: { paymentRequestButton: { type: cfg.buttonType || 'buy', theme: 'dark', height: '48px' } },
    });

    // Only reveals the row once this exact browser confirms it can actually
    // show a wallet sheet. Nothing else on the page claims Apple Pay / Google
    // Pay support, so there is nothing to hide when it can't.
    expressPR.canMakePayment().then(result => {
      if (!result) return;
      btn.mount(cfg.mount);
      // Marks the block as one renderStock() may show again. Without it, a
      // wallet-less browser would get a button the first time an in-stock size
      // was selected.
      wrap.dataset.walletReady = 'true';
      wrap.hidden = !cfg.canOffer();
    });

    // Shipping cost depends only on the subtotal already fixed by the qty and
    // mg selected on this page, so the same two options come back every time
    // — a non-US destination is the one thing actually rejected, since that
    // is genuinely outside what this catalog ships to. Tax is the one figure
    // that does depend on the address, priced through the same
    // api/create-payment-intent call js/checkout.js uses; a failed or slow
    // calculation still resolves the sheet at item + shipping, tax added the
    // moment it is known rather than blocking on it.
    expressPR.on('shippingaddresschange', async (ev) => {
      if (ev.shippingAddress.country !== 'US') {
        ev.updateWith({ status: 'invalid_shipping_address' });
        return;
      }
      expressLastAddress = expressTaxAddress(ev.shippingAddress);
      const sub = cfg.subtotal();
      const shippingOptions = expressShippingOptions(sub);
      const priced = await expressPriceRemote(shippingOptions[0].id, expressLastAddress, '');
      const fallback = sub + expressShippingCost(shippingOptions[0].id, sub);
      ev.updateWith({
        status: 'success',
        shippingOptions,
        total: {
          label: cfg.label(),
          amount: Math.round((priced ? priced.total : fallback) * 100),
        },
      });
    });

    expressPR.on('shippingoptionchange', async (ev) => {
      const sub = cfg.subtotal();
      const cost = expressShippingCost(ev.shippingOption.id, sub);
      const priced = await expressPriceRemote(ev.shippingOption.id, expressLastAddress, '');
      ev.updateWith({
        status: 'success',
        total: {
          label: cfg.label(),
          amount: Math.round((priced ? priced.total : sub + cost) * 100),
        },
      });
    });

    expressPR.on('paymentmethod', (ev) => {
      handleExpressPayment(ev);
    });
  }

  // The wallet sheet's amount, kept in step with whatever the page changed:
  // the qty stepper and mg picker on a product page, the cart contents on
  // checkout. A no-op before the button exists or on a browser where it never
  // will. Item price only; tax is address-dependent and handled by the
  // shipping handlers inside init(), which run where an address exists.
  function reprice() {
    if (!expressPR || !cfg) return;
    expressPR.update({
      total: { label: cfg.label(), amount: Math.round(cfg.subtotal() * 100) },
    });
  }

  // Routed to the caller so the message lands next to the button that failed,
  // rather than this file knowing where either page keeps its error line.
  function showError(msg) {
    if (cfg && cfg.onError) cfg.onError(msg || '');
  }

  // hide()/show() let a caller withdraw the offer without tearing the button
  // down: a sold-out size on a product page, an emptied cart on checkout. Only
  // ever acts on a block canMakePayment() already revealed, so a browser with
  // no wallet is never handed one.
  function setOffered(on) {
    const wrap = cfg && document.querySelector(cfg.wrap);
    if (!wrap || wrap.dataset.walletReady !== 'true') return;
    wrap.hidden = !on;
  }

  window.GlowExpressPay = { init, reprice, setOffered, shippingCost: expressShippingCost };
})();
