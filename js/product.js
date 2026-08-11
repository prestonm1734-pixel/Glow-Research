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

  // CUTOFF_HOUR, CUTOFF_LABEL and TRANSIT_DAYS come from js/products-data.js.
  // The evidence panel quotes all three, so they are sitewide constants rather
  // than ones this file owns and the panel restates.

  const CAT_LABEL = {
    growth: 'Growth Hormone Secretagogues',
    tissue: 'Tissue Research',
    metabolic: 'Metabolic Research',
    cognitive: 'Cognitive Research',
  };

  let product = null;
  let sizeIndex = 0;
  let qty = 1;
  // set by renderDelivery() so picking a different mg re-reads its stock
  let refreshDelivery = null;

  const size = () => product.sizes[sizeIndex];

  // Generated pages (peptides/<slug>/index.html, built by
  // tools/build-products.js) carry their slug on <body data-product-slug> and
  // have the content already in the markup — this render hydrates it in place.
  // The bare product.html?p=<slug> URL still works and is the fallback.
  function currentProduct() {
    const slug = document.body.dataset.productSlug ||
      new URLSearchParams(location.search).get('p') || '';
    return findProductBySlug(slug);
  }

  /* ================= delivery estimate =================
     Everything is computed from Pacific wall-clock parts, then anchored to
     UTC noon before any day arithmetic. Anchoring at noon means adding whole
     days can never land on a DST seam and silently shift the date by one. */

  function pacificParts(date) {
    const out = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hour12: false,
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
    const p = pacificParts(new Date());
    const today = anchor(p);
    const secondsIn = (+p.hour % 24) * 3600 + (+p.minute) * 60 + (+p.second);

    // Miss the 2pm cutoff, or land on a weekend, and dispatch rolls to the
    // next business morning. addBusinessDays already steps over Sat/Sun.
    const shipsToday = !isWeekend(today) && secondsIn < CUTOFF_HOUR * 3600;
    const shipDate = shipsToday ? today : addBusinessDays(today, 1);

    return {
      shipsToday,
      // How long is left to make today's pickup. Only meaningful when
      // shipsToday, and it is the whole point of showing a countdown at all:
      // "same-day shipping" is a rule, "1h 12m" is an answer.
      secondsLeft: CUTOFF_HOUR * 3600 - secondsIn,
      arrivalDate: addBusinessDays(shipDate, TRANSIT_DAYS),
    };
  }

  // Rounded down to the minute, because the tick below is a minute long: saying
  // "2h 14m" and meaning "somewhere under that" is the safe direction to err.
  function countdown(seconds) {
    const mins = Math.floor(seconds / 60);
    if (mins < 1) return 'less than a minute';
    const hours = Math.floor(mins / 60);
    return hours
      ? `${hours}h ${String(mins % 60).padStart(2, '0')}m`
      : `${mins}m`;
  }

  // Dispatch and delivery are only claims we can make about something we can
  // actually send. An out-of-stock size gets the honest line and a next step
  // instead of an arrival date that would be invented.
  function renderDelivery() {
    const cutEl = $('pdCutoff');
    const arrEl = $('pdArrival');
    if (!cutEl || !arrEl) return;

    function tick() {
      if (!sizeInStock(size())) {
        cutEl.innerHTML = '<strong>Out of stock</strong>';
        arrEl.innerHTML = 'Email <a href="mailto:support@glowresearch.shop">support@glowresearch.shop</a> ' +
          'and we will tell you when the next lot is released.';
        setDispatchRow('Out of stock',
          'Email support@glowresearch.shop and we will tell you when the next lot is released');
        return;
      }
      const e = deliveryEstimate();
      // The countdown is the certainty the rest of this page is built on: not
      // "we ship fast", but how long is left to make today's pickup.
      cutEl.innerHTML = e.shipsToday
        ? `In stock, <strong>ships today</strong>. Order within <strong>${countdown(e.secondsLeft)}</strong>.`
        : 'In stock, <strong>ships next business day</strong>';
      arrEl.innerHTML = `Estimated delivery <strong>${fmtDay(e.arrivalDate)}</strong>`;

      setDispatchRow(
        e.shipsToday ? 'Ships today' : 'Ships next business day',
        e.shipsToday
          ? `Order within ${countdown(e.secondsLeft)} to make today's pickup. ` +
            `Estimated delivery ${fmtDay(e.arrivalDate)}`
          : `Cutoff is ${CUTOFF_LABEL}, Monday to Friday. Estimated delivery ${fmtDay(e.arrivalDate)}`
      );
    }

    refreshDelivery = tick;
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
    // The markup ships with the "on request" wording, since that is the only
    // route that works while no certificate is hosted. A real href means there
    // is a document to open, so the box can promise one. Both strings come from
    // COA_COPY so this matches the cart, FAQ and account area.
    const bEl = box.querySelector('b');
    const smallEl = box.querySelector('small');
    if (bEl) bEl.textContent = COA_COPY.boxTitle;
    if (smallEl) smallEl.textContent = COA_COPY.boxSub;
    // a certificate is a document, not a step in the buying flow, so it
    // opens alongside the page rather than replacing it
    box.target = '_blank';
    box.rel = 'noopener';
  }

  /* ================= the Glow Standard =================
     Drawn by evidenceHtml() in js/products-data.js, which is the same code
     tools/build-products.js runs at build time. Rendering here rather than
     trusting the baked markup means one product page cannot end up showing
     another's record after a navigation, and it is what fills the panel on
     product.html?p=<slug>, which has no baked content at all. */

  function renderEvidence(p) {
    const grid = $('pdEvidence');
    if (!grid) return;
    grid.innerHTML = evidenceHtml(p);

    // The certificate link is drawn only when there is a document to open, on
    // the same test renderCoa() uses. No href, no link: a row that says "view
    // report" and does nothing is the uncertainty this panel exists to remove.
    const href = p.coa || (typeof COA_URL === 'string' ? COA_URL : '');
    const cell = grid.querySelector('[data-row="document"] dd');
    if (href && COA_COPY.panelLink && cell) {
      const a = document.createElement('a');
      a.className = 'gs-report';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${COA_COPY.panelLink} →`;
      cell.appendChild(a);
    }
  }

  // Called every minute by renderDelivery(): the one row whose answer depends
  // on the clock rather than on the catalog.
  function setDispatchRow(value, note) {
    const cell = document.querySelector('#pdEvidence [data-row="dispatch"] dd');
    if (!cell) return;
    cell.querySelector('.gs-value').textContent = value;
    cell.querySelector('.gs-note').textContent = note;
  }

  /* ================= description & research =================
     The accordions themselves are native <details> and need no script. This
     only fills them, and names each one after the compound. */

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

  /* ================= mg picker ================= */

  function renderSizes(p) {
    const wrap = $('pdSizes');
    // An unavailable mg stays on the page and stays pickable: hiding it makes
    // the customer wonder whether we sell it at all. Saying so answers that.
    wrap.innerHTML = p.sizes.map((s, i) => {
      const out = !sizeInStock(s);
      return `<button type="button" class="pd-size${i === sizeIndex ? ' is-active' : ''}` +
        `${out ? ' is-out' : ''}" data-i="${i}"` +
        `${out ? ' aria-label="' + s.mg + ', out of stock"' : ''}>${s.mg}</button>`;
    }).join('');

    wrap.querySelectorAll('.pd-size').forEach(btn => {
      btn.addEventListener('click', () => {
        sizeIndex = +btn.dataset.i;
        wrap.querySelectorAll('.pd-size').forEach(b => b.classList.toggle('is-active', b === btn));
        renderSelection();
      });
    });
  }

  // The headline price, for the mg AND the quantity currently selected. Both
  // inputs matter: the bulk tier is a function of quantity, so stepping from
  // 2 to 3 vials changes the per-vial price, not just the multiplier.
  //
  // Shows the line total, because that is the number being decided. The
  // per-vial figure moves to the note underneath, where it is the useful
  // comparison rather than the headline.
  function renderPrice() {
    const s = size();
    const unit = unitPriceAt(s.price, qty);
    const listTotal = round2(s.price * qty);
    const total = round2(unit * qty);

    $('pdPrice').innerHTML = listTotal > total
      ? `<s class="pd-price-was">${money(listTotal)}</s>${money(total)}`
      : money(total);

    // One vial at list price is the plain case and needs no explaining. Past
    // that, say the per-vial rate, and name the tier when one is earning it —
    // someone on 4 vials should be told they are on the 3-vial rate rather
    // than left to work out why the number moved.
    const note = $('pdPriceNote');
    if (!note) return;
    const t = tierFor(qty);
    if (qty === 1) {
      note.textContent = '';
      note.hidden = true;
      return;
    }
    note.hidden = false;
    note.innerHTML = t.off > 0
      ? `${money(unit)} per vial <span class="pd-note-sep">·</span> ${Math.round(t.off * 100)}% bundle discount at ${t.qty}+`
      : `${money(unit)} per vial`;
  }

  // everything that changes when a different mg is picked
  function renderSelection() {
    const s = size();

    renderPrice();
    // follows the mg picker: the line names the vial actually selected
    $('pdIdentity').textContent = identityLine(product, s);
    $('pdVialMg').textContent = s.mg.toUpperCase();
    $('pdVialFine').innerHTML =
      `${product.purity} Purity<br />FOR RESEARCH USE ONLY<br />glowresearch.shop`;

    document.title = `${product.name} ${s.mg} | Glow Research`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content',
        // Says the lot is third-party tested, which is true, but does not
        // promise a certificate the site can serve — COA_URL is empty, so the
        // document is available by email, not by link. Kept identical to the
        // build-time description in tools/build-products.js.
        `${product.name}, ${s.mg} per vial. Third-party tested research-grade peptide, supplied for laboratory and in-vitro research use only.`);
    }

    renderStock();
    renderTiers();
  }

  // The buy box never offers something we cannot ship. Both the button and the
  // dispatch line are driven off the same catalog field, so they cannot end up
  // disagreeing with each other.
  function renderStock() {
    const ok = sizeInStock(size());
    const btn = $('pdAddBtn');
    if (btn) {
      btn.disabled = !ok;
      btn.textContent = ok ? 'Add to cart' : 'Out of stock';
    }
    if (refreshDelivery) refreshDelivery();
  }

  /* ================= quantity + add ================= */

  function flash(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1300);
  }

  // Everything that depends on the quantity, in one place. The stepper and the
  // tier cards both call this rather than each updating their own corner of
  // the page, so the price, the note and the highlighted card can never
  // describe different quantities.
  function setQty(n) {
    qty = Math.max(1, n);
    $('pdQty').textContent = qty;
    $('pdQtyDec').disabled = qty <= 1;
    renderPrice();
    markActiveTier();
  }

  function wireBuy() {
    setQty(qty);

    $('pdQtyDec').addEventListener('click', () => setQty(qty - 1));
    $('pdQtyInc').addEventListener('click', () => setQty(qty + 1));

    // the cart line is unitSale × qty, and unitSale is the tier-adjusted price
    // the page just showed, so the cart charges what the buy box quoted
    const addCurrent = () => {
      const s = size();
      if (!sizeInStock(s)) return;   // the button is disabled too; this is the backstop
      window.GlowCart.add({
        name: product.name,
        variant: s.mg,
        qty,
        unitOriginal: s.price,
        unitSale: unitPriceAt(s.price, qty),
      });
    };

    $('pdAddBtn').addEventListener('click', () => {
      addCurrent();
      flash($('pdAddBtn'), 'Added to cart ✓');
    });
  }

  /* ================= buy more, pay less =================
     The cards are quantity shortcuts, not products. Pressing one sets the
     quantity and reprices the buy box above; nothing goes in the cart until
     the customer says so with the one button that adds to carts. Picking a
     bundle and being taken straight to a cart is the behaviour that makes
     people distrust a bundle picker, and it also made the stepper pointless. */

  // Highlights the tier the current quantity is actually earning, which at 4
  // vials is the 3-vial card. tierFor() decides, so the highlight and the
  // price are answering the same question with the same function.
  //
  // Past the last card the ladder carries on with no card to light up, and
  // nothing is highlighted rather than the top card being left lit. Lighting
  // "3 vials" while the buyer is on 5 and getting 15% would state the wrong
  // rate on screen; the note under the price names the real one.
  function markActiveTier() {
    const active = tierFor(qty).qty;
    document.querySelectorAll('#pdTiers .pd-tier').forEach(btn => {
      const isOn = +btn.dataset.qty === active;
      btn.classList.toggle('is-active', isOn);
      btn.setAttribute('aria-pressed', String(isOn));
    });
  }

  function renderTiers() {
    const s = size();
    const variants = getProductVariants(product, s.price);
    const wrap = $('pdTiers');

    // one vial per unit, but three is enough to read as "several" — past that
    // they just overlap into a smudge, and the label already says the count
    const vialArt = product.image
      ? `<img src="${pageHref(product.image)}" alt="" loading="lazy" />`
      : '<span class="vial"></span>';

    // Only the tiers that get a card. The ladder is longer, and bulkNote()
    // below states the rest, so the cards stay the three-way decision most
    // people are making instead of a wall of six.
    const cards = variants.filter(v => v.card);
    const ladderTop = Math.max(...variants.map(x => x.off));

    wrap.innerHTML = cards.map(v => {
      // "Best value" only if this card really is the best the ladder offers.
      // While the ladder runs past the cards no card earns the flag, and if
      // the cards are ever extended to cover it, it comes back on its own.
      const best = v.off === ladderTop;
      // The advertised figure is the bundle tier itself, stated as configured.
      // The sitewide markdown stacks on top, so the struck-through total shows
      // a bigger saving than the badge: the badge under-promises, never over.
      const pct = Math.round(v.off * 100);
      return `
        <button type="button" class="pd-tier${best ? ' is-best' : ''}" data-qty="${v.qty}" aria-pressed="false">
          ${best ? '<span class="pd-tier-flag">Best value</span>' : ''}
          <span class="pd-tier-vials">${vialArt.repeat(Math.min(v.qty, 3))}</span>
          <span class="pd-tier-qty">${v.label}</span>
          <span class="pd-tier-off${pct ? '' : ' is-plain'}">${pct ? `${pct}% off` : 'Standard'}</span>
          <span class="pd-tier-per">${money(v.unitSale)} / vial</span>
        </button>`;
    }).join('');

    wrap.querySelectorAll('.pd-tier').forEach(btn => {
      btn.addEventListener('click', () => setQty(+btn.dataset.qty));
    });

    // Written from the ladder, so the rates stated in words are the rates
    // charged. The static copy in product.html is the same sentence and is
    // pinned to this function by check-claims.js.
    const note = $('pdBulkNote');
    if (note) note.innerHTML = bulkNote();

    markActiveTier();
  }

  /* ================= canonical =================
     Generated pages ship a static canonical pointing at themselves, so this
     does nothing there. It exists for the legacy product.html?p=<slug> URL,
     which serves the same content as /peptides/<slug>/ and would otherwise
     compete with it in the index. */

  function setCanonical(p) {
    if (document.querySelector('link[rel="canonical"]')) return;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = new URL(`peptides/${productSlug(p.name)}/`, location.origin).href;
    document.head.appendChild(link);
  }

  /* ================= related ================= */

  // renderProductGrid marks every card ".reveal", which starts at opacity:0 and
  // waits for a scroll observer. This page has no scroll animations, so the
  // cards are shown outright instead.
  // The row is "more from Glow", not "more in this category", so it draws from
  // the whole catalog with siblings floated to the front. Filtering to the
  // category strictly meant a compound in a thin one got a single lonely card
  // under a heading promising the shop.
  function renderRelated(p) {
    const grid = $('pdRelatedGrid');
    // Only the grid goes if there is somehow nothing to show. The section stays,
    // because its "view the full catalog" link is the more useful of the two.
    if (GLOW_PRODUCTS.length < 2) { grid.hidden = true; return; }

    renderProductGrid(grid, 'all', {
      limit: 4,
      prefer: p.cat,
      exclude: p.name,
      observeReveal: el => el.classList.add('in'),
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

    setCanonical(product);
    renderBreadcrumb(product);
    renderHeader(product);
    renderEvidence(product);
    renderInfo(product);
    renderSizes(product);
    renderSelection();
    wireBuy();
    renderDelivery();
    renderRelated(product);
  });
})();
