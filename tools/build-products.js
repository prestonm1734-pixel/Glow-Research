#!/usr/bin/env node
// ===================== Glow Research — product page build =====================
//
//   node tools/build-products.js
//
// Generates one real, crawlable static page per compound. Until now every
// product lived at product.html?p=<slug> and was drawn entirely by
// js/product.js after load, so all nine shared a single indexable URL whose
// served markup said "Product name" and "$0". This gives each compound its own
// URL with its own content already in the HTML.
//
// Inputs:
//   js/products-data.js   the catalog — the same file the browser loads, read
//                         here through the CommonJS guard at the foot of it
//   product.html          "shell donor": the whole page is used as the
//                         template, so nav, footer, styles and scripts stay in
//                         one place and a change there propagates on rebuild
//
// Outputs:
//   peptides/<slug>/index.html   -> clean /peptides/<slug>/ URLs
//
// The generated page still loads js/product.js and hydrates exactly as before
// — the size picker, bulk tiers and delivery estimate are all still live. The
// baked-in markup is what a crawler (and the first paint) sees; hydration
// replaces it with the identical content plus its event handlers. The slug is
// carried on <body data-product-slug> rather than the query string.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const SHELL_DONOR = 'product.html';
const OUT_DIR = 'peptides';

const {
  GLOW_PRODUCTS, productSlug, salePrice, onSaleNow, hasList, listPriceOf, PRODUCT_PAGES_LIVE,
  sizeInStock, productInStock, evidenceHtml, identityLine, unitPriceAt,
  catFilterGroup, CAT_LABEL,
} = require(path.join(ROOT, 'js/products-data.js'));

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const money = n => '$' + n.toFixed(2);

// Contract: if the donor markup moves,
// fail loudly at build time rather than emit a page with a hole in it.
function required(html, re, label) {
  if (!re.test(html)) {
    throw new Error(
      `Could not find ${label} in ${SHELL_DONOR}. ` +
      `If the markup changed, update the pattern in tools/build-products.js.`
    );
  }
  return html;
}

// All three of these take a replacer function rather than a replacement
// string. "$1" and "$2" in a replacement string are backreferences, and every
// price starts with a dollar sign: fmtPrice() emits "$116.10", whose "$1" was
// being substituted with capture group 1, so the generated GLP3-RT page read
// `id="pdPrice">16.10` where its price should have been. A function receives
// the groups as arguments and inserts the text literally, which is the only
// form that is correct for arbitrary copy.

// Fill an element that the donor leaves empty: <div id="x"></div>
function fillEmpty(html, id, content) {
  const re = new RegExp(`(id="${id}"[^>]*>)(</)`);
  required(html, re, `empty element #${id}`);
  return html.replace(re, (m, open, close) => open + content + close);
}

// Replace the placeholder text inside an element: <h1 id="x">Product name</h1>
function setText(html, id, text) {
  const re = new RegExp(`(id="${id}"[^>]*>)[^<]*(<)`);
  required(html, re, `text placeholder #${id}`);
  return html.replace(re, (m, open, close) => open + text + close);
}

// Replace the contents of an element the donor ships filled: <dl id="x">…</dl>.
// Non-greedy to the first matching close tag, so it must not be used on an
// element that nests another of the same tag.
function setInner(html, id, tag, content) {
  const re = new RegExp(`(id="${id}"[^>]*>)[\\s\\S]*?(</${tag}>)`);
  required(html, re, `#${id} contents`);
  return html.replace(re, (m, open, close) => open + content + close);
}

// Prefix root-relative URLs so they resolve from peptides/<slug>/.
// Rewrites root-relative asset paths for pages nested a directory deep.
function rewriteDepth(html, depth) {
  if (depth === 0) return html;
  const prefix = '../'.repeat(depth);
  return html.replace(/(href|src)="([^"]*)"/g, (whole, attr, url) => {
    if (/^(https?:)?\/\//.test(url)) return whole;          // absolute
    if (/^(#|mailto:|tel:|data:)/.test(url)) return whole;  // in-page / non-navigational
    return `${attr}="${prefix}${url}"`;
  });
}

/* ---------- structured data ---------- */

