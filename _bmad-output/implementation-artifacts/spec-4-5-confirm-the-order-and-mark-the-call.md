---
title: 'Confirm the order and mark the call'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'a5a3abdebb997f1d5e269d3fcbc16856d82bfa5a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The admin can list orders but cannot open one. The shop owner cannot record a call that went unanswered, and cannot confirm an order with its delivery price. No order ever gets a payable total.

**Approach:**
- Add an admin order detail page at `/admin/orders/:id`, opened from the 4.4 rows.
- Add two admin actions, both compare-and-set on `Order Is Placed`:
  - **Mark call attempted** writes `call_attempted_at`.
  - **Confirm** writes the delivery price, the payable total and the new status in one transaction.

## Boundaries & Constraints

**Always:**
- **Server** — add these to `admin-http.ts` and `admin.ts`, with `no-store` first and `requireAdmin` (401, or 403 `forbidden`):
  - `GET /api/admin/orders/:id` → `{ order }`.
  - `POST /api/admin/orders/:id/call-attempted` → `{ order }`.
  - `POST /api/admin/orders/:id/confirm` with body `{ deliveryPrice }` → `{ order }`.
  - A bad id or a missing order → 404 `not_found` `Order not found.`.
- **Admin detail JSON** is the 4.3 `OrderDetail` plus `parentName`, `whatsapp`, `secondPhone|null` and `callAttemptedAt|null`.
  - All of these come from the order's snapshot columns.
  - Reuse the 4.3 line mapper by exporting it. Do not copy it.
- **Call attempted:**
  - One `UPDATE … SET call_attempted_at=? WHERE id=? AND status='Order Is Placed'`.
  - The time is UTC ISO "now". A repeat overwrites the time with the latest attempt.
  - When the order is not Placed: 409 `order_not_callable` `This order is no longer waiting for a call.`.
- **Confirm:**
  - `deliveryPrice` must be a JSON safe integer ≥ 0. Strings and floats are refused, never coerced.
  - Otherwise: 400 `invalid_input`, field `deliveryPrice`, `Enter the delivery charge in whole rupees, Rs. 0 or more.`.
  - One `.immediate()` transaction:
    - `UPDATE orders SET status='Order Confirmed', delivery_price_rupees=?, payable_total_rupees=goods_total_rupees+? WHERE id=? AND status='Order Is Placed'`.
    - Then re-read. On `changes===0`, return 409 `order_not_confirmable`:
      - Cancelled → `The parent cancelled this order before your confirm arrived, so it can't be confirmed.`
      - Any other status → `This order is already {status}, so it can't be confirmed again.`
- **Client:**
  - **Wiring:** add `orders/:id` to `App.tsx`. Each 4.4 row becomes a `Link` to the detail and keeps 44px targets.
  - **Detail page** shows:
    - A back link `All orders`.
    - `#publicNumber` and a `StatusPill`.
    - The parent name, WhatsApp, and the second phone only if one is given.
    - The address, and `Note: …` only if there is a note.
    - The snapshot lines, then the goods total.
    - Delivery and payable totals, once set.
  - **Placed orders only:**
    - The 4.4 `CallChip` and a secondary `Mark call attempted` button.
    - An inline confirm form, which is not a modal:
      - The `form-field-money` `Rs.` prefix field `Delivery charge`, digits only.
      - A primary `Confirm order` button.
      - Client-side validation with the same message as the server.
  - **Action behaviour:**
    - A successful action replaces the order with the response.
    - A 409 shows the server message in a `role="alert"` notice, then refetches.
    - A 401 signs out.
    - While busy: `aria-disabled`, and no double submit.
  - **Load** follows the 4.4 `OrdersPage` pattern: AbortController, Skeleton, fallback copy. Colombo times. `admin-order-detail-*` classes, tokens only.

**Ask First:** A new runtime dependency. Changing a 4.2, 4.3 or 4.4 JSON contract (adding the new endpoints is fine).

