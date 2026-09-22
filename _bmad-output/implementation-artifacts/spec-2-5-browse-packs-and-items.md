---
title: 'Story 2.5 — Browse packs and items without an account'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: 'aca445b1713ad059049c239d2218841d6733ccca'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Browse is an empty heading. A parent cannot see this year’s packs or individual items without an account, so the list and the price still require a phone call.

**Approach:** Anonymous reads list schools that have live packs, grades that have live packs for the chosen school, those packs (name, description, computed price), and live items on a separate page. Empty packs or items show `we are working on this now` with no Add. No add-to-cart and no pack screen.

## Boundaries & Constraints

**Always:** Public GETs under `/api/browse` from `createCatalogRouter`, no session check. `/api/admin/*` stays admin-only. Schools: non-archived, with ≥1 non-archived pack. Grades: non-archived, with ≥1 non-archived pack for that school. Packs: non-archived for that pair; `price` is the integer sum of non-archived member books (`toStorefrontPack` / `livePrice`). Items: non-archived only. JSON `{ id, name }[]` for schools and grades; `{ id, name, description, price }[]` for packs (no `books`); `{ id, title, description, price }[]` for items. `schoolId` / `gradeId` must be positive integers or `400` `invalid_input` with `field`. Unknown ids return `200` `[]`. Storefront never calls `/api/admin/*`. Display money with `formatRupees`. Tabs stay Browse / Cart / Orders / Account; Browse is active on `/` and `/items`. Packs page links **Items**; items page links **Packs**. Heading on `/` stays **Browse**. Before both selects are set, the pack area is blank. Zero schools, a pair that returns no packs, or zero live items shows `we are working on this now` and no button.

**Ask First:** A fifth tab. Pack rows that navigate. A `books` array on the list. Search. Any new dependency.

**Never:** Add to cart, ticks, quantities, the pack screen, cart, orders, auth on these reads, admin write changes, a new migration, images, free-text search, an Add button.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No packs | GET `/api/browse/schools` | `200` `[]` | N/A |
| Schools | Live pack on a live school; archived pack and archived school exist | `200` only the live school | N/A |
| Grades | GET `/api/browse/grades?schoolId=` | `200` grades with a live pack for that school | Non-integer → `400` `field: schoolId` |
| Packs | GET `/api/browse/packs?schoolId=&gradeId=` | `200` live packs; `price` excludes archived members; no `books` | Non-integer → `400` with that `field` |
| Archived pack | Same query | Omitted | N/A |
| Items | GET `/api/browse/items` | `200` live items only | N/A |
| Anonymous or parent cookie | Any browse GET | `200` same body | N/A |
| Admin catalog | GET `/api/admin/packs` with no cookie | Still `401` `unauthenticated` | N/A |

</frozen-after-approval>

## Code Map

**Reuse — do not re-derive**

- `client/storefront/src/App.tsx:19-33` -- public index `<Page title="Browse" />`. Cart, orders, account stay under `AuthGate`. Replace the index stub; add public `items`.
- `client/storefront/src/Shell.tsx:6-11` -- four destinations. Browse is `to: '/'`, `end: true`, so `/items` will not light the tab unless `isActive` treats `/items` as Browse. Do not add a destination.
- `server/catalog/http.ts:73-89,554-561` -- `requireAdmin`; `createCatalogRouter`. Add `mountBrowse` here. Do not loosen `mountPacks` (~390), `mountItems` (~486), or named (~105).
- `server/catalog/packs.ts:37-41,92-114` -- `livePrice`, `toStorefrontPack`. `listPacks` still returns archived packs and members for admin.
- `server/catalog/items.ts:29-34` -- `listItems` includes archived. Add a live-only reader; leave the admin list.
- `server/catalog/named.ts:83-97` -- `livePackReferenceCount` is not a grade dropdown. Do not filter admin `listNamed`.
- `server/db/migrations/run.ts:19-26` -- through `006`. `packs.school_id`, `grade_id`, `archived_at` already exist. No `007`.
- `client/ui/money.ts:1-4` -- `formatRupees`. `client/ui/base.css:608-647` -- `.catalog-list`, `.page-heading`, `.text-meta`.
- `server/web/io-matrix.test.ts:123-130,174-229` -- ports through **18776**. Use **18777**. `startIdentityServer`, `sidCookie`, `cookieHeader`. `{ concurrency: 1 }`.

**Change**

