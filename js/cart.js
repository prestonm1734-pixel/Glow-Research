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

  const money = n => '$' + n.toFixed(2);
  const count = () => items.reduce((n, i) => n + i.qty, 0);
  const subtotal = () => items.reduce((n, i) => n + i.unitSale * i.qty, 0);
  const savings = () => items.reduce((n, i) => n + (i.unitOriginal - i.unitSale) * i.qty, 0);

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
    const onSale = item.unitOriginal > item.unitSale;
    const off = bulkSavingPct(item.unitOriginal, item.unitSale);
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
              ${onSale ? `<span class="cart-was">${money(item.unitOriginal * item.qty)}</span>` : ''}
              <span class="cart-now">${money(item.unitSale * item.qty)}</span>
              ${off ? `<span class="cart-off">Save ${off}%</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
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
          <p class="cart-empty-d">Every batch ships cold, with documentation behind it.</p>
          <a href="${catalogHref()}" class="btn btn-primary">Browse the catalog <span aria-hidden="true">&rarr;</span></a>
        </div>
      `;
      foot.innerHTML = '';
      foot.hidden = true;
      return;
    }

    foot.hidden = false;
    body.innerHTML = shippingHtml() +
      '<div class="cart-rows">' + items.map(rowHtml).join('') + '</div>';

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
        <li>Lot-matched COA</li>
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
    const key = item.name + '::' + item.variant;
    const found = items.find(i => i.name + '::' + i.variant === key);
    if (found) found.qty += (item.qty || 1);
    else items.push({
      name: item.name,
      variant: item.variant,
      qty: item.qty || 1,
      unitOriginal: item.unitOriginal,
      unitSale: item.unitSale,
    });
    save();
    render();
    toast();
  }

  // items() hands back copies so callers (the checkout page) cannot mutate
  // cart state behind our back
  window.GlowCart = {
    add, open, close, count, subtotal,
    items: () => items.map(i => Object.assign({}, i)),
    savings,
    FREE_SHIPPING_AT,
  };

  document.addEventListener('DOMContentLoaded', renderBadge);
  renderBadge();

  document.querySelectorAll('.nav-cart').forEach(b => b.addEventListener('click', open));
})();

/* ===================== nav dropdown =====================
   Lives here because cart.js is the one script every page loads, so the
   Resources menu gets one implementation rather than eleven copies.

   A disclosure, not a hover menu: click toggles, Escape closes and
   returns focus to the button, and a click anywhere outside closes it.
   Hover-only menus cannot be opened on touch and are awkward by
   keyboard, and this same markup has to work inside the mobile drawer. */
(function () {
  document.querySelectorAll('.nav-group').forEach(group => {
    const btn = group.querySelector('.nav-group-btn');
    const menu = group.querySelector('.nav-menu');
    if (!btn || !menu) return;

    const setOpen = on => {
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      menu.hidden = !on;
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });

    // a click inside the menu is a link doing its job, so let it through
    menu.addEventListener('click', e => e.stopPropagation());

    document.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || menu.hidden) return;
      setOpen(false);
      btn.focus();
    });

    /* Tabbing out of the group closes it.
       This has to read e.relatedTarget, not document.activeElement.
       focusout fires on mousedown, before mouseup, and at that moment
       activeElement is still transitioning (it reads as <body>), so an
       activeElement check concluded focus had left, hid the menu, and
       destroyed the link before the click could land on it: pressing Blog
       or Peptide Calculator did nothing at all. relatedTarget is the
       element focus is actually heading to, so a press on a menu link
       keeps the menu open long enough to follow it.
       When relatedTarget is null, focus is going nowhere nameable (some
       browsers do not focus a clicked link), so leave it open and let the
       document click handler above close it. */
    group.addEventListener('focusout', e => {
      if (e.relatedTarget && !group.contains(e.relatedTarget)) setOpen(false);
    });
  });
})();
