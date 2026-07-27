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
  const FREE_SHIPPING_AT = 250;   // matches the "FREE SHIPPING OVER $250" marquee

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
    const off = onSale ? Math.round((1 - item.unitSale / item.unitOriginal) * 100) : 0;
    return `
      <div class="cart-row" data-i="${i}">
        <span class="cart-thumb"><span class="vial"></span></span>
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
              ${onSale ? `<span class="cart-off">Save ${off}%</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    renderBadge();
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
        You&rsquo;re saving ${money(saved)}</p>` : ''}
      <div class="cart-subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
      <p class="cart-tax">Shipping &amp; taxes calculated at checkout.</p>
      <button type="button" class="btn btn-primary cart-checkout" id="cartCheckout">
        Checkout <span aria-hidden="true">&rarr;</span>
      </button>
      <p class="cart-checkout-msg" id="cartCheckoutMsg" role="status" aria-live="polite"></p>
      <ul class="cart-trust">
        <li>Discreet shipping</li>
        <li>COA on every lot</li>
      </ul>
    `;

    foot.querySelector('#cartCheckout').addEventListener('click', () => {
      foot.querySelector('#cartCheckoutMsg').textContent =
        'Checkout is not connected yet. Your cart is saved.';
    });
  }

  // the nav already carries a correctly-depthed link to the catalog, so reuse it
  function catalogHref() {
    const link = document.querySelector('#mainNav a[href$="peptides.html"]');
    return link ? link.getAttribute('href') : 'peptides.html';
  }

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
  }

  window.GlowCart = { add, open, close, count, subtotal };

  document.addEventListener('DOMContentLoaded', renderBadge);
  renderBadge();

  document.querySelectorAll('.nav-cart').forEach(b => b.addEventListener('click', open));
})();
