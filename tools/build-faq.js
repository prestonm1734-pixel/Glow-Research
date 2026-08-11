#!/usr/bin/env node
// ===================== Glow Research — homepage FAQ build =====================
//
//   node tools/build-faq.js
//
// Bakes the FAQ into index.html: the markup inside <div id="faqList">, and a
// FAQPage block of structured data beside it.
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
//
// js/script.js no longer builds the list. It binds the accordion to whatever
// is already in the DOM, so the copy is in the markup and the behaviour is
// added on top rather than the copy arriving with it.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'index.html';
const MARK = 'faq-jsonld';   // id on the script tag, so it can be found and replaced

const { FAQS, faqHtml } = require(path.join(ROOT, 'js/products-data.js'));

function required(html, re, label) {
  if (!re.test(html)) {
    throw new Error(
      `Could not find ${label} in ${PAGE}. ` +
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

function build() {
  let html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');

  const listRe = /(<div class="faq-list" id="faqList">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/;
  required(html, listRe, '#faqList');
  html = html.replace(listRe, `$1${faqHtml()}\n    $2`);

  const block =
    `<script type="application/ld+json" id="${MARK}">\n` +
    JSON.stringify(faqJsonLd(), null, 2) +
    `\n</script>`;

  const existing = new RegExp(`<script type="application/ld\\+json" id="${MARK}">[\\s\\S]*?</script>`);
  if (existing.test(html)) {
    html = html.replace(existing, block);
  } else {
    // First run: sit it just before </head>, beside the Organization graph.
    required(html, /<\/head>/, '</head>');
    html = html.replace('</head>', `${block}\n</head>`);
  }

  fs.writeFileSync(path.join(ROOT, PAGE), html);
  console.log(`  ${PAGE}: ${FAQS.length} questions baked into #faqList and FAQPage schema`);
}

if (require.main === module) build();
module.exports = { build, faqJsonLd };
