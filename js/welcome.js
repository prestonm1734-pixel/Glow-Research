// ===================== Glow Research — welcome (ad landing) page =====================
//
// welcome.html is the unlisted page paid traffic lands on. It carries the same
// header, footer and cart as every other page, so most of its behaviour comes
// from the shared scripts loaded before this one. What is left is here.
//
// Why this is not js/script.js. That file is the homepage's: it reaches for
// #productGrid, #particleCanvas and .hero on load and throws when they are not
// there. The three small behaviours this page shares with it (reveal, mobile
// nav, header shadow) are the same handful of lines the other static pages
// already inline for the same reason. This page also needs the FAQ accordion
// and the dispatch cutoff, which is enough to be worth a file rather than a
// fourth copy of an inline block.

(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- scroll reveal ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      // .stat-text is a word, not a numeral: it has nothing to count up to.
      if (entry.target.classList.contains('hero-stats')) {
        entry.target.querySelectorAll('.stat-num:not(.stat-text)').forEach(countUp);
      }
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // The homepage animates its figures on the way in and this page states the
  // same three, so they arrive the same way. Kept local rather than shared:
  // js/script.js's copy is bound to the homepage's own observer.
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const started = performance.now();
    const DURATION = 1400;
    (function frame(now) {
      const t = Math.min(1, (now - started) / DURATION);
      // ease-out: the figure lands rather than stopping dead
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(frame);
    })(started);
  }

  /* ---------- catalog ----------
     index.html's grid, drawn by the same renderer, minus the compounds
     WELCOME_CATALOG_EXCLUDE names. The exclusion is read from that list
     rather than written here: a fourth coded compound added to the catalog
     has to drop off this page on its own, without anyone remembering to
     come back and edit it. */
  const grid = document.getElementById('productGrid');
  if (grid) {
    renderProductGrid(grid, 'all', {
      observeReveal: el => revealObserver.observe(el),
      limit: 8,
      exclude: WELCOME_CATALOG_EXCLUDE,
    });
  }

  /* ---------- mobile nav ---------- */
  const hamburger = document.getElementById('hamburger');
  const mainNav = document.getElementById('mainNav');
  hamburger.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
  mainNav.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => mainNav.classList.remove('open')));

  /* ---------- header shadow ---------- */
  const header = document.getElementById('siteHeader');
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 20 ? '0 6px 24px -12px rgba(0,0,0,0.5)' : 'none';
  });

  /* ---------- FAQ accordion ----------
     Same contract as the homepage: tools/build-faq.js puts the questions and
     answers in the served markup, and this binds behaviour to what is already
     in the DOM rather than building the list. */
  const items = [...document.querySelectorAll('.faq-item')];
  items.forEach(item => {
    const btn = item.querySelector('.faq-q');
    const ans = item.querySelector('.faq-a');
    btn.addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      items.forEach(other => {
        other.classList.remove('open');
        other.querySelector('.faq-a').style.maxHeight = null;
        other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        ans.style.maxHeight = `${ans.scrollHeight}px`;
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
  // An answer opened at one width wraps to more lines at another, and the
  // inline max-height above is measured in pixels, so it has to be remeasured
  // or the last line is clipped after a rotate or a resize.
  window.addEventListener('resize', () => {
    const open = document.querySelector('.faq-item.open .faq-a');
    if (open) open.style.maxHeight = `${open.scrollHeight}px`;
  });

  /* The hero clip's starter stood here, gated on prefers-reduced-motion
     because CSS cannot stop a video that has already begun. This hero is
     index.html's hero now, image and all, so there is nothing to start and
     nothing to gate. */

  /* A sticky call to action lived here: a bar fixed to the foot of the page
     carrying "Shop now", revealed by an observer on the hero's own button row
     once that row was 30% of the way up the viewport, so the handoff happened
     at the same point of the page at any viewport height.

     Removed once this page got the catalog. The bar existed because the only
     way to a product was /shop and the hero's button was the only door; the
     grid above is that door now, on the page itself. Worth knowing if it comes
     back: it was hidden with visibility and started [hidden] in the markup, not
     merely translated off screen, so that a page with no JavaScript running
     never carried a second "Shop now" in the tab order. */

  /* The dispatch cutoff lived here: a live countdown to DISPATCH_CUTOFF_HOUR,
     rendered against the visitor's own clock and saying so past the cutoff
     rather than restarting. Its cell in the terms strip under the hero was
     removed, and with nothing to render into, the timer went with it.

     Worth knowing if it comes back: the reason it was written this way is that
     the usual version of this widget resets to 24 hours the moment it expires,
     which turns a real deadline into a prop. tools/check-claims.js used to pin
     both halves of that, the hour being read from the constant and the expired
     branch existing. Those checks were deleted alongside this, so a new
     countdown needs them written again rather than assumed. */

})();
