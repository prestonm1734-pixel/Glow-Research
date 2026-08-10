#!/usr/bin/env node
// ===================== Glow Research — sitemap =====================
//
//   node tools/build-sitemap.js      (or let either of the other builds call it)
//
// One writer for sitemap.xml, shared by tools/build-blog.js and
// tools/build-products.js. Both call write() so that running *either* build
// leaves a complete sitemap. That is the point of putting it here: the sitemap
// used to be generated inside the blog build from the blog build's own list of
// pages, so it silently dropped terms.html, privacy.html and
// ruo-agreement.html — URLs someone had added to the committed file by hand —
// every time the blog was rebuilt, and it never knew about products at all.
//
// Deliberately absent: signin, account, checkout, thank-you, reset-password
// and 404. They are transactional or private, and a sitemap is a list of pages
// worth landing on from a search result.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';

// [path, priority] — path is relative to the site root, '' being the homepage.
const STATIC_PAGES = [
  ['', '1.0'],
  ['peptides.html', '0.9'],
  ['blog.html', '0.8'],
  ['process.html', '0.7'],
  ['about.html', '0.6'],
  ['shipping.html', '0.6'],
  ['wholesale.html', '0.6'],
  ['calculator.html', '0.6'],
  ['contact.html', '0.5'],
  ['affiliate.html', '0.5'],
  ['terms.html', '0.3'],
  ['privacy.html', '0.3'],
  ['ruo-agreement.html', '0.3'],
];

function url(loc, lastmod, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
         `    <priority>${priority}</priority>\n  </url>`;
}

function build() {
  const posts = require(path.join(ROOT, 'content/posts.js'));
  const {
    GLOW_PRODUCTS, productSlug, PRODUCT_PAGES_LIVE,
  } = require(path.join(ROOT, 'js/products-data.js'));
  const today = new Date().toISOString().slice(0, 10);

  // Every static page is checked against the filesystem, so a page that gets
  // renamed or removed cannot leave a 404 advertised to search engines.
  const missing = STATIC_PAGES
    .filter(([p]) => p && !fs.existsSync(path.join(ROOT, p)))
    .map(([p]) => p);
  if (missing.length) {
    throw new Error(
      `sitemap lists page(s) that do not exist: ${missing.join(', ')}. ` +
      `Update STATIC_PAGES in tools/build-sitemap.js.`
    );
  }

  const urls = [
    ...STATIC_PAGES.map(([p, pri]) => url(`${SITE}/${p}`, today, pri)),
    // Products rank above articles: they are the pages the catalog exists for.
    // Listed only once the pages are actually published — advertising nine URLs
    // that are not in the repo would be nine 404s handed straight to Google.
    // See PRODUCT_PAGES_LIVE in js/products-data.js.
    ...(PRODUCT_PAGES_LIVE
      ? GLOW_PRODUCTS.map(p => url(`${SITE}/peptides/${productSlug(p.name)}/`, today, '0.8'))
      : []),
    ...posts.map(p => url(`${SITE}/blog/${p.slug}/`, p.date, '0.7')),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function write() {
  const xml = build();
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return (xml.match(/<url>/g) || []).length;
}

module.exports = { build, write, STATIC_PAGES };

// Runnable on its own as well as importable.
if (require.main === module) {
  console.log(`  sitemap.xml (${write()} URLs)`);
}