**Never:**
- Editing lines, prices, the address, contacts or the note. No admin scratchpad.
- Status transitions other than Placed → Confirmed (those are 4.6).
- A confirm modal.
- `db.prepare` in `admin-http.ts`.
- SQL on non-orders tables.
- Browser storage.
- Status literals in client pages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Detail | A parent registered with a second phone places an order with a note, then renames the account. | `200`: the snapshot name, whatsapp, secondPhone, address, note, lines and goods total. `deliveryPrice` and `payableTotal` are `null`. | N/A |
| No second phone | A parent without a second phone. | `secondPhone: null`. | N/A |
| Mark call | Placed, called twice. | `callAttemptedAt` is set, and the second call writes a later time. | N/A |
| Mark call, late | Confirmed or Cancelled. | Row unchanged. | 409 `order_not_callable` |
| Confirm | Placed, goods 1680, `deliveryPrice: 350`. | `200`: `Order Confirmed`, `deliveryPrice 350`, `payableTotal 2030`. | N/A |
| Confirm, free delivery | `deliveryPrice: 0`. | `payableTotal` = goods. | N/A |
| Bad price | `-1`, `"350"`, `12.5`, missing. | Row unchanged. | 400 `invalid_input` `deliveryPrice` |
| Already cancelled (T8) | The parent cancelled first. | Row stays Cancelled with a null payable. | 409 cancelled message |
| Race (T8) | Parent cancel and admin confirm run in parallel. | Exactly one gets 200 and the other gets 409. A Cancelled order never has a payable. | Loser told |
| Stale (T7) | Already Confirmed, confirm again. | The first price is kept. | 409 already-status message |
| Frozen (T9) | After confirm, parent cancel or a second confirm. | Lines, prices, delivery, address and contacts are unchanged. | 409 |
| Auth / id | No cookie / parent / `abc` or unknown id. | | 401 / 403 / 404 |

</frozen-after-approval>

## Code Map

- `server/orders/detail.ts`:
  - `toDetail(db,row)` (L132-191) is private. Export it, or a variant keyed by the row, and reuse its three line reads.
  - `DetailSqlRow` (L61), `payableOf` (L114).
  - The CAS pattern for `cancelParentOrder` is at L213-240.
  - `ORDER_NOT_FOUND_MESSAGE` is at L4-11, and `ORDER_PLACED` comes from `place.ts:12`.
- `server/orders/admin.ts`: `listAdminOrders` (L39-86). Add `getAdminOrder`, `markCallAttempted` and `confirmOrder` next to it.
- `server/orders/admin-http.ts`:
  - `sendError` (L16) has no `field` parameter, so add one as in `http.ts:18-22`.
  - `safe` (L20), `requireAdmin` (L34), the router (L54-68).
  - Copy `parseId` from `http.ts:57-62`.
- Migrations: 009 has `second_phone`, `parent_delivery_note` and `goods_total_rupees`. 010 has the delivery and payable columns and the Cancelled-payable triggers. 011 has `call_attempted_at`. No new migration is needed.
- `client/admin/src/OrdersPage.tsx`:
  - The exported `CallChip` (L133-154), `calledCopy` and `placedAtCopy` (L64-70), and the copy constants (L22-24).
  - `OrderRow` (L160-185) wraps its content in a `Link`.
  - The load pattern is at L327-373.
- `client/admin/src/orders.ts`:
  - `NEEDS_CALL_STATUS` (L32), `adminOrdersPath` (L42), and the strict parse at L65.
  - Add `adminOrderPath(id)`, `parseAdminOrderDetail`, and the action paths.
- `client/admin/src/App.tsx`: L30 is the index route. React-router 8.3.1, with basename `/admin`.
- `client/storefront/src/OrderDetail.tsx`: follow its line and totals markup (L198-280) and `parseOrderDetail` (L107). Do not import from it.
- `client/admin/src/BooksPage.tsx`: the money field is at L332-357, with digit-only `onChange`, and the error is `p.form-error[role=alert]`.
- `client/ui/base.css`: `.form-field-money` (L1102-1131) and the admin-order rules (L1733 onward).
- `server/web/io-matrix.test.ts`:
  - The highest port is `ADMIN_ORDERS_PORT=18785` (L193), so 4.5 uses 18786.
  - The 4.4 block starts at L9980. Copy its helpers `signInAdmin`, `registerParent`, `placeOne`, `readDb`, `writeDb` and `expectRefused`. The `registerParent` copy must send `secondPhone`.
  - The 4.3 race tests are at L9477-9548 (`Promise.all`).
- **4.4 source checks that 4.5 legitimately breaks, so they need narrowing:**
  - L10483 forbids any `call_attempted_at=` write. Allow it only in `admin.ts`.
  - L10480 requires exactly 3 `db.prepare` in `admin.ts`. Scope that count to `listAdminOrders`.
  - L10477, the route regex.
  - L10506, no `<Link`. Allow `Link` to the detail and keep no POST in `OrdersPage`.
- DESIGN.md, under `ux-designs/ux-BookList-2026-08-14/`:
  - The chip is at L663-670.
  - The money field is at L687-689, with tokens at L406-418.
  - The modal is only for terminal actions (L699-701).
  - EXPERIENCE.md L45, L89-92 and L126/218 cover the detail contents and T8.

## Tasks & Acceptance

