# Build scripts

The site is static HTML served straight from the repo, so **generated files are
committed**. Nothing builds on deploy. If you don't run the build and commit
the output, the change doesn't ship.

No dependencies to install. Everything here is plain Node.

```bash
node tools/build.js          # the usual one: products (when live) + sitemap + audit
node tools/build-products.js # one page per compound
node tools/build-sitemap.js  # sitemap.xml on its own
node tools/check-claims.js   # promise audit, run before every commit
node tools/build-blog.js     # blog, read the warning below first
```

## `build.js`

The everyday entry point. Runs `build-products.js`, which refreshes
`sitemap.xml` on its way through, then `check-claims.js`.

It deliberately does **not** run `build-blog.js`. See below.

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
  names no analysis `process.html` does not describe, it keeps the
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
- no page promises a certificate while `COAS_PUBLISHED` is false
- no fabricated ratings or reviews appear in structured data
- every product carries every field the site reads, so a lossy supplier import
  fails here rather than rendering an empty tab
- every sitemap URL exists on disk, and held product URLs are not listed

**Adding a claim to the site? Add its check here in the same commit.** That is
the whole point: the list grows as the promises do.

## `build-products.js`

Generates one real, crawlable page per compound at `peptides/<slug>/index.html`.

Reads the catalog from `js/products-data.js`, the same file the browser loads,
through the CommonJS guard at the foot of it, and lifts the whole of
`product.html` as its template, so nav, footer, styles and scripts stay in one
place.

Each page gets its own `<title>`, description, canonical, Open Graph tags, and
`Product` + `Offer` + `BreadcrumbList` JSON-LD, with the product name, price,
sizes, description and research notes already in the served markup. The page
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

Flipping `COAS_PUBLISHED` moves the rest at once. Prose that mentions certificates (the
About page and the three blog articles) is written to stay true either way, so it needs no edit; if you want those pointing at direct
links too, they are the only hand edits left.

## `build-sitemap.js`

The single writer for `sitemap.xml`, imported by the other builds so that
running any of them leaves a **complete** sitemap.

It used to live inside the blog build and was generated from the blog build's
own list of pages, which meant every rebuild silently dropped `terms.html`,
`privacy.html` and `ruo-agreement.html`, and it never knew about products.

Static pages are listed in `STATIC_PAGES` and checked against the filesystem, so
a page that gets renamed or deleted fails the build instead of leaving a 404
advertised to search engines. Add new pages there.

Deliberately excluded: `signin`, `account`, `checkout`, `thank-you`,
`reset-password`, `404`. A sitemap is a list of pages worth landing on from a
search result.

## `build-blog.js`

> **Read this before running it.** The committed blog pages have been
> hand-edited since they were last generated: each post carries its own drawn
> cover illustration rather than the procedural lattice the script produces,
> the contents rail has been removed, and the nav calls the section "Research
> Blog" where `setActiveNav()` still looks for "Blog", so the active state is
> no longer applied. **Running this replaces all of that.**
>
> If you do run it, read `git diff blog/` carefully before committing.
> Reconciling the generator with the committed pages is an outstanding job.

What it does when run: generates `blog/<slug>/index.html` per post from
`content/posts.js` plus the body fragment in `content/posts/<slug>.html`, and
rebuilds `blog.html`. Publishing workflow is in `content/README.md`.

## Changing the domain

`SITE` is hardcoded at the top of `build-products.js`, `build-sitemap.js` and
`build-blog.js`. If the domain changes, update all three plus `robots.txt`, then
rebuild, canonicals, Open Graph URLs and the sitemap all derive from it.
