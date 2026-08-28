// ===================== Glow Research — page metadata =====================
//
// One title and one description per hand-written page.
//
// Each of those two strings used to be typed out three or four times per page:
// <title> and og:title; then meta description, og:description,
// twitter:description, and for six pages a `description` in the JSON-LD too.
// Nothing checked that the copies agreed, and they had already stopped: the
// structured data added to peptides, shipping, wholesale, product and contact
// described those pages differently from their own meta tags, on the same day
// it was written.
//
// So the strings live here and tools/build-meta.js writes every copy from
// them. Edit one line, run the build, and the page, the share card and the
// structured data say the same thing. check-claims.js fails the build if any
// copy drifts.
//
//   name   the page as a thing: used for og:title, twitter:title, and the
//          `name` in structured data. No site suffix.
//   title  the browser tab and the search result heading. Suffixed, because a
//          result reading "Shipping" alone says nothing about whose.
//   desc   one sentence or two, used verbatim by all four description
//          surfaces. Under ~160 characters or a search result truncates it.
//
// Pages left out on purpose: account, checkout, signin, thank-you,
// reset-password and 404 are noindex and never shared, so a share card and a
// schema block would be maintenance with no reader. The generated product
// pages are not here either: build-products.js derives their metadata from the
// catalog, which is the same principle applied to data that already exists.

const SUFFIX = 'Glow Research';
const t = name => `${name} | ${SUFFIX}`;

const PAGE_META = {
  'index.html': {
    name: 'Glow Research | Research-Grade Peptides',
    title: 'Glow Research | Research-Grade Peptides',
    desc: 'Glow Research supplies research-grade peptides for laboratory and in-vitro research use only. Manufacturing partner, third-party tested lots, orders shipped within a day.',
  },
  'peptides.html': {
    name: 'Full Catalog',
    title: t('Full Catalog'),
    desc: 'Browse the full Glow Research peptide catalog: growth, tissue, cognitive, and metabolic research compounds. Every lot is tested by an independent third-party laboratory.',
  },
  'product.html': {
    name: 'Product',
    title: t('Product'),
    desc: 'Third-party tested research-grade peptide, supplied for laboratory and in-vitro research use only. Size options, specifications, and shipping within a day.',
  },
  'how-we-test.html': {
    name: 'How We Test',
    title: t('How We Test'),
    desc: 'Purity, identity and quantity on every batch, run by an independent laboratory before a lot reaches our catalog. Every certificate is published against its lot number.',
  },
  'about.html': {
    name: 'About Glow Research',
    title: 'About Glow Research | Research Peptide Supplier',
    desc: 'Glow Research supplies research peptides and research-use-only compounds to laboratories nationwide. A retailer, not a manufacturer: we work with a manufacturing partner.',
  },
  'shipping.html': {
    name: 'Shipping',
    title: t('Shipping'),
    desc: 'Every order placed by 1:00 PM Pacific ships the same day on 2-day FedEx Express. Free over $250. All 50 states.',
  },
  'shipping-policy.html': {
    name: 'Shipping Policy',
    title: t('Shipping Policy'),
    desc: 'Glow Research shipping policy: processing time, FedEx rates and coverage, delivery area, and the no-returns policy on shipped or opened vials.',
  },
  'wholesale.html': {
    name: 'Wholesale',
    title: t('Wholesale'),
    desc: 'Volume pricing, a named contact, and custom fill sizes for labs ordering at scale. Applications are answered within one business day.',
  },
  'coa.html': {
    name: 'Certificate of Analysis',
    title: t('Certificate of Analysis'),
    desc: 'Certificates of analysis for Glow Research peptides.',
  },
  'contact.html': {
    name: 'Contact Us',
    title: t('Contact Us'),
    desc: 'Reach the Glow Research team at support@glowresearch.shop for order status, wholesale applications, or general questions.',
  },
  'privacy.html': {
    name: 'Privacy Policy',
    title: t('Privacy Policy'),
    desc: "How Glow Research collects, stores, and uses information: what's saved in your browser, the services that handle payments and orders, and what we don't track.",
  },
  'terms.html': {
    name: 'Terms &amp; Conditions',
    title: t('Terms &amp; Conditions'),
    desc: 'Terms of service for Glow Research: eligibility, research-use-only sales, shipping, returns, and the retailer relationship with our fulfilment partner.',
  },
  'ruo-agreement.html': {
    name: 'Research Use Only Agreement',
    title: t('Research Use Only Agreement'),
    desc: 'The Research Use Only agreement every Glow Research buyer accepts: no human or animal use, no dosing guidance, and buyer responsibility for lawful, qualified handling.',
  },
};

module.exports = { PAGE_META, SUFFIX };
