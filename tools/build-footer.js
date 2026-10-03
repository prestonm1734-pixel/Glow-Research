#!/usr/bin/env node
// ===================== Glow Research — footer payment marks =====================
//
//   node tools/build-footer.js
//
// Writes the row of accepted-payment marks under the copyright line in every
// page's footer, from PAYMENT_METHODS in js/products-data.js. Only methods
// with a `logo` are drawn, and the row is left empty while PAYMENTS_LIVE is
// false: a card logo is a promise that the card works at checkout.
//
// Each page gets the row between <!-- pay:start --> and <!-- pay:end --> right
// after .footer-legal; the markers are added on first run. Paths are written
// root-relative and the product and certificate generators run after this,
// so their own depth rewriting prefixes them.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { PAYMENT_METHODS, PAYMENTS_LIVE } = require(path.join(ROOT, 'js/products-data.js'));

function rowHtml(prefix) {
  if (!PAYMENTS_LIVE) return '';
  const marks = PAYMENT_METHODS.filter(m => m.logo).map(m =>
    `<img src="${prefix}${m.logo}" alt="${m.name}" width="44" height="28" loading="lazy" />`).join('');
  return marks ? `<div class="footer-pay" aria-label="Accepted payment methods">${marks}</div>` : '';
}

function build() {
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  let n = 0;
  pages.forEach(f => {
    const file = path.join(ROOT, f);
    let html = fs.readFileSync(file, 'utf8');
    if (!/<div class="footer-legal">/.test(html)) return;
    // 404.html is served at any depth, so its links are absolute.
    const prefix = f === '404.html' ? '/' : '';
    if (!/<!-- pay:start -->/.test(html)) {
      html = html.replace(/(<div class="footer-legal">[\s\S]*?<\/div>)/,
        m => `${m}\n        <!-- pay:start --><!-- pay:end -->`);
    }
    html = html.replace(/<!-- pay:start -->[\s\S]*?<!-- pay:end -->/,
      () => `<!-- pay:start -->${rowHtml(prefix)}<!-- pay:end -->`);
    fs.writeFileSync(file, html);
    n++;
  });
  console.log(`  footer payment marks on ${n} pages`);
}

module.exports = { build };
if (require.main === module) build();
