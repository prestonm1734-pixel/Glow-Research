# Affiliate programme, how it actually works

Two halves. The browser half is built and live in this repo. The server half is
not, and cannot be, everything that decides who gets paid has to sit somewhere
the affiliate can't edit.

## What's built here

| Piece | File | What it does |
|---|---|---|
| Click capture | `js/referral.js` | Reads `?ref=CODE` on any landing page, stores it, strips the param back out of the URL |
| Attribution window | `js/referral.js` | 60 days, expired on read. `GlowReferral.code()` returns the live code or `null` |
| Order hand-off | `js/checkout.js` | Attaches the code at submit, so the order carries it |
| Public programme page | `affiliate.html` | Terms, commission tiers, rules, application form |
| Affiliate dashboard | `account.html` | Link, copy button, clicks / sign-ups / orders / paid / pending |

Try it: load `/?ref=GLOW-TEST123`, note the param disappears, then go to checkout
and submit, the code is named in the confirmation.

## What has to be server-side

**Don't keep the ledger in the browser.** Clicks, balances and approvals stored
in `localStorage` are editable by the person being paid. The browser's only job
is to say "this visitor arrived via CODE"; everything downstream is the server's.

1. **Validate the code.** `referral.js` only checks the *shape* (`^[A-Z0-9][A-Z0-9-]{2,31}$`).
   Whether the code belongs to an approved affiliate is a database lookup.
2. **Record the order.** On order creation, store `affiliate_code`, order id,
   subtotal, and timestamp. Commission is on **subtotal only**, never shipping
   or tax, or you pay commission on FedEx.
3. **Hold, then approve.** Commission sits `pending` for 30 days after delivery,
   then flips to `approved`. Refund or chargeback → reverse it.
4. **Pay out.** Monthly, above a $50 floor, carried forward below that.
5. **Tax.** US affiliates paid $600+ in a calendar year need a 1099-NEC, so
   collect a W-9 at approval, not at payout time.

## Fraud rules worth enforcing on day one

- **Self-referral:** match affiliate email/address against the order.
- **Cookie stuffing:** a code that fires with no click-through.
- **Brand bidding:** check paid search for your own name periodically.
- **Coupon-site leakage:** codes appearing where you didn't put them.
- **Claims violations:** the one that matters most here. An affiliate writing
  "cures X" in your name is the exposure the FDA warning letters describe, made
  by someone you're paying. Review placements before approving, and again on any
  material change.

## Build it or buy it

Buy it. Once real money moves, you inherit fraud handling, payout rails, tax
forms and a support queue.

| Option | Fit |
|---|---|
| **AffiliateWP** | Best fit if the store lands on WooCommerce, which `js/products-data.js` already anticipates. Self-hosted, one-time licence, owns your data. |
| **Refersion** | Shopify/Woo, handles payouts and 1099s. Monthly fee. |
| **Tapfiliate / GoAffPro** | Cheaper, lighter, thinner fraud tooling. |

Whichever you pick, `js/referral.js` can usually be dropped, most platforms
ship their own click tracker. Keep it only if you want attribution to survive
independently of the vendor. If you do keep it, make sure both aren't recording
the same click twice.

## Numbers currently published on the site

Changing these means changing `affiliate.html` **and** the affiliate agreement.

- Commission: 10% standard, 12.5% over $2,500/mo, 15% over $10,000/mo
- Attribution: 60 days, last click wins
- Hold: 30 days after delivery
- Payout: monthly, $50 minimum
