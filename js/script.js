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

/* ---------- FAQ ---------- */
const faqs = [
  { q: 'Are Glow Research peptides intended for human consumption?', a: 'No. All products sold by Glow Research are strictly for laboratory and in-vitro research use only. They are not drugs, supplements, foods, or cosmetics. They have not been evaluated or approved by the FDA for any use, and they are not intended to diagnose, treat, cure, or prevent any disease. They are not for human or animal use of any kind.' },
  { q: 'Why are Glow Research peptides priced the way they are?', a: 'Our pricing reflects what goes into every lot at the facilities behind it: US-based production held to cGMP-aligned quality practices, and independent third-party lab testing on every lot. Peptides priced well below market are almost always cutting one of those corners, and we would rather hold the standard than the lowest price.' },
  { q: 'Where do I find a lot’s COA?', a: 'Two places. Every product page links directly to its current lot’s certificate, and every vial carries a lot number with a scannable barcode that matches it — so you can verify what’s in your hand against the document, not just what was posted online. Want it before you order rather than after? Email support@glowresearch.shop with the compound and quantity. Certificates are issued by the independent laboratory that performed the analysis, not by us.' },
  { q: 'How fast do orders ship?', a: 'Orders placed before 2PM PST are dispatched the same business day from our fulfilment partner’s US-based, climate-controlled facility, with tracking provided within 24 hours.' },
  { q: 'Do you ship internationally?', a: 'No. Orders are shipped within the United States only, to verified research institutions and qualified buyers.' },
];
const faqList = document.getElementById('faqList');
faqs.forEach(f => {
  const item = document.createElement('div');
  item.className = 'faq-item';
  item.innerHTML = `
    <button class="faq-q">${f.q} <span class="icon">+</span></button>
    <div class="faq-a"><p>${f.a}</p></div>
  `;
  const btn = item.querySelector('.faq-q');
  const ans = item.querySelector('.faq-a');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-a').style.maxHeight = null;
    });
    if (!isOpen) {
      item.classList.add('open');
      ans.style.maxHeight = ans.scrollHeight + 'px';
    }
  });
  faqList.appendChild(item);
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

