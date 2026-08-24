// ===================== Glow Research — cart =====================
// Holds cart state and renders the slide-out drawer. UI only for now:
// WooCommerce will own the real cart and checkout later, so everything here
// is deliberately behind one small surface (window.GlowCart) that can be
// swapped for real cart calls without touching the markup.
//
// State persists to localStorage so the cart survives navigation between
// pages, which is the whole point of a header cart on a multi-page site.
(function () {
  const KEY = 'glow-cart-v1';
  const FREE_SHIPPING_AT = 400;   // matches the "FREE SHIPPING OVER $400" marquee

  let items = load();
  let drawer, overlay, lastFocused;

  /* ---------- state ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];   // private mode, quota, or corrupt value: start empty
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* not fatal */ }
  }

  // fmtPrice() (js/products-data.js) is where "$65, not $65.00" is decided.
  const money = fmtPrice;
  const count = () => items.reduce((n, i) => n + i.qty, 0);

  // What a vial on this line costs right now, priced from the line's own
  // quantity rather than from whatever was stored when it was added.
  //
  // This has to be derived. Bulk pricing is a function of quantity, and the
  // quantity changes in three places after the line is created: the +/- in
  // this drawer, and add() merging a second helping into an existing line. A
  // stored unitSale is a snapshot of the moment it was added, so stepping a
  // line from 2 to 5 kept charging the 2-vial rate, and adding 1 vial and then
  // 2 more charged the 1-vial rate on all three. The customer reaching a tier
  // and not being given it is the version of this that actually costs them
  // money.
  const lineUnit = i => (typeof unitPriceAt === 'function'
    ? unitPriceAt(i.unitOriginal, i.qty)
    : i.unitSale);

  // What the struck-through price is measured against. Two separate things can
  // put a line below its reference: the launch list price in the catalog
  // (unitList, display only) and a bulk tier (unitOriginal, which is what
  // lineUnit actually charges from). Whichever is higher is the honest
  // reference, and taking the max keeps a line that has both from quoting the
  // smaller of the two.
  const lineRef = i => Math.max(Number(i.unitList) || 0, i.unitOriginal);

  const subtotal = () => items.reduce((n, i) => n + lineUnit(i) * i.qty, 0);
  const savings = () => items.reduce((n, i) => n + (lineRef(i) - lineUnit(i)) * i.qty, 0);

  // Looked up once when a line is created. Returns '' rather than throwing
  // for anything the catalog does not hold: an unknown line is add()'s
  // problem to have avoided, and priceOrder() on the server rejects it either
  // way, so there is nothing gained by failing louder here.
  function skuFor(name, variant) {
    if (typeof GLOW_PRODUCTS === 'undefined') return '';
    const p = GLOW_PRODUCTS.find(pr => pr.name === name);
    const size = p && p.sizes.find(s => s.mg === variant);
    return (size && size.sku) || '';
  }

  // Same lookup for the struck-through launch price. Returns 0 for a line the
  // catalog no longer holds, which renders as no struck price at all rather
  // than a stale one.
  function listFor(name, variant) {
    if (typeof GLOW_PRODUCTS === 'undefined') return 0;
    const p = GLOW_PRODUCTS.find(pr => pr.name === name);
    const size = p && p.sizes.find(s => s.mg === variant);
    return (typeof listPriceOf === 'function' && size) ? listPriceOf(size) : 0;
  }

  /* ---------- badge ---------- */

  function renderBadge() {
    const n = count();
    document.querySelectorAll('.nav-cart-badge').forEach(b => {
      b.textContent = n;
      b.dataset.count = n;
      b.classList.remove('bump');
      void b.offsetWidth;          // restart the animation on repeat adds
      b.classList.add('bump');
    });
  }

  /* ---------- drawer ---------- */

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.innerHTML = `
      <aside class="cart-drawer" role="dialog" aria-modal="true" aria-label="Your cart">
        <header class="cart-head">
          <h2 class="cart-title">Your cart <span class="cart-count" id="cartDrawerCount">0</span></h2>
          <button type="button" class="cart-close" id="cartClose" aria-label="Close cart">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </header>
        <div class="cart-body" id="cartBody"></div>
        <footer class="cart-foot" id="cartFoot"></footer>
      </aside>
    `;
    document.body.appendChild(overlay);
    drawer = overlay.querySelector('.cart-drawer');

    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#cartClose').addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  function shippingHtml() {
    const sub = subtotal();
    const left = FREE_SHIPPING_AT - sub;
    const pct = Math.min(100, (sub / FREE_SHIPPING_AT) * 100);
    const msg = left > 0
      ? `Add <strong>${money(left)}</strong> more for free shipping`
      : `<strong>Free shipping unlocked.</strong>`;
    return `
      <div class="cart-ship">
        <p class="cart-ship-msg">${msg}</p>
        <div class="cart-ship-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="${Math.round(pct)}" aria-label="Progress toward free shipping">
          <span style="width:${pct}%"></span>
        </div>
      </div>
    `;
  }

  function rowHtml(item, i) {
    const unit = lineUnit(item);
    const ref = lineRef(item);
    const onSale = ref > unit;
    // Deliberately measured from unitOriginal, not ref: the "Save N%" badge is
    // for bulk tiers only. The launch markdown is never stated as a percentage
    // anywhere on the site, so folding it in here would be the one place that
    // does, and it would read as a bulk saving the quantity has not earned.
    const off = bulkSavingPct(item.unitOriginal, unit);
    return `
      <div class="cart-row" data-i="${i}">
        <span class="cart-thumb">${typeof productThumb === 'function' ? productThumb(item.name) : '<span class="vial"></span>'}</span>
        <div class="cart-row-main">
          <div class="cart-row-top">
            <div>
              <p class="cart-row-name">${item.name}</p>
              <p class="cart-row-variant">${item.variant}</p>
            </div>
            <button type="button" class="cart-remove" data-act="remove"
                    aria-label="Remove ${item.name}, ${item.variant}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="cart-row-bottom">
            <div class="cart-qty">
              <button type="button" data-act="dec" aria-label="Decrease quantity">&minus;</button>
              <span class="cart-qty-n" aria-label="Quantity">${item.qty}</span>
              <button type="button" data-act="inc" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-row-price">
              <span class="cart-now">${money(unit * item.qty)}</span>
              ${onSale ? `<span class="cart-was">${money(ref * item.qty)}</span>` : ''}
              ${off ? `<span class="cart-off">Save ${off}%</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------- accessory offer ----------
     Shown under the line items, and only ever to somebody who already has
     something in the cart to reconstitute: the empty state returns before this
     is reached, which is the point. Nothing here is typed in. The size and the
     price come from cartUpsell(), which reads the catalog row, so the drawer
     cannot offer a price the product page disagrees with or a vial that is out
     of stock.

     It disappears for good once the water is in the cart. Keyed on the product
     name rather than the exact size, so somebody who already added the 3mL
     from the catalog is not asked to buy water a second time. A module that
     keeps asking after the answer was yes is not an offer. */
  function upsellHtml() {
    if (typeof cartUpsell !== 'function') return '';
    const u = cartUpsell();
    if (!u || items.some(i => i.name === u.product.name)) return '';
    const thumb = typeof productThumb === 'function'
      ? productThumb(u.product.name) : '<span class="vial"></span>';
    return `
      <div class="cart-upsell">
        <span class="cart-upsell-thumb">${thumb}</span>
        <div class="cart-upsell-main">
          <p class="cart-upsell-t">Don't forget ${u.product.name}</p>
          <p class="cart-upsell-d">${u.size.mg} &middot; ${money(salePrice(u.size.price))}</p>
        </div>
        <button type="button" class="cart-upsell-add" data-act="upsell"
                aria-label="Add ${u.product.name} ${u.size.mg} to cart">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          Add
        </button>
      </div>
    `;
  }

  function addUpsell() {
    const u = cartUpsell();
    if (!u) return;   // the button is only rendered when it resolves; this is the backstop
    add({
      name: u.product.name,
      variant: u.size.mg,
      unitOriginal: u.size.price,
      unitList: listPriceOf(u.size),
      unitSale: salePrice(u.size.price),
    });
  }

  function render() {
    renderBadge();
    // the checkout page mirrors the cart, so it needs to know when it moves
    document.dispatchEvent(new CustomEvent('glow-cart-change'));
    if (!overlay) return;

    overlay.querySelector('#cartDrawerCount').textContent = count();
    const body = overlay.querySelector('#cartBody');
    const foot = overlay.querySelector('#cartFoot');

    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <p class="cart-empty-t">Your cart is empty.</p>
          <p class="cart-empty-d">Every order ships cold, with a lot COA on request.</p>
          <a href="${catalogHref()}" class="btn btn-primary">Browse the catalog <span aria-hidden="true">&rarr;</span></a>
        </div>
      `;
      foot.innerHTML = '';
      foot.hidden = true;
      return;
    }

    foot.hidden = false;
    body.innerHTML = shippingHtml() +
      '<div class="cart-rows">' + items.map(rowHtml).join('') + '</div>' +
      upsellHtml();

    const saved = savings();
    foot.innerHTML = `
      ${saved > 0 ? `<p class="cart-saving">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${money(saved)} off, already applied</p>` : ''}
      <div class="cart-subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
      <p class="cart-tax">Shipping and tax worked out at checkout.</p>
      <a href="${pageHref('checkout.html')}" class="btn btn-primary cart-checkout">
        Checkout <span aria-hidden="true">&rarr;</span>
      </a>
      <ul class="cart-trust">
        <li>Unmarked packaging</li>
        <li>${COA_COPY.short}</li>
      </ul>
    `;

  }

  // Blog articles live two directories deep, so a bare "checkout.html" would
  // 404 from there. The nav already carries a correctly-depthed link, so lift
  // its prefix rather than tracking depth separately.
  function pageHref(file) {
    const link = document.querySelector('#mainNav a[href$="peptides.html"]');
    const prefix = link ? link.getAttribute('href').replace(/peptides\.html$/, '') : '';
    return prefix + file;
  }
  const catalogHref = () => pageHref('peptides.html');

  /* ---------- events ---------- */

  function onBodyClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    // The accessory offer is not a line item. It has no row and no index, so
    // it is answered before the lookup below, which would throw on it.
    if (btn.dataset.act === 'upsell') { addUpsell(); return; }

    const row = btn.closest('.cart-row');
    const i = Number(row.dataset.i);
    const act = btn.dataset.act;

    if (act === 'remove') items.splice(i, 1);
    else if (act === 'inc') items[i].qty += 1;
    else if (act === 'dec') {
      items[i].qty -= 1;
      if (items[i].qty < 1) items.splice(i, 1);
    }
    save();
    render();
  }

  function open() {
    if (!overlay) { build(); overlay.querySelector('#cartBody').addEventListener('click', onBodyClick); }
    lastFocused = document.activeElement;
    render();
    overlay.classList.add('open');
    document.body.classList.add('search-locked');
    setTimeout(() => overlay.querySelector('#cartClose').focus(), 30);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('search-locked');
    if (lastFocused) lastFocused.focus();
  }

  /* ---------- toast ----------
     One toast for every add-to-cart entry point (product page, quick-add,
     checkout upsell) since they all funnel through add() below. */
  let toastEl, toastTimer;

  function toast() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cart-toast';
      toastEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Added to cart</span>
        <button type="button" class="cart-toast-view">View cart</button>
      `;
      document.body.appendChild(toastEl);
      toastEl.querySelector('.cart-toast-view').addEventListener('click', () => { open(); hideToast(); });
    }
    clearTimeout(toastTimer);
    toastEl.classList.add('is-shown');
    toastTimer = setTimeout(hideToast, 2600);
  }

  function hideToast() {
    if (toastEl) toastEl.classList.remove('is-shown');
  }

  /* ---------- public surface ---------- */

  function add(item) {
    // Fire-and-forget funnel signal for the internal dashboard's live map
    // (see js/analytics.js); undefined harmlessly if that script hasn't
    // loaded, so cart.js gains no dependency on it.
    if (window.GlowAnalytics) window.GlowAnalytics.track('cart_add');
    const key = item.name + '::' + item.variant;
    const found = items.find(i => i.name + '::' + i.variant === key);
    if (found) found.qty += (item.qty || 1);
    else items.push({
      name: item.name,
      variant: item.variant,
      // Resolved here rather than asked of every caller, because every caller
      // already knows the name and size and none of them knew to send this.
      // priceOrder() in api/_lib.js prices against the SKU when a line
      // carries one, so a line recorded now survives the product being
      // renamed later; without it the cart dies at the payment step.
      sku: item.sku || skuFor(item.name, item.variant),
      qty: item.qty || 1,
      unitOriginal: item.unitOriginal,
      // Display only, and resolved from the catalog when a caller does not
      // send it, so a line saved before `list` existed still shows the struck
      // price after a reload rather than silently losing it.
      unitList: Number(item.unitList) || listFor(item.name, item.variant),
      unitSale: item.unitSale,
    });
    save();
    render();
    // The toast exists to tell you something happened somewhere you cannot
    // see, and to offer a way to go look. With the drawer already open you are
    // looking at it: the row appears, the subtotal moves, the accessory offer
    // takes itself down. A banner over the top of that saying "view cart" is
    // covering the thing it is pointing at.
    if (!overlay || !overlay.classList.contains('open')) toast();
  }

  function clear() {
    items = [];
    save();
    render();
  }

  // items() hands back copies so callers (the checkout page) cannot mutate
  // cart state behind our back
  window.GlowCart = {
    add, open, close, count, subtotal, clear,
    // unitSale is overwritten with the price this line's quantity actually
    // earns. js/checkout.js and api/create-order.js both total from it, so a
    // stale stored figure here is what the customer would be charged.
    items: () => items.map(i => Object.assign({}, i, { unitSale: lineUnit(i) })),
    savings,
    FREE_SHIPPING_AT,
  };

  document.addEventListener('DOMContentLoaded', renderBadge);
  renderBadge();

  // Safari (and other browsers) can restore this exact page, JS state and
  // all, from the back-forward cache on a back/forward navigation, without
  // re-running any script. If the cart changed on a page visited in
  // between, this page's `items` and badge are still whatever they were
  // before it was cached, until something else forces a re-render. Reload
  // from localStorage whenever that restore happens.
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    items = load();
    renderBadge();
    if (overlay && overlay.classList.contains('open')) render();
  });

  document.querySelectorAll('.nav-cart').forEach(b => b.addEventListener('click', open));
})();

