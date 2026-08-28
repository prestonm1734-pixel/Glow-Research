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
  avgPurity, BATCHES_TESTED, TRANSIT_DAYS, DISPATCH_LABEL, NO_DISPATCH_DAY_NAME,
  DISPATCH_CUTOFF_HOUR, DISPATCH_CUTOFF_LABEL, DISPATCH_CUTOFF_TICKER, DISPATCH_CUTOFF_PDP_LABEL,
  ANALYSIS_TESTS, TESTS_PER_BATCH, numberWord, PACKAGING_PLAIN, STORAGE_LONG,
  ANALYSIS_SHORT, ANALYSIS_LONG, ANALYSIS_NOT_RUN, SOURCE_LONG,
  LAB, labIdentity, PURITY_ROW, RESULT_ON_COA, batchRows, batchMeta, batchPanelHtml,
  productMetaDesc, productSlug,
  verifyUrl, verifyHost, LAB_VERIFY_URL,
  FAQS, faqHtml,
  COA_COPY, productCardHtml, coaCardHtml, coaHref, fmtPrice, salePrice,
  QTY_TIERS, tierFor, getProductVariants, unitPriceAt, BULK_MAX_OFF, bulkNote, tierLabel,
  CART_UPSELL, cartUpsell, CAT_LABEL, PAYMENTS_LIVE, PAYMENT_COPY,
  hasList, listPriceOf, SITEWIDE_DISCOUNT, VIAL_ART_NOTICE, LAUNCH_OFFER, LAUNCH_OFFER_LIVE,
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
 * 2. Dispatch window. This was a 2 PM PST cutoff, then briefly "one business
 *    day" (wrong in the other direction: Saturday is a dispatch day here, and
 *    Sunday is the only day nothing leaves), then no cutoff at all once the
 *    2 PM one turned out to be a claim nothing in the code kept.
 *
 *    The fulfilment partner has since confirmed a real one: DISPATCH_CUTOFF_HOUR,
 *    1:00 PM Pacific. Unlike the old cutoff, js/product.js's deliveryEstimate()
 *    actually branches on it, so this section now checks the opposite of what
 *    it used to: not that no page states a cutoff, but that every page which
 *    does states exactly this one, and that the code genuinely enforces it
 *    rather than only being told about it in copy.
 * ------------------------------------------------------------------------- */
