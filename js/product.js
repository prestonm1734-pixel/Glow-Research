// ===================== Glow Research — product detail page =====================
// Reads ?p=<slug> from the URL, looks the product up in the shared catalog
// (js/products-data.js), and renders everything from one source so this page
// can never drift from the grid it was clicked from.
//
// The page has exactly one decision on it: which mg. Picking a size re-prices
// the buy box, the bulk tiers and the spec table together.
(function () {
  const $ = id => document.getElementById(id);
  // fmtPrice() (js/products-data.js) is the one place "$65, not $65.00" is
  // decided — the catalog card and the cart already read it, so the buy box
  // does too rather than keeping its own .toFixed(2) that always shows cents.
  const money = fmtPrice;

  // NO_DISPATCH_DAYS, NO_DELIVERY_DAY, DISPATCH_CUTOFF_HOUR,
  // DISPATCH_CUTOFF_PDP_LABEL, DISPATCH_LABEL and TRANSIT_DAYS come from
  // js/products-data.js. The shipping page and the marquee state the same
  // figures in words, so they are sitewide constants rather than ones this
  // file owns and the others restate.

  let product = null;
  let sizeIndex = 0;
  // The page opens on one vial, plain, with nothing added to the cart yet.
  // Landing on the 3-vial card would put a quantity in the buy box the
  // visitor never chose — the cards are for picking a quantity, not for the
  // page picking one for them.
  let qty = 1;
  // set by renderDelivery() so picking a different mg re-reads its stock
  let refreshDelivery = null;

  const size = () => product.sizes[sizeIndex];

  // Generated pages (product/<slug>/index.html, built by
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
  const addDays = (date, n) => {
    const out = new Date(date);
    out.setUTCDate(out.getUTCDate() + n);
    return out;
  };

  const fmtDay = d => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric',
  }).format(d);

  // Plain days, not business days. Saturday is a dispatch day here and FedEx
  // runs Saturday delivery, so stepping over the whole weekend would push
  // every late-week estimate out by two days it does not actually take.
  //
  // Counted inclusively from the day dispatch actually happens: a Tuesday
  // dispatch sees Thursday. Sunday is handled at both ends and for two
  // different reasons — nothing is dispatched on a Sunday, so a Sunday
  // visitor is quoted from Monday, and nothing is delivered on a Sunday, so
  // an estimate that lands there moves to the Monday rather than naming a
  // date on which no box arrives.
  //
  // Dispatch day is no longer always "today": DISPATCH_CUTOFF_HOUR
  // (js/products-data.js) is a real fulfilment-partner cutoff, confirmed
  // against their actual same-day process rather than assumed the way the
  // old, since-removed 2:00 PM PST one was. A visitor reading the page after
  // that Pacific hour is quoted from tomorrow, the same as a Sunday visitor
  // is quoted from Monday.
  function deliveryEstimate() {
    const nowParts = pacificParts(new Date());
    const today = anchor(nowParts);
    let d = today;
    if (Number(nowParts.hour) >= DISPATCH_CUTOFF_HOUR) d = addDays(d, 1);
    // A while, not an if: Saturday and Sunday are consecutive non-dispatch
    // days, so landing on Saturday needs two steps forward to reach Monday,
    // not one.
    while (NO_DISPATCH_DAYS.includes(d.getUTCDay())) d = addDays(d, 1);
    const dispatchesToday = d.getTime() === today.getTime();

    d = addDays(d, TRANSIT_DAYS);
    if (d.getUTCDay() === NO_DELIVERY_DAY) d = addDays(d, 1);

    return { arrivalDate: d, dispatchesToday };
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
        return;
      }
      const e = deliveryEstimate();
      // Stated relative to where this particular visitor actually is against
      // the cutoff, not the general policy sentence FAQS reads — "ships
      // today" is a stronger, truer thing to say than DISPATCH_LABEL's
      // if/otherwise phrasing once the answer is already known. "In stock"
      // dropped: sizeInStock(size()) already gated this whole branch, so the
      // line above it is redundant with the fact that got you here.
      cutEl.innerHTML = e.dispatchesToday
        ? `<strong>Ships today</strong> if ordered by ${DISPATCH_CUTOFF_PDP_LABEL}`
        : `<strong>Ships the next dispatch day</strong>`;
      arrEl.innerHTML = `Estimated delivery <strong>${fmtDay(e.arrivalDate)}</strong>`;
    }

    refreshDelivery = tick;
    tick();
    // Nothing counts down any more, but the arrival date still rolls over at
    // Pacific midnight, and a page left open overnight would otherwise sit
    // there quoting yesterday's estimate.
    setInterval(tick, 60000);
  }

  /* ================= static bits ================= */

  // Guarded like renderDelivery and renderSelection's meta-desc below: this
  // runs as one unbroken chain through wireBuy, renderDelivery and
  // initStickyBar (see the DOMContentLoaded handler), so one missing element
  // here must not throw and take the buy button and delivery estimate down
  // with it.
  function renderBreadcrumb(p) {
    const el = $('pdCrumbName');
    if (el) el.textContent = p.name;
  }

  function renderHeader(p) {
    const nameEl = $('pdName');
    const aliasEl = $('pdAlias');
    const descEl = $('pdDesc');
    if (nameEl) nameEl.textContent = p.name;
    if (aliasEl) aliasEl.textContent = p.alias || '';
    if (descEl) descEl.textContent = p.blurb;

    renderPhoto(p, size());
    renderCoa(p);
  }

  // Every product now ships with a real photo, so this only ever picks
  // which one: sizes[].image overrides the product's own p.image (already
  // defaulted to the first size's photo in js/products-data.js) for the
  // few products photographed per size, since the label itself prints a
  // different mg. Switching the mg picker swaps the photo along with
  // everything else that reads the selected size.
  function renderPhoto(p, s) {
    const photo = $('pdPhoto');
    if (!photo) return;
    const img = (s && s.image) || p.image;
    photo.src = pageHref(img);
    photo.alt = '';
    const stage = $('pdStage');
    if (stage) stage.classList.toggle('is-fill', !!(s && s.fit === 'fill'));
  }

  /* ================= certificate =================
     "View certificate of analysis" opens the document itself, resolved by
     coaHref() in js/products-data.js: the product's own `coa` if it has one,
     otherwise the shared COA_URL, and nothing at all while COAS_PUBLISHED is
     false. Until there is a document the box keeps its wording but carries no
     href, so it can never send anyone to a 404. */

  function renderCoa(p) {
    const box = $('pdCoaLink');
    if (!box) return;

    const href = coaHref(p);
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
    // Opens in the certificate viewer on this page rather than taking the
    // reader away from the buy box. The href stays, so without scripts (or
    // with a modifier-click) it still opens the PDF itself.
    box.removeAttribute('target');
    if (!box.dataset.viewer) {
      box.dataset.viewer = '1';
      box.addEventListener('click', e => {
        if (!window.GlowCoaViewer || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        window.GlowCoaViewer.open(product);
      });
    }
  }

  /* ================= batch analysis =================
     Drawn by batchPanelHtml() in js/products-data.js, which is the same code
     tools/build-products.js runs at build time. Rendering here rather than
     trusting the baked markup means one product page cannot end up showing
     another's record after a navigation, and it is what fills the panel on
     product.html?p=<slug>, which has no baked content at all. */

  function renderProfile(p) {
    const wrap = $('pdProfile');
    if (wrap) wrap.innerHTML = productProfileHtml(p, size());
  }

  function renderEvidence(p) {
    const wrap = $('pdEvidence');
    if (!wrap) return;
    wrap.innerHTML = batchPanelHtml(p);

    // The certificate link is drawn only when there is a document to open, on
    // the same test renderCoa() uses. No href, no link: a line that says "view
    // report" and does nothing is the uncertainty this panel exists to remove.
    const href = coaHref(p);
    const foot = wrap.querySelector('.ba-foot');
    if (href && COA_COPY.panelLink && foot) {
      const a = document.createElement('a');
      a.className = 'gs-report';
      a.href = href;
      a.textContent = `${COA_COPY.panelLink} →`;
      a.addEventListener('click', e => {
        if (!window.GlowCoaViewer || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        window.GlowCoaViewer.open(p);
      });
      foot.after(a);
    }
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
    const unit = unitPriceAt(s.price, qty, qty, s.sku);
    // The higher of the launch list price and the plain per-vial price, for
    // the same reason lineRef() in js/cart.js takes a max: a quantity earning
    // a bulk tier must not quote a reference below the launch price.
    const listTotal = round2(Math.max(listPriceOf(s), s.price) * qty);
    const total = round2(unit * qty);

    const priceEl = $('pdPrice');
    if (priceEl) {
      priceEl.innerHTML = listTotal > total
        ? `${money(total)}<s class="pd-price-was">${money(listTotal)}</s>`
        : money(total);
    }

    renderSticky(total);

    // How many more to add for the next free vial. Always counts forward,
    // never confirms one already earned — at 3, 6 or 9 vials that's a full
    // group away, not "0 more", because the pill is answering the same
    // question at every quantity rather than switching to a different one
    // right at the multiples.
    const note = $('pdPriceNote');
    if (note) note.textContent = nextTierNudge(qty, s.sku);

    // The per-vial rate. Quiet, and only shown once there's a bundle rate to
    // state — at one vial it would just repeat the price above it.
    const unitEl = $('pdUnitPrice');
    if (unitEl) {
      unitEl.hidden = qty === 1;
      unitEl.textContent = qty === 1 ? '' : `${money(unit)} per vial`;
    }
  }

  // everything that changes when a different mg is picked
  function renderSelection() {
    const s = size();

    renderPrice();
    renderPhoto(product, s);

    document.title = productTitle(product, s);
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      // productMetaDesc() from the catalog, which tools/build-products.js
      // bakes into the generated page's head. It was a second copy of the
      // sentence typed here, so the served page and the hydrated one could
      // describe the same product differently.
      desc.setAttribute('content', productMetaDesc(product, s));
    }

    renderStock();
    renderTiers();
  }

  // The buy box never offers something we cannot ship. Both the button and the
  // dispatch line are driven off the same catalog field, so they cannot end up
  // disagreeing with each other. The sticky bar reads the same field for the
  // same reason: it is the same control, so it cannot be sellable while the
  // one it stands in for is not.
  function renderStock() {
    const ok = sizeInStock(size());
    [$('pdAddBtn'), $('pdStickyAdd')].forEach(btn => {
      if (!btn) return;
      btn.disabled = !ok;
      btn.textContent = ok ? 'Add to cart' : 'Out of stock';
    });

    if (refreshDelivery) refreshDelivery();
  }

  /* ================= sticky buy bar =================
     Mobile only, and only while the real buy controls are off screen. It is a
     restatement of the buy box, never a second source for any of it: the name,
     the mg and the total all come from the same place the buy box reads, and
     the button runs the same addCurrent(). */

  // Called by renderPrice(), so the bar reprices with the buy box rather than
  // keeping its own copy of a total that a quantity change would strand.
  function renderSticky(total) {
    const name = $('pdStickyName');
    const sub = $('pdStickySub');
    if (!name || !sub) return;
    // Identity on the quiet line, the number on the loud one. The name and mg
    // ride together because either alone is ambiguous next to a price, and the
    // price stands by itself because it is the only part that moves.
    name.textContent = `${product.name} · ${size().mg}`;
    sub.textContent = money(total);
  }

  // Shows the bar only once the real buy control is out of view.
  function initStickyBar() {
    const bar = $('pdSticky');
    if (!bar || typeof IntersectionObserver === 'undefined') return;

    const watched = [document.querySelector('.pd-buy')].filter(Boolean);
    if (!watched.length) return;

    const onScreen = new Map(watched.map(el => [el, true]));
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => onScreen.set(e.target, e.isIntersecting));
      const show = ![...onScreen.values()].some(Boolean);
      // Removed on the first callback rather than up front: hidden until the
      // observer has actually measured something, so the bar cannot flash over
      // the page during first paint.
      bar.hidden = false;
      bar.classList.toggle('is-shown', show);
      bar.setAttribute('aria-hidden', String(!show));
      document.body.classList.toggle('pd-sticky-shown', show);
    }, { rootMargin: '0px 0px -12px 0px' });

    watched.forEach(el => io.observe(el));
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
  // the page, so the price and the highlighted card can never describe
  // different quantities.
  function setQty(n) {
    // No upper bound and no fixed stops: anyone can step to 4, 5, 12, whatever
    // they want. freeVials()/paidVials() price any quantity correctly, so
    // there is nothing a ragged number could get wrong here — only the
    // ceiling of what the cards below can shortcut to.
    qty = Math.max(1, Math.round(n) || 1);
    const qtyEl = $('pdQty');
    const decEl = $('pdQtyDec');
    if (qtyEl) qtyEl.textContent = qty;
    if (decEl) decEl.disabled = qty <= 1;
    renderPrice();
    markActiveTier();
  }

  function wireBuy() {
    setQty(qty);

    const decBtn = $('pdQtyDec');
    const incBtn = $('pdQtyInc');
    if (decBtn) decBtn.addEventListener('click', () => setQty(qty - 1));
    if (incBtn) incBtn.addEventListener('click', () => setQty(qty + 1));

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
        unitList: listPriceOf(s),
        unitSale: unitPriceAt(s.price, qty, qty, s.sku),
      });
    };

    const addBtn = $('pdAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addCurrent();
        flash(addBtn, 'Added to cart ✓');
      });
    }

    // Same add, same confirmation. The sticky bar carries no quantity of its
    // own: it adds whatever the stepper above is currently set to, which is
    // the quantity its own price is quoting.
    const sticky = $('pdStickyAdd');
    if (sticky) {
      sticky.addEventListener('click', () => {
        addCurrent();
        flash(sticky, 'Added ✓');
      });
    }
  }

  /* ================= buy more, pay less =================
     The cards are quantity shortcuts, not products. Pressing one sets the
     quantity and reprices the buy box above; nothing goes in the cart until
     the customer says so with the one button that adds to carts. Picking a
     bundle and being taken straight to a cart is the behaviour that makes
     people distrust a bundle picker, and it also made the stepper pointless. */

  // Highlights the card matching the current quantity exactly. Stepping to
  // anything that isn't 3, 6 or 9 (1, 2, 4, 5, 7...) lights no card at all,
  // rather than the nearest one — a lit "3 vials" while the buyer is on 4
  // would state a rate they aren't getting. The per-vial line under the
  // price is what speaks for a quantity with no card lit.
  function markActiveTier() {
    document.querySelectorAll('#pdTiers .pd-tier').forEach(btn => {
      const isOn = +btn.dataset.qty === qty;
      btn.classList.toggle('is-active', isOn);
      btn.setAttribute('aria-pressed', String(isOn));
    });
  }

  function renderTiers() {
    const s = size();
    const variants = getProductVariants(product, s.price);
    const wrap = $('pdTiers');
    if (!wrap) return;

    // one vial per unit, but three is enough to read as "several" — past that
    // they just overlap into a smudge, and the label already says the count
    const vialArt = `<img src="${pageHref(product.image)}" alt="" loading="lazy" />`;
    // GHK-Cu is the one product whose smallest bundle leads with the
    // percentage instead of the dollar figure — see the comment on it in
    // js/products-data.js. At 6 and 9 vials the dollar figure is unambiguously
    // the bigger number even there, so the exception is scoped to the first
    // card rather than the whole product.
    const pctFormat = product.bulkSavingsFormat === 'pct';
    const smallest = variants[0].qty;

    wrap.innerHTML = variants.map(v => {
      const usePct = pctFormat && v.qty === smallest;
      // All three cards earn a free vial now — the escalating count (1, 2, 3)
      // is what makes the ladder read as growing, not a "best value" claim on
      // the 9, which would not survive anyone doing the division: every card
      // is the same $/vial. The first card gets visual weight instead of a
      // claim — it is the one most people are actually deciding between.
      return `
        <button type="button" class="pd-tier${v.qty === smallest ? ' is-featured' : ''}" data-qty="${v.qty}" aria-pressed="false">
          <span class="pd-tier-flag">${v.free} free</span>
          <span class="pd-tier-off">${usePct
            ? `${Math.round((1 - v.sale / v.original) * 100)}% off`
            : `Save ${money(v.saveDollars)}`}</span>
          <span class="pd-tier-vials">${vialArt.repeat(Math.min(v.qty, 3))}</span>
          <span class="pd-tier-qty">${v.label}</span>
          <span class="pd-tier-price">${money(v.sale)}</span>
          <span class="pd-tier-unit">${money(v.unitSale)} per vial</span>
        </button>`;
    }).join('');

    wrap.querySelectorAll('.pd-tier').forEach(btn => {
      btn.addEventListener('click', () => setQty(+btn.dataset.qty));
    });

    markActiveTier();
  }

  /* ================= canonical =================
     Generated pages ship a static canonical pointing at themselves, so this
     does nothing there. It exists for the legacy product.html?p=<slug> URL,
     which serves the same content as /product/<slug>/ and would otherwise
     compete with it in the index. */

  function setCanonical(p) {
    if (document.querySelector('link[rel="canonical"]')) return;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = new URL(`product/${productSlug(p.name)}/`, location.origin).href;
    document.head.appendChild(link);
  }

  /* ================= related ================= */

  // renderProductGrid marks every card ".reveal". The stylesheet exempts
  // .product-card from the fade that class otherwise carries, so cards are
  // visible wherever they are rendered, and this page runs no scroll
  // observer at all to add the "in" that would end it.
  // The row is "more from Glow", not "more in this category", so it draws from
  // the whole catalog with siblings floated to the front. Filtering to the
  // category strictly meant a compound in a thin one got a single lonely card
  // under a heading promising the shop.
  function renderRelated(p) {
    const grid = $('pdRelatedGrid');
    if (!grid) return;
    // Only the grid goes if there is somehow nothing to show. The section stays,
    // because its "view the full catalog" link is the more useful of the two.
    if (GLOW_PRODUCTS.length < 2) { grid.hidden = true; return; }

    // Every other compound, same-category ones first, each with its purity
    // and a View COA chip that opens the certificate in place.
    const others = GLOW_PRODUCTS.filter(o => o.name !== p.name)
      .sort((a, b) => (b.cat === p.cat) - (a.cat === p.cat));
    grid.innerHTML = others.map(o => {
      const s = o.sizes.find(z => sizeInStock(z)) || o.sizes[0];
      const inStock = sizeInStock(s);
      const list = Math.max(listPriceOf(s), s.price);
      const doc = coaHref(o);
      return `
        <article class="pr-card">
          <a class="pr-img" href="${productHref(o)}"><img src="${pageHref(s.image || o.image)}" alt="" loading="lazy" />
            ${o.purity && doc ? `<button type="button" class="pr-chip" data-coa="${escHtml(o.name)}">&#10003; ${escHtml(o.purity)} &middot; <u>View COA</u></button>` : ''}</a>
          <div class="pr-body">
            <a href="${productHref(o)}">${escHtml(o.name)}</a>
            <span class="pr-price">${money(s.price)}${list > s.price ? `<s>${money(list)}</s>` : ''}</span>
            <button type="button" class="pr-add" data-add="${escHtml(s.sku)}"${inStock ? '' : ' disabled'}>${inStock ? '+ Add' : 'Sold out'}</button>
          </div>
        </article>`;
    }).join('');

    grid.addEventListener('click', e => {
      const chip = e.target.closest('[data-coa]');
      if (chip) {
        e.preventDefault();
        const o = GLOW_PRODUCTS.find(x => x.name === chip.dataset.coa);
        if (o && window.GlowCoaViewer) window.GlowCoaViewer.open(o);
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add && window.GlowCart) {
        const o = GLOW_PRODUCTS.find(x => x.sizes.some(z => z.sku === add.dataset.add));
        const s = o.sizes.find(z => z.sku === add.dataset.add);
        window.GlowCart.add({ name: o.name, variant: s.mg, sku: s.sku, qty: 1,
          unitOriginal: s.price, unitList: listPriceOf(s), unitSale: unitPriceAt(s.price, 1) });
      }
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

    if (window.GlowAnalytics) {
      window.GlowAnalytics.track('product_viewed', {
        sku: size().sku,
        name: product.name,
        category: product.cat,
        price: size().price,
      });
    }

    setCanonical(product);
    renderBreadcrumb(product);
    renderHeader(product);
    renderProfile(product);
    renderEvidence(product);
    renderSizes(product);
    renderSelection();
    wireBuy();
    renderDelivery();
    renderRelated(product);
    initStickyBar();
  });
})();
