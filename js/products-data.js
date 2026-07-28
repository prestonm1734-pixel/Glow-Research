// ===================== Glow Research — shared product catalog =====================
// Used by both the homepage catalog preview (index.html) and the full
// catalog page (peptides.html) so the product list only lives in one place.

// `blurb` describes what each compound *is* and how it is studied. It must stay
// structural and in-vitro framed: no dosing, no human outcome claims, nothing
// that would read as therapeutic guidance on a research-use-only listing.
//
// `sizes` is the mg picker on the product page, cheapest first. The first entry
// is the one the catalog grid, search and quick-add all quote, so it doubles as
// the product's headline size/price (see the normalise pass below).
const GLOW_PRODUCTS = [
  { name: 'BPC-157', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', badge:'Best Seller',
    sizes: [{ mg: '5mg', price: 59 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic pentadecapeptide sequence derived from a protein found in gastric juice. Used in laboratory work examining tissue repair and angiogenic signalling pathways.' },
  { name: 'TB-500', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 64 }, { mg: '10mg', price: 109 }],
    blurb: 'A synthetic fragment of thymosin beta-4, the actin-binding regulatory protein. Studied in vitro for cell migration and cytoskeletal dynamics.' },
  { name: 'Ipamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.9%', badge:'Popular',
    sizes: [{ mg: '5mg', price: 54 }, { mg: '10mg', price: 92 }],
    blurb: 'A selective pentapeptide growth hormone secretagogue. Investigated in research settings for its binding behaviour at the ghrelin receptor.' },
  { name: 'CJC-1295', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.7%', badge:null,
    sizes: [{ mg: '5mg', price: 69 }, { mg: '10mg', price: 118 }],
    blurb: 'A synthetic analogue of growth hormone releasing hormone. Used in receptor binding and pulsatile signalling studies.' },
  { name: 'Semaglutide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.5%', badge:'Trending',
    sizes: [{ mg: '5mg', price: 89 }, { mg: '10mg', price: 152 }],
    blurb: 'A GLP-1 receptor agonist analogue supplied for laboratory investigation of incretin receptor signalling and metabolic pathway research.' },
  { name: 'Tirzepatide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.4%', badge:null,
    sizes: [{ mg: '10mg', price: 129 }, { mg: '20mg', price: 219 }],
    image: 'assets/products/tirzepatide-vial.webp',
    blurb: 'A dual GIP and GLP-1 receptor agonist peptide. Used in research examining co-agonist receptor pharmacology.' },
  { name: 'Selank', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic heptapeptide based on the endogenous tetrapeptide tuftsin. Studied in preclinical models of neuropeptide regulation.' },
  { name: 'Semax', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.7%', badge:'New',
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic peptide derived from the ACTH(4-10) fragment. Investigated in laboratory research on neurotrophic signalling.' },
  { name: 'GHK-Cu', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', badge:null,
    sizes: [{ mg: '50mg', price: 74 }, { mg: '100mg', price: 126 }],
    blurb: 'A naturally occurring copper-binding tripeptide complex. Studied in vitro for its role in extracellular matrix remodelling.' },
];

// Everything outside the product page still asks for a single p.size / p.price.
// Derive them from the smallest size rather than repeating them in the literal,
// so the "from" price on a card can never drift from the picker on the page.
GLOW_PRODUCTS.forEach(p => {
  p.size = p.sizes[0].mg;
  p.price = p.sizes[0].price;
});

// Mock bulk-quantity tiers for the quick-add modal. WooCommerce will supply
// real variant IDs/pricing later; this just needs to look and feel right.
const QTY_TIERS = [
  { label: '1 vial', qty: 1, off: 0 },
  { label: '3 vials', qty: 3, off: 0.08 },
  { label: '5 vials', qty: 5, off: 0.15 },
  { label: '10 vials', qty: 10, off: 0.22 },
];

// unitPrice lets the product page price its tiers off whichever mg is selected;
// callers that only know the product (the quick-add sheet) get the base size.
function getProductVariants(p, unitPrice) {
  const unit = unitPrice || p.price;
  return QTY_TIERS.map(t => {
    const original = t.qty * unit;
    const sale = Math.round(original * (1 - t.off));
    return { label: t.label, qty: t.qty, original, sale };
  });
}

// URL-safe id for linking a card to its detail page: "BPC-157" -> "bpc-157"
function productSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function findProductBySlug(slug) {
  return GLOW_PRODUCTS.find(p => productSlug(p.name) === slug);
}

// Blog articles live two directories deep, so a bare "product.html" would
// 404 from there. Lift the nav's already-depthed link rather than tracking
// depth separately (same trick js/cart.js uses).
function pageHref(file) {
  const link = document.querySelector('#mainNav a[href$="peptides.html"]');
  const prefix = link ? link.getAttribute('href').replace(/peptides\.html$/, '') : '';
  return prefix + file;
}

// Thumbnail markup for a product, looked up by name so the cart and checkout
// can call it with nothing but a stored line item. Falls back to the drawn
// vial for products that have no photo yet.
function productThumb(name) {
  const p = GLOW_PRODUCTS.find(x => x.name === name);
  if (p && p.image) {
    return `<img class="thumb-photo" src="${pageHref(p.image)}" alt="" loading="lazy" />`;
  }
  return '<span class="vial"></span>';
}

// gridEl: container to render into
// filter: 'all' or a category key
// opts.observeReveal(el): optional, hooks each card into a scroll-reveal observer
// opts.limit: optional, render at most this many cards
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  let list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => p.cat === filter);
  if (opts.limit) list = list.slice(0, opts.limit);
  list.forEach((p, i) => {
    const href = pageHref(`product.html?p=${productSlug(p.name)}`);
    const card = document.createElement('div');
    card.className = 'product-card reveal';
    card.style.transitionDelay = `${(i % 3) * 60}ms`;
    card.innerHTML = `
      <a class="product-visual" href="${href}">
        <span class="product-badge cat">${p.cat}</span>
        ${p.badge ? `<span class="product-badge status">${p.badge}</span>` : ''}
        ${p.image
          ? `<img class="product-photo" src="${pageHref(p.image)}" alt="${p.name} vial" loading="lazy" />`
          : '<div class="vial"></div>'}
      </a>
      <div class="product-footer">
        <h3><a href="${href}">${p.name}</a></h3>
        <span class="card-divider" aria-hidden="true"></span>
        <span class="price">$${p.price} <span>/ vial</span></span>
        <button class="add-btn" aria-label="Add ${p.name} to research order">Add to Cart</button>
      </div>
    `;
    gridEl.appendChild(card);

    // the whole card opens the product page; the button is the one exception,
    // and it opens the quick-add sheet instead — the size/quantity picker,
    // so the cart is only ever touched from in there
    const addBtn = card.querySelector('.add-btn');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openQuickAdd) window.openQuickAdd(p);
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;   // let real links/buttons behave normally
      window.location.href = href;
    });
    card.style.cursor = 'pointer';

    if (opts.observeReveal) opts.observeReveal(card);
  });
}
