---
title: 'Story 2.6 — Configure a pack: ticks, quantities, and live totals'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '9df5a9be88e042adc3400b02567c5790615e5a65'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Browse lists a pack name and a total but cannot open it. A parent cannot drop the titles she already owns, cannot ask for two atlases, and cannot see what the list will actually cost her.

**Approach:** Pack rows link to a public pack screen. One catalog read, `GET /api/browse/packs/:id`, returns the live member books plus a priced configuration; a `selection` on that read is validated and priced server-side. The screen recomputes ticks and totals locally for instant feedback. No cart is written.

## Boundaries & Constraints

**Always:** `GET /api/browse/packs/:id` is public, lives in `mountBrowse`, sets `Cache-Control: no-store`, and never looks up a session. Body: `{ id, name, description, books: [{ id, title, price }], lines: [{ bookId, title, unitPrice, quantity, lineTotal }], total }` — `books` is every non-archived member ordered by id, `lines` is the ticked configuration, `total` is the sum of `lineTotal`, money is integer rupees. No `selection` means every live book ticked at quantity 1. A `selection` of `bookId:qty` pairs is validated in `server/catalog/packs.ts`, not in HTTP: integer quantity 1–20, every `bookId` a live member, no duplicates, at least one pair. Failures are `400` `invalid_input` with a `field`. React mirrors the same rules: all live titles pre-ticked at 1; the last remaining ticked title has both checkbox and minus locked; minus at quantity 1 unticks any other title; plus disabled at 20. Cap copy verbatim: `Item count exeeded, you can only order 20 per item`. Locked-title copy verbatim, inside the row, never a toast: `Keep at least one book to add this pack.` Disabled stepper ends stay 44×44 and keep control styling; the locked row is promoted (`accent-quiet` wash, 3px `border-strong`, full-strength checkbox), never greyed; the unticked row drops to `surface-base` with a 2px dashed edge and a struck-through title. Mobile is single-column with the running-total bar above the tab bar; at 760px+ it is the list plus a 288px ink rail carrying total and per-title breakdown. Money renders through `formatRupees`. Ticks and quantities never cause a page reload or a per-change fetch. Browse stays the active tab on `/packs/:id`.

**Ask First:** A migration or any new DB column. A fifth tab. Archived books in `books`. Sending a `selection` on every tick. Any new dependency.

**Never:** Add to cart, any cart or order write, an Add button on this screen, a stored pack price, auth on this read, changes to `/api/admin/*`, images, free-text search, client-side test tooling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default configuration | `GET /api/browse/packs/:id`, live pack, 3 live books | `200`; `books` all three; `lines` all three at `quantity: 1`; `total` = sum of prices | N/A |
| Archived member | Pack has one archived book | Absent from `books`, `lines`, and `total` | N/A |
| Valid selection | `?selection=3:2,7:1` | `200`; `lines` only those two, `lineTotal` = `unitPrice × quantity`; `books` still all live members | N/A |
| Cap exceeded | `?selection=3:21` | — | `400` `invalid_input`, `field: quantity`, message `Item count exeeded, you can only order 20 per item` |
| Zero ticked | `?selection=` | — | `400` `invalid_input`, `field: selection`, message `Keep at least one book to add this pack.` |
| Below range, malformed, duplicate, or not a live member | `?selection=3:0` / `abc` / `3:1,3:2` / `<archived book>:1` | — | `400` `invalid_input`, `field: quantity` for the range case, else `field: selection` |
| Archived, unknown, or non-integer pack | `/api/browse/packs/9999`, archived pack, archived school or grade, `/abc` | — | `404` `not_found`; screen renders blank |
| Pack with no live books | Every member archived | `200`, `books: []`, `lines: []`, `total: 0`; screen shows `we are working on this now`, no controls | N/A |
| Anonymous or parent cookie | Either | `200`, identical body | N/A |
| Admin catalog unaffected | `GET /api/admin/packs`, no cookie | Still `401` `unauthenticated` | N/A |

</frozen-after-approval>

## Code Map

**Reuse — do not re-derive**

