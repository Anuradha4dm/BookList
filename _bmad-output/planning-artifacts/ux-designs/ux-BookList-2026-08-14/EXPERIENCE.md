---
name: BookList
description: 'How Book List works — two interfaces (parent storefront and Gothami’s admin), one commissioned order trap. Behaviour distilled from Discovery; visual identity lives in DESIGN.md (Chalk & Brass).'
status: draft
updated: 2026-08-17
design_md: ./DESIGN.md
sources:
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/prd.md
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/addendum.md
  - .memlog.md
  - .working/source-extract-prd.md
---

# Book List — Experience Spine

`DESIGN.md` owns how it looks. This file owns how it works. Token references use `{path.to.token}` against `DESIGN.md`. **Spines win on conflict** with `.working/` artifacts, and with each other by lane: later memlog decisions in this file win on behaviour where `DESIGN.md` still describes an earlier empty-state or admin-home shape.

## Foundation

Two web interfaces, one product, **responsive browser** — phone and desktop are first-class, not a stretched-phone fallback. No named UI system (not shadcn, not MUI): custom HTML on Express + static `public/`, as the addendum requires. `DESIGN.md` is the visual identity (Chalk & Brass). Light and dark are both in scope from v1; parents order in the evening (UJ-1).

- **Storefront** — mobile-first, app-like (NFR1, NFR3). Default landing is **packs** (Browse).
- **Admin** — Gothami Anuradha, sole operator, one seeded account, no staff roles. Default landing is **Orders**. Must remain usable when narrow (CM1).

Stakes: **commissioned**. English only in v1. WCAG 2.2 AA is a floor on both interfaces. No outbound email, SMS, or WhatsApp from the app in v1. No offline mode: a down connection is a wait, not a local cart.

## Information Architecture

Parent tabs on phone: **Browse / Cart / Orders / Account** (`{spacing.tabbar-h}` bar). Same four destinations become a top nav at desktop width. Cart carries a count badge. **Browse is the only surface that works without an account.** Cart, Orders, and Account ask for log in or create account first.

| Surface | Reached from | Purpose |
|---|---|---|
| Pack discovery (Browse) | App open (cold); Browse tab | School dropdown + grade filter; list live packs. Default storefront home. |
| Pack screen | Pack row | Pre-ticked titles, quantities, running total, Add to cart (NFR6). |
| Individual items | Browse (items) | Secondary catalog; never inside packs. |
| Cart | Cart tab (auth) | Pack lines (never merge) + item lines (merge by qty). Checkout entry. |
| Checkout | Cart | Address (account, no per-order override), goods total, delivery-charge line, optional delivery note, Place order. |
| My Orders | Orders tab (auth); after Place order | All of Nimali’s orders including Delivered/Cancelled. |
| Order detail | My Orders row | Lines, totals, vertical pipeline, cancel while Order Is Placed, cancel reason when Cancelled. |
| Account | Account tab (auth) | Name, delivery address, WhatsApp, optional extra phone, email, password. |
| Log in / Create account | Auth gate | Same gate for Add to cart and for Cart / Orders / Account tabs. |
| Privacy note | Storefront footer | One short note: what personal data is stored and why. No terms or refund pages in v1. |
| Admin login | Admin URL | Seeded credentials. No admin registration. **Forgot-password parked v2.** |
| Admin Orders | Admin open (cold); sidebar Orders | **One screen:** all orders, open and past, with a clear split between those groups. Status filter only in v1. |
| Admin order detail | Orders row | Parent contact, lines, parent delivery note, status actions, delivery price + confirm as one action, call-attempted, cancel + cancellation note. No private shop notepad. |
| Admin Schools | Sidebar | List / add / rename / archive. |
| Admin Grades | Sidebar | List / add. Unbounded labels, scoped to school for discovery. |
| Admin Book master | Sidebar | Shared titles + prices. |
| Admin Packs | Sidebar | Create/edit packs from book master. |
| Admin Items | Sidebar | Individual items, never in packs. |
| Admin export | Sidebar bottom, visually separated | Download orders + catalog. |

