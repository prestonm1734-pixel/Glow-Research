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
//
// `coa` is optional: a URL to that compound's own certificate of analysis.
// It is what "View certificate of analysis" on the product page opens. A
// product without one falls back to COA_URL below.
//
// `about` and `research` fill the tabs under the buy box. Same rule as
// `blurb`: composition and what laboratory work examines, never dosing,
// outcomes, or a finding we cannot stand behind.

// One certificate link shared by every product that has no `coa` of its own.
// Paste the hosted COA here (a PDF, a Drive link, whatever the lab gives you)
// and every product page's "View certificate of analysis" goes live at once.
// Left empty the box stays put and simply is not clickable, which is better
// than sending a buyer to a dead link.
const COA_URL = '';

const GLOW_PRODUCTS = [
  { name: 'BPC-157', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', badge:'Best Seller',
    sizes: [{ mg: '5mg', price: 59 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic pentadecapeptide sequence derived from a protein found in gastric juice. Used in laboratory work examining tissue repair and angiogenic signalling pathways.',
    about: [
      'BPC-157 is a synthetic pentadecapeptide: a fifteen amino acid sequence corresponding to a partial fragment of body protection compound, a protein identified in gastric juice. It is supplied lyophilized.',
      'The sequence is notable in laboratory work for holding up in aqueous and acidic conditions, which is part of why it appears so often in in-vitro and preclinical model systems.'
    ],
    research: [
      { t: 'Angiogenic signalling', d: 'Studied in endothelial cell models for interaction with the VEGF receptor 2 pathway and the formation of vessel structures in culture.' },
      { t: 'Fibroblast migration', d: 'Used in scratch and outgrowth assays examining how tendon and ligament fibroblasts migrate and organise.' },
      { t: 'Gut epithelial models', d: 'Examined in gastrointestinal tissue models, reflecting the gastric origin of the parent protein.' }
    ] },
  { name: 'TB-500', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 64 }, { mg: '10mg', price: 109 }],
    blurb: 'A synthetic fragment of thymosin beta-4, the actin-binding regulatory protein. Studied in vitro for cell migration and cytoskeletal dynamics.',
    about: [
      'TB-500 is a synthetic peptide corresponding to the actin-binding region of thymosin beta-4, a regulatory protein present in most mammalian cells. It is that fragment, not the whole protein.',
      'Because the sequence carries the actin-binding motif, it is used as a tool for probing cytoskeletal behaviour rather than as a stand-in for the full protein.'
    ],
    research: [
      { t: 'Actin sequestration', d: 'Investigated for how it binds monomeric G-actin and shifts the balance between free monomer and polymerised filament.' },
      { t: 'Cell migration', d: 'Applied in motility assays where cytoskeletal turnover governs how quickly cells cross a gap.' },
      { t: 'Vascular models', d: 'Studied alongside endothelial cultures examining the formation of new vessel structures.' }
    ] },
  { name: 'Ipamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.9%', badge:'Popular',
    sizes: [{ mg: '5mg', price: 54 }, { mg: '10mg', price: 92 }],
    blurb: 'A selective pentapeptide growth hormone secretagogue. Investigated in research settings for its binding behaviour at the ghrelin receptor.',
    about: [
      'Ipamorelin is a synthetic pentapeptide and a selective agonist at the growth hormone secretagogue receptor, GHS-R1a, the receptor the endogenous ligand ghrelin acts on.',
      'Its value in research is selectivity. In preclinical models it drives growth hormone release with comparatively little effect on ACTH, cortisol or prolactin, which makes it a cleaner probe of the pathway than earlier secretagogues.'
    ],
    research: [
      { t: 'Receptor selectivity', d: 'Used in binding and functional assays characterising activity at GHS-R1a against off-target endocrine receptors.' },
      { t: 'Pulsatile secretion', d: 'Studied in models examining how growth hormone is released in pulses rather than continuously.' },
      { t: 'Comparative pharmacology', d: 'Frequently run as the reference secretagogue when newer compounds are characterised.' }
    ] },
  { name: 'CJC-1295', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.7%', badge:null,
    sizes: [{ mg: '5mg', price: 69 }, { mg: '10mg', price: 118 }],
    blurb: 'A synthetic analogue of growth hormone releasing hormone. Used in receptor binding and pulsatile signalling studies.',
    about: [
      'CJC-1295 is a synthetic analogue of growth hormone releasing hormone, built on the first 29 amino acids of GHRH with substitutions that resist enzymatic breakdown.',
      'This is the form without drug affinity complex. It clears considerably faster than the DAC version, which matters when timing is part of the experimental design.'
    ],
    research: [
      { t: 'GHRH receptor binding', d: 'Used in receptor occupancy and activation assays at the pituitary GHRH receptor.' },
      { t: 'Pulse amplitude', d: 'Studied for how a GHRH analogue changes the size of a secretory pulse rather than its frequency.' },
      { t: 'Combination studies', d: 'Often paired with a secretagogue in preclinical work testing whether the two pathways are additive.' }
    ] },
  { name: 'Semaglutide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.5%', badge:'Trending',
    sizes: [{ mg: '5mg', price: 89 }, { mg: '10mg', price: 152 }],
    blurb: 'A GLP-1 receptor agonist analogue supplied for laboratory investigation of incretin receptor signalling and metabolic pathway research.',
    about: [
      'Semaglutide is a GLP-1 receptor agonist analogue. Two structural differences from native GLP-1 matter in the laboratory: an alpha-aminoisobutyric acid substitution at position 8 that resists DPP-4 cleavage, and a C18 fatty diacid chain at position 26 that promotes albumin binding.',
      'Those two modifications are why it behaves so differently from native GLP-1 across a time course, and usually why it is the chosen comparator.'
    ],
    research: [
      { t: 'Incretin receptor signalling', d: 'Used in cAMP accumulation and beta-arrestin recruitment assays at the GLP-1 receptor.' },
      { t: 'Albumin binding', d: 'Studied for how the fatty acid chain alters distribution and persistence in model systems.' },
      { t: 'Metabolic pathway research', d: 'Applied in islet and hepatocyte culture models examining downstream incretin signalling.' }
    ] },
  { name: 'GLP3-RT', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.4%', badge:null,
    sizes: [{ mg: '10mg', price: 129 }, { mg: '20mg', price: 219 }],
    image: 'assets/products/tirzepatide-vial.webp',
    blurb: 'A dual GIP and GLP-1 receptor agonist peptide. Used in research examining co-agonist receptor pharmacology.',
    about: [
      'GLP3-RT is a dual receptor co-agonist peptide, active at both the GIP and the GLP-1 receptor from a single molecule.',
      'Single-molecule co-agonists are studied precisely because the two receptors can be engaged at different relative potencies, which is difficult to reproduce by simply combining two separate agonists.'
    ],
    research: [
      { t: 'Co-agonist pharmacology', d: 'Used to characterise relative potency at the GIP and GLP-1 receptors from one molecule.' },
      { t: 'Biased signalling', d: 'Studied for the balance between G-protein coupling and beta-arrestin recruitment at each receptor.' },
      { t: 'Receptor crosstalk', d: 'Applied in models examining how engaging both receptors at once differs from either alone.' }
    ] },
  { name: 'Selank', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic heptapeptide based on the endogenous tetrapeptide tuftsin. Studied in preclinical models of neuropeptide regulation.',
    about: [
      'Selank is a synthetic heptapeptide: the endogenous tetrapeptide tuftsin extended with a Pro-Gly-Pro sequence that slows enzymatic degradation.',
      'That tail is the reason it is usable as a research tool at all, since unmodified tuftsin is cleared far too quickly to work with.'
    ],
    research: [
      { t: 'Neuropeptide regulation', d: 'Studied in preclinical models for interaction with endogenous regulatory peptide systems.' },
      { t: 'Monoamine and GABAergic systems', d: 'Examined in tissue models for effects on neurotransmitter turnover.' },
      { t: 'Expression studies', d: 'Used in work measuring changes in neurotrophic factor expression in brain tissue models.' }
    ] },
  { name: 'Semax', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.7%', badge:'New',
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic peptide derived from the ACTH(4-10) fragment. Investigated in laboratory research on neurotrophic signalling.',
    about: [
      'Semax is a synthetic peptide derived from the ACTH(4-10) fragment, carrying the same Pro-Gly-Pro stabilising extension used in Selank. It has no corticotropic activity of its own.',
      'That separation is the point: it lets the fragment be studied without the hormonal activity of the full ACTH molecule.'
    ],
    research: [
      { t: 'Neurotrophic signalling', d: 'Investigated for changes in BDNF and its receptor TrkB in brain tissue models.' },
      { t: 'Melanocortin-independent activity', d: 'Studied for effects that do not depend on classical melanocortin receptor engagement.' },
      { t: 'Preclinical CNS models', d: 'Applied in laboratory research on neuronal survival and adaptation.' }
    ] },
  { name: 'GHK-Cu', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', badge:null,
    sizes: [{ mg: '50mg', price: 74 }, { mg: '100mg', price: 126 }],
    blurb: 'A naturally occurring copper-binding tripeptide complex. Studied in vitro for its role in extracellular matrix remodelling.',
    about: [
      'GHK-Cu is the tripeptide glycyl-L-histidyl-L-lysine complexed with copper(II). The tripeptide occurs naturally in plasma and binds copper with high affinity, and it is the complex rather than the bare peptide that most research uses.',
      'It ships as the copper complex, which is blue. That colour is a useful handling cue: it tells you the copper is still coordinated.'
    ],
    research: [
      { t: 'Extracellular matrix remodelling', d: 'Studied in fibroblast culture for effects on collagen and proteoglycan gene expression.' },
      { t: 'Copper transport', d: 'Used as a model for how small peptides carry and deliver copper ions between compartments.' },
      { t: 'Antioxidant enzyme activity', d: 'Examined for interaction with copper-dependent enzyme systems.' }
    ] },
];