**Execution:**
- [x] `server/orders/detail.ts` -- Export the line mapper for reuse. Parent behaviour stays unchanged.
- [x] `server/orders/admin.ts` -- Add `getAdminOrder`, `markCallAttempted` and `confirmOrder`, each as one CAS with a re-read.
- [x] `server/orders/admin-http.ts` -- Add the three routes, `parseId`, delivery price validation, and `sendError` with a field.
- [x] `client/admin/src/orders.ts` -- Add the path helpers and the strict `parseAdminOrderDetail`.
- [x] `client/admin/src/OrderDetailPage.tsx`, `App.tsx`, `OrdersPage.tsx` -- Add the detail page, its route, and the row link.
- [x] `client/ui/base.css` -- Add the `admin-order-detail-*` styles and the row-link styles, using tokens only.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.5 block on 18786 that covers every matrix row. Add render tests: the detail page with and without the second phone, and the confirm form only on Placed orders. Add source checks: no confirm modal, no status literals, tokens only. Narrow the 4.4 checks listed above.

**Acceptance Criteria:**
- Given an admin on Orders, when they activate a row, then `/admin/orders/:id` shows the contacts, address, note, lines and goods total. No control edits them.
- Given a Placed order, when the admin taps `Mark call attempted`, then the chip changes from `Not called yet` to `Called {time} · no answer` without a reload. The chip text is its accessible name.
- Given a Placed order, when the admin enters `350` and taps `Confirm order`, then the pill reads Order Confirmed, the delivery charge and payable total show, and the call controls and confirm form disappear.
- Given the parent cancelled while the page was open, when the admin confirms, then the server's cancelled message shows in an alert and the page refetches to show Cancelled.

## Design Notes

- Confirm only ever starts from `Order Is Placed`, so `WHERE status='Order Is Placed'` is the expected-status check. The client needs to send no `expectedStatus`. 4.6 adds one for its multi-source transitions.
- The payable total is computed in SQL from the stored goods total. The client never supplies it.
- `Rs. 0` is valid: the shop may deliver free. That matches the database `CHECK >= 0`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18786 block and every earlier block

## Suggested Review Order

**Confirm (the money moment)**

- Entry point: one compare-and-set on Placed. Payable is computed in SQL, with a safe-integer guard.
  [`admin.ts:196`](../../server/orders/admin.ts#L196)

- The re-read turns zero changes into the cancelled-first or already-status 409, or the overflow 400.
  [`admin.ts:204`](../../server/orders/admin.ts#L204)

- A strict JSON safe integer of at least 0. Strings and floats are refused, never coerced.
  [`admin-http.ts:70`](../../server/orders/admin-http.ts#L70)

**Call mark and detail read**

- The call mark is gated on Placed. A repeat keeps only the latest attempt.
  [`admin.ts:170`](../../server/orders/admin.ts#L170)

- Admin detail = the reused 4.3 mapper plus the snapshot contacts and the call time.
  [`admin.ts:161`](../../server/orders/admin.ts#L161)

- The exported 4.3 mapper and its shared column list keep the parent detail unchanged.
  [`detail.ts:140`](../../server/orders/detail.ts#L140)

- Three routes: no-store first, then requireAdmin, parseId and 404.
  [`admin-http.ts:89`](../../server/orders/admin-http.ts#L89)

**Detail page behaviour**

- Actions: abortable, single-submit, and sequence-guarded. A 409 shows the alert, then awaits the refetch.
  [`OrderDetailPage.tsx:331`](../../client/admin/src/OrderDetailPage.tsx#L331)

- The page remounts per id, so one order's state never bleeds into the next.
  [`OrderDetailPage.tsx:229`](../../client/admin/src/OrderDetailPage.tsx#L229)

- The view is read-only. The call chip and inline `Rs.` confirm form appear only on Placed orders.
  [`OrderDetailPage.tsx:57`](../../client/admin/src/OrderDetailPage.tsx#L57)

- A strict detail parser: an unknown status fails the load instead of rendering.
  [`orders.ts:252`](../../client/admin/src/orders.ts#L252)

**List → detail wiring**

- Each 4.4 row becomes one link that keeps 44px targets.
  [`OrdersPage.tsx:166`](../../client/admin/src/OrdersPage.tsx#L166)

- The `orders/:id` route.
  [`App.tsx:32`](../../client/admin/src/App.tsx#L32)

- The row link uses subgrid on the row's own grid, and `::after` gives a full-card hit area.
  [`base.css:1963`](../../client/ui/base.css#L1963)

- The detail layout, built from tokens only.
  [`base.css:1998`](../../client/ui/base.css#L1998)

**Peripherals**

- The 4.5 matrix block on port 18786 covers HTTP rows, the race, frozen T9, renders and source checks.
  [`io-matrix.test.ts:10584`](../../server/web/io-matrix.test.ts#L10584)

- The parallel cancel/confirm race: exactly one commit, and never a payable on a Cancelled order.
  [`io-matrix.test.ts:11044`](../../server/web/io-matrix.test.ts#L11044)