**Out of this UX (v1):** parent and admin password reset/recovery (v2); admin-created phone orders; delivery-partner login; payment UI; catalog images; free-text search; terms/refund; extra order filters beyond status.

→ Composition reference: `.working/direction-navy-mustard.html` (pack screen + an earlier admin list). Admin home in that file is **stale**: Orders is now one filterable list of all orders, not an open-only today list. Spine wins on conflict.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md` Brand & Style. Register: **warm and plain-spoken** — a helpful shopkeeper, not a system. Plain words; no jargon; no blame; no dead ends. Every refusal says what to do next (NFR4).

| Do | Don't |
|---|---|
| `Keep at least one book to add this pack.` | Silent disabled checkbox with no sentence. |
| `Item count exeeded, you can only order 20 per item` | Cap with no words; product-speak (`maxQty`). |
| `Cart is Empty` | A button pushing her to Browse. |
| `No Orders yet.` | `You haven't placed any orders!` |
| `we are working on this now` | Blank packs/items; an Add button on the storefront. |
| `Exporting Job failed try again later` | A silent failed download. |
| `Delivery charge: to be confirmed by the shop` | Inventing a fee at checkout. |
| `Pack 2 of Grade 1` | Parent-chosen nicknames on cart lines. |

Currency in every total: `Rs.` prefix, comma thousands, no decimals — `Rs. 9,320`.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Bottom tab bar item | Storefront phone | Four tabs: Browse, Cart, Orders, Account. Browse is public. Other three open the auth gate if logged out. Cart badge = line count. |
| Pack-screen title row | Pack screen | Opens with **all titles ticked**. Untick subtracts. Last remaining tick **cannot** untick; minus at qty 1 **cannot** decrement. Row stays promoted, not greyed. |
| Locked-title notice | Inside locked row | Always visible. Copy: `Keep at least one book to add this pack.` Never a toast or tooltip. |
| Quantity stepper | Pack titles; individual items | Range 1–20. Plus disables at 20 and states the cap: `Item count exeeded, you can only order 20 per item`. Both disabled ends stay 44×44 (`{spacing.touch-min}`) and look like controls, not missing. |
| Buttons | Everywhere | One primary per surface. Place Order with unresolved staleness uses the **blocked** primary in place — it does not vanish. In-row Remove is a text action, not a second primary. |
| Cart line | Cart | Repeat pack adds = **new lines**, labels `Pack 2 of Grade 1` (verbatim shape). Repeat items **merge** quantity. Changing ticks means remove line and re-add the pack. |
| Banner / notice | Checkout staleness; explanations | Staleness is **inline per line**, not a modal. Unavailable → Remove. Repriced → Accept new price. Summary banner **blocks Place Order** until every flagged line is resolved. FR45 delivery line stays visible. |
| Status pill | Orders, order detail, admin list | Eight pipeline statuses. Parent sees position as Gothami advances (FR71). |
| Vertical timeline | Parent order detail | Completed ticked, current emphasised, remaining visible but quiet. Pre-confirm: delivery still to be confirmed (FR70). Eight stages will not fit a horizontal stepper on a phone. |
| Call-state chip | Admin order row / detail | `Not called yet` and `Called · no answer` must not look identical (FR60). |
| Admin today list | Admin Orders rows | Same row component on the **merged** Orders screen. Open group and past group are both present by default; status filter hides rows, it does not change home. Gothami cannot add an order from this screen. |
| Sidebar navigation item | Admin | Orders first (home), then schools, grades, book master, packs, items. Export pinned at the bottom, separated. |
| Form field | Auth, Account, checkout note, delivery price, cancel note | Inline validation; typed value is never discarded (FR12). Money fields never accept a typed currency symbol — `Rs.` is a prefix. |
| Modal confirmation | Parent cancel; admin Delivered; admin Cancelled | Terminal actions only. One modal deep, never two. Parent cancel only while status is Order Is Placed. |
| Empty state | See State Patterns | **Not** one pattern. Parent Cart/Orders = label + refresh icon, no routing CTA. Parent packs/items = `we are working on this now`. Admin catalog = Add {entity} on the screen. Admin Orders empty = the list says it is empty. Missing URL = empty page, nothing else. This supersedes `DESIGN.md` Empty state “every empty has a primary button.” |
| Cold-start skeleton | First request after auto-sleep | Shape of the page being loaded. **No spinner, no wording** (memlog). Honour `prefers-reduced-motion` (no shimmer). `{colors.accent-quiet}` bars. This supersedes the `DESIGN.md` info-notice above the skeleton if the two disagree. |
| Auth gate | Add to cart; Cart; Orders; Account | Log in **and** Create account. After Add-to-cart login: return to **the same pack**; pack is **not** auto-added; she taps Add again. After any other login (timeout, those three tabs): **packs**. Cart remains on the server (FR38). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open / auto-sleep | Any first request | Branded skeleton of that page. No spinner, no wording. |
| In-flight load / connection down | Any subsequent page | Spinner only. No generic failed-load sentence. `[NOTE]` stuck-forever vs retry not specified. |
| Empty packs (none yet, or school/grade with none) | Browse | `we are working on this now`. No Add. Happy path assumes ≥1 pack. |
| Empty individual items | Items | Same: `we are working on this now`. |
| Empty cart | Cart | `Cart is Empty` + refresh icon. No route to Browse. **SCOPE DELTA vs FR44.** Same after Place order empties the cart. |
| Empty My Orders | Orders | `No Orders yet.` + refresh icon. |
| Missing / wrong URL | 404, gone pack, stale order link | Empty page. No message, no refresh, no back CTA. |
| Unauthenticated Add to cart | Pack screen | Auth gate. Then same pack; tap Add again. |
| Unauthenticated Cart / Orders / Account | Those tabs | Same auth gate. Success → packs (not that tab). |
| Locked last title | Pack screen | Notice: `Keep at least one book to add this pack.` |
| Quantity cap | Pack / item | Plus disabled. `Item count exeeded, you can only order 20 per item` |
| Checkout unavailable line | Checkout | Inline Remove. Banner blocks Place order. |
| Checkout repriced line | Checkout | Inline Accept new price. Banner blocks Place order. |
| Place order success | Checkout → My Orders | Lands on **My Orders**. Cart empty. Short order number on the new order. Idempotent Place (FR52). |
| Parent cancel available | Order detail | Only while Order Is Placed. After cancel, **stays on My Orders**; cancelled order remains visible. She starts again from packs when she chooses. |
| Delivery cannot be made | Admin order | Gothami calls the parent **offline**, cancels, **cancellation note** records that. Parent sees Cancelled + reason in the app (FR73). |
| Session timed out | Any authed surface | Log in again → **packs**. Cart still persisted. **SCOPE DELTA vs PRD §11** “return to cart intact” as a *landing* — the cart survives; the landing is packs. Exception: Add-to-cart gate still returns to that pack. |
| Admin catalog empty | Each of five lists | On-screen **Add school / Add grade / Add book / Add pack / Add item**. |
| Admin Orders empty | Admin Orders | Show that it is empty (not a silent blank). Supersedes the earlier blank-today-list decision. |
| Admin Orders filtered empty | Admin Orders | Same empty-is-stated treatment for the current filter. |
| Export in progress | Sidebar export | Spinner icon only. |
| Export failed | Sidebar export | `Exporting Job failed try again later` |
| Export success | Sidebar export | The file download. No extra success screen specified. |
| Form invalid | Any form | Inline, keep what they typed. |
| Parent/admin race (T8) | Confirm vs cancel | First write wins; the other actor is told what happened. `[NOTE]` exact sentence not authored. |
| Stale admin transition (T7) | Admin order | Rejected with an explanation, not applied silently. |
| No offline mode | Global | Spinner while down. Cart is server-side, not a local offline store. |

