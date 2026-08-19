#!/usr/bin/env node
// ===================== Glow Research — homepage testing diagram =====================
//
//   node tools/build-testing.js
//
// Bakes the seven analyses into the markup inside <div id="tdNodes"> on
// index.html: one ruled row each, beside a drawn cloud of the powder.
//
// Why this exists. The section it replaced was two invented "medical
// advisors", and the thing that made them indefensible was that nothing in
// the system produced them: they were typed into the page and nothing could
// ever contradict them. The replacement had to be the opposite. Every node in
// the diagram is a row of ANALYSIS_TESTS in js/products-data.js, the same
// array how-we-test.html lists, the certificate panel summarises and
// check-claims.js counts. Drop a test from the certificate and it leaves the
// homepage in the same edit, or the build fails.
//
// Baked rather than rendered on load, for the reason build-faq.js is: the
// crawlers behind AI answer engines largely do not run JavaScript, and "what
// does this seller test for" is exactly the question they get asked. An empty
// <div> was the old answer.
//
// Inputs:
//   js/products-data.js   ANALYSIS_TESTS, via analysisDiagramHtml()
//
// Output (rewritten in place):
//   index.html            #tdNodes contents
//
// js/script.js binds the highlighting to whatever is already in the DOM. It
// never builds a node, so the copy is in the markup and the behaviour is
// added on top rather than arriving with it.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'index.html';

const {
  analysisDiagramHtml, analysisSideSplit, testingHeading, TESTS_PER_BATCH,
} = require(path.join(ROOT, 'js/products-data.js'));

function build() {
  const file = path.join(ROOT, PAGE);
  let html = fs.readFileSync(file, 'utf8');

  // Anchored on an explicit end marker, not on a run of closing tags. The
  // callouts nest two levels deep, so a lazy match up to "</div></div>" found
  // the end of the first callout instead of the end of the block and pushed a
  // spare </div> into the page on every rebuild. The sentinel cannot drift.
  const re = /(<div class="tv-callouts" id="tdNodes">)[\s\S]*?(<!-- \/tdNodes -->)/;
  if (!re.test(html)) {
    throw new Error(
      `Could not find #tdNodes and its <!-- /tdNodes --> marker in ${PAGE}. ` +
      `If the markup changed, update the pattern in tools/build-testing.js.`
    );
  }

  // Replacer function, not a replacement string: a "$1" anywhere in the test
  // copy would otherwise be read as a backreference. See tools/build-faq.js.
  html = html.replace(re, (m, open, close) => `${open}${analysisDiagramHtml()}\n          ${close}`);

  // The heading counts the panel as a numeral, which the word-form scan in
  // check-claims.js cannot see. Written from the array like everything else.
  const headRe = /(<h2 id="tvHeading">)[\s\S]*?(<\/h2>)/;
  if (!headRe.test(html)) {
    throw new Error(`Could not find #tvHeading in ${PAGE}.`);
  }
  html = html.replace(headRe, (m, open, close) => `${open}${testingHeading()}${close}`);

  fs.writeFileSync(file, html);
  const split = analysisSideSplit();
  console.log(`  ${PAGE}: "${testingHeading()}", ${TESTS_PER_BATCH} callouts ` +
    `(${split.left} left, ${split.right} right)`);
}

if (require.main === module) build();
module.exports = { build };
