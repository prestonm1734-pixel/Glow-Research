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

  /* ---------- sticky call to action ----------
     Shown only once the hero's own Shop now button has scrolled off, so the
     page never offers the same action twice at once. Watching the hero CTA
     rather than a scroll offset means the handoff happens at the right moment
     at any viewport height, with no magic number to re-tune. */
  const sticky = document.getElementById('wlSticky');
  const heroCta = document.querySelector('.wl-cta');
  if (sticky && heroCta) {
    // Removing [hidden] is what opts the bar in, and it happens only here:
    // with no JavaScript the observer never runs and the bar stays out of the
    // document entirely rather than sitting off screen in the tab order.
    sticky.hidden = false;
    new IntersectionObserver(entries => {
      entries.forEach(e => sticky.classList.toggle('is-shown', !e.isIntersecting));
    }, { threshold: 0 }).observe(heroCta);
  }

  /* ---------- dispatch cutoff ----------
     States the real cutoff against the reader's own clock. The hour is
     DISPATCH_CUTOFF_HOUR from js/products-data.js, never typed here, so this
     banner cannot outlive a change to the window the fulfilment partner
     actually keeps. tools/check-claims.js pins that.

     Past the cutoff, and on the one day nothing goes out, it says so. The
     usual version of this widget restarts at 24 hours the moment it expires,
     which turns a real deadline into a prop, and is the thing PRINCIPLES.md
     calls claiming more than we can prove. */
  const cutEl = document.getElementById('wlCutoff');
  if (cutEl && typeof DISPATCH_CUTOFF_HOUR === 'number') {
    // hourCycle h23 rather than hour12:false: the latter is specified to allow
    // an "24" for midnight, which would read as past a 13:00 cutoff.
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });

    const pad = n => String(n).padStart(2, '0');

    function render() {
      const parts = {};
      fmt.formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
      const h = +parts.hour, m = +parts.minute, s = +parts.second;

      // NO_DISPATCH_DAY is a getUTCDay() index; this is a weekday name, so the
      // comparison is made in the one place the two can be lined up.
      const dispatchesToday = parts.weekday !== 'Sun' && h < DISPATCH_CUTOFF_HOUR;

      if (!dispatchesToday) {
        cutEl.innerHTML = '<span class="wl-dot" aria-hidden="true"></span>' +
          'Ships on the next dispatch day';
        return;
      }
      const left = (DISPATCH_CUTOFF_HOUR * 3600) - (h * 3600 + m * 60 + s);
      cutEl.innerHTML = '<span class="wl-dot wl-dot-live" aria-hidden="true"></span>' +
        `Order within <strong>${Math.floor(left / 3600)}h ${pad(Math.floor(left / 60) % 60)}m ` +
        `${pad(left % 60)}s</strong> for same-day dispatch`;
    }

    render();
    cutEl.hidden = false;
    setInterval(render, 1000);
  }
})();
