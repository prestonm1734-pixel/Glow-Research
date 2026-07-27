#!/usr/bin/env node
// ===================== Glow Research — blog build =====================
//
//   node tools/build-blog.js
//
// Generates real, crawlable static HTML for every post — no client-side
// rendering, because search engines index static markup immediately and
// reliably, which is the entire reason this section exists.
//
// Inputs:
//   content/posts.js            metadata for every post
//   content/posts/<slug>.html   article body fragment (no <head>, no nav)
//   peptides.html               "shell donor" — the header/footer are lifted
//                               from it at build time, so a nav change on the
//                               main site propagates to every post on rebuild
//                               instead of drifting out of sync.
//
// Outputs:
//   blog.html                   listing page
//   blog/<slug>/index.html      one directory per post -> clean /blog/<slug>/ URLs
//   sitemap.xml                 every page on the site
//
// Links in posts.js and in article fragments are written ROOT-RELATIVE
// ("coa.html"). rewriteDepth() rewrites them per output depth.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const SHELL_DONOR = 'peptides.html';

const posts = require(path.join(ROOT, 'content/posts.js'));

/* ---------- shell extraction ---------- */

function slice(html, startMarker, endMarker, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(
      `Could not find the ${label} in ${SHELL_DONOR}. ` +
      `Looked for "${startMarker}" ... "${endMarker}". ` +
      `If the markup changed, update the markers in tools/build-blog.js.`
    );
  }
  return html.slice(start, end + endMarker.length);
}

const donor = fs.readFileSync(path.join(ROOT, SHELL_DONOR), 'utf8');
const topShell = slice(donor, '<div class="marquee-bar">', '</header>', 'marquee + header');
const footerShell = slice(donor, '<footer class="site-footer">', '</footer>', 'footer');

/* ---------- helpers ---------- */

// Prefix root-relative URLs so they resolve from a nested output directory.
function rewriteDepth(html, depth) {
  if (depth === 0) return html;
  const prefix = '../'.repeat(depth);
  return html.replace(/(href|src)="([^"]*)"/g, (whole, attr, url) => {
    if (/^(https?:)?\/\//.test(url)) return whole;      // absolute
    if (/^(#|mailto:|tel:|data:)/.test(url)) return whole; // in-page / non-navigational
    return `${attr}="${prefix}${url}"`;
  });
}

