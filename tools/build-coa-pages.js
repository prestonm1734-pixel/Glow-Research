#!/usr/bin/env node
// ===================== Glow Research — certificate pages =====================
//
//   node tools/build-coa-pages.js
//
// Writes coa/<slug>/index.html: one page per compound for its current lot's
// certificate of analysis.
//
// Why this exists. "<compound> COA" is one of the most specific searches a
// research buyer makes, and the only thing answering it was a PDF and a card
// on coa.html that opened a dialog. A PDF ranks badly, carries no link back to
// the product, and says nothing a search engine can quote; the dialog is not a
// page at all. Each compound now has an address of its own whose text is the
// certificate's own figures, read from the catalog, with the PDF, the
// laboratory's verification link and the product one click away.
//
// Inputs:
//   js/products-data.js   the catalog: lot, purity, results, report, dates
//   return-policy.html    donor shell: header, footer, scripts, legal layout
//
// Output:
//   coa/<slug>/index.html for every product with a lot and a certificate
//
// Nothing here is typed: every figure on these pages is the same field the
// product page's batch panel reads, so a lot that turns over in the catalog
// turns over here on the next build.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const DONOR = 'return-policy.html';
const OUT_DIR = 'coa';

const {
  GLOW_PRODUCTS, productSlug, coaHref, verifyUrl, LAB, CAT_LABEL,
  PRODUCT_PAGES_LIVE, lotSentence,
} = require(path.join(ROOT, 'js/products-data.js'));

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function required(html, re, label) {
  if (!re.test(html)) {
    throw new Error(`Could not find ${label} in ${DONOR}. ` +
      'If the markup changed, update the pattern in tools/build-coa-pages.js.');
  }
  return html;
}

// Same rule as tools/build-products.js: root-relative paths get a prefix so
// they resolve from coa/<slug>/.
function rewriteDepth(html, depth) {
  const prefix = '../'.repeat(depth);
  return html.replace(/(href|src)="([^"]*)"/g, (whole, attr, url) => {
    if (/^(https?:)?\/\//.test(url)) return whole;
    if (/^(#|mailto:|tel:|data:)/.test(url)) return whole;
    if (url.startsWith('/')) return whole;
    return `${attr}="${prefix}${url}"`;
  });
}

// Only compounds with a lot and a published certificate get a page: a page
// titled "certificate of analysis" with no certificate behind it is the
// exact gap this file exists to close, not one to open somewhere new.
function eligible(p) {
  return Boolean(p.lot && coaHref(p));
}

function productLink(p) {
  const slug = productSlug(p.name);
  return PRODUCT_PAGES_LIVE ? `product/${slug}/` : `product.html?p=${slug}`;
}

function pageTitle(p) {
  return `${p.name} COA, Lot ${p.lot} | Glow Research`;
}

function pageDesc(p) {
  const s = p.sizes[0];
  const by = LAB && LAB.name ? ` by ${LAB.name}` : '';
  const when = p.tested ? ` on ${p.tested}` : '';
  return `Certificate of analysis for ${p.name} ${s.mg}, lot ${p.lot}: purity by HPLC ` +
    `${p.purity}, identity and quantity, tested${by}${when}. Open the PDF or verify the report.`;
}

function factsHtml(p) {
  const rows = [
    ['Compound', `${p.name} ${p.sizes[0].mg}`],
    ['Category', CAT_LABEL[p.cat]],
    ['Lot', p.lot],
    ['Laboratory', LAB && LAB.name],
    ['Report reference', p.coaRef],
    ['Tested', p.tested],
    ['Purity (HPLC)', p.purity],
    ...Object.entries(p.results || {}),
  ].filter(r => r[1]);
  return `<dl class="coa-facts">\n` +
    rows.map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n') +
    `\n    </dl>`;
}

function othersHtml(p) {
  const others = GLOW_PRODUCTS.filter(o => o !== p && eligible(o));
  if (!others.length) return '';
  return `<h2>Other certificates</h2>\n    <ul class="coa-others">\n` +
    others.map(o => `      <li><a href="${OUT_DIR}/${productSlug(o.name)}/">${esc(o.name)} COA, lot ${esc(o.lot)}</a></li>`).join('\n') +
    `\n    </ul>`;
}

function jsonLd(p, url) {
  const productUrl = `${SITE}/${productLink(p)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: `${p.name} certificate of analysis, lot ${p.lot}`,
        description: pageDesc(p),
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${productUrl}#product` },
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Certificates of Analysis', item: `${SITE}/coa.html` },
          { '@type': 'ListItem', position: 3, name: `${p.name} COA`, item: url },
        ],
      },
    ],
  };
}

