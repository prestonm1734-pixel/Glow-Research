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
  let overlay, sheet, lastFocused, dismissTimer;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'qa-overlay';
    overlay.innerHTML = `
      <div class="qa-sheet" role="dialog" aria-modal="true" aria-label="Add to cart">
        <div class="qa-handle" aria-hidden="true"></div>
        <div class="qa-head">
          <div class="qa-thumb" id="qaThumb" aria-hidden="true"></div>
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
    const out = !sizeInStock(size);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'qa-row' + (out ? ' is-out' : '');
    el.disabled = out;
    el.setAttribute('aria-label', out
      ? `${size.mg} of ${product.name} is out of stock`
      : `Add ${size.mg} of ${product.name} to cart, ${fmtPrice(sale)}`);
    el.innerHTML = `
      <span class="qa-row-label">${size.mg}</span>
      <span class="qa-row-price">
        ${out ? '<span class="qa-row-out">Out of stock</span>' : `
        ${onSaleNow() ? `<span class="qa-row-was">${fmtPrice(size.price)}</span>` : ''}
        <span class="qa-row-now">${fmtPrice(sale)}</span>`}
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
      // The cart toast fires immediately from GlowCart.add() and sits at the
      // bottom of the screen, i.e. on top of this sheet. Holding the sheet
      // open to admire the tick just means the two overlap. So the tick is a
      // flash at the point of the tap and the sheet starts leaving straight
      // away — it stays visible through the .28s slide, and by the time it is
      // gone the toast is standing on its own saying the same thing.
      el.classList.add('added');
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(close, 150);
    });
    return el;
  }

  function open(product) {
    if (!overlay) build();
    clearTimeout(dismissTimer);
    lastFocused = document.activeElement;

    overlay.querySelector('#qaName').textContent = product.name;
    // productThumb() is the same lookup the cart and checkout use, so this
    // is the drawn vial glyph for almost everything today and a real photo
    // the moment a product gets one — no separate image logic to keep in
    // step with theirs.
    overlay.querySelector('#qaThumb').innerHTML = productThumb(product.name);

    const rowsEl = overlay.querySelector('#qaRows');
    rowsEl.innerHTML = '';
    (product.sizes || []).forEach(sz => rowsEl.appendChild(row(product, sz)));

    overlay.classList.add('open');
    document.body.classList.add('search-locked', 'qa-open');
    setTimeout(() => overlay.querySelector('#qaClose').focus(), 30);
  }

  function close() {
    if (!overlay) return;
    clearTimeout(dismissTimer);
    overlay.classList.remove('open');
    // dropped here, at the start of the slide, so the toast fades in while
    // the sheet is on its way out rather than after it has gone
    document.body.classList.remove('search-locked', 'qa-open');
    if (lastFocused) lastFocused.focus();
  }

  window.openQuickAdd = open;
})();