function productJsonLd(p, url) {
  // One Offer per mg. `price` is what the buyer is actually charged — the
  // sitewide markdown is applied — because structured data that quotes the
  // list price while checkout charges less is a mismatch Google flags.
  const offers = p.sizes.map(s => ({
    '@type': 'Offer',
    name: `${p.name} ${s.mg}`,
    url,
    sku: s.sku,
    price: (onSaleNow() ? salePrice(s.price) : s.price).toFixed(2),
    priceCurrency: 'USD',
    // Read from the catalog, same field the buy box reads. Google surfaces
    // this in shopping results, so a hardcoded InStock is a promise made to
    // someone who never visited the page.
    availability: sizeInStock(s)
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    seller: { '@id': `${SITE}/#organization` },
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    description: p.about[0],
    category: CAT_LABEL[p.cat],
    url,
    brand: { '@type': 'Brand', name: 'Glow Research' },
    // Purity is the one measured attribute the catalog carries. No
    // aggregateRating and no review: there are no reviews, and inventing them
    // is exactly the kind of thing that earns a manual action.
    additionalProperty: [{
      '@type': 'PropertyValue',
      name: 'Purity',
      value: p.purity,
    }],
    offers,
  };
}

function breadcrumbJsonLd(p, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Catalog', item: `${SITE}/peptides.html` },
      { '@type': 'ListItem', position: 3, name: CAT_LABEL[p.cat], item: `${SITE}/peptides.html?cat=${catFilterGroup(p.cat)}` },
      { '@type': 'ListItem', position: 4, name: p.name, item: url },
    ],
  };
}

/* ---------- page assembly ---------- */

function buildProduct(p, donor) {
  const slug = productSlug(p.name);
  const url = `${SITE}/${OUT_DIR}/${slug}/`;
  const s = p.sizes[0];

  // Matches what js/product.js sets on load, so the title does not change
  // under the reader between the static page and hydration.
  const title = `${p.name} ${s.mg} | Glow Research`;
  // Kept identical to the runtime description in js/product.js, so the served
  // page and the hydrated one agree. Says the lot is third-party tested, which
  // is true, without promising a certificate the site cannot yet serve — see
  // COAS_PUBLISHED in js/products-data.js. Add the purity figure here once the
  // supplier's measured values have replaced the placeholders.
  const desc = `${p.name}, ${s.mg} per vial. ` +
    `Third-party tested research-grade peptide, supplied for laboratory and in-vitro research use only.`;
  const ogImage = p.image ? `${SITE}/${p.image}` : `${SITE}/assets/vial-trio-black.jpg`;

  let html = donor;

  /* --- head --- */
  html = required(html, /<title>[\s\S]*?<\/title>/, '<title>')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(desc)}" />`
  );

  // The donor carries generic og:title/description and no canonical (it cannot
  // have a static one — it serves every product). Retarget them per product.
  html = html
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${esc(p.name)} ${esc(s.mg)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${esc(desc)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${esc(p.name)} ${esc(s.mg)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${ogImage}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${ogImage}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?>/,
      `<meta property="og:type" content="product" />`);

  const headExtra = `<link rel="canonical" href="${url}" />
<meta property="og:url" content="${url}" />
<script type="application/ld+json">${JSON.stringify(productJsonLd(p, url))}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd(p, url))}</script>`;
  html = required(html, /<\/head>/, '</head>').replace('</head>', headExtra + '\n</head>');

  /* --- slug, baked in so the page needs no query string --- */
  html = required(html, /<body>/, '<body>')
    .replace('<body>', `<body data-product-slug="${slug}">`);

  /* --- content a crawler must see without running scripts --- */
  html = setText(html, 'pdCrumbCat', esc(CAT_LABEL[p.cat]));
  html = html.replace(
    /(id="pdCrumbCat"\s+)href="[^"]*"/,
    (m, open) => `${open}href="peptides.html?cat=${catFilterGroup(p.cat)}"`
  );
  html = setText(html, 'pdCrumbName', esc(p.name));
  html = setText(html, 'pdTag', esc(p.tag));
  html = setText(html, 'pdName', esc(p.name));
  html = fillEmpty(html, 'pdIdentity', esc(identityLine(p, s)));
  html = setText(html, 'pdVialName', esc(p.name));
  html = setText(html, 'pdVialMg', esc(s.mg.toUpperCase()));
  html = fillEmpty(html, 'pdVialFine',
    `${esc(p.purity)} Purity<br />FOR RESEARCH USE ONLY<br />glowresearch.shop`);

  // Not setText: with a launch list price the markup is a struck-through
  // figure beside the charged one, and setText stops at the first "<".
  // unitPriceAt(price, 1) rather than salePrice(price): identical today, but
  // it is the same function js/product.js reprices with, so the baked figure
  // and the hydrated one cannot diverge if the pricing rules change. The
  // struck figure matches renderPrice() in js/product.js at qty 1.
  const priceHtml = hasList(s)
    ? `${money(unitPriceAt(s.price, 1))}<s class="pd-price-was">${money(Math.max(listPriceOf(s), s.price))}</s>`
    : money(unitPriceAt(s.price, 1));
  const priceRe = /(id="pdPrice"[^>]*>)[\s\S]*?(<\/span>)/;
  required(html, priceRe, 'price placeholder #pdPrice');
  html = html.replace(priceRe, (m, open, close) => open + priceHtml + close);

  html = fillEmpty(html, 'pdSizes', p.sizes.map((sz, i) =>
    `<button type="button" class="pd-size${i === 0 ? ' is-active' : ''}` +
    `${sizeInStock(sz) ? '' : ' is-out'}" data-i="${i}">${esc(sz.mg)}</button>`
  ).join(''));

  // Bake the stock state rather than leaving it to hydration: this is what a
  // crawler indexes and what someone with JS off is looking at, and an enabled
  // "Add to cart" on a sold-out vial is the exact promise we must not make.
  if (!sizeInStock(s)) {
    const addRe = /(id="pdAddBtn"[^>]*)(>)(?:(?!<\/button>)[\s\S])*/;
    required(html, addRe, 'add button #pdAddBtn');
    html = html.replace(addRe, '$1 disabled$2Out of stock');
    html = setText(html, 'pdCutoff', 'Out of stock');
    html = setText(html, 'pdArrival',
      'Email support@glowresearch.shop and we will tell you when the next lot is released.');
  }

  // The evidence panel, from the same function js/product.js calls on load. The
  // Verify row carries this compound's own purity figure, so the panel really
  // is per product rather than four constants repeated nine times. The dispatch
  // row keeps its standing-rule wording: a build cannot know what time the page
  // will be read, so js/product.js replaces that one on load.
  html = setInner(html, 'pdEvidence', 'dl', evidenceHtml(p));

  return rewriteDepth(html, 2);
}

