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

/* ---------- hero showpiece: peptide helix ring + vial parallax ---------- */
const stageEl = document.getElementById('orbitStage');
const vialLayers = Array.from(document.querySelectorAll('.vial-layer'));
const helixBack = document.getElementById('helixBack');
const helixFront = document.getElementById('helixFront');
const bloomEl = document.getElementById('bloom');

if (stageEl && vialLayers.length) {
  // resting offsets as a fraction of stage width, so the group scales with it
  const REST = {
    'vial-left':  { fx: -0.325, fy: 0.045 },
    'vial-right': { fx:  0.335, fy: 0.075 },
    'vial-main':  { fx:  0,     fy: 0 },
  };
  const layers = vialLayers.map(el => {
    const key = Object.keys(REST).find(k => el.classList.contains(k)) || 'vial-main';
    return { el, rest: REST[key], depth: parseFloat(el.dataset.depth) || 1 };
  });

  const bctx = helixBack ? helixBack.getContext('2d') : null;
  const fctx = helixFront ? helixFront.getContext('2d') : null;
  const DPR2 = Math.min(window.devicePixelRatio || 1, 2);

  let stageW = 0, stageH = 0;
  function measure() {
    stageW = stageEl.offsetWidth;
    stageH = stageEl.offsetHeight;
    if (!bctx || !fctx) return;
    for (const c of [helixBack, helixFront]) {
      c.width = stageW * DPR2; c.height = stageH * DPR2;
      c.style.width = stageW + 'px'; c.style.height = stageH + 'px';
    }
    bctx.setTransform(DPR2, 0, 0, DPR2, 0, 0);
    fctx.setTransform(DPR2, 0, 0, DPR2, 0, 0);
  }
  window.addEventListener('resize', measure);

  // --- peptide double helix wrapped around a ring ---
  const SEG = window.innerWidth < 768 ? 130 : 210;  // samples around the ring
  const TWIST = 13;       // helix turns per lap
  const FOC = 780;        // perspective focal length
  let spin = 0;

  function project(p) {
    const s = FOC / (FOC + p.z);
    return { x: stageW / 2 + p.x * s, y: stageH / 2 + p.y * s, z: p.z, s };
  }

  function drawHelix(mmx, mmy) {
    if (!bctx || !fctx) return;
    bctx.clearRect(0, 0, stageW, stageH);
    fctx.clearRect(0, 0, stageW, stageH);

    const R = Math.min(stageW, stageH) * 0.40;   // ring radius
    const r = R * 0.145;                          // helix radius
    // ring leans back at the top; cursor nudges the lean and the yaw
    const tiltX = 0.36 + mmy * 0.30;
    const yaw   = -0.22 + mmx * 0.42;
    const cX = Math.cos(tiltX), sX = Math.sin(tiltX);
    const cY = Math.cos(yaw),   sY = Math.sin(yaw);

    const A = [], B = [];
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      const ct = Math.cos(t), st = Math.sin(t);
      const ph = t * TWIST + spin;
      const cp = Math.cos(ph), sp = Math.sin(ph);
      // ring frame: outward normal in-plane, binormal along Z
      for (let strand = 0; strand < 2; strand++) {
        const o = strand ? -1 : 1;
        const rx = R * ct + o * r * cp * ct;
        const ry = R * st + o * r * cp * st;
        const rz = o * r * sp;
        // tilt about X, then yaw about Y
        const y1 = ry * cX - rz * sX;
        const z1 = ry * sX + rz * cX;
        const x2 = rx * cY + z1 * sY;
        const z2 = -rx * sY + z1 * cY;
        (strand ? B : A).push(project({ x: x2, y: y1, z: z2 }));
      }
    }

    // rungs between the strands, like residue bonds
    for (let i = 0; i <= SEG; i += 3) {
      const a = A[i], b = B[i];
      const mz = (a.z + b.z) / 2;
      const ctx2 = mz >= 0 ? fctx : bctx;
      const depth = Math.max(0, Math.min(1, (mz + R) / (2 * R)));
      ctx2.strokeStyle = `rgba(255,255,255,${(0.05 + depth * 0.3).toFixed(3)})`;
      ctx2.lineWidth = Math.max(0.5, 1.1 * ((a.s + b.s) / 2));
      ctx2.beginPath(); ctx2.moveTo(a.x, a.y); ctx2.lineTo(b.x, b.y); ctx2.stroke();
    }

    // the two backbones
    for (const strand of [A, B]) {
      for (let i = 0; i < SEG; i++) {
        const p = strand[i], q = strand[i + 1];
        const mz = (p.z + q.z) / 2;
        const ctx2 = mz >= 0 ? fctx : bctx;
        const depth = Math.max(0, Math.min(1, (mz + R) / (2 * R)));
        ctx2.strokeStyle = `rgba(255,255,255,${(0.07 + depth * 0.5).toFixed(3)})`;
        ctx2.lineWidth = Math.max(0.6, 1.7 * ((p.s + q.s) / 2));
        ctx2.beginPath(); ctx2.moveTo(p.x, p.y); ctx2.lineTo(q.x, q.y); ctx2.stroke();
      }
    }

    // residue nodes, brighter as they come toward the viewer
    for (const strand of [A, B]) {
      for (let i = 0; i <= SEG; i += 5) {
        const p = strand[i];
        const depth = Math.max(0, Math.min(1, (p.z + R) / (2 * R)));
        const ctx2 = p.z >= 0 ? fctx : bctx;
        const rad = Math.max(0.7, 2.3 * p.s);
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx2.fillStyle = `rgba(255,255,255,${(0.12 + depth * 0.8).toFixed(3)})`;
        ctx2.fill();
        if (depth > 0.72) {          // specular pop on the nearest beads
          ctx2.beginPath();
          ctx2.arc(p.x, p.y, rad * 2.6, 0, Math.PI * 2);
          ctx2.fillStyle = `rgba(255,255,255,${((depth - 0.72) * 0.28).toFixed(3)})`;
          ctx2.fill();
        }
      }
    }
  }

  let tmx = 0, tmy = 0, mmx = 0, mmy = 0; // target + smoothed mouse (-0.5..0.5)
  function tiltLoop() {
    mmx += (tmx - mmx) * 0.06;
    mmy += (tmy - mmy) * 0.06;
    spin += 0.0034;

    for (const { el, rest, depth } of layers) {
      const px = rest.fx * stageW + mmx * 46 * depth;
      const py = rest.fy * stageW + mmy * 26 * depth;
      el.style.transform =
        `translate(calc(-50% + ${px.toFixed(2)}px), calc(-50% + ${py.toFixed(2)}px))` +
        ` rotateY(${(mmx * 20 * depth).toFixed(2)}deg)` +
        ` rotateX(${(mmy * -11 * depth).toFixed(2)}deg)`;
    }

    // the backlight drifts opposite the cursor, so the halo feels like a
    // real light source the vial is sitting in front of
    if (bloomEl) {
      bloomEl.style.transform =
        `translate(calc(-50% + ${(mmx * -34).toFixed(1)}px), calc(-50% + ${(mmy * -22).toFixed(1)}px))`;
    }

    drawHelix(mmx, mmy);
    requestAnimationFrame(tiltLoop);
  }

  heroEl.addEventListener('mousemove', e => {
    const r = heroEl.getBoundingClientRect();
    tmx = (e.clientX - r.left) / r.width - 0.5;
    tmy = (e.clientY - r.top) / r.height - 0.5;
  });
  heroEl.addEventListener('mouseleave', () => { tmx = 0; tmy = 0; });

  measure();
  tiltLoop();
}
