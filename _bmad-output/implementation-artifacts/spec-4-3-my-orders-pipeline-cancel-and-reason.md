---
title: 'My Orders — pipeline, cancel, and reason'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '3f646d857847934d2e8e6db55b32a8427be72a75'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** My Orders (4.2) is a flat list of numbers and status text. A parent can't open an order to see its lines, totals or pipeline position, can't cancel it, and can't see why the shop cancelled it.

**Approach:**
- Add the delivery, payable and cancellation columns to `orders`.
- Add `GET /api/orders/:id` (the snapshot detail) and `POST /api/orders/:id/cancel`. The cancel is a compare-and-set on `Order Is Placed`, so the first write to commit wins.
- Grow OrdersPage so each row shows the eight-status pill and expands inline into a detail view. The detail has the lines, totals, a vertical timeline, the reason when the order is Cancelled, and a Cancel button with a one-deep confirmation modal.
- The page polls quietly, so the pipeline updates without push.

## Boundaries & Constraints

**Always:**
- **Migration `010_orders_delivery_and_cancellation.sql`:**
  - `ALTER TABLE` adds nullable `delivery_price_rupees INTEGER CHECK (>= 0)`, `payable_total_rupees INTEGER CHECK (>= 0)`, `cancellation_reason TEXT`, `cancelled_by TEXT CHECK IN ('parent','admin')` and `cancelled_at TEXT`.
  - A `BEFORE UPDATE` trigger runs `RAISE(ABORT)` when `NEW.status = 'Cancelled' AND NEW.payable_total_rupees IS NOT NULL`, so a Cancelled order never carries a payable total.
  - This story writes none of the delivery or payable values. Stories 4.5 and 4.6 set them.
- **Access:** session parent only. An admin gets 403 (`Only parents can view their orders.`). Another parent's order, or an invalid id (use catalog's `parseId` pattern), returns `404 not_found` `Order not found.`, never a 403. Responses send `no-store`.
- **Detail JSON:** `{ order: { id, publicNumber, status, placedAt, goodsTotal, deliveryPrice|null, payableTotal|null, note|null, deliveryAddress, cancellation: null | { by: 'parent'|'admin', reason: string|null, at }, packLines: [{ packName, label, gradeName, lineTotal, books: [{ title, unitPrice, quantity }] }], itemLines: [{ title, unitPrice, quantity, lineTotal }] } }`.
  - Lines come back in `position` order.
  - Everything is read from the `orders` tables only, never from the catalog or the cart.
- **List JSON:** the existing summary fields are unchanged. Payable values are not added to the list.
- **Cancel:**
  - One `.immediate()` transaction runs `UPDATE … SET status='Cancelled', cancelled_by='parent', cancelled_at=now, payable_total_rupees=NULL WHERE id=? AND parent_id=? AND status='Order Is Placed'`.
  - When 0 rows change, it re-reads the order: missing gives 404, otherwise `409 order_not_cancellable` with a message chosen by the current status:
    - `Order Confirmed` or later and non-terminal: `The shop confirmed this order before your cancel arrived, so it can no longer be cancelled here.`
    - `Cancelled`: `This order is already cancelled.`
    - `Delivered`: `This order has already been delivered.`
  - Success returns `200` with the detail JSON. The cancel takes no body.
- **Pill (UX-DR14):**
  - A shared `StatusPill` in `client/ui`. It shows the step number `1`–`8` (`×` for Cancelled) in a chip, the 12px glyph (SVGs at DESIGN.md:650-657), the border band and the corners, then the hue.
  - Add the `status-*-fill/ink/edge` tokens, plus their `-dark` twins, to `tokens.css`.
  - Cancelled strikes its label. Placed is neutral grey. Ready is the only mustard pill.
  - An unknown status falls back to the plain text.
