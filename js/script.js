// ===================== Glow Research — interactions =====================
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- scroll reveal (defined early: referenced by product rendering) ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      if (entry.target.classList.contains('hero-stats')) {
        entry.target.querySelectorAll('.stat-num').forEach(animateCount);
      }
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function observeReveal(el) { revealObserver.observe(el); }

/* ---------- mobile nav ---------- */
const hamburger = document.getElementById('hamburger');
const mainNav = document.getElementById('mainNav');
hamburger.addEventListener('click', () => {
  mainNav.classList.toggle('open');
  hamburger.classList.toggle('open');
});
mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mainNav.classList.remove('open')));

/* ---------- product data ---------- */
const products = [
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

const grid = document.getElementById('productGrid');

function renderProducts(filter) {
  grid.innerHTML = '';
  const list = filter === 'all' ? products : products.filter(p => p.cat === filter);
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
    grid.appendChild(card);
    const addBtn = card.querySelector('.add-btn');
    addBtn.addEventListener('click', () => {
      addBtn.classList.add('added');
      addBtn.textContent = '✓';
      addBtn.setAttribute('aria-label', `${p.name} added`);
      setTimeout(() => {
        addBtn.classList.remove('added');
        addBtn.textContent = '+';
      }, 1400);
    });
    observeReveal(card);
  });
}

renderProducts('all');

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderProducts(chip.dataset.filter);
  });
});

/* ---------- COA tabs ---------- */
const coaData = {
  bpc: {
    name: 'BPC-157', lot: 'Lot #GR-BPC-0447 · Tested 06/2026',
    rows: [
      ['Identity', 'Confirmed via Mass Spec'],
      ['Purity (HPLC)', '99.8%'],
      ['Endotoxin', '< 0.05 EU/mg'],
      ['Appearance', 'White lyophilized powder'],
      ['Sterility', 'Pass'],
    ],
    bars: [ ['Purity', 99.8], ['Identity Match', 99.9], ['Sterility', 100], ['Moisture', 2.1] ],
  },
  tb: {
    name: 'TB-500', lot: 'Lot #GR-TB5-0312 · Tested 06/2026',
    rows: [
      ['Identity', 'Confirmed via Mass Spec'],
      ['Purity (HPLC)', '99.6%'],
      ['Endotoxin', '< 0.08 EU/mg'],
      ['Appearance', 'White lyophilized powder'],
      ['Sterility', 'Pass'],
    ],
    bars: [ ['Purity', 99.6], ['Identity Match', 99.7], ['Sterility', 100], ['Moisture', 2.4] ],
  },
  ipa: {
    name: 'Ipamorelin', lot: 'Lot #GR-IPA-0509 · Tested 07/2026',
    rows: [
      ['Identity', 'Confirmed via Mass Spec'],
      ['Purity (HPLC)', '99.9%'],
      ['Endotoxin', '< 0.03 EU/mg'],
      ['Appearance', 'White lyophilized powder'],
      ['Sterility', 'Pass'],
    ],
    bars: [ ['Purity', 99.9], ['Identity Match', 99.9], ['Sterility', 100], ['Moisture', 1.8] ],
  },
  sema: {
    name: 'Semaglutide', lot: 'Lot #GR-SEM-0221 · Tested 07/2026',
    rows: [
      ['Identity', 'Confirmed via Mass Spec'],
      ['Purity (HPLC)', '99.5%'],
      ['Endotoxin', '< 0.06 EU/mg'],
      ['Appearance', 'White lyophilized powder'],
      ['Sterility', 'Pass'],
    ],
    bars: [ ['Purity', 99.5], ['Identity Match', 99.6], ['Sterility', 100], ['Moisture', 2.6] ],
  },
};

const coaBody = document.getElementById('coaBody');
function renderCoa(key) {
  const d = coaData[key];
  coaBody.innerHTML = `
    <div class="coa-info">
      <h3>${d.name}</h3>
      <div class="lot">${d.lot}</div>
      <div class="coa-rows">
        ${d.rows.map(r => `<div class="coa-row"><span>${r[0]}</span><b>${r[1]}${r[1] === 'Pass' ? '' : ''}</b></div>`).join('')}
        <div class="coa-row"><span>Overall Result</span><span class="pass">Pass</span></div>
      </div>
    </div>
    <div class="coa-chart" id="coaChart">
      ${d.bars.map(b => `
        <div class="coa-bar-wrap">
          <span class="coa-bar-val">${b[1]}%</span>
          <div class="coa-bar" data-h="${b[1]}"></div>
          <span class="coa-bar-label">${b[0]}</span>
        </div>
      `).join('')}
    </div>
  `;
  requestAnimationFrame(() => {
    coaBody.querySelectorAll('.coa-bar').forEach(bar => {
      const h = parseFloat(bar.dataset.h);
      bar.style.height = Math.min(h, 100) + '%';
    });
  });
}
renderCoa('bpc');

