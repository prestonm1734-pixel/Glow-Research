# Build scripts

The site is static HTML served straight from the repo, so **generated files are
committed**. Nothing builds on deploy. If you don't run the build and commit
the output, the change doesn't ship.

No dependencies to install. Everything here is plain Node.

```bash
node tools/build.js          # the usual one: FAQ + products (when live) + sitemap + audit
node tools/build-meta.js     # every copy of each page's title + description
node tools/build-faq.js      # homepage FAQ markup + FAQPage schema
node tools/build-testing.js  # homepage vial diagram callouts, from ANALYSIS_TESTS
node tools/build-catalog.js  # peptides.html grid + CollectionPage schema
node tools/build-llms.js     # llms.txt
node tools/build-products.js # one page per compound
node tools/build-sitemap.js  # sitemap.xml on its own
node tools/check-claims.js   # promise audit, run before every commit
```

## `build.js`

The everyday entry point. Runs `build-meta.js`, `build-faq.js`, `build-testing.js`,
`build-catalog.js`, `build-llms.js`, then `build-products.js` (which refreshes `sitemap.xml` on its
way through), then `check-claims.js`.

### One rule for all of them

**Insert generated copy with a replacer function, never a replacement string.**
`"$1"` in a replacement string is a backreference, and every price the site
prints starts with a dollar sign. `fmtPrice()` emits `$116.10`, whose `$1` was
being substituted with capture group 1. That shipped a catalog card reading
`<div class="product-grid" id="productGrid">29` and would have shipped a
GLP3-RT page reading `id="pdPrice">16.10`. `check-claims.js` now fails on the
pattern anywhere in `tools/`.

## `check-claims.js`

The guard. Cross-checks what the site *says* against what the code *enforces*,
and exits non-zero when they disagree, so a broken promise fails the build
instead of reaching a customer. See [PRINCIPLES.md](../PRINCIPLES.md).

It currently checks that:

- the free-shipping threshold in the marquee equals `FREE_SHIPPING_AT` in
  `cart.js` **and** `freeOver` in `checkout.js`. Three places, one number
- every stated dispatch cutoff equals `CUTOFF_HOUR`, and the estimate is
  computed in Pacific time, which is what the copy claims. The scripts are
  scanned as well as the pages: the product page states the cutoff in a string
  it renders at runtime, and a claim is a claim whichever file it was typed into
- every stated FedEx service equals `TRANSIT_DAYS`, in both word orders the copy
  uses ("FedEx 2-Day", "2-day FedEx Express") and as the counted figure on the
  shipping page and in the homepage hero
- availability is derived from the catalog everywhere it is asserted, and
  nothing hardcodes `InStock`
- the homepage hero's "99.7% avg. purity" equals `avgPurity()` over the
  catalog, and its "150+" equals `BATCHES_TESTED`. Both figures live in the
  served markup so a crawler sees them, which is exactly why they need pinning
- the product page's evidence panel is rendered from `evidenceHtml()` by both
  the browser and the build, its served markup still matches what that function
  produces, its Verify row states the catalog's purity for that compound, it
  names no analysis `how-we-test.html` does not describe, it keeps the
  "cGMP-aligned" hedge on the manufacturing claim, every row still carries the
  note that qualifies it, and no page anywhere prints a lot number the catalog
  does not hold
- no listing copy names an outcome where it should name a mechanism. Pathways,
  receptors, binding behaviour and assays are things a laboratory measures;
  healing, recovery, improvement, treatment and dosing are things a product is
  being sold to deliver, and every one of these sentences sits beside an Add to
  cart button. Covers `blurb`, `about[]` and `research[]`, the category keys and
  the tags, and caps the blurb at the two lines the buy box has room for
- the two copies of `CAT_LABEL` agree, every category in the catalog has a label
  and a filter chip, so a new category cannot ship unbrowsable or with a
  breadcrumb that changes wording between the served page and the hydrated one
- every "read details" disclosure ships its copy inside the served markup. The
  process, About, Shipping and Wholesale pages collapse their long copy behind
  native `<details>`, and the whole compliance and SEO case for doing it that
  way is that the text is still *there*: the moment someone fetches panel
  content on click instead, the RUO disclaimer, the final-sale term and the
  testing description stop being on the page at all
- the process chain still has six steps, each with one scannable sentence, a
  disclosure, and the "performed by" label naming who does it. Four of the six
  are not Glow, and saying so is the point of the page