- **Detail UI:**
  - Each row is a disclosure button (`aria-expanded`). Opening it fetches the detail.
  - Lines show their snapshot prices, then the goods total.
  - Before confirmation (`deliveryPrice === null` and not Cancelled), an info notice reads `Delivery charge: to be confirmed by the shop`. Once delivery is set, the detail shows `Delivery charge` and `Payable total`.
  - The vertical timeline lists the seven pipeline stages: earlier stages ticked, the current one emphasised with `aria-current="step"`, later ones quiet. Skipped stages count as completed.
  - A Cancelled order shows the Cancelled pill in place of the timeline. An admin cancel shows `Reason: {reason}`, and a parent cancel shows `You cancelled this order.`
- **Cancel UI:**
  - The Cancel button appears only while the status is `Order Is Placed`.
  - The modal is `role="dialog"`, `aria-modal`, with focus trapped and Escape to close. The title is `Cancel order #N?`. The actions are a solid-danger `Cancel order` and a secondary `Keep order`.
  - The page uses `withLock`-style re-entry guarding.
  - On success, the page stays on My Orders, refreshes the list and the open detail, and the order stays listed.
  - On 409, it shows the API message in `role="alert"`, reloads, and the Cancel button disappears.
  - On 401, it calls `session.logOut()`.
- **Polling:** every 30s while `document.visibilityState === 'visible'`, the page silently refetches the list and any open detail. A failed poll shows nothing. The poll pauses while the modal is open.
- Motion stays at 120–200ms and respects `prefers-reduced-motion`.

**Ask First:** A new runtime dependency. Changing the `POST /api/orders` or list contracts.

**Never:**
- Admin routes or admin UI.
- Writing a delivery price, a payable total or an admin reason.
- Editing order contents.
- Push, WebSocket or notifications.
- A horizontal stepper.
- A second modal level.
- `db.prepare` in `orders/http.ts`.
- `FROM` on catalog, cart or identity tables in `server/orders/*`.
- Browser storage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Detail | Parent A opens their placed order (a pack with 2 of 3 books, plus 1 item). | `200`: snapshot lines and books (only the 2 included), `goodsTotal`, `deliveryPrice: null`, `payableTotal: null`, `cancellation: null`. | N/A |
| Snapshot holds | A catalog book is renamed or repriced after Place. | The detail still shows the placed title and price. | N/A |
| Other parent | B requests A's order id, or the id is `abc` or `0`. | | `404 not_found` |
| Cancel | A cancels a `Order Is Placed` order. | `200`. Status is `Cancelled`, `cancellation.by: 'parent'`, `payableTotal: null`. The list still contains the order. | N/A |
| Race lost | The status was set to `Order Confirmed` (by a direct DB write) before A's cancel. | The status is still `Order Confirmed`. | `409 order_not_cancellable` with the confirmed message |
| Re-cancel | A cancels an already Cancelled order. | No change. | `409`, `This order is already cancelled.` |
| Admin reason | DB row has `Cancelled`, `cancelled_by='admin'`, and a reason. | The detail returns `cancellation: { by: 'admin', reason }`. | N/A |
| Invariant | A direct UPDATE sets Cancelled with a payable total. | Rejected by the trigger. | SQLite abort |
| Delivery set | DB row is `Processing` with delivery price 400. | `deliveryPrice: 400`, `payableTotal = goods + 400`. | N/A |
| Auth | No cookie, or an admin cookie, on detail or cancel. | | `401` / `403` |

</frozen-after-approval>

## Code Map

- `server/orders/place.ts`:
  - `ORDER_PLACED` is exported at L12. `OrderSqlRow` (L46) and `toSummary` (L56) are not exported, so export them for reuse.
  - Put the new reads and the cancel in a new `server/orders/detail.ts` (`getParentOrder`, `cancelParentOrder`), and keep its SQL there.
  - Use `.immediate()` the way `place.ts:212` does.
