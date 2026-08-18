// ===================== Glow Research — interactions =====================
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- scroll reveal (defined early: referenced by product rendering) ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      if (entry.target.classList.contains('hero-stats')) {
        entry.target.querySelectorAll('.stat-num:not(.stat-text)').forEach(animateCount);
      }
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function observeReveal(el) { revealObserver.observe(el); }

/* the header badge and the cart drawer both live in js/cart.js, so that the
   cart survives navigation between pages */

/* ---------- mobile nav ---------- */
const hamburger = document.getElementById('hamburger');
const mainNav = document.getElementById('mainNav');
hamburger.addEventListener('click', () => {
  mainNav.classList.toggle('open');
  hamburger.classList.toggle('open');
});
mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mainNav.classList.remove('open')));

/* ---------- product data (shared with peptides.html via products-data.js) ---------- */
const grid = document.getElementById('productGrid');

function renderProducts(filter) {
  renderProductGrid(grid, filter, { observeReveal, limit: 8 });
}

renderProducts('all');

/* ---------- FAQ ----------
   The questions and answers live in FAQS in js/products-data.js and are baked
   into #faqList by tools/build-faq.js, so they are in the served HTML rather
   than injected here. That is the whole point: a crawler that does not run
   JavaScript, which is most of the ones feeding AI answer engines, used to get
   an empty <div> where five answers should have been.

   What is left here is behaviour, bound to markup that already exists. */
document.querySelectorAll('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-q');
  const ans = item.querySelector('.faq-a');
  if (!btn || !ans) return;

  // The COA answer is the one that changes with COAS_PUBLISHED. The build bakes
  // the current state, but the cart, account area and product page all render
  // it at runtime, so this keeps the FAQ in step even if the flag is flipped
  // without a rebuild. check-claims.js fails the build on that drift anyway.
  const coa = ans.querySelector('#faqCoa');
  if (coa && typeof COA_COPY !== 'undefined') coa.textContent = COA_COPY.faq;

  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-a').style.maxHeight = null;
      i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      ans.style.maxHeight = ans.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// The open height is a pixel value measured at the moment of the click, so any
// resize that rewraps the answer leaves it clipped or padded out. That was
// always true and is easy to hit now the list goes from two columns to one at
// 860px: an answer opened wide is taller once the column halves. Re-measure the
// open one rather than closing it out from under someone mid-read.
window.addEventListener('resize', () => {
  const open = document.querySelector('.faq-item.open .faq-a');
  if (open) open.style.maxHeight = open.scrollHeight + 'px';
});

/* ---------- newsletter ---------- */
document.getElementById('newsletterForm').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('newsletterMsg').textContent = "You're on the list. Welcome to the Glow research community.";
  e.target.reset();
});

/* ---------- counters ---------- */
function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  const isFloat = target % 1 !== 0;
  const duration = 1400;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = target * eased;
    el.textContent = isFloat ? val.toFixed(1) : Math.round(val);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- attach reveal to static elements ---------- */
document.querySelectorAll('.reveal').forEach(observeReveal);


/* ---------- header shrink ---------- */
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 20 ? '0 6px 24px -12px rgba(0,0,0,0.5)' : 'none';
});

/* ---------- hero molecular constellation (ambient, not cursor-reactive) ---------- */
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
const heroEl = document.querySelector('.hero');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
let nodes = [];
const heroSize = { w: 0, h: 0 };
const LINK = 130;   // node-to-node link distance

function resizeCanvas() {
  heroSize.w = heroEl.offsetWidth;
  heroSize.h = heroEl.offsetHeight;
  canvas.width = heroSize.w * DPR;
  canvas.height = heroSize.h * DPR;
  canvas.style.width = heroSize.w + 'px';
  canvas.style.height = heroSize.h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function initNodes() {
  const count = window.innerWidth < 768 ? 34 : 66;
  nodes = Array.from({ length: count }, () => ({
    x: Math.random() * heroSize.w,
    y: Math.random() * heroSize.h,
    vx: (Math.random() - 0.5) * 0.26,
    vy: (Math.random() - 0.5) * 0.26,
    r: Math.random() * 1.5 + 0.8,
    phase: Math.random() * Math.PI * 2,
  }));
}
let frame = 0;
function drawConstellation() {
  frame++;
  ctx.clearRect(0, 0, heroSize.w, heroSize.h);

  for (const n of nodes) {
    n.x += n.vx; n.y += n.vy;
    if (n.x < 0 || n.x > heroSize.w) n.vx *= -1;
    if (n.y < 0 || n.y > heroSize.h) n.vy *= -1;
  }

  // links between nearby nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < LINK) {
        ctx.strokeStyle = `rgba(255,255,255,${(1 - d / LINK) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  // nodes
  for (const n of nodes) {
    const tw = 0.5 + Math.sin(frame * 0.02 + n.phase) * 0.3;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + tw * 0.3})`;
    ctx.fill();
  }

  rafId = requestAnimationFrame(drawConstellation);
}