document.querySelectorAll('.coa-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.coa-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderCoa(tab.dataset.coa);
  });
});

/* ---------- reviews carousel ---------- */
const reviews = [
  { name: 'Dr. R. Ashworth', role: 'Independent Lab, Boston', text: 'Fastest COA turnaround I’ve seen from any vendor. Purity has matched the certificate every single time.', stars: 5 },
  { name: 'M. Delgado', role: 'University Research Assoc.', text: 'Packaging is meticulous and the site itself makes verifying batches painless. Genuinely impressive operation.', stars: 5 },
  { name: 'J. Okafor', role: 'Biotech Research Tech', text: 'Switched over from a competitor and the difference in transparency is night and day.', stars: 5 },
  { name: 'S. Whitfield', role: 'Clinical Research Coordinator', text: 'Support responded in minutes and the batch documentation was already exactly what I needed.', stars: 4 },
  { name: 'A. Novak', role: 'Peptide Research Group', text: 'Consistent potency across every reorder. Glow has become our default supplier.', stars: 5 },
  { name: 'K. Ibrahim', role: 'Molecular Biology Lab', text: 'The COA lookup tool alone puts them ahead of everyone else in this space.', stars: 5 },
];

const track = document.getElementById('reviewsTrack');
const trackInner = document.createElement('div');
trackInner.className = 'reviews-track-inner';
track.appendChild(trackInner);

const perSlide = 3;
const slides = [];
for (let i = 0; i < reviews.length; i += perSlide) slides.push(reviews.slice(i, i + perSlide));

slides.forEach(group => {
  const slide = document.createElement('div');
  slide.className = 'review-card';
  slide.innerHTML = group.map(r => `
    <div class="review">
      <div class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
      <p>&ldquo;${r.text}&rdquo;</p>
      <div class="review-author">
        <div class="avatar">${r.name.split(' ').map(n => n[0]).join('')}</div>
        <div><strong>${r.name}</strong><span>${r.role}</span></div>
      </div>
    </div>
  `).join('');
  trackInner.appendChild(slide);
});

const dotsWrap = document.getElementById('revDots');
slides.forEach((_, i) => {
  const dot = document.createElement('span');
  if (i === 0) dot.classList.add('active');
  dot.addEventListener('click', () => goToSlide(i));
  dotsWrap.appendChild(dot);
});

let current = 0;
function goToSlide(i) {
  current = (i + slides.length) % slides.length;
  trackInner.style.transform = `translateX(-${current * 100}%)`;
  [...dotsWrap.children].forEach((d, idx) => d.classList.toggle('active', idx === current));
}
document.querySelector('.rev-prev').addEventListener('click', () => goToSlide(current - 1));
document.querySelector('.rev-next').addEventListener('click', () => goToSlide(current + 1));
let revAuto = setInterval(() => goToSlide(current + 1), 6000);
track.addEventListener('mouseenter', () => clearInterval(revAuto));
track.addEventListener('mouseleave', () => revAuto = setInterval(() => goToSlide(current + 1), 6000));

/* ---------- FAQ ---------- */
const faqs = [
  { q: 'Are Glow Research peptides intended for human consumption?', a: 'No. All products sold by Glow Research are strictly for laboratory and in-vitro research use only. They are not drugs, supplements, or foods, and are not intended for human or animal use of any kind.' },
  { q: 'How do I verify a certificate of analysis (COA)?', a: 'Every vial ships with a lot number that corresponds to a public, independently tested COA available on this site or via the QR code on the label.' },
  { q: 'How fast do orders ship?', a: 'Orders placed before 2PM EST ship the same day from our climate-controlled facility, with tracking provided within 24 hours.' },
  { q: 'How should compounds be stored?', a: 'Lyophilized peptides should be stored at -20°C and protected from light until reconstitution, per standard laboratory protocol.' },
  { q: 'Do you ship internationally?', a: 'Currently we ship to verified research institutions and qualified buyers within the United States only.' },
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
  document.getElementById('newsletterMsg').textContent = "You're on the list — welcome to the Glow research community.";
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

  requestAnimationFrame(drawConstellation);
}

resizeCanvas();
initNodes();
drawConstellation();
window.addEventListener('resize', () => { resizeCanvas(); initNodes(); });

/* ---------- product card tilt ---------- */
document.addEventListener('mousemove', (e) => {
  const card = e.target.closest ? e.target.closest('.product-card') : null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;
  const py = (e.clientY - r.top) / r.height - 0.5;
  card.style.transform = `perspective(700px) rotateX(${py * -6}deg) rotateY(${px * 8}deg) translateY(-5px)`;
});
document.addEventListener('mouseout', (e) => {
  const card = e.target.closest ? e.target.closest('.product-card') : null;
  if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
});

