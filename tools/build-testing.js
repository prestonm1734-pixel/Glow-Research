#!/usr/bin/env node
// ===================== Glow Research — homepage testing diagram =====================
//
//   node tools/build-testing.js
//
// Bakes the seven analyses into the markup inside <ul id="tdNodes"> on
// index.html, and the count into the <h2 id="tvHeading"> heading.
//
// Why this exists. The section it replaced was two invented "medical
// advisors", and the thing that made them indefensible was that nothing in
// the system produced them: they were typed into the page and nothing could
// ever contradict them. The replacement had to be the opposite. Every line in
// #tdNodes is a row of ANALYSIS_TESTS in js/products-data.js, the same array
// how-we-test.html lists, the certificate panel summarises and
// check-claims.js counts. Drop a test from the certificate and it leaves the
// homepage in the same edit, or the build fails.
//
// The vial itself is a video with the seven callouts baked into its own
// footage now, not a five-layer PNG stack with these as live HTML wires and
// dots. #tdNodes is what is left for the audiences that video cannot reach:
// a screen reader, or a crawler that never runs JavaScript. It renders
// visually hidden (`.sr-only`), not gone.
//
// Inputs:
//   js/products-data.js   ANALYSIS_TESTS, via analysisListHtml()
//
// Output (rewritten in place):
//   index.html            #tdNodes contents, #tvHeading text
//
// js/script.js does not touch this markup at all; it only plays the video.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'index.html';

const {
  analysisListHtml, testingHeading, TESTS_PER_BATCH,
} = require(path.join(ROOT, 'js/products-data.js'));

function build() {
  const file = path.join(ROOT, PAGE);
  let html = fs.readFileSync(file, 'utf8');

  // Anchored on an explicit end marker, not on a run of closing tags, so a
  // change to the list-item markup can never leave a lazy match short.
  const re = /(<ul class="sr-only" id="tdNodes">)[\s\S]*?(<!-- \/tdNodes -->)/;
  if (!re.test(html)) {
    throw new Error(
      `Could not find #tdNodes and its <!-- /tdNodes --> marker in ${PAGE}. ` +
      `If the markup changed, update the pattern in tools/build-testing.js.`
    );
  }

  // Replacer function, not a replacement string: a "$1" anywhere in the test
  // copy would otherwise be read as a backreference. See tools/build-faq.js.
  html = html.replace(re, (m, open, close) => `${open}${analysisListHtml()}\n        ${close}`);

  // The heading counts the panel as a numeral, which the word-form scan in
  // check-claims.js cannot see. Written from the array like everything else.
  const headRe = /(<h2 id="tvHeading">)[\s\S]*?(<\/h2>)/;
  if (!headRe.test(html)) {
    throw new Error(`Could not find #tvHeading in ${PAGE}.`);
  }
  html = html.replace(headRe, (m, open, close) => `${open}${testingHeading()}${close}`);

  fs.writeFileSync(file, html);
  console.log(`  ${PAGE}: "${testingHeading()}", ${TESTS_PER_BATCH} tests listed`);
}

if (require.main === module) build();
module.exports = { build };
