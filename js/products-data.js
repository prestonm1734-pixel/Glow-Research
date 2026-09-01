// ===================== Glow Research — shared product catalog =====================
// Used by both the homepage catalog preview (index.html) and the full
// catalog page (shop.html, served at /shop) so the product list only lives in one place.

// `blurb` describes what each compound *is* and how it is studied, in two short
// sentences. It must stay structural and in-vitro framed: no dosing, no human
// outcome claims, nothing that would read as therapeutic guidance on a
// research-use-only listing.
//
// The distinction that matters, and the one check-claims.js now enforces rather
// than trusting this comment: name the *mechanism*, never the *outcome*.
// "angiogenic signalling" is a pathway a laboratory measures. "tissue repair" is
// a benefit, and on a page with a Add to cart button a regulator reads it as a
// claim that this product delivers one. Receptors, pathways, assays and binding
// behaviour are safe ground. Healing, recovery, improvement and treatment are
// not, however carefully the sentence around them is framed.
//
// It is also the short description read under the product name in the buy
// box, so it is short by requirement, not by taste: two sentences is the
// budget.
//
// `sizes` is the mg picker on the product page, cheapest first. The first entry
// is the one the catalog grid, search and quick-add all quote, so it doubles as
// the product's headline size/price (see the normalise pass below).
//
// `purity`, `lot`, `tested`, `coaRef` and every figure in `results` are read
// off that compound's certificate, the same PDF `coa` points at. All ten were
// checked against the documents when they were hosted and every purity and lot
// already in this file matched. When a lot turns over, replace the whole group
// together from the new certificate: they describe one document, and a `lot`
// updated without the `coa` beside it is a page citing a batch whose paperwork
// it does not link.
//
// `results` is keyed by row name from ANALYSIS_TESTS. Purity is deliberately
// absent from it: the panel reads `purity` for that row, so the headline figure
// and the panel row cannot disagree. A key that is not an ANALYSIS_TESTS row is
// an analysis this lot was given and others were not, and renders under its own
// heading. See ANALYSIS_SOME_LOTS.
//
// `coa` is that compound's own certificate of analysis, and it is what "View
// certificate of analysis" opens. Filenames carry the lot, so a new lot lands
// as a new file rather than quietly overwriting the certificate a past order
// was shipped against. A product without one falls back to COA_URL below.
//
// `blurb` is a summary of `about[]`, not a second description that could
// contradict it; the generated page's Product schema `description` is
// `about[0]`, the fuller sentence.
//
// `about` and `research` fill the accordions under the buy box. Same rule as
// `blurb`: composition and what laboratory work examines, never dosing,
// outcomes, or a finding we cannot stand behind.

// One certificate link shared by every product that has no `coa` of its own.
// Empty, and it should stay that way: every launch compound carries its own
// batch certificate, and a shared fallback is a document that does not name
// the reader's lot. It exists so a compound added before its certificate is
// hosted degrades to something rather than nothing, not as a substitute for
// per-lot paperwork. Left empty the box stays put and simply is not clickable,
// which is better than sending a buyer to a dead link.
const COA_URL = '';

// Where the laboratory lets anyone check one of its reports, with the report
// reference appended.
//
// Not a URL we invented: it is the target of the QR code printed on every one
// of the ten certificates, and each QR carries that certificate's own code.
// All ten were decoded and every code matched the `coaRef` already in the
// catalog, which is what makes it safe to build each link from data instead
// of storing a second copy of the URL per product.
//
// It points at their site rather than a page of ours, on purpose. A
// verification step we host is us confirming our own paperwork, which is the
// exact thing every claim on this subject exists to avoid. Empty it and every
// surface drops the link rather than offering a check that goes nowhere.
//
// It lives up here rather than inside LAB, where it is read from, because the
// FAQ answer that names the host is written before LAB is.
const LAB_VERIFY_URL = 'https://accumarklabs.com/verify?code=';

// The host on its own, for copy that names where a reader is being sent
// rather than linking it.
const verifyHost = () =>
  LAB_VERIFY_URL.replace(/^https?:\/\//, '').replace(/[/?].*$/, '');

// ---------------------------------------------------------------------------
// Are certificates hosted and linked per batch yet?
//
// Every lot is third-party tested and has a batch-specific certificate. The
// question this flag answers is only whether the site hosts them, or routes
// the reader to email instead, and it is what the certificate wording across
// the site keys off so the two states are a constant rather than seven copies
// of the same sentence.
//
// It is true now. All ten launch compounds carry a `coa` under
// assets/coas/, so this is true and every surface links the batch-specific
// document instead of routing to email. Email still works, and the FAQ still
// offers it for a vial from a lot that is no longer in the catalog.
//
// It goes back to false only if the documents come down. A compound added
// without a certificate is not a reason to flip it: that product falls through
// to COA_URL and, finding it empty, renders an unclickable box, which is the
// case this was built to handle.
//
// Kept separate from PRODUCT_PAGES_LIVE below on purpose: certificates and the
// generated product pages both arrive with the supplier import, but they do not
// have to go live in the same deploy.
const COAS_PUBLISHED = true;

// ---------------------------------------------------------------------------
// Is a payment processor actually wired in yet?
//
// api/create-order.js creates the order in WooCommerce as `pending` regardless,
// and nothing in this codebase collects a card number today — checkout mounts
// a slot where the processor's own fields will go, but there is no processor.
// Without this flag, the checkout page still worked end to end: it created a
// real order and sent the shopper an email that says "we have your payment of
// $X", which was never true. That is the exact failure PRINCIPLES.md exists to
// catch, and it was reachable by anyone on the live site with nothing gating
// it.
//
// Read on both sides: js/checkout.js shows an honest "not open yet" state
// instead of the form, and api/create-order.js — the side that actually
// matters, since a client-side gate alone is just a suggestion to a browser
// that could skip it — refuses to create the order or send the confirmation
// at all while this is false. Both read this one constant, via the same
// CommonJS guard tools/*.js already uses, so there is one flag rather than a
// client copy that could say "closed" while the server still opens.
//
// Flip it to true in the same change that wires a real processor into
// checkout.html and api/create-order.js, not before.
//
// That change has landed: Stripe Elements mounts in js/checkout.js, and
// api/create-order.js will not create a WooCommerce order without a Stripe
// PaymentIntent it has independently verified as succeeded. See
// STRIPE_PUBLISHABLE_KEY below and STRIPE_SECRET_KEY in Vercel's environment
// variables — the secret key is never checked in and never reaches the
// browser.
const PAYMENTS_LIVE = true;

// Publishable, not secret: this key can only create PaymentIntents that were
// already priced server-side and confirm payment for them — it cannot move
// money on its own, which is why Stripe's own docs say it is safe to ship in
// client-side code. Read by js/checkout.js to construct `Stripe(...)`. This is
// the live-mode key (starts pk_live_): Stripe's dashboard is out of test mode,
// STRIPE_SECRET_KEY in Vercel is the matching live secret key, and the webhook
// endpoint for payment_intent.succeeded is registered under Live, not Test.
// All three have to stay in the same mode or a live-looking checkout will
// silently take test-mode payments, or a live payment will find no webhook.
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51U3kUmHjOd9MaH5sNxBU6C1neJypFeZGunq4CUybpTBrzWRC0dA4XY72By2DFkWDwIz8RPdHUhXHZlu6M0dgcTjW00ufOBrU9S';

/* ---------------------------- launch offer ----------------------------
   The one description of the launch discount. The percentage, the code, when
   each surface appears, and every sentence either the popup or the email says
   are all read from here, so no page can quote a discount the next one
   contradicts, and none can outlive the promotion.

   LAUNCH_OFFER_LIVE is the master switch: false and no surface renders, the
   endpoint refuses, and check-claims.js stops requiring the copy anywhere.

   What this object cannot do is make the code work. `code` and `percentOff`
   are what the site *says*; Stripe is what actually happens at checkout. So
   api/unlock-offer.js never hands the code out on the strength of this object:
   it resolves the promotion against Stripe first and reveals the discount
   Stripe reports, refusing if the code is dead. A stale figure here shows up
   as a mismatch in the logs rather than as a promise the checkout breaks.

   Not valid with the quantity ladder in QTY_TIERS above: a code discounting a
   price the tiers already discounted would let the two combine into a rate
   neither was priced for. api/_lib.js is what actually refuses the
   combination (resolvePromoCodeForOrder(), checked before any code is
   applied or re-priced) — facts below only has to say so, not enforce it. */
const LAUNCH_OFFER_LIVE = true;
const LAUNCH_OFFER = {
  code: 'GLOW15',
  percentOff: 15,

  // Two surfaces, because the same interruption does not suit both. The
  // homepage is where someone is still deciding whether this is a real
  // supplier, so it gets a bar along the bottom that leaves the page readable.
  // The catalog and the product pages are further down the intent curve, where
  // a dialog is worth its cost.
  //
  // Delays are the midpoints of the windows this was specified with (12-18s on
  // the homepage, 8-12s elsewhere): long enough to land and read something
  // first, which is the whole point of not firing on load.
  barDelayMs: 15000,
  modalDelayMs: 10000,
  // The catalog and product pages also open on depth, whichever comes first.
  // Someone a third of the way down a page has already decided to look.
  modalScrollAt: 0.35,

  // Copy. Both surfaces share the offer's own words and differ only in frame.
  eyebrow: 'Launch Offer',
  barTitle: 'New to Glow? Take 15% off your first order.',
  modalTitle: 'Get 15% off your first order.',
  ask: 'Enter your email to unlock your launch code.',
  // "Not valid with quantity discounts" belongs here, not just in checkout,
  // so nobody reaches the promo box having already assumed both apply.
  facts: 'Lot-level records. Third-party tested. Research use only. Not valid with quantity discounts.',
  cta: 'Unlock Offer',

  // Shown only after the address is in and Stripe has confirmed the code.
  revealTitle: code => `Your launch code: ${code}`,
  revealBody: pct => `Use it at checkout for ${pct}% off your first order.`,

  emailSubject: 'Your Glow launch code',
  emailBody: code => `Your launch code is ${code}.`,
};

// Meta's Pixel ID, not secret — it identifies which pixel a browser event
// belongs to, the same way a Google Analytics measurement ID would, and
// Meta's own docs say it is safe to ship client-side. Read by
// js/meta-pixel.js, which no-ops entirely while this is empty, so nothing
// fires (no fbq script loads, no PageView, nothing) until a real ID from
// Meta Events Manager replaces it. The matching server-side piece,
// META_CAPI_ACCESS_TOKEN, is a Vercel environment variable and must never be
// checked in — see api/_meta-capi.js.
const META_PIXEL_ID = '1071929978858561';

// The token Meta issues to prove this domain belongs to our business
// portfolio, served in the page source by design, so not secret either.
//
// Issued per business portfolio, not per pixel and not per ad account: it
// changes when the portfolio does, and only then. It was hand-typed into
// index.html and welcome.html before this, where nothing stopped the two
// from drifting apart, and a half-verified domain looks exactly like a
// verified one right up until Aggregated Event Measurement stops
// attributing iOS conversions. tools/build-meta.js writes both copies from
// here now.
const META_DOMAIN_VERIFICATION = 'vdj6rixbn41crbnftd0jlpbjbzzjxj';

// TikTok's Pixel code, same reasoning and the same shape as META_PIXEL_ID
// above: not secret, safe to ship client-side, and js/tiktok-pixel.js no-ops
// entirely while this is empty. The matching server-side piece,
// TIKTOK_CAPI_ACCESS_TOKEN, is a Vercel environment variable and must never
// be checked in — see api/_tiktok-capi.js.
const TIKTOK_PIXEL_ID = 'DA8CR2BC77U6VIRE2UQG';

// X's (Twitter's) base Pixel ID, same reasoning as META_PIXEL_ID and
// TIKTOK_PIXEL_ID above: not secret, safe to ship client-side, and
// js/x-pixel.js no-ops entirely while this is empty.
//
// Unlike Meta and TikTok, a single Pixel ID is not enough to fire X's named
// funnel events — each one (ViewContent, AddToCart, InitiateCheckout,
// Purchase) needs its own per-event tracking ID, created separately in X
// Ads Manager's Events Manager and only known once that is done. X_EVENT_IDS
// holds those; any entry left empty means js/analytics.js's forwardToX()
// skips that one event rather than firing a call X has no definition for,
// and api/_x-capi.js does the same for the server-side Purchase mirror.
// X's Conversion API takes a bearer-style X-Pixel-Token header, the same
// difficulty as Meta's and TikTok's — see api/_x-capi.js. The matching
// server-side piece, X_CAPI_ACCESS_TOKEN, is a Vercel environment variable
// and must never be checked in.
const X_PIXEL_ID = 'repwj';
const X_EVENT_IDS = {
  viewContent: 'tw-repwj-reuew',
  addToCart: 'tw-repwj-reuex',
  initiateCheckout: 'tw-repwj-reuez',
  purchase: 'tw-repwj-rer6c',
};

// What the confirmation page says about payment, keyed off the same flag that
// decides whether payment is actually taken. Hand-written copy here was the
// exact failure this guards against: thank-you.html told shoppers "card
// payment is not connected on the site yet, we will contact you to take
// payment" on a page they could only reach by paying with a card. Both
// branches now move with PAYMENTS_LIVE, so neither can outlive its flag.
const PAYMENT_COPY = PAYMENTS_LIVE ? {
  stepTitle: 'Payment confirmed',
  stepBody: 'Your card was charged when you placed this order. Nothing further is owed, ' +
            'and the receipt is in the confirmation email.',
} : {
  stepTitle: 'We confirm payment',
  stepBody: 'Card payment is not connected on the site yet, so we will contact you at the ' +
            'email above to take payment before anything ships.',
};

// What the site is allowed to display as an accepted payment method.
//
// Every entry here is a claim about a system this repo does not control.
// api/create-payment-intent.js asks Stripe for payment_method_types: ['card'],
// and which card networks that resolves to is decided by what is switched on
// in the Stripe Dashboard. Apple Pay needs the domain registered with Apple
// through that same dashboard before it works for anyone, and Google Pay needs
// wallets enabled on the account. None of that is checkable from here, which
// is exactly why the list is one constant rather than six logos typed into a
// page: switching a method off is deleting a line, not hunting markup.
//
// The precedent is GLOW20. Copy that assumed a dashboard state, and a
// dashboard that had moved on, is how the launch code ended up telling
// customers the offer had ended.
//
// `wallet` marks the two that are shown at checkout only when the shopper's
// own browser can open the sheet, which is what js/express-pay.js gates on
// canMakePayment(). The row footnotes that rather than implying every visitor
// will see them.
// Order is display order, and check-claims.js holds the row to it, so the
// sequence is decided here rather than by whoever last edited the markup.
// Wallets lead: they are the one-tap options and the reason the row converts.
const PAYMENT_METHODS = [
  { name: 'Apple Pay', wallet: true },
  { name: 'Google Pay', wallet: true },
  { name: 'Visa', wallet: false },
  { name: 'Mastercard', wallet: false },
  { name: 'Amex', wallet: false },
  { name: 'Discover', wallet: false },
];

// The certificate copy, in one place. Both branches describe the same
// operation — third-party tested lots, a certificate per batch — and differ
// only in how the reader gets hold of the document.
const COA_COPY = COAS_PUBLISHED ? {
  // trust lists and other tight spaces
  short: 'Batch-matched COA',
  // the box on the product page
  boxTitle: 'View certificate of analysis',
  // Named the identity technique ("mass-spec") until the guard's method list
  // learned the short spelling and caught it. The Identity row in
  // ANALYSIS_TESTS carries no method for a reason, so neither does this.
  boxSub: 'HPLC purity, identity and quantity, matched to the lot number on your vial',
  // footer of each order in the account area
  orderNote: 'Batch COA linked on every order',
  // the document row of the evidence panel. panelLink is the label on the row's
  // link, and is empty in the other branch: there is nothing to open, so no
  // link is drawn.
  panelNote: 'Issued against this lot number by the laboratory that ran the analysis',
  panelLink: 'View report',
  // the Certificate row of the documentation record
  docLine: 'Batch-specific, issued by the analysing laboratory and linked from this page',
  // homepage FAQ answer
  faq: 'Every product page links the certificate for its current lot. For a vial you already ' +
       'have, email support@glowresearch.shop with the lot number and we will send that batch’s ' +
       'certificate, sold out or not.',
} : {
  short: 'COA on request',
  boxTitle: 'Certificate of analysis on request',
  boxSub: 'Email support@glowresearch.shop with the lot number on your vial and we will send the COA for that batch',
  orderNote: 'Lot COA available on request',
  panelNote: 'Certificate on request: email support@glowresearch.shop with the lot number on your vial',
  panelLink: '',
  docLine: 'Batch-specific, issued by the analysing laboratory. Email support@glowresearch.shop with the lot number for a copy',
  faq: 'Email support@glowresearch.shop with the lot number on your vial, or your order number, ' +
       'and we will send the certificate for that exact batch, sold out or not.',
};

// The certificate document for one compound, or '' when there is nothing to
// open. Three surfaces ask this question — the product page's COA box, its
// batch analysis panel, and the certificate index — so the test lives here
// rather than being retyped beside each of them.
//
// COAS_PUBLISHED is part of the test on purpose. The flag is what decides
// whether the site links documents or routes to email, so a per-product `coa`
// staged in the catalog ahead of the flip must not put a live link on a page
// whose surrounding copy still says "on request". Fill the URLs first, flip
// the flag when they are all in, and every surface turns over together.
function coaHref(p) {
  if (!COAS_PUBLISHED) return '';
  // Through pageHref(), because the generated pages live at
  // /product/<slug>/ and every caller puts this straight into the DOM. The
  // static markup was rewritten to depth by the generator and then js/
  // product.js re-rendered the panel on load with the catalog's own root
  // paths, so a certificate that resolved for a crawler 404'd for a reader.
  // A no-op at the repo root, and on Node, where the build reads the plain
  // catalog path.
  return pageHref((p && p.coa) || COA_URL || '');
}

// ---------------------------------------------------------------------------
// The real catalog, imported from the supplier's SKU map (GLO-prefixed
// product SKUs). `sizes[].sku` is that map's product SKU,
// the one the backend needs; the sheet's LBL codes are label SKUs for the
// fulfilment side and are not stored here, since nothing on this site reads
// one.
//
// GLOW Blend and KLOW Blend are compounded multi-peptide vials. The sheet
// gives their total mg and price but not a component breakdown the way the
// other blends below do ("Blend: X/Y - a/b MG"), so their `about` copy says
// exactly that and nothing more: no ingredient list is stated until one is
// confirmed against the supplier's specification.
// ---------------------------------------------------------------------------
// Launch catalog: exactly the ten SKUs the WooCommerce launch list carries.
// Every other compound previously in this file (TB-500, GHK-Cu blends beyond
// GLOW, the standalone secretagogues, the longevity/immune/neuro/cognitive
// lines) is held back until it has its own launch SKU. Each entry below keeps
// a single `sizes[]` row matching the one size the launch list states; add a
// second size only once the supplier confirms a SKU for it.
const GLOW_PRODUCTS = [
  { name: 'G3-R', tag: null, cat: 'metabolic', purity: '99.9%', lot: '1032', badge:'Best Seller',
    coa: 'assets/coas/g3-r-lot-1032.pdf', coaRef: 'VMGN-S9MH', tested: '23 June 2026',
    results: { Identity: 'Conforms', Quantity: '10.37 mg', Sterility: 'Pass', Endotoxin: 'Pass' },
    sizes: [
      { mg: '10mg', price: 84.99, list: 94, sku: 'GLO-RT10', image: 'assets/products/g3-r-10mg-v5.webp' },
    ],
    blurb: 'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.',
    about: [
      'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.'
    ],
    research: [
      { t: 'General handling', d: 'Supplied as a lyophilized peptide for in-vitro laboratory use.' }
    ] },
  // Order is curated, not alphabetical or by add date: it drives the
  // catalog's default "Featured" sort. The homepage does not read this order
  // directly any more — js/script.js features G3-R first there via
  // renderProductGrid's featureFirst option, since the homepage and the
  // catalog want different first impressions and used to fight over the one
  // order both pages shared.
  //
  // Leads with the tissue-repair peptides and their blend, then the three
  // "metabolic" compounds (G3-R, G1-S, G2-T) interleaved with the
  // secretagogue and longevity products rather than run together. Three of
  // them back to back in the grid reads as a weight-loss storefront's
  // product line, the same concern behind dropping "Metabolic Research"
  // from the catalog's chips
  // and the per-product research-category tag; spacing them out is the same
  // decision applied to layout instead of labeling. The badge each product
  // carries (Best Seller, Popular, Best Value) is editorial and does not
  // double as a ranking signal for this order; it still has to stay rare
  // enough to mean something, which tools/check-claims.js enforces
  // separately.
  { name: 'GHK-Cu', tag: null, cat: 'tissue', purity: '99.815%', lot: '5567', badge:'Best Value',
    coa: 'assets/coas/ghk-cu-lot-5567.pdf', coaRef: 'D69A-YY5F', tested: '6 July 2026',
    results: { Identity: 'Conforms', Quantity: '56.93 mg', Sterility: 'Pass', Endotoxin: 'Pass' },
    sizes: [{ mg: '50mg', price: 44.99, list: 50, sku: 'GLO-CU50', image: 'assets/products/ghk-cu-50mg-v3.webp' }],
    blurb: 'A naturally occurring copper-binding tripeptide complex. Studied in vitro for extracellular matrix remodelling.',
    about: [
      'GHK-Cu is the tripeptide glycyl-L-histidyl-L-lysine complexed with copper(II). The tripeptide occurs naturally in plasma and binds copper with high affinity, and it is the complex rather than the bare peptide that most research uses.',
      'It ships as the copper complex, which is blue. That colour is a useful handling cue: it tells you the copper is still coordinated.'
    ],
    research: [
      { t: 'Extracellular matrix remodelling', d: 'Studied in fibroblast culture for effects on collagen and proteoglycan gene expression.' },
      { t: 'Copper transport', d: 'Used as a model for how small peptides carry and deliver copper ions between compartments.' },
      { t: 'Antioxidant enzyme activity', d: 'Examined for interaction with copper-dependent enzyme systems.' }
    ] },
  { name: 'BPC-157', tag: null, cat: 'tissue', purity: '98.2%', lot: '1400', badge:null,
    coa: 'assets/coas/bpc-157-lot-1400.pdf', coaRef: 'X9RM-SMBN', tested: '5 July 2026',
    results: { Identity: 'Conforms', Quantity: '11.13 mg' },
    sizes: [
      { mg: '10mg', price: 54.99, list: 61, sku: 'GLO-BC10', image: 'assets/products/bpc-157-10mg-v3.webp' },
    ],
    blurb: 'A synthetic pentadecapeptide derived from a protein found in gastric juice. Studied in vitro for angiogenic signalling.',
    about: [
      'BPC-157 is a synthetic pentadecapeptide: a fifteen amino acid sequence corresponding to a partial fragment of body protection compound, a protein identified in gastric juice. It is supplied lyophilized.',
      'The sequence is notable in laboratory work for holding up in aqueous and acidic conditions, which is part of why it appears so often in in-vitro and preclinical model systems.'
    ],
    research: [
      { t: 'Angiogenic signalling', d: 'Studied in endothelial cell models for interaction with the VEGF receptor 2 pathway and the formation of vessel structures in culture.' },
      { t: 'Fibroblast migration', d: 'Used in scratch and outgrowth assays examining how tendon and ligament fibroblasts migrate and organise.' },
      { t: 'Gut epithelial models', d: 'Examined in gastrointestinal tissue models, reflecting the gastric origin of the parent protein.' }
    ] },
  { name: 'BPC-157/TB-500', alias: 'Wolverine', tag: 'Peptide Blend', cat: 'tissue', purity: '98.63%', lot: '5615', badge:null,
    coa: 'assets/coas/bpc-157-tb-500-lot-5615.pdf', coaRef: '7STD-6SRY', tested: '5 July 2026',
    results: { Identity: 'Conforms', Quantity: '9.73 mg' },
    sizes: [
      { mg: '10mg', price: 69.99, list: 78, sku: 'GLO-BB10', image: 'assets/products/bpc-157-tb-500-blend-10mg-v3.webp' },
    ],
    blurb: 'A combined BPC-157 and TB-500 formulation. Supplied for research using both peptides together in one vial.',
    about: [
      'This blend combines BPC-157 and TB-500 in a single vial, 5/5 mg of each for 10mg total, formulated for laboratories that already run both peptides together rather than reconstituting them separately. It is commonly referred to as Wolverine within the peptide research community.',
      'BPC-157 and TB-500 act through different mechanisms, angiogenic signalling and actin-binding cytoskeletal dynamics respectively, so the blend is a co-formulation, not a new compound with its own mechanism.'
    ],
    research: [
      { t: 'Co-formulation stability', d: 'Studied for how the two peptides behave when reconstituted and stored together versus from separate vials.' },
      { t: 'Combined pathway models', d: 'Used in fibroblast and endothelial culture models examining both peptides applied from a single source.' },
      { t: 'Comparative protocols', d: 'Applied alongside single-compound vials to compare co-formulated and separately administered research protocols.' }
    ] },
  { name: 'GLOW', alias: 'GHK-Cu/BPC-157/TB-500', tag: 'Peptide Blend', cat: 'tissue', purity: '99.61%', lot: '1035', badge:null,
    coa: 'assets/coas/glow-lot-1035.pdf', coaRef: 'X7MB-H2H8', tested: '13 June 2026',
    results: { Identity: 'Conforms', Quantity: '65.63 mg' },
    sizes: [{ mg: '70mg', price: 99.99, list: 111, sku: 'GLO-BBG70', image: 'assets/products/glow-70mg-v3.webp' }],
    blurb: 'A compounded blend of GHK-Cu, BPC-157 and TB-500. Supplied for research using all three peptides together in one vial.',
    about: [
      'GLOW is Glow Research’s designation for a compounded blend of three research peptides, GHK-Cu, BPC-157 and TB-500, supplied together in one 70mg vial rather than as separate compounds. It is commonly referred to by its components, GHK-Cu/BPC-157/TB-500, within the peptide research community.',
      'GHK-Cu, BPC-157 and TB-500 act through distinct mechanisms, copper-dependent extracellular matrix signalling, angiogenic signalling and actin-binding cytoskeletal dynamics respectively, so the blend is a co-formulation of three independent compounds rather than a new one with its own mechanism.'
    ],
    research: [
      { t: 'Co-formulation research', d: 'Used by laboratories studying multiple compounded peptides delivered from a single vial rather than several discrete kits.' },
      { t: 'Comparative protocols', d: 'Applied alongside single-compound vials when comparing blended and separately administered research protocols.' }
    ] },
  { name: 'CJC-1295 No DAC/Ipamorelin', tag: 'Peptide Blend', cat: 'growth', purity: '99.08%', lot: '005', badge:null,
    coa: 'assets/coas/cjc-1295-no-dac-ipamorelin-lot-005.pdf', coaRef: 'MHCU-CDXL', tested: '5 July 2026',
    results: { Identity: 'Conforms', Quantity: '11.18 mg' },
    sizes: [{ mg: '5/5mg', price: 71.99, list: 80, sku: 'GLO-CP10', image: 'assets/products/cjc-1295-ipamorelin-5-5mg-v3.webp' }],
    blurb: 'A combined CJC-1295 (No DAC) and Ipamorelin formulation. Supplied for research examining GHRH and ghrelin receptor co-agonism.',
    about: [
      'This blend combines CJC-1295 without DAC and Ipamorelin in a single vial, 5/5 mg of each for 10mg total, pairing a GHRH receptor analogue with a selective ghrelin receptor agonist.',
      'The two peptides act on different receptors within the same growth hormone axis, which is why they are frequently studied together rather than as substitutes for one another.'
    ],
    research: [
      { t: 'Dual-pathway secretagogue models', d: 'Used to study whether combined GHRH and ghrelin receptor engagement produces a different pulse profile than either peptide alone.' },
      { t: 'Co-formulation stability', d: 'Studied for how the two peptides behave when reconstituted and stored from a single vial.' },
      { t: 'Comparative pulse studies', d: 'Applied alongside single-compound vials in models comparing combined and separate administration protocols.' }
    ] },
  { name: 'G1-S', tag: null, cat: 'metabolic', purity: '99.57%', lot: '1050', badge:'Popular',
    coa: 'assets/coas/g1-s-lot-1050.pdf', coaRef: 'WVED-FDT9', tested: '29 July 2026',
    results: { Identity: 'Conforms', Quantity: '11.96 mg' },
    sizes: [{ mg: '10mg', price: 64.99, list: 72, sku: 'GLO-SM10', image: 'assets/products/g1-s-10mg-v5.webp' }],
    blurb: 'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.',
    about: [
      'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.'
    ],
    research: [
      { t: 'General handling', d: 'Supplied as a lyophilized peptide for in-vitro laboratory use.' }
    ] },
  { name: 'Tesamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.36%', lot: '1002', badge:null,
    coa: 'assets/coas/tesamorelin-lot-1002.pdf', coaRef: 'R934-S6U9', tested: '23 June 2026',
    results: { Identity: 'Conforms', Quantity: '10.59 mg', Sterility: 'Pass', Endotoxin: 'Pass' },
    sizes: [{ mg: '10mg', price: 89.99, list: 100, sku: 'GLO-TSM10', image: 'assets/products/tesamorelin-10mg-v3.webp' }],
    blurb: 'A synthetic growth hormone releasing hormone analogue with a stabilised N-terminus. Studied for pituitary receptor engagement.',
    about: [
      'Tesamorelin is a synthetic analogue of growth hormone releasing hormone carrying a trans-3-hexenoic acid modification at the N-terminus that slows enzymatic degradation by DPP-4.',
      'The modification is what gives it a longer functional window than native GHRH in culture, which is the property most research on the analogue is designed around.'
    ],
    research: [
      { t: 'GHRH receptor binding', d: 'Used in receptor occupancy and activation assays at the pituitary GHRH receptor, alongside other GHRH analogues.' },
      { t: 'DPP-4 resistance', d: 'Studied for resistance to enzymatic cleavage relative to native GHRH, and how that changes assay-window duration.' },
      { t: 'Comparative secretagogue pharmacology', d: 'Run as a reference GHRH analogue when newer compounds in the class are characterised.' }
    ] },
  { name: 'G2-T', tag: null, cat: 'metabolic', purity: '99.75%', lot: '1600', badge:null,
    coa: 'assets/coas/g2-t-lot-1600.pdf', coaRef: '7RRU-W2LV', tested: '29 July 2026',
    results: { Identity: 'Conforms', Quantity: '12.49 mg' },
    sizes: [{ mg: '10mg', price: 72.99, list: 81, sku: 'GLO-T10', image: 'assets/products/g2-t-10mg-v5.webp' }],
    blurb: 'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.',
    about: [
      'A 10mg lyophilized peptide. Supplied for in-vitro laboratory studies.'
    ],
    research: [
      { t: 'General handling', d: 'Supplied as a lyophilized peptide for in-vitro laboratory use.' }
    ] },
  { name: 'MOTS-C', tag: null, cat: 'longevity', purity: '99.84%', lot: '1025', badge:null,
    coa: 'assets/coas/mots-c-lot-1025.pdf', coaRef: 'N8VT-H88T', tested: '5 July 2026',
    results: { Identity: 'Conforms', Quantity: '11.45 mg' },
    sizes: [{ mg: '10mg', price: 59.99, list: 67, sku: 'GLO-MS10', image: 'assets/products/mots-c-10mg-v3.webp' }],
    blurb: 'A mitochondrial-derived peptide encoded within the mitochondrial genome. Studied for its role in metabolic signalling.',
    about: [
      'MOTS-C is a 16 amino acid peptide encoded in the mitochondrial 12S rRNA region rather than the nuclear genome, one of a small class of mitochondrial-derived peptides identified in the last two decades.',
      'It is studied for translocating to the nucleus under metabolic stress, which is the behaviour that placed it in metabolic signalling research rather than classical mitochondrial biology alone.'
    ],
    research: [
      { t: 'AMPK pathway signalling', d: 'Studied in cell models for activation of AMPK and downstream metabolic gene expression.' },
      { t: 'Nuclear translocation', d: 'Investigated for movement from mitochondria to the nucleus under metabolic stress conditions in culture.' },
      { t: 'Mitochondrial-derived peptide research', d: 'Used as a reference compound in the broader study of peptides encoded within the mitochondrial genome.' }
    ] },
];

// Everything outside the product page still asks for a single p.size / p.price
// / p.image. Derive them from the smallest size rather than repeating them in
// the literal, so the "from" price (and photo) on a card can never drift from
// the picker on the page. A product-level `image` some products still carry
// as a plain default wins over a size's own — sizes[].image is for the case
// where the label itself differs by mg (a 5mg vial shot separately from a
// 10mg one), not the common case of one photo for the whole product.
GLOW_PRODUCTS.forEach(p => {
  p.size = p.sizes[0].mg;
  p.price = p.sizes[0].price;
  p.list = p.sizes[0].list;
  p.image = p.image || p.sizes[0].image;
});

// ---------------------------------------------------------------------------
// Stock. Absent means sellable: every size above is available today, and
// writing `stock: true` eighteen times would be noise. The point is not the
// default — it is that availability is now a value the catalog holds rather
// than a sentence four files assert on their own.
//
// Before this, "In stock" was hardcoded in the buy box and `InStock` was
// hardcoded in the Product schema, so the site was structurally incapable of
// telling the truth if the truth changed: the only way to stop selling
// something was to remember to edit two files, and nothing would have caught
// it if you forgot. Now setting `stock: false` on any size takes the buy box,
// the mg button, the quick-add row, the card and the schema with it.
//
// The supplier import writes real per-SKU availability into `sizes[].stock`.
const sizeInStock = s => s.stock !== false;
const productInStock = p => p.sizes.some(sizeInStock);

// ---------------------------------------------------------------------------
// What each `cat` is called in front of a customer. `cat` is a slug the code
// filters and sorts on; this is the only place it becomes English.
//
// It lives here because three surfaces need it and they used to each keep
// their own copy: the product page breadcrumb, the generated pages' breadcrumb
// and Product schema, and the category headings in llms.txt. Adding the
// longevity, immune and neuro categories updated two of the three, and the
// third silently wrote "### undefined" into the file the AI crawlers read.
// That is what a duplicated map buys you, so there is now one.
//
// tools/check-claims.js fails the build on a category with no label here.
const CAT_LABEL = {
  growth: 'Secretagogue Research',
  tissue: 'Tissue Research',
  metabolic: 'Metabolic Research',
  longevity: 'Longevity Research',
};

// ---------------------------------------------------------------------------
// The cart-drawer accessory offer.
//
// One product, one size, no picker. A diluent is needed to use what is already
// in the cart, so the offer is genuinely useful rather than a second thing to
// weigh, and the whole decision is one click. Offering both sizes would turn
// that click into a choice, which is the thing this module is designed not to
// ask for. The 3mL stays in the catalog for anyone who wants it.
//
// This names a product and a size. It deliberately does not carry a price:
// the figure, and whether the size is sellable at all, are read out of the
// catalog row at render time, so the drawer cannot quote a number the product
// page contradicts. Set to null to take the offer down.
const CART_UPSELL = null;

// Resolves the offer against the live catalog, or returns null when there is
// nothing honest to show: no such product, no such size, or that size is out
// of stock. Callers get a real row or nothing, so no surface has to re-derive
// those conditions and none of them can get it half right.
//
// tools/check-claims.js fails the build if this stops resolving, because the
// failure mode is silent: rename the product or the size and the module just
// quietly disappears from every cart.
function cartUpsell() {
  if (!CART_UPSELL) return null;
  const product = GLOW_PRODUCTS.find(p => p.name === CART_UPSELL.name);
  if (!product) return null;
  const size = product.sizes.find(s => s.mg === CART_UPSELL.mg);
  if (!size || !sizeInStock(size)) return null;
  return { product, size };
}

// ---------------------------------------------------------------------------
// The two quality figures in the homepage hero.
//
// Average purity is computed from the catalog rather than typed into the hero,
// so it cannot survive a change to the products it summarises. Add a compound,
// or let the supplier import overwrite the purity strings, and the headline
// figure moves with them. tools/check-claims.js pins the number in index.html
// to this function, so the served markup and the data cannot drift.
//
// One decimal, because that is the precision the certificates report. Every
// figure it averages was checked against the lot's own certificate when those
// were hosted, so the hero number is now derived from documents the site
// publishes rather than from stand-ins.
//
function avgPurity() {
  const ps = GLOW_PRODUCTS.map(p => parseFloat(p.purity));
  return (ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1);
}

// Batches tested to date. Unlike every other figure on the site this one has
// no source in the system: nothing here counts lots, so it cannot be derived
// and it cannot self-correct. It is a hand-maintained number, stated as a
// floor ("150+") for that reason, and it is the one claim on the site that
// depends on somebody updating it. Raise it only against the fulfilment
// partner's actual lot records, never as an estimate. If a real batch ledger
// ever lands, derive this the way avgPurity() is derived and delete the note.
const BATCHES_TESTED = 150;

// ---------------------------------------------------------------------------
// Dispatch, in one place. CLAUDE.md's rule for this file: the catalog and every
// sitewide constant. Both of these were previously owned by js/product.js,
// which meant the evidence panel could only quote them by typing them out
// again, and a string typed into a template is not a number the audit can pin.
//
// This was a 2:00 PM PST cutoff, then briefly "one business day" (wrong in
// the other direction, at the time: Saturday was a dispatch day, and Sunday
// was the only day nothing left), then no cutoff at all once the old one
// turned out to be a claim nothing in the code actually kept.
//
// The fulfilment partner has since confirmed a real one: an order placed by
// DISPATCH_CUTOFF_HOUR ships that same day; placed after, it ships the next
// dispatch day. Unlike the old cutoff, js/product.js's deliveryEstimate()
// actually branches on this hour rather than only being told about it in
// copy, and check-claims.js pins every stated cutoff time on the site to
// this constant so it cannot drift the way the 2:00 PM one did.
//
// Dispatch is Monday through Friday only as of September 2026 — the
// fulfilment partner does not run Saturday pickups. NO_DISPATCH_DAYS and
// NO_DELIVERY_DAY are getUTCDay() values, so the estimate on the product
// page and the words on shipping-policy.html read the same values rather
// than each carrying their own idea of which days those are. They are
// deliberately separate facts, not one list reused twice: nothing leaves the
// warehouse on a Saturday or a Sunday, but a package already in transit can
// still be delivered on a Saturday, only not a Sunday. Either can change on
// its own without the other needing to.
const NO_DISPATCH_DAYS = [0, 6];              // Sunday and Saturday, in getUTCDay() terms
const NO_DELIVERY_DAY = 0;                    // FedEx does not deliver Sundays
// 24-hour, Pacific wall-clock — js/product.js reads Pacific parts the same
// way it already does for the day-of-week check, so the two never disagree
// about what "now" means.
const DISPATCH_CUTOFF_HOUR = 13;
const DISPATCH_CUTOFF_LABEL = '1:00 PM Pacific';
// The marquee ticker's shorter form of the same fact — same hour as
// DISPATCH_CUTOFF_LABEL, just without spelling out "Pacific". Its own
// constant rather than a second hand-typed "1:00 PM PT" in thirty static
// pages, so check-claims.js can pin every ticker to this one string.
const DISPATCH_CUTOFF_TICKER = '1:00 PM PT';
// The product page's own wording of the same hour. "PST" rather than
// "Pacific" was asked for specifically here — worth flagging that "PST" names
// standard time only, and this hour is genuinely Pacific time year-round,
// including the half of the year the zone is actually observing PDT. Kept
// separate from DISPATCH_CUTOFF_LABEL rather than overloading it, since only
// the product page's live cutoff line uses this exact phrasing.
const DISPATCH_CUTOFF_PDP_LABEL = '1:00 PM PST';
// "dispatch day" rather than "business day" purely for consistency with the
// rest of the site's wording, even though the two now name the same five
// days: Monday through Friday.
const DISPATCH_LABEL = `the same day when ordered by ${DISPATCH_CUTOFF_LABEL}, otherwise the next dispatch day`;

// FedEx transit. Also the span the product page's arrival estimate counts
// forward, inclusively: the day the page is being read is day one, so a
// Tuesday visitor is shown Thursday. Counted in plain days, not business days,
// because FedEx runs Saturday and the estimate has to match what the copy
// promises. check-claims.js pins every "FedEx <n>-Day" on the site to this.
const TRANSIT_DAYS = 2;

// What the package actually looks like. Written when the footer on every page
// still promised "discreetly shipped" without anywhere saying what that meant,
// which is a promise a reader cannot check. The footer says something else
// now, but the question is still one people ask before ordering, so the answer
// stays and this is the one place the package is described. check-claims.js
// holds the other half: if that wording ever returns to a page, it has to be
// explained here again.
//
// Said "box" until August 2026, which was simply wrong: vials go out in a
// padded envelope. The discretion half of the sentence is the part that has to
// stay true either way, so it leads and the container follows it.
const PACKAGING_PLAIN = 'A plain padded envelope, no branding, nothing on the ' +
  'outside naming what is inside';

// ---------------------------------------------------------------------------
// What the site is allowed to say about how a lot is verified and where it is
// made. Both claims are already made at length on how-we-test.html and about.html.
// The evidence panel states them in four words, and it states them from here,
// so the short form cannot quietly grow a third analysis the laboratory never
// ran or drop the regulatory hedge on the manufacturing claim. check-claims.js
// pins both long forms to the prose they summarise.
// The analyses the laboratory reports per lot, as rows rather than a sentence.
//
// This array is where the count comes from. Before it existed, "eight checks"
// was a word typed into how-we-test.html, "7x Third-Party Tested" was a
// different word typed into the homepage hero, and the certificate reports
// seven. Three surfaces, three numbers, nothing holding them together. A count
// nobody derives goes stale the first time the panel changes, so every page
// now renders it from `.length` and check-claims.js fails the build if any of
// them states a different one.
//
// It stated seven until the certificates were hosted, and hosting them is what
// made the number checkable. Accumark reports purity, identity and quantity on
// all ten lots; sterility and endotoxin on three of them; appearance,
// solubility and heavy metals on none. Only what every certificate carries
// belongs here, because the panel this feeds is headed "Run on every lot" and
// six of those seven rows pointed a reader at a document that does not contain
// them. Sterility and endotoxin did not disappear: they are reported per lot
// through `results` below, which is what ANALYSIS_SOME_LOTS is derived from.
//
// Lot archival is deliberately not a row here. It is on every certificate and
// ANALYSIS_LONG still names it, but it is a record, not an analysis: no
// instrument runs and no result is measured. Counting it would buy one extra
// test in the headline for free, which is the small, defensible, untrue kind
// of claim PRINCIPLES.md exists to stop.
//
//   name    what the row is called on the certificate
//   short   the term the evidence panel abbreviates to. Must appear in
//           ANALYSIS_LONG, which check-claims.js enforces
//   method  the instrument or assay, where we actually know it. Empty for the
//           rows where the certificate names a result but not a technique:
//           guessing one would be inventing a fact about someone else's lab
//   plain   one sentence, no jargon, for how-we-test.html
const ANALYSIS_TESTS = [
  {
    name: 'Purity',
    short: 'HPLC',
    // The certificate heads this section "HPLC Chromatogram Report" and says
    // nothing about the detector. It read "Reverse-phase HPLC-UV" here, which
    // is the usual configuration and still two facts about somebody else's
    // instrument that their own document does not state.
    method: 'HPLC',
    plain: 'How much of the powder is the peptide you ordered. This is the percentage printed on the certificate.',
  },
  {
    name: 'Identity',
    short: 'identity',
    // Reported as a pass against the declared compound, with no technique
    // named. It said LC-MS, which is a specific measurement, not shorthand.
    method: '',
    plain: 'Confirms the compound in the vial is the one on the label, not something close to it.',
  },
  {
    name: 'Quantity',
    short: 'quantity',
    // Named for the row the certificate actually prints. "Net peptide content"
    // is the stricter reading, peptide mass with salt and water taken out, and
    // the certificate does not say which of the two it measured.
    method: '',
    plain: 'How many milligrams the laboratory weighed out of the vial, against the size on the label.',
  },
];

// The number every page states, derived from the rows above so it cannot be
// typed wrong. Spelled out as well as counted, because the pages state it in a
// headline and again in a subheading and both have to move together.
const TESTS_PER_BATCH = ANALYSIS_TESTS.length;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = n => NUMBER_WORDS[n] || String(n);

// Built from the rows, not typed alongside them: the panel's four-word summary
// used to carry an eighth term the certificate does not report.
const ANALYSIS_SHORT = ANALYSIS_TESTS.map(t => t.short).join(' + ');
const ANALYSIS_LONG = 'HPLC for purity, an identity check against the declared compound, a quantity assay reporting the milligrams weighed out of the vial, and lot archival linking every batch to its certificate';
const SOURCE_SHORT = 'Manufacturing partner';
const SOURCE_LONG = 'Synthesis and fill at a partner facility operating to cGMP-aligned quality practices';

// The tests nobody runs on these lots, named out loud.
//
// ANALYSIS_LONG is the complete list of what is performed, which means every
// other analysis a buyer might assume is included is absent. Left unsaid, an
// absence reads as a pass, so anything in this array is named by the FAQ, and
// the FAQ builds that sentence from here rather than from prose someone typed.
//
// The array was empty, and had been repeatedly reduced rather than written,
// each removal reasoned from what a certificate format was assumed to carry.
// The certificates are hosted now, so it is written from the documents: across
// all ten, no lot is given an appearance and solubility inspection and no lot
// is screened for heavy metals. Both were rows of the panel and sections of
// how-we-test.html until this file could be checked against a real report.
//
// check-claims.js holds the two halves apart: nothing in this array may appear
// in ANALYSIS_SHORT, ANALYSIS_LONG, or the testing copy on how-we-test.html,
// and every entry has to be named out loud in the FAQ. So the day one of these
// starts appearing on the certificate, moving it out of here is what lets the
// rest of the site claim it.
const ANALYSIS_NOT_RUN = ['appearance and solubility', 'heavy metals'];

// The analyses some certificates carry and others do not, derived from the
// lots themselves rather than listed by hand.
//
// Accumark runs sterility and endotoxin on some lots and not others. Neither
// half of the file above can hold that: ANALYSIS_TESTS is what the panel heads
// "Run on every lot", and ANALYSIS_NOT_RUN would say we never run them, which
// three certificates disprove. Left in neither, they would be absent from the
// site while sitting in plain sight on a document it links, and an unexplained
// absence is the failure this whole section exists to prevent.
//
// So they come off the lots. A product's `results` may name a row outside
// ANALYSIS_TESTS; batchRows() renders it under its own heading on that lot's
// panel, and the FAQ names the set here. Nothing is typed twice, so a lot
// arriving with a new analysis on it says so everywhere without an edit.
const ANALYSIS_SOME_LOTS = [...new Set(
  GLOW_PRODUCTS.flatMap(p => Object.keys(p.results || {}))
)].filter(name => !ANALYSIS_TESTS.some(t => t.name === name));

// ---------------------------------------------------------------------------
// The photo on every product page, and the illustrated vial that stands in
// where no photo exists yet, both show Glow's own artwork on the label.
// Vials actually ship with the manufacturer's generic label, not this one, so
// showing the image without saying so would be a photo that doesn't match
// what arrives, exactly the kind of claim PRINCIPLES.md rules out. One line,
// read wherever a vial image renders, until real labeled-vial photography
// replaces the artwork and this note comes out with it.
const VIAL_ART_NOTICE = 'Vials ship with generic labeling, not the label shown.';

// ---------------------------------------------------------------------------
// The homepage FAQ.
//
// It lived in js/script.js and was injected into an empty <div> on load, which
// meant it did not exist for anyone who did not run JavaScript. That is most
// of the crawlers that feed AI answer engines, and a FAQ is the single most
// quotable thing on a site: a question followed by a direct answer. Five
// answers about consumption, pricing, certificates and shipping were reaching
// nobody who was asking.
//
// So it lives here, with the rest of the sitewide truth, and tools/build-faq.js
// bakes both the markup and the FAQPage schema into index.html. Editing the
// array and rebuilding is the whole workflow; check-claims.js fails the build
// if the served markup and this array disagree.
//
// This is the trust core only. Shipping speed, international policy, pricing
// rationale and testing recency are all stated elsewhere on the site (the
// evidence panel, shipping.html, the dispatch row) and repeating them here
// just pushed the questions someone actually needs answered before they will
// trust a peptide supplier further down the page. What is left is the
// verification trail in the order someone walks it: what was tested, how do I
// get the document, how do I know the document is real, and where is the lot
// number that ties the document to the vial in my hand.
//
// Research-use-only is deliberately not among them. It is the age gate, the
// footer disclaimer, ruo-agreement.html and a line on every product page, so
// an FAQ entry restating it spent the most-read slot on the page on the one
// thing a visitor has already been told before they scrolled this far.
//
// Every question is phrased the way the person asking would phrase it, first
// person, and every answer is addressed back to them in one or two sentences.
// This is the part of a page people skim, and an explanation nobody finishes
// reading persuades nobody: the long version of each of these already exists
// on how-we-test.html for anyone who wants it. "How do I know you did not
// write the certificate yourselves?" is the question a supplier would rather
// not see written down, which is the reason it is written down.
//
// Answers are plain text: faqHtml() escapes them and build-faq.js puts the same
// strings in the FAQPage schema, so there is no markup to get out of step.
//
// Two rules these answers are held to, both enforced in check-claims.js:
// nothing here may name an analysis that ANALYSIS_LONG does not back, and
// nothing here may quote a number. Purity figures in this catalog are still
// placeholder, and a threshold repeated in an FAQ ("research grade is 98%+",
// "endotoxin under 0.25 EU/mL") turns a lot-specific measurement into a
// standard we would then be promising on every lot forever. The certificate
// reports numbers. This page explains how to go read them.
const FAQS = [
  {
    // The list is built from ANALYSIS_TESTS, not typed, so it cannot name a
    // test the laboratory does not run or go quiet about one it does.
    // ANALYSIS_LONG says the same thing at length for llms.txt, where being
    // exhaustive is the point. Here it read like a specification sheet, so
    // this states it the way a person would say it out loud.
    q: 'Is every compound third-party tested?',
    a: `Yes. ${sentenceCase(numberWord(ANALYSIS_TESTS.length))} analyses on every lot before it ships: ` +
       `${listWords(ANALYSIS_TESTS.map(t =>
         t.method ? `${t.name.toLowerCase()} by ${t.method}` : t.name.toLowerCase()), 'and')}. ` +
       (ANALYSIS_SOME_LOTS.length
         ? `Some lots also get ${listWords(ANALYSIS_SOME_LOTS.map(t => t.toLowerCase()), 'and')} ` +
           'testing, some do not, so read the certificate for the lot you have. '
         : '') +
       (ANALYSIS_NOT_RUN.length
         ? `We do not run ${listWords(ANALYSIS_NOT_RUN, 'or')}. `
         : '') +
       'An outside lab does all of it, so the certificate is not ours to write.',
  },
  {
    // Every figure here is the constant the rest of the site quotes: the
    // dispatch rule from DISPATCH_LABEL, the transit from
    // TRANSIT_DAYS. check-claims.js pins both sitewide, so this answer cannot
    // drift from the shipping page.
    q: 'How fast does my order ship?',
    a: `Every order ships ${DISPATCH_LABEL} on FedEx ${TRANSIT_DAYS}-Day. ` +
       'Tracking follows within a day. United States only.',
  },
  {
    // Reads PACKAGING_PLAIN rather than describing the envelope a second
    // time, and states the one payment method create-payment-intent.js
    // actually requests rather than a generic "secure checkout" claim.
    q: 'Is checkout discreet and secure?',
    a: `Always. Orders ship in ${PACKAGING_PLAIN.charAt(0).toLowerCase()}${PACKAGING_PLAIN.slice(1)}, ` +
       'and checkout runs on Stripe\u2019s own encrypted payment form, card only. ' +
       'Stripe handles and stores the card details, not us.',
  },
  {
    // No hedging and no softening. This is the one answer on the site where
    // being liked matters less than being unambiguous, and the RUO agreement
    // it points at is the document the buyer already accepted at the gate.
    q: 'What does "research use only" mean?',
    a: 'No. Not for use in humans or animals. Laboratory and in-vitro research only, sold ' +
       'to qualified buyers and institutions, not a drug or a supplement. We do not ' +
       'publish dosing or administration guidance and will not supply it if asked. The ' +
       'RUO Agreement covers what you accepted on the way in.',
  },
];

// One renderer for the browser and the build, so the served markup and the
// behaviour attached to it can never describe different questions.
//
// Below FAQ_SPLIT_AT, one column: at five or six questions a second column
// sits mostly empty beside a full one, which reads worse than a single short
// list. At and above it, two. The list is split into two elements here rather
// than in CSS. A grid laid over one flat list pairs items into rows, so
// opening an answer stretches its row and leaves a hole the height of that
// answer beside it in the other column; two independent columns push only the
// items below them. Stacking on mobile keeps the reading order the same as
// reading down each column on desktop. Both the split point and the split
// itself are derived, so an added or removed question rebalances on its own.
const FAQ_SPLIT_AT = 8;
function faqHtml() {
  const cols = FAQS.length >= FAQ_SPLIT_AT
    ? [FAQS.slice(0, Math.ceil(FAQS.length / 2)), FAQS.slice(Math.ceil(FAQS.length / 2))]
    : [FAQS];
  return cols.map(col => `
      <div class="faq-col">${col.map(f => `
        <div class="faq-item">
          <button class="faq-q" type="button" aria-expanded="false">${escHtml(f.q)} <span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button>
          <div class="faq-a"><p${f.id ? ` id="${f.id}"` : ''}>${escHtml(f.a)}</p></div>
        </div>`).join('')}
      </div>`).join('');
}

// A derived word at the head of a sentence. numberWord() and the rest return
// lowercase, which is right mid-sentence and wrong at the start of one.
function sentenceCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// "a, b and c", or "a, b or c" for a sentence that denies the whole list.
// Used wherever prose has to name a set the catalog derives: adding to the set
// rewrites the sentence, instead of leaving it one item short of the data.
function listWords(items, conjunction) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

function escHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// The batch analysis panel: the laboratory, the figure it returned, and every
// analysis it runs on the lot.
//
// The laboratory itself, as data rather than a name typed into the panel.
//
// A named, accredited laboratory is a claim about somebody else's business and
// a logo is their property, so the panel renders an unnamed form rather than
// invent any of the three. `logo` is a path under assets/.
//
// The name here read "Freedom Diagnostics" until the certificates arrived.
// Every one of the ten is issued by Accumark Labs, signed by their lab manager
// and lab director, so the panel was naming a laboratory that did not run the
// analysis on a page that now links the document proving it. assets/freedom-
// diagnostics.png is left in place but nothing reads it.
//
// The mark is Accumark's property, supplied by the business owner to display
// as our testing partner. Drawn at 38px in the panel header and up to 84px on
// how-we-test.html, so the file is sized for the larger of the two and no
// more: a 1249px original for a 38px slot is ten times the bytes for the same
// pixels. check-claims.js fails the build if this path stops resolving to a
// file, because a named laboratory with a broken image beside it reads worse
// than the name on its own, which is what the empty branch below renders.
//
// `accreditation` is the laboratory's standing, in whatever state it is
// actually in, not a credential we are asserting they hold. It read
// "ISO/IEC 17025 accredited" until Accumark's own listing turned out to say
// pending. Pending is not accredited: the assessment is underway and may not
// conclude, so every surface says pending until it does, and check-claims.js
// will not let a page say otherwise while this string does.
//
// When it is granted, change this line, put the certificate under assets/ and
// link it. Until then the honest form of the claim is the one that names the
// standard, says where the lab is with it, and stops there.
const LAB = {
  name: 'Accumark Labs',
  accreditation: 'ISO/IEC 17025 accreditation pending',
  logo: 'assets/accumark-labs.png',
  verify: LAB_VERIFY_URL,
};

// Where a reader checks a certificate against the laboratory's own records.
//
// Empty unless both halves are there. A compound with no report reference
// gets no link rather than one that lands on a verification form with nothing
// in it, which would look like the check had failed.
function verifyUrl(p) {
  const ref = p && p.coaRef;
  return LAB.verify && ref ? LAB.verify + encodeURIComponent(ref) : '';
}

// The sentence that offers it, built from the reference so it names the code
// the reader is about to check. One string, four surfaces: the panel foot,
// the certificate dialog, the FAQ and how-we-test.html.
//
// It says where the link goes and stops there. Whether the laboratory's page
// returns a pass is theirs to answer, and promising an outcome on their
// behalf would be the same overreach as writing the certificate ourselves.
function verifyCopy(p) {
  const ref = p && p.coaRef;
  return ref ? `Check report ${ref} against ${LAB.name}\u2019 own records` : '';
}

// What the header states while LAB is empty. Both halves are true either way:
// the laboratory is not us, and it has nothing riding on the number it returns.
// This is the fallback rather than the default so that naming the lab is a
// one-line change, not a rewrite of the panel.
function labIdentity() {
  return {
    name: LAB.name || 'Independent third-party laboratory',
    accreditation: LAB.accreditation || 'Commissioned per lot, with no stake in the result',
    logo: LAB.logo,
  };
}

// The row the headline figure is taken from. Named rather than matched on a
// string in three places, and check-claims.js fails the build if the panel
// stops holding a row by this name.
const PURITY_ROW = 'Purity';
const purityMethod = () => {
  const row = ANALYSIS_TESTS.find(t => t.name === PURITY_ROW);
  return (row && row.method) || '';
};

// What a row says when the catalog holds no figure for it, which is now none
// of them: every row of every launch compound is filled from its certificate.
// It stays as the fallback for the next compound added before its numbers are
// keyed in. It is not a hedge: every name in ANALYSIS_TESTS is a row the
// certificate reports, so pointing at the document is the true answer to where
// the number is. The alternative, a column of dashes, reads as though the
// analysis were skipped rather than simply not reprinted here.
const RESULT_ON_COA = 'On certificate';

// One row per analysis the laboratory reported for this compound, and what it
// returned.
//
// `value` is the released figure, read from `p.results` keyed by row name.
// A row with nothing behind it falls through to RESULT_ON_COA rather than
// printing a number nobody measured, which is the most damaging thing this
// page could do.
//
// Two kinds of row come back. The rows of ANALYSIS_TESTS are on every
// certificate, so they are listed for every compound whether or not the
// catalog holds the figure yet. Anything else in `results` is an analysis this
// particular lot was given and others were not, and comes back with
// everyLot false so the panel can head it separately: "run on every lot" and
// "run on this one" are different promises and the panel used to make only the
// first, in a block that contained both.
function batchRows(p) {
  const results = (p && p.results) || {};
  const universal = ANALYSIS_TESTS.map(t => {
    const value = results[t.name] || (t.name === PURITY_ROW ? (p && p.purity) || '' : '');
    return { name: t.name, method: t.method, value, held: Boolean(value), everyLot: true };
  });
  const thisLot = Object.keys(results)
    .filter(name => !ANALYSIS_TESTS.some(t => t.name === name))
    .map(name => ({ name, method: '', value: results[name], held: true, everyLot: false }));
  return universal.concat(thisLot);
}

// The card's meta strip. Filtered rather than padded with blanks: a cell is
// listed when the catalog can fill it, so Lot and Tested appear on their own
// the day per-lot data lands and print nothing until then.
function batchMeta(p) {
  return [
    { label: 'Compound', value: (p && p.name) || '' },
    { label: 'Lot', value: (p && p.lot) || '' },
    { label: 'Tested', value: (p && p.tested) || '' },
    // The laboratory's own reference for the report, printed on the
    // certificate beside their name. The FAQ tells a buyer to take it to the
    // laboratory and ask, which is only a real instruction if the site shows
    // them what to quote.
    { label: 'Report', value: (p && p.coaRef) || '' },
    { label: 'Analyses', value: `${TESTS_PER_BATCH} per lot` },
    { label: 'Certificate', value: COA_COPY.short },
  ].filter(m => m.value);
}

// The panel is drawn as a plain string with no DOM access, so js/product.js
// renders it at runtime and tools/build-products.js bakes the identical markup
// into each generated page. One template, so the served HTML and the hydrated
// HTML cannot disagree.
//
// No logo mark is drawn while LAB.logo is empty. An empty box beside the name
// reads as an image that failed to load, which is worse than the name standing
// on its own, and any glyph put there to fill it would be a mark for a
// laboratory nobody has named.
function batchPanelHtml(p) {
  const lab = labIdentity();
  const method = purityMethod();
  return `
      <div class="ba-card">
        <div class="ba-lab">
          ${lab.logo
            ? `<img class="ba-lab-logo" src="${escHtml(pageHref(lab.logo))}" alt="${escHtml(lab.name)}" />`
            : ''}
          <span class="ba-lab-id">
            <span class="ba-lab-name">${escHtml(lab.name)}</span>
            <span class="ba-lab-sub">${escHtml(lab.accreditation)}</span>
          </span>
        </div>
        <div class="ba-figure">
          <span class="ba-figure-label">${escHtml(method ? `Purity by ${method}` : 'Purity')}</span>
          <span class="ba-figure-value">${escHtml((p && p.purity) || '') || '—'}</span>
        </div>
        <dl class="ba-meta">${batchMeta(p).map(m => `
          <div class="ba-meta-cell">
            <dt>${escHtml(m.label)}</dt>
            <dd>${escHtml(m.value)}</dd>
          </div>`).join('')}
        </dl>
      </div>
      <div class="ba-panel">
        <div class="ba-panel-head">
          <span>Full analysis panel</span>
          <span>Run on every lot</span>
        </div>${batchRows(p).map((r, i, all) => `${
          // The second heading is drawn by the first row that needs it, so a
          // compound whose certificate carries nothing extra never renders an
          // empty section under it.
          !r.everyLot && (i === 0 || all[i - 1].everyLot) ? `
        <div class="ba-panel-head">
          <span>Also on this lot</span>
          <span>Not run on every lot</span>
        </div>` : ''}
        <div class="ba-row">
          <span class="ba-row-name">${escHtml(r.name)}${r.method ? `<span class="ba-row-method">${escHtml(r.method)}</span>` : ''}</span>
          <span class="ba-row-value${r.held ? '' : ' is-ref'}">${escHtml(r.value || RESULT_ON_COA)}</span>
        </div>`).join('')}
      </div>
      <p class="ba-foot">${escHtml(COA_COPY.panelNote)}${verifyUrl(p) ? `
        <a class="ba-verify" href="${escHtml(verifyUrl(p))}" target="_blank" rel="noopener">${escHtml(verifyCopy(p))} <span aria-hidden="true">&#8599;</span></a>` : ''}</p>`;
}

// The product page breadcrumb and its Product schema still name a research
// category (CAT_LABEL) and link back to it. Kept as a named chokepoint
// rather than every caller reading p.cat directly, so a future split (e.g.
// two flavors of "growth") only has to change one place. No longer read by
// shop.html's own chip row — see productKind() below for that.
function catFilterGroup(cat) {
  return cat;
}

// Which chip on shop.html a product falls under. Two groups, both
// visible in the data already rather than invented for this: a blend is
// exactly a product tagged 'Peptide Blend', the same tag its product card
// already shows. Kept to two groups on purpose — the four research
// categories in CAT_LABEL (Tissue Research, Metabolic Research, and so on)
// read as intent labels next to what the catalog actually sells, and with
// under a dozen SKUs they sort more of the page than they help. Browsing by
// what something is (a single compound or a co-formulation) needs no
// interpretation; browsing by what it is "for" does.
function productKind(p) {
  return p.tag === 'Peptide Blend' ? 'blends' : 'peptides';
}

// Sort comparators for the catalog's sort control. Keyed so the <option>
// values and the sorting logic can't drift apart. 'featured' is deliberately
// absent — no comparator means the curated GLOW_PRODUCTS order stands.
// Names are compared with localeCompare + numeric so G3-R and CJC-1295
// order by their digits rather than lexically ("CJC-1295" before "CJC-295").
const PRODUCT_SORTS = {
  az:          (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }),
  za:          (a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc':(a, b) => b.price - a.price,
  purity:      (a, b) => parseFloat(b.purity) - parseFloat(a.purity),
};

// ---------------------------------------------------------------------------
// Sitewide markdown. The figures in `sizes` above stay the list price — this is
// the single knob that discounts them, so display and what actually gets
// charged can never drift apart. Set to 0 to take the sale down.
//
// Every price the buyer sees runs through salePrice(); every cart line carries
// the list price as unitOriginal and the marked-down one as unitSale, which is
// what the cart and checkout already total against.
const SITEWIDE_DISCOUNT = 0;

// ---------------------------------------------------------------------------
// The struck-through reference price, per size, as `list` in the catalog above.
//
// Display only, and deliberately so. `price` remains the figure every cart
// line, unitPriceAt() and api/_lib.js work from, so `list` cannot change what
// anyone is billed: adding, editing or deleting it moves the number on screen
// and nothing else. That is the whole reason it is a separate field rather
// than a raised `price` with SITEWIDE_DISCOUNT taking 10% back off — that
// route would have made every charged total a rounding artefact of the
// markdown, and the launch prices are fixed figures, not derived ones.
//
// It also cannot be exactly 10% off and a round number at the same time: 10%
// off $77.77 is $69.99, and $69.99 off a round $78 is 10.3%. The catalog holds
// round list prices, so the real markdown runs 9% to 11% by size. Nothing on
// the site states a percentage for it — the struck price is the entire signal,
// which is also why bulkSavingPct() below suppresses "Save N%" badges for it —
// so there is no figure anywhere that rounding could make untrue.
//
// check-claims.js enforces the two properties that keep it honest: every list
// price is above the price actually charged, and the implied markdown stays
// inside a band that "about 10% off" describes without stretching.
const hasList = size => !!(size && size.list && size.list > size.price);
const listPriceOf = size => (hasList(size) ? size.list : 0);

const round2 = n => Math.round(n * 100) / 100;
const salePrice = n => round2(n * (1 - SITEWIDE_DISCOUNT));
const onSaleNow = () => SITEWIDE_DISCOUNT > 0;
// whole dollars stay clean ($59), marked-down ones keep their cents ($53.10)
const fmtPrice = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));

// "Save N%" badges are for bulk tiers only. The sitewide markdown is not
// advertised anywhere — the struck-through list price is the whole signal — so
// a line saving exactly the sitewide rate gets no badge, and one saving more
// (because a bulk tier stacked on top) reports the combined figure.
function bulkSavingPct(original, sale) {
  if (!(original > sale)) return 0;
  const pct = Math.round((1 - sale / original) * 100);
  return pct > Math.round(SITEWIDE_DISCOUNT * 100) ? pct : 0;
}

// Bulk pricing. Each entry is a *threshold*, not a fixed bundle: `qty` is the
// number of vials at which `off` starts applying.
//
// That distinction is the whole design. The discount is a function of how many
// vials you are buying, so the tier cards and the quantity stepper cannot
// disagree — the cards are shortcuts that set a quantity, and the quantity is
// what prices the order. Somebody who steps up to four vials gets the
// three-vial rate, because "3+ vials, 10% off" is what the card says and four
// is three or more. The alternative, where the cards are separate products
// with their own prices, means a stepper set to 4 quietly charges full price
// next to a card advertising a discount for less product.
//
// `card: true` marks the thresholds that get a card on the product page. The
// ladder is longer than the cards on purpose: three cards is the decision most
// people are actually making, and a wall of six is a worse way to ask it. The
// rates keep climbing for anyone who steps past the last card, and bulkNote()
// states the rest in words so nothing is hidden — a discount you only find by
// guessing a number is not an offer.
//
// 15% at five vials is the ceiling for a single compound in one order,
// confirmed against margin on the lowest-priced SKUs in the catalog rather
// than the highest: a discount that only works on the $89.99 products would
// quietly lose money on the $39.99 ones every time someone bought in bulk.
// Above the ceiling the answer is wholesale, priced on volume per month
// rather than per order and starting at 40% for 10 vials a month, so the
// richer rate is what separates the two rather than the quantity.
//
// The published tiers, confirmed against supplier margin. Every bulk price on
// the site is derived from these rows, so a rate change here is the whole
// change: the cards, the buy box, bulkNote() and the wholesale comparison all
// read them rather than restating the percentages.
const QTY_TIERS = [
  { qty: 1, off: 0, card: true },
  { qty: 2, off: 0.05, card: true },
  { qty: 3, off: 0.10, card: true },
  { qty: 5, off: 0.15 },
];

// The most a single compound can be discounted before wholesale. Derived, so
// adding a richer tier raises it here and in the copy at the same time.
const BULK_MAX_OFF = Math.max(...QTY_TIERS.map(t => t.off));

// "3 vials" / "1 vial". Generated so a threshold change cannot leave a label
// describing the old number.
function tierLabel(qty) {
  return `${qty} ${qty === 1 ? 'vial' : 'vials'}`;
}

// The tier a given quantity actually earns: the highest threshold at or below
// it. This is the function that makes 4 vials cost the 3-vial rate, and it is
// the only place that rule lives.
function tierFor(qty) {
  let hit = QTY_TIERS[0];
  for (const t of QTY_TIERS) if (qty >= t.qty) hit = t;
  return hit;
}

// The bulk discount alone, before the sitewide markdown. This is the figure the
// tier cards advertise ("10% off"), so it is stated exactly as configured
// rather than recomputed from a rounded price.
function bulkOff(qty) {
  return tierFor(qty).off;
}

// What one vial costs at this quantity. The sitewide markdown comes off first
// and the bulk tier stacks on it, so a buyer at a tier saves more than the
// tier advertises, never less.
//
// Rounded here, once, and the line total is this figure times the quantity.
// Rounding the total instead would let "unit x qty" not equal the total the
// cart charges, and the cart lines are built from exactly this number.
function unitPriceAt(listUnit, qty) {
  return round2(listUnit * (1 - SITEWIDE_DISCOUNT) * (1 - bulkOff(qty)));
}

// One row per tier, priced for whichever mg the product page has selected.
// `unitPrice` lets the caller price off the selected size; callers that only
// know the product get the base size.
function getProductVariants(p, unitPrice) {
  const unit = unitPrice || p.price;
  return QTY_TIERS.map(t => {
    const original = round2(t.qty * unit);        // true list price, struck through
    const unitSale = unitPriceAt(unit, t.qty);
    return {
      qty: t.qty,
      off: t.off,
      card: !!t.card,
      label: tierLabel(t.qty),
      original,
      unitSale,
      sale: round2(unitSale * t.qty),
    };
  });
}

// The fine print under the tier cards, written from the ladder rather than
// typed beside it. Two things have to be said and neither can be allowed to go
// stale: that a quantity between thresholds keeps the lower rate, and that the
// rates carry on past the last card. Every number in the sentence is read from
// QTY_TIERS, so changing a tier rewrites the copy.
function bulkNote() {
  const pct = t => `${Math.round(t.off * 100)}%`;
  const cards = QTY_TIERS.filter(t => t.card);
  const beyond = QTY_TIERS.filter(t => !t.card);
  const top = QTY_TIERS[QTY_TIERS.length - 1];
  const lastCard = cards[cards.length - 1];

  // "4 vials are priced at the 3-vial rate" — the in-between case, named with
  // a real number rather than described in the abstract.
  const gap = `Any quantity gets the rate of the tier it reaches: ` +
    `${lastCard.qty + 1} vials are priced at the ${lastCard.qty}-vial rate.`;

  if (!beyond.length) return gap;

  const more = beyond
    .map(t => `${tierLabel(t.qty)} ${pct(t)} off`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');

  return `${gap} It keeps going past ${tierLabel(lastCard.qty)}: ${more}. ` +
    `${pct(top)} is the most on a single compound. ` +
    `Larger volumes are <a href="wholesale.html">wholesale</a>.`;
}

// The meta description for one compound, for the generated page's head and
// for js/product.js to set on product.html?p=<slug>. Both read this, because
// they described the same product in two separately typed sentences and the
// pair had already drifted once.
//
// It carries the purity and says the certificate is published, neither of
// which it could before: purity was placeholder and the documents were not
// hosted. Both are now true of every compound and both are the things a
// search result or an answer engine is actually asked for.
function productMetaDesc(p, size) {
  const s = size || (p.sizes && p.sizes[0]) || {};
  const purity = p.purity ? ` at ${p.purity} purity` : '';
  return `${p.name}, ${s.mg} per vial${purity}. Third-party tested, with the batch ` +
         `certificate published against its lot number. Research use only.`;
}

// URL-safe id for linking a card to its detail page: "BPC-157" -> "bpc-157"
function productSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function findProductBySlug(slug) {
  return GLOW_PRODUCTS.find(p => productSlug(p.name) === slug);
}

// ---------------------------------------------------------------------------
// Launch switch for the per-compound pages.
//
// tools/build-products.js generates a real static page per product at
// /product/<slug>/: its own URL, its own content in the served markup, its
// own Product schema. It was held back because crawlable pages carrying
// placeholder prices and placeholder purity figures are worse than no pages.
// The generator was never the missing part. The data was.
//
// The data is here. The catalog is the supplier's launch SKUs with their real
// prices, every purity and lot was checked against that lot's certificate,
// every compound has a photo, and every certificate is hosted and linked. So
// the pages go live, each one crawlable and each one carrying figures that
// trace to a document the same page links.
//
// Flipping this back to false is the honest move if that stops being true,
// and it moves the whole site at once: every link falls back to
// product.html?p=<slug>, which renders the same product from the same
// catalog, and the sitemap drops the product URLs. One constant, read by the
// browser and by both build scripts, so the site, the sitemap and the
// generator can never disagree about it.
const PRODUCT_PAGES_LIVE = true;

// Where a product card points — the one chokepoint every link goes through,
// so flipping the constant above moves the whole site at once.
function productHref(p) {
  const slug = productSlug(p.name);
  return pageHref(PRODUCT_PAGES_LIVE ? `product/${slug}/` : `product.html?p=${slug}`);
}

// Blog articles live two directories deep, so a bare "product.html" would
// 404 from there. Lift the nav's already-depthed link rather than tracking
// depth separately (same trick js/cart.js uses).
function pageHref(file) {
  // The build runs from the repo root, where every path is already correct.
  if (typeof document === 'undefined') return file;
  // A full URL is already absolute and must not be walked up out of.
  if (/^(https?:)?\/\//.test(file) || /^(mailto:|tel:|data:|#|\/)/.test(file)) return file;
  // The catalog link is the one nav item with no .html extension (it serves
  // through the /shop rewrite in vercel.json), so it is the one link whose
  // own href can be stripped down to the depth prefix every other page needs.
  const link = document.querySelector('#mainNav a[href$="shop"]');
  const prefix = link ? link.getAttribute('href').replace(/shop$/, '') : '';
  return prefix + file;
}

// Thumbnail markup for a product, looked up by name so the cart and checkout
// can call it with nothing but a stored line item. Every product carries a
// real photo (tools/check-claims.js pins this), so there is no drawn-vial
// fallback to reach for here any more.
function productThumb(name) {
  const p = GLOW_PRODUCTS.find(x => x.name === name);
  return p ? `<img class="thumb-photo" src="${pageHref(p.image)}" alt="" loading="lazy" />` : '';
}

// One product card, as markup. Shared by renderProductGrid below and by
// tools/build-catalog.js, so what a crawler is served and what the browser
// draws are the same cards rather than two implementations that agree today.
//
// A product with more than one size has a decision left to make, so its
// button says "Select Options" and opens the picker. A product with exactly
// one has nothing left to choose, so the button says "Add to Cart" and does
// exactly that with no picker in between — and since there is no picker to
// show the size in, the card states it once, next to the name, instead.
function productCardHtml(p, i) {
  const href = productHref(p);
  const stocked = productInStock(p);
  const single = p.sizes.length === 1;
  const name = single ? `${p.name} ${p.sizes[0].mg}` : p.name;
  return `
      <div class="product-card reveal" style="transition-delay:${(i % 3) * 60}ms">
        <a class="product-visual" href="${href}">
          <span class="product-badges">
            ${stocked && hasList(p) ? '<span class="product-badge sale">Sale</span>' : ''}
            ${!stocked
              ? '<span class="product-badge status is-out">Out of stock</span>'
              : p.badge ? `<span class="product-badge status">${p.badge}</span>` : ''}
          </span>
          <img class="product-photo" src="${pageHref(p.image)}" alt="${p.name} vial" loading="lazy" />
        </a>
        <div class="product-footer">
          <h3><a href="${href}">${name}</a></h3>
          ${p.alias ? `<p class="product-alias">${p.alias}</p>` : ''}
          <span class="card-divider" aria-hidden="true"></span>
          <span class="price">
            ${fmtPrice(salePrice(p.price))}
            ${hasList(p) ? `<s class="price-was">${fmtPrice(p.list)}</s>` : ''}
          </span>
          <button class="add-btn" ${stocked
            ? `aria-label="${single ? `Add ${name} to research order` : `Choose a size of ${p.name}`}">${single ? 'Add to Cart' : 'Select Options'}`
            : `disabled aria-label="${p.name} is out of stock">Out of Stock`}</button>
        </div>
      </div>`;
}

// One card on the certificate index. Kept beside productCardHtml() and built
// the same way — a plain string off the catalog, no DOM access — so the page
// can render it in the browser today and a build script can bake it into the
// served markup later without the two drawing different cards.
//
// Deliberately quieter than a product card: no price, no Add to cart, no sale
// badge. Someone here is checking paperwork, not shopping, and a buy button
// beside a certificate reads as an advertisement dressed up as a document.
//
// The button always reads "View certificate" and always opens the same
// modal (js/coa.js), because that modal is what is honest, not the label:
// held or not, pressing it opens a certificate viewer, and what that viewer
// shows already tracks COAS_PUBLISHED — the embedded PDF when one exists,
// the request route when one does not. The label describing the destination
// is not itself the claim; the claim is what the destination says, and that
// has been true since coaHref() was gated on the flag.
function coaCardHtml(p) {
  const single = p.sizes.length === 1;
  const name = single ? `${p.name} ${p.sizes[0].mg}` : p.name;
  const held = Boolean(coaHref(p));
  return `
      <article class="coa-card" data-name="${escHtml(p.name.toLowerCase())}" data-type="${escHtml(CAT_LABEL[p.cat].toLowerCase())}" data-lot="${escHtml((p.lot || '').toLowerCase())}" data-alias="${escHtml((p.alias || '').toLowerCase())}">
        <div class="coa-card-visual">
          ${held ? '<span class="coa-card-flag">PDF</span>' : ''}
          <img src="${pageHref(p.image)}" alt="${escHtml(p.name)} vial" loading="lazy" />
        </div>
        <div class="coa-card-body">
          <span class="coa-card-type">${escHtml(CAT_LABEL[p.cat])}</span>
          <h3 class="coa-card-name">${escHtml(name)}</h3>
          <dl class="coa-card-meta">
            <div><dt>Purity</dt><dd>${escHtml(p.purity || '')  || '—'}</dd></div>
            <div><dt>Lot</dt><dd>${escHtml(p.lot || '') || '—'}</dd></div>
          </dl>
          <button type="button" class="coa-card-view" data-coa-view="${escHtml(p.name)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke-linejoin="round"/>
              <path d="M14 3v5h5" stroke-linejoin="round"/>
              <path d="M9 13.5h6M9 17h4" stroke-linecap="round"/>
            </svg>
            View certificate
          </button>
        </div>
      </article>`;
}

// gridEl: container to render into
// filter: 'all' or a category key
// opts.observeReveal(el): optional, hooks each card into a scroll-reveal observer
// opts.limit: optional, render at most this many cards
// opts.sort: optional key from PRODUCT_SORTS. Omitted leaves the curated
//   order in GLOW_PRODUCTS alone, which is what the homepage preview wants —
//   its limit:8 slice is meant to be the featured eight, not the first eight
//   alphabetically.
// opts.exclude: a product name to leave out. The product page uses it so its
//   own compound cannot appear in its own "more from Glow" row.
// opts.prefer: a category key to float to the front without filtering the rest
//   away. The product page wants siblings first but would rather show four
//   cards from the wider catalog than one lonely card from a thin category.
// opts.featureFirst: a product name to move to the very front, everything
//   else keeping its relative order behind it. For when one page wants a
//   different lead card than GLOW_PRODUCTS' own curated order without
//   reordering that list itself — the homepage's featured slice and the
//   catalog's default sort used to be the same list, which meant the two
//   pages could only ever agree on what to lead with.
// opts.query: a search string. Matched against the name only, case-
//   insensitively, substring — the same rule js/search.js uses for the
//   header search so typing "bpc" behaves the same wherever you type it.
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  let list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => productKind(p) === filter);
  if (opts.exclude) list = list.filter(p => p.name !== opts.exclude);
  if (opts.query) {
    const q = opts.query.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  // slice() first: a stable sort over a copy, so the curated order survives
  // both here and for every other caller.
  if (opts.prefer) {
    list = list.slice().sort((a, b) =>
      (b.cat === opts.prefer ? 1 : 0) - (a.cat === opts.prefer ? 1 : 0));
  }
  if (opts.featureFirst) {
    list = list.slice().sort((a, b) =>
      (a.name === opts.featureFirst ? -1 : 0) - (b.name === opts.featureFirst ? -1 : 0));
  }

  // a category (or search) with nothing in it used to render a silently blank grid
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'product-grid-empty';
    empty.textContent = opts.query
      ? `No compounds match "${opts.query.trim()}".`
      : 'No compounds in this category yet.';
    gridEl.appendChild(empty);
    return;
  }

  const compare = PRODUCT_SORTS[opts.sort];
  // slice() so sorting a view never reorders GLOW_PRODUCTS itself — the
  // curated order has to survive for every other caller
  if (compare) list = list.slice().sort(compare);

  if (opts.limit) list = list.slice(0, opts.limit);

  // Rendered as one string so the same function can produce the markup
  // tools/build-catalog.js bakes into shop.html. Behaviour is bound below,
  // to cards that already exist, rather than arriving with them.
  gridEl.innerHTML = list.map((p, i) => productCardHtml(p, i)).join('');

  list.forEach((p, i) => {
    const href = productHref(p);
    const card = gridEl.children[i];

    // the whole card opens the product page; the button is the one exception.
    // A product with a size to choose opens the quick-add sheet; a
    // single-size product has nothing to pick, so the button adds it
    // straight to the cart instead of opening a sheet with one row in it.
    const addBtn = card.querySelector('.add-btn');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (p.sizes.length > 1) {
        if (window.openQuickAdd) window.openQuickAdd(p);
      } else if (window.GlowCart) {
        const size = p.sizes[0];
        window.GlowCart.add({
          name: p.name,
          variant: size.mg,
          unitOriginal: size.price,
          unitList: listPriceOf(size),
          unitSale: salePrice(size.price),
        });
      }
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;   // let real links/buttons behave normally
      window.location.href = href;
    });
    card.style.cursor = 'pointer';

    if (opts.observeReveal) opts.observeReveal(card);
  });
}

// This file is a plain browser script — everything above is a global, loaded
// with <script src>. The guard below additionally lets Node read the catalog,
// which is how tools/build-products.js generates a static page per compound
// from the same source the site renders from. In a browser `module` is
// undefined and this is a no-op.
//
// Only data and pure helpers are exported. Anything that touches `document`
// (pageHref, productThumb, renderProductGrid) is browser-only by nature and
// deliberately left out.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GLOW_PRODUCTS,
    productSlug,
    productMetaDesc,
    findProductBySlug,
    getProductVariants,
    salePrice,
    fmtPrice,
    onSaleNow,
    hasList,
    listPriceOf,
    sizeInStock,
    productInStock,
    CAT_LABEL,
    CART_UPSELL,
    cartUpsell,
    avgPurity,
    BATCHES_TESTED,
    NO_DISPATCH_DAYS,
    NO_DELIVERY_DAY,
    DISPATCH_CUTOFF_HOUR,
    DISPATCH_CUTOFF_LABEL,
    DISPATCH_CUTOFF_TICKER,
    DISPATCH_CUTOFF_PDP_LABEL,
    DISPATCH_LABEL,
    TRANSIT_DAYS,
    PACKAGING_PLAIN,
    ANALYSIS_TESTS,
    TESTS_PER_BATCH,
    numberWord,
    ANALYSIS_SHORT,
    ANALYSIS_LONG,
    ANALYSIS_NOT_RUN,
    ANALYSIS_SOME_LOTS,
    verifyUrl,
    verifyCopy,
    verifyHost,
    LAB_VERIFY_URL,
    listWords,
    SOURCE_SHORT,
    SOURCE_LONG,
    VIAL_ART_NOTICE,
    FAQS,
    faqHtml,
    productCardHtml,
    coaCardHtml,
    coaHref,
    productHref,
    catFilterGroup,
    productKind,
    LAB,
    labIdentity,
    PURITY_ROW,
    purityMethod,
    RESULT_ON_COA,
    batchRows,
    batchMeta,
    batchPanelHtml,
    bulkSavingPct,
    SITEWIDE_DISCOUNT,
    QTY_TIERS,
    BULK_MAX_OFF,
    bulkNote,
    tierFor,
    tierLabel,
    bulkOff,
    unitPriceAt,
    PRODUCT_PAGES_LIVE,
    COAS_PUBLISHED,
    COA_COPY,
    PAYMENTS_LIVE,
    PAYMENT_COPY,
    PAYMENT_METHODS,
    STRIPE_PUBLISHABLE_KEY,
    META_PIXEL_ID,
    META_DOMAIN_VERIFICATION,
    TIKTOK_PIXEL_ID,
    X_PIXEL_ID,
    X_EVENT_IDS,
    LAUNCH_OFFER_LIVE,
    LAUNCH_OFFER,
    round2,
  };
}
