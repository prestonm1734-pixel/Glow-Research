#!/usr/bin/env node
// ===================== Glow Research — full site build =====================
//
//   node tools/build.js
//
// Runs the generators that are safe to run unattended, then refreshes the
// sitemap. Reach for this after changing the catalog or a static page.
//
// This used to carry a warning that build-blog.js was deliberately excluded,
// because the committed blog pages had been hand-edited past what the
// generator emitted. The blog, its source and that generator are all gone, so
// everything this script runs is now safe to run unattended.

const { execFileSync } = require('node:child_process');
const path = require('path');

for (const script of ['build-meta.js', 'build-faq.js', 'build-testing.js', 'build-catalog.js', 'build-llms.js', 'build-products.js']) {
  console.log(`\n${script}`);
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
}

// Last, and it exits non-zero: a build that leaves the site claiming something
// the code does not enforce has not succeeded. See PRINCIPLES.md.
console.log('\ncheck-claims.js');
execFileSync(process.execPath, [path.join(__dirname, 'check-claims.js')], { stdio: 'inherit' });
