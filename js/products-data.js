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

// gridEl: container to render into
// filter: 'all' or a category key
// opts.observeReveal(el): optional, hooks each card into a scroll-reveal observer
// opts.bumpCart(): optional, called when a card's "+" is clicked
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  const list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => p.cat === filter);
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
      if (opts.bumpCart) opts.bumpCart();
      addBtn.classList.add('added');
      addBtn.textContent = '✓';
      addBtn.setAttribute('aria-label', `${p.name} added`);
      setTimeout(() => {
        addBtn.classList.remove('added');
        addBtn.textContent = '+';
      }, 1400);
    });
    if (opts.observeReveal) opts.observeReveal(card);
  });
}
