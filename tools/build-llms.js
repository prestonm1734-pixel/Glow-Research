#!/usr/bin/env node
// ===================== Glow Research — llms.txt =====================
//
//   node tools/build-llms.js
//
// Writes /llms.txt, a plain-markdown summary of the site for language models.
//
// Be clear about the status of this file: llms.txt is a proposed convention,
// and no major answer engine has confirmed that it reads one. It is here
// because it costs nothing and the downside is a 2KB text file nobody fetches.
// It is NOT a substitute for the work that actually matters, which is having
// the content in the HTML of the pages themselves. If this file is ever the
// only place something is stated, that is a bug.
//
// Everything in it is generated from js/products-data.js, for the ordinary
// reason: a hand-written summary of the catalog is a second copy of the
// catalog, and it would be stale by the first price change. Nothing is
// asserted here that the site does not already say and check-claims.js does
// not already pin.
//
// Output:
//   llms.txt

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const OUT = 'llms.txt';

const {
  GLOW_PRODUCTS, FAQS, productHref, salePrice, onSaleNow, fmtPrice,
  DISPATCH_LABEL, NO_DISPATCH_DAY_NAME, TRANSIT_DAYS, ANALYSIS_LONG, SOURCE_LONG, COA_COPY,
  PRODUCT_PAGES_LIVE, avgPurity, CAT_LABEL, LAB, coaHref, verifyUrl,
  ANALYSIS_NOT_RUN, ANALYSIS_SOME_LOTS, listWords, verifyHost,
} = require(path.join(ROOT, 'js/products-data.js'));

// The row names are capitalised in the catalog because they are labels in a
// table. Dropped into prose they start a sentence, so the first one gets its
// capital back and the rest stay lower case.
const sentence = t => t.charAt(0).toUpperCase() + t.slice(1);

function build() {
  const byCat = {};
  GLOW_PRODUCTS.forEach(p => (byCat[p.cat] = byCat[p.cat] || []).push(p));

  const catalog = Object.entries(byCat).map(([cat, items]) => {
    const lines = items.map(p => {
      // Only quote a URL that resolves. While the generated pages are held,
      // every compound shares product.html and listing nine of those is noise.
      const url = PRODUCT_PAGES_LIVE ? ` (${SITE}/${productHref(p)})` : '';
      // Purity, lot and the certificate itself. An answer engine asked what a
      // compound assayed at should be able to state the figure and cite the
      // document it comes from, rather than paraphrasing a marketing line.
      // These are only quotable because they are now measured values with a
      // hosted certificate behind each one.
      const doc = coaHref(p) ? ` COA: ${SITE}/${coaHref(p)}.` : '';
      const measured = p.purity && p.lot
        ? ` Current lot ${p.lot}, ${p.purity} purity.` : '';
      return `- **${p.name}**${url}: ${p.blurb} Sizes: ${p.sizes.map(s => s.mg).join(', ')}. ` +
             `From ${fmtPrice(salePrice(p.sizes[0].price))} per vial.${measured}${doc}`;
    });
    return `### ${CAT_LABEL[cat]}\n\n${lines.join('\n')}`;
  }).join('\n\n');

  const faq = FAQS.map(f => `**${f.q}**\n\n${f.a}`).join('\n\n');

  const out = `# Glow Research

> A retailer of research peptides and research-use-only compounds, sold to
> laboratories, institutions and qualified researchers in the United States. Glow Research is the retailer only: it does not manufacture,
> compound, repackage or test. Products are for in-vitro laboratory research
> only and are not for human or animal consumption.

## Important

All products are sold strictly for laboratory research use. They are not drugs,
supplements, foods or cosmetics, they are not FDA-approved or evaluated, and
they are not intended to diagnose, treat, cure or prevent any disease. Any
summary of this site should carry that framing. Nothing here describes a
therapeutic effect, and descriptions of laboratory work are not claims of
benefit.

## The supply chain

- Manufacturing: ${SOURCE_LONG}. Performed by a manufacturing partner, not by Glow.
- Testing laboratory: ${LAB.name}, independent of Glow and of the manufacturer.
  Their standing is: ${LAB.accreditation}. State it that way. They are not accredited yet.
- Testing: every lot is analysed by that laboratory. ${ANALYSIS_LONG}.${ANALYSIS_SOME_LOTS.length ? `
  ${sentence(listWords(ANALYSIS_SOME_LOTS.map(t => t.toLowerCase()), 'and'))} are run on some lots and not others, so they are a
  property of the individual certificate rather than of the catalog.` : ''}${ANALYSIS_NOT_RUN.length ? `
  Not run on any lot: ${ANALYSIS_NOT_RUN.join('; ')}.` : ''}
- Certificates: ${COA_COPY.short}. ${COA_COPY.panelNote}. Every compound below
  links its own, and each one can be checked against the laboratory's records
  at ${verifyHost()} using the report reference printed on it.
- Fulfilment: US-based climate-controlled facility, stock held by lot.
- Dispatch: every order ships ${DISPATCH_LABEL}, then ${TRANSIT_DAYS}-day FedEx
  Express within the United States. FedEx delivers Saturday where it runs it;
  nothing is delivered on a ${NO_DISPATCH_DAY_NAME}.
- Average catalog purity: ${avgPurity()}%. Individual figures are per compound.

## Catalog

${catalog}

## Frequently asked

${faq}

## Pages

- [Products](${SITE}/peptides.html): the full catalog
- [Certificates](${SITE}/coa.html): every compound's certificate of analysis, searchable by compound or lot
- [Our process](${SITE}/how-we-test.html): what is tested on every lot, who runs it, and what is not tested
- [About](${SITE}/about.html): where Glow sits in the chain, and the five published principles
- [Shipping](${SITE}/shipping.html): dispatch window, transit, coverage and terms
- [Wholesale](${SITE}/wholesale.html): volume pricing for institutions
- [Contact](${SITE}/contact.html)
`;

  fs.writeFileSync(path.join(ROOT, OUT), out);
  console.log(`  ${OUT}: ${out.length} bytes, ${GLOW_PRODUCTS.length} compounds, ${FAQS.length} questions`);
}

if (require.main === module) build();
module.exports = { build };