console.log('\ndispatch window');
{
  const noDispatch = constant('js/products-data.js', 'NO_DISPATCH_DAY');
  const noDelivery = constant('js/products-data.js', 'NO_DELIVERY_DAY');
  ok('products-data.js declares NO_DISPATCH_DAY and NO_DELIVERY_DAY',
    noDispatch !== null && noDelivery !== null);

  const expected = `the same day when ordered by ${DISPATCH_CUTOFF_LABEL}, otherwise the next dispatch day`;
  ok(`DISPATCH_LABEL reads "${expected}"`, DISPATCH_LABEL === expected,
    `expected "${expected}", got "${DISPATCH_LABEL}"`);

  // "dispatch day", never "business day": Saturday is a real dispatch day
  // here, and "business day" carries enough of a Mon-Fri connotation that a
  // Friday-afternoon order would read it as going out Monday when it
  // actually goes out Saturday. Scoped to dispatch/shipping phrasing
  // specifically — wholesale.html and contact.html's own "business day"
  // describes reply times, a genuinely different fact with no Saturday
  // question attached, and is not what this guards against.
  const staleBusinessDayShipping = [];
  pages.forEach(f => {
    if (/ships? within (?:a|one) business day|out in (?:a|one) business day|within one business day (?:of being placed|on)/i
      .test(read(f))) staleBusinessDayShipping.push(f);
  });
  ok('no page describes dispatch in "business days" any more',
    staleBusinessDayShipping.length === 0, staleBusinessDayShipping.join(', '));

  // Every clock-time cutoff claim sitewide has to be one of three approved
  // strings — DISPATCH_CUTOFF_LABEL in prose, DISPATCH_CUTOFF_TICKER in the
  // marquee, DISPATCH_CUTOFF_PDP_LABEL on the product page — all three read
  // from DISPATCH_CUTOFF_HOUR, so a mismatched one is either a typo or a
  // claim about a different hour than the code enforces. Scripts are scanned
  // alongside pages for the same reason as before: a claim rendered from a
  // template literal is still a claim a customer reads.
  const cutoffSources = pages.concat(['js/product.js', 'js/products-data.js']);

  // Comments stripped, the same rule the privacy and navigation sections use:
  // a note recording what the copy used to say is not itself a claim anyone
  // reads. &nbsp; is folded to a space first: it is a typographic choice, not
  // a different claim.
  const bareSrc = f => read(f)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/&nbsp;|&#160;| /g, ' ');

  // DISPATCH_CUTOFF_PDP_LABEL is not looked for in this scan: the product
  // page's cutoff line is built at runtime from a template literal, so the
  // resolved string never appears in any file's source text the way the
  // other two do — it is checked below instead, by confirming js/product.js
  // reads the constant itself rather than typing its own hour.
  const wrongClocks = [];
  const foundAny = { label: false, ticker: false };
  cutoffSources.forEach(f => {
    for (const m of bareSrc(f).matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:Pacific|PT|P[SD]T)\b/gi)) {
      if (m[0] === DISPATCH_CUTOFF_LABEL) foundAny.label = true;
      else if (m[0] === DISPATCH_CUTOFF_TICKER) foundAny.ticker = true;
      else if (m[0] === DISPATCH_CUTOFF_PDP_LABEL) { /* its own definition, in products-data.js */ }
      else wrongClocks.push(`${f}: "${m[0]}"`);
    }
  });
  ok('every stated dispatch cutoff time matches an approved DISPATCH_CUTOFF_* constant exactly',
    wrongClocks.length === 0, wrongClocks.join(', '));
  ok('the full cutoff label and the marquee ticker are each stated somewhere',
    foundAny.label && foundAny.ticker,
    `label seen: ${foundAny.label}, ticker seen: ${foundAny.ticker}`);
  ok('the product page reads DISPATCH_CUTOFF_PDP_LABEL rather than typing its own hour',
    /DISPATCH_CUTOFF_PDP_LABEL/.test(read('js/product.js')));

  // The marquee is hand-duplicated across every page rather than built from
  // one template, so the only way to catch a page that kept the old ticker
  // text is to check each one that has a marquee at all.
  const staleTicker = [];
  pages.forEach(f => {
    const html = read(f);
    if (/marquee-track/.test(html) && !html.includes(DISPATCH_CUTOFF_TICKER)) staleTicker.push(f);
  });
  ok('every page with a marquee states the current cutoff ticker',
    staleTicker.length === 0, staleTicker.join(', '));

  ok('the product page reads the shared dispatch days, not its own copy',
    !/const NO_DISPATCH_DAY|const NO_DELIVERY_DAY/.test(read('js/product.js')) &&
    /NO_DISPATCH_DAY/.test(read('js/product.js')) &&
    /NO_DELIVERY_DAY/.test(read('js/product.js')));

  ok('the product page reads the shared cutoff hour, not its own copy',
    !/const DISPATCH_CUTOFF_HOUR/.test(read('js/product.js')) &&
    /DISPATCH_CUTOFF_HOUR/.test(read('js/product.js')));

  // Plain days, not business days: stepping over the whole weekend would push
  // every late-week estimate out by two days the shipment does not take.
  ok('the estimate counts plain days, not business days',
    !/addBusinessDays/.test(read('js/product.js')));

  // Both Sundays are handled, and they are separate facts: nothing is
  // dispatched on one, nothing is delivered on one.
  const est = read('js/product.js');
  ok('the estimate skips Sunday at both the dispatch and the delivery end',
    /getUTCDay\(\)\s*===\s*NO_DISPATCH_DAY/.test(est) &&
    /getUTCDay\(\)\s*===\s*NO_DELIVERY_DAY/.test(est));

  // The cutoff has to actually gate something, or DISPATCH_CUTOFF_HOUR is
  // just a number sitting next to the logic rather than inside it — the
  // exact failure mode the old 2 PM PST cutoff had.
  ok('the estimate branches on the cutoff hour rather than only quoting it',
    /nowParts\.hour\)\s*>=\s*DISPATCH_CUTOFF_HOUR/.test(est));

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
 * 3d. Shipping policy figures. shipping-policy.html states the FedEx rate,
 *     the free-shipping threshold, and the coverage amount in prose, as a
 *     policy rather than a live price. The rate and the threshold have a
 *     source of truth elsewhere on the site (SHIPPING_RATES, cart.js's
 *     FREE_SHIPPING_AT); the policy page has to read the same numbers those
 *     do, not a copy retyped by hand that can drift the next time a rate
 *     changes. Coverage has no such source, since nothing in code enforces an
 *     insurance figure, so that one is pinned only against shipping.html, the
 *     other page that states it, so the two cannot disagree with each other.
 *
 *     FedEx Overnight was a second method here and in SHIPPING_RATES,
 *     js/checkout.js and js/express-pay.js. It is gone from all four now, not
 *     just repriced, so this section also has to fail if it quietly comes
 *     back on only one of them.
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
  const cartFree = constant('js/cart.js', 'FREE_SHIPPING_AT');

  const twoDay = policy.match(/FedEx 2-Day Express:<\/strong>\s*\$([0-9.]+), free on orders over \$([0-9]+)/);
  ok('the policy states the 2-Day rate SHIPPING_RATES actually charges',
    twoDay !== null && twoDayRate !== null && Number(twoDay[1]) === twoDayRate.cost,
    twoDay ? `policy says $${twoDay[1]}, SHIPPING_RATES says $${twoDayRate && twoDayRate.cost}` : 'rate not found in shipping-policy.html');
  ok('and the free-shipping threshold FREE_SHIPPING_AT actually enforces',
    twoDay !== null && Number(twoDay[2]) === cartFree,
    twoDay ? `policy says $${twoDay[2]}, FREE_SHIPPING_AT is $${cartFree}` : 'threshold not found');

  // Only one method is offered. Checked everywhere the second one used to
  // live, so a re-added Overnight row on any one of them fails here rather
  // than shipping as a page that quotes one method while checkout offers two.
  ok('SHIPPING_RATES offers only FedEx 2-Day, not a second method',
    !/id: 'overnight'/.test(lib));
  ok('js/checkout.js offers only FedEx 2-Day, not a second method',
    !/id: 'overnight'/.test(read('js/checkout.js')));
  ok('js/express-pay.js offers only FedEx 2-Day, not a second method',
    !/id: 'overnight'/.test(read('js/express-pay.js')));
  ok('shipping-policy.html does not mention FedEx Overnight',
    !/Overnight/.test(policy));

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

  // A named, accredited laboratory is a claim about a third party, so a name
  // may not appear without the standing that makes naming it mean anything.
  //
  // The logo used to be required alongside both, from when none of the three
  // was known and the safe rule was all or nothing. It is optional now: the
  // certificates name Accumark Labs, and refusing to say so until we hold a
  // mark we are licensed to reproduce would leave the panel vaguer than the
  // document it links. The mark is their property and its absence is a
  // permissions question, not a doubt about who ran the work.
  const lab = labIdentity();
  ok('the laboratory is named only when the catalog names it',
    (LAB.name && LAB.accreditation) ||
    (!LAB.name && !LAB.logo && lab.name === 'Independent third-party laboratory'),
    'LAB must be wholly empty, or carry a name and the accreditation that stands behind it');
  // While the lab is unnamed the fallback has to carry the two facts the name
  // would have carried: that it is not us, and that it gains nothing by the
  // number it returns. Once LAB is filled, the name and the accreditation
  // beside it say that themselves, and the check above already guarantees a
  // name never appears without both.
  ok('the header says who ran the analysis and what they gain by it',
    LAB.name
      ? Boolean(lab.accreditation)
      : /third-party/i.test(lab.name) && /no stake in the result/i.test(lab.accreditation));

  // Pending is not accredited, and the gap between the two is the single most
  // load-bearing claim on this site: it is the reason a buyer is asked to
  // trust a number. The site said "ISO/IEC 17025 accredited" in the panel, in
  // prose, and as a certification badge, while the laboratory's own listing
  // said the assessment was still open.
  //
  // So while LAB.accreditation says pending, no page may state the
  // accreditation as held, in words or as a mark. Granting flips one string in
  // js/products-data.js and this check stops applying on its own.
  if (/pending/i.test(LAB.accreditation)) {
    const claimed = [];
    pages.forEach(f => {
      const text = read(f)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/g, '');
      // The standard's number followed by a word that asserts it is held,
      // with only a space or a hyphen allowed between: "17025 accredited",
      // "17025-certified". "17025 accreditation is pending" does not match.
      if (/17025[\s-]+(accredited|certified|compliant)\b/i.test(text)) {
        claimed.push(`${f} states it as held`);
      }
      if (/(iso[^"']{0,12}17025|17025)[^"']*\.(png|jpg|jpeg|svg|webp)/i.test(text)) {
        claimed.push(`${f} draws an accreditation mark`);
      }
    });
    ok('no page states the accreditation as held while it is pending',
      claimed.length === 0, claimed.join(', '));
  }

  // The verification link is the strongest thing on the site: it is the one
  // claim a reader can settle without trusting us. So it has to actually
  // reach every certificate, and it has to be built rather than typed.
  if (LAB_VERIFY_URL) {
    const unverifiable = GLOW_PRODUCTS.filter(p => coaHref(p) && !verifyUrl(p));
    ok('every published certificate can be checked with the laboratory',
      unverifiable.length === 0,
      `${unverifiable.map(p => p.name).join(', ')} publish a certificate with no coaRef, ` +
      'so no verification link is drawn for them');

    // Built from the catalog, so a link always carries the reference for the
    // lot the reader is looking at. A ?code= typed into a page is one product
    // sending people to another product's report.
    const hardCoded = pages.filter(f => /verify\?code=/i.test(read(f)));
    ok('no page hard-codes a verification code',
      hardCoded.length === 0,
      `${hardCoded.join(', ')} must build the link with verifyUrl(), not type it`);

    // how-we-test.html names the route in prose, by hand, like everything else
    // in that section. Pinned to the host the catalog actually links, so the
    // two cannot come apart if the laboratory moves it.
    const hw = read('how-we-test.html');
    ok('how-we-test.html points at the verification route the catalog uses',
      hw.includes(verifyHost()),
      `the hw-verify paragraph must name ${verifyHost()}`);

    ok('the certificate surfaces resolve the link through verifyUrl()',
      /verifyUrl\(p\)/.test(read('js/coa.js')) &&
      /verifyUrl\(p\)/.test(read('js/products-data.js')));
  }

  // A named laboratory with a broken image beside it reads worse than the name
  // on its own, and the panel's empty-logo branch already renders that cleanly.
  // So a logo path that does not resolve is a build failure, not a page that
  // degrades quietly to an alt attribute.
  ok('the laboratory mark is a file that exists',
    !LAB.logo || fs.existsSync(path.join(ROOT, LAB.logo)),
    `LAB.logo points at ${LAB.logo}, which is not in the repository`);

  // Every mark on how-we-test.html is drawn at up to 84px. An original ten
  // times that is the same picture and ten times the bytes, on a page whose
  // whole job is to be read rather than admired.
  const heavy = (read('how-we-test.html').match(/src="(assets\/[^"]+)"/g) || [])
    .map(m => m.slice(5, -1))
    .concat(LAB.logo ? [LAB.logo] : [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(f => fs.existsSync(path.join(ROOT, f)) &&
                 fs.statSync(path.join(ROOT, f)).size > 120 * 1024);
  ok('no partner mark ships at more than 120 KB',
    heavy.length === 0,
    heavy.map(f => `${f} is ${Math.round(fs.statSync(path.join(ROOT, f)).size / 1024)} KB`).join(', '));

  // The panel reads LAB. how-we-test.html names the laboratory in prose, by
  // hand, because there is no template step for that page's sections — so it
  // is pinned here, the same way its certificate note is pinned to COA_COPY.
  // It said Freedom Diagnostics for as long as LAB did, and kept saying it
  // after the certificates arrived and LAB was corrected.
  if (LAB.name) {
    const who = (read('how-we-test.html').match(
      /<div class="hw-who-copy[^"]*">[\s\S]*?<\/div>/) || [''])[0];
    // The name verbatim, and every substantial word of the standing, in any
    // order. Requiring LAB.accreditation as one literal string would force the
    // paragraph to read like a data field; requiring its words means the prose
    // can say "their ISO/IEC 17025 accreditation is pending" and still be held
    // to saying all of it.
    const words = LAB.accreditation.split(/\s+/).filter(w => w.length >= 5);
    const absent = words.filter(w => !who.toLowerCase().includes(w.toLowerCase()));
    ok('how-we-test.html names the laboratory and its standing as the catalog does',
      who.includes(LAB.name) && absent.length === 0,
      `the hw-who-copy block must name "${LAB.name}" and say ${absent.join(', ') || LAB.accreditation}`);
  }

  // Switching laboratories is the moment a name gets left behind: it lives in
  // LAB, in prose, in an alt attribute and in an image filename, and only the
  // first of those fails loudly when it goes stale. A retired name is listed
  // here on the way out, and nothing may mention it again — not a page, not a
  // script, not a file in assets/. Removing a name from this array is how you
  // say a laboratory is back, and then LAB has to agree.
  const RETIRED_LABS = ['Freedom Diagnostics'];
  const stale = [];
  RETIRED_LABS.forEach(name => {
    if (name === LAB.name) {
      stale.push(`LAB names ${name}, which is listed as retired`);
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    // Comments are stripped first: the note in js/products-data.js explaining
    // why the name was wrong has to be allowed to say which name it was.
    // Only whole-line // comments are cut, so a URL's slashes survive.
    const bare = f => read(f)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
      .toLowerCase();
    pages.concat(['js/products-data.js', 'js/coa.js', 'js/product.js'])
      .filter(f => bare(f).includes(name.toLowerCase()))
      .forEach(f => stale.push(`${f} still names ${name}`));
    if (fs.existsSync(path.join(ROOT, 'assets', `${slug}.png`))) {
      stale.push(`assets/${slug}.png is still in the repository`);
    }
  });
  ok('no retired laboratory is still named anywhere',
    stale.length === 0, stale.join(', '));

  // The vial in every product photo carries Glow's own artwork; what actually
  // ships carries the manufacturer's generic label. A photo that doesn't
  // match what arrives is a claim PRINCIPLES.md rules out, so the caption
  // saying so has to actually reach the page, from the one string, not a
  // second copy of it that could drift from the first.
  ok('the product page carries the vial-art disclosure, from the one string',
    /id="pdRenderNote"/.test(pd) &&
    /VIAL_ART_NOTICE/.test(read('js/product.js')) &&
    /VIAL_ART_NOTICE/.test(read('tools/build-products.js')));

  // The homepage's Glow Standard cards use the same branded renders, but at the
  // size, brightness and scrim they are set to, the label on the vial is not
  // legible: there is no label being shown, so there is nothing to disclose and
  // the cards carry no notice.
  //
  // That holds only while the art stays as dark and as small as it currently
  // is. Scaling the image up or lifting its brightness, both of which have been
  // tried, brings the label back into view and puts the claim back on the page.
  // So the absence of the notice is tied to the absence of those two rules
  // rather than left to whoever next edits the stylesheet to remember.
  const mediaRule = (read('css/style.css').match(/\.standard-media\{([^}]*)\}/) || [, ''])[1];
  const zoomed = /transform:\s*[^;]*scale\(\s*(?!0?\.|1\s*\))/.test(mediaRule);
  const brightened = /filter:\s*[^;]*brightness\(\s*(?!0?\.|1\s*\))/.test(mediaRule);
  ok('the homepage renders stay too dark to show a label, or else disclose it',
    !(zoomed || brightened) || read('index.html').includes(VIAL_ART_NOTICE),
    `.standard-media is ${zoomed ? 'scaled up' : ''}${zoomed && brightened ? ' and ' : ''}` +
    `${brightened ? 'brightened' : ''}, so index.html must carry "${VIAL_ART_NOTICE}"`);

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
  // Published means every compound resolves to a document, not that the shared
  // fallback is filled. It is empty on purpose now: each product carries its
  // own batch certificate, and COA_URL would hand a reader a document that
  // does not name their lot. So the check is coverage, per compound, which is
  // what the flag actually promises.
  const noDoc = GLOW_PRODUCTS.filter(p => !coaHref(p));
  ok('every compound resolves to a certificate now that they are published',
    noDoc.length === 0,
    `${noDoc.map(p => p.name).join(', ')} would fall through to an empty COA_URL. ` +
    'Add a `coa` for each, or set COA_URL in js/products-data.js.');

  // A link to a file that is not in the repository is worse than the request
  // route it replaced: the copy around it now states the document exists.
  const missing = GLOW_PRODUCTS
    .filter(p => p.coa && !p.coa.startsWith('http'))
    .filter(p => !fs.existsSync(path.join(ROOT, p.coa)));
  ok('every certificate the catalog links is a file that exists',
    missing.length === 0, missing.map(p => `${p.name}: ${p.coa}`).join(', '));

  // The filename carries the lot, so a lot that turns over cannot quietly keep
  // serving the previous batch's certificate under the same path.
  const wrongLot = GLOW_PRODUCTS.filter(p =>
    p.coa && p.lot && !p.coa.includes(`-lot-${p.lot}.`));
  ok('each certificate filename names the lot the catalog claims for it',
    wrongLot.length === 0,
    wrongLot.map(p => `${p.name}: lot ${p.lot} vs ${p.coa}`).join(', '));
}

/* ---------------------------------------------------------------------------
 * Every page we ask to be indexed says which address it is.
 *
 *     terms, privacy and ruo-agreement sat in the sitemap for months with no
 *     canonical and, because build-meta.js derives og:url from the canonical,
 *     no og:url either. Nothing caught it: the meta build skips a page with no
 *     canonical rather than failing on one, which is right for the noindex
 *     pages and wrong for these.
 * ------------------------------------------------------------------------- */
console.log('\ncanonical addresses');
{
  const { STATIC_PAGES } = require('./build-sitemap.js');
  const listed = STATIC_PAGES.map(([f]) => f || 'index.html');
  const bare = listed.filter(f => {
    const html = read(f);
    return !new RegExp(`<link rel="canonical" href="https://glowresearch\\.shop/${
      f === 'index.html' ? '(index\\.html)?' : f.replace('.', '\\.')}" />`).test(html);
  });
  ok(`every page in the sitemap is canonical to its own URL (${listed.length})`,
    bare.length === 0,
    `${bare.join(', ')} would be indexed without saying which address to keep`);

  const noOgUrl = listed.filter(f => !/<meta property="og:url"/.test(read(f)));
  ok('and carries the og:url the meta build derives from it',
    noOgUrl.length === 0, noOgUrl.join(', '));

  // A page kept out of the sitemap because it is transactional or a fallback
  // must actually be telling crawlers that, rather than relying on absence
  // from a file they are not obliged to read.
  const shouldNotIndex = ['product.html', 'checkout.html', 'thank-you.html',
    'signin.html', 'account.html', 'reset-password.html', '404.html'];
  const stillIndexed = shouldNotIndex
    .filter(f => fs.existsSync(path.join(ROOT, f)))
    .filter(f => !/<meta name="robots" content="noindex/.test(read(f)));
  ok('every page kept out of the sitemap is noindex, not merely unlisted',
    stillIndexed.length === 0, stillIndexed.join(', '));
}

/* ---------------------------------------------------------------------------
 * The generated product pages, once they are live.
 *
 *     Turning PRODUCT_PAGES_LIVE on gives every compound a second address:
 *     /peptides/<slug>/ and product.html?p=<slug> render the same content from
 *     the same catalog. That is fine as a fallback and a duplicate-content
 *     problem as an indexable page, so which of the two search engines are
 *     told to keep is checked rather than remembered.
 * ------------------------------------------------------------------------- */
if (PRODUCT_PAGES_LIVE) {
  console.log('\ngenerated product pages');

  const slugs = GLOW_PRODUCTS.map(p => productSlug(p.name));
  const built = slugs.filter(sl => fs.existsSync(path.join(ROOT, 'peptides', sl, 'index.html')));
  ok(`every compound has a generated page (${built.length}/${slugs.length})`,
    built.length === slugs.length,
    `missing: ${slugs.filter(sl => !built.includes(sl)).join(', ')}. Run node tools/build.js`);

  const readPage = sl => read(path.join('peptides', sl, 'index.html'));

  // The renderer must not compete with the pages generated from it.
  ok('product.html is noindex now that every compound has its own URL',
    /<meta name="robots" content="noindex/.test(read('product.html')),
    'product.html?p=<slug> serves the same content as /peptides/<slug>/');

  const notIndexed = built.filter(sl => !/<meta name="robots" content="index,follow"/.test(readPage(sl)));
  ok('every generated page is indexable',
    notIndexed.length === 0,
    `${notIndexed.join(', ')} inherited the donor's noindex`);

  // A canonical pointing at itself is what tells a crawler this address is the
  // one to keep, and it is the only thing separating these from the fallback.
  const badCanonical = built.filter(sl =>
    !readPage(sl).includes(`<link rel="canonical" href="https://glowresearch.shop/peptides/${sl}/" />`));
  ok('every generated page is canonical to itself',
    badCanonical.length === 0, badCanonical.join(', '));

  // One page, one description of itself. The donor carries a WebPage entity
  // naming product.html, and copying it through gave every generated page a
  // second, conflicting identity at an address that is not even in the sitemap.
  const twoIdentities = built.filter(sl => /"@type":\s*"WebPage"/.test(readPage(sl)));
  ok('no generated page carries the donor’s WebPage schema',
    twoIdentities.length === 0,
    `${twoIdentities.join(', ')} still claim to be product.html`);

  // A share card sized to the wrong shape crops the vial instead of fitting
  // it. The donor's numbers describe the sitewide landscape image; every
  // product photo is portrait.
  const wrongShape = [];
  GLOW_PRODUCTS.forEach(p => {
    const html = readPage(productSlug(p.name));
    const w = (html.match(/og:image:width" content="(\d+)"/) || [])[1];
    const h = (html.match(/og:image:height" content="(\d+)"/) || [])[1];
    const src = (html.match(/og:image" content="[^"]*\/([^"/]+)"/) || [])[1];
    if (!w || !h || !src) { wrongShape.push(`${p.name}: no og:image dimensions`); return; }
    if (!p.image || !p.image.endsWith(src)) wrongShape.push(`${p.name}: og:image is ${src}`);
    if (w === '1672' && h === '941') wrongShape.push(`${p.name}: still the donor's dimensions`);
  });
  ok('every share card states its own image and that image’s real size',
    wrongShape.length === 0, wrongShape.join(', '));

  // Every local URL a generated page loads has to resolve from two
  // directories down. The static markup was rewritten by the generator and
  // was fine; js/product.js then re-rendered the evidence panel on load with
  // the catalog's own root-relative paths, so the laboratory mark and the
  // certificate link 404'd for a reader while a crawler saw them resolve.
  // Both go through pageHref() now, which is why this checks the runtime
  // renderers rather than only the files on disk.
  ok('the panel resolves its mark and its certificate through pageHref()',
    /pageHref\(lab\.logo\)/.test(read('js/products-data.js')) &&
    /return pageHref\(\(p && p\.coa\)/.test(read('js/products-data.js')),
    'a path rendered at runtime is relative to the page, not to the repo root');

  const brokenAsset = [];
  built.forEach(sl => {
    const html = readPage(sl);
    for (const m of html.matchAll(/(?:href|src)="((?!https?:|\/\/|mailto:|tel:|data:|#)[^"]+)"/g)) {
      const target = path.join(ROOT, 'peptides', sl, m[1].split(/[?#]/)[0]);
      if (/\.(png|jpe?g|webp|svg|css|js|pdf|woff2?)$/i.test(m[1]) && !fs.existsSync(target)) {
        brokenAsset.push(`${sl}: ${m[1]}`);
      }
    }
  });
  ok('every file a generated page asks for resolves from two directories down',
    brokenAsset.length === 0, brokenAsset.slice(0, 8).join(', '));

  // The served page and the hydrated one describe the same product, because
  // both read productMetaDesc(). They were two typed sentences before.
  const badDesc = GLOW_PRODUCTS.filter(p =>
    !readPage(productSlug(p.name)).includes(`<meta name="description" content="${productMetaDesc(p, p.sizes[0])}" />`));
  ok('every generated description comes from the catalog',
    badDesc.length === 0, badDesc.map(p => p.name).join(', '));
  ok('js/product.js sets the same description at runtime',
    /productMetaDesc\(product, s\)/.test(read('js/product.js')),
    'product.html must not retype the sentence the generator bakes in');
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

  // This used to require an answer to open with ANALYSIS_LONG verbatim, which
  // pinned the copy to a 30-word specification sentence and made the first
  // thing a reader met a wall. What actually needs guarding is that the FAQ
  // accounts for every analysis in the catalog, so that is what is checked:
  // against ANALYSIS_TESTS itself rather than a prose restatement of it. An
  // added test now fails here until the FAQ names it, which the old check
  // could not do, since ANALYSIS_LONG could go stale alongside the answer.
  const unnamedTests = ANALYSIS_TESTS
    .filter(t => !answers.toLowerCase().includes(t.name.toLowerCase()));
  ok('the FAQ names every analysis the laboratory runs',
    unnamedTests.length === 0,
    `not named in any answer: ${unnamedTests.map(t => t.name).join(', ')}`);

  // And the method, wherever the catalog records one. "Purity" alone does not
  // tell a reader it was measured by HPLC.
  const unnamedMethods = ANALYSIS_TESTS
    .filter(t => t.method && !answers.toLowerCase().includes(t.method.toLowerCase()));
  ok('and the method behind each one, where the catalog records a method',
    unnamedMethods.length === 0,
    `method missing: ${unnamedMethods.map(t => `${t.name} (${t.method})`).join(', ')}`);

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

  // The same rule, over every page rather than the FAQ alone. coa.html's hero
  // read "Purity by HPLC-UV, identity by LC-MS" long after the panel had
  // stopped claiming either, because nothing outside the FAQ was looking:
  // instrument names are the easiest kind of claim to leave behind, since they
  // sound like description rather than assertion. Comments, styles and scripts
  // are stripped so a note explaining why a method was dropped is not read as
  // the page claiming it.
  const visible = f => read(f)
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .toLowerCase();
  const pageInvented = [];
  pages.forEach(f => {
    const text = visible(f);
    methods.filter(m => text.includes(m) && !backing.includes(m))
      .forEach(m => pageInvented.push(`${f}: ${m}`));
  });
  ok('no page names an analysis the laboratory does not run',
    pageInvented.length === 0, pageInvented.join(', '));

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

console.log('\nwhat the FAQ is allowed to say about the box and the vial');
{
  const answers = FAQS.map(f => f.a).join('\n');

  // "Discreetly shipped" sat in the footer of every page for the whole life of
  // the site with nothing anywhere saying what it meant, which is a promise a
  // reader has no way to check. It is allowed to stay only while the FAQ
  // actually describes the box, in the same words the constant holds.
  const claimsDiscreet = pages.some(f => /discreetly shipped/i.test(read(f)));
  ok('the "discreetly shipped" footer claim is explained somewhere the reader can find it',
    !claimsDiscreet || answers.includes(PACKAGING_PLAIN),
    'pages promise discreet shipping but no FAQ answer says what arrives');

  // A temperature in the storage answer stops being guidance and becomes a
  // specification, held on every lot, verifiable by nobody once the vial is
  // out of the building. STORAGE_LONG carries none deliberately; this is what
  // stops a helpful-looking figure being added to it later.
  const storage = FAQS.filter(f => f.a.includes(STORAGE_LONG));
  ok('the storage answer exists and comes from STORAGE_LONG', storage.length === 1);
  // No leading \b: a boundary between a space and the minus of "-20C" does not
  // exist, so anchoring on one let exactly the figure this is here to catch
  // through. Matched on the digits and the unit instead. "C" and "F" only
  // count as a unit when nothing word-like follows, so "$300 Covered" and
  // "FedEx 2-Day" do not trip it.
  const withTemp = FAQS.filter(f =>
    /\d+\s*(?:°|deg\b|degrees\b)|\d+\s*[CF]\b/.test(f.a));
  ok('no answer commits the material to a storage temperature',
    withTemp.length === 0, withTemp.map(f => f.q).join(' | '));

  // Clause 04 of the RUO agreement says we publish no dosing or administration
  // guidance. The FAQ is the likeliest place for it to creep in, phrased as
  // helpfulness. Checked against the answers, not the questions: "can these be
  // used in humans" is a question we should be asked and should answer no to.
  const dosing = /\b(dose|doses|dosage|dosing|mcg per|mg per kg|inject|injection|subcutaneous|intramuscular|administer)\b/i;
  const offending = FAQS.filter(f => dosing.test(f.a) && !/we do not publish dosing/i.test(f.a));
  ok('no answer drifts into dosing or administration',
    offending.length === 0, offending.map(f => f.q).join(' | '));

  // The research-use-only answer is the one place on the site where the reader
  // is asking the question directly. It has to say no, and point at the
  // agreement they already accepted, rather than hedge.
  const ruo = FAQS.find(f => /humans or animals/i.test(f.q));
  ok('the research-use-only answer says no and names the agreement',
    !!ruo && /^No\./.test(ruo.a) && /RUO Agreement/.test(ruo.a));
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
  ok('llms.txt quotes the enforced dispatch window and transit',
    llms.includes(DISPATCH_LABEL) && llms.includes(`${TRANSIT_DAYS}-day FedEx`));
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

  // 15% on one compound is the ceiling, and wholesale picks up above it. If a
  // retail tier ever went past what wholesale opens at, the two ladders would
  // be advertising against each other.
  ok('the bulk ceiling is 15%', BULK_MAX_OFF === 0.15, `${BULK_MAX_OFF * 100}%`);
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
 *     price actually charged, or a markdown so far off the intended 10% that
 *     "about 10% off" stops describing it.
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

  // 8-12%: wide enough for round list prices (10% off exactly would force
  // figures like $77.77), tight enough that "about 10% off" stays true.
  const band = withList.map(({ s }) => ({ s, pct: (1 - s.price / s.list) * 100 }));
  const outside = band.filter(b => b.pct < 8 || b.pct > 12);
  ok('every markdown lands inside the band "about 10% off" describes',
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

  // The divider under the wallet button names the alternative instead of
  // gesturing at it: "or pay another way" was the only route a customer
  // without Apple Pay had, set in the same grey as the tax fine print above
  // it. Naming the card makes it a signpost, and makes it a claim, so it is
  // held to PAY_METHODS. Add crypto or bank transfer and "with a card" stops
  // being the whole truth, which is the day this fails and points here.
  {
    const methods = (coJs.match(/\{ id: '[a-z]+', label: '[^']+', note: '[^']+' \}/g) || []);
    const namesCard = /or pay with a card below/.test(coHtml);
    ok('the wallet divider names every way there is to pay',
      !namesCard || (methods.length === 1 && /id: 'card'/.test(methods[0])),
      `checkout.html says "or pay with a card below" but PAY_METHODS carries ${methods.length}: ` +
      'reword the divider in checkout.html to cover the others.');
  }
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

  // A promo code and the quantity ladder are never allowed to combine: the
  // rule lives once, in resolvePromoCodeForOrder(), and both endpoints that
  // can turn a code into a real discount have to call it rather than the
  // bare resolvePromoCode() that knows nothing about the cart's tiers.
  ok('priceOrder() reports whether the cart already earned a quantity discount',
    /hasBulkDiscount/.test(lib) && /bulkOff\(l\.qty\) > 0/.test(lib));
  ok('resolvePromoCodeForOrder() refuses a code on a cart with a quantity discount',
    /resolvePromoCodeForOrder/.test(lib) && /priced\.hasBulkDiscount/.test(lib));
  ok('api/apply-promo.js checks the combination before a code is ever applied',
    /resolvePromoCodeForOrder/.test(applyPromo));
  ok('priceOrderWithTax() checks the same combination before the charge is set',
    /resolvePromoCodeForOrder\(promoCode, priced\)/.test(lib));

  // Told once, plainly, before anyone reaches the promo box — not just as an
  // error after they have already typed a code.
  ok('the checkout page tells a bulk-discounted cart the promo box will not apply',
    /coPromoNote/.test(coHtml) && /coPromoNote/.test(coJs) && /bulkOff\(i\.qty\)/.test(coJs));
}

/* ---------------------------------------------------------------------------
 * The launch offer. A popup that says "20% off with GLOW20" is two claims the
 * catalog cannot keep true on its own: the promotion is Stripe's to end, and
 * the rate is Stripe's to change. So the value is never in the page, and the
 * endpoint that hands it out asks Stripe first.
 * ------------------------------------------------------------------------- */
console.log('\nlaunch offer');
{
  const offerJs = read('js/launch-offer.js');
  const unlock = read('api/unlock-offer.js');
  const offerPages = ['index.html', 'peptides.html', 'product.html'];
  // Pages where an interruption can only cost an order.
  const quietPages = ['checkout.html', 'thank-you.html', 'cart.html'].filter(f =>
    fs.existsSync(path.join(ROOT, f)));

  ok('the offer is described in one place, not typed into a page',
    typeof LAUNCH_OFFER === 'object' && !!LAUNCH_OFFER.code && LAUNCH_OFFER.percentOff > 0);

  // The whole point of the popup. If the code ships in the markup or the
  // script, the address is being asked for in exchange for something the
  // visitor already has.
  const leaked = [];
  [...pages, 'js/launch-offer.js', 'css/style.css'].forEach(f => {
    if (!fs.existsSync(path.join(ROOT, f))) return;
    if (read(f).includes(LAUNCH_OFFER.code)) leaked.push(f);
  });
  ok(`the code is never served to the browser before the address is given`,
    leaked.length === 0,
    `${LAUNCH_OFFER.code} appears in: ${leaked.join(', ')}`);

  ok('js/launch-offer.js reads the offer from the catalog rather than restating it',
    /LAUNCH_OFFER/.test(offerJs) && !/percentOff:\s*\d/.test(offerJs));

  // Stripe is the authority on whether the promotion is still live and what it
  // is worth. Handing out LAUNCH_OFFER.code without asking would be exactly
  // the "claim we cannot show is true" PRINCIPLES.md rules out.
  ok('api/unlock-offer.js resolves the code against Stripe before revealing it',
    /resolvePromoCode\(/.test(unlock) &&
    unlock.indexOf('resolvePromoCode(') < unlock.indexOf('sendEmail('));
  ok('and refuses rather than revealing one Stripe would not honour',
    /if\s*\(!resolved\.ok\)/.test(unlock) && /return res\.status\(503\)/.test(unlock));
  ok('the revealed discount is the rate Stripe reports, not the catalog’s copy',
    /resolved\.percentOff/.test(unlock));
  ok('resolvePromoCode() reports the coupon’s own rate for it to use',
    /percentOff:\s*percent_off\s*>\s*0/.test(read('api/_lib.js')));

  // Both, for the same reason the checkout endpoints gate: a code is worth
  // nothing while no order can be taken.
  ok('api/unlock-offer.js gates on the offer flag and on PAYMENTS_LIVE',
    /!LAUNCH_OFFER_LIVE\s*\|\|\s*!PAYMENTS_LIVE/.test(unlock));
  ok('and validates the address rather than mailing whatever it is sent',
    /isEmail\(email\)/.test(unlock));

  // The offer only appears where it was asked for, and never over a page
  // someone is trying to buy on.
  offerPages.forEach(f => {
    ok(`${f} loads the offer and names which surface it wants`,
      /js\/launch-offer\.js/.test(read(f)) &&
      /<body data-launch-offer="(bar|modal)"/.test(read(f)));
  });
  quietPages.forEach(f => {
    ok(`${f} carries no offer popup`,
      !/launch-offer/.test(read(f)));
  });

  ok('the homepage takes the quieter surface of the two',
    /<body data-launch-offer="bar"/.test(read('index.html')));

  // The email and the popup say the same thing because they read the same
  // strings. A second copy of the sentence is how the two drift.
  ok('the email is built from the same strings the popup shows',
    /LAUNCH_OFFER\.emailSubject/.test(unlock) &&
    /LAUNCH_OFFER\.emailBody/.test(unlock) &&
    /LAUNCH_OFFER\.facts/.test(unlock));

  // The three facts are the ones the rest of the site is already held to.
  ok('the offer’s supporting line claims nothing new',
    /third-party tested/i.test(LAUNCH_OFFER.facts) &&
    /research use only/i.test(LAUNCH_OFFER.facts) &&
    !/\d+\s*%/.test(LAUNCH_OFFER.facts));

  // Specified as "let them land, breathe, then show it". A popup on load is
  // the failure this timing exists to avoid.
  ok('neither surface opens on arrival',
    LAUNCH_OFFER.barDelayMs >= 12000 && LAUNCH_OFFER.modalDelayMs >= 8000);
  ok('the homepage waits longer than the catalog does',
    LAUNCH_OFFER.barDelayMs > LAUNCH_OFFER.modalDelayMs);

  // The footer form is not an interruption, so none of the popup's suppression
  // applies to it: someone who dismissed the popup must still be able to ask
  // for the code later.
  ok('the footer carries the offer rather than a second, separate form',
    /id="offerFooter"/.test(read('index.html')));
  ok('and the newsletter form that acknowledged addresses it never sent is gone',
    !/newsletterForm/.test(read('index.html')) &&
    !/newsletterForm/.test(read('js/script.js')));

  // Six events, one funnel. Named here so a rename on one side shows up as a
  // failure rather than as a metric that quietly stops counting.
  const events = [
    'email_capture_viewed', 'email_capture_closed', 'email_capture_submitted',
    'email_capture_error', 'discount_code_revealed', 'discount_code_copied',
  ];
  const missing = events.filter(e => !offerJs.includes(`'${e}'`));
  ok('every event in the capture funnel is fired', missing.length === 0,
    `not fired: ${missing.join(', ')}`);

  // Each event carries what the funnel is sliced by. Without form_location and
  // trigger_type there is no "submit rate by page" or "by trigger" to report.
  ok('the events carry the page and the trigger they came from',
    /form_location:/.test(offerJs) && /trigger_type:/.test(offerJs) &&
    /page_path:/.test(offerJs) && /form_id:/.test(offerJs));
  ok('a close reports how long it was on screen',
    /time_visible_seconds:/.test(offerJs));
  ok('a product-page capture reports which product it came from',
    /product_sku:/.test(offerJs) && /product_name:/.test(offerJs));

  // js/analytics.js already stamps every beacon with the session and the
  // session's UTMs. Repeating them per event is how the two copies drift.
  ok('the events leave session and campaign to the analytics envelope',
    !/utm_source:/.test(offerJs) && /GlowAnalytics\.track/.test(offerJs));

  // The address is the one piece of personal data the system holds. It must
  // not travel on analytics beacons, which are anonymous rows by design.
  ok('no capture event carries the address itself',
    !/track\([^)]*email:/.test(offerJs));

  // An address captured and not stored is the popup's whole purpose thrown
  // away, so the endpoint has to do something with it beyond mailing it.
  ok('a captured address is recorded, not only emailed',
    /recordLead\(/.test(unlock) &&
    unlock.indexOf('recordLead(') < unlock.indexOf('sendEmail('));
  ok('the lead is stored with the page and the campaign that produced it',
    /sourcePage/.test(unlock) && /formLocation/.test(unlock) &&
    /utmCampaign/.test(unlock) && /utmSource/.test(unlock));
  ok('and with the ids that join it back to the funnel and to an order',
    /sessionId/.test(unlock) && /anonId/.test(unlock));
  ok('storing a lead never costs the visitor the code they were promised',
    /never throws/i.test(unlock) || /catch \(e\) \{\s*console\.error\('unlock-offer: could not reach/.test(unlock));
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

  // alias ("Wolverine" under "BPC-157/TB-500") is a claim that this is what
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

/* ---------------------------------------------------------------------------
 * Privacy disclosure. The privacy policy is the one page whose copy is a
 * statement about what the system does, made to someone who cannot check. It
 * went stale the moment PAYMENTS_LIVE and the account system went true: it
 * still told readers that nothing typed into checkout was transmitted and that
 * the password field was never read, while api/auth.js was hashing passwords
 * into WooCommerce and Stripe was charging live cards.
 *
 * Nothing caught it, because every other claim on this site is derived from
 * js/products-data.js and this one was hand-written prose. These checks are
 * the substitute: the policy cannot contradict the flags, and it has to name
 * each service that actually receives customer data.
 * ------------------------------------------------------------------------- */
console.log('\nprivacy disclosure');
{
  // Comments stripped: an explanatory note about copy that was removed is not
  // itself a claim to a reader.
  const bare = f => read(f)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  if (PAYMENTS_LIVE) {
    // The exact shape of the sentence that was wrong for weeks, plus the
    // family it belongs to. Any page, not just privacy.html: signin.html
    // carried its own copy of the same claim.
    const denials = [
      /payment(s)? (is|are) not connected/i,
      /not connected to a live backend/i,
      /cannot take a card/i,
      /checkout (is )?(is not|isn't|not) (live|connected)/i,
      /once (accounts and )?payment.{0,20}go(es)? live/i,
      /when checkout goes live/i,
      /nothing typed into[^.]*is transmitted/i,
      /password field[^.]*never read/i,
      /account system is a design preview/i,
      /not real authentication/i,
    ];
    const liars = [];
    pages.forEach(f => {
      const html = bare(f);
      denials.forEach(re => { if (re.test(html)) liars.push(`${f}: ${re}`); });
    });
    ok('no page still says payment or accounts are not live',
      liars.length === 0, liars.join('\n          '));
  }

  const privacy = bare('privacy.html');

  // Each service that receives customer data has to be named. Derived from
  // what api/ actually calls rather than a list typed here, so wiring up a
  // new processor fails this until the policy admits to it.
  const apiSrc = fs.readdirSync(path.join(ROOT, 'api'))
    .map(f => read(`api/${f}`)).join('\n');
  const processors = [
    ['Stripe', /api\.stripe\.com|require\(['"]stripe|from ['"]stripe/i, /stripe/i],
    ['Resend', /resend\.com/i, /resend/i],
    ['WooCommerce', /wp-json|WC_CONSUMER_KEY/i, /woocommerce/i],
  ];
  const undisclosed = processors
    .filter(([, used]) => used.test(apiSrc))
    .filter(([, , named]) => !named.test(privacy))
    .map(([name]) => name);
  ok('the privacy policy names every service that receives customer data',
    undisclosed.length === 0,
    undisclosed.length ? `not named: ${undisclosed.join(', ')}` : '');

  // A cookie the server sets is a cookie the policy has to disclose by name.
  const cookieName = (read('api/_lib.js').match(/(\w+)=\$\{token\}/) || [])[1];
  if (cookieName) {
    ok(`the privacy policy discloses the ${cookieName} cookie`,
      privacy.includes(cookieName),
      `api/_lib.js sets ${cookieName}, privacy.html does not mention it`);
    ok('and does not claim the site sets no cookies at all',
      !/(sets?|uses?) no cookies|does not (set|use) (any )?cookies\b(?![^.]*tracking)/i.test(privacy));
  }

  // Fonts moved in-house; the policy spent that whole time telling readers
  // their browser was calling Google on every page load.
  const usesGoogleFonts = pages.some(f => /fonts\.(googleapis|gstatic)\.com/.test(read(f)));
  ok('the privacy policy does not claim third-party font loading that does not happen',
    usesGoogleFonts || !/google fonts/i.test(privacy),
    'fonts are self-hosted in assets/fonts, but privacy.html still names Google Fonts');

  // The beacon in js/analytics.js is first-party and carries no PII, but it is
  // still page-view logging, and "we don't track" has to be narrower than that.
  if (/GlowAnalytics|\/api\/track/.test(read('js/analytics.js'))) {
    ok('the privacy policy accounts for the page-view logging that actually runs',
      /page view|page-view|visit identifier|traffic dashboard/i.test(privacy));
    ok('and does not claim there is no behavioural logging of any kind',
      !/no behaviou?ral tracking\b/i.test(privacy) ||
      /third-party|cross-site/i.test(privacy));
  }

  // js/meta-pixel.js exists and can go live the moment META_PIXEL_ID is
  // filled in, with no other deploy required — so the policy has to already
  // account for the capability, not just today's on/off state. The three
  // spans it corrects at runtime (js/meta-pixel.js) are what let the default
  // "not currently" text stay honest until that flag flips.
  if (/fbq\(/.test(read('js/meta-pixel.js'))) {
    ok('the privacy policy accounts for the Meta pixel/Conversions API capability',
      /meta/i.test(privacy) && /pixel|conversions api/i.test(privacy));
    ok('and no longer claims there are no advertising pixels on the site',
      !/no advertising pixels?\b/i.test(privacy));
    ok('the runtime disclosure spans exist for meta-pixel.js to correct if the flag ever flips',
      ['metaPixelNote3', 'metaPixelNote4', 'metaPixelNote5'].every(id => privacy.includes(id)));
  }

  // Same reasoning, TikTok's pixel/Events API in place of Meta's.
  if (/ttq\.load\(/.test(read('js/tiktok-pixel.js'))) {
    ok('the privacy policy accounts for the TikTok pixel/Events API capability',
      /tiktok/i.test(privacy) && /pixel|events api/i.test(privacy));
    ok('and no longer claims there are no advertising pixels on the site',
      !/no advertising pixels?\b/i.test(privacy));
    ok('the runtime disclosure spans exist for tiktok-pixel.js to correct if the flag ever flips',
      ['tiktokPixelNote3', 'tiktokPixelNote4', 'tiktokPixelNote5'].every(id => privacy.includes(id)));
  }

  // Same reasoning again, X's pixel in place of Meta's/TikTok's.
  if (/twq\('config'/.test(read('js/x-pixel.js'))) {
    ok('the privacy policy accounts for the X pixel capability',
      /twitter/i.test(privacy) && /pixel/i.test(privacy));
    ok('and no longer claims there are no advertising pixels on the site',
      !/no advertising pixels?\b/i.test(privacy));
    ok('the runtime disclosure spans exist for x-pixel.js to correct if the flag ever flips',
      ['xPixelNote3', 'xPixelNote4', 'xPixelNote5'].every(id => privacy.includes(id)));
  }
}

/* ---------------------------------------------------------------------------
 * Deploy headers. vercel.json is the one config file whose mistakes are
 * invisible locally: nothing in the repo serves through it, so a source
 * pattern that quietly matches nothing looks identical to one that works.
 * The first version shipped with "/(.*).html", which matches /coa.html but
 * not "/" or /peptides/<slug>/, because those are directory URLs with no
 * ".html" anywhere in the path. The homepage and all ten product pages, the
 * pages that matter most, fell through with no cache rule at all.
 * ------------------------------------------------------------------------- */
console.log('\ndeploy headers');
{
  const rules = JSON.parse(read('vercel.json')).headers || [];

  // Vercel matches with path-to-regexp. Only the two shapes this file uses
  // need handling: a literal path, and a single (.*) wildcard. Matched by
  // prefix and suffix rather than by building a regex, since every character
  // class this would have to escape is one more thing to get wrong.
  function matches(source, url) {
    const star = source.indexOf('(.*)');
    if (star === -1) return source === url;
    const head = source.slice(0, star);
    const tail = source.slice(star + 4);
    return url.length >= head.length + tail.length &&
      url.startsWith(head) && url.endsWith(tail);
  }
  const headersFor = url =>
    rules.filter(r => matches(r.source, url)).flatMap(r => r.headers);
  const cacheFor = url =>
    headersFor(url).filter(h => h.key === 'Cache-Control').map(h => h.value);

  // One representative of every URL shape the site actually serves, taken from
  // the catalog rather than typed, so a new page shape is covered too.
  const htmlUrls = ['/', '/coa.html', '/peptides.html'].concat(
    PRODUCT_PAGES_LIVE ? ['/peptides/' + productSlug(GLOW_PRODUCTS[0].name) + '/'] : []
  );
  const assetUrls = ['/assets/fonts/sora.woff2'].concat(
    GLOW_PRODUCTS.filter(p => coaHref(p)).slice(0, 1).map(p => '/' + p.coa)
  );

  // Every browser script, read off disk rather than listed here, so a new one
  // is covered the day it is added.
  //
  // These were the shape this section forgot, and it cost a production error.
  // js/ had no Cache-Control rule at all: it fell through to the catch-all
  // that sets only security headers. The scripts are therefore cached
  // independently of one another, and they are not independent — one file
  // declares the sitewide constants and the others consume them by name. When
  // CUTOFF_HOUR became DISPATCH_BUSINESS_DAYS, returning visitors held a
  // cached products-data.js that still declared the old name while fetching a
  // fresh product.js that used the new one, and the product page threw
  // "DISPATCH_BUSINESS_DAYS is not defined" on the delivery estimate. Nothing
  // was wrong with either file; they were simply from different deploys.
  const scriptUrls = fs.readdirSync(path.join(ROOT, 'js'))
    .filter(f => f.endsWith('.js'))
    .map(f => '/js/' + f);

  const all = htmlUrls.concat(assetUrls, scriptUrls);

  const uncached = all.filter(u => cacheFor(u).length === 0);
  ok('every served URL shape resolves a Cache-Control rule',
    uncached.length === 0, uncached.join(', '));

  // A page frozen as immutable cannot be corrected: someone who saw a wrong
  // price would keep seeing it for a year. Only /assets/ is safe to freeze.
  const frozen = htmlUrls.filter(u => cacheFor(u).some(v => /immutable/.test(v)));
  ok('no HTML page is served immutable', frozen.length === 0, frozen.join(', '));

  // The scripts have to revalidate for the same reason, and one more: they
  // have to agree with each other. A script held past a deploy that renamed a
  // shared constant is a page that half works.
  const frozenScripts = scriptUrls.filter(u => cacheFor(u).some(v => /immutable/.test(v)));
  ok('no browser script is served immutable', frozenScripts.length === 0,
    frozenScripts.join(', '));
  const stale = scriptUrls.filter(u => !cacheFor(u).some(v => /must-revalidate|no-store|no-cache/.test(v)));
  ok('every browser script is revalidated, so siblings cannot come from different deploys',
    stale.length === 0, stale.join(', '));

  ok('assets are served immutable',
    assetUrls.every(u => cacheFor(u).some(v => /immutable/.test(v))));

  const unprotected = htmlUrls.filter(u =>
    !headersFor(u).some(h => h.key === 'X-Content-Type-Options'));
  ok('every page carries the security headers',
    unprotected.length === 0, unprotected.join(', '));

  // Two different Cache-Control rules on one URL is a coin flip on which wins.
  const conflicted = all.filter(u => new Set(cacheFor(u)).size > 1);
  ok('no URL matches two conflicting Cache-Control rules',
    conflicted.length === 0, conflicted.join(', '));
}

/* ---------------------------------------------------------------------------
 * Client-side navigation depth. A link in HTML is checked by the broken-link
 * pass and by rewriteDepth() on the generated pages. A redirect written in
 * JavaScript is checked by neither, and js/express-pay.js carried a bare
 * "thank-you.html" that was correct for as long as it only ran on
 * checkout.html at the root. The product pages then moved to
 * /peptides/<slug>/ and started running the same file, so a wallet payment
 * that had already been captured and turned into an order redirected the
 * buyer to /peptides/<slug>/thank-you.html and showed them a 404.
 * ------------------------------------------------------------------------- */
console.log('\nclient-side navigation');
{
  const navScripts = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));

  // A redirect to a string literal that is not absolute and not routed
  // through a depth helper. Variables and template reads are left alone:
  // what is being caught is a hardcoded page name.
  const bare = [];
  navScripts.forEach(f => {
    const src = read(`js/${f}`)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    // The whole right-hand side, not just a literal sitting directly after the
    // "=". The bug this exists for was written as `cfg.thankYouHref ||
    // 'thank-you.html'`, where the literal is a fallback rather than the
    // assignment, and a pattern anchored on the "=" walked straight past it.
    const re = /location\s*\.\s*(?:href\s*=|replace\s*\(|assign\s*\()([^;]*)/g;
    for (const m of src.matchAll(re)) {
      // Literals already routed through the depth helper are the fix, not the
      // defect, so they come out before anything is judged.
      const rhs = m[1].replace(/pageHref\s*\(\s*(['"])[^'"]*\1\s*\)/g, '')
                      .replace(/root\s*\(\s*\)\s*\+\s*(['"])[^'"]*\1/g, '');
      for (const lit of rhs.matchAll(/(['"])([^'"]+)\1/g)) {
        const target = lit[2];
        if (/^(https?:)?\/\//.test(target)) continue;      // absolute, deliberate
        if (/^(mailto:|tel:|#|\/)/.test(target)) continue; // non-navigational or root-relative
        if (!/\.html?$/i.test(target)) continue;           // not a page name
        bare.push(`js/${f}: ${target}`);
      }
    }
  });
  ok('no script redirects to a bare relative page name',
    bare.length === 0,
    bare.length ? `${bare.join(', ')} — route it through pageHref() so it resolves from /peptides/<slug>/ too` : '');

  // The two that matter by name, checked positively rather than by absence, so
  // deleting the redirect does not read as a pass.
  ['js/express-pay.js', 'js/checkout.js'].forEach(f => {
    const src = read(f);
    if (!/thank-you\.html/.test(src)) return;
    ok(`${f} sends the buyer to the confirmation page through pageHref()`,
      /pageHref\(\s*'thank-you\.html'\s*\)/.test(src));
  });

  // Both redirects call pageHref() unguarded, which is only safe while
  // js/products-data.js is loaded ahead of them on every page that runs them.
  // Reordering the script tags would turn a confirmation redirect into a
  // ReferenceError immediately after a card was charged.
  ['js/express-pay.js', 'js/checkout.js'].forEach(dep => {
    const hosts = pages.filter(f => read(f).includes(`${dep}"`));
    const wrong = hosts.filter(f => {
      const html = read(f);
      const data = html.indexOf('js/products-data.js"');
      const user = html.indexOf(`${dep}"`);
      return data === -1 || data > user;
    });
    ok(`every page loading ${dep} loads js/products-data.js before it`,
      hosts.length > 0 && wrong.length === 0,
      hosts.length ? wrong.join(', ') : `no page loads ${dep}`);
  });

  // 404.html is the one page the server can return under any URL, so a
  // relative stylesheet resolves against whatever path was missed and the
  // page renders unstyled. Everything on it has to be root-relative.
  const relative = [...read('404.html')
    .matchAll(/(?:href|src)="(?!https?:|\/\/|\/|#|mailto:|tel:|data:)([^"]+)"/g)]
    .map(m => m[1]);
  ok('404.html references every asset from the root, so it renders wherever it is served',
    relative.length === 0, relative.join(', '));
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
