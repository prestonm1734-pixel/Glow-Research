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
</script>`;

/* ---------- page assembly ---------- */

function page({ head, body, depth }) {
  const shell = setActiveNav(topShell);
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
</body>
</html>
`;
  return rewriteDepth(html, depth);
}

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

  const bodyHtml = `<article class="post">
  <header class="post-header">
    <div class="container post-container">
      <nav class="post-breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Home</a>
        <span aria-hidden="true">/</span>
        <a href="blog.html">Blog</a>
      </nav>
      <span class="eyebrow">${esc(post.category)}</span>
      <h1>${esc(post.title)}</h1>
      <p class="post-standfirst">${esc(post.description)}</p>
      <div class="post-meta">
        <time datetime="${post.date}">${displayDate(post.date)}</time>
        <span aria-hidden="true">&bull;</span>
        <span>${post.readingTime} min read</span>
      </div>
    </div>
  </header>

  <div class="container post-container post-body">
${body}
  </div>

  <div class="container post-container">
    <aside class="post-disclaimer">
      <strong>Research use only.</strong> This article is provided for informational purposes to
      qualified researchers. Glow Research products are sold strictly for in-vitro laboratory
      research and are not drugs, supplements, or medical products. Nothing here is medical advice.
    </aside>
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

  return page({ head, body: bodyHtml, depth: 2 });
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

  const body = `<section class="blog-hero">
  <div class="container">
    <span class="eyebrow">The Blog</span>
    <h1>Peptide research,<br /><span class="outline">documented.</span></h1>
    <p>Handling protocols, verification guides, and notes on where the research peptide industry is going.</p>
  </div>
</section>

<section class="section section-light section-blog">
  <div class="container">
    <div class="blog-grid">
${posts.map(cardHtml).join('\n')}
    </div>
  </div>
</section>`;

  return page({ head, body, depth: 0 });
}

/* ---------- sitemap ---------- */

function buildSitemap() {
  const staticPages = [
    ['', '1.0'], ['peptides.html', '0.9'], ['blog.html', '0.8'],
    ['coa.html', '0.7'], ['quality.html', '0.7'],
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