/* ---------- run ---------- */

// Held deliberately, not broken. The generator below is complete and tested;
// what is missing is the data. Writing nine pages of placeholder prices and
// placeholder purity figures and letting them be crawled is the thing this
// guard exists to prevent.
if (!PRODUCT_PAGES_LIVE) {
  console.log(
    'Product pages are held: PRODUCT_PAGES_LIVE is false in js/products-data.js.\n' +
    '\n' +
    'Nothing was written. The catalog, prices, images and COAs are still to be\n' +
    'imported, and until they are, every product link on the site stays on\n' +
    'product.html?p=<slug>, which serves the same product from the same data.\n' +
    '\n' +
    'To launch: import the real catalog, fill COA_URL (or a per-product `coa`),\n' +
    'set PRODUCT_PAGES_LIVE = true, re-run this build, and commit peptides/**.'
  );
  // Still refresh the sitemap: the flag governs it too, so this keeps the
  // committed sitemap honest whichever build was run last.
  console.log(`\n  sitemap.xml (${require('./build-sitemap.js').write()} URLs)`);
  process.exit(0);
}

const donor = fs.readFileSync(path.join(ROOT, SHELL_DONOR), 'utf8');

// A backstop for a standalone run of this script. tools/check-claims.js makes
// the same assertion on every build, including while the pages are held, which
// is the run that matters: this one is unreachable until they go live.
const unlabelled = [...new Set(GLOW_PRODUCTS.map(p => p.cat))].filter(c => !CAT_LABEL[c]);
if (unlabelled.length) {
  throw new Error(
    `No CAT_LABEL for category "${unlabelled.join('", "')}". ` +
    `Add it to CAT_LABEL in js/products-data.js.`
  );
}

let written = 0;
for (const p of GLOW_PRODUCTS) {
  const slug = productSlug(p.name);
  const dir = path.join(ROOT, OUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildProduct(p, donor));
  console.log(`  ${OUT_DIR}/${slug}/index.html`);
  written++;
}

// Kept here rather than in a shared module: this is its only caller now.
console.log(`  sitemap.xml (${require('./build-sitemap.js').write()} URLs)`);

console.log(`\nBuilt ${written} product page(s).`);
