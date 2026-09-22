# Epic 2 Context: Stock the shop and browse the lists

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Gothami can maintain schools, grades, the book master, packs, and individual items without a deploy. Parents (no account required) pick school and grade, open a pack, untick titles they already own, set quantities 1–20, and see a live goods total; individual items are browsable separately. Empty catalog and discovery states are defined. Add to cart is out of scope — that is Epic 3.

## Stories

- Story 2.1: Schools and grades
- Story 2.2: Book master
- Story 2.3: Individual items
- Story 2.4: Packs from the book master
- Story 2.5: Browse packs and items without an account
- Story 2.6: Configure a pack — ticks, quantities, and live totals

## Requirements & Constraints

- Admin alone writes catalog entities; parent write APIs are rejected. Archive hides from the storefront; do not hard-delete a school or grade referenced by a live pack (API refuses with `{ error: { code, message } }`).
- Grades are unbounded admin-typed labels, not a fixed 1–13 list. No catalog image uploads in v1.
- Book master: one record per edition (title carries edition) and one integer-rupee price shared across every pack that uses it. Packs cannot override a contained book’s price. Edits affect the storefront from now on only — they do not invent or rewrite order rows.
- Pack: admin-typed name, school, grade, short description, and books chosen from the book master. No stored pack price; displayed price is the sum of current book prices at read time. New school year = new pack. Archiving a book omits it from live pack storefront display.
- Individual items (title, description, price) are a separate catalog; never pack members. Books are sold inside packs only — no loose-books catalog.
- Browse is anonymous: school dropdown, then grade filter scoped to grades that have live packs for that school. No free-text or smart search. Items browse independently of school/pack.
- Pack screen: all remaining books pre-ticked at qty 1; untick drops contribution to the running total; last remaining ticked title is locked (checkbox and minus at 1); quantity stepper 1–20 with plus disabled at 20. Per-title line totals and running total recalculate live. Same quantity and locked-last-title rules must hold in `catalog` reads, not only in React. Invalid forms keep typed values and show inline errors; rules are enforced server-side.
- Empty states: admin lists show on-screen **Add school / grade / book / pack / item**. Parent packs or items empty (or school/grade with no live packs) show `we are working on this now` with no Add. Money always `Rs.` prefix, comma thousands, no decimals (`Rs. 9,320`); DB and JSON store integer rupees. Cap copy (verbatim): `Item count exeeded, you can only order 20 per item`. Locked-title notice (verbatim, inside the row): `Keep at least one book to add this pack.`

## Technical Decisions

- Domain ownership: the `catalog` module owns schools, grades, book master, packs, and items. Build order is identity → catalog → cart → orders; this epic ships catalog behaviour and the React screens for that slice.
- Pack displayed price is computed at read time and never stored. Cart cloning and Place Order snapshots are later epics; catalog edits must not invent order or cart rows here.
- Two Vite React clients (`storefront`, `admin`) call one JSON API; Browse catalog may be anonymous; admin catalog writes require an admin session. EXPERIENCE.md wins over DESIGN.md on empty-state and cold-start behaviour.
- API errors use `{ error: { code, message } }`. Authz is enforced in the module, not only in the page.

## UX & Interaction Patterns

- Storefront default landing is Browse (packs). Browse is the only surface that works without an account. Parent phone tabs: Browse / Cart / Orders / Account; at 760px+ tabs become top nav.
- Pack screen: mobile single-column with the running-total bar above the tab bar; at 760px+ title list plus a 288px ink rail (total, per-title breakdown). Ticks, quantities, and totals update without full page reload; long lists must stay usable.
- Unticked title row: base surface, dashed edge, strikethrough. Locked last title: promoted (accent-quiet wash, 3px strong edge, full-strength control — not greyed); notice stays inside the row, never a toast. Disabled stepper ends stay 44×44 and still look like controls.
- Visual system is Chalk & Brass (tokens in DESIGN.md): mustard fill-only for primary actions/ticks; currency and amount typography as above. Light and dark both in scope; honour `prefers-reduced-motion`.

## Cross-Story Dependencies

- 2.1 → 2.4 (packs need school and grade). 2.2 → 2.4 (packs compose from book master). 2.3 is independent of packs but shares price/archive patterns with 2.2.
- 2.4 → 2.5 / 2.6 (live packs for discovery and configuration). 2.5 and 2.6 share anonymous catalog reads; 2.6 does not write a cart.
- Depends on Epic 1 for admin session and app shell. Epic 3 consumes the configured pack (ticks + quantities) for Add to cart — do not ship Add to cart in this epic.