// Everything outside the product page still asks for a single p.size / p.price.
// Derive them from the smallest size rather than repeating them in the literal,
// so the "from" price on a card can never drift from the picker on the page.
GLOW_PRODUCTS.forEach(p => {
  p.size = p.sizes[0].mg;
  p.price = p.sizes[0].price;
});

// Sort comparators for the catalog's sort control. Keyed so the <option>
// values and the sorting logic can't drift apart. 'featured' is deliberately
// absent — no comparator means the curated GLOW_PRODUCTS order stands.
// Names are compared with localeCompare + numeric so GLP3-RT and CJC-1295
// order by their digits rather than lexically ("CJC-1295" before "CJC-295").
const PRODUCT_SORTS = {
  az:          (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }),
  za:          (a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc':(a, b) => b.price - a.price,
  purity:      (a, b) => parseFloat(b.purity) - parseFloat(a.purity),
};

// ---------------------------------------------------------------------------
// Sitewide markdown. The figures in `sizes` above stay the list price — this is
// the single knob that discounts them, so display and what actually gets
// charged can never drift apart. Set to 0 to take the sale down.
//
// Every price the buyer sees runs through salePrice(); every cart line carries
// the list price as unitOriginal and the marked-down one as unitSale, which is
// what the cart and checkout already total against.
const SITEWIDE_DISCOUNT = 0.10;

