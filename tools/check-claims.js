#!/usr/bin/env node
/* ===================== Glow Research — promise audit =====================
 *
 * PRINCIPLES.md: "Build systems that make our promises measurable and
 * difficult for us to break", and "every meaningful failure should produce a
 * process improvement".
 *
 * This is that improvement. Every check below exists because the claim it
 * guards was once asserted in copy while the code said something else, or
 * was hardcoded somewhere the data could not reach. A number printed on a
 * page and a number enforced in a module have to be the same number, and
 * "someone will remember" is not a mechanism.
 *
 *   node tools/check-claims.js
 *
 * Exits non-zero on any failure. Run it before every commit; tools/build.js
 * runs it last so a broken promise fails the build.
 *
 * Adding a claim to the site? Add its check here in the same commit.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  GLOW_PRODUCTS, COAS_PUBLISHED, PRODUCT_PAGES_LIVE, sizeInStock,
  avgPurity, BATCHES_TESTED, TRANSIT_DAYS, CUTOFF_LABEL, CUTOFF_LABEL_SHORT,
  ANALYSIS_TESTS, TESTS_PER_BATCH, numberWord,
  ANALYSIS_SHORT, ANALYSIS_LONG, ANALYSIS_NOT_RUN, SOURCE_LONG,
  LAB, labIdentity, PURITY_ROW, RESULT_ON_COA, batchRows, batchMeta, batchPanelHtml,
  FAQS, faqHtml, analysisDiagramHtml, testingHeading,
  COA_COPY, productCardHtml, coaCardHtml, coaHref, fmtPrice, salePrice,
  QTY_TIERS, tierFor, getProductVariants, unitPriceAt, BULK_MAX_OFF, bulkNote, tierLabel,
  CART_UPSELL, cartUpsell, CAT_LABEL, PAYMENTS_LIVE, PAYMENT_COPY,
  hasList, listPriceOf, SITEWIDE_DISCOUNT,
} = require(path.join(ROOT, 'js/products-data.js'));

let failures = 0;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function ok(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${!cond && detail ? `\n          ${detail}` : ''}`);
}

// Every page a customer can land on. This used to also walk blog/ for the
// article pages; there is no blog any more. google<token>.html is not a page
// at all: it is Search Console's site-verification file, a bare line of text
// with no head or meta, and it has to stay exactly as Google generated it.
const pages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(f));

// Pull a numeric literal out of a source file by its identifier.
function constant(file, name) {
  const m = read(file).match(new RegExp(`${name}\\s*[=:]\\s*([0-9.]+)`));
  return m ? parseFloat(m[1]) : null;
}

/* ---------------------------------------------------------------------------
 * 1. Free shipping. Stated in the marquee on every page, enforced in the cart
 *    drawer, and enforced again in the checkout shipping table. Three places,
 *    one number. A customer who adds $400 of product because the marquee said
 *    so and then gets charged shipping never comes back.
 * ------------------------------------------------------------------------- */
console.log('\nfree shipping threshold');
{
  const cart = constant('js/cart.js', 'FREE_SHIPPING_AT');
  const checkout = constant('js/checkout.js', 'freeOver');
  ok('cart.js declares FREE_SHIPPING_AT', cart !== null);
  ok('checkout.js agrees with the cart', cart === checkout, `cart ${cart} vs checkout ${checkout}`);

  const claimed = new Set();
  pages.forEach(f => {
    const m = read(f).match(/FREE SHIPPING OVER \$([0-9]+)/i);
    if (m) claimed.add(parseInt(m[1], 10));
  });
  ok('every page states one threshold', claimed.size === 1, `found ${[...claimed].join(', ')}`);
  ok('the stated threshold is the enforced one', claimed.has(cart),
    `copy says $${[...claimed].join('/')}, code enforces $${cart}`);
}

/* ---------------------------------------------------------------------------
 * 2. Dispatch cutoff. The product page computes "ships today" from
 *    CUTOFF_HOUR; the marquee, hero and shipping page state it in words. If
 *    someone tunes the constant without touching the copy, the site promises
 *    same-day shipping on an order it has already decided to hold.
 * ------------------------------------------------------------------------- */
console.log('\ndispatch cutoff');
{
  const hour = constant('js/products-data.js', 'CUTOFF_HOUR');
  ok('products-data.js declares CUTOFF_HOUR', hour !== null);
  const h12 = hour > 12 ? hour - 12 : hour;
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const stated = `${h12}${meridiem}`;   // 14 -> "2PM"

  // Any "<n>[:00] AM|PM PST" anywhere in the copy is a cutoff claim. The
  // scripts are scanned too, not just the pages: the product page states the
  // cutoff in a string it renders at runtime, and a claim a customer reads is
  // a claim whether it was typed into markup or into a template literal.
  const wrong = [];
  const cutoffSources = pages.concat(
    ['js/product.js', 'js/products-data.js', 'js/cart.js', 'js/checkout.js']);
  cutoffSources.forEach(f => {
    // &nbsp; between the time and the meridiem is a typographic choice, not a
    // different claim, but it is not whitespace to a regex. about.html reads
    // "2:00&nbsp;PM PST" and was therefore invisible to this scan: the one
    // page stating the cutoff in prose was the one page never checked.
    const src = read(f).replace(/&nbsp;|&#160;| /g, ' ');
    for (const m of src.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*PST\b/gi)) {
      const [, h, mins, ap] = m;
      if (+h !== h12 || ap.toUpperCase() !== meridiem || (mins && mins !== '00')) {
        wrong.push(`${f}: "${m[0]}"`);
      }
    }
  });
  ok(`every stated cutoff is ${stated} PST`, wrong.length === 0, wrong.join(', '));

  // The words a customer reads are checked against the hour rather than against
  // the source that builds them: however the two labels get written, they have
  // to come out saying the time the code actually enforces.
  ok(`CUTOFF_LABEL reads "${CUTOFF_LABEL}"`,
    CUTOFF_LABEL === `${h12}:00 ${meridiem} PST`,
    `expected "${h12}:00 ${meridiem} PST"`);
  ok(`CUTOFF_LABEL_SHORT reads "${CUTOFF_LABEL_SHORT}"`,
    CUTOFF_LABEL_SHORT === `${h12} ${meridiem} PST`,
    `expected "${h12} ${meridiem} PST"`);
  ok('the product page reads the shared cutoff, not its own copy',
    !/const CUTOFF_HOUR/.test(read('js/product.js')) && /CUTOFF_HOUR/.test(read('js/product.js')));

  // The estimate must be computed in Pacific, since that is what the copy says.
  ok('the estimate is computed in Pacific time',
    /America\/Los_Angeles/.test(read('js/product.js')));
}

/* ---------------------------------------------------------------------------
 * 3. Stock. Availability has to be derived from the catalog everywhere it is
 *    asserted — buy box, quick-add, card and Product schema. A hardcoded
 *    InStock is a promise made to someone who never even loaded the page.
 * ------------------------------------------------------------------------- */