- `server/catalog/packs.ts:37-41,60-71,92-95` -- `livePrice`, `booksForPack` (already orders by `books.id`), `toStorefrontPack`. `getPack:176-184` returns archived members — do not reuse it here. Copy the archived school/grade joins from `listBrowsePacks:146-174`.
- `server/catalog/http.ts:57-67,69-79,100-105,562-609,611-620` -- `sendError` (emits `{ error: { code, message, field? } }`), `safe`, `parseId`, `mountBrowse`, and the router that mounts browse first. Do not import `lookupSession` or `requireAdmin` into this handler.
- `server/catalog/validation.ts:1-6` -- `Validated<T>` / `FieldError` is the validator's return shape. No range helper exists yet.
- `client/storefront/src/browse.ts:6-11,28-30` -- `BrowsePack`, `browsePacksPath`. Keep the path-builder-only convention; there is no fetch wrapper.
- `client/storefront/src/BrowsePage.tsx:23-38,170-179` -- the `AbortController` fetch pattern to copy, and the inert `catalog-row` pack list that must become links.
- `client/storefront/src/Shell.tsx:18-21` -- `browseActive` special-cases `/items`; extend it. Do not add a destination.
- `client/storefront/src/App.tsx:24-33` -- public routes sit outside `AuthGate`; `path="*"` renders `BlankPage`, the precedent for a blank 404. No `:id` route exists yet.
- `client/ui/money.ts:1-4` -- `formatRupees`. `client/ui/tokens.css:113-121` -- `--space-touch-min`, `--space-control-h`, `--space-tabbar-h`, `--space-pack-rail-w` (288px, unused so far), `--space-storefront-max`.
- `client/ui/base.css:319-343,345-371,728-745` -- the tab bar is fixed at 56px + safe-area and the footer already does that clearance math (copy it for the total bar); the single `@media (min-width: 760px)` block is where the rail belongs; reduced motion is handled globally.
- `server/web/io-matrix.test.ts:120-139,146-237` -- ports run to **18777**; use **18778**. Reuse `startIdentityServer`, `stopChild`, `sidCookie`, `cookieHeader`, `{ concurrency: 1 }`.

**Change**

- `server/catalog/packs.ts` -- live-only single-pack reader + selection validator/pricer. All SQL stays here.
- `server/catalog/http.ts` -- one public GET inside `mountBrowse`.
- `client/storefront/src/PackPage.tsx` (new), `browse.ts`, `App.tsx`, `Shell.tsx`, `BrowsePage.tsx`.
- `client/ui/base.css` -- pack title row and its two variants, checkbox, stepper, in-row notice, mobile total bar, desktop rail.

**Read-only:** `server/identity/**`, `server/db/migrations/**` (no `007`), admin catalog writes (`mountPacks:398-475`, `mountItems:494-560`), `client/admin/**`, `AuthGate.tsx`, `AccountPage.tsx`, `ItemsPage.tsx`, cart and orders stubs.

**Tests:** new describe on **18778** covering every matrix row. Leave the **18777** browse block intact.

## Tasks & Acceptance

**Execution:**

- [x] `server/catalog/packs.ts` -- live-only pack reader (archived pack, school, grade, or member excluded) plus a selection validator that prices `lines` and `total` -- keeps the rules in the module so Epic 3's cart add reuses them.
- [x] `server/catalog/http.ts` -- `GET /browse/packs/:id` in `mountBrowse`, parsing `selection`, mapping validator failures to `400` and missing packs to `404` -- public read, admin routes untouched.
- [x] `client/storefront/src/browse.ts` -- detail types and `browsePackPath` -- one place builds the URL.
- [x] `client/storefront/src/PackPage.tsx` -- the screen: pre-ticked rows, checkbox, 1–20 stepper, line totals, running total, locked-last-title row and notice, cap notice, empty and 404 handling -- the story's user-facing outcome.
- [x] `client/storefront/src/App.tsx` + `Shell.tsx` + `BrowsePage.tsx` -- public `packs/:id` route, Browse active there, pack rows become links -- the screen is reachable.
- [x] `client/ui/base.css` -- pack row and variants, checkbox, stepper with disabled ends, in-row notice, total bar above the tab bar, 288px rail at 760px+ -- existing tokens only, no new hues.
- [x] `server/web/io-matrix.test.ts` -- describe on port 18778 for every matrix row.

**Acceptance Criteria:**

- Given a live pack with several books, when I open it from Browse without an account, then every remaining title is listed pre-ticked at quantity 1 with per-title line totals and a running total, and there is no Add to cart.
- Given I change ticks or quantities, when the totals update, then they update in place with no page reload and no per-change request, and a realistically long list stays responsive.
- Given only one title is still ticked, when I try to untick it or press minus at quantity 1, then both controls are locked, the row is promoted rather than greyed, and the notice inside the row explains why.
- Given a phone, when I view the screen, then it is one column with the running-total bar above the tab bar; at 760px+ it is the title list plus a 288px ink rail carrying total and breakdown.
- Given a configuration React would not allow, when it reaches the catalog read directly, then the server refuses it with a field-scoped `400` and the verbatim copy — the rules do not depend on the client.

## Spec Change Log

## Design Notes

The read carries both `books` and `lines` deliberately: `books` lets the screen render unticked rows, which have no line, and `lines` is the server's priced answer. The screen fetches once with no `selection` and then recomputes locally — it holds every unit price, so a round trip per tick buys nothing and costs NFR3/NFR6. The `selection` branch is the NFR11 enforcement surface and the seam Epic 3's cart add will validate against; it is exercised by the io-matrix tests, not by the screen.

