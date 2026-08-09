# Build scripts

The site is static HTML served straight from the repo, so **generated files are
committed**. Nothing builds on deploy — if you don't run the build and commit
the output, the change doesn't ship.

No dependencies to install. Everything here is plain Node.

```bash
node tools/build.js          # the usual one: products (when live) + sitemap
node tools/build-products.js # one page per compound
node tools/build-sitemap.js  # sitemap.xml on its own
node tools/build-blog.js     # blog — read the warning below first
```

## `build.js`

The everyday entry point. Runs `build-products.js`, which refreshes
`sitemap.xml` on its way through.

It deliberately does **not** run `build-blog.js` — see below.

## `build-products.js`

Generates one real, crawlable page per compound at `peptides/<slug>/index.html`.

Reads the catalog from `js/products-data.js` — the same file the browser loads,
through the CommonJS guard at the foot of it — and lifts the whole of
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
data — claiming lot-matched certificates while `COA_URL` is still empty and no
certificate is hosted anywhere — would be worse than publishing none.

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
   `research[]`) — `cart.js`, `search.js` and `product.js` all read it.
2. Fill `COA_URL`, or a per-product `coa`, so the certificate box goes live.
3. Replace the hardcoded `availability: InStock` in `build-products.js` with
   real stock once the catalog carries it.
4. Add `sku` to the `Product` schema once the fulfilment partner supplies them.
5. Set `PRODUCT_PAGES_LIVE = true`, run `node tools/build.js`, and commit
   `peptides/**` along with the updated `sitemap.xml`.
6. Submit the sitemap in Search Console.

## `build-sitemap.js`

The single writer for `sitemap.xml`, imported by the other builds so that
running any of them leaves a **complete** sitemap.

It used to live inside the blog build and was generated from the blog build's
own list of pages, which meant every rebuild silently dropped `terms.html`,
`privacy.html` and `ruo-agreement.html`, and it never knew about products.

Static pages are listed in `STATIC_PAGES` and checked against the filesystem —
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
rebuild — canonicals, Open Graph URLs and the sitemap all derive from it.