/* ---------- hero showpiece: particle torus + vial tilt ---------- */
const orbitStage = document.getElementById('orbitStage');
const vialTilt = document.getElementById('vialTilt');
const ringBack = document.getElementById('ringBack');
const ringFront = document.getElementById('ringFront');
if (orbitStage && ringBack && ringFront) {
  const bctx = ringBack.getContext('2d');
  const fctx = ringFront.getContext('2d');
  const DPR2 = Math.min(window.devicePixelRatio || 1, 2);
  let SW = 0, SH = 0, scx = 0, scy = 0;
  let tmx = 0, tmy = 0, mmx = 0, mmy = 0; // target + smoothed mouse (-0.5..0.5)

  function sizeRing() {
    const r = orbitStage.getBoundingClientRect();
    SW = r.width; SH = r.height; scx = SW / 2; scy = SH / 2;
    [ringBack, ringFront].forEach(c => {
      c.width = SW * DPR2; c.height = SH * DPR2;
      c.style.width = SW + 'px'; c.style.height = SH + 'px';
    });
    bctx.setTransform(DPR2, 0, 0, DPR2, 0, 0);
    fctx.setTransform(DPR2, 0, 0, DPR2, 0, 0);
  }

  // distribute particles over a torus (big ring + tube)
  const COUNT = window.innerWidth < 768 ? 80 : 140;
  const GOLD = '#f4c96a';
  const torus = Array.from({ length: COUNT }, () => ({
    a: Math.random() * Math.PI * 2,          // around the big ring
    b: Math.random() * Math.PI * 2,          // around the tube
    s: 0.7 + Math.random() * 1.6,            // star size
    sp: (Math.random() - 0.5) * 0.05,        // spin speed
    ang: Math.random() * Math.PI,            // spin angle
    tw: Math.random() * Math.PI * 2,         // twinkle phase
  }));

  function drawStar(c, x, y, size, alpha, angle) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.globalAlpha = alpha;
    c.fillStyle = GOLD;
    c.beginPath();
    c.moveTo(0, -size);
    c.quadraticCurveTo(size * 0.2, -size * 0.2, size, 0);
    c.quadraticCurveTo(size * 0.2, size * 0.2, 0, size);
    c.quadraticCurveTo(-size * 0.2, size * 0.2, -size, 0);
    c.quadraticCurveTo(-size * 0.2, -size * 0.2, 0, -size);
    c.closePath();
    c.fill();
    c.restore();
  }

  const FOC = 560;
  let rt = 0;
  function drawRing() {
    rt += 0.0042;
    mmx += (tmx - mmx) * 0.06;
    mmy += (tmy - mmy) * 0.06;
    bctx.clearRect(0, 0, SW, SH);
    fctx.clearRect(0, 0, SW, SH);

    const Rbig = Math.min(SW, SH) * 0.40;
    const Rtube = Rbig * 0.16;
    const tiltX = 1.12 + mmy * 0.55;
    const rotY = rt + mmx * 0.9;
    const cX = Math.cos(tiltX), sX = Math.sin(tiltX);
    const cY = Math.cos(rotY), sY = Math.sin(rotY);

    for (const p of torus) {
      const rr = Rbig + Rtube * Math.cos(p.b);
      let x = Math.cos(p.a) * rr;
      let z = Math.sin(p.a) * rr;
      let y = Rtube * Math.sin(p.b);
      // rotate X (tilt), then Y (spin)
      const y1 = y * cX - z * sX;
      const z1 = y * sX + z * cX;
      const x2 = x * cY + z1 * sY;
      const z2 = -x * sY + z1 * cY;
      const scale = FOC / (FOC + z2);
      const sx = scx + x2 * scale;
      const sy = scy + y1 * scale;
      const depth = Math.max(0, Math.min(1, (z2 + Rbig) / (2 * Rbig)));
      const twk = 0.7 + Math.sin(rt * 6 + p.tw) * 0.3;
      const alpha = (0.18 + depth * 0.82) * twk;
      const ctx2 = z2 >= 0 ? fctx : bctx;
      p.ang += p.sp;
      drawStar(ctx2, sx, sy, Math.max(1.6, p.s * scale * 3.4), alpha, p.ang);
    }

    if (vialTilt) {
      vialTilt.style.transform =
        `translate(-50%,-50%) rotateX(${mmy * -12}deg) rotateY(${mmx * 20}deg)`;
    }
    requestAnimationFrame(drawRing);
  }

  heroEl.addEventListener('mousemove', e => {
    const r = heroEl.getBoundingClientRect();
    tmx = (e.clientX - r.left) / r.width - 0.5;
    tmy = (e.clientY - r.top) / r.height - 0.5;
  });
  heroEl.addEventListener('mouseleave', () => { tmx = 0; tmy = 0; });

  sizeRing();
  drawRing();
  window.addEventListener('resize', sizeRing);
}
