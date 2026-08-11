#!/usr/bin/env node
// ===================== Glow Research — catalog page build =====================
//
//   node tools/build-catalog.js
//
// Bakes the product grid into peptides.html, plus CollectionPage + ItemList
// structured data.
//
// Why. The catalog page was 1,037 characters of text to anyone who did not run
// JavaScript, and named none of the nine compounds: the grid was drawn into an
// empty <div> on load. The page whose entire job is to list what Glow sells
// did not, in its served HTML, list anything. Google renders JS and would get
// there; the crawlers behind AI answer engines largely do not, so "what does
// Glow Research sell" had no answer to find.
//
// The grid is baked in the default view (all categories, curated order). The
// page's filter and sort controls re-render it on load through the same
// productCardHtml(), so hydration replaces the cards with identical ones that
// have their handlers attached.
//
// Inputs:
//   js/products-data.js   GLOW_PRODUCTS and productCardHtml()
//
// Output (rewritten in place):
//   peptides.html         #productGrid contents, and the CollectionPage script

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const PAGE = 'peptides.html';
const MARK = 'catalog-jsonld';

const {
  GLOW_PRODUCTS, productCardHtml, productHref, salePrice, onSaleNow,
  sizeInStock, PRODUCT_PAGES_LIVE,
} = require(path.join(ROOT, 'js/products-data.js'));
// The page's name and description come from the one place every other copy of
// them comes from, so this block cannot describe the catalog differently from
// the catalog page's own meta tags.
const { PAGE_META } = require(path.join(__dirname, 'page-meta.js'));

function required(html, re, label) {
  if (!re.test(html)) {
    throw new Error(
      `Could not find ${label} in ${PAGE}. ` +
      `If the markup changed, update the pattern in tools/build-catalog.js.`
    );
  }
  return html;
}

function catalogJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE}/${PAGE}#webpage`,
    url: `${SITE}/${PAGE}`,
    name: PAGE_META[PAGE].name,
    description: PAGE_META[PAGE].desc,
    isPartOf: { '@id': `${SITE}/#website` },
    about: { '@id': `${SITE}/#organization` },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE}/${PAGE}` },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: GLOW_PRODUCTS.length,
      itemListElement: GLOW_PRODUCTS.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.name,
        // Only link out to a product URL that actually exists. While
        // PRODUCT_PAGES_LIVE is false every compound shares product.html, and
        // nine ListItems pointing at one URL is worse than none.
        ...(PRODUCT_PAGES_LIVE ? { url: `${SITE}/${productHref(p)}` } : {}),
      })),
    },
  };
}

function build() {
  let html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');

  const gridRe = /(<div class="product-grid" id="productGrid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/;
  required(html, gridRe, '#productGrid');
  const cards = GLOW_PRODUCTS.map((p, i) => productCardHtml(p, i)).join('');
  // See the note in tools/build-products.js: a replacement string would read
  // the "$1" in every price as a backreference.
  html = html.replace(gridRe, (m, open, close) => `${open}${cards}\n    ${close}`);

  const block =
    `<script type="application/ld+json" id="${MARK}">\n` +
    JSON.stringify(catalogJsonLd(), null, 2) +
    `\n</script>`;
  const existing = new RegExp(`<script type="application/ld\\+json" id="${MARK}">[\\s\\S]*?</script>`);
  if (existing.test(html)) {
    html = html.replace(existing, block);
  } else {
    required(html, /<\/head>/, '</head>');
    html = html.replace('</head>', `${block}\n</head>`);
  }

  fs.writeFileSync(path.join(ROOT, PAGE), html);
  const sellable = GLOW_PRODUCTS.filter(p => p.sizes.some(sizeInStock)).length;
  console.log(`  ${PAGE}: ${GLOW_PRODUCTS.length} cards baked (${sellable} sellable), CollectionPage schema`);
}

if (require.main === module) build();
module.exports = { build, catalogJsonLd };
