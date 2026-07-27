// ===================== Glow Research — shared product catalog =====================
// Used by both the homepage catalog preview (index.html) and the full
// catalog page (peptides.html) so the product list only lives in one place.

const GLOW_PRODUCTS = [
  { name: 'BPC-157', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', size: '5mg', price: 59, badge:'Best Seller' },
  { name: 'TB-500', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.6%', size: '5mg', price: 64, badge:null },
  { name: 'Ipamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.9%', size: '5mg', price: 54, badge:'Popular' },
  { name: 'CJC-1295', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.7%', size: '5mg', price: 69, badge:null },
  { name: 'Semaglutide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.5%', size: '5mg', price: 89, badge:'Trending' },
  { name: 'Tirzepatide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.4%', size: '10mg', price: 129, badge:null },
  { name: 'Selank', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.6%', size: '5mg', price: 58, badge:null },
  { name: 'Semax', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.7%', size: '5mg', price: 58, badge:'New' },
  { name: 'GHK-Cu', tag: 'Recovery Peptide', cat: 'recovery', purity: '99.8%', size: '50mg', price: 74, badge:null },
];

// Mock bulk-quantity tiers for the quick-add modal. WooCommerce will supply
// real variant IDs/pricing later; this just needs to look and feel right.
const QTY_TIERS = [
  { label: '1 vial', qty: 1, off: 0 },
  { label: '3 vials', qty: 3, off: 0.08 },
  { label: '5 vials', qty: 5, off: 0.15 },
  { label: '10 vials', qty: 10, off: 0.22 },
];

function getProductVariants(p) {
  return QTY_TIERS.map(t => {
    const original = t.qty * p.price;
    const sale = Math.round(original * (1 - t.off));
    return { label: t.label, qty: t.qty, original, sale };
  });
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
    const card = document.createElement('div');
    card.className = 'product-card reveal';
    card.style.transitionDelay = `${(i % 3) * 60}ms`;
    card.innerHTML = `
      <div class="product-visual">
        <span class="product-badge cat">${p.cat}</span>
        ${p.badge ? `<span class="product-badge status">${p.badge}</span>` : ''}
        <div class="vial"></div>
      </div>
      <div class="product-footer">
        <span class="product-tag">${p.tag}</span>
        <h3>${p.name}</h3>
        <p>${p.purity} purity &middot; ${p.size} per vial &middot; Lyophilized &amp; nitrogen sealed.</p>
        <div class="product-foot">
          <span class="price">$${p.price} <span>/ vial</span></span>
          <button class="add-btn" aria-label="Add ${p.name} to research order">+</button>
        </div>
      </div>
    `;
    gridEl.appendChild(card);
    const addBtn = card.querySelector('.add-btn');
    addBtn.addEventListener('click', () => {
      // the quick-add sheet is where a size gets chosen, so the cart is only
      // ever touched from in there
      if (window.openQuickAdd) window.openQuickAdd(p);
    });
    if (opts.observeReveal) opts.observeReveal(card);
  });
}
