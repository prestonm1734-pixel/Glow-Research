# Glow Research

Static storefront for a San Diego research-peptide supplier. No framework, no
build step for the hand-written pages. Plain HTML, one stylesheet, vanilla JS
modules in `js/`. Serverless handlers live in `api/`.

## Read first

**[PRINCIPLES.md](PRINCIPLES.md) is the standing constraint on this codebase.**
It is not aspirational copy. It decides arguments. The two that come up most:

- *Never claim more than we can prove.* Any sentence on the site that asserts a
  fact must be derived from data the system actually holds.
- *Never create uncertainty we can remove.* If a customer would have to guess,
  that is a defect.

Before adding a claim to a page, ask what makes it true tomorrow when nobody is
looking. If the answer is "someone remembers to edit the HTML", it is wrong:
put the value in `js/products-data.js`, read it everywhere, and add a check.

## Layout

| Path | What |
|---|---|
| `js/products-data.js` | The catalog and every sitewide constant. Shared by browser and Node (CommonJS guard at the bottom). Most single sources of truth live here. |
| `js/product.js` | Product detail rendering. Hydrates generated pages in place. |
| `js/cart.js`, `js/checkout.js` | Cart drawer and checkout. `FREE_SHIPPING_AT` and the shipping table are here. |
| `tools/build.js` | Single entry point. Runs the blog and product builds, then the sitemap. |
| `tools/check-claims.js` | Guard: fails when copy and code disagree, or when the site claims something the data cannot support. |
| `content/` | Blog source. See `content/README.md`. |
| `tools/README.md` | What each build script does, and the launch flags. |

## Commands

```sh
node tools/build.js          # blog + product pages + sitemap
node tools/check-claims.js   # promise audit, run before every commit
```

## Launch flags

Both live in `js/products-data.js` and are read by browser and build alike.

- **`PRODUCT_PAGES_LIVE`:** gates the generated `peptides/<slug>/` pages. False
  until the supplier import lands. While false, catalog and search links point
  at `product.html?p=<slug>` and the sitemap omits product URLs.
- **`COAS_PUBLISHED`:** gates *certificate evidence*, not the testing claim.
  Every batch is third-party tested either way; the flag only decides whether
  the site links documents or routes to email. Four surfaces read `COA_COPY`.

Flipping either is a one-line change plus `node tools/build.js`.

## House style

- Comments explain *why*, not what. Match the density already in the file.
- No dependencies. Nothing in `js/` may import anything.
- Copy is plain and specific. No hype, no urgency, no exclamation marks.
- **No em dashes in copy.** Use a comma when the aside is part of the sentence,
  a colon when what follows explains the label, a full stop when it is its own
  thought. `check-claims.js` enforces this. The one exception is a bare `—`
  standing alone in an element, which is the "no value yet" indicator.
- Placeholder data is labelled as placeholder in a comment that says what
  replaces it.
