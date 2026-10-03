// The wholesale order builder on wholesale.html.
//
// It keeps no order of its own: every press writes straight into the real
// cart (window.GlowCart.set) and every figure is read back out of it. That is
// the point. The cart prices each line with unitPriceAt() and the order's
// total unit count, exactly as api/_lib.js does when it charges, so the
// total on this page is the total checkout takes. A separate builder state
// would be a second price list waiting to disagree with the first.
(function () {
  if (typeof GLOW_PRODUCTS === 'undefined' || !window.GlowCart) return;

  const $ = id => document.getElementById(id);
  const grid = $('wsGrid');
  if (!grid) return;

  const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const pct = n => Math.round(n * 100) + '%';
  const STEP = WHOLESALE_MIN;
  const TOP = WHOLESALE_TIERS[WHOLESALE_TIERS.length - 1];

  // Which size each card has selected; the first in-stock size to start.
  const picked = {};
  GLOW_PRODUCTS.forEach(p => {
    picked[p.name] = (p.sizes.find(s => sizeInStock(s)) || p.sizes[0]).sku;
  });

  const sizeOf = (p, sku) => p.sizes.find(s => s.sku === sku) || p.sizes[0];
  const lineFor = sku => window.GlowCart.items().find(i => i.sku === sku);
  const cartUnits = () => window.GlowCart.items().reduce((n, i) => n + i.qty, 0);

  function itemFor(p, s) {
    return { name: p.name, variant: s.mg, sku: s.sku, unitOriginal: s.price, unitList: listPriceOf(s) };
  }

  /* ---------- product cards ---------- */

  function cardHtml(p) {
    const s = sizeOf(p, picked[p.name]);
    const inStock = sizeInStock(s);
    const at10 = unitPriceAt(s.price, STEP, STEP, s.sku);
    const cap = wholesaleCap(s.sku);
    const line = lineFor(s.sku);
    const coa = typeof coaPageHref === 'function' && p.lot && coaHref(p)
      ? `<a class="ws-coa" href="${pageHref(coaPageHref(p))}">COA</a>` : '';
    const sizes = p.sizes.map(z => `
          <button type="button" class="ws-size${z.sku === s.sku ? ' on' : ''}" data-sku="${z.sku}"${sizeInStock(z) ? '' : ' disabled'}>
            ${escHtml(z.mg)}<small>${sizeInStock(z) ? money(z.price) : 'Sold out'}</small>
          </button>`).join('');
    const btn = !inStock
      ? '<button type="button" class="ws-add" disabled>Out of stock</button>'
      : line
        ? `<button type="button" class="ws-add in" data-add="${s.sku}">In order (${line.qty}) &middot; add ${STEP}</button>`
        : `<button type="button" class="ws-add" data-add="${s.sku}">Add ${STEP} units</button>`;
    return `
      <article class="ws-card" data-name="${escHtml((p.name + ' ' + (p.alias || '')).toLowerCase())}" data-product="${escHtml(p.name)}">
        <div class="ws-img"><img src="${pageHref(s.image || p.image)}" alt="" loading="lazy" />${coa}</div>
        <div class="ws-body">
          <h3>${escHtml(p.name)}</h3>
          <div class="ws-sizes">${sizes}</div>
          <div class="ws-rate">
            <strong>${money(at10)}</strong>
            <span>per vial at ${STEP}, <s>${money(s.price)}</s> list</span>
            ${cap < TOP.off ? `<span class="ws-cap">Wholesale up to ${pct(cap)}</span>` : ''}
          </div>
          ${btn}
        </div>
      </article>`;
  }

  function renderGrid() {
    const q = ($('wsSearch') && $('wsSearch').value || '').trim().toLowerCase();
    grid.innerHTML = GLOW_PRODUCTS.map(cardHtml).join('');
    if (q) grid.querySelectorAll('.ws-card').forEach(c => { c.hidden = !c.dataset.name.includes(q); });
  }

  grid.addEventListener('click', e => {
    const size = e.target.closest('.ws-size');
    if (size && !size.disabled) {
      const card = size.closest('.ws-card');
      picked[card.dataset.product] = size.dataset.sku;
      renderGrid();
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = GLOW_PRODUCTS.find(pr => pr.sizes.some(z => z.sku === add.dataset.add));
      const s = sizeOf(p, add.dataset.add);
      const line = lineFor(s.sku);
      window.GlowCart.set(itemFor(p, s), (line ? line.qty : 0) + STEP);
    }
  });

  const search = $('wsSearch');
  if (search) search.addEventListener('input', renderGrid);

  /* ---------- the order panel ---------- */

  function rateLabel(i, units) {
    // wholesaleOff() is zero until a tier applies, and every tier opens above
    // buy-2-get-1's best, so a non-zero rate is the one the line is paying.
    const off = wholesaleOff(i.qty, units, i.sku);
    if (off > 0) return `${pct(off)} off`;
    return freeVials(i.qty) ? `buy 2, get 1 free` : 'list price';
  }

  function renderPanel() {
    const items = window.GlowCart.items();
    const units = cartUnits();
    const total = items.reduce((n, i) => n + i.unitSale * i.qty, 0);
    const list = items.reduce((n, i) => n + Math.max(Number(i.unitList) || 0, i.unitOriginal) * i.qty, 0);

    $('wsUnits').textContent = `${units} ${units === 1 ? 'UNIT' : 'UNITS'}`;
    $('wsBarFill').style.width = Math.min(100, units / TOP.min * 100) + '%';
    const anyWholesale = items.some(i => i.qty >= STEP);
    $('wsProgressMsg').textContent = units >= TOP.min
      ? `${pct(TOP.off)} off every unit in the order, up to each compound's cap.`
      : !units
        ? `Add ${STEP} units of any compound to unlock wholesale pricing.`
        : `${TOP.min - units} more ${TOP.min - units === 1 ? 'unit' : 'units'} to ${pct(TOP.off)} on everything.` +
          (anyWholesale ? ' Each compound is priced at its own rate until then.' : ` Wholesale starts at ${STEP} of a compound.`);

    const lines = $('wsLines');
    lines.innerHTML = items.length ? items.map(i => {
      const p = GLOW_PRODUCTS.find(pr => pr.sizes.some(z => z.sku === i.sku));
      const img = p ? (sizeOf(p, i.sku).image || p.image) : '';
      return `
        <li class="ws-line" data-sku="${escHtml(i.sku)}">
          ${img ? `<img src="${pageHref(img)}" alt="" />` : '<span></span>'}
          <div>
            <h4>${escHtml(i.name)}</h4>
            <small>${escHtml(i.variant)} &middot; ${money(i.unitSale)}/unit &middot; ${rateLabel(i, units)}</small>
            <div class="ws-step">
              <button type="button" data-d="-${STEP}" aria-label="Remove ${STEP}">-${STEP}</button>
              <button type="button" data-d="-1" aria-label="Remove one">-</button>
              <span>${i.qty}</span>
              <button type="button" data-d="1" aria-label="Add one">+</button>
              <button type="button" data-d="${STEP}" aria-label="Add ${STEP}">+${STEP}</button>
            </div>
          </div>
          <b>${money(i.unitSale * i.qty)}</b>
        </li>`;
    }).join('') : `<li class="ws-empty">Your order is empty. Add ${STEP} units of any compound to start.</li>`;

    $('wsList').textContent = money(list);
    $('wsSave').textContent = money(Math.max(0, list - total));
    $('wsTotal').textContent = money(total);
    const co = $('wsCheckout');
    co.textContent = units ? `Checkout ${units} ${units === 1 ? 'unit' : 'units'}, ${money(total)}` : 'Checkout';
    co.setAttribute('aria-disabled', units ? 'false' : 'true');

    $('wsBarUnits').textContent = `${units} ${units === 1 ? 'unit' : 'units'}`;
    $('wsBarTotal').textContent = money(total);
  }

  $('wsLines').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const sku = b.closest('.ws-line').dataset.sku;
    const line = lineFor(sku);
    if (!line) return;
    window.GlowCart.set(line, line.qty + Number(b.dataset.d));
  });

  // Mobile: the panel is a sheet behind the sticky bar.
  const panel = $('wsPanel');
  const toggle = $('wsBarToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      toggle.textContent = open ? 'Close' : 'Review';
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  function renderAll() { renderGrid(); renderPanel(); }
  document.addEventListener('glow-cart-change', renderAll);
  renderAll();
})();
