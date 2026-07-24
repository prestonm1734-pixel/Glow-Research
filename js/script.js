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

/* ---------- cursor glow ---------- */
const cursorGlow = document.getElementById('cursorGlow');
let mouseX = 0, mouseY = 0, glowX = 0, glowY = 0;
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
(function loop() {
  glowX += (mouseX - glowX) * 0.12;
  glowY += (mouseY - glowY) * 0.12;
  cursorGlow.style.left = glowX + 'px';
  cursorGlow.style.top = glowY + 'px';
  requestAnimationFrame(loop);
})();

/* ---------- header shrink ---------- */
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 20 ? '0 6px 24px -12px rgba(0,0,0,0.5)' : 'none';
});

/* ---------- hero particle canvas ---------- */
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
const colors = ['#ffffff', '#d9d9d6', '#a3a3a1', '#7a7a77', '#e4e4e2'];

function resizeCanvas() {
  const hero = document.querySelector('.hero');
  canvas.width = hero.offsetWidth;
  canvas.height = hero.offsetHeight;
}
function initParticles() {
  const count = window.innerWidth < 768 ? 22 : 45;
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 0.6,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: Math.random() * 0.5 + 0.2,
  }));
}
function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  requestAnimationFrame(animateParticles);
}
resizeCanvas();
initParticles();
animateParticles();
window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });
