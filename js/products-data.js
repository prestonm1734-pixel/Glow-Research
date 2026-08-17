// ===================== Glow Research — shared product catalog =====================
// Used by both the homepage catalog preview (index.html) and the full
// catalog page (peptides.html) so the product list only lives in one place.

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
// `purity` is a PLACEHOLDER on every product below. The values are stand-ins
// for layout, not measured figures, and the supplier import overwrites them
// with the real release data. Only two things read them — the fine print on the
// drawn vial and the `additionalProperty` in the Product schema — so replacing
// the strings in place is the whole job; no other file needs touching. Do not
// quote any of these numbers in marketing copy until the import has run.
//
// `coa` is optional: a URL to that compound's own certificate of analysis.
// It is what "View certificate of analysis" on the product page opens. A
// product without one falls back to COA_URL below.
//
// `blurb` is a summary of `about[]`, not a second description that could
// contradict it; the generated page's Product schema `description` is
// `about[0]`, the fuller sentence.
//
// `about` and `research` fill the accordions under the buy box. Same rule as
// `blurb`: composition and what laboratory work examines, never dosing,
// outcomes, or a finding we cannot stand behind.

// One certificate link shared by every product that has no `coa` of its own.
// Paste the hosted COA here (a PDF, a Drive link, whatever the lab gives you)
// and every product page's "View certificate of analysis" goes live at once.
// Left empty the box stays put and simply is not clickable, which is better
// than sending a buyer to a dead link.
const COA_URL = '';

// ---------------------------------------------------------------------------
// Are certificates hosted and linked per batch yet?
//
// Every lot IS third-party tested and DOES have a batch-specific certificate —
// that is how the business runs. What is not true yet is that this site hosts
// them, so the only route that works today is asking us for one. This flag is
// what the certificate wording across the site keys off, so the two states are
// a constant rather than seven copies of the same sentence.
//
// Flip it to true in the same change that fills COA_URL (or per-product `coa`)
// and every surface upgrades from "email us for the COA" to a direct
// batch-specific link at once.
//
// Kept separate from PRODUCT_PAGES_LIVE below on purpose: certificates and the
// generated product pages both arrive with the supplier import, but they do not
// have to go live in the same deploy.
const COAS_PUBLISHED = false;

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
// client-side code. Read by js/checkout.js to construct `Stripe(...)`. Swap
// for the live-mode key (starts pk_live_, not pk_test_) only once Stripe's
// own dashboard is also switched out of test mode — the two must move
// together or a live-looking checkout will silently take test-mode payments.
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51U3kUmHjOd9MaH5sNxBU6C1neJypFeZGunq4CUybpTBrzWRC0dA4XY72By2DFkWDwIz8RPdHUhXHZlu6M0dgcTjW00ufOBrU9S';

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