## Interaction Primitives

- **Tap / click to act.** Storefront and admin both update without full page reloads for tick, quantity, and status (NFR3). Press feedback is the 120ms flatten in `DESIGN.md` Elevation.
- **Auth gate, then resume by rule** — not a pending-intent queue. Only Add-to-cart restores the pack; everything else restores packs.
- **Filter (admin Orders)** — v1 is **status only**. Other filters are later versions. Default view is **all orders** on one page; Gothami filters when she wants to.
- **Refresh icon** — parent empty Cart and My Orders only. Not a pull-to-refresh contract; not used on 404.
- **Modal** — terminal confirmations only; stack depth 1.
- **Banned in v1:** free-text/smart search, parent cart-line nicknames, in-app messages to the parent, vendor private order notepad, routing CTAs on empty Cart/Orders, auto-add after login, mustard-as-text or mustard-as-hairline (visual, `DESIGN.md`).

## Accessibility Floor

Behavioral. Contrast lives in `DESIGN.md`.

- WCAG 2.2 AA on storefront **and** admin: 4.5:1 body text, 3:1 large text and UI boundaries, visible focus, `{spacing.touch-min}` 44×44, full keyboard operability.
- Focus is `{components.focus-indicator}` — doubled ring. Never a single-hue ring.
- `prefers-reduced-motion`: drop press travel, total count-up, skeleton shimmer, and every other transition. Motion never delays Gothami’s next call or Nimali’s Place order (NFR7).
- Status is never hue-only: number, glyph, weight band, corners, then colour (`DESIGN.md` Status pill).
- Screen reader: interactive controls expose name, role, state (ticked, locked, cap reached, call attempted). Auth gate and blocked Place Order must be announced as such.
- AA is a floor, not a ceiling.

