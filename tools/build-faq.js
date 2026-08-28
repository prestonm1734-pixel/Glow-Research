#!/usr/bin/env node
// ===================== Glow Research — FAQ build =====================
//
//   node tools/build-faq.js
//
// Bakes the FAQ into every page that carries one: the markup inside
// <div id="faqList">, and on index.html a FAQPage block of structured data
// beside it.
//
// Why this exists. The FAQ was an array in js/script.js injected into an empty
// <div> on load, so the served HTML carried none of it. Google renders
// JavaScript and would eventually see it; the crawlers behind AI answer
// engines largely do not, and a FAQ is the most quotable shape of content
// there is — a question, then a direct answer. Five answers about human
// consumption, pricing, certificates and shipping were reaching nobody who
// asked an assistant any of those questions.
//
// Inputs:
//   js/products-data.js   FAQS and faqHtml(), the same pair the browser uses
//
// Output (rewritten in place):
//   index.html            #faqList contents, and the FAQPage <script>
//   welcome.html          #faqList contents
//
// Two pages, one list. welcome.html is the unlisted ad landing page and it
// answers the same four questions; generating both from FAQS is what stops the
// landing page and the homepage giving a visitor different answers after
// someone edits one of them.
//
// welcome.html gets no FAQPage block: it is noindex, so structured data there
// is markup with no reader. That is the only difference between the two, and
// it is why `schema` is a per-page flag rather than something both get.
//
// Neither page's script builds the list. Both bind an accordion to whatever is
// already in the DOM, so the copy is in the markup and the behaviour is added
// on top rather than the copy arriving with it.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARK = 'faq-jsonld';   // id on the script tag, so it can be found and replaced

// [file, whether it also carries the FAQPage structured data]
const PAGES = [
  ['index.html', true],
  ['welcome.html', false],
];

const { FAQS, faqHtml } = require(path.join(ROOT, 'js/products-data.js'));

function required(html, re, label, page) {
  if (!re.test(html)) {
    throw new Error(
      `Could not find ${label} in ${page}. ` +
      `If the markup changed, update the pattern in tools/build-faq.js.`
    );
  }
  return html;
}

// Answers are plain text in the catalog and go into JSON, so the only escaping
// needed is what JSON.stringify already does. The HTML answer text is escaped
// by faqHtml() on the markup side.
function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': 'https://glowresearch.shop/#faq',
    mainEntity: FAQS.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function buildPage(page, schema) {
  let html = fs.readFileSync(path.join(ROOT, page), 'utf8');

  const listRe = /(<div class="faq-list" id="faqList">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/;
  required(html, listRe, '#faqList', page);
  // Replacer function, not a replacement string: "$1" in an answer would
  // otherwise be read as a backreference. See tools/build-products.js.
  html = html.replace(listRe, (m, open, close) => `${open}${faqHtml()}\n    ${close}`);

  if (schema) {
    const block =
      `<script type="application/ld+json" id="${MARK}">\n` +
      JSON.stringify(faqJsonLd(), null, 2) +
      `\n</script>`;

    const existing = new RegExp(`<script type="application/ld\\+json" id="${MARK}">[\\s\\S]*?</script>`);
    if (existing.test(html)) {
      html = html.replace(existing, block);
    } else {
      // First run: sit it just before </head>, beside the Organization graph.
      required(html, /<\/head>/, '</head>', page);
      html = html.replace('</head>', `${block}\n</head>`);
    }
  }

  fs.writeFileSync(path.join(ROOT, page), html);
  console.log(`  ${page}: ${FAQS.length} questions baked into #faqList` +
    (schema ? ' and FAQPage schema' : ''));
}

function build() {
  PAGES.forEach(([page, schema]) => buildPage(page, schema));
}

if (require.main === module) build();
module.exports = { build, faqJsonLd };
