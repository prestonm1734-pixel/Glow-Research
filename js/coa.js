// ===================== Glow Research — certificate index =====================
// Every compound in the catalog, searchable, with its certificate behind a
// View button.
//
// The list is GLOW_PRODUCTS itself rather than a second list kept beside it.
// A compound that ships has a certificate, so an entry that existed in the
// catalog but not here would be a product whose paperwork this page quietly
// cannot account for, which is the one thing a certificate index must never
// do. Add a compound to the catalog and it appears here on the next load.
//
// The viewer is built for documents that do not exist yet. While
// COAS_PUBLISHED is false, coaHref() returns '' for every product and the
// dialog shows how to actually get the certificate instead of embedding one.
// Fill the URLs, flip the flag, and the same dialog renders the PDF with a
// download beside it. Nothing here needs rewriting for that to happen.
(function () {
  const grid = document.getElementById('coaGrid');
  if (!grid) return;

  const input = document.getElementById('coaSearch');
  const countEl = document.getElementById('coaCount');
  const emptyEl = document.getElementById('coaEmpty');

  /* ---------- the list ---------- */

  grid.innerHTML = GLOW_PRODUCTS.map(coaCardHtml).join('');
  const cards = [...grid.querySelectorAll('.coa-card')];

  // Lot numbers are searchable only once the catalog holds any. Promising
  // "or lot number" over a catalog with no lots in it is a search that
  // silently never matches, so the placeholder says what actually works.
  const lotsKnown = GLOW_PRODUCTS.some(p => p.lot);
  if (input) {
    input.placeholder = lotsKnown
      ? 'Search by compound or lot number'
      : 'Search by compound';
  }

  function render(query) {
    const q = (query || '').trim().toLowerCase();
    let shown = 0;
    cards.forEach(card => {
      const hit = !q ||
        card.dataset.name.includes(q) ||
        card.dataset.type.includes(q) ||
        card.dataset.alias.includes(q) ||
        card.dataset.lot.includes(q);
      card.hidden = !hit;
      if (hit) shown++;
    });
    if (emptyEl) emptyEl.hidden = shown > 0;
    if (countEl) {
      countEl.textContent = q
        ? `${shown} of ${cards.length} compounds`
        : `${cards.length} compounds`;
    }
  }

  render('');
  if (input) input.addEventListener('input', () => render(input.value));

  /* ---------- the viewer ----------
     Built once, on first open, and reused. Escape closes it, the backdrop
     closes it, focus goes to the close button on open and back to the View
     button that opened it on close, and the page behind it stops scrolling
     while it is up — the same handling js/cart-modal.js gives its sheet. */

  let overlay, lastFocused;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'coa-overlay';
    overlay.innerHTML = `
      <div class="coa-modal" role="dialog" aria-modal="true" aria-labelledby="coaModalName">
        <div class="coa-modal-head">
          <div>
            <span class="coa-modal-type" id="coaModalType"></span>
            <h2 class="coa-modal-name" id="coaModalName"></h2>
          </div>
          <button type="button" class="coa-modal-close" id="coaModalClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="coa-modal-body" id="coaModalBody"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#coaModalClose').addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  // What the dialog shows when there is a document, and what it shows when
  // there is not. The second is not an error state: every lot is tested and
  // every lot has a certificate, so the honest answer is how to get the one
  // for the vial in your hand, not "unavailable".
  function bodyFor(p) {
    const href = coaHref(p);
    const meta = `
      <dl class="coa-modal-meta">
        <div><dt>Purity</dt><dd>${escHtml(p.purity || '') || '—'}</dd></div>
        <div><dt>Lot</dt><dd>${escHtml(p.lot || '') || '—'}</dd></div>
        <div><dt>Analyses</dt><dd>${TESTS_PER_BATCH} per lot</dd></div>
      </dl>`;

    if (!href) {
      return meta + `
        <div class="coa-modal-request">
          <h3>${escHtml(COA_COPY.boxTitle)}</h3>
          <p>${escHtml(COA_COPY.boxSub)}.</p>
          <a class="btn btn-primary" href="mailto:support@glowresearch.shop?subject=${encodeURIComponent('COA request: ' + p.name)}">
            Request this certificate
          </a>
        </div>
        <p class="coa-modal-note">Certificates are issued by the independent laboratory that ran the analysis, not by us.</p>`;
    }

    return meta + `
      <div class="coa-modal-doc">
        <iframe src="${escHtml(href)}#view=FitH" title="Certificate of analysis for ${escHtml(p.name)}" loading="lazy"></iframe>
      </div>
      <div class="coa-modal-actions">
        <a class="btn btn-primary" href="${escHtml(href)}" download>Download PDF</a>
        <a class="btn btn-outline" href="${escHtml(href)}" target="_blank" rel="noopener">
          Open full document <span aria-hidden="true">&#8599;</span>
        </a>
      </div>
      <p class="coa-modal-note">Certificates are issued by the independent laboratory that ran the analysis, not by us.</p>`;
  }

  function open(p) {
    if (!overlay) build();
    lastFocused = document.activeElement;
    const single = p.sizes.length === 1;
    overlay.querySelector('#coaModalType').textContent = CAT_LABEL[p.cat];
    overlay.querySelector('#coaModalName').textContent =
      single ? `${p.name} ${p.sizes[0].mg}` : p.name;
    overlay.querySelector('#coaModalBody').innerHTML = bodyFor(p);
    overlay.classList.add('open');
    document.body.classList.add('search-locked');
    setTimeout(() => overlay.querySelector('#coaModalClose').focus(), 30);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('search-locked');
    // The iframe keeps loading a PDF nobody is looking at otherwise, and on
    // reopen it would flash the previous compound's document.
    overlay.querySelector('#coaModalBody').innerHTML = '';
    if (lastFocused) lastFocused.focus();
  }

  // Delegated, so it keeps working over cards the search has hidden and shown
  // rather than needing rebinding on every keystroke.
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-coa-view]');
    if (!btn) return;
    const p = GLOW_PRODUCTS.find(x => x.name === btn.dataset.coaView);
    if (p) open(p);
  });
})();