- `server/orders/http.ts`:
  - `sendError` (L16), `safe` (L22) and `requireParent` (L36-52) are here. `requireParent` sends the `PARENT_FORBIDDEN` constant from L12 (`Only parents can place orders.`), so give it a message parameter and keep the place copy for POST.
  - Add `GET /orders/:id` and `POST /orders/:id/cancel`.
  - Copy `parseId` from `server/catalog/http.ts:102-107`.
- `server/db/migrations/009_orders_orders_and_lines.sql` holds the existing DDL, and L6-15 has the eight-status CHECK. Register 010 as an array entry after `run.ts:28`.
- No TypeScript union of the eight statuses exists yet. Define the ordered list once in `client/ui/StatusPill.tsx` and reuse it for the timeline.
- `client/storefront/src/OrdersPage.tsx`:
  - `loadOrders` (an AbortController ref, `logOut` on 401) is at L111-153.
  - The re-entry guard is `refreshOrders` at L170-180, which uses an `inFlight` ref. There is no `withLock`, so follow that pattern for cancel. Extend this file.
  - Put the detail and modal in a new `OrderDetail.tsx` in the same folder.
  - The 401 handling follows `AccountPage.tsx:161`.
- `client/ui/index.ts` exports `Spinner` and `formatRupees`. Add `StatusPill.tsx` and export it.
- `client/ui/tokens.css`:
  - The colour tokens and their `-dark` twins are at L24-44.
  - The `--text-pill-label-*` and `--text-step-number-*` tokens are at L86-93.
  - Dark mode works through the `[data-theme='dark']` block at L132, which remaps the plain names. Add each new `status-*` token there too.
- DESIGN.md lives at `_bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/DESIGN.md`. The pill fill/ink/edge table is at L624-647, the glyph SVGs at L650-659, and the modal at L432-439 and L699-701.
- `client/ui/base.css`:
  - `.order-row*` styles are at L772-798, and the notices at L817 and L822.
  - Add `.notice-info` (info/info-tint), `.button-danger-solid`, the modal styles (DESIGN.md:432-439 and 699-701) and the timeline styles.
- `server/web/io-matrix.test.ts`:
  - The 4.2 block starts at L8407, and its `seed`/`registerParent` helpers can be copied.
  - Add `ORDERS_DETAIL_PORT = String(18784)` next to L180.
  - The Set-Cookie walk is at L2385-2398.

## Tasks & Acceptance

**Execution:**
- [x] `server/db/migrations/010_orders_delivery_and_cancellation.sql`, `run.ts` -- Add the columns and the trigger, then register the migration. Story 4.3 must render the delivery and reason values that 4.5 and 4.6 will write.
- [x] `server/orders/detail.ts` -- Add `getParentOrder` and `cancelParentOrder` (compare-and-set plus re-read). This keeps the SQL out of http.
- [x] `server/orders/http.ts` -- Add the two routes, the `parseId` copy, and the `requireParent` message parameter. This is the contract from the matrix.
- [x] `client/ui/tokens.css`, `client/ui/StatusPill.tsx`, `client/ui/index.ts` -- Add the eight-status tokens and the pill, so stories 4.4 to 4.6 can reuse them.
- [x] `client/ui/base.css` -- Add the pill, timeline, info notice, solid-danger button and modal styles, using tokens only.
- [x] `client/storefront/src/OrderDetail.tsx`, `OrdersPage.tsx` -- Add the row pills, the disclosure detail, the timeline, the reason, the cancel modal and the polling.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.3 block on port 18784 that covers every matrix row (set statuses and reasons by direct DB writes). Add source checks: no `db.prepare` in http, no foreign `FROM`, no storage, no horizontal stepper class, and the modal has `role="dialog"`.