## Responsive & Platform

| Width | Storefront | Admin |
|---|---|---|
| Phone (design origin) | Bottom tabs. Single column. Pack running-total bar sits above the tab bar. | Same tokens; sidebar must still work. Unpleasant admin sends Gothami back to her phone (CM1). |
| `{spacing.storefront-max}` (760px) and up | Tabs become top nav. Pack screen: list + `{spacing.pack-rail-w}` ink rail (total, breakdown, Add). Content cap 760px. | — |
| ~900px and up | — | `{spacing.admin-sidebar-w}` persistent sidebar + main. Order rows five columns. |
| Below ~900px | — | Order row reflows to two lines (see `DESIGN.md` Admin today list). |

Not a native app. Not a PWA in this UX. Desktop browser is a first-class target for both interfaces.

## Auth, session, and v2 parking

**v1 storefront session**

| Event | After success |
|---|---|
| Add to cart while logged out | Same pack page; tap Add again. Create account is offered on the gate. |
| Cart / Orders / Account while logged out | Packs. |
| Login after timeout | Packs. Cart still on the server. |

**Parked for v2 (do not build in this UX):** parent password reset (email or WhatsApp); admin recovery code (FR74); admin resetting a parent from a parent record (FR10). Reopens “no outbound messages in v1” when it returns.

**Logged-in password** sits on parent Account as a field. Admin password-change while already in (FR9) was not elicited — `[NOTE FOR UX]`.

## Notes on an order

Two writings only:

1. **Delivery note** — parent types it at checkout. Gothami reads it; she does not write an in-app note back to the parent. She informs the parent by **phone**.
2. **Cancellation note** — required when the order is cancelled (including “delivery cannot be made”). Shown to the parent with Cancelled (FR73).

**SCOPE DELTA vs FR60:** no private vendor scratchpad on the order.

## Inspiration & Anti-patterns

- **Kept from the PRD:** order trap not bookstore; packs as the main job; per-title customisation; the confirmation call stays a real phone call.
- **Rejected visually (Discovery):** warm-shopfront, crisp-utility, editorial-calm; Satchel Standard, Cool Ledger, Evening Parchment. Chalk & Brass + navy-mustard won.
- **Rejected in behaviour:** parent nicknames on cart lines; empty Cart routing to discovery (FR44 override); private admin notes; a separate completed-orders screen (FR58 override); auto-add after login; forgot-password in v1.

