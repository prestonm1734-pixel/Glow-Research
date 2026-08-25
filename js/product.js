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

  // CUTOFF_HOUR and TRANSIT_DAYS come from js/products-data.js. The shipping
  // page and the marquee state the same two figures in words, so they are
  // sitewide constants rather than ones this file owns and the others restate.

  // CAT_LABEL comes from js/products-data.js, loaded before this file.

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
        return;
      }
      const e = deliveryEstimate();
      // The countdown is the certainty the rest of this page is built on: not
      // "we ship fast", but how long is left to make today's pickup.
      cutEl.innerHTML = e.shipsToday
        ? `In stock, <strong>ships today</strong>. Order within <strong>${countdown(e.secondsLeft)}</strong>.`
        : 'In stock, <strong>ships next business day</strong>';
      arrEl.innerHTML = `Estimated delivery <strong>${fmtDay(e.arrivalDate)}</strong>`;
    }

    refreshDelivery = tick;
    tick();
    setInterval(tick, 60000);
  }

  /* ================= static bits ================= */

  function renderBreadcrumb(p) {
    $('pdCrumbName').textContent = p.name;
  }

  function renderHeader(p) {
    // The research category (Metabolic, Tissue…), not p.tag — p.tag is only
    // set on blends ("Peptide Blend") and is null for most single compounds,
    // which used to leave this badge silently blank. CAT_LABEL always has an
    // entry (check-claims.js enforces it), so this is never empty.
    $('pdTag').textContent = CAT_LABEL[p.cat];
    $('pdName').textContent = p.name;
    $('pdAlias').textContent = p.alias || '';
    $('pdDesc').textContent = p.blurb;
    $('pdVialName').textContent = p.name;
    $('pdRenderNote').textContent = VIAL_ART_NOTICE;

    renderPhoto(p, size());
    renderCoa(p);
  }

  // A handful of products ship with a real product photo; everything else
  // falls back to the illustrated CSS vial so the page never shows a gap.
  // Some of those photos are shot per size, since the label itself prints a
  // different mg — sizes[].image overrides the product's own p.image (already
  // defaulted to the first size's photo in js/products-data.js), so switching
  // the mg picker swaps the vial shown along with everything else that reads
  // the selected size.
  function renderPhoto(p, s) {
    const img = (s && s.image) || p.image;
    if (img) {
      // A path that fails to actually load (a slow CDN edge right after a
      // deploy, a dropped request) is not the same as having no photo, but
      // it should end up looking like it: the drawn vial, never the
      // browser's broken-image icon. Armed before src is set so a load that
      // fails immediately still catches.
      $('pdPhoto').onerror = () => {
        $('pdPhoto').hidden = true;
        $('pdVialArt').hidden = false;
      };
      $('pdPhoto').src = pageHref(img);
      $('pdPhoto').alt = `${p.name}${s ? ' ' + s.mg : ''} vial`;
      $('pdPhoto').hidden = false;
      $('pdVialArt').hidden = true;
    } else {
      $('pdPhoto').hidden = true;
      $('pdVialArt').hidden = false;
    }
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
    // a certificate is a document, not a step in the buying flow, so it
    // opens alongside the page rather than replacing it
    box.target = '_blank';
    box.rel = 'noopener';
  }

  /* ================= batch analysis =================
     Drawn by batchPanelHtml() in js/products-data.js, which is the same code
     tools/build-products.js runs at build time. Rendering here rather than
     trusting the baked markup means one product page cannot end up showing
     another's record after a navigation, and it is what fills the panel on
     product.html?p=<slug>, which has no baked content at all. */

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
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${COA_COPY.panelLink} →`;
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
    const unit = unitPriceAt(s.price, qty);
    // The higher of the launch list price and the plain per-vial price, for
    // the same reason lineRef() in js/cart.js takes a max: a quantity earning
    // a bulk tier must not quote a reference below the launch price.
    const listTotal = round2(Math.max(listPriceOf(s), s.price) * qty);
    const total = round2(unit * qty);

    $('pdPrice').innerHTML = listTotal > total
      ? `${money(total)}<s class="pd-price-was">${money(listTotal)}</s>`
      : money(total);

    renderSticky(total);

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
    renderPhoto(product, s);
    $('pdVialMg').textContent = s.mg.toUpperCase();
    $('pdVialFine').innerHTML =
      `${product.purity} Purity<br />FOR RESEARCH USE ONLY<br />glowresearch.shop`;

    document.title = `${product.name} ${s.mg} | Glow Research`;
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
    updateExpressPay();
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

    // The wallet has to go with them. A disabled Add to cart beside a live
    // Apple Pay button is not a smaller version of the same state: it is a
    // one-tap purchase of something we cannot ship, sitting next to the
    // control that just said so. Hidden rather than disabled because Stripe
    // draws the button in an iframe we do not style, so there is no disabled
    // state to put on it. api/_lib.js refuses the line as well; this is what
    // stops it being offered in the first place.
    //
    // Only ever hides a block canMakePayment() already revealed, tracked on
    // the element itself: a browser with no wallet must not be handed one by
    // an in-stock size later flipping this back.
    const wallet = $('pdExpress');
    if (wallet && wallet.dataset.walletReady === 'true') wallet.hidden = !ok;

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

  // Shows the bar only once every real buy control is out of view. Both are
  // watched because either one is a way to buy: with a wallet configured the
  // express button sits below Add to cart, so Add to cart can be off screen
  // while a perfectly good buy button is still sitting there.
  function initStickyBar() {
    const bar = $('pdSticky');
    if (!bar || typeof IntersectionObserver === 'undefined') return;

    const watched = [document.querySelector('.pd-buy'), $('pdExpress')].filter(Boolean);
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
  // the page, so the price, the note and the highlighted card can never
  // describe different quantities.
  function setQty(n) {
    qty = Math.max(1, n);
    $('pdQty').textContent = qty;
    $('pdQtyDec').disabled = qty <= 1;
    renderPrice();
    markActiveTier();
    updateExpressPay();
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
        unitList: listPriceOf(s),
        unitSale: unitPriceAt(s.price, qty),
      });
    };

    $('pdAddBtn').addEventListener('click', () => {
      addCurrent();
      flash($('pdAddBtn'), 'Added to cart ✓');
    });

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

  /* ================= express pay (Apple Pay / Google Pay) =================
     The flow itself lives in js/express-pay.js, shared with the top of the
     checkout page. What is product-specific is only ever "what is being
     bought", which is what these four functions answer. */

  function expressSubtotal() {
    const s = size();
    return round2(unitPriceAt(s.price, qty) * qty);
  }

  function initExpressPay() {
    if (typeof GlowExpressPay === 'undefined') return;
    GlowExpressPay.init({
      wrap: '#pdExpress',
      mount: '#pdExpressBtn',
      subtotal: expressSubtotal,
      // The exact vial and quantity the buy box is showing, priced the way the
      // buy box priced it, so the sheet cannot quote a different number from
      // the one on screen.
      items: () => {
        const s = size();
        return [{
          name: product.name, variant: s.mg, sku: s.sku, qty,
          unitOriginal: s.price, unitList: listPriceOf(s), unitSale: unitPriceAt(s.price, qty),
        }];
      },
      label: () => {
        const s = size();
        return `${product.name} ${s.mg}${qty > 1 ? ` × ${qty}` : ''}`;
      },
      // A sold-out size withdraws the offer, the same test renderStock() runs
      // on the Add to cart buttons.
      canOffer: () => sizeInStock(size()),
      onError: msg => { const el = $('pdExpressMsg'); if (el) el.textContent = msg; },
    });
  }

  // Called by setQty() and renderSelection(): the sheet's amount follows the
  // stepper and the mg picker.
  function updateExpressPay() {
    if (typeof GlowExpressPay !== 'undefined') GlowExpressPay.reprice();
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
    renderEvidence(product);
    renderSizes(product);
    renderSelection();
    wireBuy();
    initExpressPay();
    renderDelivery();
    renderRelated(product);
    // After initExpressPay(), so the express block is already in whatever
    // state this browser leaves it in before the observer starts watching it.
    initStickyBar();
  });
})();
