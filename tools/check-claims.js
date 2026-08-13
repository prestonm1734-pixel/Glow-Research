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
  ANALYSIS_SHORT, ANALYSIS_LONG, ANALYSIS_NOT_RUN, SOURCE_LONG, evidenceRows, evidenceHtml,
  identityLine, FAQS, faqHtml, COA_COPY, productCardHtml, fmtPrice, salePrice,
  QTY_TIERS, tierFor, getProductVariants, unitPriceAt, BULK_MAX_OFF, bulkNote, tierLabel,
  catFilterGroup, CART_UPSELL, cartUpsell, CAT_LABEL, PAYMENTS_LIVE, PAYMENT_COPY,
} = require(path.join(ROOT, 'js/products-data.js'));

let failures = 0;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function ok(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${!cond && detail ? `\n          ${detail}` : ''}`);
}

// Every page a customer can land on. Blog posts carry the same marquee.
const pages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .concat(fs.readdirSync(path.join(ROOT, 'blog'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => `blog/${d.name}/index.html`));

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

  // shipping.html states it as a counted figure rather than in a sentence.
  const ship = read('shipping.html').match(/data-count="(\d+)">\d+<\/span> days<\/b><span>FedEx Express transit/);
  ok('the shipping page figure is the same number',
    ship !== null && Number(ship[1]) === TRANSIT_DAYS,
    ship ? `page says ${ship[1]}` : 'figure not found in shipping.html');

  ok('the delivery estimate reads the shared constant, not its own copy',
    !/const TRANSIT_DAYS/.test(read('js/product.js')) && /TRANSIT_DAYS/.test(read('js/product.js')));
}

/* ---------------------------------------------------------------------------
 * 3d. The Glow Standard panel. This is the strongest claim surface on the site:
 *     it tells a buyer that what they are reading is a record of the vial in
 *     front of them. That is only worth saying if the panel is structurally
 *     unable to state anything the catalog does not hold, which is what the
 *     checks below enforce. The failure to prevent is a panel that keeps
 *     reading like a record after the data behind a row has gone away.
 * ------------------------------------------------------------------------- */
console.log('\nthe Glow Standard panel');
{
  const pd = read('product.html');

  ok('the product page carries the panel', /id="pdEvidence"/.test(pd));
  // The line under the product name is built by identityLine(), not stored, so
  // it follows the mg picker and cannot contradict the name or the fill form.
  ok('the buy box carries a derived identity line',
    /id="pdIdentity"/.test(pd) &&
    /identityLine\(product, s\)/.test(read('js/product.js')) &&
    /identityLine\(p, s\)/.test(read('tools/build-products.js')));

  // The Product schema uses about[0], the first paragraph of the compound's
  // description, not the catalog's summary blurb. It is a real per-compound
  // explanation of what the compound is and how it is studied, the full depth
  // that someone landing from a search engine deserves to see.
  ok('the Product schema uses the full description, not the summary',
    /description: p\.about\[0\]/.test(read('tools/build-products.js')));
  ok('the panel is rendered from the catalog, not from its own markup',
    /evidenceHtml\(/.test(read('js/product.js')) &&
    /evidenceHtml\(/.test(read('tools/build-products.js')),
    'js/product.js and tools/build-products.js must both render from evidenceHtml()');

  // The served markup is what a crawler reads and what shows before scripts
  // run, so it has to be the same rows the code produces. Compared as
  // whitespace-normalised markup: the hand-written donor is indented
  // differently from the generated string, and only the content has to match.
  const norm = s => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  // product.html is the donor every generated page is cut from, so it cannot
  // regenerate itself the way peptides/<slug>/ does. Rather than leave that as
  // a step someone has to remember after flipping COAS_PUBLISHED, the failure
  // prints the markup to paste. Flipping the flag then stays a one-line change
  // plus a paste the build hands you, not a hunt.
  const baked = pd.match(/id="pdEvidence"[^>]*>([\s\S]*?)<\/dl>/);
  ok('the served panel matches what the code renders',
    baked !== null && norm(baked[1]) === norm(evidenceHtml({})),
    'product.html has drifted from evidenceHtml(). Replace the contents of\n' +
    '          <dl id="pdEvidence"> with:\n' + evidenceHtml({}));

  // The Verify row names the analyses in three words. process.html names them
  // in a sentence. The short form must not name one the long one does not:
  // "LC-MS" is a different instrument from "HPLC, and separately mass
  // spectrometry", and a data cell is where that substitution goes unnoticed.
  ok('the process page states the analysis the panel summarises',
    read('process.html').includes(ANALYSIS_LONG),
    `process.html does not contain "${ANALYSIS_LONG}"`);
  const named = ANALYSIS_SHORT.split(/[+·,]/).map(s => s.trim().toLowerCase());
  const unbacked = named.filter(m => !ANALYSIS_LONG.toLowerCase().includes(m));
  ok('the panel names no analysis the laboratory does not run',
    unbacked.length === 0, `unbacked: ${unbacked.join(', ')}`);

  // The manufacturing claim is hedged everywhere it appears, deliberately. A
  // four-word data cell is exactly where that hedge gets dropped by accident.
  ok('the source row keeps the cGMP-aligned hedge',
    /cGMP-aligned quality practices/.test(SOURCE_LONG) &&
    read('process.html').includes('cGMP-aligned quality practices'));
  const overclaims = pages.filter(f =>
    /\bGMP[\s-]?(certified|approved|compliant)\b/i.test(read(f)));
  ok('no page upgrades that to a GMP certification', overclaims.length === 0,
    overclaims.join(', '));

  // The Verify row states this compound's purity. It is the only per-product
  // number on the panel, which makes it the only one that can be wrong about
  // the vial in front of someone, so it has to be the catalog's figure and
  // nothing else. Same rule as the hero average: edit the catalog, not the page.
  //
  // `verifyValue` is the one deliberate exception: a product this panel does
  // not truthfully describe as written (Bacteriostatic Water was never run
  // through the peptide testing panel) states so explicitly rather than
  // inheriting "<purity> purity" as if it had been. For those products this
  // checks the row echoes verifyValue exactly, so the override itself cannot
  // silently drift from what evidenceRows() renders.
  const wrongPurity = GLOW_PRODUCTS.filter(prod => {
    const row = evidenceRows(prod).find(r => r.key === 'verify');
    const want = prod.verifyValue || `${prod.purity} purity`;
    return row.value !== want;
  });
  ok('the Verify row states the catalog purity for every compound, or its documented override',
    wrongPurity.length === 0, wrongPurity.map(prod => prod.name).join(', '));
  ok('a product with no purity yet shows the null indicator, not a number',
    evidenceRows({}).find(r => r.key === 'verify').value === '—');

  // "Lot-matched batch documentation" is true of how the business runs, and it
  // is silent on the question a buyer is actually asking: can I have it. While
  // certificates are held, only the note answers that, so the note is the part
  // that must not go missing. A four-row panel is exactly where a sub-line gets
  // deleted for looking untidy.
  const rows = evidenceRows({});
  const doc = rows.find(r => r.key === 'document');
  ok('the panel has a document row', Boolean(doc));
  if (!COAS_PUBLISHED) {
    ok('the document row says how to actually get the certificate',
      Boolean(doc) && /on request/i.test(doc.note) && /support@glowresearch\.shop/.test(doc.note),
      `note reads: "${doc && doc.note}"`);
    ok('and offers no link, because there is nothing to open',
      Boolean(doc) && !doc.link);
  }
  ok('every row carries a note',
    rows.every(r => r.note && r.note.trim().length > 0),
    rows.filter(r => !r.note).map(r => r.key).join(', '));

  // A lot number is the one thing a reader can check against the vial in their
  // hand, which makes an invented one the worst thing this page could print.
  // Nothing holds lot codes today, so this currently forbids all of them: the
  // day the catalog carries real ones, they are the only ones allowed through.
  const held = new Set(GLOW_PRODUCTS.map(p => p.lot).filter(Boolean));
  const invented = [];
  pages.forEach(f => {
    for (const m of read(f).matchAll(/\bGR-[A-Z0-9]{2,}-[\d-]{3,}\b/g)) {
      if (!held.has(m[0])) invented.push(`${f}: ${m[0]}`);
    }
  });
  ok('no page prints a lot number the catalog does not hold', invented.length === 0,
    invented.join(', '));
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

  // `blurb` is the catalog's mechanism-only summary, never displayed on the page
  // or in the schema. It is a five-field source-of-truth check — if the rules
  // in products-data.js slip, something the audit is supposed to catch gets
  // softer. So it is length-capped not for display but to keep the rule
  // observable: a blurb that spirals to four sentences stops being a summary
  // and starts being a description that happened to not drift from about[0].
  const BLURB_MAX = 130;
  const long = GLOW_PRODUCTS.filter(p => p.blurb.length > BLURB_MAX);
  ok(`every blurb stays within the summary budget (${BLURB_MAX} chars)`, long.length === 0,
    long.map(p => `${p.name} is ${p.blurb.length}`).join(', '));

  // Two sentences: what it is, how it is studied. A blurb that stops after the
  // first has told a buyer nothing about why we stock it.
  const oneLiner = GLOW_PRODUCTS.filter(p => (p.blurb.match(/\.\s|\.$/g) || []).length < 2);
  ok('every blurb says both what it is and how it is studied',
    oneLiner.length === 0, oneLiner.map(p => p.name).join(', '));

  // The identity line is the most-read sentence on the product page and the
  // only one a customer sees before deciding, so it is the last place a claim
  // should ever appear. It states the vial and the intended use, nothing else.
  const badLine = [];
  GLOW_PRODUCTS.forEach(prod => prod.sizes.forEach(sz => {
    const line = identityLine(prod, sz);
    const hits = [...new Set((line.match(OUTCOME) || []).map(h => h.toLowerCase()))];
    if (hits.length) badLine.push(`${prod.name} ${sz.mg}: "${hits.join('", "')}"`);
    if (!line.startsWith(`${prod.name} ${sz.mg} `)) badLine.push(`${prod.name} ${sz.mg}: wrong vial`);
    if (!/ for in vitro research\.$/.test(line)) badLine.push(`${prod.name} ${sz.mg}: no research-use framing`);
  }));
  ok('every identity line names the vial and the intended use, and nothing else',
    badLine.length === 0, badLine.join('\n          '));

  ok('the fill form is a catalog value, not a word typed into the sentence',
    /\$\{p\.form \|\| DEFAULT_FORM\}/.test(read('js/products-data.js')),
    'identityLine() must read the form from the product, so the import can correct it');

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

  // And a filter chip for its group (Peptides or Supplies), or the category
  // exists but cannot be browsed to at all. The chip row groups the seven
  // research categories under one "Peptides" chip rather than exposing each
  // by name, so this checks catFilterGroup(cat) has a chip, not cat itself.
  const chips = new Set([...read('peptides.html').matchAll(/data-filter="([^"]+)"/g)].map(m => m[1]));
  const unbrowsable = [...new Set(GLOW_PRODUCTS.map(p => catFilterGroup(p.cat)))].filter(c => !chips.has(c));
  ok('every category has a filter chip on the catalog page',
    unbrowsable.length === 0, unbrowsable.join(', '));
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
  const discPages = ['process.html', 'about.html', 'shipping.html', 'wholesale.html'];
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

  // The point of the rebuild: a step is a heading, one sentence, and who did
  // it. A paragraph creeping back into the visible half undoes it silently.
  const proc = read('process.html');
  const LEAD_MAX = 130;
  const leads = [...proc.matchAll(/<p class="pr-lead">([\s\S]*?)<\/p>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
  ok('the process chain still has six steps', leads.length === 6, `found ${leads.length}`);
  const longLead = leads.filter(l => l.length > LEAD_MAX);
  ok(`every step is one scannable line (${LEAD_MAX} chars)`, longLead.length === 0,
    longLead.map(l => `${l.length}: "${l.slice(0, 50)}…"`).join('\n          '));
  // "U.S." ends in a full stop without ending a sentence, and two of the six
  // steps say it, so initialisms come out before the sentences are counted.
  const multiSentence = leads.filter(l =>
    ((l.replace(/\b(?:[A-Z]\.)+/g, '').match(/[.!?](\s|$)/g)) || []).length > 1);
  ok('no step summary has grown a second sentence', multiSentence.length === 0,
    multiSentence.join(' | '));

  // Four of the six steps are performed by someone other than Glow. Saying so
  // on every step is the honest half of this page, and it survives the rebuild.
  const whos = (proc.match(/class="pr-who"/g) || []).length;
  ok('every step still names who performs it', whos === 6, `found ${whos}`);
  const discs = (proc.match(/<details class="disc">/g) || []).length;
  ok('every step keeps its details behind a disclosure', discs >= 6, `found ${discs}`);
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
} else {
  ok('COA_URL is set now that certificates are published',
    /const COA_URL\s*=\s*'[^']+'/.test(read('js/products-data.js')));
}

/* ---------------------------------------------------------------------------
 * 4b. The published principles. about.html prints the five non-negotiables so
 *     a customer can hold us to a rule they can read. That makes PRINCIPLES.md
 *     and the page two copies of one thing, which is the drift this file
 *     exists to prevent: edit the doctrine without editing the page and the
 *     site is quoting a rule we no longer keep.
 * ------------------------------------------------------------------------- */
console.log('\npublished principles');
{
  const canonical = [...read('PRINCIPLES.md').matchAll(/^\*\*\d\.\s*(.+?)\*\*$/gm)].map(m => m[1]);
  const published = [...read('about.html').matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  ok('PRINCIPLES.md still states five', canonical.length === 5, `${canonical.length} found`);
  ok('about.html publishes the same five, in the same order',
    canonical.length === 5 && canonical.join(' | ') === published.join(' | '),
    `md: ${canonical.join(' | ')}\n          page: ${published.join(' | ')}`);

  // the North Star and the pinned line are quoted on the page too. Both are
  // blockquotes in the markdown, so strip the "> " gutter and the bold marks
  // before comparing — the sentence is the thing that has to match, not the
  // formatting around it.
  const plain = s => s.replace(/^\s*>\s?/gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ');
  const about = plain(read('about.html'));
  const doctrine = plain(read('PRINCIPLES.md'));
  [
    'Would this make an existing Glow customer more likely or less likely to ever need another supplier?',
    'Never let growth turn Glow into the company we built Glow to replace.',
  ].forEach(line => {
    ok(`quoted verbatim: "${line.slice(0, 42)}…"`,
      about.includes(line) && doctrine.includes(line),
      `page ${about.includes(line)}, doctrine ${doctrine.includes(line)}`);
  });
}

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
 * 7b. Where the company is. The About page is the page that ranks for "peptide
 *     supplier San Diego", and the town and state have to be in the copy a
 *     reader sees, not only in the meta description and the schema. This check
 *     exists because shortening that page's lede dropped "California" from the
 *     visible text in one edit while every <head> tag still said it, which is
 *     the failure that looks fine in a diff and costs a local search result.
 *
 *     Body copy only: <head>, <script> and the footer address are stripped
 *     before the search, so a postal address in the footer cannot stand in for
 *     the page actually saying where the business is.
 * ------------------------------------------------------------------------- */
console.log('\nlocation');
{
  const ab = read('about.html');
  const body = (ab.match(/<main[\s\S]*?<footer/) || [ab])[0]
    .replace(/<script[\s\S]*?<\/script>/g, '');
  ok('the About page says San Diego in its visible copy', /San Diego/.test(body));
  ok('and names the state, which the schema and meta cannot do for it',
    /California/.test(body));

  // The address in the Organization schema is the one Google reconciles against
  // a Business Profile, so it has to agree with the footer rather than be a
  // second address nobody maintains.
  const org = read('index.html');
  ok('the Organization schema carries the postal address',
    /"addressLocality":\s*"San Diego"/.test(org) && /"addressRegion":\s*"CA"/.test(org));
  const street = (org.match(/"streetAddress":\s*"([^"]+)"/) || [, ''])[1];
  const footerPages = pages.filter(f => read(f).includes('site-footer'));
  const mismatched = footerPages.filter(f => !read(f).includes(street));
  ok('every page footer states the same street address as the schema',
    street !== '' && mismatched.length === 0,
    street === '' ? 'no streetAddress in the schema' : `missing from ${mismatched.join(', ')}`);
}

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
  // cannot describe an instrument the evidence panel and process.html do not.
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
  // edit here. The COA blog post explaining what an endotoxin line means on
  // someone else's certificate is fine; "we test for" is not — and neither is
  // the FAQ itself explaining that we do not, which is exactly the sentence
  // this pattern would otherwise flag, so a match containing "not" is read as
  // the honest denial it is rather than the claim this check exists to catch.
  const claims = new RegExp(
    `\\b(?:we|glow)\\b[^.]{0,80}?\\b(?:tests?|tested|testing|screens?|screened|assays?|assayed)\\b[^.]{0,80}?\\b(?:${ANALYSIS_NOT_RUN.join('|')})`,
    'gi');
  const claiming = pages.filter(f => {
    const matches = read(f).match(claims) || [];
    return matches.some(m => !/\bnot\b/i.test(m));
  });
  ok('no page claims a test that is not run', claiming.length === 0,
    claiming.join(', '));

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
/* ---------------------------------------------------------------------------
 * 7f. The About page's facts table. Ten rows of prose, three of which restate
 *     values the catalog already holds. Two of those are pinned here.
 *
 *     The Testing row is the one that matters: it reads "COA on request",
 *     which is COA_COPY.short in its held state, typed by hand. Flip
 *     COAS_PUBLISHED and the cart, the FAQ, the account area, the product page
 *     and the evidence panel all upgrade while this row keeps telling people
 *     to email us. Same contract as the evidence panel in product.html: the
 *     markup is a hand edit, and the audit is what stops it going stale.
 * ------------------------------------------------------------------------- */
console.log('\nAbout page facts');
{
  const rows = Object.fromEntries([...read('about.html')
    .matchAll(/<dt>(.*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
    .map(m => [m[1].trim(), m[2].replace(/\s+/g, ' ').trim()]));

  ok('the facts table is still there', Object.keys(rows).length >= 8,
    `found ${Object.keys(rows).length} rows`);

  ok(`the Testing row states the current certificate route ("${COA_COPY.short}")`,
    (rows.Testing || '').includes(COA_COPY.short),
    `reads "${rows.Testing}" — COAS_PUBLISHED changed without updating about.html`);

  // The regulatory hedge, taken from SOURCE_LONG rather than restated, so
  // softening or strengthening it in the catalog fails here until the page
  // agrees. "operating to ..." is the part that carries the qualification.
  const hedge = SOURCE_LONG.slice(SOURCE_LONG.indexOf('operating to'));
  ok('the Manufacturing row keeps the hedge SOURCE_LONG carries',
    (rows.Manufacturing || '').includes(hedge),
    `expected "...${hedge}", got "${rows.Manufacturing}"`);

  // Covered globally by the cutoff and transit scans, checked here too because
  // this row is the compact restatement someone is most likely to hand-edit.
  ok('the Dispatch row quotes the enforced cutoff and transit',
    (rows.Dispatch || '').includes(CUTOFF_LABEL) &&
    (rows.Dispatch || '').includes(`${TRANSIT_DAYS}-day FedEx`),
    rows.Dispatch);
}

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

  // The process page's ItemList is a second copy of the six steps. It already
  // drifted once, describing the pre-rewrite page down to a step name that no
  // longer existed, so it is pinned to the markup it summarises.
  const proc = read('process.html');
  const schema = JSON.parse(proc.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const steps = schema.mainEntity.itemListElement;
  // The step titles are h2 with the section heading above them gone, and the
  // class is what keeps this off the page's other h2.
  const h3s = [...proc.matchAll(/<h2 class="pr-t">(.*?)<\/h2>/g)].map(m => m[1]).slice(0, 6);
  const leads = [...proc.matchAll(/<p class="pr-lead">([\s\S]*?)<\/p>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 6);
  const drifted = h3s.filter((h, i) =>
    !steps[i] || steps[i].name !== h || steps[i].description !== leads[i]);
  ok('the process ItemList describes the steps actually on the page',
    steps.length === 6 && drifted.length === 0,
    drifted.map(h => `"${h}"`).join(', '));

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
  ok('the savings figure uses the derived price',
    /savings = \(\) => items\.reduce\(\(n, i\) => n \+ \(i\.unitOriginal - lineUnit\(i\)\)/.test(cart));
  // checkout.js and api/create-order.js both total from items(), so this is
  // the number the customer is actually charged.
  ok('items() hands out the derived price, not the stored one',
    /items: \(\) => items\.map\(i => Object\.assign\(\{\}, i, \{ unitSale: lineUnit\(i\) \}\)\)/.test(cart));
  ok('no cart total multiplies the stored unitSale',
    !/\bi\.unitSale \* i\.qty/.test(cart) && !/item\.unitSale \* item\.qty/.test(cart),
    'a stored unitSale is a snapshot of the quantity at the time it was added');
}

console.log('\ncheckout gate');
{
  const order = read('api/create-order.js');
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

  // While it is false, the order-confirmation email must not exist to be sent
  // — checked structurally above — but if PAYMENTS_LIVE is ever flipped back
  // on, the emails still must not claim a payment the site cannot take. This
  // guards the wording itself so a future re-read of this file does not need
  // to rediscover why the check above exists.
  ok('the confirmation email states a payment was received',
    /have your order and your payment of/i.test(order),
    'expected wording so PAYMENTS_LIVE stays the only thing gating it');
}

console.log('\npayments');
{
  const order = read('api/create-order.js');
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
  // already exists is not a verification.
  {
    const verifyAt = order.indexOf("stripeGet(`/payment_intents/");
    const firstWcCall = order.search(/\bwc\(/);
    ok('the Stripe verification runs before the WooCommerce order is created',
      verifyAt !== -1 && firstWcCall !== -1 && verifyAt < firstWcCall);
  }

  ok('create-order.js checks the charged amount against a freshly priced total',
    /priceOrder\(/.test(order) && /amount_received/.test(order));

  // This is the check that would have caught the bug this whole feature
  // replaced: WooCommerce line totals priced from whatever the browser sent
  // (i.unitSale on the raw request body) rather than from the catalog.
  // Scoped to the block that actually builds line_items/fee_lines, between
  // its declaration and shipping_lines right after — not the whole file,
  // because the email renderers further down legitimately read `.unitSale`
  // off priced.lines (trusted, catalog-derived) under the same shorthand
  // variable name. Checking the whole file would also trip on this very
  // comment mentioning the literal it is watching for.
  {
    const start = order.indexOf('const line_items = [];');
    const end = order.indexOf('const shipping_lines = ', start);
    const block = (start !== -1 && end !== -1) ? order.slice(start, end) : order;
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
