#!/usr/bin/env node
// ===================== Glow Research — page metadata build =====================
//
//   node tools/build-meta.js
//
// Writes every copy of each page's title and description from the one entry in
// tools/page-meta.js:
//
//   <title>                        title
//   <meta name="description">      desc
//   og:title / twitter:title       name
//   og:description / twitter:desc  desc
//   og:url                         the canonical URL
//   JSON-LD name / description     name, desc  (WebPage-family blocks only)
//
// Four to six copies of two strings per page, written once. They had already
// drifted before this existed: five pages carried structured data describing
// them differently from their own meta tags.
//
// What it deliberately does not touch:
//   - JSON-LD blocks carrying an id="" attribute. Those belong to a generator
//     (faq-jsonld, catalog-jsonld) which writes them from its own data, and
//     build-catalog.js reads this same file for its description, so there is
//     still one source.
//   - Organization and WebSite on the homepage. They describe the company, not
//     the page, and their description is a different sentence on purpose.
//   - peptides/<slug>/ pages. build-products.js derives their metadata from the
//     catalog, which is the same principle applied to data that already exists.
//
// Pages with no entry are skipped, not failed: noindex pages have no share card
// to keep honest.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://glowresearch.shop';
const { PAGE_META } = require(path.join(__dirname, 'page-meta.js'));
const { META_DOMAIN_VERIFICATION } = require(path.join(ROOT, 'js/products-data.js'));

// The pages carrying Meta's domain-verification tag. Not PAGE_META's list:
// welcome.html is noindex so it has no share card to keep honest and no entry
// there, but it is the page paid traffic actually lands on, which makes it the
// one page that most needs the domain verified.
const VERIFY_PAGES = ['index.html', 'welcome.html'];

// Attribute values are written into "..." so a stray quote would break the tag.
// The strings in page-meta.js already carry HTML entities where they need them
// (&amp;), so this escapes the quote only.
const attr = s => String(s).replace(/"/g, '&quot;');

// Set a <meta> whose identifying attribute already exists, or report it missing
// so a page that never had the tag is added deliberately rather than silently.
function setMeta(html, sel, value, added) {
  const re = new RegExp(`(<meta ${sel}\\s+content=")[^"]*(")`);
  if (re.test(html)) return html.replace(re, (m, open, close) => open + attr(value) + close);
  // Reversed attribute order, which some of the hand-written pages use.
  const re2 = new RegExp(`(<meta content=")[^"]*("\\s+${sel})`);
  if (re2.test(html)) return html.replace(re2, (m, open, close) => open + attr(value) + close);
  added.push(sel);
  return html.replace('</head>', `<meta ${sel} content="${attr(value)}" />\n</head>`);
}

function buildPage(file) {
  const meta = PAGE_META[file];
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  const added = [];

  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${meta.title}</title>`);

  html = setMeta(html, 'name="description"', meta.desc, added);
  html = setMeta(html, 'property="og:title"', meta.name, added);
  html = setMeta(html, 'property="og:description"', meta.desc, added);
  html = setMeta(html, 'name="twitter:title"', meta.name, added);
  html = setMeta(html, 'name="twitter:description"', meta.desc, added);

  // og:url follows the canonical rather than being typed again.
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canon) html = setMeta(html, 'property="og:url"', canon, added);

  // Structured data the page owns: everything except generator-tagged blocks.
  html = html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (whole, body) => {
      let data;
      try { data = JSON.parse(body); } catch (e) { return whole; }
      if (!/^(WebPage|CollectionPage|ContactPage|AboutPage)$/.test(data['@type'])) return whole;
      // Entities belong in HTML text, not in a JSON string.
      data.name = meta.name.replace(/&amp;/g, '&');
      data.description = meta.desc.replace(/&amp;/g, '&');
      return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
    }
  );

  if (html !== before) fs.writeFileSync(full, html);
  return { changed: html !== before, added };
}

// Meta reads this tag off the served HTML to confirm the domain is ours. The
// token belongs to the business portfolio, so every page that carries it must
// carry the same one: two pages disagreeing means one of them verifies and the
// other silently does not.
function buildDomainVerification() {
  let changed = 0;
  for (const file of VERIFY_PAGES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      throw new Error(`tools/build-meta.js expects ${file}, which does not exist.`);
    }
    const before = fs.readFileSync(full, 'utf8');
    const html = setMeta(before, 'name="facebook-domain-verification"',
      META_DOMAIN_VERIFICATION, []);
    if (html !== before) { fs.writeFileSync(full, html); changed++; }
  }
  return changed;
}

function build() {
  let changed = 0;
  const notes = [];
  for (const file of Object.keys(PAGE_META)) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      throw new Error(`tools/page-meta.js lists ${file}, which does not exist.`);
    }
    const r = buildPage(file);
    if (r.changed) changed++;
    if (r.added.length) notes.push(`${file}: added ${r.added.join(', ')}`);
  }
  const verified = buildDomainVerification();
  console.log(`  ${Object.keys(PAGE_META).length} pages checked, ${changed} rewritten`);
  console.log(`  ${VERIFY_PAGES.length} domain-verification tags checked, ${verified} rewritten`);
  notes.forEach(n => console.log(`    ${n}`));
}

if (require.main === module) build();
module.exports = { build };
