---
title: 'Place Order — snapshot, number, one tap'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '4bf5c39dabea4e70368bd54479ae974cc127f635'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Checkout (4.1) ends at a Place Order button that does nothing. No order exists anywhere, so the shop still has no list and the parent has no number to quote on the phone.

**Approach:** A new `orders` module adds `POST /api/orders`. In one SQLite transaction it refuses a blocked or empty cart, snapshots the cart and the account's address and contacts, allocates a short sequential `public_number`, stores status `Order Is Placed`, and empties the cart. It dedupes on a per-parent `Idempotency-Key`. CheckoutPage wires Place Order to it. Success lands on a minimal My Orders list that shows `#1001`-style numbers. Story 4.3 grows that list into the full pipeline.

## Boundaries & Constraints

**Always:**
- Session parent only. Admin gets 403 (FR55).
- `orders` reads cart and identity only through TS functions (`../cart/index.js`, `../identity/...`), never their tables.
- The pack snapshot name comes from catalog `getBrowsePack(...).name`. Dependencies run `web → orders → cart → catalog`.
- **Transaction:** the whole Place runs inside one synchronous `db.transaction`:
  1. idempotency lookup
  2. `checkoutBlock`
  3. load the lines
  4. read the parent
  5. insert the order and its lines
  6. `emptyCart`
- Any throw rolls everything back, so no half-placed order can remain.
- **Snapshot:**
  - per pack line: pack id, pack name, label (`Pack N of Grade`), grade name, line total, and the **included** members only (book id, title, unit price, quantity)
  - per item line: item id, title, unit price, quantity, line total
  - on the order: parent name, delivery address, whatsapp, second phone (nullable), note (nullable), goods total (`cartGoodsTotal`), `placed_at` UTC ISO
  - Snapshot values are never re-read later.
- **Order number:** `public_number` = `MAX(public_number)+1`, starting at `1001`, with a `UNIQUE` constraint. better-sqlite3 serialises writes, so concurrent places cannot collide.
- **Idempotency:** `Idempotency-Key` is required, 1–100 printable chars, and `UNIQUE(parent_id, idempotency_key)`. A replay returns the existing order with `200`, even if the cart has changed since.
- **Request body:** `{ note?: string }`. The note is trimmed, an empty note becomes null, and the limit is 1000 chars. Any other body field (such as an address) is ignored.
- Stored status string is exactly `Order Is Placed`, with a CHECK that lists all eight epic statuses.
- Money is integer rupees. JSON is camelCase.
- Errors use `{ error: { code, message } }`.
- **Client:**
  - One key per CheckoutPage mount (`crypto.randomUUID()` in a ref), reused on retries.
  - Taps are guarded by the existing `withLock`. A blocked button's click does nothing.
  - On success: call the badge `refresh()`, then `navigate('/orders', { state: { placedNumber } })`.
  - On 401: `session.logOut()`. AuthGate's existing redirect to `/` then lands the parent on packs after login (NFR15), and the cart stays on the server.
  - Other failures keep the note and show the API message in `role="alert"`.
- **My Orders (minimal):** `GET /api/orders` (no-store) returns the parent's own orders newest-first as `{ orders: [{ id, publicNumber, status, goodsTotal, placedAt }] }`.
  - The page lists `#N`, the status text, `formatRupees(goodsTotal)` and the placed date in Asia/Colombo.
  - The just-placed row gets the `Order #N placed.` heading line.
  - With no orders it shows `No Orders yet.` and the refresh icon.

**Ask First:** A new runtime dependency. Changing the 4.1 checkout or `GET /cart` contracts.

