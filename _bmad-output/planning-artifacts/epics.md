---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-BookList-2026-08-18/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/EXPERIENCE.md
---

# BookList - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for BookList, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: A parent can self-register with name, delivery address, WhatsApp number, email, and password. A second phone number is optional.
FR2: Login uses email and password only. The WhatsApp number is contact data, not a login identity.
FR3: Anyone may browse schools, grades, packs, and individual items without an account. Adding anything to a cart requires being logged in, because the cart belongs to the account.
FR4: A parent must be authenticated to place an order.
FR5: A parent can edit their own name, delivery address, WhatsApp number, and second phone from their profile. Edits affect future orders only; orders already placed keep their own snapshot.
FR6: A parent can change their own password while logged in.
FR7: The address held on the parent's account is the default delivery address at checkout. There is no per-order override and no saved-address book.
FR8: The single admin account is seeded at deployment from configuration. There is no admin registration screen.
FR9: The admin can change their own password while logged in.
FR10: The admin can reset any parent's password to a value he communicates to them, from the parent's record. This is the only account-recovery path in v1; there is no reset email.
FR11: The optional second phone number is presented to the admin on the order as a fallback contact when the WhatsApp number does not answer the confirmation call.
FR12: Every form validates its input and reports failures inline, in the parent's context, without losing what they typed. Required fields, email format, and phone format are validated server-side as well as in the interface.
FR13: The admin can add, rename, and archive schools. A school in use by a pack cannot be hard-deleted.
FR14: The admin can add, rename, and archive grades, on the same basis. Grades are unbounded and admin-typed, not a predefined 1–13 list.
FR15: The admin maintains a reusable book master. Each book record holds a title and a price. The title carries the edition.
FR16: A book record is shared across every pack that uses it. A pack cannot override the price of a book it contains. A price correction applies everywhere at once.
FR17: A pack has an admin-typed name, a school, a grade, a short description of what the pack is for, and a set of books chosen from the book master.
FR18: A pack has no stored price. Its displayed price is computed as the sum of all its books, and falls as the parent unticks titles. It is a preview, never a discount that survives unchecking.
FR19: The admin can create, edit, and archive packs at will, including adding and removing books from an existing pack. A new school year means a new pack; there is no separate academic-year versioning.
FR20: Archiving a pack hides it from the storefront but does not delete it. Orders that already contain it keep their own snapshot of its name, titles, and prices.
FR21: The admin maintains a separate individual-items catalog for stationery and similar shop stock. Each item holds a title, a description, and a price only.
FR22: Individual items are wholly separate from the book master and are never part of a pack.
FR23: Books are sold inside packs only. A parent who wants a single title opens the pack containing it and unticks everything else — the locked-last-title rule (FR31) guarantees one remains. There is no separate loose-books catalog.
FR24: Book-master records and individual items can be archived on the same basis as packs: hidden from the storefront, retained for existing orders.
FR25: Archiving a book that belongs to a live pack removes it from that pack's storefront display. Carts holding that pack are handled per FR49.
FR26: There are no image uploads anywhere in the catalog in v1.
FR27: Editing a book, item, or pack affects the storefront and future orders only. Existing orders are never altered.
FR28: Every catalog list has a defined empty state that tells the admin what to add and how.
FR29: The parent selects a school from a dropdown, then filters by grade. Grade options are scoped to grades that actually have live packs for the chosen school, so the parent cannot select a combination with no results.
FR30: Discovery is structured filtering only. There is no free-text or smart search in v1.
FR31: Opening a pack displays every book in it, with all titles pre-selected. The parent can untick any title they already own, except the last remaining selected title, whose checkbox is locked. To remove it, the parent must first tick another title.
FR32: Each ticked title starts at quantity 1, with a stepper ranging from 1 to 20. The plus control is disabled at 20 with the cap visibly stated. The minus control at quantity 1 unticks the title, except on the last remaining ticked title, where it is locked.
FR33: The pack screen shows a per-title line total alongside the running pack total, both recalculating as ticks and quantities change.
FR34: The parent adds the configured pack to the cart as a single action.
FR35: A school or grade with no live packs shows an explanatory empty state, not a blank screen.
FR36: The parent can browse the individual-items catalog independently of any school or pack.
FR37: Individual items are added to the same cart as packs, with the same quantity range of 1 to 20. Adding an item already in the cart adjusts that line's quantity rather than creating a second line, so the cap cannot be circumvented.
FR38: The cart is stored against the parent's account and persists across sessions and devices.
FR39: The cart may hold multiple packs. The same pack may be added more than once, and each add creates a new cart line with its own independent ticks and quantities. Lines never merge.
FR40: Repeated adds of the same pack are labelled distinguishably in the cart, so two lines for the same pack can be told apart at a glance.
FR41: A pack is not required. A valid cart may contain packs only, individual items only, or a mixture.
FR42: The parent can remove any cart line and adjust quantities within it. Changing which titles are ticked requires removing the line and adding the pack again.
FR43: The cart displays a running goods total.
FR44: An empty cart shows a defined empty state that routes the parent back to pack discovery. **UX override (EXPERIENCE wins per AD-6):** empty cart is `Cart is Empty` plus a refresh icon, with no routing CTA to Browse.
FR45: Checkout displays the goods total and the fixed line "Delivery charge: to be confirmed by the shop".
FR46: Checkout does not calculate, estimate, or collect a delivery charge.
FR47: Checkout displays the delivery address held on the account so the parent can verify it before placing.
FR48: The parent can attach one optional free-text note to the order, which the admin sees on the order detail.
FR49: Checkout compares every cart line against current catalog state and flags any line whose pack or item has been archived, whose constituent book has been archived or removed from its pack, or whose price has changed since it was added. Unavailable lines must be removed before placing; repriced lines require explicit acknowledgement of the new figure. Nothing is silently substituted or silently repriced.
FR50: Placing the order captures a complete snapshot of its contents, prices, and delivery details.
FR51: Each order is assigned a short sequential identifier (for example `#1042`), allocated so that concurrent placements cannot receive the same number.
FR52: Place Order is idempotent. A repeated submission of the same checkout creates exactly one order.
FR53: A newly placed order enters the status Order Is Placed, and the cart is emptied.
FR54: Payment method is cash on delivery. The application handles no payment.
FR55: All orders are placed by the parent. The admin cannot create an order on a parent's behalf.
FR56: `[Should]` The admin's home screen is his today list: every order that has not reached Delivered or Cancelled. **UX override (EXPERIENCE wins per AD-6):** admin home is one Orders screen of all orders (open and past), with a clear split between those groups and a status filter only.
FR57: `[Should]` Orders on the home screen are grouped by status, in pipeline order, with a count per status. Retain grouping/counts on the merged Orders screen.
FR58: Delivered and Cancelled orders remain accessible through a separate view. **UX override (EXPERIENCE wins per AD-6):** no separate completed-orders screen; past orders live on the same Orders list.
FR59: Order detail shows the parent's name, WhatsApp number, second phone if given, the snapshotted delivery address, the order note, every line with its snapshot titles, quantities, and prices, and the goods total.
FR60: The admin can mark that a confirmation call was attempted, recording a timestamp. An order the parent did not answer must not look identical to one never called. **UX override:** no private vendor scratchpad on the order; the two writings are the parent's delivery note and the cancellation reason.
FR61: The admin sets Order Confirmed and enters the delivery price in the same action. The delivery price is required and must be a non-negative amount.
FR62: On confirmation, the order total becomes goods plus delivery. This is the first complete payable figure in the application.
FR63: The admin can move an order between statuses subject to the transition rules in PRD §6 / AD-9.
FR64: The admin can cancel any non-terminal order. A short reason is required.
FR65: Setting Delivered or Cancelled requires a confirmation prompt, because both are final.
FR66: The admin cannot edit the contents of a placed order. The selection is locked at placement.
FR67: The admin can export all orders and catalog data as a downloadable file at any time.
FR68: The parent can see all of their orders, including Delivered and Cancelled ones, with the current status of each.
FR69: Order detail shows the ordered lines with their snapshot prices, the goods total, the delivery charge once set, and the payable total.
FR70: Before confirmation, order detail states that the delivery charge is still to be confirmed by the shop.
FR71: The parent sees the order's position in the pipeline as the admin advances it.
FR72: The parent can cancel their own order while it is still Order Is Placed. The option disappears the moment the admin sets Order Confirmed.
FR73: When the admin cancels an order, the parent sees both the Cancelled status and the reason given.
FR74: A single-use admin recovery code is generated at deployment and shown once. Entering it allows the admin to set a new password without a redeploy, and issues a fresh code. **UX parks the storefront/admin recovery screens; architecture AD-11 requires the server capability to still ship (print code to server log; never render in either React app).**