// Mark the Blog nav item as current; clear whatever the donor had active.
function setActiveNav(html) {
  return html
    .replace(/(<a\s+href="[^"]*")\s+class="active"/g, '$1')
    .replace(/<a href="blog\.html">Blog<\/a>/, '<a href="blog.html" class="active">Blog</a>');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function displayDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

const HEAD_COMMON = `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9C%A6%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css" />`;

// Minimal behaviour for blog pages: year stamp, mobile nav, header shadow.
// Deliberately does NOT pull in the catalog scripts the donor page uses.
const PAGE_SCRIPT = `<script>
  document.getElementById('blogYear').textContent = new Date().getFullYear();
  const hamburger = document.getElementById('hamburger');
  const mainNav = document.getElementById('mainNav');
  hamburger.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
  mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mainNav.classList.remove('open')));
  const header = document.getElementById('siteHeader');
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 20 ? '0 6px 24px -12px rgba(0,0,0,0.5)' : 'none';
  });
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  const jrDate = document.getElementById('jrDate');
  if (jrDate) {
    jrDate.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
</script>`;

/* ---------- page assembly ---------- */

function page({ head, body, depth, progressBar = false, extraScript = '' }) {
  let shell = setActiveNav(topShell);
  // the progress bar rides the sticky header, so it stays pinned while reading
  if (progressBar) {
    shell = shell.replace('</header>', '  <div class="read-progress" id="readProgress"></div>\n</header>');
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_COMMON}
${head}
</head>
<body>

${shell}

${body}

${footerShell.replace('id="stubYear"', 'id="blogYear"')}

${PAGE_SCRIPT}
${extraScript}
</body>
</html>
`;
  return rewriteDepth(html, depth);
}

/* ---------- table of contents ----------
   Pulls the <h2>s out of the article body, gives each a stable id, and
   returns both the rewritten body and the list for the sidebar. */

function slugifyHeading(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function withToc(bodyHtml) {
  const items = [];
  const html = bodyHtml.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const id = slugifyHeading(text);
    items.push({ id, label: inner.trim() });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html, items };
}

const POST_SCRIPT = `<script>
  /* reading progress — measured against the article body, not the whole
     document, so the footer doesn't count as "read" */
  (function () {
    const bar = document.getElementById('readProgress');
    const body = document.querySelector('.post-body');
    if (!bar || !body) return;
    function update() {
      const start = body.offsetTop;
      const end = start + body.offsetHeight - window.innerHeight;
      const p = (window.scrollY - start) / Math.max(end - start, 1);
      bar.style.width = Math.min(Math.max(p, 0), 1) * 100 + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* highlight the section currently in view in the sidebar */
  (function () {
    const links = [...document.querySelectorAll('.post-toc a')];
    if (!links.length) return;
    const heads = links
      .map(a => document.getElementById(a.getAttribute('href').slice(1)))
      .filter(Boolean);
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l =>
          l.classList.toggle('is-current', l.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-88px 0px -68% 0px' });
    heads.forEach(h => spy.observe(h));
  })();
</script>`;

/* ---------- individual post ---------- */

function buildPost(post) {
  const url = `${SITE}/blog/${post.slug}/`;
  const body = fs.readFileSync(
    path.join(ROOT, 'content/posts', `${post.slug}.html`), 'utf8'
  ).trim();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: 'Glow Research', url: SITE },
    publisher: {
      '@type': 'Organization',
      name: 'Glow Research',
      url: SITE,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: (post.keywords || []).join(', '),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog.html` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  };

  const head = `<title>${esc(post.title)} — Glow Research</title>
<meta name="description" content="${esc(post.description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Glow Research" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="${esc(post.description)}" />
<meta property="og:url" content="${url}" />
<meta property="article:published_time" content="${post.date}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(post.title)}" />
<meta name="twitter:description" content="${esc(post.description)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;

  const related = posts.filter(p => p.slug !== post.slug).slice(0, 2);
  const { html: bodyWithIds, items: toc } = withToc(body);

  const tocHtml = toc.length >= 3 ? `    <aside class="post-toc">
      <span class="post-toc-label">Contents</span>
      <nav aria-label="Table of contents">
${toc.map(t => `        <a href="#${t.id}">${t.label}</a>`).join('\n')}
      </nav>
    </aside>` : '    <aside class="post-toc" aria-hidden="true"></aside>';

  const bodyHtml = `<article class="post">
  <div class="post-shell">
${tocHtml}

    <div class="post-main">
      <header class="post-header">
        <nav class="post-breadcrumb" aria-label="Breadcrumb">
          <a href="index.html">Home</a>
          <span aria-hidden="true">/</span>
          <a href="blog.html">Blog</a>
        </nav>
        <span class="post-kicker">${esc(post.category)}</span>
        <h1>${esc(post.title)}</h1>
        <p class="post-standfirst">${esc(post.description)}</p>
        <div class="post-meta">
          <span class="post-byline">Glow Research</span>
          <span aria-hidden="true">&bull;</span>
          <time datetime="${post.date}">${displayDate(post.date)}</time>
          <span aria-hidden="true">&bull;</span>
          <span>${post.readingTime} min read</span>
        </div>
      </header>

      <div class="post-cover">${coverSvg(post.slug, { w: 760, h: 300, nodes: 30, variant: 'cover' })}</div>

      <div class="post-body">
${bodyWithIds}
      </div>

      <aside class="post-disclaimer">
        <strong>Research use only.</strong> This article is provided for informational purposes to
        qualified researchers. Glow Research products are sold strictly for in-vitro laboratory
        research and are not drugs, supplements, or medical products. Nothing here is medical advice.
      </aside>
    </div>
  </div>
</article>

<section class="section section-related">
  <div class="container">
    <span class="eyebrow">Keep reading</span>
    <div class="blog-grid">
${related.map(cardHtml).join('\n')}
    </div>
  </div>
</section>`;

  return page({ head, body: bodyHtml, depth: 2, progressBar: true, extraScript: POST_SCRIPT });
}

/* ---------- generative cover art ----------
   Each post gets a unique molecular-lattice cover derived from its slug, so
   new articles get artwork automatically with no image assets to manage and
   nothing extra to download. Deterministic: the same slug always renders the
   same lattice. */

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// small deterministic PRNG so covers are stable across rebuilds
function seeded(seed) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function coverSvg(slug, { w = 640, h = 420, nodes = 26, variant = 'lead' } = {}) {
  const rand = seeded(hashString(slug));
  const pts = Array.from({ length: nodes }, () => ({
    x: +(rand() * w).toFixed(1),
    y: +(rand() * h).toFixed(1),
    r: +(1.1 + rand() * 2.4).toFixed(2),
  }));

  const reach = Math.min(w, h) * 0.36;
  const lines = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < reach) {
        const o = ((1 - d / reach) * 0.42).toFixed(3);
        lines.push(`<line x1="${pts[i].x}" y1="${pts[i].y}" x2="${pts[j].x}" y2="${pts[j].y}" stroke="#fff" stroke-opacity="${o}" stroke-width="1"/>`);
      }
    }
  }

  const dots = pts
    .map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="#fff" fill-opacity="${(0.35 + rand() * 0.5).toFixed(2)}"/>`)
    .join('');

  // glow position also varies per post
  const gx = (25 + rand() * 50).toFixed(0);
  const gy = (25 + rand() * 50).toFixed(0);
  const id = `g-${variant}-${slug}`;

  return `<svg class="cover-art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}" cx="${gx}%" cy="${gy}%" r="72%">
      <stop offset="0%" stop-color="#2a2a28"/>
      <stop offset="100%" stop-color="#000"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id})"/>
  <g>${lines.join('')}</g>
  <g>${dots}</g>
</svg>`;
}

/* ---------- listing ---------- */

function cardHtml(post) {
  return `      <a class="blog-card reveal" href="blog/${post.slug}/">
        <span class="blog-card-cat">${esc(post.category)}</span>
        <h3>${esc(post.title)}</h3>
        <p>${esc(post.description)}</p>
        <div class="blog-card-meta">
          <time datetime="${post.date}">${displayDate(post.date)}</time>
          <span aria-hidden="true">&bull;</span>
          <span>${post.readingTime} min read</span>
        </div>
      </a>`;
}

function buildIndex() {
  const url = `${SITE}/blog.html`;
  const head = `<title>Blog — Peptide Research, Handling &amp; Industry Notes | Glow Research</title>
<meta name="description" content="Practical guides and industry notes on research peptides — storage, reconstitution, certificates of analysis, and quality standards from Glow Research." />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Glow Research" />
<meta property="og:title" content="Glow Research Blog" />
<meta property="og:description" content="Practical guides and industry notes on research peptides." />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Glow Research Blog',
    url,
    description: 'Practical guides and industry notes on research peptides.',
    blogPost: posts.map(p => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE}/blog/${p.slug}/`,
      datePublished: p.date,
      description: p.description,
    })),
  })}</script>`;

  const [lead, ...rest] = posts;

  const leadHtml = `      <a class="jr-lead" href="blog/${lead.slug}/">
        <div class="jr-lead-copy">
          <div class="jr-tags">
            <span class="jr-tag jr-tag-feature">Featured</span>
            <span class="jr-tag">${esc(lead.category)}</span>
          </div>
          <h2>${esc(lead.title)}</h2>
          <p>${esc(lead.description)}</p>
          <div class="jr-lead-foot">
            <span class="jr-meta">
              <span class="jr-byline">By Glow Research</span>
              <span aria-hidden="true">&bull;</span>
              <time datetime="${lead.date}">${displayDate(lead.date)}</time>
              <span aria-hidden="true">&bull;</span>
              <span>${lead.readingTime} min read</span>
            </span>
            <span class="jr-cta">Continue reading</span>
          </div>
        </div>
        <div class="jr-lead-art">${coverSvg(lead.slug, { variant: 'lead' })}</div>
      </a>`;

  const rowsHtml = rest.map((p) => `      <li class="jr-row">
        <a href="blog/${p.slug}/">
          <span class="jr-tag">${esc(p.category)}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <span class="jr-row-meta">
            <span class="jr-byline">By Glow Research</span>
            <span aria-hidden="true">&bull;</span>
            <time datetime="${p.date}">${displayDate(p.date)}</time>
            <span aria-hidden="true">&bull;</span>
            <span>${p.readingTime} min read</span>
          </span>
        </a>
      </li>`).join('\n');

  // Sections come from the posts themselves, so the masthead can never
  // advertise a category that has nothing behind it.
  const sections = [...new Set(posts.map(p => p.category))];

  const body = `<section class="journal">
  <div class="container">

    <header class="jr-masthead">
      <div class="jr-mast-top">
        <span id="jrDate">&nbsp;</span>
        <span class="jr-mast-sections">${sections.map(esc).join(' &middot; ')}</span>
        <span class="jr-count">${posts.length} article${posts.length === 1 ? '' : 's'}</span>
      </div>
      <div class="jr-nameplate">
        <h1>Glow Research</h1>
        <p class="jr-mast-tagline">Handling protocols, verification guides, and notes on where the research peptide industry is going.</p>
      </div>
    </header>

