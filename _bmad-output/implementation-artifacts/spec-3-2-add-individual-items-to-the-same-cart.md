---
title: 'Add individual items to the same cart'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_commit: '0d56dd1cfc8ac920f768f80e7b37c91f5c1aeb67'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A parent can put a configured pack in the cart, but stationery from the items list cannot join it.

**Approach:** A signed-in parent adds one live item at a quantity from 1 to 20. The first add stores a cloned item line (item id, quantity, add-time title, add-time unit price) on the same account cart as pack lines. Adding that item again adds to the same line and still cannot pass 20. Signed out, Add offers Log in and Create account on the items screen and does not add until Add is tapped again.

## Boundaries & Constraints

**Always:** One line per parent per item. A repeat add increases that line’s quantity. It never creates a second item line and never becomes a pack member. Pack adds stay clones. Store title and unit price on the first insert and do not rewrite them on merge or on `GET`. Reject a quantity outside 1–20, a non-integer, or a merge that would exceed 20, and leave the stored row unchanged. Call catalog for the live item; `cart` does not query `items`. Session parent only. Errors are `{ error: { code, message } }`. Cap copy is `Item count exeeded, you can only order 20 per item`. Plus at 20 is disabled. A cart may hold only packs, only items, or both. The Cart badge counts pack lines and item lines together.

**Ask First:** A new runtime dependency. Changing `AuthGate`'s `navigate('/')` for Cart, Orders, and Account. Editing migrations `001`–`007`.

**Never:** Goods total, in-cart steppers, Remove, or `Cart is Empty` (story 3.3). Checkout or live repricing. Browser storage as the cart. Rewriting pack-line clone behavior. Auto-add after login.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First item | Parent cookie. Live item. Quantity 1–20. | `201`. One item line: that quantity, add-time title, add-time unit price. `GET /api/cart` includes it with `kind: 'item'` beside any `kind: 'pack'` lines. | N/A |
| Merge | That line already has quantity 15. Add 3. | Same line, quantity 18. Title and unit price unchanged. Still one item line. | N/A |
| Over cap | Stored 15, add 6; or a lone quantity of 0, 21, or not an integer. | Stored quantity unchanged. No new row. | `400` `invalid_input` and `Item count exeeded, you can only order 20 per item`. |
| Not addable | Unknown id or archived item. | No new row. Existing line, if any, unchanged. | `404` `not_found`. |
| Signed out | No cookie, or a stale one. | No write. | `401` `unauthenticated`, `Sign in to continue.` |
| Not a parent | Admin cookie. | No write. | `403` `forbidden`. |
| Other parent | Parent B lists the cart after A added an item. | B does not see A’s item line. | N/A |
| Mixture | A has a pack line and an item line, or only items. | Both shapes are listed. The item is not a pack member. | N/A |
| Signed-out tap | Add on `/items` while signed out. | Log in and Create account on that screen. After success, same items page. No line until Add is tapped again. | N/A |

</frozen-after-approval>

## Code Map

- `server/cart/http.ts` `createCartRouter` ~66, `requireParent` ~39, `POST /cart/packs` ~70, `GET /cart` ~99 — pack-only today. Add the item route beside the pack route. `GET` must return both kinds.
- `server/cart/packs.ts` `addConfiguredPack` ~124, `listCartPackLines` ~194 — clone path. Do not merge packs. List reads `cart_pack_lines` only.
- `server/db/migrations/run.ts` `MIGRATIONS` ~19 — head is `007_cart_pack_lines.sql`. Append `008` only.
- `server/catalog/items.ts` `listBrowseItems` ~43, `getItem` ~57 — live rows hide `archived_at`. Export a live-item read for cart. `GET /browse/items` stays anonymous (`catalog/http.ts` ~623).
- `server/catalog/packs.ts` `QUANTITY_MIN` / `QUANTITY_MAX` / `QUANTITY_RANGE_MESSAGE` ~205 — reuse the cap sentence. Do not invent a second spelling.
- `client/storefront/src/ItemsPage.tsx` — list only (`browseItemsPath`, `formatRupees`). No Add. Route is public in `App.tsx` ~28.
- `client/storefront/src/PackPage.tsx` `addToCart` ~94 and `AuthSurface` ~149 — copy this: signed out sets `needsAuth`, `onSignedIn` only closes the surface, no `navigate('/')`.
- `client/storefront/src/AuthGate.tsx` `AuthSurface` ~335 — caller-supplied `onSignedIn`. Tab gate still `navigate('/')` ~382.
- `client/storefront/src/cart.tsx` `CartLine` ~12, badge `lines.length` ~54 — extend the list so item lines count. `CartPage.tsx` ~75 renders pack chips only. `io-matrix.test.ts` ~6435 forbids `formatRupees`, Remove, `Cart is Empty`, and `stepper` on `CartPage`.
- `server/web/io-matrix.test.ts` — ports through `18779` are taken. Use `18780`.

