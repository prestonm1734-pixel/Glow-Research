// ===================== Glow Research — quick-add modal =====================
// UI-only for now: WooCommerce will back this with real variant IDs and cart
// calls later. window.openQuickAdd(product, { bumpCart }) is the entry point,
// called from products-data.js when a card's "+" button is pressed.
(function () {
  let overlay, sheet, lastFocused;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'qa-overlay';
    overlay.innerHTML = `
      <div class="qa-sheet" role="dialog" aria-modal="true" aria-label="Add to cart">
        <div class="qa-handle" aria-hidden="true"></div>
        <div class="qa-head">
          <span class="qa-thumb"><span class="vial"></span></span>
          <div class="qa-head-copy">
            <h3 class="qa-name" id="qaName"></h3>
            <p class="qa-price-range" id="qaPriceRange"></p>
          </div>
          <button type="button" class="qa-close" id="qaClose" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <p class="qa-label">Tap a quantity to add to cart</p>
        <div class="qa-rows" id="qaRows"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#qaClose').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  function row(product, variant, opts) {
    const el = document.createElement('div');
    el.className = 'qa-row';
    el.innerHTML = `
      <span class="qa-row-label">${variant.label}</span>
      <span class="qa-row-right">
        <span class="qa-row-price">
          ${variant.original !== variant.sale ? `<span class="qa-row-was">$${variant.original.toFixed(2)}</span>` : ''}
          <span class="qa-row-now">$${variant.sale.toFixed(2)}</span>
        </span>
        <button type="button" class="qa-row-add" aria-label="Add ${variant.qty} ${product.name} vial pack to cart">+</button>
      </span>
    `;
    const btn = el.querySelector('.qa-row-add');
    btn.addEventListener('click', () => {
      if (opts.bumpCart) opts.bumpCart();
      btn.classList.add('added');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      setTimeout(() => {
        btn.classList.remove('added');
        btn.textContent = '+';
      }, 1400);
    });
    return el;
  }

  function open(product, opts) {
    opts = opts || {};
    if (!overlay) build();
    lastFocused = document.activeElement;

    overlay.querySelector('#qaName').textContent = product.name;
    const variants = getProductVariants(product);
    const sales = variants.map(v => v.sale);
    const lo = Math.min(...sales), hi = Math.max(...sales);
    overlay.querySelector('#qaPriceRange').textContent = `$${lo.toFixed(2)} – $${hi.toFixed(2)}`;

    const rowsEl = overlay.querySelector('#qaRows');
    rowsEl.innerHTML = '';
    variants.forEach(v => rowsEl.appendChild(row(product, v, opts)));

    overlay.classList.add('open');
    document.body.classList.add('search-locked');
    setTimeout(() => overlay.querySelector('#qaClose').focus(), 30);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('search-locked');
    if (lastFocused) lastFocused.focus();
  }

  window.openQuickAdd = open;
})();