- no page, browser script or serverless handler names the registered entity,
  the street address, the town or the state, and the `Organization` block on
  the homepage carries no `legalName` and no `streetAddress`. The state picker
  in `js/checkout.js` and the governing-law clause in `terms.html` are exempt
  by name: both need the word California for a reason that is not "this is
  where we are"
- the homepage FAQ is in the served markup rather than injected on load, the
  markup matches `faqHtml()`, the `FAQPage` schema matches `FAQS` question for
  question, the answers stay readable with JavaScript off, and the certificate
  answer is the current `COA_COPY` state
- the catalog page names every compound in its served HTML and the grid matches
  `productCardHtml()`; every indexable page carries structured data; every
  JSON-LD block parses; the process page's `ItemList` describes the six steps
  actually on the page; and `llms.txt` covers the whole catalog with the
  research-use framing and the enforced cutoff
- every copy of every page title and description matches `tools/page-meta.js`,
  `og:url` equals the canonical, no description runs past what a search result
  shows, and every indexable page has an entry
- the About page's facts table agrees with the catalog: the Testing row states
  the current `COA_COPY.short`, the Manufacturing row keeps the hedge
  `SOURCE_LONG` carries, and the Dispatch row quotes `CUTOFF_LABEL` and
  `TRANSIT_DAYS`
- no build script inserts copy with a `$1` replacement string, and a price
  beginning `$1` is run through the card renderer to prove it survives
- checkout cannot create an order or send a "payment received" email while
  `PAYMENTS_LIVE` is false: `api/create-order.js` refuses before touching
  WooCommerce, and the refusal runs before any WooCommerce call or email in the
  file. `js/checkout.js` shows an honest state instead of the form for the same
  reason, but that is a courtesy, not the gate
- no page promises a certificate while `COAS_PUBLISHED` is false
- no fabricated ratings or reviews appear in structured data
- every product carries every field the site reads, so a lossy supplier import
  fails here rather than rendering an empty tab
- every sitemap URL exists on disk, and held product URLs are not listed

**Adding a claim to the site? Add its check here in the same commit.** That is
the whole point: the list grows as the promises do.

## `build-faq.js`

Bakes the homepage FAQ into `index.html`: the markup inside `<div id="faqList">`
and a `FAQPage` block of structured data.

The questions live in `FAQS` in `js/products-data.js`. Edit the array, run the
build. `js/script.js` no longer creates the list, it binds the accordion to
markup that is already there.

It exists because the FAQ used to be an array in `js/script.js` injected into an
empty `<div>` on load, so **none of it was in the served HTML**. Google renders
JavaScript and would have got there eventually; the crawlers behind AI answer
engines largely do not, and a question followed by a direct answer is the most
quotable shape of content on a site. Five answers about human consumption,
pricing, certificates and shipping were reaching nobody who asked an assistant
any of those questions. The homepage went from 1,524 to 3,132 characters of
crawlable text.

The COA answer reads from `COA_COPY`, so it flips with `COAS_PUBLISHED` like
every other certificate surface. Rebuild after flipping the flag; the audit
fails if you forget.

## `build-testing.js`

Bakes the homepage testing diagram: the callouts inside `<div id="tdNodes">`,
one per analysis on a wire ending in a dot, and the numeral in the
`#tvHeading` heading.

The rows live in `ANALYSIS_TESTS` in `js/products-data.js`, the same array
`how-we-test.html` lists and the certificate panel summarises. Edit the array,
run the build. Which side a callout lands on is derived, not typed: the left
column takes `floor(n/2)` and the right takes the rest, so an eighth analysis
rebalances the diagram rather than leaving one side hanging.

`js/script.js` never writes a callout. It plays the vial clip once, the
moment the section scrolls into view — a cropped, muted recording of a real
vial (this used to be five transparent PNG layers stacked and pulled apart
with CSS; the burst is now baked into the footage itself, so there is no
layer alignment left to check). It ships as two files, `glow-vial-reveal.webm`
(VP9, what most browsers get) and `glow-vial-reveal.mp4` (H.264, Safari's
fallback) via `<source>` — a sandboxed or de-Googled Chromium build without
licensed H.264 support is exactly the case that surfaced the need for the
second file. `check-claims.js` confirms both, plus the poster frame
(`glow-vial-reveal-poster.jpg`, the still it rests on before playing), exist
on disk and are referenced from the page.

