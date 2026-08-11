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
// It is also the one line under the product name in the buy box and the
// `description` in each generated page's Product schema, so it is short by
// requirement, not by taste: two lines is the budget.
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
// `blurb` is the Product schema `description` on each generated page. It is a
// summary of `about[]`, not a second description that could contradict it. The
// line under the product name in the buy box is identityLine(), built below.
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
const PAYMENTS_LIVE = false;

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
  faq: 'Email support@glowresearch.shop with the compound and lot number, or the order number if ' +
       'you have already bought, and we will send the certificate for that exact batch, including ' +
       'batches that have since sold out. Every vial carries the lot number its certificate is ' +
       'issued against, so you can check what is in your hand against the document. Certificates ' +
       'are issued by the independent laboratory that performed the analysis, not by us.',
};

const GLOW_PRODUCTS = [
  { name: 'BPC-157', tag: 'Tissue Research', cat: 'tissue', purity: '99.8%', badge:'Best Seller',
    sizes: [{ mg: '5mg', price: 59 }, { mg: '10mg', price: 99 }],
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
  { name: 'TB-500', tag: 'Tissue Research', cat: 'tissue', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 64 }, { mg: '10mg', price: 109 }],
    blurb: 'A synthetic fragment of thymosin beta-4, the actin-binding protein. Studied in vitro for cytoskeletal dynamics.',
    about: [
      'TB-500 is a synthetic peptide corresponding to the actin-binding region of thymosin beta-4, a regulatory protein present in most mammalian cells. It is that fragment, not the whole protein.',
      'Because the sequence carries the actin-binding motif, it is used as a tool for probing cytoskeletal behaviour rather than as a stand-in for the full protein.'
    ],
    research: [
      { t: 'Actin sequestration', d: 'Investigated for how it binds monomeric G-actin and shifts the balance between free monomer and polymerised filament.' },
      { t: 'Cell migration', d: 'Applied in motility assays where cytoskeletal turnover governs how quickly cells cross a gap.' },
      { t: 'Vascular models', d: 'Studied alongside endothelial cultures examining the formation of new vessel structures.' }
    ] },
  { name: 'Ipamorelin', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.9%', badge:'Popular',
    sizes: [{ mg: '5mg', price: 54 }, { mg: '10mg', price: 92 }],
    blurb: 'A selective pentapeptide growth hormone secretagogue. Studied for its binding behaviour at the ghrelin receptor.',
    about: [
      'Ipamorelin is a synthetic pentapeptide and a selective agonist at the growth hormone secretagogue receptor, GHS-R1a, the receptor the endogenous ligand ghrelin acts on.',
      'Its value in research is selectivity. In preclinical models it drives growth hormone release with comparatively little effect on ACTH, cortisol or prolactin, which makes it a cleaner probe of the pathway than earlier secretagogues.'
    ],
    research: [
      { t: 'Receptor selectivity', d: 'Used in binding and functional assays characterising activity at GHS-R1a against off-target endocrine receptors.' },
      { t: 'Pulsatile secretion', d: 'Studied in models examining how growth hormone is released in pulses rather than continuously.' },
      { t: 'Comparative pharmacology', d: 'Frequently run as the reference secretagogue when newer compounds are characterised.' }
    ] },
  { name: 'CJC-1295', tag: 'Growth Hormone Secretagogue', cat: 'growth', purity: '99.7%', badge:null,
    sizes: [{ mg: '5mg', price: 69 }, { mg: '10mg', price: 118 }],
    blurb: 'A synthetic analogue of growth hormone releasing hormone. Used in receptor binding and signalling studies.',
    about: [
      'CJC-1295 is a synthetic analogue of growth hormone releasing hormone, built on the first 29 amino acids of GHRH with substitutions that resist enzymatic breakdown.',
      'This is the form without drug affinity complex. It clears considerably faster than the DAC version, which matters when timing is part of the experimental design.'
    ],
    research: [
      { t: 'GHRH receptor binding', d: 'Used in receptor occupancy and activation assays at the pituitary GHRH receptor.' },
      { t: 'Pulse amplitude', d: 'Studied for how a GHRH analogue changes the size of a secretory pulse rather than its frequency.' },
      { t: 'Combination studies', d: 'Often paired with a secretagogue in preclinical work testing whether the two pathways are additive.' }
    ] },
  { name: 'Semaglutide', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.5%', badge:'Trending',
    sizes: [{ mg: '5mg', price: 89 }, { mg: '10mg', price: 152 }],
    blurb: 'A GLP-1 receptor agonist analogue. Supplied for laboratory investigation of incretin receptor signalling.',
    about: [
      'Semaglutide is a GLP-1 receptor agonist analogue. Two structural differences from native GLP-1 matter in the laboratory: an alpha-aminoisobutyric acid substitution at position 8 that resists DPP-4 cleavage, and a C18 fatty diacid chain at position 26 that promotes albumin binding.',
      'Those two modifications are why it behaves so differently from native GLP-1 across a time course, and usually why it is the chosen comparator.'
    ],
    research: [
      { t: 'Incretin receptor signalling', d: 'Used in cAMP accumulation and beta-arrestin recruitment assays at the GLP-1 receptor.' },
      { t: 'Albumin binding', d: 'Studied for how the fatty acid chain alters distribution and persistence in model systems.' },
      { t: 'Metabolic pathway research', d: 'Applied in islet and hepatocyte culture models examining downstream incretin signalling.' }
    ] },
  { name: 'GLP3-RT', tag: 'Metabolic Research', cat: 'metabolic', purity: '99.4%', badge:null,
    sizes: [{ mg: '10mg', price: 129 }, { mg: '20mg', price: 219 }],
    image: 'assets/products/glp3-rt-vial.webp',
    blurb: 'A dual GIP and GLP-1 receptor agonist peptide. Used in research examining co-agonist receptor pharmacology.',
    about: [
      'GLP3-RT is a dual receptor co-agonist peptide, active at both the GIP and the GLP-1 receptor from a single molecule.',
      'Single-molecule co-agonists are studied precisely because the two receptors can be engaged at different relative potencies, which is difficult to reproduce by simply combining two separate agonists.'
    ],
    research: [
      { t: 'Co-agonist pharmacology', d: 'Used to characterise relative potency at the GIP and GLP-1 receptors from one molecule.' },
      { t: 'Biased signalling', d: 'Studied for the balance between G-protein coupling and beta-arrestin recruitment at each receptor.' },
      { t: 'Receptor crosstalk', d: 'Applied in models examining how engaging both receptors at once differs from either alone.' }
    ] },
  { name: 'Selank', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.6%', badge:null,
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic heptapeptide based on the tetrapeptide tuftsin. Studied in preclinical models of neuropeptide regulation.',
    about: [
      'Selank is a synthetic heptapeptide: the endogenous tetrapeptide tuftsin extended with a Pro-Gly-Pro sequence that slows enzymatic degradation.',
      'That tail is the reason it is usable as a research tool at all, since unmodified tuftsin is cleared far too quickly to work with.'
    ],
    research: [
      { t: 'Neuropeptide regulation', d: 'Studied in preclinical models for interaction with endogenous regulatory peptide systems.' },
      { t: 'Monoamine and GABAergic systems', d: 'Examined in tissue models for effects on neurotransmitter turnover.' },
      { t: 'Expression studies', d: 'Used in work measuring changes in neurotrophic factor expression in brain tissue models.' }
    ] },
  { name: 'Semax', tag: 'Cognitive Research', cat: 'cognitive', purity: '99.7%', badge:'New',
    sizes: [{ mg: '5mg', price: 58 }, { mg: '10mg', price: 99 }],
    blurb: 'A synthetic peptide derived from the ACTH(4-10) fragment. Investigated in research on neurotrophic signalling.',
    about: [
      'Semax is a synthetic peptide derived from the ACTH(4-10) fragment, carrying the same Pro-Gly-Pro stabilising extension used in Selank. It has no corticotropic activity of its own.',
      'That separation is the point: it lets the fragment be studied without the hormonal activity of the full ACTH molecule.'
    ],
    research: [
      { t: 'Neurotrophic signalling', d: 'Investigated for changes in BDNF and its receptor TrkB in brain tissue models.' },
      { t: 'Melanocortin-independent activity', d: 'Studied for effects that do not depend on classical melanocortin receptor engagement.' },
      { t: 'Preclinical CNS models', d: 'Applied in laboratory research on neuronal survival and adaptation.' }
    ] },
  { name: 'GHK-Cu', tag: 'Tissue Research', cat: 'tissue', purity: '99.8%', badge:null,
    sizes: [{ mg: '50mg', price: 74 }, { mg: '100mg', price: 126 }],
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
];