**Never:**
- Payment handling. A delivery figure or payable total.
- An address override.
- Order detail, timeline, status pills or cancel (Story 4.3).
- Admin order routes (Story 4.4 onward).
- Browser storage for the key.
- `db.prepare` in `orders/http.ts`.
- `FROM cart_*`, catalog or identity tables in `server/orders/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Place | Clean cart: one pack (2 of 3 books ticked) and one item. Key `k1`, note `" Gate 2 "`. | `201 { order: { id, publicNumber: 1001, status: 'Order Is Placed', goodsTotal, placedAt } }`. The snapshot has 2 books, the note `Gate 2`, and the account address. `GET /cart` is empty. | N/A |
| Replay | Same parent and `k1` again, even with a new cart. | `200` with the same order. No new row, and the cart is untouched. | N/A |
| Sequence | A second parent places. | `publicNumber: 1002`. | N/A |
| Same key, other parent | Parent B also uses `k1`. | A new order for B (keys are scoped per parent). | N/A |
| Address injection | Body has `deliveryAddress: 'X'`. | The snapshot uses the identity address. | N/A |
| Stale | `checkoutBlock` > 0. | No order, cart unchanged. | `409 checkout_blocked`, `{n} line(s) still need attention.` |
| Empty | Cart has no lines. | No order. | `409 cart_empty`, `Your cart is empty.` |
| Bad key/note | Missing or over-long key, or note over 1000 chars or not a string. | No order. | `400 invalid_input` |
| Mid-txn failure | An insert throws after the order row. | No order rows, and the cart is intact. | `500 internal_error` |
| Auth | No cookie, or an admin cookie, on POST or GET. | | `401` / `403` |
| List | GET as parent A. | Only A's orders, newest first. | N/A |

</frozen-after-approval>

## Code Map

- `server/orders/` -- currently only `.gitkeep`. New files: `index.ts` (exports `createOrdersRouter`), `http.ts`, `place.ts` (the SQL lives here).
- `server/web/api.ts:31-33` -- Mount `createOrdersRouter(db, env)` after cart (L33), before the 404 at L35.
- `server/db/migrations/run.ts:19-28` -- Append `009_orders_orders_and_lines.sql`. Follow the DDL style of `007_cart_pack_lines.sql`: `INTEGER PRIMARY KEY NOT NULL`, NOT NULL by default, `<table>_<col>` indexes, FKs with `ON DELETE CASCADE` for child rows. Tables: `orders`, `order_pack_lines`, `order_pack_line_books`, `order_item_lines`.
- **Cart reads** (export them all from `server/cart/index.ts`):
  - `packs.ts:236` `listCartPackLines` (members carry `included`, `title`, `unitPrice`, `quantity`; lines carry `label`, `gradeName`, `lineTotal`)
  - `items.ts:145` `listCartItemLines`
  - `packs.ts:122` `cartGoodsTotal`
  - `staleness.ts:48` `checkoutBlock`
- **Empty cart:** none exists. Add `emptyCart(db, parentId)` in a new `server/cart/empty.ts`. It deletes members, then pack lines, then item lines, scoped by `parent_id`. A nested `db.transaction` becomes a SAVEPOINT, so it is safe inside Place.
- `server/catalog/packs.ts:235` `getBrowsePack(db, id)` -- `.name` for the snapshot. It is live because staleness already passed.
- `server/identity/parents.ts:41` `findParentById` -- returns `{ name, delivery_address, whatsapp, second_phone }`. Re-export it from `identity/index.ts` or import the file.
- `server/identity/http.ts:116` `lookupSession`, `:138` `rejectUnauthorized`.
  - Copy `sendError`/`safe`/`requireParent` from `server/cart/http.ts:33-73`, using orders copy: `Only parents can place orders.`
  - Call `enableForeignKeys(db)` in the router factory, as `cart/http.ts:125` does.
- `client/storefront/src/CheckoutPage.tsx`:
  - The note is at L130, `withLock` L211, `apiMessage` L28, `UNREACHABLE` L12, `refresh` L127.
  - The Place button is at L383-390. Keep `aria-disabled`, and never use `disabled`.
  - For the session: `AccountPage.tsx:161` shows the `session.logOut()` on 401 pattern.
- `client/storefront/src/App.tsx:34` -- Replace the `orders` placeholder `Page` with `OrdersPage`. App.tsx must not contain the words refresh, not found or go back.
- `client/storefront/src/OrdersPage.tsx` (new) -- Mirror CartPage's fetch, Spinner and `RefreshIcon` patterns (`CartPage.tsx:25`).
- **`server/web/io-matrix.test.ts`:**
  - The 4.1 block is at L7627. Reuse its helpers `signInAdmin`, `adminSend`, `registerParent` and `seed` by copying them.
  - Use port `ORDERS_PORT = String(18783)` next to L150-178.
  - **4.1 assertions to relax:** L8338 (one `Place Order` stays), L8341 `onClick ... place`, L8361 `Idempotency-Key|/api/orders`. Keep the `disabled=` and storage bans.
  - L2385-2398 is the Set-Cookie walk. Make sure orders is covered.

## Tasks & Acceptance

**Execution:**
- [x] `server/db/migrations/009_orders_orders_and_lines.sql`, `run.ts` -- Add the four tables, including `UNIQUE(public_number)`, `UNIQUE(parent_id, idempotency_key)` and the status CHECK. Register the migration.
- [x] `server/cart/empty.ts`, `server/cart/index.ts` -- Add `emptyCart`, and export the list, total and `emptyCart` functions.
- [x] `server/orders/place.ts` -- Add `placeOrder(db, parentId, key, note)`, which returns `{ order, replayed } | failure`, and `listParentOrders(db, parentId)`.
- [x] `server/orders/http.ts`, `index.ts`, `server/web/api.ts` -- Add `POST /orders` and `GET /orders` following the matrix, and mount them.
- [x] `client/storefront/src/CheckoutPage.tsx` -- Wire the Place click: key ref, lock, POST with the `Idempotency-Key` header, then refresh and navigate. Handle the 401 branch, and keep the error and note on failure.
- [x] `client/storefront/src/OrdersPage.tsx`, `App.tsx` -- Add the minimal list with the placed heading line and the empty state, then route it.
- [x] `client/ui/base.css` -- Add only the minimal order-row styles, using existing tokens.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.2 block on port 18783 that covers every matrix row. For mid-transaction failure, call `placeOrder` directly on a temp db with a trigger that `RAISE(ABORT)`s on `order_item_lines` insert. Also add source checks: no `db.prepare` in `orders/http.ts`, no foreign `FROM` in `orders/*`, CheckoutPage sends `Idempotency-Key`, and no storage. Relax the 4.1 assertions.

**Acceptance Criteria:**
- Given a resolved checkout with a typed note, when the parent double-taps Place Order, then exactly one order exists. The parent lands on My Orders, which shows `Order #1001 placed.`, and the cart badge reads empty.
- Given the session expired on Checkout, when the parent taps Place Order and signs in again, then they land on packs and their cart lines are still there.

## Spec Change Log

## Design Notes

Keys are scoped to the parent, so one parent's key can never return another parent's order. A replay returns `200`, not an error. A retried request after a timeout then behaves exactly like the first success, which is what FR52 asks for. `MAX+1` is safe because better-sqlite3 runs one synchronous writer and the read happens inside the same transaction. `UNIQUE` is the backstop. `1001` makes the first numbers read like the `#1042` in the docs.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18783 block and all earlier blocks

## Suggested Review Order

**The Place transaction**

- Entry point: one immediate transaction — replay, block check, snapshot, number, empty cart.
  [`place.ts:92`](../../server/orders/place.ts#L92)

- Replay lookup scoped to parent and key; returns the existing order.
  [`place.ts:75`](../../server/orders/place.ts#L75)

- Refuses flagged carts using 4.1's guard, before any write.
  [`place.ts:102`](../../server/orders/place.ts#L102)

- Pack names resolved up front; an off-list pack becomes 409, never a 500.
  [`place.ts:123`](../../server/orders/place.ts#L123)

- Sequential number from MAX+1, starting at 1001, inside the write lock.
  [`place.ts:82`](../../server/orders/place.ts#L82)

- Cart emptied through cart's own function, so rollback restores it.
  [`place.ts:205`](../../server/orders/place.ts#L205)

- `.immediate()` takes the write lock before reading the sequence.
  [`place.ts:212`](../../server/orders/place.ts#L212)

**Schema and module boundaries**

- Unique number, per-parent unique key, eight-status CHECK.
  [`009_orders_orders_and_lines.sql:6`](../../server/db/migrations/009_orders_orders_and_lines.sql#L6)

- Cart-owned delete so orders never touches cart tables.
  [`empty.ts:7`](../../server/cart/empty.ts#L7)

- Identity read exposed as a TS function for the contact snapshot.
  [`index.ts:11`](../../server/identity/index.ts#L11)

**HTTP contract**

- POST: no-store, parent-only, key validation, 201 new vs 200 replay.
  [`http.ts:90`](../../server/orders/http.ts#L90)

- GET: the parent's own orders, newest first.
  [`http.ts:126`](../../server/orders/http.ts#L126)

- Mounted after cart, before the JSON 404.
  [`api.ts:35`](../../server/web/api.ts#L35)

**Checkout wiring**

- One key per mount, regenerated only if missing; never in storage.
  [`CheckoutPage.tsx:144`](../../client/storefront/src/CheckoutPage.tsx#L144)

- Place handler: blocked no-op, lock, 401 logout, 409 reload then message.
  [`CheckoutPage.tsx:293`](../../client/storefront/src/CheckoutPage.tsx#L293)

- Any 2xx refreshes the badge and lands on My Orders.
  [`CheckoutPage.tsx:329`](../../client/storefront/src/CheckoutPage.tsx#L329)

**My Orders (minimal)**

- Placed number captured once, then history state cleared.
  [`OrdersPage.tsx:89`](../../client/storefront/src/OrdersPage.tsx#L89)

- Confirmation survives a failed list load; focus lands on heading.
  [`OrdersPage.tsx:208`](../../client/storefront/src/OrdersPage.tsx#L208)

- Just-placed row emphasis.
  [`OrdersPage.tsx:243`](../../client/storefront/src/OrdersPage.tsx#L243)

**Peripherals**

- Route swap from placeholder.
  [`App.tsx:26`](../../client/storefront/src/App.tsx#L26)

- Order row styles.
  [`base.css:763`](../../client/ui/base.css#L763)

- Migration registration.
  [`run.ts:28`](../../server/db/migrations/run.ts#L28)

- 4.2 matrix suite on port 18783.
  [`io-matrix.test.ts:8407`](../../server/web/io-matrix.test.ts#L8407)
