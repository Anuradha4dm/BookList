# Epic 2 Context: Stock the shop and browse the lists

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The vendor maintains schools, grades, a shared book master, packs, and a separate items catalog himself, without a deploy. Parents — no account needed — pick school then grade, open a pack with every title pre-ticked, drop what they already own, set quantities 1–20, and watch a live goods total. Individual stationery is browsable on its own. Empty catalog and discovery states exist. Add to cart is not in this epic.

## Stories

- Story 2.1: Schools and grades
- Story 2.2: Book master
- Story 2.3: Individual items
- Story 2.4: Packs from the book master
- Story 2.5: Browse packs and items without an account
- Story 2.6: Configure a pack — ticks, quantities, and live totals

## Requirements & Constraints

**Catalog ownership.** Admin can add, rename, archive, and edit schools, grades, books, packs, and items. Archive hides from the storefront and retains the record; it is not a hard-delete. A school or grade referenced by a live pack cannot be hard-deleted — refuse with `{ error: { code, message } }`. Grades are unbounded admin-typed labels, not a fixed 1–13 list. No catalog image uploads.

**Book master vs items vs packs.** A book is title (edition lives in the title) plus one integer-rupee price. The same book record is shared across every pack that uses it; a pack cannot override that price, so a correction applies everywhere at once. A pack has an admin-typed name, a school, a grade, a short description, and books chosen from the master. Packs have no stored price — displayed price is the sum of current book prices at read time, and falls as titles are unticked (a preview, not a surviving discount). A new school year is a new pack; there is no academic-year versioning. Individual items (title, description, price) are a wholly separate catalog for stationery and similar stock. Items are never pack members. Books are sold inside packs only — there is no loose-books catalog. Wanting a single title means opening a pack and unticking everything else; the locked last title guarantees one remains.

**Archive and edit effects.** Archiving a pack hides it from Browse. Archiving a book that belongs to a live pack omits that book from the pack’s storefront display. Catalog edits affect the storefront and future orders only; this epic does not invent order rows. Cart staleness for archived/removed/repriced lines is a later epic.

**Discovery.** Anyone may browse schools, grades, packs, and items without an account. Adding to a cart is later and requires login. Discovery is school dropdown then grade filter only — no free-text or smart search. Grade options are scoped to grades that actually have live (non-archived) packs for the chosen school, so the parent cannot pick a combination with no results. Items are browsed independently of any school or pack. A school/grade with no live packs, or an empty items catalog, shows `we are working on this now` with no Add action.

**Pack configuration.** Opening a pack shows every remaining (non-archived) book, all pre-selected, each at quantity 1. Unticked titles contribute nothing. Line totals and the pack total recalculate live. Last remaining ticked title: checkbox and minus-at-1 are locked; tick another before dropping it. Quantity 1–20; plus disables at 20 with the cap stated; minus at 1 unticks except on that last title. Those two rules are the only valid configuration this screen can produce. Never silently refuse — say why and what to do next. The list must stay usable when long.

**Admin empty lists.** Each of the five catalog lists states it is empty and shows on-screen Add school / grade / book / pack / item. Forms validate server-side as well as in the UI, report inline, and keep typed values. Parent catalog writes are rejected. Money is integer rupees in data, rendered `Rs.` with comma thousands and no decimals. Storefront is mobile-first. English only.

## Technical Decisions

This epic ships `catalog` tryable, with its React screens, before `cart` starts. Domain writes live in `catalog`; storefront and admin are doors. Identity already owns sessions: Browse may be anonymous; catalog writes require an admin session. Authz is enforced in the module, not the page.

Data shape: School and Grade each have many Packs. Book and Pack join through PackBook. Item is a sibling of Book, not a pack member. Integer primary keys. SQL `snake_case`; JSON `camelCase`. Money: integer rupees in DB and JSON (`9320`).

Pack displayed price is computed at read time and never stored. Locked last title and quantity 1–20 are enforced in `catalog` reads, not only in React. Archive/price edits change storefront reads immediately; they must not silently rewrite figures a later cart clone will capture. Failures are always `{ error: { code, message } }`. Same-origin `/api/*`, `credentials: include`, success bodies camelCase.

Do not write cart or order tables here.

## UX & Interaction Patterns

**Admin catalog.** Sidebar already lists schools, grades, book master, packs, items. Money fields use a filled `Rs.` prefix block; never type the symbol. One primary per surface. Voice: warm shopkeeper; keep EXPERIENCE strings including `Item count exeeded, you can only order 20 per item`.

**Browse.** Default storefront landing. School dropdown then grade filter; list live packs with name, description, and computed `Rs.` price. Items is a secondary catalog, never inside packs. No search.

**Empty states (EXPERIENCE wins).** Parent packs/items: `we are working on this now`, no Add. Admin catalog: on-screen Add {entity}. No routing CTA on parent discovery empties.

**Pack screen.** Mobile: single column; running-total bar sits above the tab bar and never scrolls away. At 760px+: title list plus a fixed 288px ink rail (running total, per-title breakdown). Storefront content capped at 760px. No Add to cart in this epic.

**Title row.** Ticked: raised, solid edge, mustard checkbox with navy tick. Unticked: base surface, dashed edge, 2px strikethrough title. Locked last title: promoted accent-quiet wash, 3px strong edge, checkbox stays full-strength while disabled — never greyed. Locked-title notice lives inside the locked row, bordered, padlock glyph, verbatim `Keep at least one book to add this pack.` Never a toast or tooltip. Same shell carries the quantity-cap explanation.

**Stepper.** 44×44 minus/plus, accent-quiet readout. Disabled ends stay 44×44 and look like controls. Screen readers expose ticked, locked, and cap-reached. Totals may count up except under `prefers-reduced-motion`.

## Cross-Story Dependencies

- Schools, grades, and the book master must exist before a pack can be composed; items stay off that compose path.
- Packs must exist before anonymous Browse can list live packs or scope grades to the chosen school.
- Pack configuration (ticks, quantities, live totals) depends on a live pack with books; it does not write a cart.
- Add-to-cart, cloned pack lines, item merge, and the Add-to-cart auth gate that returns to the same pack wait for the next epic.
- Catalog edits that later flag stale cart lines at checkout are prepared here (archive/remove/reprice on live reads) but not consumed until Place Order.