```
GET /api/browse/packs/4?selection=3:2,7:1
→ 200 { id: 4, name: 'Grade 5', description: '…',
        books: [{ id: 3, … }, { id: 7, … }, { id: 9, … }],
        lines: [{ bookId: 3, title: 'Atlas', unitPrice: 2250, quantity: 2, lineTotal: 4500 },
                { bookId: 7, title: 'Maths', unitPrice: 900, quantity: 1, lineTotal: 900 }],
        total: 5400 }
```

A pack whose every member is archived has no valid configuration, so it shows the empty copy rather than a locked row that cannot be satisfied.

## Verification

**Commands:**

- `npm run typecheck && npm run build`
- `node --import tsx --test server/web/io-matrix.test.ts` -- rebuild first (the suite spawns `server/dist`). **18777** stays green; **18778** covers every matrix row, including a parent cookie returning the same body and anonymous `GET /api/admin/packs` still `401`.

**Manual checks:**

- Open a pack from Browse: all titles ticked at 1, line totals and running total correct, archived member absent. Untick one — dashed, struck through, total drops. Untick to one — checkbox and minus lock, row promoted, notice inside it. Step to 20 — plus disables, cap sentence shows, both disabled ends stay 44×44. No Add to cart. Phone: total bar above the tab bar; 760px+: rail with total and breakdown. Browse stays lit. Light and dark legible; reduced motion drops transitions. `/packs/9999` is blank. Cart, Orders, and Account still gate.

## Suggested Review Order

**The configuration rules**

- Start here: the pure rules both the screen and the tests call, so neither owns them.
  [`packConfig.ts:32`](../../client/storefront/src/packConfig.ts#L32)

- Minus at 1 unticks — except on the last ticked title, where it holds.
  [`packConfig.ts:40`](../../client/storefront/src/packConfig.ts#L40)

- The cap is a guard on increment, not a clamp after the fact.
  [`packConfig.ts:50`](../../client/storefront/src/packConfig.ts#L50)

- Exactly one ticked line is what makes a row locked.
  [`packConfig.ts:71`](../../client/storefront/src/packConfig.ts#L71)

**Server enforcement**

- The same rules server-side: parses and prices a selection, refusing anything else.
  [`packs.ts:267`](../../server/catalog/packs.ts#L267)

- Pair-by-pair validation; a non-string selection is refused, never defaulted.
  [`packs.ts:234`](../../server/catalog/packs.ts#L234)

- Live pack, live school, live grade, live members — archived rows never reach the storefront.
  [`packs.ts:216`](../../server/catalog/packs.ts#L216)

- Public read with no session lookup and no SQL; 404 for anything missing.
  [`http.ts:605`](../../server/catalog/http.ts#L605)

**The screen**

- One fetch on mount, then every recalculation is local — no round trip per tick.
  [`PackPage.tsx:46`](../../client/storefront/src/PackPage.tsx#L46)

- Three row states driven by ticked and locked, never by hue alone.
  [`PackPage.tsx:104`](../../client/storefront/src/PackPage.tsx#L104)

- Disabled ends stay real controls and point at the notice explaining why.
  [`PackPage.tsx:125`](../../client/storefront/src/PackPage.tsx#L125)

- The total is a live region, so the recalculation is heard as well as seen.
  [`PackPage.tsx:166`](../../client/storefront/src/PackPage.tsx#L166)

**Reaching it**

- Public route outside the auth gate, matching Browse and Items.
  [`App.tsx:28`](../../client/storefront/src/App.tsx#L28)

- Browse stays the active tab on a pack screen; now exported, so it is testable.
  [`Shell.tsx:18`](../../client/storefront/src/Shell.tsx#L18)

- Pack rows became links through the shared path builder.
  [`BrowsePage.tsx:175`](../../client/storefront/src/BrowsePage.tsx#L175)

- One place builds each URL, API and route alike.
  [`browse.ts:55`](../../client/storefront/src/browse.ts#L55)

**Chalk & Brass**

- Ink chrome on the mobile bar and the desktop rail; layout is the only difference.
  [`base.css:523`](../../client/ui/base.css#L523)

- Drawn checkbox, so the tick is navy on mustard rather than the banned white.
  [`base.css:400`](../../client/ui/base.css#L400)

- Stepper frame stays continuous without clipping the focus ring.
  [`base.css:453`](../../client/ui/base.css#L453)

- The notice is raised and strong-edged, so it reads on the locked row's own wash.
  [`base.css:513`](../../client/ui/base.css#L513)

- Promotion, not greying: accent wash and a thick strong edge.
  [`base.css:380`](../../client/ui/base.css#L380)

**Tests**

- The matrix on port 18778, including the repeated-parameter case.
  [`io-matrix.test.ts:5394`](../../server/web/io-matrix.test.ts#L5394)

- Executing assertions on the rules — this fails if the cap or the arithmetic breaks.
  [`io-matrix.test.ts:5751`](../../server/web/io-matrix.test.ts#L5751)
