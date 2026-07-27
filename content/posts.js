// ===================== Glow Research — blog post index =====================
// Single source of truth for blog metadata. The body of each post lives in
// content/posts/<slug>.html as a plain HTML fragment (no <html>/<head>/nav —
// tools/build-blog.js wraps it in the site shell).
//
// To publish: add an entry here + the matching fragment, then run
//   node tools/build-blog.js
//
// Newest first — the listing page renders them in this order.

module.exports = [
  {
    slug: 'how-to-store-lyophilized-peptides',
    title: 'How to Store Lyophilized Peptides in the Lab',
    // ~155 chars — this is what shows under the title in Google results
    description:
      'Temperature, light, and moisture all degrade lyophilized peptides. A practical storage guide for research labs, covering long-term, working, and reconstituted vials.',
    category: 'Handling',
    date: '2026-07-14',
    readingTime: 6,
    // pulled into the listing card and the OG image
    keywords: ['peptide storage', 'lyophilized peptides', 'peptide stability', 'research peptides'],
  },
  {
    slug: 'how-to-read-a-certificate-of-analysis',
    title: 'How to Read a Peptide Certificate of Analysis',
    description:
      'HPLC purity, mass spec identity, endotoxin limits, and what each line on a peptide COA actually means, and the red flags that separate a real COA from a marketing document.',
    category: 'Verification',
    date: '2026-07-07',
    readingTime: 7,
    keywords: ['certificate of analysis', 'peptide COA', 'HPLC purity', 'mass spectrometry'],
  },
  {
    slug: 'reconstituting-research-peptides',
    title: 'Reconstituting Research Peptides: A Practical Guide',
    description:
      'Choosing a diluent, calculating concentration, and avoiding the handling mistakes that denature peptides during reconstitution in a research setting.',
    category: 'Protocols',
    date: '2026-06-28',
    readingTime: 8,
    keywords: ['peptide reconstitution', 'bacteriostatic water', 'peptide concentration'],
  },
];