### The label in the footage

The clip is kept exactly as filmed: `GLP-3 (RT)` / `10 MG • 99%`, uncut and
with nothing overlaid on top of it. The catalog holds GLP-3 (RT) at 99.4%, so
that 99% is a real, standing disagreement with the number everywhere else on
the site (product page, certificate panel, structured data) — a figure
`check-claims.js` cannot see or enforce, because it is pixels, not markup,
and there is deliberately no live text laid over it correcting it. The
five-layer artwork this replaced carried the same standing exception, at the
same request: the vial is shown exactly as supplied rather than corrected in
front of the camera. Know this before changing GLP-3 (RT)'s catalog purity
again: the vial will not follow.

It exists because of what used to be in that slot: two "medical advisors" who
did not exist, with invented credentials and stock headshots. What made them
indefensible was that nothing in the system produced them, so nothing could
ever contradict them. The replacement is generated from the one array that
decides what the whole site is allowed to claim about testing, and
`check-claims.js` compares the served markup against the renderer. A test that
leaves the certificate leaves the homepage in the same edit, or the build
fails.

The block is delimited by an `<!-- /tdNodes -->` marker rather than by a run of
closing tags: the callouts nest two levels deep, and a lazy match up to
`</div></div>` found the end of the first callout instead of the end of the
block, pushing a spare `</div>` into the page on every rebuild.

## `build-meta.js`

Writes every copy of a page's title and description from the one entry in
`tools/page-meta.js`: `<title>`, `meta description`, `og:title`,
`og:description`, `og:url` (from the canonical), `twitter:title`,
`twitter:description`, and the `name`/`description` of the page's own
`WebPage`-family structured data. Four to six copies of two strings, written
once.

They had already drifted: the structured data added to peptides, shipping,
wholesale, product and contact described those pages differently from their own
meta tags, on the day it was written. Edit `page-meta.js`, run the build.

It skips JSON-LD blocks carrying an `id=""` attribute, because those belong to a
generator, and `build-catalog.js` reads `page-meta.js` for its description so
there is still one source. Noindex pages have no entry: no share card, nothing
to keep honest.

## `build-catalog.js`

Bakes the product grid into `peptides.html` from `productCardHtml()`, the same
function `renderProductGrid()` uses, plus `CollectionPage` + `ItemList`
structured data.

The catalog page was 1,037 characters of text and named **none of the nine
compounds**: the grid was drawn into an empty `<div>` on load, so the page whose
whole job is to list what Glow sells listed nothing to anyone not running
JavaScript. The filter and sort controls re-render through the same function, so
hydration replaces the baked cards with identical ones that have handlers.

## `build-llms.js`

Writes `/llms.txt`, a markdown summary of the catalog, supply chain and FAQ for
language models, generated from `js/products-data.js`.

**Status: speculative.** `llms.txt` is a proposed convention and no major answer
engine has confirmed reading one. It is here because it costs nothing. It is not
a substitute for having the content in the HTML of the pages themselves, and if
it is ever the only place something is stated, that is a bug.

## `build-products.js`

Generates one real, crawlable page per compound at `peptides/<slug>/index.html`.

Reads the catalog from `js/products-data.js`, the same file the browser loads,
through the CommonJS guard at the foot of it, and lifts the whole of
`product.html` as its template, so nav, footer, styles and scripts stay in one
place.

Each page gets its own `<title>`, canonical, Open Graph tags, and
`Product` + `Offer` + `BreadcrumbList` JSON-LD. The Product schema uses
`about[0]` (the first paragraph of the compound's description, shown collapsed
in the About accordion) rather than the catalog's mechanism-only `blurb`. The
result is a simple above-fold buy box, with full per-compound context available
below in the collapsed accordions and in the schema for crawlers. The page
still loads `js/product.js` and hydrates as before; the slug rides on
`<body data-product-slug>` instead of a query string.

### The launch switch

```js
// js/products-data.js
const PRODUCT_PAGES_LIVE = false;
```

**These pages are currently held.** The real catalog, prices, images and COAs
have not been imported yet, and publishing nine crawlable pages of placeholder
data would be worse than publishing none. Nothing here is broken. The
generator is finished and tested. What is missing is the data.

While it is `false`:

