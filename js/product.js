// ===================== Glow Research — product detail page =====================
// Reads ?p=<slug> from the URL, looks the product up in the shared catalog
// (js/products-data.js), and renders everything from one source so this page
// can never drift from the grid it was clicked from.
//
// The page has exactly one decision on it: which mg. Picking a size re-prices
// the buy box, the bulk tiers and the spec table together.
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

  let product = null;
  let sizeIndex = 0;
  let qty = 1;

  const size = () => product.sizes[sizeIndex];

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
      hour: '2-digit', minute: '2-digit', second: '2-digit',
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
    timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric',
  }).format(d);

  function deliveryEstimate() {
    const p = nyParts(new Date());
    const today = anchor(p);
    const secondsIn = (+p.hour % 24) * 3600 + (+p.minute) * 60 + (+p.second);

    // Miss the 2pm cutoff, or land on a weekend, and dispatch rolls to the
    // next business morning. addBusinessDays already steps over Sat/Sun.
    const shipsToday = !isWeekend(today) && secondsIn < CUTOFF_HOUR * 3600;
    const shipDate = shipsToday ? today : addBusinessDays(today, 1);

    return { shipsToday, arrivalDate: addBusinessDays(shipDate, TRANSIT_DAYS) };
  }

  function renderDelivery() {
    const cutEl = $('pdCutoff');
    const arrEl = $('pdArrival');
    if (!cutEl || !arrEl) return;

    function tick() {
      const e = deliveryEstimate();
      cutEl.innerHTML = e.shipsToday
        ? 'In stock &mdash; <strong>ships today</strong>'
        : 'In stock &mdash; <strong>ships next business day</strong>';
      arrEl.innerHTML = `Estimated delivery <strong>${fmtDay(e.arrivalDate)}</strong>`;
    }

    tick();
    setInterval(tick, 60000);
  }

  /* ================= static bits ================= */

  function renderBreadcrumb(p) {
    $('pdCrumbCat').textContent = CAT_LABEL[p.cat] || p.cat;
    $('pdCrumbCat').href = pageHref(`peptides.html?cat=${p.cat}`);
    $('pdCrumbName').textContent = p.name;
  }

  function renderHeader(p) {
    $('pdTag').textContent = p.tag;
    $('pdName').textContent = p.name;
    $('pdVialName').textContent = p.name;

    // a handful of products ship with a real product photo; everything else
    // falls back to the illustrated CSS vial so the page never shows a gap
    if (p.image) {
      $('pdPhoto').src = p.image;
      $('pdPhoto').alt = `${p.name} vial`;
      $('pdPhoto').hidden = false;
      $('pdVialArt').hidden = true;
      // the stage turns light so the shot's own white background disappears
      document.querySelector('.pd-visual').classList.add('has-photo');
    }

    renderCoa(p);
  }

  /* ================= certificate =================
     There is no COA page any more. "View certificate of analysis" opens the
     document itself: the product's own `coa` if it has one, otherwise the
     shared COA_URL. Until either is filled in the box keeps its wording but
     carries no href, so it can never send anyone to a 404. */

  function renderCoa(p) {
    const box = $('pdCoaLink');
    if (!box) return;

    const href = p.coa || (typeof COA_URL === 'string' ? COA_URL : '');
    if (!href) {
      box.removeAttribute('href');
      box.classList.add('is-static');
      // dropping href is not enough on its own: the anchor still reports
      // tabIndex 0, so a keyboard user lands on a box that does nothing
      box.tabIndex = -1;
      return;
    }

    box.href = href;
    box.classList.remove('is-static');
    box.removeAttribute('tabindex');
    // a certificate is a document, not a step in the buying flow, so it
    // opens alongside the page rather than replacing it
    box.target = '_blank';
    box.rel = 'noopener';
  }

  /* ================= description & research =================
     A real tablist: arrow keys move between tabs, Home/End jump to the
     ends, and only the selected tab is in the tab order, so a keyboard
     user tabs past the control rather than through every tab in it. */

  function renderInfo(p) {
    const about = $('pdAbout');
    const research = $('pdResearch');
    if (!about || !research) return;

    $('pdAboutH').textContent = `About ${p.name}`;
    $('pdResearchH').textContent = `${p.name} research`;
    about.innerHTML = (p.about || []).map(t => `<p>${t}</p>`).join('');
    research.innerHTML = (p.research || []).map(a =>
      `<div class="pd-area"><h3>${a.t}</h3><p>${a.d}</p></div>`).join('');
  }

  function wireTabs() {
    const tabs = [$('pdTabAbout'), $('pdTabResearch')];
    const panels = [$('pdPanelAbout'), $('pdPanelResearch')];
    const ink = $('pdTabInk');
    if (tabs.some(t => !t) || !ink) return;

    function moveInk(tab) {
      ink.style.width = tab.offsetWidth + 'px';
      ink.style.transform = `translateX(${tab.offsetLeft}px)`;
    }

    function select(i, focus) {
      tabs.forEach((t, n) => {
        const on = n === i;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        // only the selected tab stays tabbable, per the tablist pattern
        t.tabIndex = on ? 0 : -1;
        panels[n].hidden = !on;
      });
      moveInk(tabs[i]);
      if (focus) tabs[i].focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', e => {
        const last = tabs.length - 1;
        let next = null;
        if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
        else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = last;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      });
    });

    select(0);
    // the bar is positioned in pixels, so it has to be re-measured when the
    // tabs reflow or when the webfont finally swaps in and changes their width
    addEventListener('resize', () => moveInk(tabs.find(t => t.classList.contains('is-on'))));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => moveInk(tabs.find(t => t.classList.contains('is-on'))));
    }
  }

  /* ================= mg picker ================= */

  function renderSizes(p) {
    const wrap = $('pdSizes');
    wrap.innerHTML = p.sizes.map((s, i) =>
      `<button type="button" class="pd-size${i === sizeIndex ? ' is-active' : ''}" data-i="${i}">${s.mg}</button>`
    ).join('');

    wrap.querySelectorAll('.pd-size').forEach(btn => {
      btn.addEventListener('click', () => {
        sizeIndex = +btn.dataset.i;
        wrap.querySelectorAll('.pd-size').forEach(b => b.classList.toggle('is-active', b === btn));
        renderSelection();
      });
    });
  }

  // everything that changes when a different mg is picked
  function renderSelection() {
    const s = size();

    // list price struck through beside the marked-down one; unitSale below has
    // to agree with what is rendered here or the cart charges a different figure
    $('pdPrice').innerHTML = onSaleNow()
      ? `<s class="pd-price-was">${money(s.price)}</s>${money(salePrice(s.price))}`
      : money(s.price);
    $('pdVialMg').textContent = s.mg.toUpperCase();
    $('pdVialFine').innerHTML =
      `${product.purity} Purity<br />FOR RESEARCH USE ONLY<br />glowresearch.shop`;

    document.title = `${product.name} ${s.mg} | Glow Research`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content',
        `${product.name}, ${product.purity} purity, ${s.mg} per vial. Third-party tested, lot-matched COA. For laboratory research use only.`);
    }

    renderTiers();
  }

  /* ================= quantity + add ================= */

  function flash(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1300);
  }

  function wireBuy() {
    const qtyEl = $('pdQty');
    const draw = () => {
      qtyEl.textContent = qty;
      $('pdQtyDec').disabled = qty <= 1;
    };
    draw();

    $('pdQtyDec').addEventListener('click', () => { qty = Math.max(1, qty - 1); draw(); });
    $('pdQtyInc').addEventListener('click', () => { qty += 1; draw(); });

    // the cart lines up as unitSale × qty, so a plain vial goes in as a unit
    const addCurrent = () => {
      const s = size();
      window.GlowCart.add({
        name: product.name,
        variant: s.mg,
        qty,
        unitOriginal: s.price,
        unitSale: salePrice(s.price),
      });
    };

    $('pdAddBtn').addEventListener('click', () => {
      addCurrent();
      flash($('pdAddBtn'), 'Added to cart ✓');
    });
  }

  /* ================= stock up & save ================= */

  function renderTiers() {
    const s = size();
    const variants = getProductVariants(product, s.price);
    const wrap = $('pdTiers');

    // one vial per unit, but three is enough to read as "several" — past that
    // they just overlap into a smudge, and the label already says the count
    const vialArt = product.image
      ? `<img src="${pageHref(product.image)}" alt="" loading="lazy" />`
      : '<span class="vial"></span>';

    wrap.innerHTML = variants.map((v, i) => {
      const onSale = v.original > v.sale;
      const off = bulkSavingPct(v.original, v.sale);
      const best = i === variants.length - 1;
      return `
        <button type="button" class="pd-tier${best ? ' is-best' : ''}" data-i="${i}">
          ${best ? '<span class="pd-tier-flag">Best value</span>' : ''}
          <span class="pd-tier-vials">${vialArt.repeat(Math.min(v.qty, 3))}</span>
          <span class="pd-tier-qty">${v.label}</span>
          <span class="pd-tier-price">${money(v.sale)}</span>
          ${onSale ? `<span class="pd-tier-was">${money(v.original)}</span>` : ''}
          <span class="pd-tier-per">${money(v.sale / v.qty)} / vial</span>
          ${off ? `<span class="pd-tier-off">Save ${off}%</span>` : ''}
        </button>`;
    }).join('');

    wrap.querySelectorAll('.pd-tier').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = variants[+btn.dataset.i];
        // a bundle is one cart line at the bundle price, matching the quick-add sheet
        window.GlowCart.add({
          name: product.name,
          variant: `${s.mg} · ${v.label}`,
          unitOriginal: v.original,
          unitSale: v.sale,
        });
        const priceEl = btn.querySelector('.pd-tier-price');
        flash(priceEl, 'Added ✓');
      });
    });
  }

  /* ================= related ================= */

  // renderProductGrid marks every card ".reveal", which starts at opacity:0 and
  // waits for a scroll observer. This page has no scroll animations, so the
  // cards are shown outright instead.
  function renderRelated(p) {
    const grid = $('pdRelatedGrid');
    const pool = GLOW_PRODUCTS.filter(x => x.cat === p.cat && x.name !== p.name);
    if (!pool.length) { $('pdRelatedSection').hidden = true; return; }

    renderProductGrid(grid, p.cat, { limit: 5, observeReveal: el => el.classList.add('in') });
    // renderProductGrid doesn't know to exclude the product we're already on
    grid.querySelectorAll('.product-card').forEach(card => {
      if (card.querySelector('h3').textContent === p.name) card.remove();
    });
  }

  /* ================= boot ================= */

  document.addEventListener('DOMContentLoaded', () => {
    product = currentProduct();
    if (!product) {
      $('pdShell').hidden = true;
      $('pdMissing').hidden = false;
      return;
    }

    renderBreadcrumb(product);
    renderHeader(product);
    renderInfo(product);
    wireTabs();
    renderSizes(product);
    renderSelection();
    wireBuy();
    renderDelivery();
    renderRelated(product);
  });
})();