## Tasks & Acceptance

**Execution:**
- [x] `server/db/migrations/008_cart_item_lines.sql` — One row per parent and item (`parent_id`, `item_id`, `quantity`, `title`, `unit_price`). Unique on parent and item. Register it in `server/db/migrations/run.ts`.
- [x] `server/catalog/items.ts` — Export the live item (id, title, price) for cart. Keep archived items off that read.
- [x] `server/cart/items.ts` — Add and merge for the session parent. First insert copies title and unit price. A later add adds quantity in one transaction and does not change title or price. Refuse a result above 20.
- [x] `server/cart/http.ts` — `POST /api/cart/items` `{ itemId, quantity }`. `GET /api/cart` returns pack lines as `kind: 'pack'` and item lines as `kind: 'item'` with quantity, title, and unit price. Parent session required.
- [x] `client/storefront/src/ItemsPage.tsx` — Each item has a 1–20 stepper and Add. Plus disables at 20 and shows the cap sentence. Signed out: `AuthSurface` on this page, quantities kept. Signed in: `POST` with `credentials: 'include'`. Show the error and keep the quantity.
- [x] `client/storefront/src/CartPage.tsx` — Pack lines stay chips. Item lines show add-time title and quantity as text, with no rupee total. `client/storefront/src/cart.tsx` and `Shell.tsx` — the badge counts every line of either kind.
- [x] `server/web/io-matrix.test.ts` — Cover every matrix row on port `18780`. Keep the story 3.1 pack assertions green.

**Acceptance Criteria:**
- Given a signed-in parent and a live item, when they add a quantity from 1 to 20, then that item is one line on the same cart as any pack lines and the badge includes it.
- Given that item is already in the cart, when they add more within the cap, then the same line’s quantity grows and a second item line is not created.
- Given the add would pass 20 or the item is not live, when the response is not success, then the stored item line is unchanged.
- Given a signed-out parent, when they sign in from the items screen, then they stay on that screen and a line appears only after a later Add.

## Spec Change Log

## Verification

**Commands:**
- `npm run typecheck` — expected: exit 0
- `npm run build` — expected: exit 0, producing `server/dist`
- `node --import tsx --test server/web/io-matrix.test.ts` — expected: exit 0, including port `18780`

**Manual checks (if no CLI):**
- On Items, step to 20: plus disables and the cap sentence shows. Signed out, Add shows Log in and Create account; after login the quantity remains and nothing is added until Add is tapped again.
- Add an item, then add it again: Cart shows one item line with the summed quantity, plus any pack chips. Badge equals pack lines plus item lines. No total, Remove, or cart stepper.

## Suggested Review Order

**Merge**

- First add clones the item; a later add increases that same line.
  [`items.ts:62`](../../server/cart/items.ts#L62)

**Schema**

- One row per parent and item, so a repeat add cannot insert a second line.
  [`008_cart_item_lines.sql:1`](../../server/db/migrations/008_cart_item_lines.sql#L1)

**Route**

- Item add sits beside pack add and uses the same parent session.
  [`http.ts:101`](../../server/cart/http.ts#L101)

**Live item**

- Cart asks catalog for a live item and stores the title and price from that moment.
  [`items.ts:71`](../../server/catalog/items.ts#L71)

**Items screen**

- Signed out, Add opens Log in here; signed in, it posts the stepper quantity.
  [`ItemsPage.tsx:66`](../../client/storefront/src/ItemsPage.tsx#L66)

**Cart display**

- Item lines show title and quantity; pack lines stay chips.
  [`CartPage.tsx:138`](../../client/storefront/src/CartPage.tsx#L138)

- The badge counts a line only when it is a pack or an item.
  [`cart.tsx:45`](../../client/storefront/src/cart.tsx#L45)

**Tests**

- The item matrix, including merge and a mixed cart, runs on port 18780.
  [`io-matrix.test.ts:6455`](../../server/web/io-matrix.test.ts#L6455)
