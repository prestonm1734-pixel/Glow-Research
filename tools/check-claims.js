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
  avgPurity, BATCHES_TESTED, TRANSIT_DAYS,
  ANALYSIS_SHORT, ANALYSIS_LONG, SOURCE_LONG, evidenceHtml,
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
    for (const m of read(f).matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*PST\b/gi)) {
      const [, h, mins, ap] = m;
      if (+h !== h12 || ap.toUpperCase() !== meridiem || (mins && mins !== '00')) {
        wrong.push(`${f}: "${m[0]}"`);
      }
    }
  });
  ok(`every stated cutoff is ${stated} PST`, wrong.length === 0, wrong.join(', '));

  // The words a customer reads are built from the hour, not typed beside it.
  ok('the cutoff wording is derived from the hour',
    /const CUTOFF_LABEL\s*=\s*\n?\s*`\$\{CUTOFF_HOUR/.test(read('js/products-data.js')));
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
  ok('the panel is rendered from the catalog, not from its own markup',
    /evidenceHtml\(/.test(read('js/product.js')) &&
    /evidenceHtml\(/.test(read('tools/build-products.js')),
    'js/product.js and tools/build-products.js must both render from evidenceHtml()');
  ok('the documentation tab is too',
    /docHtml\(/.test(read('js/product.js')) && /docHtml\(/.test(read('tools/build-products.js')));

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

  // The panel says "HPLC · Mass spec" in four words. process.html says it in a
  // sentence. The short form must not name an analysis the long one does not.
  ok('the process page states the analysis the panel summarises',
    read('process.html').includes(ANALYSIS_LONG),
    `process.html does not contain "${ANALYSIS_LONG}"`);
  const named = ANALYSIS_SHORT.split('·').map(s => s.trim().toLowerCase());
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

  // A lot number is the one value on the panel a reader can check against the
  // vial in their hand, which makes an invented one the worst thing the page
  // could print. Nothing may state a lot code the catalog does not carry.
  const held = new Set(GLOW_PRODUCTS.map(p => p.lot).filter(Boolean));
  const invented = [];
  pages.forEach(f => {
    for (const m of read(f).matchAll(/\bGR-[A-Z0-9]{2,}-[\d-]{3,}\b/g)) {
      if (!held.has(m[0])) invented.push(`${f}: ${m[0]}`);
    }
  });
  ok('no page prints a lot number the catalog does not hold', invented.length === 0,
    invented.join(', '));

  // analysedOn() is called whenever `lot` is set, so an import that fills one
  // field and not the other would render "Invalid Date" to a customer.
  const halfRecords = GLOW_PRODUCTS.filter(p => Boolean(p.lot) !== Boolean(p.tested));
  ok('every imported lot carries its analysis date', halfRecords.length === 0,
    halfRecords.map(p => p.name).join(', '));
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