// The certificate copy, in one place. Both branches describe the same
// operation — third-party tested lots, a certificate per batch — and differ
// only in how the reader gets hold of the document.
const COA_COPY = COAS_PUBLISHED ? {
  // trust lists and other tight spaces
  short: 'Batch-matched COA',
  // the box on the product page
  boxTitle: 'View certificate of analysis',
  boxSub: 'HPLC purity and mass-spec identity, matched to the lot number on your vial',
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
  faq: 'Two places. Every product page links directly to its current lot’s certificate, ' +
       'and every vial carries the lot number that certificate is issued against, so you can ' +
       'check what is in your hand against the document rather than just what was posted online. ' +
       'Want a certificate for a batch you already have? Email support@glowresearch.shop with the ' +
       'lot number. Certificates are issued by the independent laboratory that performed the ' +
       'analysis, not by us.',
} : {
  short: 'COA on request',
  boxTitle: 'Certificate of analysis on request',
  boxSub: 'Email support@glowresearch.shop with the lot number on your vial and we will send the COA for that batch',
  orderNote: 'Lot COA available on request',
  panelNote: 'Certificate on request: email support@glowresearch.shop with the lot number on your vial',
  panelLink: '',
  docLine: 'Batch-specific, issued by the analysing laboratory. Email support@glowresearch.shop with the lot number for a copy',
  faq: 'Email support@glowresearch.shop with the compound and lot number, or the order number if ' +
       'you have already bought, and we will send the certificate for that exact batch, including ' +
       'batches that have since sold out. Every vial carries the lot number its certificate is ' +
       'issued against, so you can check what is in your hand against the document. Certificates ' +
       'are issued by the independent laboratory that performed the analysis, not by us.',
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
  return (p && p.coa) || COA_URL || '';
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
  // Order is curated, not alphabetical or by add date: it drives both the
  // homepage's limit:8 preview slice and the catalog's default "Featured"
  // sort, so it is the actual answer to "what does a visitor see first."
  // Ranked by the badge each product already carries (Best Seller, then
  // Popular, then Best Value), which is the one popularity signal already in
  // the data rather than a second, separate ranking to keep in sync with it.
  { name: 'GLP-3 (RT)', alias: 'Retatrutide', tag: null, cat: 'metabolic', purity: '99.4%', badge:'Best Seller',
    sizes: [
      { mg: '10mg', price: 104.99, list: 130, sku: 'GLO-RT10', image: 'assets/products/retatrutide-10mg-v3.webp' },
    ],
    blurb: 'A triple GIP, GLP-1 and glucagon receptor agonist peptide. Studied for its combined incretin and glucagon signalling profile.',
    about: [
      'GLP-3 (RT) is Glow’s designation for retatrutide, a synthetic peptide agonist active at three receptors from one molecule: the GIP receptor, the GLP-1 receptor and the glucagon receptor.',
      'Engaging the glucagon receptor alongside the two incretin receptors is what separates it from earlier co-agonists, and is why it is studied as a distinct pharmacological class rather than a variant of existing GLP-1 or GIP agonists.'
    ],
    research: [
      { t: 'Triple receptor pharmacology', d: 'Used to characterise relative potency and selectivity across the GIP, GLP-1 and glucagon receptors from a single molecule.' },
      { t: 'Glucagon receptor signalling', d: 'Studied in hepatocyte and cAMP assays for activity at the glucagon receptor, a target the two-receptor co-agonists do not engage.' },
      { t: 'Comparative incretin pharmacology', d: 'Applied as a comparator when characterising newer multi-receptor agonists against single- and dual-receptor peptides.' }
    ] },
  { name: 'GLP-1 (SM)', alias: 'Semaglutide', tag: null, cat: 'metabolic', purity: '99.5%', badge:'Popular',
    sizes: [{ mg: '10mg', price: 79.99, list: 100, sku: 'GLO-SM10', image: 'assets/products/glp-1-sm-10mg-v3.webp' }],
    blurb: 'A GLP-1 receptor agonist analogue. Supplied for laboratory investigation of incretin receptor signalling.',
    about: [
      'GLP-1 (SM) is Glow’s designation for semaglutide, a GLP-1 receptor agonist analogue. Two structural differences from native GLP-1 matter in the laboratory: an alpha-aminoisobutyric acid substitution at position 8 that resists DPP-4 cleavage, and a C18 fatty diacid chain at position 26 that promotes albumin binding.',
      'Those two modifications are why it behaves so differently from native GLP-1 across a time course, and usually why it is the chosen comparator.'
    ],
    research: [
      { t: 'Incretin receptor signalling', d: 'Used in cAMP accumulation and beta-arrestin recruitment assays at the GLP-1 receptor.' },
      { t: 'Albumin binding', d: 'Studied for how the fatty acid chain alters distribution and persistence in model systems.' },
      { t: 'Metabolic pathway research', d: 'Applied in islet and hepatocyte culture models examining downstream incretin signalling.' }
    ] },
  { name: 'GHK-Cu', tag: null, cat: 'tissue', purity: '99.8%', badge:'Best Value',
    sizes: [{ mg: '50mg', price: 54.99, list: 70, sku: 'GLO-CU50', image: 'assets/products/ghk-cu-50mg-v3.webp' }],
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
  { name: 'BPC-157', tag: null, cat: 'tissue', purity: '99.8%', badge:null,
    sizes: [
      { mg: '10mg', price: 64.99, list: 80, sku: 'GLO-BC10', image: 'assets/products/bpc-157-10mg-v3.webp' },
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
  { name: 'BPC-157/TB-500', alias: 'Wolverine', tag: 'Peptide Blend', cat: 'tissue', purity: '99.0%', badge:null,
    sizes: [
      { mg: '10mg', price: 84.99, list: 105, sku: 'GLO-BB10', image: 'assets/products/bpc-157-tb-500-blend-10mg-v3.webp' },
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
  { name: 'GLOW', alias: 'GHK-Cu/BPC-157/TB-500', tag: 'Peptide Blend', cat: 'tissue', purity: '99.0%', badge:null,
    sizes: [{ mg: '70mg', price: 124.99, list: 155, sku: 'GLO-BBG70', image: 'assets/products/glow-70mg-v3.webp' }],
    blurb: 'A compounded blend of GHK-Cu, BPC-157 and TB-500. Supplied for research using all three peptides together in one vial.',
    about: [
      'GLOW is Glow Research’s designation for a compounded blend of three research peptides, GHK-Cu, BPC-157 and TB-500, supplied together in one 70mg vial rather than as separate compounds. It is commonly referred to by its components, GHK-Cu/BPC-157/TB-500, within the peptide research community.',
      'GHK-Cu, BPC-157 and TB-500 act through distinct mechanisms, copper-dependent extracellular matrix signalling, angiogenic signalling and actin-binding cytoskeletal dynamics respectively, so the blend is a co-formulation of three independent compounds rather than a new one with its own mechanism.'
    ],
    research: [
      { t: 'Co-formulation research', d: 'Used by laboratories studying multiple compounded peptides delivered from a single vial rather than several discrete kits.' },
      { t: 'Comparative protocols', d: 'Applied alongside single-compound vials when comparing blended and separately administered research protocols.' }
    ] },
  { name: 'CJC-1295 No DAC/Ipamorelin', tag: 'Peptide Blend', cat: 'growth', purity: '99.0%', badge:null,
    sizes: [{ mg: '5/5mg', price: 89.99, list: 110, sku: 'GLO-CP10', image: 'assets/products/cjc-1295-ipamorelin-5-5mg-v3.webp' }],
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
  { name: 'Tesamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.5%', badge:null,
    sizes: [{ mg: '10mg', price: 98.99, list: 125, sku: 'GLO-TSM10', image: 'assets/products/tesamorelin-10mg-v3.webp' }],
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
  { name: 'GLP-2 (TR)', alias: 'Tirzepatide', tag: null, cat: 'metabolic', purity: '99.4%', badge:null,
    sizes: [{ mg: '10mg', price: 89.99, list: 110, sku: 'GLO-T10', image: 'assets/products/glp-2-tr-10mg-v3.webp' }],
    blurb: 'A dual GIP and GLP-1 receptor agonist peptide. Used in research examining co-agonist receptor pharmacology.',
    about: [
      'GLP-2 (TR) is Glow’s designation for tirzepatide, a dual receptor co-agonist peptide, active at both the GIP and the GLP-1 receptor from a single molecule.',
      'Single-molecule co-agonists are studied precisely because the two receptors can be engaged at different relative potencies, which is difficult to reproduce by simply combining two separate agonists.'
    ],
    research: [
      { t: 'Co-agonist pharmacology', d: 'Used to characterise relative potency at the GIP and GLP-1 receptors from one molecule.' },
      { t: 'Biased signalling', d: 'Studied for the balance between G-protein coupling and beta-arrestin recruitment at each receptor.' },
      { t: 'Receptor crosstalk', d: 'Applied in models examining how engaging both receptors at once differs from either alone.' }
    ] },
  { name: 'MOTS-C', tag: null, cat: 'longevity', purity: '99.1%', badge:null,
    sizes: [{ mg: '10mg', price: 74.99, list: 95, sku: 'GLO-MS10', image: 'assets/products/mots-c-10mg-v3.webp' }],
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
// One decimal, because that is the precision the certificates report.
// NOTE: `purity` is still placeholder data (see the header of this file), so
// this figure is only as true as those stand-ins until the import runs.
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
// CUTOFF_LABEL is derived rather than written, so the hour and the words a
// customer reads cannot come apart. check-claims.js pins every "<n> AM|PM PST"
// on the site, and in the scripts that render copy, to CUTOFF_HOUR.
const CUTOFF_HOUR = 14;
const CUTOFF_H12 = CUTOFF_HOUR > 12 ? CUTOFF_HOUR - 12 : CUTOFF_HOUR;
const CUTOFF_MERIDIEM = CUTOFF_HOUR >= 12 ? 'PM' : 'AM';
const CUTOFF_LABEL = `${CUTOFF_H12}:00 ${CUTOFF_MERIDIEM} PST`;
// The same time without the minutes, for the evidence panel, where the row is
// three words and ":00" is noise. Derived from the same hour, so there is still
// only one number to change.
const CUTOFF_LABEL_SHORT = `${CUTOFF_H12} ${CUTOFF_MERIDIEM} PST`;

// FedEx transit, in business days. Quoted by the delivery estimate on the
// product page and by the dispatch row of the evidence panel. check-claims.js
// pins every "FedEx <n>-Day" on the site to this number.
const TRANSIT_DAYS = 2;

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
    short: 'HPLC-UV',
    method: 'Reverse-phase HPLC-UV',
    plain: 'How much of the powder is the peptide you ordered. This is the percentage printed on the certificate.',
  },
  {
    name: 'Identity',
    short: 'LC-MS',
    method: 'LC-MS',
    plain: 'Weighs the molecule to confirm it is the one on the label, not something close to it.',
  },
  {
    name: 'Net peptide content',
    short: 'net peptide content',
    method: '',
    plain: 'How many milligrams of actual peptide are in the vial once salt and water are taken out.',
  },
  {
    name: 'Sterility',
    short: 'sterility',
    method: '',
    plain: 'The lot is cultured to see whether anything grows. Nothing should.',
  },
  {
    name: 'Endotoxin',
    short: 'endotoxin',
    method: 'LAL assay, USP chapter 85',
    plain: 'Checks for bacterial toxin, which is left behind even after the bacteria themselves are gone.',
  },
  {
    name: 'Appearance and solubility',
    short: 'appearance and solubility',
    method: '',
    plain: 'The powder is looked at and dissolved. It should look right and go into solution cleanly.',
  },
  {
    name: 'Heavy metals',
    short: 'heavy metals',
    method: '',
    plain: 'Screens for lead, arsenic and the other metals that can carry over from manufacturing.',
  },
];

// The number every page states, derived from the rows above so it cannot be
// typed wrong. Spelled out as well as counted, because the pages say "Seven
// tests" in a headline and "7x" in a subheading and both have to move together.
const TESTS_PER_BATCH = ANALYSIS_TESTS.length;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = n => NUMBER_WORDS[n] || String(n);

// Built from the rows, not typed alongside them: the panel's four-word summary
// used to carry an eighth term the certificate does not report.
const ANALYSIS_SHORT = ANALYSIS_TESTS.map(t => t.short).join(' + ');
const ANALYSIS_LONG = 'reverse-phase HPLC-UV for purity, LC-MS for identity, net peptide content, sterility testing, endotoxin testing by LAL assay under USP chapter 85, appearance and solubility inspection, heavy metals screening, and lot archival linking every batch to its certificate';
const SOURCE_SHORT = 'Manufacturing partner';
const SOURCE_LONG = 'Synthesis and fill at a partner facility operating to cGMP-aligned quality practices';

// The tests nobody runs on these lots, named out loud.
//
// ANALYSIS_LONG is the complete list of what is performed, which means every
// other analysis a buyer might assume is included is absent. Left unsaid, an
// absence reads as a pass, so anything in this array is named by the FAQ, and
// the FAQ builds that sentence from here rather than from prose someone typed.
//
// The array is empty, and has been repeatedly reduced rather than written.
// Endotoxin came out when the certificate format showed a LAL assay under
// USP <85> as a standard line. General contaminant screening came out when
// the panel was rebuilt around the analyses the laboratory actually reports
// per lot, which are now the rows of ANALYSIS_TESTS above. Sterility briefly
// dropped out of that rebuild and was put back in when it was confirmed the
// lab still runs it on every lot; it is not a stand-in for any of the others.
//
// Empty is not the same as unchecked. check-claims.js still holds the two
// halves apart: nothing in this array may appear in ANALYSIS_SHORT,
// ANALYSIS_LONG, or the testing copy on how-we-test.html, so the day a test
// moves back out of the certificate, adding it here is enough to make every
// page that claims it fail.
const ANALYSIS_NOT_RUN = [];

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
// just pushed the four questions someone actually needs answered before they
// will trust a peptide supplier further down the page. What is left is short
// on purpose: is it for research only, is it independently tested and for
// what, where is the document, and how do you check the document is real. That
// ordering is the point, human-consumption first because it is the one legal
// line, then the verification trail in the order someone actually walks it.
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
    q: 'Are Glow Research peptides intended for human consumption?',
    a: 'No. All products sold by Glow Research are strictly for laboratory and in-vitro research use only. They are not drugs, supplements, foods, or cosmetics. They have not been evaluated or approved by the FDA for any use, and they are not intended to diagnose, treat, cure, or prevent any disease. They are not for human or animal use of any kind.',
  },
  {
    // Derived from ANALYSIS_LONG and ANALYSIS_NOT_RUN rather than restated, so
    // this cannot end up describing a test the laboratory does not run, or
    // staying silent about one it does not. check-claims.js requires this
    // answer to start with ANALYSIS_LONG verbatim and to name every entry in
    // ANALYSIS_NOT_RUN somewhere in the FAQ.
    q: 'Is every lot tested by an independent laboratory, and for what?',
    a: `${ANALYSIS_LONG}. Yes, on every lot, before it is released for sale. That is ${numberWord(TESTS_PER_BATCH)} separate analyses. Identity and purity are two different questions and neither covers the other: identity is whether the peptide in the vial is the sequence you ordered, purity is what proportion of the material is that sequence rather than truncated peptide, residual reagent or salt. Net peptide content, sterility, endotoxin, appearance and solubility, and heavy metals are ${numberWord(TESTS_PER_BATCH - 2)} more, each answering something the other two do not. Lot archival is counted as none of them: it is not a chemical test but a record, the guarantee that the certificate you can pull up names the batch number printed on the vial in front of you rather than a different lot's paperwork. The certificate is issued by the laboratory that ran the analysis, not by us. Glow does not manufacture, does not operate a laboratory, and does not grade its own inventory.`,
  },
  {
    // Answer comes from COA_COPY, which keys off COAS_PUBLISHED. While
    // certificates are not hosted this offers the route that works, and it
    // upgrades itself the moment they are, with no edit here.
    id: 'faqCoa',
    q: 'Where do I find a lot\u2019s COA?',
    a: COA_COPY.faq,
  },
  {
    q: 'How do I know a certificate is genuine?',
    a: 'Check it against the laboratory, not against us. A certificate names the laboratory that performed the analysis, carries that laboratory\u2019s own report reference and the date the analysis was run, and is issued against one lot number. Match that lot number to the one printed on your vial, then take the report reference to the issuing laboratory if you want it confirmed at source. We do not issue certificates, and that is the part that makes them worth checking: a document we could produce on our own would prove nothing.',
  },
  {
    q: 'Where is the lot number on my vial?',
    a: 'Printed on the vial label. It is the number the certificate for that batch is issued against, so it is what you quote when you ask us for the certificate, and what you match the certificate against once you have it. If the label is obscured or you are not sure which field you are reading, email support@glowresearch.shop with your order number and we will tell you which lot shipped against that order.',
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
          <button class="faq-q" type="button" aria-expanded="false">${escHtml(f.q)} <span class="icon" aria-hidden="true">+</span></button>
          <div class="faq-a"><p${f.id ? ` id="${f.id}"` : ''}>${escHtml(f.a)}</p></div>
        </div>`).join('')}
      </div>`).join('');
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
// PLACEHOLDER: all three fields are empty, because the laboratory has not been
// named on the site yet and we hold no mark we are licensed to draw. A named,
// accredited laboratory is a claim about somebody else's business, and a logo
// is their property, so inventing either to fill the header is exactly what
// PRINCIPLES.md rules out. The panel renders its unnamed form until all three
// are confirmed together: `logo` is a path under assets/.
const LAB = {
  name: '',
  accreditation: '',
  logo: '',
};

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

// What a row says when the catalog holds no figure for it, which today is six
// of the seven. It is not a hedge: every name in ANALYSIS_TESTS is a row the
// certificate reports, so pointing at the document is the true answer to where
// the number is. The alternative, a column of dashes, reads as though the
// analysis were skipped rather than simply not reprinted here.
const RESULT_ON_COA = 'On certificate';

// One row per analysis the laboratory runs, and what it reported for this
// compound.
//
// `value` is the released figure. Purity is the only one the catalog holds
// today, so every other row falls through to RESULT_ON_COA: a results column
// filled with invented numbers is the most damaging thing this page could
// print. `p.results`, keyed by the row name, is where a real released report
// lands, and each row picks its own figure up the moment one does.
function batchRows(p) {
  const results = (p && p.results) || {};
  return ANALYSIS_TESTS.map(t => {
    const value = results[t.name] || (t.name === PURITY_ROW ? (p && p.purity) || '' : '');
    return { name: t.name, method: t.method, value, held: Boolean(value) };
  });
}

// The card's meta strip. Filtered rather than padded with blanks: a cell is
// listed when the catalog can fill it, so Lot and Tested appear on their own
// the day per-lot data lands and print nothing until then.
function batchMeta(p) {
  return [
    { label: 'Compound', value: (p && p.name) || '' },
    { label: 'Lot', value: (p && p.lot) || '' },
    { label: 'Tested', value: (p && p.tested) || '' },
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
            ? `<img class="ba-lab-logo" src="${escHtml(lab.logo)}" alt="${escHtml(lab.name)}" />`
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
        </div>${batchRows(p).map(r => `
        <div class="ba-row">
          <span class="ba-row-name">${escHtml(r.name)}${r.method ? `<span class="ba-row-method">${escHtml(r.method)}</span>` : ''}</span>
          <span class="ba-row-value${r.held ? '' : ' is-ref'}">${escHtml(r.value || RESULT_ON_COA)}</span>
        </div>`).join('')}
      </div>
      <p class="ba-foot">${escHtml(COA_COPY.panelNote)}</p>`;
}

// Which chip on peptides.html a product falls under. The catalog only has
// four research categories (see CAT_LABEL), each already broad enough to
// browse by, so this is the identity function today — but it stays a named
// chokepoint rather than every caller reading p.cat directly, so a future
// split (e.g. two flavors of "growth") only has to change one place.
function catFilterGroup(cat) {
  return cat;
}

// Sort comparators for the catalog's sort control. Keyed so the <option>
// values and the sorting logic can't drift apart. 'featured' is deliberately
// absent — no comparator means the curated GLOW_PRODUCTS order stands.
// Names are compared with localeCompare + numeric so GLP3-RT and CJC-1295
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
// than a raised `price` with SITEWIDE_DISCOUNT taking 20% back off — that
// route would have made every charged total a rounding artefact of the
// markdown, and the launch prices are fixed figures, not derived ones.
//
// It also cannot be exactly 20% off and a round number at the same time: 20%
// off $131.25 is $105, and $105 off a round $130 is 19.2%. The catalog holds
// round list prices, so the real markdown runs 18% to 21% by size. Nothing on
// the site states a percentage for it — the struck price is the entire signal,
// which is also why bulkSavingPct() below suppresses "Save N%" badges for it —
// so there is no figure anywhere that rounding could make untrue.
//
// check-claims.js enforces the two properties that keep it honest: every list
// price is above the price actually charged, and the implied markdown stays
// inside a band that "about 20% off" describes without stretching.
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
// 20% at ten vials is the ceiling for a single compound. Above that the answer
// is wholesale, which starts at 25% for 25 vials a month, so the retail ladder
// stops exactly where the wholesale one begins rather than overlapping it.
//
// PLACEHOLDER RATES. The thresholds and percentages are ours to set, but the
// supplier import decides what margin actually supports them. Confirm before
// launch; nothing else needs touching, since every price on the site is
// derived from these rows.
const QTY_TIERS = [
  { qty: 1, off: 0, card: true },
  { qty: 2, off: 0.05, card: true },
  { qty: 3, off: 0.10, card: true },
  { qty: 5, off: 0.15 },
  { qty: 10, off: 0.20 },
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
// /peptides/<slug>/ — its own URL, its own content in the served markup, its
// own Product schema. None of that is live yet: the real catalog, prices,
// images and COAs are still to be imported, and nine crawlable pages carrying
// placeholder prices and placeholder purity figures are worse than no pages.
// Nothing here is broken — the generator is finished. What is missing is data.
//
// Until then every link stays on product.html?p=<slug>, which renders the same
// product from the same catalog.
//
// To launch: import the real catalog, fill COA_URL (or a per-product `coa`),
// set this to true, then run `node tools/build.js` and commit peptides/**.
// This single constant is read by the browser and by both build scripts, so
// the site, the sitemap and the generator can never disagree about it.
const PRODUCT_PAGES_LIVE = true;

// Where a product card points — the one chokepoint every link goes through,
// so flipping the constant above moves the whole site at once.
function productHref(p) {
  const slug = productSlug(p.name);
  return pageHref(PRODUCT_PAGES_LIVE ? `peptides/${slug}/` : `product.html?p=${slug}`);
}

// Blog articles live two directories deep, so a bare "product.html" would
// 404 from there. Lift the nav's already-depthed link rather than tracking
// depth separately (same trick js/cart.js uses).
function pageHref(file) {
  // The build runs from the repo root, where every path is already correct.
  if (typeof document === 'undefined') return file;
  const link = document.querySelector('#mainNav a[href$="peptides.html"]');
  const prefix = link ? link.getAttribute('href').replace(/peptides\.html$/, '') : '';
  return prefix + file;
}

// Thumbnail markup for a product, looked up by name so the cart and checkout
// can call it with nothing but a stored line item. Falls back to the drawn
// vial for products that have no photo yet.
function productThumb(name) {
  const p = GLOW_PRODUCTS.find(x => x.name === name);
  if (p && p.image) {
    // onerror is inline, not wired up after the fact, because this markup
    // ships baked into static HTML too: a load that fails should collapse
    // to the same drawn vial used when a product has no photo at all
    // (below), not the browser's broken-image icon.
    return `<img class="thumb-photo" src="${pageHref(p.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vial'}))" />`;
  }
  return '<span class="vial"></span>';
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
          ${p.image
            ? `<img class="product-photo" src="${pageHref(p.image)}" alt="${p.name} vial" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vial'}))" />`
            : '<div class="vial"></div>'}
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
// The button says what pressing it actually does. While certificates are held
// it opens the route to one, so it reads "Request certificate": a button
// labelled "View certificate" that produces an email address instead of a
// document is the exact promise COAS_PUBLISHED exists to stop the site making.
function coaCardHtml(p) {
  const single = p.sizes.length === 1;
  const name = single ? `${p.name} ${p.sizes[0].mg}` : p.name;
  const held = Boolean(coaHref(p));
  return `
      <article class="coa-card" data-name="${escHtml(p.name.toLowerCase())}" data-type="${escHtml(CAT_LABEL[p.cat].toLowerCase())}" data-lot="${escHtml((p.lot || '').toLowerCase())}" data-alias="${escHtml((p.alias || '').toLowerCase())}">
        <div class="coa-card-visual">
          ${held ? '<span class="coa-card-flag">PDF</span>' : ''}
          ${p.image
            ? `<img src="${pageHref(p.image)}" alt="${escHtml(p.name)} vial" loading="lazy" />`
            : '<span class="vial" aria-hidden="true"></span>'}
        </div>
        <div class="coa-card-body">
          <span class="coa-card-type">${escHtml(CAT_LABEL[p.cat])}</span>
          <h3 class="coa-card-name">${escHtml(name)}</h3>
          <dl class="coa-card-meta">
            <div><dt>Purity</dt><dd>${escHtml(p.purity || '')  || '—'}</dd></div>
            <div><dt>Lot</dt><dd>${escHtml(p.lot || '') || '—'}</dd></div>
          </dl>
          <button type="button" class="coa-card-view" data-coa-view="${escHtml(p.name)}">
            ${held ? 'View certificate' : 'Request certificate'} <span aria-hidden="true">&rarr;</span>
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
// opts.query: a search string. Matched against the name only, case-
//   insensitively, substring — the same rule js/search.js uses for the
//   header search so typing "bpc" behaves the same wherever you type it.
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  let list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => catFilterGroup(p.cat) === filter);
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
  // tools/build-catalog.js bakes into peptides.html. Behaviour is bound below,
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
    CUTOFF_HOUR,
    CUTOFF_LABEL,
    CUTOFF_LABEL_SHORT,
    TRANSIT_DAYS,
    ANALYSIS_TESTS,
    TESTS_PER_BATCH,
    numberWord,
    ANALYSIS_SHORT,
    ANALYSIS_LONG,
    ANALYSIS_NOT_RUN,
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
    STRIPE_PUBLISHABLE_KEY,
    round2,
  };
}
