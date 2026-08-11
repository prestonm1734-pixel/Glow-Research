#!/usr/bin/env node
// ===================== Glow Research — full site build =====================
//
//   node tools/build.js
//
// Runs the generators that are safe to run unattended, then refreshes the
// sitemap. Reach for this after changing the catalog or a static page.
//
// build-blog.js is deliberately NOT run from here. The committed blog pages
// have been hand-edited since they were generated — each carries its own drawn
// cover illustration, the nav labels differ, and the contents rail was taken
// out — so regenerating them silently replaces that work with the generator's
// procedural output. Run it on its own, and only when you mean to:
//
//   node tools/build-blog.js && git diff blog/
//
// and read the diff before committing. Reconciling the generator with the
// committed pages is a separate job; see the note at the top of that file.

const { execFileSync } = require('node:child_process');
const path = require('path');

for (const script of ['build-faq.js', 'build-products.js']) {
  console.log(`\n${script}`);
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
}

// Last, and it exits non-zero: a build that leaves the site claiming something
// the code does not enforce has not succeeded. See PRINCIPLES.md.
console.log('\ncheck-claims.js');
execFileSync(process.execPath, [path.join(__dirname, 'check-claims.js')], { stdio: 'inherit' });