- `server/catalog/packs.ts` + `items.ts` -- browse queries. HTTP must not SQL.
- `server/catalog/http.ts` -- the four GETs. No `lookupSession`.
- `client/storefront/src/BrowsePage.tsx` + `ItemsPage.tsx` + `browse.ts` + `App.tsx` + `Shell.tsx` -- selects, pack rows, item rows, empty copy, tab active state.

**Read-only:** `server/identity/**`, `AuthGate.tsx`, `AccountPage.tsx`, cart/orders stubs, `client/admin/**`, migration SQL, book/pack/item/named writes.

**Tests:** `io-matrix.test.ts` describe on **18777** for every matrix row. Leave the **18776** items block intact.

## Tasks & Acceptance

**Execution:**

- [x] `server/catalog/packs.ts` + `items.ts` -- live browse queries; archived books omitted from `price` -- admin lists unchanged.
- [x] `server/catalog/http.ts` -- public GETs, no session -- admin routes still 401/403.
- [x] `client/storefront/src/BrowsePage.tsx` + `ItemsPage.tsx` + `browse.ts` + `App.tsx` + `Shell.tsx` -- school then grade, separate items page, empty copy, Browse tab active on both.
- [x] `server/web/io-matrix.test.ts` -- matrix on port 18777.

**Acceptance Criteria:**

- Given I am not signed in, when I open the storefront, then I land on Browse and can see schools, grades, packs, and items with no account, using a school dropdown then a grade filter only.
- Given the chosen pair has live packs, when the list renders, then I see name, description, and a computed `Rs.` price, and archived packs, books, and items do not appear.
- Given there are no live packs, or the chosen pair has none, when I look at Browse, then I see `we are working on this now` and no Add.
- Given I open Items, when live items exist, then I browse them with no school or pack filter; when none exist, I see the same copy and no Add.
- Given I am signed in or not, when I use Browse or Items, then there is no Add to cart and pack rows do not open a pack screen.

## Spec Change Log

## Design Notes

The grade select only lists grades with a live pack, so an empty combination is not offered. Schools with no live pack are omitted the same way. The working-on copy is for zero schools, a pair that later returns no rows, and an empty items catalog — not for “pick a school first.”

`/items` is a page reached from Browse, not a fifth tab. Ticks, quantities, and Add to cart are Story 2.6; this list does not link rows and does not send `books`.

## Verification

**Commands:**

- `npm run typecheck && npm run build`
- `node --import tsx --test server/web/io-matrix.test.ts` -- rebuild first (the suite spawns `server/dist`). **18776** stays green. **18777** covers the matrix, including a parent cookie `200` and anonymous `GET /api/admin/packs` → `401`.

**Manual checks:**

- `/` with no packs shows the empty copy and no Add. With a live pack, school then grade lists it as `Rs.` and hides an archived pack. **Items** lists live items only, or the same copy. No cart control. Browse stays active on `/items`. Signed-out and signed-in parent can open both. Cart, Orders, and Account still gate.

## Suggested Review Order

**Public reads**

- Anonymous browse mounts with no session, ahead of the admin routes.
  [`http.ts:562`](../../server/catalog/http.ts#L562)

- The catalog router exposes those GETs before the admin mounts.
  [`http.ts:611`](../../server/catalog/http.ts#L611)

**Live catalog**

- A school is listed only when a live pack sits on a live grade.
  [`packs.ts:109`](../../server/catalog/packs.ts#L109)

- Pack rows drop archived schools, grades, and packs, and price live books only.
  [`packs.ts:146`](../../server/catalog/packs.ts#L146)

- The items list is live rows only; the admin list is unchanged.
  [`items.ts:43`](../../server/catalog/items.ts#L43)

**Storefront**

- Browse is the public landing, and Items sits outside the auth gate.
  [`App.tsx:25`](../../client/storefront/src/App.tsx#L25)

- School then grade, empty copy, and Rs. prices, with no pack links.
  [`BrowsePage.tsx:108`](../../client/storefront/src/BrowsePage.tsx#L108)

- The items catalog is independent and uses the same empty copy.
  [`ItemsPage.tsx:48`](../../client/storefront/src/ItemsPage.tsx#L48)

- The Browse tab stays active on the items page.
  [`Shell.tsx:18`](../../client/storefront/src/Shell.tsx#L18)

**Tests**

- The matrix on port 18777 covers archived-only schools, archived grades, and no-store.
  [`io-matrix.test.ts:4872`](../../server/web/io-matrix.test.ts#L4872)