### NonFunctional Requirements

NFR1: The storefront is mobile-first. Parents will predominantly order on phones.
NFR2: `[Should]` Both the storefront and the admin interface are richly animated and visually polished; the admin interface has to be somewhere the vendor is willing to spend his morning (CM1).
NFR3: Interactions behave as they would in a modern application rather than as full page reloads, particularly ticking titles, stepping quantities, and advancing status.
NFR4: Never silently undo or refuse a parent's action. Where the application prevents something, it says so visibly and explains why.
NFR5: The admin's order list loads quickly enough to be opened many times a day without friction.
NFR6: The pack screen stays responsive with a realistically long book list, since ticking and quantity changes recalculate totals continuously.
NFR7: Motion serves the interaction and never delays the vendor's work or a parent's checkout.
NFR8: Passwords are stored using a current password-hashing standard. Authenticated pages are not reachable without a valid session.
NFR9: A parent can only ever see their own orders, cart, and profile.
NFR10: Order data survives restarts and redeployments, and the export in FR67 provides recovery beyond what the hosting guarantees.
NFR11: All rules in this document are enforced server-side, not only in the interface — quantity caps, the locked last title, the required delivery price, every status transition, and every ownership check.
NFR12: Every form states its required fields, validates server-side, and reports failures without discarding input.
NFR13: Every list has a defined empty state (catalog, packs/items discovery, cart, parent orders, admin orders).
NFR14: Every action that can fail has a defined failure message: a rejected transition, a lost session mid-checkout, an unavailable cart line, a duplicate submission, a failed export.
NFR15: A session that expires mid-flow leaves the cart intact on the server. **UX override:** after re-login the parent lands on packs (not the cart), except the Add-to-cart auth gate which returns to that pack.
NFR16: WCAG 2.2 AA is a floor on both storefront and admin (4.5:1 body text, 3:1 large text and UI boundaries, visible doubled focus ring, 44×44 targets, full keyboard operability, status never hue-only).
NFR17: Honour `prefers-reduced-motion`: drop press travel, total count-up, skeleton shimmer, and every other transition.
NFR18: English only in v1. No telemetry. No outbound email, SMS, or WhatsApp. Not a PWA; a down connection is a wait, not a local cart.
NFR19: All amounts are a single currency with no tax: integer rupees in data, rendered as `Rs.` prefix, comma thousands, no decimals, tabular numerals.

### Additional Requirements

**Starter / Epic 1 Story 1 (greenfield structural seed — Architecture AD-2, AD-3, AD-6, Stack, Structural Seed):**
- No named cookiecutter. Scaffold a modular monolith: one Node process, one SQLite file, two Vite React apps plus `client/ui`.
- Verified stack: Node.js 22.12+ (`engines.node` `>=22.12.0`; Bonto runtime Node 22, not default 20), Express 5.2.1, better-sqlite3 13.0.3, TypeScript 7.0.2, React 19.2.8, Vite 8.2.1, tsx 4.23.12 for dev.
- Source tree: `server/{identity,catalog,cart,orders,db/migrations,web}`, `client/{storefront,admin,ui}`.
- **Build order is identity → catalog → cart → orders.** Each folder ships tryable, with the React screens for that slice, before the next folder starts.
- Allowed depends-on: `web → orders → cart → catalog`, and `identity` used by all. Arrows never reverse. Domain writes live in modules, never in React or raw SQL in `web`.