**Acceptance Criteria:**
- Given an order at `Order Is Placed`, when the parent taps Cancel and then confirms in the modal, then the parent stays on My Orders with the order listed as Cancelled, and the Cancel button is gone.
- Given the parent has the detail open and the shop confirms the order, when the next poll runs (within 30s), then the pill and timeline show `Order Confirmed` and the Cancel button disappears.
- Given eight orders, one per status, when the parent views My Orders, then each pill shows a different step number and glyph, and Cancelled shows `×` and a struck label.

## Spec Change Log

## Design Notes

- The detail opens inline instead of on its own route. That keeps the parent on My Orders after cancelling (UX-DR31) without any navigation.
- The status before cancellation isn't stored, so a Cancelled order shows no timeline. That is an honest result, and it avoids inventing history.
- The trigger is the database's backstop for "a Cancelled order never carries a payable total", because SQLite can't add a cross-column CHECK with `ALTER`.
- Wrong-owner orders return 404 rather than 403, so order ids don't leak which orders exist (NFR9).

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18784 block and every earlier block

## Suggested Review Order

**Cancel compare-and-set**

- Entry point: one immediate transaction that cancels only from Placed, then re-reads to classify the 404/409.
  [`detail.ts:213`](../../server/orders/detail.ts#L213)

- Routes keep the SQL out of http, send no-store, and return 404 for a wrong owner.
  [`http.ts:164`](../../server/orders/http.ts#L164)

- The 409 messages depend on the current status. These fallbacks derive the payable total and the canceller.
  [`detail.ts:114`](../../server/orders/detail.ts#L114)

**Snapshot detail read**

- Reads only the orders tables, with lines in position order.
  [`detail.ts:194`](../../server/orders/detail.ts#L194)

- The detail route, plus the parseId copy and the view-specific 403 copy.
  [`http.ts:147`](../../server/orders/http.ts#L147)

**Schema invariant**

- Update and insert triggers stop a Cancelled order from carrying a payable total.
  [`010_orders_delivery_and_cancellation.sql:9`](../../server/db/migrations/010_orders_delivery_and_cancellation.sql#L9)

**Page behaviour**

- The cancel flow: re-entry lock, 401 logs out, 409 or network error reloads and alerts.
  [`OrdersPage.tsx:307`](../../client/storefront/src/OrdersPage.tsx#L307)

- Silent polling waits for the first load and pauses while the modal is open.
  [`OrdersPage.tsx:247`](../../client/storefront/src/OrdersPage.tsx#L247)

- Strict parsing turns malformed data into an error state instead of a crash.
  [`OrderDetail.tsx:107`](../../client/storefront/src/OrderDetail.tsx#L107)

- Detail branches: the delivery notice, the reason copy, and Cancel only while Placed.
  [`OrderDetail.tsx:198`](../../client/storefront/src/OrderDetail.tsx#L198)

- The vertical timeline. Skipped stages count as done, and the current step gets aria-current.
  [`OrderDetail.tsx:150`](../../client/storefront/src/OrderDetail.tsx#L150)

- A one-level dialog with the focus trap and Escape to close.
  [`OrderDetail.tsx:323`](../../client/storefront/src/OrderDetail.tsx#L323)

**Shared pill and styles**

- The eight statuses are defined once and reused by the timeline. Unknown statuses fall back to plain text.
  [`StatusPill.tsx:4`](../../client/ui/StatusPill.tsx#L4)

- Status tokens with dark twins, remapped in the dark block.
  [`tokens.css:47`](../../client/ui/tokens.css#L47)

- Pill, timeline, notice, danger button and modal styles.
  [`base.css:1378`](../../client/ui/base.css#L1378)

**Peripherals**

- 4.3 block on port 18784: the matrix rows, rendered detail, parser and fallbacks.
  [`io-matrix.test.ts:9114`](../../server/web/io-matrix.test.ts#L9114)

- Summary helpers exported for reuse.
  [`place.ts:46`](../../server/orders/place.ts#L46)

- Migration registered.
  [`run.ts:29`](../../server/db/migrations/run.ts#L29)
