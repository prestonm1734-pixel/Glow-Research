// ===================== Glow Research — site search =====================
// Builds a lightweight command-palette style search over GLOW_PRODUCTS
// (js/products-data.js) and wires it to any #searchToggle button on the page.
(function () {
  const toggle = document.getElementById('searchToggle');
  if (!toggle || typeof GLOW_PRODUCTS === 'undefined') return;

  const navPeptidesLink = document.querySelector('#mainNav a[href$="peptides.html"]');
  const CATALOG_HREF = navPeptidesLink ? navPeptidesLink.getAttribute('href') : 'peptides.html';

  let overlay, input, results, lastFocused;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search peptides">
        <div class="search-input-row">
          <svg class="search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input type="text" id="searchInput" placeholder="Search peptides..." autocomplete="off" />
          <button type="button" class="search-esc" id="searchClose">Esc</button>
        </div>
        <div class="search-results" id="searchResults"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    input = overlay.querySelector('#searchInput');
    results = overlay.querySelector('#searchResults');

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#searchClose').addEventListener('click', close);
    input.addEventListener('input', () => render(input.value));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  function row(p) {
    return `
      <a class="search-row" href="${CATALOG_HREF}">
        <span class="search-thumb">${productThumb(p.name)}</span>
        <span class="search-row-copy">
          <span class="search-row-name">${p.name}</span>
          <span class="search-row-meta">${p.tag} &middot; $${p.price}</span>
        </span>
        <svg class="search-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    `;
  }

  function render(query) {
    const q = query.trim().toLowerCase();
    const list = q
      ? GLOW_PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q))
      : GLOW_PRODUCTS;

    if (!list.length) {
      results.innerHTML = `<p class="search-empty">No peptides match "${query}".</p>`;
      return;
    }
    const label = q ? 'Results' : 'Popular';
    results.innerHTML = `<p class="search-label">${label}</p>` + list.map(row).join('');
  }

  function open() {
    if (!overlay) build();
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    document.body.classList.add('search-locked');
    input.value = '';
    render('');
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('search-locked');
    if (lastFocused) lastFocused.focus();
  }

  toggle.addEventListener('click', open);
})();