**Host and deploy (AD-2 — overrides PRD §9 treating Bonto free as v1 production):**
- Build and test on Bonto free. Go-live is the same app on Bonto Glitch (always-on, one custom domain). Config and secrets change by environment; code does not.
- Env names only: `PORT`, `DATABASE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Never committed.
- SQLite file lives at `DATABASE_PATH` on persistent disk, not inside a wiped deploy directory. `web` opens one `better-sqlite3` WAL connection at boot, runs numbered migrations, passes the connection into modules.
- Logging is stdout/stderr only. No log service. No second process, worker, mailer, or queue.

**HTTP, API, and clients (AD-5, AD-6, AD-7, AD-12):**
- Express mounts: `/api` JSON, `/admin` admin Vite app, `/` storefront Vite app. One origin. No CORS.
- Same-origin JSON under `/api/*` with `credentials: include`. Success bodies camelCase. Failures always `{ error: { code, message } }`. Place Order sends header `Idempotency-Key`.
- Two Vite React apps (`client/storefront`, `client/admin`) plus `client/ui` (custom components and CSS variables from DESIGN.md tokens only). No Next.js, no MUI / shadcn / Tailwind, no named component kit. EXPERIENCE.md wins over DESIGN.md on behaviour.
- Session cookie `booklist.sid`: Path=`/`; Max-Age=14 days; HttpOnly; SameSite=Lax; Secure on HTTPS. Identity is the only Set-Cookie / Clear-Cookie source. Session rows live in SQLite. Same-origin + SameSite=Lax is the CSRF control.

**Data conventions (Consistency Conventions, AD-4, AD-8, AD-9):**
- SQL columns `snake_case`; JSON `camelCase`. Integer primary keys. Public order number is a separate short sequential integer.
- Money: integer rupees in DB and JSON (`9320`). Time: UTC text in DB; screens show Asia/Colombo.
- Cart pack line is a cloned configuration captured at add (not a live pack pointer). Item lines merge by item id. GET may annotate live catalog (archived / removed / repriced) and must not silently rewrite stored figures.
- Place Order is one SQLite transaction (snapshot, sequential `public_number`, empty cart) and is idempotent on `Idempotency-Key`. Snapshot includes pack names, book titles, item titles, unit prices, quantities, delivery address, and contact numbers. Place payload cannot substitute a delivery address.
- Stored status strings exactly: `Order Is Placed`, `Order Confirmed`, `Processing`, `Packing The Order`, `Ready To Deliver`, `On Delivery Partner`, `Delivered`, `Cancelled`.
- Transition rules T1–T11 enforced in `orders`: only admin advances; no skip of Order Confirmed; forward 3–6 may skip; backward floors at Order Confirmed; Delivered/Cancelled final; cancel from any non-terminal requires `cancellation_reason`; expected-current-status check (T7); parent-cancel vs admin-confirm first-commit-wins (T8); Order Confirmed writes `delivery_price_rupees` + `payable_total_rupees` in one transaction and freezes the order (T9).

**Secrets and recovery (AD-11):**
- Passwords hashed with Node `scrypt`. First boot seeds the admin, generates a single-use recovery code, prints it once to the server log, stores only a hash. Redeeming it sets a new password and prints a new code. Never rendered in either React app.
- EXPERIENCE parks storefront forgot-password and admin-recovery screens; FR10 (admin sets parent password) and FR74 (recovery-code redeem) still ship as server capabilities.

**Export (AD-10):**
- One Export action downloads one zip: CSV files of orders and catalog (Excel) plus a copy of the SQLite file (restore). `orders` assembles the zip by calling `catalog` and its own reads.

**Parent order visibility:**
- v1 has no outbound messaging and no live push. Parent pipeline visibility may poll.

**Explicitly out of v1 (do not story these):** custom domain beyond Glitch’s one; payment gateway; notifications; in-app delivery-fee calculation; stock/inventory; extra admin accounts or staff roles; delivery-partner login; password-reset email; catalog images; free-text search; academic-year versioning; admin-created orders; PWA; Sinhala/Tamil; tRPC/ORM/Next/Postgres/JWT.

### UX Design Requirements

UX-DR1: Implement the Chalk & Brass token system in `client/ui` as CSS variables: 21 semantic colour roles with designed light and dark peers (not an inversion), plus the closed 24-value pipeline ramp (fill/ink/edge × 8 statuses × 2 modes).
UX-DR2: Enforce the mustard fill-only rule: `{colors.accent-primary}` is never a border, rule, hairline, divider, underline, or text on a light surface; mustard fills are bounded by `{colors.border-strong}`; white on mustard is banned; `{colors.text-on-accent}` is the only ink on mustard.
UX-DR3: Implement typography tokens with the system font stack only (no webfont): display, display-mobile, heading-lg/md/sm, amount-hero, amount-hero-wide, amount-row, body, body-strong, meta, label-caps, pill-label, step-number. Set `font-variant-numeric: tabular-nums` globally. Never go below 12.5px except the redundant step numeral.
UX-DR4: Render money as `Rs.` prefix, comma thousands, no decimals (`Rs. 9,320`). Amounts right-aligned in repeating rows. Money inputs use a filled `Rs.` prefix block; the currency symbol is never typed.
UX-DR5: Implement spacing, radius, and layout tokens: 4px scale; `{spacing.touch-min}` and `{spacing.control-h}` 44px; `{spacing.cta-h}` 52px; `{spacing.tabbar-h}` 56px; `{spacing.admin-sidebar-w}` 214px; `{spacing.pack-rail-w}` 288px; `{spacing.storefront-max}` 760px; `{spacing.margin-mobile}` 16px; `{spacing.margin-desktop}` 24px.
UX-DR6: Elevation is printed, not atmospheric: no blurred shadows. Flat / lifted (`2px 2px 0`) / standing (`3px 3px 0`). Primary button uses a 4px bottom-only `{colors.accent-primary-hover}` lip that flattens with a 2px translate over 120ms on press. Dark mode carries depth by tonal step plus `border-strong-dark`, not an ink offset.
UX-DR7: Build the brand lockup: geometric pile-of-books SVG mark (`0 0 24 24`, `fill="currentColor"`, min 18px) plus the words **Book List** in `{typography.heading-sm}` inside an ink chip. Mark-only is the favicon; outlined 48×48 variant at 40px+ is the empty-state illustration. No tagline; wordmark never re-set in another face.
UX-DR8: Focus indicator is the doubled ring: 3px `{colors.focus-ring}` plus 2px `{colors.focus-ring-offset}` gap on `:focus-visible`. Never a single-hue ring. Every interactive control sits in a minimum 44×44 target.
UX-DR9: Pack-screen title row component with three variants: ticked (raised, solid edge, mustard checkbox with navy tick); unticked (base surface, dashed edge, 2px strikethrough title); locked-last-title (promoted `{colors.accent-quiet}` wash, 3px `{colors.border-strong}` edge, checkbox stays full-strength while disabled — never greyed).
UX-DR10: Locked-title notice inside the locked row, bordered, with padlock glyph and verbatim copy `Keep at least one book to add this pack.` Never a toast or tooltip. The same shell carries the quantity-cap explanation.
UX-DR11: Quantity stepper 1–20: 44×44 minus/plus, `{colors.accent-quiet}` readout, disabled ends stay 44×44 and look like controls. Plus at 20 states verbatim `Item count exeeded, you can only order 20 per item`. Minus at 1 unticks except on the last remaining title.
UX-DR12: Button set: primary (mustard fill, 52px CTA / 44px inline, one per surface); secondary (default); destructive outline for in-flow cancel and solid destructive only inside terminal modals; blocked primary stays in place when Place Order cannot fire; in-row Remove is an underlined danger text action in a 44px target.
UX-DR13: Cart line component: first pack line chip is ink fill with mustard text; a repeat add of the same pack inverts to mustard fill with navy text and a strong edge. Labels use the verbatim shape `Pack 2 of Grade 1` (not parent nicknames). Show composition (`6 of 8 titles · atlas ×2`) and amount.
UX-DR14: Status pill for all eight pipeline statuses using four channels before hue: step number (1–8, `×` for Cancelled), unique glyph, border weight/style (dashed 2px not-started / solid 2px in-flight / solid 3px day-ending), corners (`rounded.full` in motion, `rounded.xs` for Delivered and Cancelled). Cancelled also strikes its label. `Order Is Placed` is true neutral grey. `Ready To Deliver` is the only mustard pill and obeys the mustard rule.
UX-DR15: Parent order-detail vertical timeline: completed ticked, current emphasised, remaining visible but quiet. Eight stages will not fit a horizontal stepper on a phone. Pre-confirm states that delivery is still to be confirmed.
UX-DR16: Call-state chip: `Not called yet` (raised, dashed edge, hollow ring) versus `Called · no answer` with timestamp (warn-tint, solid warning edge, filled handset with struck tail). Must keep the solid warning edge because light-mode warn-tint equals accent-quiet.
UX-DR17: Admin Orders row: five columns at desktop (order ID, parent, lines summary, status pill, call chip); attention variant thickens the left edge to 8px `{colors.border-strong}`. Below ~900px the row reflows to two lines without shrinking targets. Group headers use a 3px strong bottom rule, status name, mustard count badge.
UX-DR18: Admin sidebar: 214px ink chrome (`{colors.text-primary}` fill in light), Orders first, then schools, grades, book master, packs, items; Export pinned at the bottom and visually separated. Active item is a mustard fill block, never a mustard stripe. Must remain usable when narrow.
UX-DR19: Storefront navigation: phone bottom tab bar (Browse / Cart / Orders / Account, 56px plus safe-area, mustard filled active block, Cart line-count badge). At 760px and up, the same four destinations become a top nav. Browse is the only public surface; Cart, Orders, and Account open the auth gate if logged out.
UX-DR20: Pack screen layout: mobile single column with the running-total bar sitting above the tab bar (never scrolled away). At 760px+: title list plus a fixed 288px ink rail (running total, per-title breakdown, Add to cart). Storefront content capped at 760px.
UX-DR21: Chrome surfaces (storefront top bar, pack running-total bar, admin sidebar) fill with `{colors.text-primary}` in light; labels/values on chrome use dark-mode counterpart tokens.
UX-DR22: Form field: label-caps above; raised control; money fields with filled `Rs.` prefix. Error thickens border to 3px danger and shows the message beneath with a triangle glyph; fill stays raised and typed value is kept. Field border does not change colour on focus — the doubled ring is the signal.
UX-DR23: Banner/notice in four flavours (danger, warning, success, info): 3px semantic border over tint fill. Checkout staleness is inline per line, not a modal: unavailable → Remove (danger); repriced → Accept new price (warning). A summary danger banner blocks Place Order until every flagged line is resolved. FR45 delivery line stays visible on an accent-quiet strip above the goods total.
UX-DR24: Modal confirmation for terminal actions only (parent cancel; admin Delivered; admin Cancelled). One modal deep, never two. Destructive confirm is the solid variant; Cancel is secondary.
UX-DR25: Empty states follow EXPERIENCE (this supersedes DESIGN.md “every empty has a primary button”): parent Cart = `Cart is Empty` + refresh icon, no Browse CTA; parent Orders = `No Orders yet.` + refresh icon; parent packs/items = `we are working on this now` with no Add; admin catalog lists = on-screen Add school / grade / book / pack / item; admin Orders empty and filter-empty = stated empty, not a silent blank; missing/wrong URL = empty page with no message, refresh, or back CTA.
UX-DR26: Cold-start skeleton is the shape of the page being loaded: dashed rows, accent-quiet bars, brass-on-chalk. No spinner and no wording (EXPERIENCE wins over DESIGN.md info-notice). Shimmer 1200ms removed entirely under `prefers-reduced-motion`. Subsequent in-flight loads use a spinner only.
UX-DR27: Auth gate offers Log in and Create account. After Add-to-cart login: return to the same pack; pack is not auto-added. After any other login (timeout, Cart/Orders/Account tabs): land on packs. Cart remains server-held.
UX-DR28: Light and dark are both in scope from v1 as designed peers. Theme must apply the `-dark` token values, not a filter of light. Parents order in the evening (UJ-1).
UX-DR29: Voice is warm and plain-spoken (helpful shopkeeper). Use EXPERIENCE verbatim strings including known spelling `Item count exeeded, you can only order 20 per item` unless later asked to polish. Every refusal says what to do next. No jargon, no blame, no dead ends.
UX-DR30: Storefront footer carries one short privacy note: what personal data is stored and why. No terms or refund pages in v1.
UX-DR31: Place-order success lands on My Orders with the cart empty and the short order number visible. Parent cancel stays on My Orders with the cancelled order still listed. Export in progress is a spinner icon only; failure copy is `Exporting Job failed try again later`.
UX-DR32: Screen readers: interactive controls expose name, role, and state (ticked, locked, cap reached, call attempted). Auth gate and blocked Place Order must be announced as such. Status is never hue-only.
UX-DR33: Motion 120–200ms only; never animate on the path to Place Order or the vendor’s next status change. Totals may count up rather than jump except under `prefers-reduced-motion`.
UX-DR34: Admin password-change while logged in (FR9) was not elicited in UX; still a PRD Must — implement as a simple Account/settings field, matching parent password-change, without inventing extra recovery UI.

### FR Coverage Map

FR1: Epic 1 — Parent self-register with name, address, WhatsApp, email, password; optional second phone
FR2: Epic 1 — Login is email and password only; WhatsApp is contact data
FR3: Epic 2 — Anonymous browse of schools, grades, packs, and items (cart-requires-login completed in Epic 3)
FR4: Epic 4 — Place order requires an authenticated parent
FR5: Epic 1 — Parent edits own profile; changes affect future orders only
FR6: Epic 1 — Parent changes own password while logged in
FR7: Epic 1 — One delivery address on the account; no per-order override or address book
FR8: Epic 1 — Single admin seeded from configuration; no admin registration
FR9: Epic 1 — Admin changes own password while logged in
FR10: Epic 1 — Admin resets a parent password from the parent record (server capability; no reset email)
FR11: Epic 4 — Optional second phone shown to admin on the order as fallback contact
FR12: Epic 1 — Inline form validation; typed values kept; server-side required/email/phone checks
FR13: Epic 2 — Admin add/rename/archive schools; no hard-delete while a live pack references them
FR14: Epic 2 — Admin add/rename/archive unbounded grades
FR15: Epic 2 — Book master: title (edition) and price
FR16: Epic 2 — Shared book records; pack cannot override price
FR17: Epic 2 — Pack has name, school, grade, description, and books from the master
FR18: Epic 2 — Pack price is computed at read time and never stored
FR19: Epic 2 — Admin create/edit/archive packs; add/remove books; new year = new pack
FR20: Epic 2 — Archived pack hidden from storefront; existing orders keep snapshot
FR21: Epic 2 — Individual-items catalog: title, description, price
FR22: Epic 2 — Items never part of a pack; separate from book master
FR23: Epic 2 — Books sold inside packs only; no loose-books catalog
FR24: Epic 2 — Archive books and items as hide-from-storefront
FR25: Epic 2 — Archiving a book removes it from live pack storefront display
FR26: Epic 2 — No catalog image uploads in v1
FR27: Epic 2 — Catalog edits affect storefront and future orders only
FR28: Epic 2 — Admin catalog lists have Add-{entity} empty states
FR29: Epic 2 — School dropdown then grade filter scoped to live packs
FR30: Epic 2 — Structured filtering only; no free-text search
FR31: Epic 2 — Pack opens all titles ticked; last remaining title locked
FR32: Epic 2 — Quantity stepper 1–20; plus disabled at 20; minus at 1 unticks except last title
FR33: Epic 2 — Per-title line total and running pack total recalculate live
FR34: Epic 3 — Add configured pack to cart as a single action
FR35: Epic 2 — School/grade with no live packs shows `we are working on this now`
FR36: Epic 2 — Browse individual items independently of school or pack
FR37: Epic 3 — Add items to the same cart; merge by quantity; cap 1–20
FR38: Epic 3 — Cart stored on the parent account; persists across sessions and devices
FR39: Epic 3 — Multiple packs; same pack added again is a new cloned line; lines never merge
FR40: Epic 3 — Repeat pack lines labelled `Pack N of Grade X`
FR41: Epic 3 — Valid cart may be packs only, items only, or mixed
FR42: Epic 3 — Remove lines and adjust quantities; tick changes require remove and re-add
FR43: Epic 3 — Cart shows running goods total
FR44: Epic 3 — Empty cart: `Cart is Empty` + refresh icon; no Browse CTA
FR45: Epic 4 — Checkout shows goods total and "Delivery charge: to be confirmed by the shop"
FR46: Epic 4 — Checkout does not calculate, estimate, or collect delivery
FR47: Epic 4 — Checkout displays the account delivery address
FR48: Epic 4 — Optional parent delivery note on the order
FR49: Epic 4 — Checkout flags archived/removed/repriced lines; no silent substitute or reprice
FR50: Epic 4 — Place Order snapshots contents, prices, address, and contacts
FR51: Epic 4 — Short sequential public order number; concurrent places cannot collide
FR52: Epic 4 — Place Order idempotent (`Idempotency-Key`)
FR53: Epic 4 — New order is Order Is Placed; cart emptied
FR54: Epic 4 — Cash on delivery; no payment in the app
FR55: Epic 4 — Only the parent places orders; admin cannot create orders
FR56: Epic 4 — Admin home is one Orders screen of all orders (open and past)
FR57: Epic 4 — Orders grouped by status with counts; status filter only
FR58: Epic 4 — Past (Delivered/Cancelled) on the same Orders list; no separate completed view
FR59: Epic 4 — Admin order detail: contacts, snapshot address, note, lines, goods total
FR60: Epic 4 — Call-attempted timestamp; never-called vs no-answer must differ; no private scratchpad
FR61: Epic 4 — Order Confirmed and delivery price in the same action; non-negative required
FR62: Epic 4 — Payable total = goods + delivery, written at confirmation
FR63: Epic 4 — Admin status transitions per T1–T11 / AD-9
FR64: Epic 4 — Admin cancel any non-terminal order with required reason
FR65: Epic 4 — Delivered and Cancelled behind a confirmation modal
FR66: Epic 4 — Admin cannot edit placed order contents
FR67: Epic 4 — Export zip: order and catalog CSVs plus SQLite copy
FR68: Epic 4 — Parent sees all own orders including Delivered and Cancelled
FR69: Epic 4 — Parent order detail: snapshot lines, goods, delivery once set, payable total
FR70: Epic 4 — Pre-confirm: delivery still to be confirmed by the shop
FR71: Epic 4 — Parent sees pipeline position as admin advances (poll)
FR72: Epic 4 — Parent cancel only while Order Is Placed; first-commit-wins vs admin confirm
FR73: Epic 4 — Parent sees Cancelled and the admin's reason
FR74: Epic 1 — Admin recovery code generated at boot, printed once to server log, redeemable without redeploy

## Epic List

### Epic 1: Open the door — accounts for Nimali and Gothami
A parent can register, log in, and manage name, address, WhatsApp, extra phone, and password. Gothami has the one seeded admin login, can change her password, and can reset a parent’s password. The recovery code is issued on the server (log only). Both apps exist with Chalk & Brass chrome, light/dark, auth gates, and navigation shells.
**FRs covered:** FR1, FR2, FR5, FR6, FR7, FR8, FR9, FR10, FR12, FR74

### Epic 2: Stock the shop and browse the lists
Gothami maintains schools, grades, book master, packs, and items without a deploy. Parents (no account needed) pick school and grade, open a pack, untick titles, set quantities 1–20, and see a live goods total. Individual items are browsable. Empty catalog and discovery states exist. Add to cart is not in this epic.
**FRs covered:** FR3, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR35, FR36

### Epic 3: Build a cart that survives the evening
Adding anything requires login. Nimali adds a configured pack as its own line (second child = second line, labelled `Pack 2 of Grade 1`). Items merge by quantity. The cart lives on the account across devices. She can remove lines, change item quantities, and see a goods total. Empty cart is `Cart is Empty` + refresh, no Browse CTA. Checkout and Place Order wait for Epic 4.
**FRs covered:** FR34, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44

### Epic 4: Capture the order and work the morning list
Nimali checks out (address, delivery-charge line, optional note, staleness resolved inline), places once (idempotent, short `#1042`, snapshot), sees My Orders with the vertical pipeline, and can cancel while Order Is Placed. Gothami opens one Orders screen (open and past, status filter), confirms with delivery price in the same action, marks call attempted, advances status, cancels with a reason the parent can see, and exports zip (CSV + SQLite).
**FRs covered:** FR4, FR11, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52, FR53, FR54, FR55, FR56, FR57, FR58, FR59, FR60, FR61, FR62, FR63, FR64, FR65, FR66, FR67, FR68, FR69, FR70, FR71, FR72, FR73

## Epic 1: Open the door — accounts for Nimali and Gothami

A parent can register, log in, and manage name, address, WhatsApp, extra phone, and password. Gothami has the one seeded admin login, can change her password, and can reset a parent’s password. The recovery code is issued on the server (log only). Both apps exist with Chalk & Brass chrome, light/dark, auth gates, and navigation shells.

### Story 1.1: Project scaffold and Chalk & Brass shell

As a shop visitor,
I want to open Book List in the browser and see the Chalk & Brass storefront and admin door,
So that the commissioned app exists as a real site I can return to.

**Acceptance Criteria:**

**Given** a fresh clone with `PORT`, `DATABASE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` set in the environment
**When** the process starts
**Then** one Node 22 process serves Express on `PORT`, opens one `better-sqlite3` WAL connection at `DATABASE_PATH`, runs numbered migrations (none required yet beyond a migrations runner), and mounts `/api` (JSON), `/` (storefront Vite app), and `/admin` (admin Vite app) on one origin with no CORS
**And** the repo matches the architecture seed: `server/{identity,catalog,cart,orders,db/migrations,web}`, `client/{storefront,admin,ui}`
**And** `engines.node` is `>=22.12.0`; the stack is Express 5.2.1, better-sqlite3 13.0.3, TypeScript 7.0.2, React 19.2.8, Vite 8.2.1 — no Next.js, no MUI/shadcn/Tailwind, no Prisma, no JWT

**Given** the storefront at `/`
**When** I open it on a phone-width viewport
**Then** I see Chalk & Brass: CSS variables in `client/ui` for the 21 semantic colour roles (light and designed dark peers), typography (system stack only, `tabular-nums` on body), spacing/radius tokens, and the brand lockup (pile-of-books mark + “Book List” in an ink chip)
**And** mustard `{colors.accent-primary}` is used only as a fill, bounded by `{colors.border-strong}` when it needs an edge
**And** chrome (top bar) fills with `{colors.text-primary}` in light mode; labels on chrome use dark-mode counterpart tokens
**And** a phone bottom tab bar shows Browse / Cart / Orders / Account (Browse is the landing); at 760px and up those four destinations are a top nav
**And** the storefront footer has one short privacy note (what personal data is stored and why)
**And** English only; no webfont; no service worker / PWA

**Given** the admin app at `/admin`
**When** I open it
**Then** I see the same token system and a 214px ink sidebar chrome (Orders first, then schools, grades, book master, packs, items, Export pinned at the bottom and visually separated)
**And** below ~900px the same tokens still hold (narrow admin remains usable, even if the main column is empty)

**Given** either app
**When** a control is focused via keyboard
**Then** the doubled focus indicator appears (3px `{colors.focus-ring}` plus 2px `{colors.focus-ring-offset}` gap)
**And** interactive targets are at least 44×44
**And** `prefers-reduced-motion` drops press travel, shimmer, and other transitions
**And** money, when shown, is `Rs.` prefix, comma thousands, no decimals

**Given** a first request after the process was idle (or a simulated slow first paint)
**When** the storefront or admin is loading
**Then** a branded cold-start skeleton shows the shape of that page (dashed rows, `{colors.accent-quiet}` bars) with no spinner and no wording
**And** under `prefers-reduced-motion` the skeleton does not shimmer

**Given** a path that is not a known route (storefront or admin)
**When** I open it
**Then** I get an empty page: no message, no refresh, no back CTA

### Story 1.2: Admin seed, session, and recovery code

As Gothami,
I want a seeded admin login and a recovery code kept outside the app,
So that I can open the back office without a registration screen, and regain access without a redeploy.

**Acceptance Criteria:**

**Given** the first process boot with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set
**When** migrations and seed run
**Then** `identity` creates exactly one admin account with that email and a Node `scrypt` password hash
**And** there is no admin registration screen
**And** a single-use recovery code is generated, printed once to stdout/stderr, and stored as a hash only — never written into either React app

**Given** I am on `/admin` and not signed in
**When** I submit the correct admin email and password
**Then** `identity` creates a session row in SQLite and sets cookie `booklist.sid` (`Path=/`, `Max-Age=14 days`, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS)
**And** `identity` is the only module that Set-Cookie / Clear-Cookie
**And** I land on admin Orders (empty list is fine; catalog screens may still be empty)

**Given** I am signed in as admin
**When** I log out
**Then** the session row is deleted and the cookie is cleared
**And** `/admin` authenticated routes are not reachable without a valid session (NFR8)

**Given** I submit wrong admin credentials, or a parent tries to use `/admin` APIs
**When** the request is handled
**Then** the response is JSON `{ error: { code, message } }` with a plain-English message (NFR4)
**And** no session cookie is set

**Given** I have the current recovery code from the server log
**When** I redeem it through the identity API (not a storefront or admin page)
**Then** I can set a new admin password without a redeploy
**And** a fresh recovery code is printed once to the log and only its hash is stored
**And** the old code no longer works

### Story 1.3: Parent register, login, and auth gates

As a parent,
I want to create an account, sign in with email and password, and be asked to sign in when I open Cart, Orders, or Account,
So that browsing stays public but my cart and orders can only belong to me.

**Acceptance Criteria:**

**Given** I am on the storefront and not signed in
**When** I create an account with name, delivery address, WhatsApp number, email, and password (second phone optional)
**Then** `identity` stores the parent with a `scrypt` password hash
**And** WhatsApp is stored as contact data, not as a login identity (FR2)
**And** the same `booklist.sid` cookie scheme as admin is used; role lives on the account

**Given** I submit a registration or login form with missing required fields, a bad email, or a bad phone
**When** validation runs
**Then** failures are reported inline in my context without discarding what I typed (FR12)
**And** required fields, email format, and phone format are enforced server-side as well as in the interface
**And** JSON failures use `{ error: { code, message } }`

**Given** I have a parent account
**When** I log in with email and password only
**Then** I receive a session and can open Account
**And** I cannot reach `/admin` or admin APIs
**And** I can only ever read or write my own profile (NFR9)

**Given** I am not signed in
**When** I open Cart, Orders, or Account
**Then** the auth gate offers Log in and Create account (UX-DR27)
**And** Browse remains usable without an account
**And** after a successful login or register from those three tabs I land on packs (Browse), not on the tab I tapped
**And** there is no parent forgot-password screen in v1

**Given** my session has expired on an authenticated storefront surface
**When** I log in again
**Then** I land on packs
**And** any later cart remains a server-side cart (not a local store); this story does not create cart tables

### Story 1.4: Parent account

As a parent,
I want to edit my name, delivery address, WhatsApp number, extra phone, and password,
So that the shop has the right contact details and there is one address, not a book of them.

**Acceptance Criteria:**

**Given** I am logged in as a parent
**When** I open Account
**Then** I see name, delivery address, WhatsApp, optional second phone, email, and password
**And** email is the login identity and is not editable here
**And** there is no saved-address book and no per-order address override (FR7)

**Given** I change name, delivery address, WhatsApp, and/or second phone
**When** I save
**Then** only my account row is updated
**And** the form validates inline and server-side without discarding typed values (FR12)
**And** money fields are not involved; phone fields do not accept a login-identity treatment

**Given** I change my password while logged in
**When** the new password is accepted
**Then** it is stored as a new `scrypt` hash
**And** my current session remains valid
**And** a subsequent login requires the new password

**Given** I am not the owner of another parent’s account
**When** I request their profile
**Then** the request is rejected with `{ error: { code, message } }` (NFR9, NFR11)

### Story 1.5: Admin password and parent reset

As Gothami,
I want to change my own password and set a new password on a parent who forgot theirs,
So that I am the recovery path and nobody needs a reset email.

**Acceptance Criteria:**

**Given** I am logged in as admin
**When** I change my own password from a simple settings field (UX-DR34)
**Then** the new `scrypt` hash is stored
**And** there is no extra recovery UI beyond this field and the already-shipped recovery-code API from Story 1.2

**Given** a parent account exists
**When** I open that parent’s record in admin (find by email is enough; no dedicated parent-recovery screens)
**Then** I can set a new password to a value I will communicate to them (FR10)
**And** that is the only parent account-recovery path in v1 — no reset email, SMS, or WhatsApp from the app
**And** the parent can log in with the new password immediately
**And** I cannot read the old or new password in clear text after save

**Given** I am a parent
**When** I call the admin password-reset or admin password-change APIs
**Then** the request is rejected with `{ error: { code, message } }`

## Epic 2: Stock the shop and browse the lists

Gothami maintains schools, grades, book master, packs, and items without a deploy. Parents (no account needed) pick school and grade, open a pack, untick titles, set quantities 1–20, and see a live goods total. Individual items are browsable. Empty catalog and discovery states exist. Add to cart is not in this epic.

### Story 2.1: Schools and grades

As Gothami,
I want to add, rename, and archive schools and grades,
So that I can name the lists parents will filter by, without a deploy.

**Acceptance Criteria:**

**Given** I am logged in as admin
**When** I open Schools and there are none
**Then** the list states it is empty and shows on-screen **Add school** (FR28, UX-DR25)
**And** Grades behaves the same with **Add grade**

**Given** I add a school or grade
**When** I save a name
**Then** `catalog` stores it; grades are unbounded admin-typed labels, not a fixed 1–13 list (FR14)
**And** I can rename it
**And** I can archive it (hide, not hard-delete)
**And** a school or grade referenced by a live pack cannot be hard-deleted (FR13); the API refuses with `{ error: { code, message } }`

**Given** I am a parent
**When** I call school or grade write APIs
**Then** the request is rejected
**And** there are no image uploads (FR26)

**Given** a form is invalid
**When** I submit
**Then** errors are inline, typed values are kept, and rules are enforced server-side (FR12)

### Story 2.2: Book master

As Gothami,
I want a reusable book master of titles and prices,
So that one edition is one record and a price correction applies everywhere at once.

**Acceptance Criteria:**

**Given** I am logged in as admin
**When** I open Book master and it is empty
**Then** I see **Add book** on that screen

**Given** I add a book
**When** I save a title and a price
**Then** the title carries the edition (FR15)
**And** the price is integer rupees in the database and JSON; the field shows a filled `Rs.` prefix and renders `Rs. 9,320` (no decimals)
**And** I can edit title and price; edits affect the catalog from now on only (FR27)
**And** I can archive a book (hidden from storefront, retained) (FR24)
**And** there is no image upload (FR26)
**And** a book has a single price on the master — this story does not add a per-pack price field (FR16)

**Given** I am a parent
**When** I call book-master write APIs
**Then** the request is rejected

### Story 2.3: Individual items

As Gothami,
I want a separate catalog of stationery and similar stock,
So that non-book items can be sold without putting them inside a pack.

**Acceptance Criteria:**

**Given** I am logged in as admin
**When** I open Items and it is empty
**Then** I see **Add item** on that screen

**Given** I add an item
**When** I save a title, description, and price
**Then** `catalog` stores it as an individual item, wholly separate from the book master (FR21, FR22)
**And** it is never part of a pack — pack compose in Story 2.4 cannot choose items
**And** price is integer rupees with the same `Rs.` input and display as books
**And** I can edit and archive items (FR24, FR27)
**And** there is no image upload (FR26)

**Given** I am a parent
**When** I call item write APIs
**Then** the request is rejected

### Story 2.4: Packs from the book master

As Gothami,
I want to name a pack for a school and grade and fill it from the book master,
So that the shop’s real product is a list of prescribed editions I can change without a deploy.

**Acceptance Criteria:**

**Given** at least one school, grade, and book exist
**When** I open Packs and it is empty
**Then** I see **Add pack** on that screen

**Given** I create a pack
**When** I save an admin-typed name, a school, a grade, a short description, and a set of books from the book master
**Then** the pack is stored with those references; it has no stored price (FR17, FR18)
**And** its displayed price is computed at read time as the sum of its books’ current prices
**And** a pack cannot override a contained book’s price (FR16)
**And** I can add and remove books on an existing pack; a new school year is a new pack (FR19)
**And** I can archive a pack: it is hidden from the storefront and not deleted (FR20)

**Given** I archive a book that belongs to a live pack
**When** the pack is read for the storefront
**Then** that book is omitted from the pack’s storefront display (FR25)
**And** existing orders are not in this epic; catalog edits do not invent order rows (FR27)

**Given** I try to put an individual item into a pack, or expose a loose-books catalog
**When** the request is handled
**Then** items cannot be pack members (FR22)
**And** books are sold inside packs only (FR23)

### Story 2.5: Browse packs and items without an account

As a parent,
I want to pick my school and grade and see live packs and individual items without signing in,
So that I can find this year’s list and learn the price without phoning the shop.

**Acceptance Criteria:**

**Given** I am not signed in
**When** I open the storefront
**Then** I land on Browse (packs) and can see schools, grades, packs, and individual items without an account (FR3)
**And** discovery is school dropdown then grade filter only — no free-text or smart search (FR29, FR30)
**And** grade options are scoped to grades that have live (non-archived) packs for the chosen school, so I cannot pick a combination with no results (FR29)

**Given** the chosen school/grade has live packs
**When** the list renders
**Then** I see pack name, description, and computed price as `Rs.` amounts
**And** archived packs, books, and items do not appear

**Given** there are no live packs yet, or the school/grade has none
**When** I look at Browse
**Then** I see `we are working on this now` with no Add action (FR35, UX-DR25)

**Given** I open the individual-items catalog
**When** it has live items
**Then** I browse them independently of any school or pack (FR36)
**And** if it is empty I see the same `we are working on this now` copy, no Add

**Given** I am signed in as a parent or not
**When** I use Browse
**Then** there is still no Add to cart in this story (FR34 is Epic 3)

### Story 2.6: Configure a pack — ticks, quantities, and live totals

As a parent,
I want every title pre-ticked so I can untick what I already own and set quantities,
So that the pack price I see is the list I will actually buy, including a locked last title so the pack cannot go empty.

**Acceptance Criteria:**

**Given** a live pack with several books
**When** I open the pack screen
**Then** every remaining (non-archived) book is shown and all titles are pre-selected (FR31)
**And** each ticked title starts at quantity 1
**And** the layout is mobile single-column with the running-total bar above the tab bar; at 760px+ the title list plus a 288px ink rail (total, per-title breakdown) (UX-DR20)
**And** ticks, quantities, and totals update without a full page reload (NFR3)
**And** the pack stays usable with a realistically long list (NFR6)

**Given** a title is ticked
**When** I untick it
**Then** it uses the unticked title-row treatment (base surface, dashed edge, strikethrough) (UX-DR9)
**And** it contributes nothing to the running pack total (FR18)
**And** per-title line totals and the running total recalculate (FR33)

**Given** only one title remains ticked
**When** I try to untick it or press minus at quantity 1
**Then** the checkbox and minus are locked
**And** the row is promoted (accent-quiet wash, 3px strong edge, full-strength control — not greyed) (UX-DR9)
**And** the locked-title notice inside the row says `Keep at least one book to add this pack.` (FR31, FR32, NFR4, UX-DR10)
**And** the same lock is enforced in `catalog` reads, not only in React (NFR11)

**Given** a ticked title
**When** I use the quantity stepper
**Then** the range is 1–20; plus disables at 20 and the cap is stated as `Item count exeeded, you can only order 20 per item` (FR32, UX-DR11)
**And** minus at quantity 1 unticks the title except on the last remaining ticked title, where it is locked
**And** both disabled ends stay 44×44 and look like controls
**And** quantity 1–20 and the locked last title are the only valid pack configuration this screen can produce; `catalog` reads enforce the same rules (NFR11)
**And** this story does not write a cart

**Given** I am on the pack screen
**When** I look for Add to cart
**Then** it is not in this story — configuring the pack is the outcome (FR34 is Epic 3)

## Epic 3: Build a cart that survives the evening

Adding anything requires login. Nimali adds a configured pack as its own line (second child = second line, labelled `Pack 2 of Grade 1`). Items merge by quantity. The cart lives on the account across devices. She can remove lines, change item quantities, and see a goods total. Empty cart is `Cart is Empty` + refresh, no Browse CTA. Checkout and Place Order wait for Epic 4.

### Story 3.1: Add a configured pack to the cart

As a parent,
I want to add the pack I just configured as one cart line, after signing in if needed,
So that the ticks and quantities I chose are saved as a clone, not a live pack that can change under me.

**Acceptance Criteria:**

**Given** I am logged in and have configured a pack (ticks and quantities)
**When** I tap Add to cart
**Then** `cart` stores a cloned pack line: pack identity + per-book included flag and quantity (1–20) + add-time titles and unit prices — not a live pack pointer (AD-4, FR34)
**And** last remaining ticked title cannot be removed; quantity cap 1–20 is enforced in `cart`, not only in React (FR31–FR32, NFR11)
**And** the Cart tab badge shows line count
**And** JSON failures use `{ error: { code, message } }`; nothing is added silently if the pack cannot be added (NFR4)

**Given** I am not logged in
**When** I tap Add to cart
**Then** the auth gate offers Log in and Create account
**And** after success I return to **the same pack**; the pack is **not** auto-added; I tap Add again (UX-DR27, FR3)

**Given** my cart already has a line for this pack
**When** I add the same pack again (same or different ticks)
**Then** a **new** cart line is created with its own ticks and quantities; lines never merge (FR39)
**And** labels follow the verbatim shape `Pack 1 of Grade 5` / `Pack 2 of Grade 5` (FR40, UX-DR13)
**And** the first line’s chip is ink fill with mustard text; a repeat line inverts to mustard fill with navy text and a strong edge (UX-DR13)

**Given** I am a parent
**When** I request another parent’s cart
**Then** the request is rejected (NFR9)

### Story 3.2: Add individual items to the same cart

As a parent,
I want to add stationery from the items catalog into the same cart as my packs,
So that one checkout can hold packs, items, or both, without a second bag.

**Acceptance Criteria:**

**Given** I am logged in
**When** I add an individual item at a quantity from 1 to 20
**Then** it becomes a cart item line on the same cart as any pack lines (FR37, FR41)
**And** adding an item already in the cart **merges** quantity on that line rather than creating a second line, and cannot exceed 20 (FR37)
**And** plus at 20 is disabled and states `Item count exeeded, you can only order 20 per item`
**And** the cap is enforced server-side (NFR11)

**Given** I am not logged in
**When** I add an item
**Then** the same auth gate as Add to cart applies; after login I return to that items surface and tap Add again (not auto-add)

**Given** a valid cart
**When** it contains only items, only packs, or a mixture
**Then** all three are allowed (FR41)
**And** items never merge with pack lines and never become pack members (FR22)

### Story 3.3: A cart that persists, totals, and can be emptied

As a parent,
I want the cart to stay on my account, show a goods total, and let me remove or adjust lines,
So that a list started on my phone is still there on a laptop, and I do not lose the second child’s pack.

**Acceptance Criteria:**

**Given** I have added packs and/or items
**When** I open Cart on another device after logging in
**Then** the same lines are there — the cart is stored against my account, not in browser storage (FR38)
**And** GET must not silently rewrite stored add-time titles or unit prices; live catalog may be annotated later at checkout (Epic 4 / FR49)

**Given** I am on Cart
**When** I look at the lines
**Then** I see a running goods total: sum of ticked pack titles (qty × unit price) plus item lines (qty × price) (FR43)
**And** amounts render as `Rs.` with comma thousands and no decimals
**And** pack lines show composition (`6 of 8 titles · atlas ×2`) (UX-DR13)

**Given** a pack cart line
**When** I adjust quantities within that cloned configuration
**Then** I may change per-title quantities in 1–20 subject to the locked-last-title rule
**And** I cannot change which titles are ticked; to do that I remove the line and add the pack again (FR42)
**And** I can remove any pack or item line (in-row danger text Remove, 44px target)
**And** item-line quantity changes merge on that line and still cannot exceed 20

**Given** the cart has no lines (never filled, or I removed the last)
**When** I open Cart
**Then** I see `Cart is Empty` and a refresh icon, with no button routing me to Browse (FR44, UX-DR25)
**And** this story does not place an order

## Epic 4: Capture the order and work the morning list

Nimali checks out (address, delivery-charge line, optional note, staleness resolved inline), places once (idempotent, short `#1042`, snapshot), sees My Orders with the vertical pipeline, and can cancel while Order Is Placed. Gothami opens one Orders screen (open and past, status filter), confirms with delivery price in the same action, marks call attempted, advances status, cancels with a reason the parent can see, and exports zip (CSV + SQLite).

### Story 4.1: Checkout — address, delivery line, note, and stale lines

As a parent,
I want to review my goods total, my address, and a clear “delivery still to be confirmed” line, and fix any stale cart lines before I can place,
So that I am not surprised later and nothing is silently repriced or substituted.

**Acceptance Criteria:**

**Given** I am logged in and my cart has at least one line
**When** I open Checkout
**Then** I must be authenticated; an unauthenticated Place is rejected (FR4)
**And** I see the goods total only — no delivery figure is calculated, estimated, or collected (FR45, FR46)
**And** the fixed line `Delivery charge: to be confirmed by the shop` is visible on an accent-quiet strip above the goods total (FR45, UX-DR23)
**And** I see the delivery address held on my account, with no per-order override (FR47)
**And** I can attach one optional free-text delivery note (FR48)
**And** money uses a filled `Rs.` prefix on any amount field and `Rs. 9,320` in totals

**Given** a cart line whose pack or item has been archived, whose constituent book has been archived or removed from its pack, or whose price has changed since add
**When** checkout compares the line to current catalog state
**Then** the line is flagged; nothing is silently substituted or silently repriced (FR49)
**And** an unavailable line is a danger notice with Remove; a repriced line is a warning notice with “Accept Rs. …” and Remove (UX-DR23)
**And** a summary danger banner states how many lines still need attention and stays until the last flag is resolved
**And** Place Order renders as the blocked primary **in place** until every flag is resolved; it does not vanish (NFR4, UX-DR12)
**And** GET annotations must not rewrite stored add-time figures; Place refuses unresolved stale flags (AD-4)
**And** blocked Place Order is announced to assistive tech (UX-DR32)

**Given** I am a parent
**When** I try to substitute a different delivery address in the Place payload
**Then** the server ignores or rejects it and uses identity’s account address (AD-4)

### Story 4.2: Place Order — snapshot, number, one tap

As a parent,
I want Place Order to create exactly one snapshotted order with a short number I can read on the phone,
So that the shop has the list I agreed, even if I double-tap or the request retries.

**Acceptance Criteria:**

**Given** checkout has no unresolved stale flags
**When** I place the order
**Then** `orders` runs one SQLite transaction: snapshot of pack names, book titles, item titles, unit prices, quantities, delivery address, and contact numbers; allocate a short sequential `public_number`; empty the cart; status `Order Is Placed` (FR50, FR51, FR53, AD-9)
**And** concurrent placements cannot receive the same number
**And** the Place request sends header `Idempotency-Key`; a repeated submission of the same checkout creates exactly one order (FR52)
**And** payment is cash on delivery; the application handles no payment (FR54)
**And** I land on My Orders with the cart empty and the short order number visible (e.g. `#1042`) (UX-DR31)

**Given** I am admin
**When** I try to create an order on a parent’s behalf
**Then** it is refused — only the parent places orders (FR55)

**Given** Place Order fails (validation, stale lines, lost session)
**When** the API responds
**Then** the body is `{ error: { code, message } }` and no half-placed order remains
**And** a lost session mid-checkout leaves the cart on the server; after login I land on packs (NFR15)

### Story 4.3: My Orders — pipeline, cancel, and reason

As a parent,
I want to see every order I placed, watch it move, cancel while it is still only placed, and see why it was cancelled,
So that I never phone the shop to ask whether the order exists or what it costs.

**Acceptance Criteria:**

**Given** I have no orders
**When** I open Orders
**Then** I see `No Orders yet.` and a refresh icon (UX-DR25)

**Given** I have orders
**When** I open My Orders
**Then** I see all of them, including Delivered and Cancelled, with the current status of each (FR68)
**And** each row uses the eight-status pill (step number, glyph, border weight, corners, then hue) (UX-DR14)
**And** I see only my own orders (NFR9)

**Given** I open an order
**When** the detail renders
**Then** I see snapshotted lines and prices, the goods total, the delivery charge once set, and the payable total (FR69)
**And** before confirmation it states that delivery is still to be confirmed by the shop (FR70)
**And** a vertical timeline shows completed / current / remaining; eight stages are not a horizontal stepper on a phone (FR71, UX-DR15)
**And** parent visibility may poll; there is no push or outbound message (AD deferred)

**Given** the order is `Order Is Placed`
**When** I cancel (terminal confirmation modal, one deep) (FR72, FR65, UX-DR24)
**Then** after confirm I stay on My Orders and the cancelled order remains visible (UX-DR31)
**And** the option disappears the moment the admin sets Order Confirmed

**Given** I cancel and Gothami confirms at the same time (T8)
**When** one write commits first
**Then** the other is rejected with an explanation of what happened
**And** a Cancelled order never carries a payable total
**And** a Confirmed order cannot be retroactively cancelled by me

**Given** Gothami cancelled the order
**When** I view it
**Then** I see Cancelled and the reason given (FR73)

### Story 4.4: Admin Orders — one list, open and past

As Gothami,
I want every order on one screen, open and past, grouped by status with counts, and a status filter,
So that the morning list is the app, not a paper notebook.

**Acceptance Criteria:**

**Given** I open `/admin`
**When** I am logged in as admin
**Then** I land on Orders: **all** orders, open and past, with a clear split between those groups (FR56, FR58)
**And** there is no separate completed-orders screen
**And** I can filter by **status only** (FR57)
**And** orders are grouped by status in pipeline order with a count per status
**And** I cannot add an order from this screen (FR55)

**Given** there are no orders, or the current filter matches none
**When** the list renders
**Then** the screen states that it is empty (UX-DR25) — not a silent blank

**Given** the list has rows
**When** I scan them
**Then** each row shows order ID, parent, lines summary, status pill, and call-state chip (UX-DR17)
**And** a row that still needs a confirmation call uses the attention treatment (strong left edge)
**And** below ~900px the row reflows to two lines without shrinking 44px targets
**And** the list is usable enough to open many times a day (NFR5)
**And** times on screen are Asia/Colombo; stored times are UTC

### Story 4.5: Confirm the order and mark the call

As Gothami,
I want the parent’s contacts, the snapshotted lines, the delivery note, a call-attempted mark, and Confirm plus delivery price as one action,
So that the one phone call sets the payable total and the order freezes.

**Acceptance Criteria:**

**Given** I open an order
**When** detail renders
**Then** I see parent name, WhatsApp, second phone if given (FR11), snapshotted delivery address, the parent’s delivery note, every line with snapshot titles/quantities/prices, and the goods total (FR59)
**And** there is no private vendor scratchpad (FR60 UX override)
**And** I cannot edit the contents of a placed order (FR66)

**Given** I have not called yet versus I called and got no answer
**When** I look at the call-state chip
**Then** `Not called yet` (dashed, hollow ring) and `Called · no answer` with timestamp (solid warning edge, filled handset) are visually distinct on edge, glyph, and wording (FR60, UX-DR16)
**And** marking call attempted records a timestamp
**And** screen readers expose call-attempted state (UX-DR32)

**Given** the order is `Order Is Placed`
**When** I set Order Confirmed and enter the delivery price in the same action
**Then** delivery price is required, non-negative, integer rupees (FR61)
**And** `payable_total_rupees` = snapshotted goods + delivery in that same transaction (FR62, AD-9)
**And** expected current status is checked; a stale confirm is rejected with an explanation (T7)
**And** if the parent already cancelled, confirm is rejected and I am told (T8)
**And** after confirm, lines, prices, delivery, address, and contacts do not change (T9)

**Given** a money field for delivery price
**When** I type
**Then** `Rs.` is a prefix block; I do not type a currency symbol (UX-DR22)

### Story 4.6: Advance, skip forward, and close the order

As Gothami,
I want to move an order through the pipeline, skip steps I have already done, and mark Delivered or Cancelled behind a confirm,
So that every order reaches a terminal state and nothing sits in the middle without a decision.

**Acceptance Criteria:**

**Given** an order at Order Confirmed or later (non-terminal)
**When** I change status
**Then** only the admin advances; stored strings are exactly `Order Is Placed`, `Order Confirmed`, `Processing`, `Packing The Order`, `Ready To Deliver`, `On Delivery Partner`, `Delivered`, `Cancelled` (T1, AD-9)
**And** an order cannot reach any status beyond Order Confirmed without passing through it (T2)
**And** forward movement among Processing … On Delivery Partner may skip intermediate steps (T3)
**And** backward movement among non-terminals is allowed but **floors at Order Confirmed** — never back to Order Is Placed (T4)
**And** every transition is validated server-side against expected current status; a stale write is rejected with an explanation, not applied silently (T7, NFR11)
**And** status changes update without a full page reload (NFR3) and do not animate on the path to the next call (NFR7, UX-DR33)

**Given** a non-terminal order
**When** I cancel
**Then** a short `cancellation_reason` is required (FR64, T6)
**And** Delivered and Cancelled are final, sit behind a confirmation modal (solid destructive confirm), and cannot be reopened (FR65, T5, UX-DR24)
**And** there is no separate paid status; cash on delivery is implied by Delivered (T10)
**And** no notification is sent when an order arrives (T11)

**Given** the parent is watching My Orders
**When** I advance or cancel
**Then** they see the new position (FR71) including Cancelled + reason (FR73)

### Story 4.7: Export the season

As Gothami,
I want one download of orders and catalog as spreadsheets plus a copy of the database file,
So that a redeploy cannot take the season with it.

**Acceptance Criteria:**

**Given** I am logged in as admin
**When** I trigger Export from the sidebar (pinned at the bottom, visually separated)
**Then** one zip downloads: CSV files of orders and catalog (openable in Excel) plus a copy of the SQLite file (FR67, AD-10)
**And** `orders` assembles the zip by calling `catalog` and its own reads — `web` does not dump tables
**And** in progress is a spinner icon only; failure copy is `Exporting Job failed try again later`; success is the file download with no extra success screen (UX-DR31)

**Given** I am a parent
**When** I call Export
**Then** the request is rejected
**And** order data remains in SQLite across process restarts; Export is the copy that does not depend on hosting (NFR10)

