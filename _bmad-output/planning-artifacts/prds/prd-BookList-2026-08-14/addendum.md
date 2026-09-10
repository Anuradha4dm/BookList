---
title: "Book List PRD — addendum"
status: final
created: 2026-08-14
updated: 2026-08-14
---

# Addendum: material for downstream documents

Content the PRD deliberately excludes because it belongs to architecture, solution design, or UX rather than to a statement of requirements. Carried forward from the brainstorm memlog, the product brief and its addendum, and the PRD session.

## Technical constraints (architecture input)

- One Node process plus SQLite. Thin starter: Express, SQLite, and static `public/` HTML. Heavy fullstack starters were explicitly rejected.
- Deploy target is the Bonto free tier: **Node.js or static, 50 hours per month, auto-sleep, 0.5 CPU, and 512MB base**. First live URL is `booklist.bonto.run`, treated as staging that the vendor uses for real work.
- Book List cannot be a static site, so Node mode is required.
- The later production move is Bonto's Glitch plan, which provides one custom domain and one always-on application. Same application, no rewrite.
- Zero outbound messaging in v1 means no SMTP, no messaging provider, and no queue or worker for notification delivery.
- Single-currency money handling. No tax engine.
- Admin credentials are seeded at deployment, and a single-use recovery code is issued at the same time (FR74). Generating, displaying it once, storing, and redeeming that code is an architecture concern; the requirement is only that a forgotten admin password never requires a redeploy.
- The admin export (FR67) is the durability mechanism. Format and delivery are an architecture decision; the requirement is only that the vendor can obtain a complete copy of orders and catalog without assistance.

## Data-model implications of PRD decisions (architecture input)

- **Book master is a shared entity.** Packs reference book records rather than copying them, and there is no per-pack price override. A price correction propagates to every pack at once — which is why stale-cart detection (FR49) must watch book-level drift, not pack-level.
- **Packs have a typed name and no stored price.** The displayed pack price is computed from constituent books at read time.
- **Order snapshotting is mandatory and total**, and includes the delivery address and contact numbers as well as catalog data. Nothing on an order dereferences a live record, which is what allows packs, books, and profiles to change freely.
- **Cart lines are cloned, never merged.** Two adds of the same pack are two independent line records with their own tick sets. Any uniqueness constraint on pack cart lines would break the second-child flow. Individual items are the opposite case — they merge by quantity, so the 20 cap cannot be circumvented by repeated adds.
- **Schools and grades behave as admin-managed enumerations**, not hardcoded code lists and not free text on the pack. They support rename and archive, but not hard delete while in use. Grade options are queried scoped to the selected school.
- **Cart is server-persisted against the account**, not browser-local, so it follows the parent across devices and survives a session expiry mid-checkout.
- **Order ID allocation must be concurrency-safe** — short and sequential, with no possibility of two placements receiving the same number.
- **Place Order requires an idempotency mechanism.** A mobile-first storefront with no page-reload friction will produce double submissions.
- **Status transitions require optimistic concurrency.** Every transition validates against the order's current status, and the parent-cancel versus admin-confirm race needs a single winner with the loser informed.

## UX material (UX spec input)

- Mobile-first storefront. Rich animation and visual polish on both storefront and admin, with no plain-admin split. The vendor's stated ambition is for the site to feel a cut above the market.
- The admin's interface quality is load-bearing, not cosmetic: if it is unpleasant the vendor returns to the phone, which is the product's primary failure mode.
- Admin home is the today list — open orders grouped by status with per-status counts — not the catalog.
- The pack screen is the product's signature interaction: everything pre-ticked, untick what you own, quantity steppers with per-title line totals, and a locked last title. The locked checkbox and the disabled plus at 20 both need visible explanation rather than silent refusal.
- Checkout carries the literal line **"Delivery charge: to be confirmed by the shop"** so the parent is not surprised later.
- Cart lines for repeated adds of the same pack need a distinguishing label, along the lines of "Pack 2 of Grade 1", so the second-child flow is legible.
- Order ID is read aloud during a phone call, which is why it is short and sequential rather than a long code.

### Brand and identity

- App name is **Book List**. The icon is **a pile of books** — a locked decision, chosen over an alternative concept of a closed book with one corner folded into a checklist tick.
- The site has no logo and needs one defined. An illustrated pile-of-books mark sits in the Could tier.
- A palette of deep navy with school-bag mustard, and a sturdy rounded sans wordmark, were proposed alongside the rejected logo concept. Their status remains unsettled and is carried as an open question in the PRD rather than assumed.

## Market and domain research

- Sri Lankan government schools receive free textbooks for grades 2–5 and 7–11, with simplified modules for grades 1 and 6 under the 2026 reforms. Full prescribed-textbook lists are a private and international-school phenomenon, which is why private and international schools are the target segment and why government-school stationery packs are a non-goal.
- Incumbents and their gaps:
  - Kapruka sells fixed per-grade booklist bundles that cannot be unticked.
  - Sarasavi accepts booklist photo or PDF uploads per branch, which hands interpretation work back to the shop.
  - BookBee fulfils booklists over WhatsApp.
  - In India, QLess shows a child's prescribed list on login.
  - The differentiator here is per-title customisation, not booklist ordering itself.
- Buying peaks late November to early January, with term 1 starting 1 January — roughly six weeks of compressed demand.
- Cash on delivery is preferred by around 52% of Sri Lankan online shoppers, supporting the COD-first decision.
- PayHere accepts sole proprietors but requires a complete live HTTPS site with terms, refund, and privacy pages, and rejects incomplete ones. This is a gating dependency for the deferred payment-gateway cycle.
- WhatsApp has roughly 16.5M Sri Lankan users (TRCSL Q4 2025), which is why it is the contact channel for the delivery partner.

## Rejected alternatives and their rationale

- **Softening the price freeze.** Allowing the admin to edit the delivery price until Delivered was rejected. An absolute freeze is easier for the vendor to trust; a mistyped charge is recovered by cancelling and re-placing, at the cost of a burnt order number and a second call.
- **Allowing backward movement to Order Is Placed.** Rejected because re-confirming would have become a hidden edit path around the freeze.
- **A separate loose-books catalog.** An earlier locked decision, later reversed. The single-title need is served by opening a pack and unticking everything else, so the capability survives without a second books surface.
- **Admin-entered phone orders.** Rejected. All orders are placed by the parent.
- **Per-order delivery addresses and an address book.** Rejected as unnecessary for a single-shop COD flow; the account address is snapshotted onto the order instead.
- **A fat fullstack starter (Next plus Postgres).** Rejected: it worsens the 512MB and auto-sleep constraints without dissolving any friction that matters here.
- **WhatsApp as a login identity.** Rejected; email and password only.
- **New-order alerting to the admin.** Deferred; the v1 assumption is a daily check.
- **Staleness flagging on aged orders.** Rejected as the leak-hunt instinct the vendor explicitly does not want.