const round2 = n => Math.round(n * 100) / 100;
const salePrice = n => round2(n * (1 - SITEWIDE_DISCOUNT));
const onSaleNow = () => SITEWIDE_DISCOUNT > 0;
// whole dollars stay clean ($59), marked-down ones keep their cents ($53.10)
const fmtPrice = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));

// "Save N%" badges are for bulk tiers only. The sitewide markdown is not
// advertised anywhere — the struck-through list price is the whole signal — so
// a line saving exactly the sitewide rate gets no badge, and one saving more
// (because a bulk tier stacked on top) reports the combined figure.
function bulkSavingPct(original, sale) {
  if (!(original > sale)) return 0;
  const pct = Math.round((1 - sale / original) * 100);
  return pct > Math.round(SITEWIDE_DISCOUNT * 100) ? pct : 0;
}

// Mock bulk-quantity tiers for the quick-add modal. WooCommerce will supply
// real variant IDs/pricing later; this just needs to look and feel right.
const QTY_TIERS = [
  { label: '1 vial', qty: 1, off: 0 },
  { label: '2 vials', qty: 2, off: 0.08 },
  { label: '3 vials', qty: 3, off: 0.15 },
];

// unitPrice lets the product page price its tiers off whichever mg is selected;
// callers that only know the product (the quick-add sheet) get the base size.
function getProductVariants(p, unitPrice) {
  const unit = unitPrice || p.price;
  return QTY_TIERS.map(t => {
    const original = t.qty * unit;
    // the sitewide markdown comes off first, then the bulk tier stacks on it,
    // so `original` stays the true list price for the struck-through figure
    const sale = round2(original * (1 - SITEWIDE_DISCOUNT) * (1 - t.off));
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
// opts.sort: optional key from PRODUCT_SORTS. Omitted leaves the curated
//   order in GLOW_PRODUCTS alone, which is what the homepage preview wants —
//   its limit:8 slice is meant to be the featured eight, not the first eight
//   alphabetically.
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  let list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => p.cat === filter);

  // a category with nothing in it used to render a silently blank grid
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'product-grid-empty';
    empty.textContent = 'No compounds in this category yet.';
    gridEl.appendChild(empty);
    return;
  }

  const compare = PRODUCT_SORTS[opts.sort];
  // slice() so sorting a view never reorders GLOW_PRODUCTS itself — the
  // curated order has to survive for every other caller
  if (compare) list = list.slice().sort(compare);

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
        <span class="price">
          ${onSaleNow() ? `<s class="price-was">${fmtPrice(p.price)}</s>` : ''}
          ${fmtPrice(salePrice(p.price))} <span>/ vial</span>
        </span>
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
