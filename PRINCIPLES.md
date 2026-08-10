# The Glow Standard

We are not building a luxury peptide website. We are building the easiest
research supplier in the category to believe, understand, and buy from.

Everyone else competes for the order. **Glow competes to end the search.**

A customer should come to Glow, understand exactly what we offer, see the
evidence behind legitimate claims, place an order without friction, receive
exactly what was promised, and eventually stop feeling the need to compare
suppliers.

The core principle: **Glow does what it says.** Every design and engineering
decision reinforces that, or it does not ship.

---

## The North Star

Judge everything against one sentence:

> **Would this make an existing Glow customer more likely or less likely to
> ever need another supplier?**

We are not trying to produce *"wow, this peptide site looks sick."* We are
trying to produce *"I just use Glow."*

---

## The five non-negotiables

They bind design and engineering equally.

**1. Never create uncertainty we can remove.**
If information can be made clearer, make it clearer.

**2. Never claim more than we can prove.**
Design and engineering must support factual, substantiated research-use
claims — not hype.

**3. Consistency is part of the product.**
Order #10 and order #100,000 should feel like they came from the same company.

**4. Problems should improve the system.**
Every meaningful failure should produce a process improvement.

**5. Growth cannot lower the Glow standard.**
Anything that makes us faster or more profitable while making the experience
less dependable is suspect.

---

## For design

**Design for confidence, not decoration.** The premium black/white
institutional aesthetic stays. Every element should make Glow feel clear, calm,
credible and established — not flashy or hype-driven.

The site must visually communicate:

- **Clarity** — no clutter, no confusing hierarchy, no excessive badges.
- **Proof** — testing and documentation are obvious and easy to reach wherever
  they apply.
- **Consistency** — every product page follows the same structure, terminology,
  spacing, information hierarchy and evidence presentation.
- **Calm confidence** — no fake urgency, no screaming discounts, no
  casino-style countdowns, nothing that makes the business feel temporary.
- **Predictability** — the customer always knows what happens next: ordering,
  fulfillment, shipping, support.
- **Institutional permanence** — the site should feel like Glow will still be
  here in ten years.

### The design test

Do not ask *"how can we make this look more premium?"*

Ask **"how can we remove one more reason for the customer to doubt us?"**

---

## For engineering

**Build systems that make our promises measurable and difficult for us to
break.**

A promise that lives only in copy is a promise the system can break silently.
Every claim on the site should trace back to a value the system actually holds,
so that when reality changes, the copy changes with it.

That means engineering around: reliable inventory status, accurate fulfillment
messaging, product/lot-document associations where applicable, clear order
status, predictable tracking, easy document access, fast page performance,
consistent product-data structure, internal error monitoring, and systems that
surface problems rather than hide them.

### The engineering test

> **"What could go wrong here that would make a customer stop trusting Glow,
> and can we design the system so it either doesn't happen or gets caught
> immediately?"**

Not: fix bugs after customers complain. Build processes where errors become
information that improves the system.

### What this looks like in this repo

| Pattern | Why |
|---|---|
| One constant, many readers | A number stated in copy and enforced in code must be the *same* value. `FREE_SHIPPING_AT`, `CUTOFF_HOUR`, `SITEWIDE_DISCOUNT` are single knobs on purpose. |
| Flags gate evidence, not claims | `COAS_PUBLISHED` and `PRODUCT_PAGES_LIVE` let true statements ship before their supporting documents do, without either drifting. |
| Claims are derived, never hardcoded | Stock status, prices and dispatch dates are computed from data. If the data can't support the sentence, the sentence changes on its own. |
| `node tools/check-claims.js` | The audit is automated so a broken promise fails the build instead of reaching a customer. Every new promise gets a check. |

---

## Pinned

> **Never let growth turn Glow into the company we built Glow to replace.**