${leadHtml}

${rest.length ? `    <div class="jr-sep" aria-hidden="true"></div>
    <ul class="jr-list">
${rowsHtml}
    </ul>` : ''}

  </div>
</section>`;

  return page({ head, body, depth: 0 });
}

/* ---------- sitemap ---------- */

function buildSitemap() {
  const staticPages = [
    ['', '1.0'], ['peptides.html', '0.9'], ['blog.html', '0.8'],
    ['coa.html', '0.7'],
    ['shipping.html', '0.6'], ['wholesale.html', '0.6'],
  ];
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...staticPages.map(([p, pri]) =>
      `  <url>\n    <loc>${SITE}/${p}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${pri}</priority>\n  </url>`),
    ...posts.map(p =>
      `  <url>\n    <loc>${SITE}/blog/${p.slug}/</loc>\n    <lastmod>${p.date}</lastmod>\n    <priority>0.7</priority>\n  </url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/* ---------- run ---------- */

let written = 0;
for (const post of posts) {
  const dir = path.join(ROOT, 'blog', post.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildPost(post));
  console.log(`  blog/${post.slug}/index.html`);
  written++;
}

fs.writeFileSync(path.join(ROOT, 'blog.html'), buildIndex());
console.log('  blog.html');

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap());
console.log('  sitemap.xml');

console.log(`\nBuilt ${written} post(s).`);
