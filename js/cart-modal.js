// ===================== Glow Research — quick-add modal =====================
// Offers the compound's real mg sizes, the same list the product page's
// picker uses, so what is added here and what is added there are the same
// thing. It used to offer 1/2/3-vial bulk packs from a mock tier table,
// which answered a question nobody asks before they have chosen a size.
//
// WooCommerce will back this with real variant IDs and cart calls later.
// window.openQuickAdd(product) is the entry point, called from
// products-data.js when a card's "+" button is pressed.
(function () {
  let overlay, sheet, lastFocused;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'qa-overlay';
    overlay.innerHTML = `
      <div class="qa-sheet" role="dialog" aria-modal="true" aria-label="Add to cart">
        <div class="qa-handle" aria-hidden="true"></div>
        <div class="qa-head">
          <div class="qa-head-copy">
            <h3 class="qa-name" id="qaName"></h3>
            <p class="qa-sub">Choose a size</p>
          </div>
          <button type="button" class="qa-close" id="qaClose" aria-label="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
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

  // The whole row is the button. A 34px "+" beside a row that already looks
  // tappable is a small target next to a large dead one.
  function row(product, size) {
    const sale = salePrice(size.price);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'qa-row';
    el.setAttribute('aria-label', `Add ${size.mg} of ${product.name} to cart, ${fmtPrice(sale)}`);
    el.innerHTML = `
      <span class="qa-row-label">${size.mg}</span>
      <span class="qa-row-price">
        ${onSaleNow() ? `<span class="qa-row-was">${fmtPrice(size.price)}</span>` : ''}
        <span class="qa-row-now">${fmtPrice(sale)}</span>
      </span>
      <span class="qa-row-mark" aria-hidden="true">
        <svg class="qa-plus" width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <svg class="qa-tick" width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;
    el.addEventListener('click', () => {
      if (window.GlowCart) {
        window.GlowCart.add({
          name: product.name,
          variant: size.mg,
          unitOriginal: size.price,
          unitSale: sale,
        });
      }
      el.classList.add('added');
      setTimeout(() => el.classList.remove('added'), 1400);
    });
    return el;
  }

  function open(product) {
    if (!overlay) build();
    lastFocused = document.activeElement;

    overlay.querySelector('#qaName').textContent = product.name;

    const rowsEl = overlay.querySelector('#qaRows');
    rowsEl.innerHTML = '';
    (product.sizes || []).forEach(sz => rowsEl.appendChild(row(product, sz)));

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