## Key Flows

Requirement names from the PRD are kept verbatim: **UJ-1**, **UJ-2**.

### Flow 1 — UJ-1 Nimali orders for two children (phone, evening)

1. Nimali opens Book List. She lands on **packs** (Browse). If the shop has no packs yet she sees `we are working on this now`.
2. She may browse with no account. She picks school, filters to the elder child’s grade, opens the pack. Every title is ticked.
3. She unticks two owned titles; bumps atlas to 2. If she tries to drop the last title she is told `Keep at least one book to add this pack.` If she tries 21 copies: `Item count exeeded, you can only order 20 per item`.
4. She taps Add to cart. **Not logged in** → log in or create account → **same pack** → she taps Add again. Cart line: a pack labelled in the `Pack 2 of Grade 1` shape (first child is Pack 1 of that grade).
5. She switches grade, adds the younger child’s pack as a **separate** line. Adds pens from items.
6. Cart tab (now authed). Checkout: goods total; `Delivery charge: to be confirmed by the shop`; account address; she types a delivery note (“after five”). If a line went unavailable or repriced, she resolves it inline; Place order stays blocked until she does.
7. She places the order.
8. **Climax:** she is on **My Orders**, cart empty, short order number in the list. She can open the order and see the vertical timeline at Order Is Placed, delivery still to be confirmed.

Failure: session dies on checkout → she logs in and lands on **packs**; cart is still there under Cart. Failure: Place order double-tap → one order (FR52). Failure: cold start on open → skeleton, then packs.

### Flow 2 — UJ-2 Gothami’s daily pass (admin, morning tea)

1. Gothami Anuradha opens admin. She lands on **Orders**: **all** orders, open and past on one page, clearly separated. She filters by **status** only if she wants to.
2. She reads the morning: awaiting confirmation, ready to deliver, on the partner — from the list and its groups, not from a second screen.
3. She opens an order: parent name, WhatsApp, every selected line, the parent’s delivery note. She calls the parent on a real phone.
4. No answer → marks call attempted (chip must not match “not called”). She moves on.
5. Three agree → she types delivery price and sets **Order Confirmed in the same action** (FR61).
6. She packs and advances status as she goes (forward steps 3–6 may skip).
7. Partner reports drop-off → she marks Delivered (confirm modal). If she cannot deliver: she calls the parent, cancels, writes the cancellation note.
8. **Climax:** the list no longer owes her a paper note. Confirmed totals are on the order; Nimali can see pipeline movement on My Orders. Nothing for this morning is only in Gothami’s head.

Failure: Nimali already cancelled (T8) → confirm is rejected and Gothami is told. Failure: export → spinner, or `Exporting Job failed try again later`. Failure: empty catalog on first setup → Add school / grade / book / pack / item on those lists. Failure: no orders at all → the Orders screen **says** it is empty.

### Flow 3 — Nimali cancels before confirm

1. On My Orders she opens the order still at Order Is Placed.
2. She cancels (modal). After confirm she **stays on My Orders** and sees it Cancelled.
3. **Climax:** she can start again from packs when she chooses; the cancelled order is still in the list so the night is not a blank slate.

Failure: Gothami confirms first → cancel is rejected and Nimali is told (T8).

## Open items (not invented)

| Item | Status |
|---|---|
| Parent + admin password reset / recovery | Parked **v2** |
| Admin password change while logged in (FR9) | Not elicited |
| Status-filter control (select vs chips vs list) | SILENT — behaviour is “filter by status,” not the widget |
| How open vs past are visually split, beyond “clear separation” | Visual → `DESIGN.md` when mocked |
| Exact T7/T8 explanation sentences | SILENT |
| Spinner if a page never returns | SILENT |
| `Item count exeeded` spelling | Captured verbatim; polish only if asked |
| `DESIGN.md` Empty state / cold-start notice vs this spine | This spine wins on those behaviours |
| Key-screen HTML mocks | Not promoted yet; still `.working/` directions + colour themes |