function buildPage(p, donor) {
  const slug = productSlug(p.name);
  const url = `${SITE}/${OUT_DIR}/${slug}/`;
  const title = pageTitle(p);
  const desc = pageDesc(p);
  const pdf = coaHref(p);
  const verify = verifyUrl(p);
  const ogImage = p.image ? `${SITE}/${p.image}` : `${SITE}/assets/vial-trio-black-v3.jpg`;

  let html = donor;

  required(html, /<title>[\s\S]*?<\/title>/, '<title>');
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(p.name)} COA, Lot ${esc(p.lot)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${ogImage}" />`)
    .replace(/<meta property="og:image:width" content="[^"]*"\s*\/?>\s*/, '')
    .replace(/<meta property="og:image:height" content="[^"]*"\s*\/?>\s*/, '')
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(p.name)} COA, Lot ${esc(p.lot)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(desc)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${ogImage}" />`);

  // The donor's single WebPage block becomes this page's graph.
  const ldRe = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  required(html, ldRe, 'its JSON-LD block');
  html = html.replace(ldRe, () =>
    `<script type="application/ld+json">\n${JSON.stringify(jsonLd(p, url), null, 2)}\n</script>`);

  html = html
    .replace(/data-content-page="[^"]*"/, `data-content-page="coa-${slug}"`)
    .replace('</style>', `  .coa-facts{ margin: 0 0 1.6em; border-top:1px solid var(--line, rgba(255,255,255,.14)); }
  .coa-facts div{ display:grid; grid-template-columns: 42% 58%; gap:12px; padding:12px 0; border-bottom:1px solid var(--line, rgba(255,255,255,.1)); }
  .coa-facts dt{ font-size:.9rem; color: var(--text-dimmer); }
  .coa-facts dd{ margin:0; font-weight:600; color: var(--text); }
  .coa-actions{ display:flex; flex-wrap:wrap; gap:12px; margin: 0 0 2em; }
  .coa-others{ padding-left: 1.1em; }
  .coa-actions .coa-pdf{ background:#fff; color:#0a0a0a; border:1px solid #fff; text-decoration:none; }
  .coa-actions .coa-pdf:hover{ background:#e6e6e3; border-color:#e6e6e3; color:#0a0a0a; }
  .coa-actions .btn-outline{ text-decoration:none; }
</style>`);

  const heroRe = /<section class="lp-hero">[\s\S]*?<\/section>/;
  required(html, heroRe, 'the lp-hero section');
  html = html.replace(heroRe, () => `<section class="lp-hero">
  <div class="container">
    <span class="lp-eyebrow">Certificate of Analysis</span>
    <h1>${esc(p.name)} COA</h1>
    <p class="lp-lede">
      Lot ${esc(p.lot)}${LAB && LAB.name ? `, analysed by ${esc(LAB.name)}` : ''}. Purity by HPLC ${esc(p.purity)}.
    </p>
  </div>
</section>`);

  const bodyRe = /(<div class="container tc-body">)[\s\S]*?(<\/div>\s*<\/section>\s*<\/main>)/;
  required(html, bodyRe, 'the tc-body section');
  const body = `
    <h2>This lot</h2>
    <p>${esc(lotSentence(p))}</p>
    ${factsHtml(p)}
    <div class="coa-actions">
      <a class="btn coa-pdf" href="${esc(pdf)}" target="_blank" rel="noopener">Open the certificate (PDF)</a>
      ${verify ? `<a class="btn btn-outline" href="${esc(verify)}" target="_blank" rel="noopener">Verify report ${esc(p.coaRef)}</a>` : ''}
    </div>

    <h2>About ${esc(p.name)}</h2>
    <p>${esc(p.about[0])}</p>
    <p>
      Every vial ships against the lot number on its certificate. When a new lot
      is listed, this page moves to it. Sold strictly for in-vitro laboratory
      research, not for human or veterinary use.
    </p>
    <p><a href="${productLink(p)}">View ${esc(p.name)} ${esc(p.sizes[0].mg)}</a> &middot; <a href="coa.html">All certificates</a> &middot; <a href="how-we-test.html">How we test</a></p>

    ${othersHtml(p)}
  `;
  html = html.replace(bodyRe, (m, open, close) => `${open}${body}${close}`);

  return rewriteDepth(html, 2);
}

function build() {
  const donor = fs.readFileSync(path.join(ROOT, DONOR), 'utf8');
  const outRoot = path.join(ROOT, OUT_DIR);
  // Start from empty so a compound that leaves the catalog does not leave a
  // page behind quoting a lot nobody sells any more.
  if (fs.existsSync(outRoot)) fs.rmSync(outRoot, { recursive: true, force: true });
  const made = GLOW_PRODUCTS.filter(eligible).map(p => {
    const dir = path.join(outRoot, productSlug(p.name));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildPage(p, donor));
    return productSlug(p.name);
  });
  console.log(`  coa/: ${made.length} certificate pages (${made.join(', ')})`);
}

module.exports = { build, eligible };

if (require.main === module) build();
