# Publishing a blog post

Three steps. No build tools to install — just Node.

## 1. Write the article body

Create `content/posts/<slug>.html`. This is a **fragment**, not a full page: no
`<html>`, `<head>`, nav, or footer. The build wraps it in the site shell.

```html
<p class="lede">
  Opening paragraph. Rendered larger than body text — use it to state what the
  article covers.
</p>

<h2>A section heading</h2>

<p>Body copy.</p>

<h3>A subheading inside that section</h3>

<ul>
  <li>List item</li>
</ul>

<p class="post-callout">
  <strong>Pull-quote or warning.</strong> Renders in a bordered grey panel.
</p>
```

Notes:

- **`<h2>`s become the table of contents** on the left of the article, and get
  linkable anchors automatically. Use them for real sections; use `<h3>` for
  anything below that.
- The contents rail only appears when an article has **3 or more `<h2>`s**.
  Fewer than that and the article renders full-width.
- Links to other pages are written **root-relative** — `href="coa.html"`,
  `href="peptides.html"`. The build rewrites them to work from the article's
  nested URL. Don't write `../../coa.html`.
- The research-use-only disclaimer is appended to every article automatically.
  Don't add it by hand.

## 2. Register it

Add an entry to the top of the array in `content/posts.js` (newest first — the
first entry becomes the featured lead story on the listing page):

```js
{
  slug: 'my-new-article',        // must match the filename, and becomes the URL
  title: 'My New Article',
  description:
    'One or two sentences. This is the Google result snippet and the ' +
    'listing summary — aim for ~155 characters.',
  category: 'News',              // free text; new categories appear on their own
  date: '2026-08-04',            // YYYY-MM-DD
  readingTime: 6,                // minutes, your estimate
  keywords: ['peptide news'],
},
```

`category` is not a fixed list. Type anything — the listing page derives its
topic filter from whatever categories exist across the posts, so a new one
starts working the moment a post uses it.

## 3. Build

```bash
node tools/build-blog.js
```

This regenerates `blog/<slug>/index.html` for every post, plus `blog.html` and
`sitemap.xml`. Commit the generated files along with your source — the site is
served as static HTML, so unbuilt changes won't appear.

---

## Things that change on their own

- **The topic filter** appears once there are **6+ posts across 2+ categories**.
  Below that it stays hidden, since filtering a handful of articles isn't
  useful.
- **The article count** in the masthead.
- **Cover artwork.** Each post gets a unique generated lattice image derived
  from its slug — no image files to make. Same slug always yields the same art.
- **Related posts** at the foot of each article.
- **The sitemap**, including new URLs for search engines.

## Things that don't

- `SITE` at the top of `tools/build-blog.js` is hardcoded to
  `https://glowresearch.shop`. If the domain changes, update it there and in
  `robots.txt`, then rebuild — canonical URLs, Open Graph tags, and the sitemap
  all derive from it.
- The header and footer are lifted from `peptides.html` at build time. Edit the
  nav there and rerun the build to push it to every article.
