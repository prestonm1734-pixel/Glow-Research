// ===================== Glow Research — product detail page =====================
// Reads ?p=<slug> from the URL, looks the product up in the shared catalog
// (js/products-data.js), and renders everything from one source so this page
// can never drift from the grid it was clicked from.
(function () {
  const $ = id => document.getElementById(id);
  const money = n => '$' + n.toFixed(2);

  const CUTOFF_HOUR = 14;        // 2:00 PM EST, same claim as the shipping page
  const TRANSIT_DAYS = 2;        // FedEx 2-Day Express

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

  /* ================= delivery estimate =================
     Everything is computed from New York wall-clock parts, then anchored to
     UTC noon before any day arithmetic. Anchoring at noon means adding whole
     days can never land on a DST seam and silently shift the date by one. */

  function nyParts(date) {
    const out = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).forEach(p => { out[p.type] = p.value; });
    return out;
  }

  const anchor = p => new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12));
  const isWeekend = d => d.getUTCDay() === 0 || d.getUTCDay() === 6;

  function addBusinessDays(date, n) {
    const out = new Date(date);
    while (n > 0) {
      out.setUTCDate(out.getUTCDate() + 1);
      if (!isWeekend(out)) n--;
    }
    return out;
  }

  const fmtDay = d => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(d);

  // -> { shipsToday, secsLeft, shipDate, arrivalDate }
  function deliveryEstimate() {
    const p = nyParts(new Date());
    const today = anchor(p);
    const secsLeft = CUTOFF_HOUR * 3600 -
      ((+p.hour % 24) * 3600 + (+p.minute) * 60 + (+p.second));

    // Miss the cutoff, or land on a weekend, and dispatch rolls to the next
    // business morning. addBusinessDays already steps over Sat/Sun.
    const shipsToday = !isWeekend(today) && secsLeft > 0;
    const shipDate = shipsToday ? today : addBusinessDays(today, 1);

    return { shipsToday, secsLeft, shipDate, arrivalDate: addBusinessDays(shipDate, TRANSIT_DAYS) };
  }

  function renderDelivery() {
    const cutEl = $('pdCutoff');
    const arrEl = $('pdArrival');
    if (!cutEl || !arrEl) return;

    function tick() {
      const e = deliveryEstimate();
      if (e.shipsToday) {
        const h = Math.floor(e.secsLeft / 3600);
        const m = Math.floor((e.secsLeft % 3600) / 60);
        const left = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        cutEl.innerHTML = `Order within <strong>${left}</strong> to ship today`;
      } else {
        cutEl.innerHTML = `Cutoff passed &mdash; ships <strong>${fmtDay(e.shipDate)}</strong>`;
      }
      arrEl.innerHTML = `FedEx 2-Day &mdash; get it by <strong>${fmtDay(e.arrivalDate)}</strong>`;
    }

    tick();
    setInterval(tick, 30000);
  }

  /* ================= hero ================= */

  function renderBreadcrumb(p) {
    $('pdCrumbCat').textContent = CAT_LABEL[p.cat] || p.cat;
    $('pdCrumbCat').href = pageHref(`peptides.html?cat=${p.cat}`);
    $('pdCrumbName').textContent = p.name;
  }

  function renderHero(p) {
    document.title = `${p.name} ${p.size} | Glow Research`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', `${p.name}, ${p.purity} purity, ${p.size} per vial. Third-party tested, lot-matched COA. For laboratory research use only.`);

    $('pdCat').textContent = p.cat;
    $('pdBadge').hidden = !p.badge;
    $('pdBadge').textContent = p.badge || '';

    $('pdTag').textContent = p.tag;
    $('pdName').textContent = p.name;
    $('pdPurityChip').textContent = `${p.purity} HPLC`;
    $('pdSizeChip').textContent = `${p.size} / vial`;
    $('pdLede').textContent = p.blurb;
    $('pdPrice').textContent = money(p.price);

    // vial label art
    $('pdVialName').textContent = p.name;
    $('pdVialMg').textContent = p.size.toUpperCase();
    $('pdVialFine').innerHTML =
      `${p.purity} Purity<br />FOR RESEARCH USE ONLY<br />glowresearch.com`;

    // specs
    $('pdSpecPurity').textContent = `${p.purity} (HPLC verified)`;
    $('pdSpecSize').textContent = `Single vial, ${p.size}`;

    const free = (window.GlowCart && window.GlowCart.FREE_SHIPPING_AT) || 250;
    $('pdFreeShip').textContent = `Free 2-day shipping on orders over $${free}`;

    $('pdCoaLink').href = pageHref('coa.html');
    $('pdCoaLink2').href = pageHref('coa.html');
    $('pdShipLink').href = pageHref('shipping.html');
  }

  /* ================= buy box ================= */

  function wireStepper(p) {
    let qty = 1;
    const qtyEl = $('pdQty');
    const render = () => {
      qtyEl.textContent = qty;
      $('pdQtyDec').disabled = qty <= 1;
    };
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
      const btn = $('pdAddBtn');
      btn.textContent = 'Added to cart ✓';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = 'Add to cart'; btn.disabled = false; }, 1300);
    });
  }

  /* ================= stock-up tiers ================= */

  function renderTiers(p) {
    const variants = getProductVariants(p);
    const wrap = $('pdTiers');

    wrap.innerHTML = variants.map((v, i) => {
      const onSale = v.original > v.sale;
      const off = onSale ? Math.round((1 - v.sale / v.original) * 100) : 0;
      const perVial = v.sale / v.qty;
      const best = i === variants.length - 1;
      // literal vial count reads instantly, but ten glyphs is noise — cap at 3
      const glyphs = '<span class="vial"></span>'.repeat(Math.min(v.qty, 3));
      return `
        <button type="button" class="pd-tier ${best ? 'is-best' : ''}" data-i="${i}">
          ${best ? '<span class="pd-tier-flag">Best value</span>' : ''}
          <span class="pd-tier-vials">${glyphs}</span>
          <span class="pd-tier-qty">${v.label}</span>
          <span class="pd-tier-price">${money(v.sale)}</span>
          ${onSale ? `<span class="pd-tier-was">${money(v.original)}</span>` : '<span class="pd-tier-was">&nbsp;</span>'}
          <span class="pd-tier-per">${money(perVial)} / vial</span>
          ${onSale ? `<span class="pd-tier-off">Save ${off}%</span>` : ''}
        </button>`;
    }).join('');

    wrap.querySelectorAll('.pd-tier').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const v = variants[i];
        window.GlowCart.add({
          name: p.name, variant: v.label, qty: v.qty,
          unitOriginal: v.original, unitSale: v.sale,
        });
        const priceEl = btn.querySelector('.pd-tier-price');
        const orig = priceEl.textContent;
        btn.classList.add('is-added');
        priceEl.textContent = 'Added ✓';
        setTimeout(() => {
          btn.classList.remove('is-added');
          priceEl.textContent = orig;
        }, 1300);
      });
    });
  }

  /* ================= related ================= */

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
    const pool = GLOW_PRODUCTS.filter(x => x.cat === p.cat && x.name !== p.name);
    if (!pool.length) { $('pdRelatedSection').hidden = true; return; }

    renderProductGrid(grid, p.cat, { limit: 5, observeReveal: el => relatedObserver.observe(el) });
    // renderProductGrid doesn't know to exclude the product we're already on
    grid.querySelectorAll('.product-card').forEach(card => {
      if (card.querySelector('h3').textContent === p.name) card.remove();
    });
  }

  /* ================= boot ================= */

  document.addEventListener('DOMContentLoaded', () => {
    const p = currentProduct();
    if (!p) {
      $('pdShell').hidden = true;
      $('pdMissing').hidden = false;
      return;
    }

    renderBreadcrumb(p);
    renderHero(p);
    wireStepper(p);
    renderTiers(p);
    renderDelivery();
    renderRelated(p);

    document.querySelectorAll('.reveal').forEach(el => relatedObserver.observe(el));
  });
})();
