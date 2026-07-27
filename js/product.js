// ===================== Glow Research — product detail page =====================
// Reads ?p=<slug> from the URL, looks the product up in the shared catalog
// (js/products-data.js), and renders everything from one source so this page
// can never drift from the grid it was clicked from.
(function () {
  const $ = id => document.getElementById(id);
  const money = n => '$' + n.toFixed(2);

  const CAT_LABEL = {
    growth: 'Growth Hormone Secretagogues',
    recovery: 'Recovery Peptides',
    metabolic: 'Metabolic Research',
    cognitive: 'Cognitive Research',
  };

  function currentProduct() {
    const slug = new URLSearchParams(location.search).get('p') || '';
    return findProductBySlug(slug);
  }

  function renderMissing() {
    $('pdShell').hidden = true;
    $('pdMissing').hidden = false;
  }

  function renderBreadcrumb(p) {
    $('pdCrumbCat').textContent = CAT_LABEL[p.cat] || p.cat;
    $('pdCrumbCat').href = pageHref(`peptides.html?cat=${p.cat}`);
    $('pdCrumbName').textContent = p.name;
  }

  function renderHero(p) {
    document.title = `${p.name} | Glow Research`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', `${p.name}, ${p.purity} purity, ${p.size} per vial. For laboratory research use only.`);

    $('pdCat').textContent = p.cat;
    $('pdBadge').hidden = !p.badge;
    $('pdBadge').textContent = p.badge || '';
    $('pdTag').textContent = p.tag;
    $('pdName').textContent = p.name;
    $('pdLede').textContent = `${p.name} is a lyophilized peptide supplied for in-vitro research use, ${p.purity} purity per lot, nitrogen sealed at ${p.size} per vial.`;
    $('pdPrice').textContent = money(p.price);
    $('pdCoaLink').href = pageHref('coa.html');

    $('pdSpecPurity').textContent = p.purity;
    $('pdSpecSize').textContent = p.size;
    $('pdVialLabel').innerHTML = `${p.name}<br />${p.size}`;
  }

  /* ---------- quantity stepper + base add-to-cart ---------- */

  function wireStepper(p) {
    let qty = 1;
    const qtyEl = $('pdQty');
    const render = () => { qtyEl.textContent = qty; };
    render();

    $('pdQtyDec').addEventListener('click', () => { qty = Math.max(1, qty - 1); render(); });
    $('pdQtyInc').addEventListener('click', () => { qty += 1; render(); });

    $('pdAddBtn').addEventListener('click', () => {
      window.GlowCart.add({
        name: p.name,
        variant: qty === 1 ? '1 vial' : `${qty} vials`,
        qty,
        unitOriginal: p.price,
        unitSale: p.price,
      });
      flashAdded($('pdAddBtn'), 'Add to cart');
    });
  }

  function flashAdded(btn, restLabel) {
    const prev = btn.textContent;
    btn.textContent = 'Added ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = restLabel || prev; btn.disabled = false; }, 1200);
  }

  /* ---------- stock-up tiers ---------- */

  function renderTiers(p) {
    const variants = getProductVariants(p);
    const wrap = $('pdTiers');
    wrap.innerHTML = variants.map((v, i) => {
      const onSale = v.original > v.sale;
      const off = onSale ? Math.round((1 - v.sale / v.original) * 100) : 0;
      const perVial = v.sale / v.qty;
      return `
        <button type="button" class="pd-tier ${i === variants.length - 1 ? 'is-best' : ''}" data-i="${i}">
          ${i === variants.length - 1 ? '<span class="pd-tier-flag">Best value</span>' : ''}
          <span class="pd-tier-qty">${v.label}</span>
          <span class="pd-tier-price">${money(v.sale)}</span>
          ${onSale ? `<span class="pd-tier-was">${money(v.original)}</span>` : ''}
          <span class="pd-tier-per">${money(perVial)} / vial</span>
          ${onSale ? `<span class="pd-tier-off">Save ${off}%</span>` : ''}
        </button>`;
    }).join('');

    wrap.querySelectorAll('.pd-tier').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const v = variants[i];
        window.GlowCart.add({ name: p.name, variant: v.label, qty: v.qty, unitOriginal: v.original, unitSale: v.sale });
        const priceEl = btn.querySelector('.pd-tier-price');
        const orig = priceEl.textContent;
        btn.classList.add('is-added');
        priceEl.textContent = 'Added ✓';
        setTimeout(() => { btn.classList.remove('is-added'); priceEl.textContent = orig; }, 1200);
      });
    });
  }

  /* ---------- dispatch line ---------- */

  function renderDispatch() {
    const el = $('pdDispatch');
    if (!el) return;
    const CUTOFF_HOUR = 14;

    function nyParts(date) {
      const out = {};
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false,
        weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(date).forEach(part => { out[part.type] = part.value; });
      return out;
    }

    function render() {
      const p = nyParts(new Date());
      const isWeekday = p.weekday !== 'Sat' && p.weekday !== 'Sun';
      const secsLeft = CUTOFF_HOUR * 3600 -
        ((parseInt(p.hour, 10) % 24) * 3600 + parseInt(p.minute, 10) * 60 + parseInt(p.second, 10));

      if (isWeekday && secsLeft > 0) {
        const h = Math.floor(secsLeft / 3600);
        const m = Math.floor((secsLeft % 3600) / 60);
        const left = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        el.innerHTML = `Order within <strong>${left}</strong> to ship today`;
      } else {
        el.innerHTML = `Today's cutoff has passed &mdash; ships <strong>next business day</strong>`;
      }
    }

    render();
    setInterval(render, 30000);
  }

  /* ---------- related products ---------- */

  // renderProductGrid marks every card ".reveal" and expects a caller to flip
  // it to ".in" via IntersectionObserver (see js/script.js on the homepage);
  // without one the cards render but stay at opacity:0 forever.
  const relatedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); relatedObserver.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });

  function renderRelated(p) {
    const grid = $('pdRelatedGrid');
    const section = $('pdRelatedSection');
    const pool = GLOW_PRODUCTS.filter(x => x.cat === p.cat && x.name !== p.name);
    if (!pool.length) { section.hidden = true; return; }
    renderProductGrid(grid, p.cat, { limit: 5, observeReveal: el => relatedObserver.observe(el) });
    // renderProductGrid doesn't know to exclude the product we're already on
    grid.querySelectorAll('.product-card').forEach(card => {
      if (card.querySelector('h3').textContent === p.name) card.remove();
    });
  }

  /* ---------- boot ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    const p = currentProduct();
    if (!p) { renderMissing(); return; }

    renderBreadcrumb(p);
    renderHero(p);
    wireStepper(p);
    renderTiers(p);
    renderDispatch();
    renderRelated(p);
  });
})();