/* The link pass is O(n²) over ~66 nodes every frame, so leaving it running
   while the hero is off-screen (or the tab is hidden) burns battery for
   something nobody can see. Start and stop it with visibility. */
let rafId = null;
function startConstellation() {
  if (rafId === null) rafId = requestAnimationFrame(drawConstellation);
}
function stopConstellation() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

resizeCanvas();
initNodes();

if (reduceMotion.matches) {
  drawConstellation();      // paint one static frame, then stop
  stopConstellation();
} else {
  new IntersectionObserver(([entry]) => {
    entry.isIntersecting ? startConstellation() : stopConstellation();
  }, { threshold: 0 }).observe(heroEl);

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stopConstellation() : startConstellation();
  });
}

window.addEventListener('resize', () => { resizeCanvas(); initNodes(); });

/* ---------- product card tilt ----------
   Scoped to the grid rather than document, and skipped entirely for
   reduced-motion users — the CSS media query can't stop it, because this
   writes the transform inline. */
if (!reduceMotion.matches && grid) {
  grid.addEventListener('mousemove', (e) => {
    const card = e.target.closest ? e.target.closest('.product-card') : null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(700px) rotateX(${py * -6}deg) rotateY(${px * 8}deg) translateY(-5px)`;
  });
  grid.addEventListener('mouseout', (e) => {
    const card = e.target.closest ? e.target.closest('.product-card') : null;
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  });
}


/* ---------- testing diagram ----------
   The seven analyses are already in the markup, baked by
   tools/build-testing.js. Nothing here writes copy: it moves a highlight
   between nodes that exist whether or not this file runs, so the section is
   complete with JavaScript off and merely still.

   The highlight walks the list on its own so the section has something to
   watch, then hands over the moment anyone points at it and stops for good
   once they click, because a panel that keeps moving under a reader who has
   chosen a row is a nuisance rather than a feature. Same visibility gating
   the hero constellation uses: nothing animates off-screen. */
(function () {
  const stage = document.querySelector('#testing .td-stage');
  if (!stage) return;
  const nodes = Array.from(stage.querySelectorAll('.td-node'));
  const list = document.getElementById('tdNodes');
  if (!nodes.length || !list) return;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const STEP = 3200;
  let at = -1, timer = null, surrendered = false;

  function show(i) {
    at = i;
    nodes.forEach((n, k) => {
      const on = k === i;
      n.classList.toggle('is-active', on);
      n.setAttribute('aria-pressed', String(on));
    });
    list.classList.toggle('has-active', i >= 0);
    stage.classList.toggle('is-scanning', i >= 0 && !still.matches);
  }

  function advance() { show((at + 1) % nodes.length); }
  function start() {
    if (timer || surrendered || still.matches) return;
    // Light one immediately. Waiting a full step first left the section
    // sitting there unlit for three seconds, which reads as broken rather
    // than as about to move.
    if (at < 0) show(0);
    timer = setInterval(advance, STEP);
  }
  function stop() { clearInterval(timer); timer = null; }

  nodes.forEach((n, i) => {
    n.addEventListener('mouseenter', () => { stop(); show(i); });
    n.addEventListener('focus', () => { stop(); show(i); });
    // A click is a decision, so the walk does not resume on mouseout.
    n.addEventListener('click', () => { surrendered = true; stop(); show(i); });
  });
  stage.addEventListener('mouseleave', () => { if (!surrendered) start(); });

  // Reduced motion still gets a diagram, just not a moving one: the first
  // analysis stays lit so the layout does not read as broken.
  if (still.matches) { show(0); return; }

  new IntersectionObserver((entries) => {
    entries.forEach(e => (e.isIntersecting ? start() : stop()));
  }, { threshold: 0.25 }).observe(stage);
})();