// Everything outside the product page still asks for a single p.size / p.price.
// Derive them from the smallest size rather than repeating them in the literal,
// so the "from" price on a card can never drift from the picker on the page.
GLOW_PRODUCTS.forEach(p => {
  p.size = p.sizes[0].mg;
  p.price = p.sizes[0].price;
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
// made. Both claims are already made at length on process.html and about.html.
// The evidence panel states them in four words, and it states them from here,
// so the short form cannot quietly grow a third analysis the laboratory never
// ran or drop the regulatory hedge on the manufacturing claim. check-claims.js
// pins both long forms to the prose they summarise.
const ANALYSIS_SHORT = 'HPLC + mass spectrometry';
const ANALYSIS_LONG = 'HPLC for purity, mass spectrometry for identity';
const SOURCE_SHORT = 'U.S. manufacturing partner';
const SOURCE_LONG = 'Synthesis and fill at a U.S. partner facility operating to cGMP-aligned quality practices';

// ---------------------------------------------------------------------------
// The identity line: the sentence under the product name in the buy box.
//
// What is in the vial and what it is for, with no claim of any kind in it. It
// is derived rather than stored, so it cannot drift from the name, from the mg
// the customer has actually selected, or from the fill form, and so the
// research-use framing is restated on the one screen where someone is about to
// buy rather than only in the footer.
//
// Everything that describes what the compound *does* now lives entirely in
// `blurb` (the Product schema description) and in the accordions below the
// panel. This line is deliberately not the place for it.
//
// PLACEHOLDER: every compound in the catalog is supplied as lyophilized powder
// in a sealed vial, which is why the default answers all nine and writing it
// out nine times would be noise. Nothing here measures it: the supplier import
// confirms the fill form per product the same way it confirms purity, and a
// product that arrives in solution sets `form` and the line follows.
const DEFAULT_FORM = 'lyophilized';

function identityLine(p, size) {
  const mg = size && size.mg ? ` ${size.mg}` : '';
  return `${p.name}${mg} ${p.form || DEFAULT_FORM} peptide for in vitro research.`;
}

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
const FAQS = [
  {
    q: 'Are Glow Research peptides intended for human consumption?',
    a: 'No. All products sold by Glow Research are strictly for laboratory and in-vitro research use only. They are not drugs, supplements, foods, or cosmetics. They have not been evaluated or approved by the FDA for any use, and they are not intended to diagnose, treat, cure, or prevent any disease. They are not for human or animal use of any kind.',
  },
  {
    q: 'Why are Glow Research peptides priced the way they are?',
    a: 'Our pricing reflects what goes into every lot at the facilities behind it: US-based production held to cGMP-aligned quality practices, and independent third-party lab testing on every lot. Peptides priced well below market are almost always cutting one of those corners, and we would rather hold the standard than the lowest price.',
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
    // The cutoff is read, not typed. It is stated in four other places and
    // every one of them derives from CUTOFF_HOUR.
    q: 'How fast do orders ship?',
    a: `Orders placed before ${CUTOFF_LABEL_SHORT} are dispatched the same business day from our fulfilment partner\u2019s US-based, climate-controlled facility, with tracking provided within 24 hours.`,
  },
  {
    q: 'Do you ship internationally?',
    a: 'No. Orders are shipped within the United States only, to verified research institutions and qualified buyers.',
  },
];

// One renderer for the browser and the build, so the served markup and the
// behaviour attached to it can never describe different questions.
function faqHtml() {
  return FAQS.map(f => `
      <div class="faq-item">
        <button class="faq-q" type="button" aria-expanded="false">${escHtml(f.q)} <span class="icon" aria-hidden="true">+</span></button>
        <div class="faq-a"><p${f.id ? ` id="${f.id}"` : ''}>${escHtml(f.a)}</p></div>
      </div>`).join('');
}

function escHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The evidence panel, as data: the four steps of the chain of custody, in the
// order they happen. Each row is a label, the fact, and the sentence that makes
// the fact checkable.
//
// The note is not decoration. "Lot-matched batch documentation" is true of how
// the business runs and says nothing about whether this site will hand you the
// document, which is the question a buyer is actually asking. The note is where
// that gets answered, and it is the reason a row can state the operation
// plainly without the page overpromising. Drop the notes and every row becomes
// an adjective again.
//
// `key` identifies the one row that cannot be answered ahead of time: dispatch
// depends on the clock and on whether this size is sellable, so js/product.js
// rewrites it on load and every minute after.
function evidenceRows(p) {
  return [
    {
      key: 'source',
      label: 'Source',
      value: SOURCE_SHORT,
      note: SOURCE_LONG,
    },
    {
      // The value is the result, the note is how it was reached. Leading with
      // the method made this row a description of the process, identical on all
      // nine compounds; leading with the figure is what makes the heading above
      // ("this vial") true rather than nearly true. `purity` is still
      // placeholder data, flagged at the head of this file: it is derived here
      // rather than typed into the panel precisely so the import corrects it.
      key: 'verify',
      label: 'Verify',
      value: (p.purity && `${p.purity} purity`) || '—',
      note: `${ANALYSIS_SHORT}, by a third-party laboratory with no stake in the result`,
    },
    {
      key: 'document',
      label: 'Document',
      value: 'Lot-matched batch documentation',
      note: COA_COPY.panelNote,
      link: COA_COPY.panelLink,
    },
    {
      // The standing rule, which is true at any hour. It is what a crawler
      // reads and what shows before scripts run; the live answer replaces it.
      key: 'dispatch',
      label: 'Dispatch',
      value: `Same-business-day before ${CUTOFF_LABEL_SHORT}`,
      note: `FedEx ${TRANSIT_DAYS}-Day service, Monday to Friday`,
    },
  ];
}

// The documentation tab: the same record, longer, plus the fields that belong
// on a record rather than in a summary.
function docRows(p) {
  return [
    { label: 'Compound', value: p.name },
    { label: 'Stated purity', value: p.purity },
    { label: 'Analysis', value: ANALYSIS_LONG },
    { label: 'Certificate', value: COA_COPY.docLine },
    { label: 'Current lot', value: p.lot || '—' },
    { label: 'Lot analysed', value: (p.tested && analysedOn(p.tested)) || '—' },
    { label: 'Manufacturing', value: SOURCE_LONG },
    {
      label: 'Intended use',
      value: 'Laboratory and in-vitro research only. Not for human or animal consumption.',
    },
  ];
}

// The panel is drawn from the rows above as a plain string, with no DOM access,
// so js/product.js renders it at runtime and tools/build-products.js bakes the
// identical markup into each generated page. One template, so the served HTML
// and the hydrated HTML cannot disagree.
function evidenceHtml(p) {
  return evidenceRows(p).map(r => `
    <div class="gs-cell" data-row="${r.key}">
      <dt>${r.label}</dt>
      <dd>
        <span class="gs-value">${r.value}</span>
        <span class="gs-note">${r.note}</span>
      </dd>
    </div>`).join('');
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
const SITEWIDE_DISCOUNT = 0.10;

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
const PRODUCT_PAGES_LIVE = false;

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
    return `<img class="thumb-photo" src="${pageHref(p.image)}" alt="" loading="lazy" />`;
  }
  return '<span class="vial"></span>';
}

// One product card, as markup. Shared by renderProductGrid below and by
// tools/build-catalog.js, so what a crawler is served and what the browser
// draws are the same cards rather than two implementations that agree today.
function productCardHtml(p, i) {
  const href = productHref(p);
  const stocked = productInStock(p);
  return `
      <div class="product-card reveal" style="transition-delay:${(i % 3) * 60}ms">
        <a class="product-visual${p.image ? ' has-photo' : ''}" href="${href}">
          <span class="product-badge cat">${p.cat}</span>
          ${!stocked
            ? '<span class="product-badge status is-out">Out of stock</span>'
            : p.badge ? `<span class="product-badge status">${p.badge}</span>` : ''}
          ${p.image
            ? `<img class="product-photo" src="${pageHref(p.image)}" alt="${p.name} vial" loading="lazy" />`
            : '<div class="vial"></div>'}
        </a>
        <div class="product-footer">
          <h3><a href="${href}">${p.name}</a></h3>
          <span class="card-divider" aria-hidden="true"></span>
          <span class="price">
            ${onSaleNow() ? `<s class="price-was">${fmtPrice(p.price)}</s>` : ''}
            ${fmtPrice(salePrice(p.price))} <span>/ vial</span>
          </span>
          <button class="add-btn" ${stocked
            ? `aria-label="Add ${p.name} to research order">Add to Cart`
            : `disabled aria-label="${p.name} is out of stock">Out of Stock`}</button>
        </div>
      </div>`;
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
function renderProductGrid(gridEl, filter, opts) {
  opts = opts || {};
  gridEl.innerHTML = '';
  let list = filter === 'all' ? GLOW_PRODUCTS : GLOW_PRODUCTS.filter(p => p.cat === filter);
  if (opts.exclude) list = list.filter(p => p.name !== opts.exclude);
  // slice() first: a stable sort over a copy, so the curated order survives
  // both here and for every other caller.
  if (opts.prefer) {
    list = list.slice().sort((a, b) =>
      (b.cat === opts.prefer ? 1 : 0) - (a.cat === opts.prefer ? 1 : 0));
  }

  // a category with nothing in it used to render a silently blank grid
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'product-grid-empty';
    empty.textContent = 'No compounds in this category yet.';
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

    // the whole card opens the product page; the button is the one exception,
    // and it opens the quick-add sheet instead — the size/quantity picker,
    // so the cart is only ever touched from in there
    const addBtn = card.querySelector('.add-btn');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openQuickAdd) window.openQuickAdd(p);
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
    sizeInStock,
    productInStock,
    avgPurity,
    BATCHES_TESTED,
    CUTOFF_HOUR,
    CUTOFF_LABEL,
    CUTOFF_LABEL_SHORT,
    TRANSIT_DAYS,
    ANALYSIS_SHORT,
    ANALYSIS_LONG,
    SOURCE_SHORT,
    SOURCE_LONG,
    identityLine,
    DEFAULT_FORM,
    FAQS,
    faqHtml,
    productCardHtml,
    productHref,
    evidenceRows,
    evidenceHtml,
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
  };
}