- `build-products.js` writes nothing and says why
- `build-sitemap.js` leaves product URLs out
- `productHref()` returns `product.html?p=<slug>`, so every card, search result
  and related-product link on the site keeps working exactly as before

One constant, read by the browser and both build scripts, so the site, the
sitemap and the generator can never disagree.

**To launch:**

1. Import the real catalog into `js/products-data.js`, keeping the existing
   shape (`name`, `cat`, `tag`, `purity`, `sizes[]`, `blurb`, `about[]`,
   `research[]`), which `cart.js`, `search.js` and `product.js` all read. The
   `purity` strings currently in the file are placeholders; the import
   overwrites them with the supplier's measured figures. Nothing reads them
   except the vial fine print and the `Product` schema, so replacing the values
   in place is enough. No other file needs touching.
2. Host the certificates and fill `COA_URL`, or a per-product `coa`.
3. Set `COAS_PUBLISHED = true` (see below) so the certificate wording across
   the site upgrades from "on request" to direct batch links.
4. Write real per-SKU availability into `sizes[].stock`. Nothing else to
   change: the buy box, the mg picker, the quick-add sheet, the catalog card
   and the `Product` schema all read it through `sizeInStock()` /
   `productInStock()`. Absent means sellable, so an import that carries no
   stock field behaves exactly as the site does today.
5. Add `sku` to the `Product` schema once the fulfilment partner supplies them.
6. Set `PRODUCT_PAGES_LIVE = true`, run `node tools/build.js`, and commit
   `peptides/**` along with the updated `sitemap.xml`.
7. Check the generated pages (prices, sizes, purity, images, certificate
   links) before anything is submitted for indexing.
8. Submit the sitemap in Search Console.

### The certificate switch

```js
// js/products-data.js
const COAS_PUBLISHED = false;
```

Separate from `PRODUCT_PAGES_LIVE` on purpose: certificates and the generated
product pages both arrive with the supplier import, but they do not have to go
live in the same deploy.

Every lot **is** third-party tested and every batch **does** have a certificate.
That is how the business runs, and the site says so. What is not true yet is
that this site *hosts* them, so the only route that works today is asking us.
`COA_COPY` beside the flag holds both versions of that wording, and the five
places that render it read from there:

| Surface | Source |
|---|---|
| Homepage FAQ | `COA_COPY.faq`, `js/script.js` |
| Cart trust list | `COA_COPY.short`, `js/cart.js` |
| Account order footer | `COA_COPY.orderNote`, `js/account.js` |
| Product page COA box | `COA_COPY.boxTitle` / `.boxSub`, `js/product.js` |
| Evidence panel, Document row | `COA_COPY.panelNote` / `.panelLink`, `js/products-data.js` |

The product page's static markup ships with the "on request" wording, so what a
crawler sees (and what `build-products.js` bakes into each generated page) is
accurate without running scripts; `renderCoa()` upgrades it only when a real
href exists.

One hand edit comes with the flip: `product.html` is the donor every generated
page is cut from, so it cannot regenerate its own evidence panel the way
`peptides/<slug>/` does. `check-claims.js` catches the stale panel and prints
the exact markup to paste into `<dl id="pdEvidence">`, so it is a copy out of
the build output rather than something to work out.

Flipping `COAS_PUBLISHED` moves the rest at once. Prose that mentions certificates on the
About page is written to stay true either way, so it needs no edit; if you want it pointing at a direct
link too, that is the only hand edit left.

## `build-sitemap.js`

The single writer for `sitemap.xml`, imported by the other builds so that
running any of them leaves a **complete** sitemap.

It used to live inside the blog build and be generated from that build's own
list of pages, which meant every rebuild silently dropped `terms.html`,
`privacy.html` and `ruo-agreement.html`, and it never knew about products. The
blog is gone; this is the writer that outlived it.

Static pages are listed in `STATIC_PAGES` and checked against the filesystem, so
a page that gets renamed or deleted fails the build instead of leaving a 404
advertised to search engines. Add new pages there.

Deliberately excluded: `signin`, `account`, `checkout`, `thank-you`,
`reset-password`, `404`. A sitemap is a list of pages worth landing on from a
search result.

## Changing the domain

`SITE` is hardcoded at the top of `build-products.js` and `build-sitemap.js`.
If the domain changes, update both plus `robots.txt`, then
rebuild, canonicals, Open Graph URLs and the sitemap all derive from it.