console.log('\nstock');
{
  const build = read('tools/build-products.js');
  ok('Product schema derives availability from the catalog',
    /sizeInStock\(s\)\s*\?\s*'https:\/\/schema\.org\/InStock'/.test(build));
  ok('nothing hardcodes InStock',
    !/availability:\s*'https:\/\/schema\.org\/InStock'/.test(build));
  ok('the buy box reads the catalog', /sizeInStock\(/.test(read('js/product.js')));
  ok('the quick-add sheet reads the catalog', /sizeInStock\(/.test(read('js/cart-modal.js')));
  ok('the catalog card reads the catalog', /productInStock\(/.test(read('js/products-data.js')));

  // A size that is not sellable must not be the one a card prices "from".
  const bad = GLOW_PRODUCTS.filter(p => p.sizes.some(sizeInStock) && !sizeInStock(p.sizes[0]));
  ok('no card quotes a price for a sold-out size', bad.length === 0,
    bad.map(p => p.name).join(', '));
}

/* ---------------------------------------------------------------------------
 * 3b. The hero's quality figures. These were removed once already for being
 *     typed straight into the markup with nothing behind them. They are back
 *     because they now have somewhere to come from, and this is the check that
 *     keeps that true: the number a visitor reads must equal the number the
 *     data produces, or the build fails.
 * ------------------------------------------------------------------------- */
console.log('\nhero figures');
{
  const home = read('index.html');
  const statFor = label => {
    // The <p> label identifies the stat; the count it animates to is the claim.
    // The gap must not swallow another data-count, or every lookup returns the
    // first figure in the row and the check passes on the wrong number.
    const m = home.match(
      new RegExp(`data-count="([\\d.]+)"(?:(?!data-count)[\\s\\S]){0,220}?<p>${label}</p>`));
    return m && m[1];
  };

  const purity = statFor('Avg\\. Purity');
  ok('the hero states an average purity', purity !== null);
  ok(`stated purity ${purity} is the catalog average ${avgPurity()}`,
    purity === avgPurity(),
    'index.html and avgPurity() disagree: edit the catalog, not the hero');

  const batches = statFor('Batches Tested');
  ok('the hero states a batch count', batches !== null);
  ok(`stated batch count ${batches} is BATCHES_TESTED ${BATCHES_TESTED}`,
    Number(batches) === BATCHES_TESTED,
    'index.html and products-data.js disagree');

  // Stated as a floor, so the copy stays true as the real number climbs past
  // it. Without the "+" the site would be claiming an exact count it does not
  // hold, which is the failure this whole section exists to prevent.
  ok('the batch count is stated as a floor, not an exact figure',
    /data-count="150">0<\/span><span class="stat-suffix">\+<\/span>/.test(home));

  const transit = statFor('FedEx Transit');
  ok('the hero states a transit time', transit !== null);
  ok(`stated transit ${transit} days is TRANSIT_DAYS ${TRANSIT_DAYS}`,
    Number(transit) === TRANSIT_DAYS,
    'index.html and products-data.js disagree');
}

/* ---------------------------------------------------------------------------
 * 3c. Transit time. Six pages quote the FedEx service in words, the product
 *     page computes an arrival date from it, and the evidence panel prints it.
 *     One number, seven readers. Change the service without changing the copy
 *     and the site quotes a delivery date it will miss.
 * ------------------------------------------------------------------------- */
console.log('\ntransit time');
{
  const wrong = [];
  pages.forEach(f => {
    // Both orders appear in the copy: "FedEx 2-Day" and "2-day FedEx Express".
    for (const m of read(f).matchAll(/FedEx\s+(\d+)-day|(\d+)-day\s+FedEx/gi)) {
      const days = +(m[1] || m[2]);
      if (days !== TRANSIT_DAYS) wrong.push(`${f}: "${m[0]}"`);
    }
  });
  ok(`every stated FedEx service is ${TRANSIT_DAYS}-day`, wrong.length === 0, wrong.join(', '));
  // shipping.html no longer states transit as a separate counted figure —
  // just the "2-day FedEx" sentence in its lede, which the scan above
  // already covers along with every other page.

  ok('the delivery estimate reads the shared constant, not its own copy',
    !/const TRANSIT_DAYS/.test(read('js/product.js')) && /TRANSIT_DAYS/.test(read('js/product.js')));
}

/* ---------------------------------------------------------------------------
 * 3d. Shipping policy figures. shipping-policy.html states the two FedEx
 *     rates, the free-shipping threshold, and the coverage amount in prose,
 *     as a policy rather than a live price. The rates and the threshold have
 *     a source of truth elsewhere on the site (SHIPPING_RATES, cart.js's
 *     FREE_SHIPPING_AT); the policy page has to read the same numbers those
 *     do, not a copy retyped by hand that can drift the next time a rate
 *     changes. Coverage has no such source, since nothing in code enforces an
 *     insurance figure, so that one is pinned only against shipping.html, the
 *     other page that states it, so the two cannot disagree with each other.
 * ------------------------------------------------------------------------- */
console.log('\nshipping policy figures');
{
  const policy = read('shipping-policy.html');
  // SHIPPING_RATES lives in api/_lib.js, an ESM module this CommonJS script
  // cannot require() — pulled out of the source text by id, the same way the
  // "all three shipping tables" check below reads it.
  const lib = read('api/_lib.js');
  const rate = id => {
    const m = lib.match(new RegExp(`\\{ id: '${id}', cost: ([0-9.]+), freeOver: (null|[0-9]+) \\}`));
    return m ? { cost: Number(m[1]), freeOver: m[2] === 'null' ? null : Number(m[2]) } : null;
  };
  const twoDayRate = rate('2day');
  const overnightRate = rate('overnight');
  const cartFree = constant('js/cart.js', 'FREE_SHIPPING_AT');

  const twoDay = policy.match(/FedEx 2-Day Express:<\/strong>\s*\$([0-9.]+), free on orders over \$([0-9]+)/);
  ok('the policy states the 2-Day rate SHIPPING_RATES actually charges',
    twoDay !== null && twoDayRate !== null && Number(twoDay[1]) === twoDayRate.cost,
    twoDay ? `policy says $${twoDay[1]}, SHIPPING_RATES says $${twoDayRate && twoDayRate.cost}` : 'rate not found in shipping-policy.html');
  ok('and the free-shipping threshold FREE_SHIPPING_AT actually enforces',
    twoDay !== null && Number(twoDay[2]) === cartFree,
    twoDay ? `policy says $${twoDay[2]}, FREE_SHIPPING_AT is $${cartFree}` : 'threshold not found');

  const overnight = policy.match(/FedEx Overnight:<\/strong>\s*\$([0-9.]+)/);
  ok('the policy states the Overnight rate SHIPPING_RATES actually charges',
    overnight !== null && overnightRate !== null && Number(overnight[1]) === overnightRate.cost,
    overnight ? `policy says $${overnight[1]}, SHIPPING_RATES says $${overnightRate && overnightRate.cost}` : 'rate not found');
  ok('and states Overnight as never free, which is what freeOver: null means',
    overnightRate !== null && overnightRate.freeOver === null && /Overnight.{0,80}not discounted/s.test(policy));

  // No source of truth to check the figure itself against, so this only
  // guards the two pages that state it from quietly disagreeing.
  const shipCoverage = read('shipping.html').match(/Covered to \$([0-9]+)/);
  const policyCoverage = policy.match(/covered up to \$([0-9]+)/);
  ok('the coverage figure matches the one on the shipping page',
    shipCoverage !== null && policyCoverage !== null && shipCoverage[1] === policyCoverage[1],
    `shipping.html says $${shipCoverage && shipCoverage[1]}, shipping-policy.html says $${policyCoverage && policyCoverage[1]}`);

  // The return policy is the one sentence in this file that cannot be
  // paraphrased: it is also terms.html's, word for word, and a policy page
  // that softens it while the contract still says it in full is worse than
  // not having a policy page at all. Compared with whitespace collapsed,
  // since the two pages wrap the sentence across markup differently.
  const norm = s => s.replace(/\s+/g, ' ');
  const returnLine = 'all sales are final once a vial has shipped or been opened';
  ok('the no-returns line matches the Terms & Conditions wording exactly',
    norm(read('terms.html')).includes(returnLine) && norm(policy).includes(returnLine));
}

/* ---------------------------------------------------------------------------
 * 3d. The batch analysis panel. This is the strongest claim surface on the
 *     site: it is laid out as a laboratory report, which tells a buyer that
 *     what they are reading is a record of the vial in front of them. A panel
 *     shaped like a certificate has to be held to a certificate's standard,
 *     so the checks below are about what it is structurally unable to say.
 *
 *     Two failures to prevent, both of which the layout invites. A results
 *     column is a set of blanks asking to be filled, and a plausible figure
 *     typed into one is indistinguishable from a measured one. And a header
 *     built for a laboratory's name and mark is an invitation to name a
 *     laboratory before one is confirmed, which is a claim about somebody
 *     else's business.
 * ------------------------------------------------------------------------- */
console.log('\nthe batch analysis panel');
{
  const pd = read('product.html');

  ok('the product page carries the panel', /id="pdEvidence"/.test(pd));

  // Every figure in the results column has to come from the catalog. Purity is
  // the only result held today, so this currently asserts that six of the seven
  // rows carry no figure at all: the day p.results holds a real released
  // report, those rows fill from it and this still holds.
  const invented = [];
  GLOW_PRODUCTS.forEach(prod => batchRows(prod).forEach(r => {
    const held = (prod.results || {})[r.name] ||
      (r.name === PURITY_ROW ? prod.purity : '');
    if (r.value !== (held || '')) invented.push(`${prod.name}/${r.name}: "${r.value}"`);
  }));
  ok('every figure in the results column is one the catalog holds',
    invented.length === 0, invented.join(', '));

  // And a row with no figure has to say so rather than render blank or borrow
  // the row above it. Every cell the panel prints is either a held figure or
  // the one string that points at the document, and nothing else.
  const strayCell = [];
  GLOW_PRODUCTS.forEach(prod => {
    const rows = batchRows(prod);
    const cells = [...batchPanelHtml(prod).matchAll(/class="ba-row-value[^"]*">([^<]*)</g)]
      .map(m => m[1]);
    if (cells.length !== rows.length) {
      strayCell.push(`${prod.name}: ${cells.length} cells for ${rows.length} rows`);
    }
    cells.forEach((cell, i) => {
      const want = rows[i] && (rows[i].value || RESULT_ON_COA);
      if (cell !== want) strayCell.push(`${prod.name}/${rows[i] && rows[i].name}: "${cell}"`);
    });
  });
  ok('a row with no figure points at the certificate, from the one string',
    strayCell.length === 0, strayCell.join(', '));

  // RESULT_ON_COA says the number is on the certificate, which is only true
  // while every row of the panel is a row that certificate reports.
  const offCert = ANALYSIS_TESTS.filter(t =>
    !ANALYSIS_LONG.toLowerCase().includes(t.short.toLowerCase()));
  ok('every analysis the panel points at the certificate for is one it reports',
    offCert.length === 0, offCert.map(t => t.name).join(', '));

  // The headline number is the compound's own purity and nothing else, the
  // same rule the hero average is held to: edit the catalog, not the page.
  const wrongPurity = GLOW_PRODUCTS.filter(prod =>
    !batchPanelHtml(prod).includes(`<span class="ba-figure-value">${prod.purity}</span>`));
  ok('the headline figure is the catalog purity for every compound',
    wrongPurity.length === 0, wrongPurity.map(prod => prod.name).join(', '));
  ok('a product with no purity yet shows the null indicator, not a number',
    batchPanelHtml({}).includes('<span class="ba-figure-value">—</span>'));

  // A named, accredited laboratory is a claim about a third party and a logo is
  // their property. Neither is confirmed, so the panel states what is true
  // without them, and this fails the day a name is typed in without a mark and
  // an accreditation confirmed alongside it.
  const lab = labIdentity();
  ok('the laboratory is named only when the catalog names it',
    (LAB.name && LAB.accreditation && LAB.logo) ||
    (!LAB.name && !LAB.logo && lab.name === 'Independent third-party laboratory'),
    'LAB must be wholly empty or wholly filled: a name needs its accreditation and mark with it');
  // While the lab is unnamed the fallback has to carry the two facts the name
  // would have carried: that it is not us, and that it gains nothing by the
  // number it returns. Once LAB is filled, the name and the accreditation
  // beside it say that themselves, and the check above already guarantees a
  // name never appears without both.
  ok('the header says who ran the analysis and what they gain by it',
    LAB.name
      ? Boolean(lab.accreditation)
      : /third-party/i.test(lab.name) && /no stake in the result/i.test(lab.accreditation));

  // The vial in every product photo carries Glow's own artwork; what actually
  // ships carries the manufacturer's generic label. A photo that doesn't
  // match what arrives is a claim PRINCIPLES.md rules out, so the caption
  // saying so has to actually reach the page, from the one string, not a
  // second copy of it that could drift from the first.
  ok('the product page carries the vial-art disclosure, from the one string',
    /id="pdRenderNote"/.test(pd) &&
    /VIAL_ART_NOTICE/.test(read('js/product.js')) &&
    /VIAL_ART_NOTICE/.test(read('tools/build-products.js')));

  // The Product schema uses about[0], the first paragraph of the compound's
  // description, not the catalog's summary blurb. It is a real per-compound
  // explanation of what the compound is and how it is studied, the full depth
  // that someone landing from a search engine deserves to see.
  ok('the Product schema uses the full description, not the summary',
    /description: p\.about\[0\]/.test(read('tools/build-products.js')));
  ok('the panel is rendered from the catalog, not from its own markup',
    /batchPanelHtml\(/.test(read('js/product.js')) &&
    /batchPanelHtml\(/.test(read('tools/build-products.js')),
    'js/product.js and tools/build-products.js must both render from batchPanelHtml()');

  // The served markup is what a crawler reads and what shows before scripts
  // run, so it has to be the same rows the code produces. Compared as
  // whitespace-normalised markup: the hand-written donor is indented
  // differently from the generated string, and only the content has to match.
  const norm = s => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  // product.html is the donor every generated page is cut from, so it cannot
  // regenerate itself the way peptides/<slug>/ does. Rather than leave that as
  // a step someone has to remember after flipping COAS_PUBLISHED or naming the
  // laboratory, the failure prints the markup to paste. Either stays a one-line
  // change plus a paste the build hands you, not a hunt.
  const baked = pd.match(/id="pdEvidence"[^>]*>([\s\S]*?)<\/section>/);
  ok('the served panel matches what the code renders',
    baked !== null && norm(baked[1]) === norm(batchPanelHtml({})),
    'product.html has drifted from batchPanelHtml(). Replace the contents of\n' +
    '          <section id="pdEvidence"> with:\n' + batchPanelHtml({}));

  // The panel names the analyses in short form. how-we-test.html names them
  // in a sentence. The short form must not name one the long one does not:
  // "LC-MS" is a different instrument from "HPLC, and separately mass
  // spectrometry", and a data cell is where that substitution goes unnoticed.
  ok('the process page states the analysis the panel summarises',
    read('how-we-test.html').includes(ANALYSIS_LONG),
    `how-we-test.html does not contain "${ANALYSIS_LONG}"`);
  const named = ANALYSIS_SHORT.split(/[+·,]/).map(s => s.trim().toLowerCase());
  const unbacked = named.filter(m => !ANALYSIS_LONG.toLowerCase().includes(m));
  ok('the panel names no analysis the laboratory does not run',
    unbacked.length === 0, `unbacked: ${unbacked.join(', ')}`);

  // The manufacturing claim is hedged everywhere it appears, deliberately. A
  // four-word data cell is exactly where that hedge gets dropped by accident.
  // Checked wherever the claim is actually made. It used to be pinned to
  // how-we-test.html because the chain's first step said it; that step is gone,
  // and the hedge now has to hold on every page that still states it rather
  // than on one named file.
  const sourcePages = pages.filter(f => /cGMP/i.test(read(f)));
  const unhedged = sourcePages.filter(f => !read(f).includes('cGMP-aligned quality practices'));
  ok(`the source claim keeps the cGMP-aligned hedge everywhere it is made (${sourcePages.length} pages)`,
    /cGMP-aligned quality practices/.test(SOURCE_LONG) && sourcePages.length > 0 && unhedged.length === 0,
    unhedged.length ? `unhedged on: ${unhedged.join(', ')}` : 'no page states the source claim at all');
  const overclaims = pages.filter(f =>
    /\bGMP[\s-]?(certified|approved|compliant)\b/i.test(read(f)));
  ok('no page upgrades that to a GMP certification', overclaims.length === 0,
    overclaims.join(', '));

  // The panel is laid out like a released report, so the one question it must
  // not leave hanging is how to get the actual document. While certificates are
  // held that answer is the footer note and nothing else, which makes it the
  // line most likely to be deleted for looking untidy under a tidy table.
  const foot = batchPanelHtml({});
  if (!COAS_PUBLISHED) {
    ok('the panel says how to actually get the certificate',
      /on request/i.test(foot) && /support@glowresearch\.shop/.test(foot));
    ok('and offers no link, because there is nothing to open',
      !COA_COPY.panelLink && !/class="gs-report"/.test(pd));
  }

  // Every meta cell has to carry a value. The strip filters rather than pads,
  // so a cell the catalog cannot fill is absent instead of showing a blank or
  // a dash where a lot number belongs.
  const blankMeta = GLOW_PRODUCTS.flatMap(prod =>
    batchMeta(prod).filter(m => !m.value).map(m => `${prod.name}/${m.label}`));
  ok('no meta cell is printed without a value', blankMeta.length === 0,
    blankMeta.join(', '));

  // The sticky buy bar restates the buy box on a phone, which makes it a
  // second place a price is printed and a second button that adds to the cart.
  // Both have to be restatements: a bar quoting a total the buy box is not, or
  // adding a line the buy box would not, is the same page disagreeing with
  // itself at the moment money is involved.
  const pj = read('js/product.js');
  ok('the product page carries the sticky buy bar',
    /id="pdSticky"/.test(pd) && /id="pdStickyAdd"/.test(pd));
  ok('the bar quotes the total renderPrice() just worked out, not its own',
    /renderSticky\(total\)/.test(pj) &&
    /function renderSticky\(total\)/.test(pj) &&
    !/function renderSticky\(\)/.test(pj),
    'renderSticky() must be handed renderPrice()\'s total rather than deriving one');
  ok('the bar adds through the one cart line the buy box builds',
    (pj.match(/GlowCart\.add\(/g) || []).length === 1 &&
    /const sticky = \$\('pdStickyAdd'\)/.test(pj) &&
    /sticky\.addEventListener\('click', \(\) => \{\s*addCurrent\(\);/.test(pj));
  // Out of stock has to reach both buttons from the same test, or the bar
  // stays sellable on a size the buy box has already closed. Checked as "one
  // renderStock() disables both" rather than against an exact expression, so
  // the loop can be rewritten without the guarantee quietly lapsing.
  const stockFn = pj.match(/function renderStock\(\)\s*\{[\s\S]*?\n  \}/);
  ok('stock closes the bar and the buy box together',
    stockFn !== null &&
    /sizeInStock\(size\(\)\)/.test(stockFn[0]) &&
    /pdAddBtn/.test(stockFn[0]) && /pdStickyAdd/.test(stockFn[0]) &&
    (stockFn[0].match(/\.disabled = /g) || []).length === 1,
    'renderStock() must disable both buttons off the one sizeInStock() test');

  // Sold out is set by hand, one `stock: false` in the catalog, off the back of
  // a text from the supplier. That single edit is the entire mechanism, so
  // every way to buy has to answer to it. A disabled Add to cart beside a live
  // wallet button is not a partial version of that: it is a one-tap purchase
  // of something we cannot ship, offered next to the control that just refused.
  ok('a sold-out size takes the wallet down with the Add buttons',
    stockFn !== null &&
    /pdExpress/.test(stockFn[0]) && /walletReady/.test(stockFn[0]),
    'renderStock() must hide the wallet block, and only one canMakePayment() revealed');
  // And the browser is not the thing enforcing it. priceOrder() is the one
  // chokepoint both create-payment-intent.js and create-order.js price through,
  // so refusing the line there covers the wallet sheet, the checkout page, and
  // a cart that sat in localStorage since before the flag went on.
  const lib = read('api/_lib.js');
  ok('the server refuses a sold-out line, whatever the browser sent',
    /sizeInStock/.test(lib) &&
    /if \(!sizeInStock\(size\)\) \{[\s\S]{0,120}?throw new Error/.test(lib),
    'priceOrder() must throw on an out-of-stock size');

  // One wallet implementation, in js/express-pay.js, used by the product buy
  // box and the top of checkout. A second copy of a flow that charges a card
  // and places an order is the last thing this codebase should carry, so
  // neither caller may build its own payment request.
  const ep = read('js/express-pay.js');
  const coJs2 = read('js/checkout.js');
  ok('there is one wallet implementation, and both callers use it',
    (ep.match(/\.paymentRequest\(\{/g) || []).length === 1 &&
    !/paymentRequest\(/.test(pj) && !/paymentRequest\(/.test(coJs2) &&
    /GlowExpressPay\.init\(/.test(pj) && /GlowExpressPay\.init\(/.test(coJs2),
    'js/express-pay.js owns the flow; product.js and checkout.js only configure it');
  // The product page's own order-placing code went with it. Anything left
  // would be a second route to create-order that nothing above enforces.
  ok('the product page places no order of its own',
    !/api\/create-order/.test(pj));

  // Not offered from the sticky bar, deliberately. It buys whatever the
  // stepper is set to, and the bar shows precisely when the stepper, the bulk
  // tier cards and the free-shipping progress are all off screen: a one-tap
  // buy there closes the order at a single vial with none of that visible, on
  // a catalog whose average order is two to three.
  ok('the sticky bar offers Add to cart and not the wallet',
    !/pdStickyExpress/.test(pd) && !/pdStickyExpress/.test(pj) &&
    /id="pdStickyAdd"/.test(pd));
  // With one control in the row there is nothing to shed, so the readout has
  // to be the thing that truncates rather than the button being pushed off the
  // edge by a long product name.
  ok('a long name truncates rather than crowding the bar\'s button',
    /\.pd-sticky-in\{[^}]*min-width:0/.test(pd) &&
    /\.pd-sticky-id\{[^}]*min-width:0/.test(pd) &&
    /\.pd-sticky-name\{[^}]*text-overflow:ellipsis/.test(pd) &&
    /\.pd-sticky-add\{[^}]*flex:0 0 auto/.test(pd));

  // A lot number is the one thing a reader can check against the vial in their
  // hand, which makes an invented one the worst thing this page could print.
  // Nothing holds lot codes today, so this currently forbids all of them: the
  // day the catalog carries real ones, they are the only ones allowed through.
  const held = new Set(GLOW_PRODUCTS.map(p => p.lot).filter(Boolean));
  const inventedLots = [];
  pages.forEach(f => {
    for (const m of read(f).matchAll(/\bGR-[A-Z0-9]{2,}-[\d-]{3,}\b/g)) {
      if (!held.has(m[0])) inventedLots.push(`${f}: ${m[0]}`);
    }
  });
  ok('no page prints a lot number the catalog does not hold', inventedLots.length === 0,
    inventedLots.join(', '));
}

/* ---------------------------------------------------------------------------
 * 3d-ii. How many tests, stated the same way everywhere.
 *
 *     This was three numbers that disagreed. how-we-test.html headlined "Eight
 *     checks", the homepage hero subheading said "7x Third Party Tested", and
 *     the certificate reports seven rows. Each was a word typed into a page, so
 *     nothing could notice, and the page a buyer reads to decide whether to
 *     trust us was the one overstating the count.
 *
 *     ANALYSIS_TESTS in js/products-data.js is the count now. Everything below
 *     pins a surface to it, so the number moves when the panel does.
 * ------------------------------------------------------------------------- */
console.log('\nhow many tests');
{
  ok(`the catalog holds the panel as rows, not a number (${TESTS_PER_BATCH})`,
    Array.isArray(ANALYSIS_TESTS) && TESTS_PER_BATCH === ANALYSIS_TESTS.length &&
    TESTS_PER_BATCH > 0);

  // Lot archival is on the certificate and named in ANALYSIS_LONG, but it is a
  // record rather than an analysis: no instrument runs and no result is
  // measured. Counting it is how the headline got to eight, and nothing stops a
  // future edit putting it back as a row except this.
  ok('lot archival is a record, not one of the tests',
    !ANALYSIS_TESTS.some(t => /archiv/i.test(t.name)) &&
    /lot archival/i.test(ANALYSIS_LONG),
    'archival belongs in ANALYSIS_LONG as a record, not in ANALYSIS_TESTS as a test');

  // Every row's short term has to be findable in the long sentence, the same
  // rule the panel summary is held to, so a row cannot name an analysis the
  // rest of the site does not claim.
  const rowUnbacked = ANALYSIS_TESTS.filter(t =>
    !ANALYSIS_LONG.toLowerCase().includes(t.short.toLowerCase()));
  ok('every test row is backed by the long form',
    rowUnbacked.length === 0, `unbacked: ${rowUnbacked.map(t => t.name).join(', ')}`);

  // A method is named only where we actually know one. An empty string is the
  // honest state for the rows where the certificate reports a result without
  // naming a technique; inventing one would be asserting a fact about someone
  // else's laboratory.
  const namedMethods = ANALYSIS_TESTS.filter(t => t.method);
  ok(`${namedMethods.length} of ${TESTS_PER_BATCH} rows name a method, and no row invents one`,
    ANALYSIS_TESTS.every(t => typeof t.method === 'string') &&
    namedMethods.every(t => ANALYSIS_LONG.toLowerCase().includes(t.short.toLowerCase())));

  // The page has to actually list them: named, in order, one numbered row each.
  const hw = read('how-we-test.html');
  const missingRow = ANALYSIS_TESTS.filter(t => !hw.includes(`<h3>${t.name}</h3>`));
  ok(`how-we-test.html lists all ${TESTS_PER_BATCH} by name`,
    missingRow.length === 0, `missing: ${missingRow.map(t => t.name).join(', ')}`);
  const numerals = (hw.match(/class="hw-num"[^>]*>\s*(\d\d)\s*</g) || [])
    .map(m => m.replace(/\D/g, '').slice(-2));
  const wantNumerals = ANALYSIS_TESTS.map((_, i) => String(i + 1).padStart(2, '0'));
  ok('the rows are numbered 01 upward with none skipped or repeated',
    numerals.join(',') === wantNumerals.join(','),
    `page has ${numerals.join(',') || '(none)'}, catalog wants ${wantNumerals.join(',')}`);

  // The count in words, wherever any page says it. Catches the headline, the
  // subhead under it, and anything written later that quietly disagrees.
  const word = numberWord(TESTS_PER_BATCH);
  const stripped = f => read(f)
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const countRe = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:separate\s+|independent\s+)?(?:tests|checks|analyses)\b/gi;
  const wrongWord = [];
  pages.forEach(f => {
    for (const m of stripped(f).matchAll(countRe)) {
      if (m[1].toLowerCase() !== word) wrongWord.push(`${f}: "${m[0].trim()}"`);
    }
  });
  ok(`every page that counts the panel in words says "${word}"`,
    wrongWord.length === 0, wrongWord.join('\n          '));

  // wholesale.html used to state this as a numeral in its own stat-figure
  // widget, a second string the general word-form scan above couldn't see.
  // That widget is gone; the claim now lives in the same word-form prose
  // ("seven independent tests") the scan above already covers, so there is
  // nothing left for a wholesale-specific check to pin.

  // The summary the evidence panel prints is generated from the rows, so it
  // cannot grow a term the certificate does not report. It carried "+ lot
  // archival" as an eighth entry until the rows existed to derive it from.
  ok('ANALYSIS_SHORT is derived from the rows, not typed beside them',
    /ANALYSIS_TESTS\.map\(t => t\.short\)\.join/.test(read('js/products-data.js')) &&
    ANALYSIS_SHORT.split('+').length === TESTS_PER_BATCH);

  // The homepage diagram. This is the section that replaced two invented
  // "medical advisors", so the bar it has to clear is the one they failed:
  // nothing in it may be a thing someone typed onto the page. Every node is a
  // row of ANALYSIS_TESTS, baked by tools/build-testing.js, and the served
  // markup is compared against the renderer rather than merely searched for
  // the names, so an edit made straight into index.html fails here.
  const home = read('index.html');
  ok('the homepage carries the testing diagram',
    home.includes('id="tdNodes"') && home.includes('id="testing"'));
  const missingNode = ANALYSIS_TESTS.filter(t =>
    !home.includes(`<h3 class="tv-label">${t.name}</h3>`));
  ok(`the diagram names all ${TESTS_PER_BATCH} analyses in the served markup`,
    missingNode.length === 0, `missing: ${missingNode.map(t => t.name).join(', ')}`);
  ok('the diagram is baked from the catalog, not typed into the page',
    home.includes(analysisDiagramHtml().trim()),
    'index.html and analysisDiagramHtml() disagree. Run node tools/build-testing.js');
  // The heading counts the panel as a numeral. The word-form scan above reads
  // "seven tests" and cannot see "7-Point Testing", so it gets its own check
  // rather than being the one claim on the page nothing is holding.
  ok(`the heading states the count as ${TESTS_PER_BATCH}`,
    home.includes(`<h2 id="tvHeading">${testingHeading()}</h2>`),
    `expected "${testingHeading()}". Run node tools/build-testing.js`);
  const headingNums = (home.match(/<h2 id="tvHeading">(\d+)/) || [])[1];
  ok('and states no other number there',
    headingNums === String(TESTS_PER_BATCH), `heading says ${headingNums}`);
  // The method line is the row's, or absent. A callout inventing a technique
  // for one of the four rows the certificate reports without naming one would
  // be the same fabrication in a smaller font.
  const noMethod = ANALYSIS_TESTS.filter(t => !t.method);
  ok('no callout names a method the catalog leaves blank',
    noMethod.every(t => {
      // Cut at the callout's own closing tag. A fixed character window ran
      // past it into the next callout, which does name one.
      const after = home.split(`<h3 class="tv-label">${t.name}</h3>`)[1] || '';
      return !after.split('</div>')[0].includes('class="tv-method"');
    }));
  ok('the diagram renders no person, credential or endorsement',
    !/tv-call[\s\S]*?(Ph\.D|M\.D\.|advisor|endorse)/i.test(
      home.split('id="tdNodes"')[1] || ''));

  // The vial footage. It is a real clip, not a photograph standing in for
  // one, and its label reads "10 MG • 99%" exactly as filmed — kept as shot,
  // not painted out or overlaid, despite the catalog holding GLP-3 (RT) at
  // 99.4%. That is a real, known disagreement between the footage and the
  // catalog that nothing here enforces or can enforce: the figure is pixels,
  // not text, and stays that way as long as the clip does. See the note on
  // the markup.
  const vialDir = path.join(ROOT, 'assets/vial');
  const vialFiles = fs.existsSync(vialDir) ? fs.readdirSync(vialDir) : [];
  ok('the vial clip (both formats) and its poster frame are present on disk and referenced',
    ['glow-vial-reveal.webm', 'glow-vial-reveal.mp4', 'glow-vial-reveal-poster.jpg'].every(n => {
      return vialFiles.includes(n) && home.includes(`assets/vial/${n}`);
    }));
  // No test name or method carries a purity figure of its own — a fabricated
  // percentage attached to "Purity" or "Endotoxin" would be a second, worse
  // problem stacked on the one already noted above.
  ok('no test name or method states a purity figure of its own',
    !/tv-(label|method|head)[^>]*>[^<]*\d+(\.\d+)?\s*%/i.test(home));
}

/* ---------------------------------------------------------------------------
 * 3e. Listing copy. Everything the catalog says about a compound has to
 *     describe the molecule and the laboratory work, never a result someone
 *     might get from it. The rule was written at the head of products-data.js
 *     and enforced by nobody, which is the exact shape of failure this file
 *     exists for: BPC-157's blurb said "used in laboratory work examining
 *     tissue repair", and no amount of "used in laboratory work examining"
 *     around a benefit makes it stop being a benefit.
 *
 *     Name the mechanism, never the outcome. A pathway, a receptor, a binding
 *     behaviour or an assay is a thing a laboratory measures. Healing,
 *     recovery, improvement, treatment and prevention are things a product is
 *     being sold to deliver, and this catalog has an Add to cart button
 *     beside every one of these sentences.
 * ------------------------------------------------------------------------- */
console.log('\nlisting copy');
{
  const OUTCOME = new RegExp([
    'heal(s|ing|ed)?', 'repair(s|ing|ed)?', 'recover(y|s|ed|ing)?',
    'treat(s|ing|ment|ments)?', 'cur(e|es|ing)', 'prevent(s|ing|ion|ative)?',
    'therap(y|ies|eutic)', 'remed(y|ies)', 'weight loss', 'fat loss',
    'muscle (growth|gain|mass)', 'anti[- ]?aging', 'rejuvenat\\w*',
    'boost(s|ing|ed)?', 'enhanc\\w*', 'improv\\w*', 'restor\\w*', 'revers\\w*',
    'relief', 'benefit(s|ial)?', 'efficacy', 'effective',
    'dos(e|es|age|ing)', 'mg/kg', 'patient(s)?', 'side[- ]effect(s)?',
  ].map(w => `\\b${w}\\b`).join('|'), 'gi');

  // The blurb is the line under the product name in the buy box and the
  // `description` in every generated page's Product schema, so it is read by a
  // buyer at the moment of deciding and by Google. about[] and research[] are
  // clean today; checking them too is free and keeps them that way.
  const bad = [];
  GLOW_PRODUCTS.forEach(p => {
    const fields = { blurb: p.blurb };
    (p.about || []).forEach((t, i) => { fields[`about[${i}]`] = t; });
    (p.research || []).forEach((a, i) => { fields[`research[${i}]`] = `${a.t} ${a.d}`; });
    Object.entries(fields).forEach(([k, v]) => {
      const hits = [...new Set((v.match(OUTCOME) || []).map(h => h.toLowerCase()))];
      if (hits.length) bad.push(`${p.name}.${k}: "${hits.join('", "')}"`);
    });
  });
  ok('no listing copy names an outcome instead of a mechanism',
    bad.length === 0, bad.join('\n          '));

  // `blurb` is the mechanism-only summary read on the product page (#pdDesc)
  // above the fold, so it is length-capped to stay a summary: a blurb that
  // spirals to four sentences stops being one and starts being a description
  // that happened to not drift from about[0].
  const BLURB_MAX = 130;
  const long = GLOW_PRODUCTS.filter(p => p.blurb.length > BLURB_MAX);
  ok(`every blurb stays within the summary budget (${BLURB_MAX} chars)`, long.length === 0,
    long.map(p => `${p.name} is ${p.blurb.length}`).join(', '));

  // Two sentences: what it is, how it is studied. A blurb that stops after the
  // first has told a buyer nothing about why we stock it.
  const oneLiner = GLOW_PRODUCTS.filter(p => (p.blurb.match(/\.\s|\.$/g) || []).length < 2);
  ok('every blurb says both what it is and how it is studied',
    oneLiner.length === 0, oneLiner.map(p => p.name).join(', '));

  // The product page shows p.blurb verbatim in #pdDesc rather than a written
  // copy of it, so a future rewrite of the sentence cannot land in the catalog
  // without also landing on the page.
  const pdBlurb = read('product.html');
  ok('the product page reads the blurb from the catalog, not a copy of it',
    /id="pdDesc"/.test(pdBlurb) && /p\.blurb/.test(read('js/product.js')) &&
    /p\.blurb/.test(read('tools/build-products.js')));

  // The same rule applies to the taxonomy, and it is easier to break there:
  // "Recovery Peptide" sat directly above the product name for a year and read
  // as a category rather than as the promise it was. A category may name a
  // research domain (Metabolic, Cognitive, Tissue) or a pharmacological class
  // (Growth Hormone Secretagogue). It may not name what the buyer gets.
  const labels = new Set(GLOW_PRODUCTS.flatMap(p => [p.tag, p.cat])
    .concat(Object.values(CAT_LABEL)));
  const claimy = [...labels].filter(l => OUTCOME.test(l) && (OUTCOME.lastIndex = 0) === 0);
  ok('no category or tag names an outcome', claimy.length === 0, claimy.join(', '));

  // `cat` is a slug the code filters on. CAT_LABEL is where it becomes English:
  // the product breadcrumb, the generated pages' Product schema, and the
  // category headings in llms.txt.
  //
  // This used to compare two hand-kept copies of that map against each other,
  // in js/product.js and tools/build-products.js. It never looked at the third,
  // in tools/build-llms.js, so when the catalog gained four categories and two
  // of the three copies were updated, llms.txt shipped four headings reading
  // "### undefined" and every check here passed. A missing label does not
  // throw, it renders the word undefined.
  //
  // There is one map now, in js/products-data.js, and these are its checks:
  // that it covers the catalog, that no file has quietly started a fourth
  // copy, and that nothing generated says undefined whatever the cause.
  const unlabelled = [...new Set(GLOW_PRODUCTS.map(p => p.cat))].filter(c => !CAT_LABEL[c]);
  ok('every category in the catalog has a label', unlabelled.length === 0,
    unlabelled.join(', '));

  const dupes = ['js/product.js', 'tools/build-products.js', 'tools/build-llms.js']
    .filter(f => /const CAT_LABEL\s*=\s*\{/.test(read(f)));
  ok('nothing keeps a second copy of the label map', dupes.length === 0, dupes.join(', '));

  ok('llms.txt has no undefined headings', !/undefined/.test(read('llms.txt')));
}

/* ---------------------------------------------------------------------------
 * 3f. Disclosures. The process, About, Shipping and Wholesale pages moved
 *     their long copy behind "read details" so a phone gets a scannable page.
 *     The copy was collapsed, not deleted, and the difference between those
 *     two is the entire compliance and SEO argument for doing it this way.
 *
 *     Native <details> keeps the text in the served markup, so a crawler and a
 *     reader with no JavaScript both still get it. The day someone "optimises"
 *     this by fetching panel content on click, the RUO disclaimer, the final
 *     sale term and the testing description quietly stop being on the page at
 *     all. That is what this checks.
 * ------------------------------------------------------------------------- */
console.log('\ndisclosures');
{
  const discPages = ['about.html', 'shipping.html', 'wholesale.html'];
  const empty = [];
  const noSummary = [];
  let total = 0;
  discPages.forEach(f => {
    const src = read(f);
    for (const m of src.matchAll(/<details class="disc">([\s\S]*?)<\/details>/g)) {
      total++;
      const inner = m[1];
      if (!/<summary>/.test(inner)) noSummary.push(f);
      // The body has to carry real prose in the HTML itself, not an empty node
      // waiting for a script to fill it.
      const body = (inner.match(/<div class="disc-body">([\s\S]*?)<\/div>/) || [, ''])[1];
      if (body.replace(/<[^>]+>/g, '').trim().length < 40) empty.push(f);
    }
  });
  ok(`every disclosure ships its copy in the markup (${total} of them)`,
    empty.length === 0, `script-filled or empty in: ${[...new Set(empty)].join(', ')}`);
  ok('every disclosure has a summary to operate it',
    noSummary.length === 0, [...new Set(noSummary)].join(', '));

  // The six-step chain of custody these checks guarded is gone from
  // how-we-test.html: that page is only about the testing now, and a supply
  // chain is not a testing method. What guarded it went with it rather than
  // being left to pass vacuously on a page with no steps to count.
}

/* ---------------------------------------------------------------------------
 * 4. Certificates. Every batch is third-party tested either way — that claim
 *    stays. What COAS_PUBLISHED gates is whether we say the document is a
 *    click away. While it is false, nothing may imply a hosted certificate.
 * ------------------------------------------------------------------------- */
console.log('\ncertificate evidence');
if (!COAS_PUBLISHED) {
  const promises = /(view|download|linked?|links? (to|directly)|see) (the )?(lot[- ])?(certificate|COA)|COA (is )?linked|lot-matched COA/i;
  const bad = pages.filter(f => promises.test(read(f)));
  ok('no page promises a certificate the site cannot serve', bad.length === 0, bad.join(', '));
  ok('COA_URL is empty while certificates are held',
    !/const COA_URL\s*=\s*'[^']+'/.test(read('js/products-data.js')));

  // The certificate index draws its cards from the catalog rather than from
  // markup, so the scan above — which reads .html files — cannot see what its
  // buttons say. Checked against the rendered card instead: that is
  // branch-aware, where a text scan of a source file holding both wordings
  // would flag the published branch that is not running.
  //
  // The button's own label is excluded from this scan on purpose. It always
  // reads "View certificate" now, whether or not coaHref() resolves one,
  // because it always opens the same modal (js/coa.js) and that modal is the
  // honest surface, not the label: the embedded PDF when one exists, the
  // email route when it does not. A label describing where a button leads is
  // not itself a claim that a document is there — what would be is anything
  // outside the button asserting one, which the scan below still covers.
  const renderedCards = GLOW_PRODUCTS.map(coaCardHtml).join('');
  const cardsOutsideButton = renderedCards
    .replace(/<button[^>]*data-coa-view[^>]*>[\s\S]*?<\/button>/g, '');
  ok('no certificate card claims a document outside its View button',
    !promises.test(cardsOutsideButton),
    'a card on coa.html promises a certificate while COAS_PUBLISHED is false');
  ok('and no card flags a PDF it does not have',
    !/coa-card-flag/.test(renderedCards));
  ok('the certificate modal keeps the honest request route, not a promised document',
    /coa-modal-request/.test(read('js/coa.js')) && /COA_COPY\.boxTitle/.test(read('js/coa.js')),
    'js/coa.js must still branch on coaHref() now that the button label no longer signals it');
  ok('coaHref() returns nothing while the flag is false, whatever the catalog holds',
    coaHref({ coa: 'https://example.com/staged.pdf' }) === '',
    'a per-product coa staged before the flip must not go live on its own');
} else {
  ok('COA_URL is set now that certificates are published',
    /const COA_URL\s*=\s*'[^']+'/.test(read('js/products-data.js')));
}

/* Duplicate element ids. Invalid HTML on its own, but the reason it is
   checked is what it hides: coa.html carried a hand-written .cart-drawer,
   .search-modal and .qa-sheet left over from when it was a stub, each
   duplicating an id that js/cart.js and js/search.js also create at runtime.
   The live code scopes its lookups to its own overlay so nothing broke, and
   the dead markup sat invisible on a dark page for months. Giving the page a
   white background made it visible: three unstyled blocks below the footer,
   in normal flow, doubling the document width on a phone.

   A duplicate id is the cheapest signal that a page is carrying two copies of
   something that should exist once. Scanning markup only, which is the right
   scope: ids that JS injects are not in the file. */
{
  const dupes = [];
  pages.forEach(f => {
    const ids = [...read(f).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const seen = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
    if (seen.length) dupes.push(`${f}: ${seen.join(', ')}`);
  });
  ok('no page declares the same id twice', dupes.length === 0, dupes.join(' | '));
}

/* The certificate index. Its whole claim is completeness: a page that lists
   certificates is read as the set of compounds whose paperwork exists, so a
   catalog entry missing from it is a product the site quietly cannot account
   for. Rendering from GLOW_PRODUCTS is what makes that true, and this is what
   keeps it rendering from GLOW_PRODUCTS. */
{
  const coaJs = read('js/coa.js');
  const coaHtml = read('coa.html');
  ok('the certificate index renders every compound in the catalog',
    /GLOW_PRODUCTS\.map\(coaCardHtml\)/.test(coaJs),
    'coa.js must render the catalog itself, not a list kept beside it');
  ok('coa.html carries the search box and the grid it fills',
    /id="coaSearch"/.test(coaHtml) && /id="coaGrid"/.test(coaHtml) &&
    /coa\.js/.test(coaHtml));
  // Lot numbers are searchable only once the catalog holds any; promising
  // them over a catalog with none is a search that silently never matches.
  ok('the search box names lot numbers only when lots exist to match',
    /GLOW_PRODUCTS\.some\(p => p\.lot\)/.test(coaJs));
  // One resolver for "is there a document", so the index, the product page's
  // COA box and its analysis panel cannot disagree about whether one exists.
  // Matched on the assignment rather than the bare name, so a mention of
  // coaHref() in a comment does not read as a call site.
  ok('every certificate surface resolves the document through coaHref()',
    (read('js/product.js').match(/const href = coaHref\(p\);/g) || []).length === 2 &&
    /coaHref\(/.test(coaJs) &&
    !/p\.coa \|\| \(typeof COA_URL/.test(read('js/product.js')),
    'product.js must ask coaHref() rather than retyping the p.coa || COA_URL test');
}

// how-we-test.html's certificate section states the current route by hand
// (there is no template step for prose sections on this page), so it is
// pinned here the same way the about.html Testing row is pinned above.
ok(`how-we-test.html's certificate section states the current route ("${COA_COPY.short}")`,
  read('how-we-test.html').includes(COA_COPY.short),
  `COAS_PUBLISHED changed without updating the "hw-coa-note" span in how-we-test.html`);

/* ---------------------------------------------------------------------------
 * 4c. House style: no em dashes in customer-facing copy. They are a house
 *     preference, and once a page is written they are easy to reintroduce
 *     without noticing, so the rule is enforced rather than remembered.
 *
 *     A bare em dash standing alone in an element is exempt: that is the null
 *     indicator on the account and thank-you pages ("no value yet"), not prose.
 * ------------------------------------------------------------------------- */
console.log('\nhouse style');
{
  const strip = s => s
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    // the null-value glyph: >—< or >&mdash;< with nothing else inside
    .replace(/>\s*(—|&mdash;)\s*</g, '><');

  const bad = pages.filter(f => /—|&mdash;/.test(strip(read(f))));
  ok('no em dashes in page copy', bad.length === 0, bad.join(', '));

  // scripts that render copy: comments are a different register and are exempt
  const jsCopy = ['js/account.js', 'js/age-gate.js', 'js/cart.js', 'js/cart-modal.js',
                  'js/checkout.js', 'js/product.js', 'js/products-data.js',
                  'js/script.js', 'js/search.js', 'js/thank-you.js'];
  const badJs = jsCopy.filter(f => {
    const body = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s+\/\/\s.*$/gm, '')
      .replace(/\|\|\s*'—'/g, '');   // the same null indicator, in JS
    return /—|&mdash;/.test(body);
  });
  ok('no em dashes in rendered strings', badJs.length === 0, badJs.join(', '));

  ok('no em dashes in PRINCIPLES.md', !/—/.test(read('PRINCIPLES.md')));
}

/* ---------------------------------------------------------------------------
 * 5. Structured data. Inventing reviews or ratings is the fastest way to a
 *    manual action, and it is the exact thing PRINCIPLES.md forbids.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * 7b. Section 7b used to be the opposite check: the About page had to name the
 *     town and the state in its visible copy, because the page ranked on it
 *     and an edit had once dropped "California" from the body while every
 *     <head> tag still carried it.
 *
 *     Where the company is is no longer published at all. That check would now
 *     fail by design, so it is gone, and its inverse lives with the entity and
 *     address section below, which is the one place enforcing what the site
 *     does not say about itself.
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * 7c. The homepage FAQ. It is generated from FAQS by tools/build-faq.js into
 *     both the markup and a FAQPage block, which means two copies of every
 *     answer in a file nobody rebuilds by habit. Same contract as the evidence
 *     panel: the served page has to equal what the code renders, and when it
 *     does not, this prints the markup to paste.
 *
 *     The FAQ is also where the verification trail is explained end to end, so
 *     it is the densest concentration of checkable claims on the site and the
 *     easiest place for one to go stale. The second block below holds those
 *     answers to the same data every other surface reads.
 * ------------------------------------------------------------------------- */
console.log('\nhomepage FAQ');
{
  const home = read('index.html');

  // The reason this was moved out of js/script.js in the first place.
  const listed = (home.match(/class="faq-q"/g) || []).length;
  ok(`all ${FAQS.length} answers are in the served HTML, not injected on load`,
    listed === FAQS.length, `found ${listed} in the markup`);
  ok('js/script.js binds the accordion rather than building it',
    !/faqList\.appendChild/.test(read('js/script.js')));

  const served = (home.match(/<div class="faq-list" id="faqList">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/) || [, ''])[1];
  ok('the served FAQ matches what faqHtml() renders',
    served.trim() === faqHtml().trim(),
    'run `node tools/build-faq.js`');

  // The schema is what an answer engine reads; it must not describe a
  // different FAQ from the one on the page.
  let schema = null;
  try {
    schema = JSON.parse((home.match(/<script type="application\/ld\+json" id="faq-jsonld">([\s\S]*?)<\/script>/) || [, 'null'])[1]);
  } catch (e) { /* left null, reported below */ }
  ok('the page carries FAQPage structured data',
    schema && schema['@type'] === 'FAQPage' && Array.isArray(schema.mainEntity));
  if (schema && Array.isArray(schema.mainEntity)) {
    const mismatched = FAQS.filter((f, i) => {
      const e = schema.mainEntity[i];
      return !e || e.name !== f.q || e.acceptedAnswer.text !== f.a;
    });
    ok('every question and answer in the schema matches the catalog',
      schema.mainEntity.length === FAQS.length && mismatched.length === 0,
      `run \`node tools/build-faq.js\`${mismatched.length ? `; drifted: ${mismatched.map(f => f.q).join(' | ')}` : ''}`);
  }

  // Having the copy in the markup is not the same as a person being able to
  // read it: .faq-a is collapsed to max-height 0, so without the no-JS opt-out
  // a reader with scripting off gets five questions and no answers.
  ok('the answers are readable with no JavaScript',
    /html:not\(\.js\) \.faq-a\{[^}]*max-height:\s*none/.test(read('css/style.css')));

  // The COA answer keys off COAS_PUBLISHED like every other certificate
  // surface, so a flag flip without a rebuild leaves the FAQ contradicting the
  // cart and the product page.
  ok('the certificate answer is the current COA_COPY state',
    served.includes(COA_COPY.faq.replace(/&/g, '&amp;')) || served.includes(COA_COPY.faq),
    'COAS_PUBLISHED changed without running `node tools/build-faq.js`');
}

console.log('\nwhat the FAQ is allowed to say about testing');
{
  const answers = FAQS.map(f => f.a).join('\n');
  const questions = FAQS.map(f => f.q).join('\n');

  // The answer that explains the analysis is built from ANALYSIS_LONG, so it
  // cannot describe an instrument the evidence panel and how-we-test.html do not.
  // It has to lead with it, not merely contain it somewhere: a later answer
  // quotes the same constant, and matching anywhere in the FAQ would let this
  // one be retyped while the check still passed on the other one's copy.
  ok('the FAQ explains the analysis in the catalog’s own words',
    FAQS.some(f => f.a.startsWith(ANALYSIS_LONG)),
    `no answer opens with "${ANALYSIS_LONG}"`);

  // And no answer may name an instrument ANALYSIS_LONG does not. "LC-MS" reads
  // like shorthand for the same two runs and is a different measurement; the
  // rest are analyses a peptide COA can carry that these lots are not given.
  const methods = ['hplc', 'uplc', 'lc-ms', 'gc-ms', 'nmr', 'mass spectrometry',
    'lal', 'karl fischer', 'amino acid analysis', 'elemental analysis'];
  const backing = `${ANALYSIS_SHORT} ${ANALYSIS_LONG}`.toLowerCase();
  const invented = methods.filter(m =>
    answers.toLowerCase().includes(m) && !backing.includes(m));
  ok('the FAQ names no analysis the laboratory does not run',
    invented.length === 0, `unbacked: ${invented.join(', ')}`);

  // The denial and the claim are two halves of one statement. If a test moves
  // from "not run" to "run", ANALYSIS_LONG grows and this fails until the array
  // is updated, which is the only way "we do not test for X" stops being said
  // on the same page that says we do.
  const contradicted = ANALYSIS_NOT_RUN.filter(t =>
    `${ANALYSIS_SHORT} ${ANALYSIS_LONG}`.toLowerCase().includes(t.toLowerCase()));
  ok('nothing is listed as both run and not run',
    contradicted.length === 0,
    `${contradicted.join(', ')} appears in what we say is tested. ` +
    'Remove it from ANALYSIS_NOT_RUN in js/products-data.js.');

  // Named somewhere in the FAQ, question or answer: the merged testing question
  // states the gap in its answer rather than its own title now, so this checks
  // the whole entry rather than just the question text. What matters is that
  // it is said by name, not which field says it.
  const wholeFaq = FAQS.map(f => `${f.q} ${f.a}`).join('\n').toLowerCase();
  const unnamed = ANALYSIS_NOT_RUN.filter(t => !wholeFaq.includes(t.toLowerCase()));
  ok('every test we skip is named, not left to be inferred',
    unnamed.length === 0, `not mentioned anywhere in the FAQ: ${unnamed.join(', ')}`);

  // The sentence explaining that an endotoxin pass does not cover sterility is
  // only true to write while endotoxin is something we actually run and
  // sterility is something we do not. If either half of that flips, the
  // sentence needs rewriting, not just deleting.
  const pairing = /screens? negative for endotoxin has not been screened for sterility/i;
  if (pairing.test(answers)) {
    ok('the endotoxin/sterility distinction still describes what is actually run',
      !ANALYSIS_NOT_RUN.includes('endotoxin') && ANALYSIS_NOT_RUN.includes('sterility'),
      'endotoxin and sterility have to be on opposite sides of ANALYSIS_NOT_RUN for this sentence to be true');
  }

  // No page may claim, in its own voice, to run a test this array says is not
  // run. Built from ANALYSIS_NOT_RUN rather than a fixed word list, so a test
  // moving in or out of that array changes what this forbids without a second
  // edit here. Explaining what an endotoxin line means on someone else's
  // certificate is fine; "we test for" is not — and neither is
  // the FAQ itself explaining that we do not, which is exactly the sentence
  // this pattern would otherwise flag, so a match containing "not" is read as
  // the honest denial it is rather than the claim this check exists to catch.
  // An empty array has to short-circuit. join('|') on [] is '', which turns the
  // alternation into `(?:)` — a group matching the empty string — so the
  // pattern degrades to "any sentence containing we/glow and a testing verb"
  // and flags all eighteen pages. That is the check inverting itself the moment
  // it has nothing to look for, which is precisely when it should be silent.
  const claiming = ANALYSIS_NOT_RUN.length === 0 ? [] : (() => {
    const claims = new RegExp(
      `\\b(?:we|glow)\\b[^.]{0,80}?\\b(?:tests?|tested|testing|screens?|screened|assays?|assayed)\\b[^.]{0,80}?\\b(?:${ANALYSIS_NOT_RUN.join('|')})`,
      'gi');
    return pages.filter(f => {
      const matches = read(f).match(claims) || [];
      return matches.some(m => !/\bnot\b/i.test(m));
    });
  })();
  ok(ANALYSIS_NOT_RUN.length === 0
      ? 'no page claims a test that is not run (nothing is excluded)'
      : 'no page claims a test that is not run',
    claiming.length === 0, claiming.join(', '));

  // The correction that matters most on an RUO catalog: a figure quoted in an
  // FAQ is read as a standard every lot meets, not as one lot's measurement.
  // "Research grade means 98%+" and "endotoxin below 0.25 EU/mL" are promises
  // about material nobody has run yet. The certificate carries the numbers and
  // the FAQ says where to find it. Purity in this catalog is still placeholder
  // besides, so an FAQ quoting one would be quoting a stand-in.
  const withPct = FAQS.filter(f => /\d\s*%/.test(f.a));
  ok('no answer states a purity figure', withPct.length === 0,
    withPct.map(f => f.q).join(' | '));
  const withUnits = FAQS.filter(f => /\bEU\s*\/\s*m[lg]\b/i.test(f.a));
  ok('no answer states an endotoxin limit', withUnits.length === 0,
    withUnits.map(f => f.q).join(' | '));
}

/* ---------------------------------------------------------------------------
 * 7c-ii. COA_COPY has two branches and one is always unreachable. A key added
 *        to the published half and forgotten on the held half reads as
 *        "undefined" on the day the flag flips, which is the worst possible
 *        day to find out. Both halves are parsed out of the source and held to
 *        the same key set, and every COA_COPY.<key> the codebase reads has to
 *        be in it.
 * ------------------------------------------------------------------------- */
console.log('\ncertificate copy');
{
  const src = read('js/products-data.js');
  const block = src.match(/const COA_COPY = COAS_PUBLISHED \? \{([\s\S]*?)\n\} : \{([\s\S]*?)\n\};/);
  ok('both branches of COA_COPY are readable', block !== null,
    'the declaration in js/products-data.js no longer matches the pattern in this check');

  if (block) {
    const keys = s => (s.match(/^\s{2}(\w+):/gm) || []).map(k => k.trim().replace(':', ''));
    const published = keys(block[1]);
    const held = keys(block[2]);

    const onlyPublished = published.filter(k => !held.includes(k));
    const onlyHeld = held.filter(k => !published.includes(k));
    ok('the two branches define the same keys',
      onlyPublished.length === 0 && onlyHeld.length === 0,
      [onlyPublished.length && `only in the published branch: ${onlyPublished.join(', ')}`,
       onlyHeld.length && `only in the held branch: ${onlyHeld.join(', ')}`]
        .filter(Boolean).join('; '));

    const wanted = [...new Set(
      pages.concat(['js/products-data.js', 'js/script.js', 'js/product.js', 'js/cart.js',
                    'js/account.js', 'tools/build-llms.js'])
        .flatMap(f => (read(f).match(/COA_COPY\.(\w+)/g) || []))
        .map(m => m.split('.')[1])
    )];
    const missing = wanted.filter(k => !published.includes(k) || !held.includes(k));
    ok(`all ${wanted.length} keys the site reads exist in both branches`,
      missing.length === 0, `undefined in one or both branches: ${missing.join(', ')}`);
  }
}

/* ---------------------------------------------------------------------------
 * 7d. Machine-readable coverage. Three of these pages carried no structured
 *     data at all and the catalog page named none of the nine compounds in its
 *     served HTML: the grid was drawn into an empty <div> on load, so the page
 *     whose whole job is to list what Glow sells listed nothing to anyone who
 *     did not run JavaScript.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * 7e. One title and one description per page. Each was typed out four to six
 *     times: <title> and og:title; meta description, og:description,
 *     twitter:description, and on six pages a `description` in the structured
 *     data too. Nothing compared them, and they had already stopped agreeing.
 *     tools/page-meta.js holds the strings and tools/build-meta.js writes every
 *     copy; this fails the build when a copy no longer matches the source.
 * ------------------------------------------------------------------------- */
console.log('\npage metadata');
{
  const { PAGE_META } = require(path.join(ROOT, 'tools/page-meta.js'));
  const attr = t => String(t).replace(/"/g, '&quot;');
  const grab = (h, re) => { const m = h.match(re); return m && m[1] !== undefined ? m[1] : null; };

  const drift = [];
  Object.entries(PAGE_META).forEach(([file, meta]) => {
    const h = read(file);
    const want = {
      '<title>': [grab(h, /<title>([\s\S]*?)<\/title>/), meta.title],
      'description': [grab(h, /<meta name="description"\s+content="([^"]*)"/), attr(meta.desc)],
      'og:title': [grab(h, /<meta property="og:title"\s+content="([^"]*)"/), attr(meta.name)],
      'og:description': [grab(h, /<meta property="og:description"\s+content="([^"]*)"/), attr(meta.desc)],
      'twitter:title': [grab(h, /<meta name="twitter:title"\s+content="([^"]*)"/), attr(meta.name)],
      'twitter:description': [grab(h, /<meta name="twitter:description"\s+content="([^"]*)"/), attr(meta.desc)],
    };
    Object.entries(want).forEach(([label, [got, expected]]) => {
      if (got !== expected) drift.push(`${file} ${label}`);
    });

    // og:url is the canonical, not a second URL to maintain.
    const canon = grab(h, /<link rel="canonical" href="([^"]*)"/);
    const ogUrl = grab(h, /<meta property="og:url"\s+content="([^"]*)"/);
    if (canon && ogUrl !== canon) drift.push(`${file} og:url != canonical`);

    // Structured data the page owns has to describe the same page.
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let d; try { d = JSON.parse(m[1]); } catch (e) { continue; }
      if (!/^(WebPage|CollectionPage|ContactPage|AboutPage)$/.test(d['@type'])) continue;
      const plain = t => String(t).replace(/&amp;/g, '&');
      if (d.name !== plain(meta.name)) drift.push(`${file} schema name`);
      if (d.description !== plain(meta.desc)) drift.push(`${file} schema description`);
    }
  });
  ok(`every copy of a title and description matches page-meta.js (${Object.keys(PAGE_META).length} pages)`,
    drift.length === 0, `${drift.join(', ')}\n          run \`node tools/build-meta.js\``);

  // A generator writing its own copy of a page description is the drift this
  // section exists to stop, so the catalog build reads the same file.
  ok('the catalog schema reads its description from page-meta.js',
    /PAGE_META\[PAGE\]\.desc/.test(read('tools/build-catalog.js')));

  // Search results truncate past roughly 160 characters, and a description
  // that gets cut mid-sentence is a description nobody finished writing.
  const longDesc = Object.entries(PAGE_META).filter(([, m]) => m.desc.length > 185);
  ok('no description runs past what a search result will show',
    longDesc.length === 0,
    longDesc.map(([f, m]) => `${f} is ${m.desc.length}`).join(', '));

  // Every indexable page should have an entry: a page added without one keeps
  // whatever was typed into it and is never checked again.
  const indexable = pages.filter(f => !f.includes('/') &&
    !/<meta name="robots"[^>]*noindex/.test(read(f)));
  const unlisted = indexable.filter(f => !PAGE_META[f]);
  ok('every indexable page is listed in page-meta.js', unlisted.length === 0,
    unlisted.join(', '));
}

console.log('\ncrawlable content');
{
  // Text a crawler receives, with script and style stripped out.
  const textOf = f => read(f)
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const pep = textOf('peptides.html');
  const missing = GLOW_PRODUCTS.filter(p => !pep.includes(p.name));
  ok('the catalog page names every compound in its served HTML',
    missing.length === 0, `${missing.map(p => p.name).join(', ')} — run \`node tools/build-catalog.js\``);

  const served = (read('peptides.html')
    .match(/<div class="product-grid" id="productGrid">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/) || [, ''])[1];
  const expected = GLOW_PRODUCTS.map((p, i) => productCardHtml(p, i)).join('');
  ok('the served grid matches what productCardHtml() renders',
    served.trim() === expected.trim(), 'run `node tools/build-catalog.js`');
  ok('the grid is one renderer, not two',
    /productCardHtml\(p, i\)/.test(read('js/products-data.js')));

  // Every page worth landing on from a search result should say what it is,
  // and the list is page-meta.js rather than a second list kept alongside it.
  const { PAGE_META: META } = require(path.join(ROOT, 'tools/page-meta.js'));
  const bare = Object.keys(META).filter(f => !read(f).includes('application/ld+json'));
  ok('every indexable page carries structured data', bare.length === 0, bare.join(', '));

  // Invalid JSON-LD is worse than none: it is silently dropped.
  const broken = [];
  pages.forEach(f => {
    for (const m of read(f).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { broken.push(`${f}: ${e.message}`); }
    }
  });
  ok('every JSON-LD block parses', broken.length === 0, broken.join('\n          '));

  // The ItemList that mirrored those six steps went with them. how-we-test.html
  // carries a WebPage and a BreadcrumbList now, and the loop above still parses
  // both.

  // Every build script inserts generated copy into a page with String.replace.
  // A replacement *string* reads "$1" as a backreference, and every price the
  // site prints starts with a dollar: fmtPrice() emits "$116.10". That shipped
  // a catalog card reading `<div class="product-grid" id="productGrid">29` and
  // a generated GLP3-RT page reading `id="pdPrice">16.10`. Replacer functions
  // only, in every tool, forever.
  const unsafe = fs.readdirSync(path.join(ROOT, 'tools'))
    .filter(f => f.endsWith('.js'))
    .filter(f => /\.replace\([^,]*,\s*`?\$[12]/.test(read(`tools/${f}`)));
  ok('no build script inserts copy with a $1 replacement string',
    unsafe.length === 0, unsafe.join(', '));

  // The bug above was invisible until a price happened to start with $1, so
  // this runs the real renderer over a value that does.
  const priced = GLOW_PRODUCTS.find(p => /^\$1/.test(fmtPrice(salePrice(p.sizes[0].price))));
  if (priced) {
    const want = fmtPrice(salePrice(priced.sizes[0].price));
    ok(`a price beginning "$1" survives the card renderer (${priced.name} ${want})`,
      productCardHtml(priced, 0).includes(want));
  }

  // llms.txt is generated. It must never be the only place something is said,
  // and it must not go stale against the catalog it summarises.
  const llms = read('llms.txt');
  const absent = GLOW_PRODUCTS.filter(p => !llms.includes(p.name));
  ok('llms.txt covers the whole catalog', absent.length === 0,
    `${absent.map(p => p.name).join(', ')} — run \`node tools/build-llms.js\``);
  ok('llms.txt states the research-use framing',
    /not for human or animal consumption/i.test(llms) && /not FDA-approved/i.test(llms));
  ok('llms.txt quotes the enforced cutoff and transit',
    llms.includes(CUTOFF_LABEL) && llms.includes(`${TRANSIT_DAYS}-day FedEx`));
}

console.log('\nstructured data');
{
  const bad = pages.filter(f => /aggregateRating|"@type":\s*"Review"/.test(read(f)));
  ok('no fabricated ratings or reviews', bad.length === 0, bad.join(', '));

  // The WebSite SearchAction claims peptides.html?q=<term> is a working
  // search results page. If the target URL and the page's own ?q= handling
  // ever drift apart, the schema is asserting a search that does not run.
  const home = read('index.html');
  const searchActionMatch = home.match(/"urlTemplate":\s*"([^"]+)"/);
  ok('index.html declares a SearchAction target', !!searchActionMatch);
  if (searchActionMatch) {
    ok('the SearchAction target points at peptides.html?q={search_term_string}',
      searchActionMatch[1] === 'https://glowresearch.shop/peptides.html?q={search_term_string}',
      searchActionMatch[1]);
  }
  const catalog = read('peptides.html');
  ok('peptides.html reads ?q= into the search box on load',
    /URLSearchParams\(location\.search\)\.get\('q'\)/.test(catalog));
}

/* ---------------------------------------------------------------------------
 * 6. Catalog shape. cart.js, search.js, product.js and both builds all read
 *    these fields. A supplier import that drops one should fail here, loudly,
 *    rather than render an empty tab to a customer.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * 8b. Checkout cannot create a paid-sounding order without a payment
 *     processor. This was found live: checkout.html was fully reachable with
 *     nothing gating it, api/create-order.js created a real WooCommerce order
 *     regardless, and the confirmation email told the shopper "we have your
 *     payment of $X" when nothing had charged them. PAYMENTS_LIVE in
 *     js/products-data.js is the fix, read on both sides. This checks that
 *     the server-side gate is actually there, since that is the one that
 *     matters — a client-side-only check is a suggestion a request can skip.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * 8a. Bulk pricing. The tier cards and the quantity stepper are two controls
 *     over one number, and the discount is a function of that number. Before
 *     this, the cards were separate bundles that added themselves to the cart
 *     on click: a stepper set to 4 charged full price next to a card offering
 *     a discount for 3, and pressing a card put something in the cart without
 *     being asked. Both are gone, and these checks are what keep them gone.
 * ------------------------------------------------------------------------- */
console.log('\nbulk pricing');
{
  // Thresholds ascend and start at a single vial, or tierFor() picks nonsense.
  const qtys = QTY_TIERS.map(t => t.qty);
  const offs = QTY_TIERS.map(t => t.off);
  ok('tiers start at one vial and ascend',
    qtys[0] === 1 && qtys.every((q, i) => i === 0 || q > qtys[i - 1]), qtys.join(', '));
  ok('the discount rises with the quantity',
    offs[0] === 0 && offs.every((o, i) => i === 0 || o > offs[i - 1]), offs.join(', '));
  ok('no tier discounts more than half', offs.every(o => o < 0.5));

  // The rule the customer is told in the fine print: any quantity gets the
  // rate of the tier it reaches. Checked across every quantity up to well past
  // the top tier, not just at the thresholds, because the gaps are the part
  // that was broken.
  const wrongTier = [];
  for (let q = 1; q <= qtys[qtys.length - 1] + 5; q++) {
    const expected = QTY_TIERS.filter(t => q >= t.qty).pop();
    if (tierFor(q).qty !== expected.qty) wrongTier.push(`${q} -> ${tierFor(q).qty}, expected ${expected.qty}`);
  }
  ok('every quantity gets the rate of the tier it reaches',
    wrongTier.length === 0, wrongTier.join('; '));

  // 20% on one compound is the ceiling, and wholesale picks up above it. If a
  // retail tier ever went past what wholesale opens at, the two ladders would
  // be advertising against each other.
  ok('the bulk ceiling is 20%', BULK_MAX_OFF === 0.20, `${BULK_MAX_OFF * 100}%`);
  ok('wholesale still starts richer than the retail ceiling',
    /(2[5-9]|[3-9][0-9])% off starting at/.test(read('wholesale.html')),
    'wholesale.html must open above the retail bulk ceiling');

  // Cards are a subset of the ladder, and they have to be the cheap end of it:
  // cards for 1 and 10 with the middle hidden would be a worse offer presented
  // as the whole one.
  const cards = QTY_TIERS.filter(t => t.card);
  ok('the cards are the lowest tiers, in order',
    cards.length >= 2 && QTY_TIERS.slice(0, cards.length).every(t => t.card),
    'card tiers must be the first rows of the ladder');

  // The page states the rule and every rate past the last card. This is the
  // one that stops the ladder growing a tier nobody is told about.
  const pd = read('product.html');
  const noteHtml = (pd.match(/id="pdBulkNote"[^>]*>([\s\S]*?)<\/p>/) || [, ''])[1].trim();
  ok('the fine print under the tiers is the one bulkNote() writes',
    noteHtml === bulkNote(),
    `run this sentence into product.html:\n          ${bulkNote()}`);
  ok('js/product.js renders the note from bulkNote()',
    /pdBulkNote[\s\S]{0,120}bulkNote\(\)/.test(read('js/product.js')));

  // Every rate that has no card must be named in the copy, or the only way to
  // find it is to guess a quantity and watch the price move.
  const unstated = QTY_TIERS.filter(t => !t.card)
    .filter(t => !noteHtml.includes(`${Math.round(t.off * 100)}%`) ||
                 !noteHtml.includes(tierLabel(t.qty)));
  ok('every tier without a card is stated in words',
    unstated.length === 0, unstated.map(t => tierLabel(t.qty)).join(', '));

  // A tier press must set the quantity, never add to the cart. This is the
  // behaviour regression that matters most: it spends the customer's money.
  const pj = read('js/product.js');
  const tierHandler = (pj.match(/wrap\.querySelectorAll\('\.pd-tier'\)[\s\S]*?\}\);/) || [''])[0];
  ok('pressing a tier sets the quantity', /setQty\(\+btn\.dataset\.qty\)/.test(tierHandler));
  ok('pressing a tier does not add to the cart',
    !/GlowCart\.add/.test(tierHandler), 'a tier press must never touch the cart');

  // One function prices the buy box, the cart line and the generated page.
  ok('the buy box prices from unitPriceAt()', /unitPriceAt\(s\.price, qty\)/.test(pj));
  ok('the cart line is charged the price the buy box quoted',
    /unitSale: unitPriceAt\(s\.price, qty\)/.test(pj));
  ok('the generated page bakes the same function',
    /unitPriceAt\(s\.price, 1\)/.test(read('tools/build-products.js')));

  // Every tier, on every size of every product, must cost less per vial than
  // the one below it. A threshold or percentage edit that inverts that would
  // advertise a discount that charges more.
  const inverted = [];
  GLOW_PRODUCTS.forEach(prod => prod.sizes.forEach(sz => {
    const vs = getProductVariants(prod, sz.price);
    vs.forEach((v, i) => {
      if (i && v.unitSale >= vs[i - 1].unitSale) {
        inverted.push(`${prod.name} ${sz.mg} ${v.label}`);
      }
      // and the struck-through list total must be a real list total
      if (Math.round(v.qty * sz.price * 100) / 100 !== v.original) {
        inverted.push(`${prod.name} ${sz.mg} ${v.label} list`);
      }
    });
  }));
  ok('each tier costs less per vial than the one below it',
    inverted.length === 0, inverted.join(', '));

  /* The cart is the other place a quantity changes, and it was the hole this
     model opened. unitSale used to be stored on the line when it was added,
     so +/- in the drawer and add() merging into an existing line both moved
     the quantity without moving the price: a line stepped from 2 to 5 kept
     the 2-vial rate, and adding 1 then 2 more charged the 1-vial rate on all
     three. Deriving it is the fix, and these keep it derived. */
  const cart = read('js/cart.js');
  ok('the cart prices each line from its own quantity',
    /const lineUnit = i => \(typeof unitPriceAt/.test(cart));
  ok('the cart subtotal uses the derived price',
    /subtotal = \(\) => items\.reduce\(\(n, i\) => n \+ lineUnit\(i\)/.test(cart));
  // lineRef(i), not i.unitOriginal, since the launch list price landed: the
  // reference a saving is measured from is now the higher of that and the
  // per-vial price. What this check exists for is unchanged, and is the
  // lineUnit(i) half — the amount saved has to be measured against the price
  // this quantity actually pays, not a unitSale snapshotted when the line was
  // added at some other quantity.
  ok('the savings figure uses the derived price',
    /savings = \(\) => items\.reduce\(\(n, i\) => n \+ \(lineRef\(i\) - lineUnit\(i\)\)/.test(cart));
  ok('the struck-through reference is the higher of the launch and per-vial price',
    /const lineRef = i => Math\.max\(Number\(i\.unitList\) \|\| 0, i\.unitOriginal\)/.test(cart));
  // checkout.js and api/create-order.js both total from items(), so this is
  // the number the customer is actually charged.
  ok('items() hands out the derived price, not the stored one',
    /items: \(\) => items\.map\(i => Object\.assign\(\{\}, i, \{ unitSale: lineUnit\(i\) \}\)\)/.test(cart));
  ok('no cart total multiplies the stored unitSale',
    !/\bi\.unitSale \* i\.qty/.test(cart) && !/item\.unitSale \* item\.qty/.test(cart),
    'a stored unitSale is a snapshot of the quantity at the time it was added');
}

/* ---------------------------------------------------------------------------
 * 8b. The struck-through launch price. `list` on a size is display only: the
 *     charged figure is still `price`, and unitPriceAt()/api/_lib.js never
 *     read `list` at all. That makes it the one price on the site with
 *     nothing downstream to contradict it if it is wrong, which is exactly
 *     why it needs checking here instead.
 *
 *     A struck-through price is a claim about what something otherwise costs.
 *     These do not make that claim true, which is a business matter, but they
 *     do stop it drifting into arithmetic nobody meant: a reference below the
 *     price actually charged, or a markdown so far off the intended 20% that
 *     "about 20% off" stops describing it.
 * ------------------------------------------------------------------------- */
console.log('\nlaunch pricing');
{
  const sized = [];
  GLOW_PRODUCTS.forEach(p => p.sizes.forEach(s => sized.push({ p, s })));
  const withList = sized.filter(({ s }) => s.list !== undefined);

  ok('every size carries a struck-through launch price',
    withList.length === sized.length,
    `${withList.length} of ${sized.length} sizes have one`);

  const notAbove = withList.filter(({ s }) => !(s.list > s.price));
  ok('every launch price is above the price actually charged',
    notAbove.length === 0,
    notAbove.map(({ s }) => `${s.sku} lists ${s.list} against ${s.price}`).join('; '));

  // 18-22%: wide enough for round list prices (20% off exactly would force
  // figures like $131.25), tight enough that "about 20% off" stays true.
  const band = withList.map(({ s }) => ({ s, pct: (1 - s.price / s.list) * 100 }));
  const outside = band.filter(b => b.pct < 18 || b.pct > 22);
  ok('every markdown lands inside the band "about 20% off" describes',
    outside.length === 0,
    outside.map(b => `${b.s.sku} is ${b.pct.toFixed(1)}% off`).join('; '));

  // The whole reason list prices can be round is that no surface states a
  // percentage for them. If one ever did, the rounding would make it a lie on
  // nine of the ten SKUs.
  // Deliberately not a bare "20% off": the bulk note on product.html says
  // exactly that about the 10-vial tier, which is a real, enforced discount
  // generated by bulkNote(). What must not appear is a percentage attached to
  // the launch markdown itself, since that figure varies by SKU.
  const LAUNCH_PCT = /(launch|sitewide|site-wide|storewide|everything|all products)[^.<]{0,40}\d{1,2}\s*%|\d{1,2}\s*%[^.<]{0,40}(launch|sitewide|site-wide|storewide|everything|all products)/i;
  const pctCopy = ['index.html', 'peptides.html', 'product.html', 'checkout.html']
    .filter(f => LAUNCH_PCT.test(read(f)));
  ok('no page advertises the launch markdown as a percentage',
    pctCopy.length === 0,
    pctCopy.join(', '));

  // hasList() is what every render surface gates on, so a size the catalog
  // holds a list price for must actually read as on sale through it.
  ok('hasList() agrees with the catalog on every size',
    sized.every(({ s }) => hasList(s) === (s.list > s.price)));

  // Card badges. "Best Seller" and "Popular" are editorial: nothing in this
  // system counts sales, so they are a decision someone made rather than a
  // figure it read. That was chosen deliberately and knowingly, and the job
  // of these checks is to keep it bounded instead of unremarked. Derive them
  // from WooCommerce order counts once real sales exist, and the vocabulary
  // check below is what will prompt it.
  {
    const BADGE_VOCAB = ['Best Seller', 'Popular', 'Best Value', 'New'];
    const badged = GLOW_PRODUCTS.filter(p => p.badge);
    const unknown = badged.filter(p => !BADGE_VOCAB.includes(p.badge));
    ok('every card badge comes from the agreed vocabulary',
      unknown.length === 0,
      unknown.map(p => `${p.name} is badged "${p.badge}"`).join('; '));

    // A badge on most of the grid distinguishes nothing. A third is the point
    // at which it stops being a highlight and becomes decoration.
    ok('badges stay rare enough to mean something',
      badged.length <= Math.floor(GLOW_PRODUCTS.length / 3),
      `${badged.length} of ${GLOW_PRODUCTS.length} carry one`);

    // The one badge here that is a measurable claim rather than a judgement,
    // so it is measured: cheapest per mg in the catalog, or it does not ship.
    const perMg = p => {
      const s = p.sizes[0];
      const mg = String(s.mg).split('/').reduce((n, part) => n + parseFloat(part), 0);
      return s.price / mg;
    };
    const cheapest = GLOW_PRODUCTS.reduce((a, b) => (perMg(a) <= perMg(b) ? a : b));
    const valueBadged = GLOW_PRODUCTS.filter(p => p.badge === 'Best Value');
    ok('"Best Value" sits on the cheapest product per mg, or nowhere',
      valueBadged.every(p => p === cheapest),
      `cheapest is ${cheapest.name} at $${perMg(cheapest).toFixed(2)}/mg`);

    // Sold out and still flagged a best seller is the pairing that reads as
    // pure decoration, since the one thing the shopper can do about it is
    // nothing.
    ok('no badge sits on a product with nothing in stock',
      badged.every(p => p.sizes.some(sizeInStock)));
  }

  // The SALE badge is a claim in two words, and the only thing making it true
  // is that the same hasList() gate drew the struck price beside it. These
  // check the badge cannot appear without one, on a sold-out card, or on a
  // different number of cards than the catalog has marked-down products.
  {
    const onSale = GLOW_PRODUCTS.filter(p => hasList(p) && p.sizes.some(sizeInStock));
    const cards = GLOW_PRODUCTS.map((p, i) => productCardHtml(p, i));
    const badged = cards.filter(c => /product-badge sale/.test(c));
    ok('a SALE badge appears on exactly the marked-down products',
      badged.length === onSale.length,
      `${badged.length} badges against ${onSale.length} marked-down products`);
    ok('no card shows SALE without a struck price beside it',
      cards.every(c => !/product-badge sale/.test(c) || /price-was/.test(c)));
    ok('a sold-out card advertises no sale',
      GLOW_PRODUCTS.every((p, i) => p.sizes.some(sizeInStock) ||
        !/product-badge sale/.test(productCardHtml(p, i))));
    ok('the served catalog page carries the same number of SALE badges',
      (read('peptides.html').match(/product-badge sale/g) || []).length === onSale.length);
  }

  // The struck figure and the charged figure come from different fields, so
  // this is the check that they are still a matched pair per SKU rather than
  // two lists that drifted.
  const mismatched = withList.filter(({ s }) => listPriceOf(s) !== s.list);
  ok('listPriceOf() returns the catalog figure for every size',
    mismatched.length === 0);

  // The charging path must not have picked up `list` anywhere. This is the
  // property that makes the whole field safe: it cannot move money.
  // Property access specifically. A bare `list` matches local variables that
  // have nothing to do with pricing (wc() returns customer and tracking
  // arrays named `list`); reading `.list` off a size is the actual mistake.
  const libCode = read('api/_lib.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('the server prices orders without reading the launch price',
    !/\.list\b/.test(libCode),
    'api/_lib.js must price from `price` alone');

  // SITEWIDE_DISCOUNT is the other, older markdown knob. Both being on at once
  // would strike through one figure and quietly charge below another.
  ok('the sitewide markdown is off while launch prices are the reference',
    SITEWIDE_DISCOUNT === 0 || !withList.length);
}

console.log('\ncheckout gate');
{
  const order = read('api/create-order.js');
  // api/create-order.js verifies the payment and gates PAYMENTS_LIVE;
  // api/_place-order.js is the shared code it (and api/stripe-webhook.js)
  // calls to actually create the WooCommerce order and send the emails —
  // several checks below need both files' content to see the whole picture.
  const placeOrderJs = read('api/_place-order.js');
  const orderAll = order + '\n' + placeOrderJs;
  ok('create-order.js imports PAYMENTS_LIVE from the catalog',
    /import\s*\{[^}]*PAYMENTS_LIVE[^}]*\}\s*from\s*'\.\.\/js\/products-data\.js'/.test(order));
  ok('create-order.js refuses to run while PAYMENTS_LIVE is false',
    /if\s*\(!PAYMENTS_LIVE\)/.test(order));
  // The refusal has to come before WooCommerce is touched and before an email
  // is built, or the gate exists but does nothing.
  const gateAt = order.indexOf('if (!PAYMENTS_LIVE)');
  const firstWcCall = order.search(/\bwc\(/);
  const firstEmail = order.indexOf('sendEmail(');
  ok('the gate runs before any WooCommerce call or email is sent',
    gateAt !== -1 && (firstWcCall === -1 || gateAt < firstWcCall) &&
    (firstEmail === -1 || gateAt < firstEmail));

  // Client side is the courtesy, not the gate, but it should exist and agree.
  const coJs = read('js/checkout.js');
  const coHtml = read('checkout.html');
  ok('js/checkout.js shows an honest state instead of the form',
    /PAYMENTS_LIVE/.test(coJs) && /coNotLive/.test(coJs));
  ok('checkout.html carries the coNotLive element',
    /id="coNotLive"/.test(coHtml));

  // The whole point of the wallet on this page is that it is reached without
  // filling the form in. Inside <form id="coForm"> it would be the same button
  // gated behind the typing it exists to replace, so where it sits in the
  // markup is the feature, not a layout preference.
  const formStart = coHtml.indexOf('<form id="coForm"');
  const expressAt = coHtml.indexOf('id="coExpress"');
  ok('the wallet sits above the form, and outside it',
    expressAt !== -1 && formStart !== -1 && expressAt < formStart);
  ok('checkout runs the shared wallet flow, not one of its own',
    /GlowExpressPay\.init\(/.test(coJs) && /express-pay\.js/.test(coHtml));
  // A wallet button over an empty cart would charge for nothing, and the cart
  // can empty from the drawer while this page is open.
  ok('the wallet is withdrawn when the cart empties',
    /canOffer: \(\) => cartItems\(\)\.length > 0/.test(coJs) &&
    /GlowExpressPay\.setOffered\(cartItems\(\)\.length > 0\)/.test(coJs));
  // finishOrder() clears the cart for the typed-card path; the wallet skips it.
  ok('a wallet order clears the cart on its way out',
    /onPlaced: \(\) => \{ if \(window\.GlowCart\) window\.GlowCart\.clear\(\); \}/.test(coJs));

  // While it is false, the order-confirmation email must not exist to be sent
  // — checked structurally above — but if PAYMENTS_LIVE is ever flipped back
  // on, the emails still must not claim a payment the site cannot take. This
  // guards the wording itself so a future re-read of this file does not need
  // to rediscover why the check above exists.
  ok('the confirmation email states a payment was received',
    /have your order and your payment of/i.test(orderAll),
    'expected wording so PAYMENTS_LIVE stays the only thing gating it');
}

console.log('\npayments');
{
  const order = read('api/create-order.js');
  const placeOrderJs = read('api/_place-order.js');
  const orderAll = order + '\n' + placeOrderJs;
  const intentFn = read('api/create-payment-intent.js');
  const lib = read('api/_lib.js');
  const coJs = read('js/checkout.js');
  const coHtml = read('checkout.html');

  ok('create-payment-intent.js gates on PAYMENTS_LIVE before creating a Stripe PaymentIntent',
    /import\s*\{[^}]*PAYMENTS_LIVE[^}]*\}\s*from\s*'\.\.\/js\/products-data\.js'/.test(intentFn) &&
    /if\s*\(!PAYMENTS_LIVE\)/.test(intentFn));

  // The PaymentIntent has to be created before the gate can matter — same
  // shape as the checkout-gate check above, applied to the other endpoint
  // that can now spend money.
  {
    const gateAt = intentFn.indexOf('if (!PAYMENTS_LIVE)');
    const firstStripeCall = intentFn.search(/\bstripe\(/);
    ok('the gate in create-payment-intent.js runs before any Stripe call',
      gateAt !== -1 && (firstStripeCall === -1 || gateAt < firstStripeCall));
  }

  ok('create-order.js requires a paymentIntentId before creating an order',
    /paymentIntentId/.test(order) && /if\s*\(typeof paymentIntentId/.test(order));

  ok('create-order.js verifies the PaymentIntent against Stripe, not the client’s word for it',
    /stripeGet\(`\/payment_intents\//.test(order) &&
    /intent\.status\s*!==\s*'succeeded'/.test(order));

  // The check above confirms the read happens; this confirms it happens
  // before WooCommerce is touched, the same ordering requirement as the
  // PAYMENTS_LIVE gate itself — a verification that runs after the order
  // already exists is not a verification. The WooCommerce write itself lives
  // in api/_place-order.js now (shared with api/stripe-webhook.js), so the
  // ordering guarantee create-order.js has to keep is that the verification
  // runs before it ever calls into that shared function at all.
  {
    const verifyAt = order.indexOf("stripeGet(`/payment_intents/");
    const placeOrderCallAt = order.search(/\bplaceOrder\(\{/);
    ok('the Stripe verification runs before the WooCommerce order is created',
      verifyAt !== -1 && placeOrderCallAt !== -1 && verifyAt < placeOrderCallAt);
  }

  ok('create-order.js checks the charged amount against a freshly priced total',
    /priceOrder\(/.test(orderAll) && /amount_received/.test(order));

  // This is the check that would have caught the bug this whole feature
  // replaced: WooCommerce line totals priced from whatever the browser sent
  // (i.unitSale on the raw request body) rather than from the catalog.
  // Scoped to the block that actually builds line_items/fee_lines, between
  // its declaration and shipping_lines right after — not the whole file,
  // because the email renderers further down legitimately read `.unitSale`
  // off priced.lines (trusted, catalog-derived) under the same shorthand
  // variable name. Checking the whole file would also trip on this very
  // comment mentioning the literal it is watching for. Lives in
  // api/_place-order.js now, shared by both api/create-order.js and
  // api/stripe-webhook.js.
  {
    const start = placeOrderJs.indexOf('const line_items = [];');
    const end = placeOrderJs.indexOf('const shipping_lines = ', start);
    const block = (start !== -1 && end !== -1) ? placeOrderJs.slice(start, end) : placeOrderJs;
    ok('create-order.js does not price line items from a client-sent unit price',
      start !== -1 && end !== -1 && !/i\.unitSale/.test(block));
  }

  ok('api/_lib.js prices orders from the catalog, not from the request',
    /GLOW_PRODUCTS\.find/.test(lib) && /unitPriceAt\(/.test(lib));

  ok('js/checkout.js loads Stripe live from js.stripe.com, not a bundled copy',
    /https:\/\/js\.stripe\.com\/v3\//.test(coHtml));

  ok('js/checkout.js reads STRIPE_PUBLISHABLE_KEY rather than hardcoding a key of its own',
    /STRIPE_PUBLISHABLE_KEY/.test(coJs) && !/pk_(test|live)_/.test(coJs));

  // Card only, by explicit choice: bank debit settles as `processing` for
  // days rather than `succeeded` immediately, and api/create-order.js only
  // ever treats `succeeded` as safe to ship against. automatic_payment_methods
  // would hand that decision to whatever is switched on in the Stripe
  // Dashboard instead of to this file, which is how a method with no
  // fulfillment story behind it would end up offered on the checkout page.
  // The negative check looks for automatic_payment_methods used as an actual
  // object key (followed by its opening brace), not the bare words — the
  // comment explaining why card-only was chosen instead necessarily mentions
  // automatic_payment_methods by name, which a plain substring check would
  // have tripped over.
  ok('the PaymentIntent is created for card only, not automatic method detection',
    /payment_method_types:\s*\['card'\]/.test(intentFn) &&
    !/automatic_payment_methods\s*:\s*\{/.test(intentFn));

  // js/checkout.js prices what the shopper is shown; api/_lib.js prices what
  // Stripe is actually told to collect; js/product.js prices the express
  // Apple Pay / Google Pay button on the product page, which posts to the
  // same two endpoints but never touches checkout.js. CLAUDE.md has said all
  // along that the tables must be changed together, and nothing checked that
  // they had been. A drift between any two is not a display bug: one surface
  // quotes a number, Stripe collects another, and api/create-order.js then
  // refuses the order because the amount it reprices does not match what was
  // taken.
  {
    const shipRows = (src, name) => {
      const block = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(src);
      if (!block) return null;
      return (block[1].match(/\{[^}]*\}/g) || []).map(row => {
        const grab = re => { const m = re.exec(row); return m ? m[1] : '?'; };
        return `${grab(/id:\s*'([^']+)'/)}@${grab(/cost:\s*([0-9.]+)/)}` +
               `/free-over-${grab(/freeOver:\s*(null|[0-9.]+)/)}`;
      });
    };
    const served = shipRows(lib, 'SHIPPING_RATES');
    const shown = shipRows(coJs, 'const SHIPPING');
    const express = shipRows(read('js/express-pay.js'), 'EXPRESS_SHIPPING');
    ok('all three shipping tables were found to compare',
      Array.isArray(served) && served.length > 0 && Array.isArray(shown) && shown.length > 0 &&
      Array.isArray(express) && express.length > 0);
    ok('what Stripe is charged for shipping matches what checkout displays',
      !!served && !!shown && served.join(' | ') === shown.join(' | '),
      `_lib.js [${(served || []).join(', ')}] vs checkout.js [${(shown || []).join(', ')}]`);
    ok('the express wallet quotes the same rates, on both pages that offer it',
      !!served && !!express && served.join(' | ') === express.join(' | '),
      `_lib.js [${(served || []).join(', ')}] vs express-pay.js [${(express || []).join(', ')}]`);
  }

  // checkout.html tells the shopper tax is calculated from their address.
  // That is only true if every surface that can charge money actually asks
  // Stripe Tax rather than hardcoding a rate or trusting one from the
  // browser — the three checks below are what make the claim real rather
  // than aspirational copy.
  {
    const intentJs = read('api/create-payment-intent.js');
    const orderJs = read('api/create-order.js');
    const productJs = read('js/product.js');

    ok('create-payment-intent.js prices through the shared tax calculator',
      /priceOrderWithTax\(/.test(intentJs) && !/priceOrder\(/.test(intentJs.replace(/priceOrderWithTax/g, '')));
    ok('create-order.js re-derives tax itself rather than trusting a client-sent figure',
      /priceOrderWithTax\(/.test(orderJs) &&
      !/body\.tax\b/.test(orderJs) && !/\.tax,?\s*=\s*(?:req|body)/.test(orderJs));
    ok('the checkout page and the express pay button use the same tax calculator, not a hardcoded rate',
      !/\*\s*0\.0[0-9]/.test(coJs) && !/\*\s*0\.0[0-9]/.test(productJs));
    ok('the WooCommerce order carries tax as a fee line, not a WooCommerce tax rate',
      /fee_lines\.push\(\{ name: 'Sales tax'/.test(placeOrderJs));
    ok('a finalized order records the tax transaction with Stripe for filing',
      /tax\/transactions\/create_from_calculation/.test(placeOrderJs));
  }

  // Pricing a cart line off its display name meant a rename invalidated every
  // cart already saved in a browser, and the shopper only found out at the
  // payment step, with no way to act on it. The SKU is the identity that does
  // not move.
  ok('orders are priced against the SKU, not just the product name',
    /i\.sku/.test(lib) && /s\.sku === i\.sku/.test(lib) &&
    /sku: item\.sku \|\| skuFor\(/.test(read('js/cart.js')));

  // A confirmed payment with no order behind it is the one failure mode the
  // shopper cannot resolve and the desk would never otherwise see. The two
  // call sites this originally checked (an amount mismatch, a WooCommerce
  // failure) now split across create-order.js and the shared
  // api/_place-order.js; api/stripe-webhook.js is the backstop that fires if
  // neither of those ever runs at all, and it has to reach the desk too.
  ok('a captured payment that fails to become an order alerts the desk',
    /alertOrphanedPayment\(/.test(orderAll) &&
    (orderAll.match(/await alertOrphanedPayment\(/g) || []).length >= 2 &&
    /alertOrphanedPayment\(/.test(read('api/stripe-webhook.js')));

  // The confirmation page is the one surface that describes a payment after
  // the fact, and it got this wrong for real: it went on telling shoppers
  // "card payment is not connected on the site yet, we will contact you to
  // take payment" for as long as PAYMENTS_LIVE had been true, on a page they
  // could only reach by paying with a card. Hand-written copy about payment
  // state is the defect; these three checks make it one that cannot ship.
  {
    const tyHtml = read('thank-you.html');
    const tyJs = read('js/thank-you.js');

    ok('thank-you.html takes its payment step from PAYMENT_COPY rather than writing its own',
      /PAYMENT_COPY\.stepTitle/.test(tyJs) && /PAYMENT_COPY\.stepBody/.test(tyJs) &&
      /id="tyStepPayTitle"/.test(tyHtml) && /id="tyStepPayBody"/.test(tyHtml));

    // PAYMENT_COPY only helps if the page has no second, hardcoded opinion
    // about payment sitting beside it. Both literals below are ones the page
    // actually carried.
    ok('thank-you.html hardcodes no payment or order state of its own',
      !/not connected on the site/i.test(tyHtml) && !/Awaiting payment/i.test(tyHtml));

    ok('the confirmation page states the order status WooCommerce recorded',
      /status:\s*STATUS_LABELS\[/.test(order) && /order\.status/.test(tyJs));
  }

  // And the copy PAYMENT_COPY hands over has to match the branch it came
  // from: a live checkout cannot promise to collect payment later, and a
  // closed one cannot claim a card was charged.
  ok('PAYMENT_COPY describes the checkout that PAYMENTS_LIVE actually configures',
    PAYMENTS_LIVE
      ? !/take payment|not connected/i.test(PAYMENT_COPY.stepBody)
      : !/was charged|has been charged/i.test(PAYMENT_COPY.stepBody),
    PAYMENT_COPY.stepBody);

  // The one check that would matter most if it ever failed: a secret key
  // checked into anything the browser can fetch is a live credential handed
  // to every visitor. Scans every hand-written page and every browser-loaded
  // script — not api/**, which runs server-side only and is where the real
  // key belongs, read from process.env.STRIPE_SECRET_KEY.
  {
    const browserFiles = [
      ...pages,
      ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ];
    const leaked = browserFiles.filter(f => /sk_(test|live)_/.test(read(f)));
    ok('no Stripe secret key appears in any browser-served file',
      leaked.length === 0, leaked.join(', '));
  }
}

console.log('\npromo codes');
{
  const lib = read('api/_lib.js');
  const applyPromo = read('api/apply-promo.js');
  const intentFn = read('api/create-payment-intent.js');
  const order = read('api/create-order.js');
  const placeOrderJs = read('api/_place-order.js');
  const coJs = read('js/checkout.js');
  const coHtml = read('checkout.html');

  // checkout.html used to tell a shopper "Promo codes are validated at
  // payment" while nothing on the page or the server validated anything —
  // typing a code did nothing at all. That line is gone now that codes are
  // real; this guards against it, or anything like it, coming back.
  ok('no page claims promo codes are validated without code that validates them',
    !/validated at payment/i.test(coHtml) && !/validated at payment/i.test(coJs));

  // A code is a string to look up, never a dollar figure to trust. Every
  // caller resolves it against Stripe's own promotion_codes endpoint —
  // resolvePromoCode() is the one place that happens, so checking its
  // presence here is checking that no caller invented a shortcut around it.
  ok('resolvePromoCode() looks the code up against Stripe rather than trusting one',
    /export async function resolvePromoCode/.test(lib) &&
    /stripeGet\(`\/promotion_codes\?code=/.test(lib));

  ok('a discount can never exceed the subtotal it is applied to',
    /discountCents = Math\.min\(discountCents, subtotalCents\)/.test(lib));

  // api/apply-promo.js only ever answers "is this code good, and for how
  // much" — it must not be the thing that changes what gets charged, or a
  // shopper could apply a code here and pay full price anyway if
  // create-payment-intent.js used a different figure.
  ok('api/apply-promo.js gates on PAYMENTS_LIVE like every other money endpoint',
    /import\s*\{[^}]*PAYMENTS_LIVE[^}]*\}\s*from\s*'\.\.\/js\/products-data\.js'/.test(applyPromo) &&
    /if\s*\(!PAYMENTS_LIVE\)/.test(applyPromo));
  ok('api/apply-promo.js never writes to a PaymentIntent or an order',
    !/\/payment_intents/.test(applyPromo) && !/\/orders/.test(applyPromo));

  // The actual charge is only ever set by re-resolving the same code against
  // Stripe a second time, inside priceOrderWithTax() — never by trusting
  // whatever api/apply-promo.js said a moment earlier, and never by reading a
  // discount value off the request body.
  ok('create-payment-intent.js re-validates the code itself rather than trusting a client-sent discount',
    /priceOrderWithTax\(items, shippingMethodId, address, promoCode\)/.test(intentFn) &&
    !/body\.discount\b/.test(intentFn) && !/req\.body\.discount\b/.test(intentFn));
  ok('create-order.js re-validates the code itself rather than trusting a client-sent discount',
    /priceOrderWithTax\(items, shippingMethod && shippingMethod\.id, shipping, promoCode\)/.test(order) &&
    !/body\.discount\b/.test(order) && !/req\.body\.discount\b/.test(order));

  // An invalid or expired code must stop the price from being computed at
  // all, not fall back to full price silently — a shopper who saw a code
  // apply and then got charged full price with no explanation is a worse
  // outcome than the checkout page surfacing the error plainly.
  ok('priceOrderWithTax() throws on an invalid promo code rather than pricing at full price',
    /if\s*\(!resolved\.ok\)\s*throw new Error\(resolved\.error\)/.test(lib));

  // Mirrors the tax fee line already checked above: a real discount has to
  // show up as money on the actual WooCommerce order, not just on the
  // checkout page's own summary.
  ok('the WooCommerce order carries the discount as a negative fee line',
    /fee_lines\.push\(\{ name: label, total: \(-priced\.discount\)\.toFixed\(2\) \}\)/.test(placeOrderJs));
  ok('a captured payment is only ever priced from priced.discount, not a raw request field',
    /priced\.discount/.test(placeOrderJs) && !/body\.discount/.test(placeOrderJs));

  // js/checkout.js must never compute what a code is worth on its own — every
  // dollar figure it shows (promoDiscount) has to come back from a server
  // response, the same discipline taxAmount already keeps for Stripe Tax.
  ok('js/checkout.js only ever sets its discount from a server response',
    /promoDiscount = data\.discount \|\| 0/.test(coJs) &&
    !/promoDiscount\s*=\s*[^d][^;]*\*/.test(coJs));

  ok('checkout.html carries the discount summary row',
    /id="coPromoRow"/.test(coHtml) && /id="coPromoRowAmount"/.test(coHtml));
}

console.log('\ncatalog shape');
{
  const required = ['name', 'tag', 'cat', 'purity', 'sizes', 'blurb', 'about', 'research'];
  const bad = [];
  GLOW_PRODUCTS.forEach(p => {
    required.forEach(k => {
      const v = p[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
        bad.push(`${p.name || '(unnamed)'}.${k}`);
      }
    });
    p.sizes.forEach(s => {
      if (!s.mg || typeof s.price !== 'number') bad.push(`${p.name}.sizes[${s.mg || '?'}]`);
    });
  });
  ok(`all ${GLOW_PRODUCTS.length} products carry every field the site reads`,
    bad.length === 0, bad.join(', '));

  // alias ("Retatrutide" under "GLP-3 (RT)") is a claim that this is what
  // the compound is commonly called. It can only ever say what the
  // product's own about copy already says, not a second, independent claim.
  const aliasDrift = GLOW_PRODUCTS
    .filter(p => p.alias)
    .filter(p => !p.about[0].toLowerCase().includes(p.alias.toLowerCase()))
    .map(p => `${p.name}.alias ("${p.alias}")`);
  ok('every alias is named in that product\'s own about copy',
    aliasDrift.length === 0, aliasDrift.join(', '));
}

/* ---------------------------------------------------------------------------
 * 6b. The cart-drawer accessory offer. Its failure mode is silent in both
 *     directions, which is why it is checked rather than trusted.
 *
 *     CART_UPSELL names a product and a size as strings. Rename either and
 *     cartUpsell() returns null: no error, no broken page, the module simply
 *     stops appearing in every cart on the site and nothing says so. That is
 *     the kind of quiet regression that survives for months.
 *
 *     The other direction is worse. The drawer states a size and a price, so
 *     both have to come out of the catalog row at render time. A hardcoded $15
 *     in the drawer would keep saying $15 after the catalog moved, which is a
 *     price the site quotes and does not honour.
 * ------------------------------------------------------------------------- */
console.log('\ncart upsell');
{
  const cart = read('js/cart.js');

  if (CART_UPSELL === null) {
    ok('the offer is switched off and the drawer does not render it',
      !/cart-upsell/.test(cart) || /if \(!u/.test(cart));
  } else {
    // Resolved by hand rather than through cartUpsell(), because the two
    // reasons it can return null need different severities. A name that
    // matches nothing is a configuration error and fails the build. A size
    // that is out of stock is an ordinary Tuesday: cartUpsell() returns null,
    // the drawer shows nothing, and the site is telling the truth. Reported so
    // the offer's absence is visible, not failed.
    const product = GLOW_PRODUCTS.find(p => p.name === CART_UPSELL.name);
    const size = product && product.sizes.find(s => s.mg === CART_UPSELL.mg);
    ok('CART_UPSELL names a product and size the catalog holds', !!size,
      `nothing in the catalog matches ${CART_UPSELL.name} ${CART_UPSELL.mg}`);

    if (size) {
      console.log(sizeInStock(size)
        ? '  ok    the offered size is sellable'
        : '  note  the offered size is out of stock, so no cart shows the offer');

      // The one thing the drawer is not allowed to do is state its own figure.
      ok('the drawer resolves the offer against the catalog', /cartUpsell\(\)/.test(cart));

      // The line the customer reads, isolated from the aria-label beneath it,
      // so a size interpolated only into the label cannot satisfy this.
      const copy = (cart.match(/class="cart-upsell-d">(.*)$/m) || [, ''])[1];
      ok('the visible line states the catalog size and the catalog price',
        /\$\{u\.size\.mg\}/.test(copy) && /\$\{money\(salePrice\(u\.size\.price\)\)\}/.test(copy),
        copy.trim() || 'no .cart-upsell-d line found');

      ok('no price is typed into the offer',
        !new RegExp(`\\$${size.price}\\b`).test(cart),
        `found a literal $${size.price} in js/cart.js`);

      // Offering water to somebody who already bought water is the whole
      // reason this module has a hide condition, so the condition is pinned.
      ok('the offer hides once that product is in the cart',
        /items\.some\(i => i\.name === u\.product\.name\)/.test(cart));
    }
  }
}

/* ---------------------------------------------------------------------------
 * 7. Sitemap. Never advertise a URL that is not served: while product pages
 *    are held, the generated URLs must not be in there.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * The registered entity name and the street address were pulled off the site
 * and out of every email deliberately. They were in the footer of all 23
 * pages, the homepage Organization schema, the about page's facts list, the
 * privacy policy, and the footer of every transactional email — so putting
 * one back is a one-line edit in a file nobody is reading closely, and it
 * would ship. This is the check that stops that.
 *
 * Scans every page, every browser-loaded script and every serverless handler.
 * This file is not in that set, which is why it can name the strings it is
 * looking for.
 * ------------------------------------------------------------------------- */
console.log('\nentity and address');
{
  const street = '10755 Scripps Poway Pkwy';
  const entity = 'Glow Nutrition';
  // The town and the state go with them. This one needs care rather than a
  // flat string scan: "California" is a legitimate word on two pages that are
  // not saying where the business is — the shipping state dropdown in
  // js/checkout.js has to offer it, and the governing-law clause in terms.html
  // names it as the law the contract runs under, which is a choice of law and
  // not a location. Both are excluded by file; everywhere else, a hit is the
  // site disclosing where it operates from.
  const placeExempt = new Set(['js/checkout.js', 'terms.html']);
  const scanned = [
    ...pages,
    ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js')).map(f => `api/${f}`),
  ];

  const withStreet = scanned.filter(f => read(f).includes(street));
  ok('no page, script or handler states the street address',
    withStreet.length === 0, withStreet.join(', '));

  const withEntity = scanned.filter(f => read(f).includes(entity));
  ok('no page, script or handler names the registered entity',
    withEntity.length === 0, withEntity.join(', '));

  const withTown = scanned.filter(f => read(f).includes('San Diego'));
  ok('no page, script or handler names the town', withTown.length === 0, withTown.join(', '));

  const withState = scanned
    .filter(f => !placeExempt.has(f))
    .filter(f => /California|"addressRegion"/.test(read(f)));
  ok('and none names the state outside the state picker and the governing-law clause',
    withState.length === 0, withState.join(', '));

  // The homepage Organization block is the one place a machine reads the
  // company's identity, so it gets checked as parsed data rather than as text.
  {
    const blocks = [...read('index.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const graph = blocks.flatMap(b => {
      try { const j = JSON.parse(b[1]); return j['@graph'] || [j]; } catch (e) { return []; }
    });
    const org = graph.find(n => n['@type'] === 'Organization');
    ok('the homepage still declares an Organization', !!org);
    ok('that Organization carries no legalName and no street address',
      !!org && !org.legalName && !(org.address && org.address.streetAddress),
      org ? JSON.stringify(org.address || {}) : 'no Organization node');
  }
}

console.log('\nsitemap');
{
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  ok('sitemap is not empty', locs.length > 0);
  ok('no duplicate URLs', new Set(locs).size === locs.length);

  const products = locs.filter(u => /\/peptides\/[^/]+\/$/.test(u));
  ok(PRODUCT_PAGES_LIVE ? 'product URLs are listed' : 'held product URLs are not listed',
    PRODUCT_PAGES_LIVE ? products.length === GLOW_PRODUCTS.length : products.length === 0,
    `${products.length} product URLs`);

  const missing = locs
    .map(u => u.replace(/^https:\/\/glowresearch\.shop\/?/, ''))
    .filter(rel => rel && !fs.existsSync(path.join(ROOT, /\/$/.test(rel) ? rel + 'index.html' : rel)));
  ok('every listed URL exists on disk', missing.length === 0, missing.join(', '));
}

console.log(failures === 0
  ? '\nEvery claim traces to something the system enforces.\n'
  : `\n${failures} claim(s) the system does not back up.\n`);
process.exit(failures ? 1 : 0);
