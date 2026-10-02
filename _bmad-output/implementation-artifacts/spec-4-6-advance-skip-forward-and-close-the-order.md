---
title: 'Advance, skip forward, and close the order'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '643a9a1585071be721f256afb652104038032693'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After 4.5, a confirmed order is stuck at `Order Confirmed`. The shop cannot move it along the pipeline, cannot mark it delivered, and cannot cancel it with a reason. So no order ever reaches a terminal state.

**Approach:**
- Add two admin actions on the order detail page. Both are compare-and-set on an `expectedStatus` that the client sends.
- **Move status:** go forward (skips allowed) or backward (floor at Order Confirmed) among the post-confirm stages, or on to Delivered.
- **Cancel with a reason:** from any non-terminal status.
- Delivered and Cancelled each sit behind a one-deep confirmation modal.
- The parent's existing 30s poll then shows the new position and the reason.

## Boundaries & Constraints

**Always:**
- **Server** — add these routes to `admin-http.ts`, using the 4.5 handler shape (`safe`, `no-store` first, `requireAdmin`, `parseId`, 404):
  - `POST /api/admin/orders/:id/status` with body `{ expectedStatus, status }` → `{ order }`.
  - `POST /api/admin/orders/:id/cancel` with body `{ expectedStatus, reason }` → `{ order }`.
- **Input checks** — each failure is a 400 `invalid_input` with a `field`:
  - `expectedStatus` must be one of the 8 stored strings. Field `expectedStatus`: `Refresh the order and try again.`
  - `status` must be one of `Order Confirmed`, `Processing`, `Packing The Order`, `Ready To Deliver`, `On Delivery Partner` or `Delivered`. Field `status`: `Choose a status to move this order to.`
  - `reason` is trimmed, must be 1–500 characters, and is stored trimmed. Field `reason`: `Write a short reason the parent will see, up to 500 characters.`
  - Strings only. No other type is coerced.
- **Transition rules** are checked against `expectedStatus` before writing. A breach is a 409 `order_transition_not_allowed`:
  - From `Order Is Placed`, via `/status`: `Confirm this order with a delivery charge before moving it on.` (T2).
  - From `Delivered` or `Cancelled`: `This order is already {status}, which is final.` (T5).
  - When `status === expectedStatus`: `This order is already {status}.`
  - Otherwise any move among the six targets is allowed, including skips forward and moves backward. `Order Is Placed` is never a target (T4).
  - `/cancel` is allowed from all six non-terminal statuses, including `Order Is Placed`.
- **Writes** — each is one `.immediate()` transaction, followed by a re-read:
  - Move: `UPDATE orders SET status=? WHERE id=? AND status=?`.
  - Cancel: `UPDATE orders SET status='Cancelled', cancelled_by='admin', cancellation_reason=?, cancelled_at=?, payable_total_rupees=NULL WHERE id=? AND status=?`.
  - The NULL payable is required by migration 010's trigger. `delivery_price_rupees` is kept.
  - When `changes===0`, re-read the row:
    - Missing → 404.
    - Otherwise → 409 `order_status_stale`: `This order changed to {current} since you opened it, so nothing was changed. Check it and try again.` (T7).
- **Client** (`OrderDetailPage.tsx`) adds a `Status` section on orders from Order Confirmed to On Delivery Partner:
  - A `Move to` button group. It has one secondary button per allowed target except the current status and Delivered, in pipeline order.
  - A `Mark delivered` button, which opens the Delivered modal.
  - A `Cancel order` button. It shows on every non-terminal order, including Placed, and opens the cancel modal.
- **Modals** — a new admin `TerminalModal.tsx`:
  - Its behaviour mirrors the storefront `CancelOrderModal`:
    - Focus moves in on open and goes back on close.
    - Escape closes the modal unless busy.
    - Tab is trapped, including over the textarea.
    - The backdrop does not close it.
  - It uses the existing `.modal*` classes, a `button-danger-solid` confirm, and a secondary dismiss.
  - **Delivered modal:**
    - Title `Mark #{n} delivered?`
    - Body `Delivered is final. This order can't be moved again.`
    - Buttons: `Mark delivered` and `Cancel`.
  - **Cancel modal:**
    - Title `Cancel #{n}?`
    - Body `Cancelled is final. The parent will see your reason.`
    - A required textarea `Reason for the parent` with `maxLength` 500.
    - Buttons: `Cancel order` and `Keep order`.
- **Action behaviour** uses the existing `act()` path:
  - Success replaces the order and closes the modal, without a reload.
  - A 400 on `reason` keeps the modal open, shows the message inline, and keeps the typed text (FR12).
  - A 409 closes the modal, shows the message in the `role="alert"` notice, and then refetches.
  - A 401 signs out.
  - While busy: `aria-disabled` and single-submit.
  - No animation.
- **Admin view of a cancelled order:** show who cancelled it, as `Cancelled by the parent.` or `Cancelled by the shop.`, plus `Reason: …` when there is a reason.
- **No status literals** in client admin files. Derive every status from `ORDER_STATUSES` / `PIPELINE_STAGES`.

**Ask First:** A new runtime dependency. Changing an existing 4.2–4.5 JSON contract. Moving or refactoring the storefront `CancelOrderModal`.

**Never:**
- A paid status. Notifications.
- Reopening Delivered or Cancelled.
- Any change to Placed → Confirmed (that stays 4.5 `/confirm`).
- Editing snapshot columns.
- `db.prepare` in `admin-http.ts`.
- `<select>`, PATCH or DELETE.
- Browser storage.
- A modal for non-terminal moves.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Advance | Confirmed → `Processing` | 200 `Processing`; delivery and payable unchanged | N/A |
| Skip forward (T3) | Processing → `Ready To Deliver` | 200 | N/A |
| Back (T4) | Ready To Deliver → `Order Confirmed` | 200 | N/A |
| Deliver | On Delivery Partner → `Delivered` | 200; the payable is kept | N/A |
| Skip to Delivered | Confirmed → `Delivered` | 200 | N/A |
| Placed move (T2) | Placed, expected Placed → `Processing` | Row unchanged | 409 `order_transition_not_allowed` |
| Target Placed (T4) | `status: 'Order Is Placed'` | Row unchanged | 400 `status` |
| Final (T5) | Delivered or Cancelled, as expected → any move or cancel | Row unchanged | 409 final message |
| Same status | Processing → `Processing` | Row unchanged | 409 `order_transition_not_allowed` |
| Stale (T7) | Actual Packing, expected Processing | Row unchanged | 409 `order_status_stale`, naming Packing |
| Admin cancel (T6) | Processing, reason `"  Out of stock  "` | 200 `Cancelled`; `cancellation: {by:'admin', reason:'Out of stock'}`; payable null; the parent detail shows it | N/A |
| Cancel Placed | Placed + reason | 200 `Cancelled`, `cancelled_by='admin'` | N/A |
| Bad reason | Missing, `"   "`, 501 characters, a number | Row unchanged | 400 `reason` |
| Bad expected | Missing / `"Shipped"` | Row unchanged | 400 `expectedStatus` |
| Race | Parent cancel vs admin cancel on Placed, in parallel | Exactly one 200; the loser gets 409 | Loser told |
| Auth / id | No cookie / parent / `abc` / unknown | | 401 / 403 / 404 |

</frozen-after-approval>

## Code Map

- **`server/orders/admin.ts`:**
  - Add `moveOrderStatus(db,id,expected,to)` and `cancelAdminOrder(db,id,expected,reason)`, using the `confirmOrder` CAS-then-re-read pattern (L196-241).
  - Results are discriminated unions like `ConfirmResult` (L133).
  - Constants: `ORDER_CONFIRMED` (L12), plus `ORDER_CANCELLED` / `ORDER_DELIVERED` imported from `detail.ts` (L4-5). Add the four mid-stage constants and a `MOVE_TARGETS` array here.
  - Reuse `findAdminOrder` (L139) and `toAdminDetail` (L150).
- **`server/orders/admin-http.ts`:**
  - The handler shape is at L104-151. `sendError` with a field is at L23, `parseId` at L62, and the body cast at L135.
  - Add the parsers `parseExpectedStatus`, `parseMoveTarget` and `parseReason` next to `parseDeliveryPrice` (L69).
- **`server/orders/detail.ts`:**
  - Read only. `cancellationOf` (L125-133) already maps `cancelled_by='admin'` and the reason into the JSON.
  - The parent cancel CAS is at L221-247 (the race partner).
  - io-matrix L9873 forbids `detail.ts` from writing `cancellation_reason`, so keep the write in `admin.ts`.
- **DB:**
  - Migration 009 has the `status` CHECK with all 8 strings.
  - Migration 010 has `cancellation_reason`, `cancelled_by`, `cancelled_at`, and the `orders_cancelled_without_payable` trigger.
  - No new migration.
- **`client/ui/StatusPill.tsx`:** `ORDER_STATUSES` (L4-13) and `PIPELINE_STAGES` (L18) are exported from `@booklist/ui`.
- **`client/admin/src/orders.ts`:**
  - `NEEDS_CALL_STATUS` and `OPEN_STATUSES` / `PAST_STATUSES` are at L32-40.
  - Add the derived `CONFIRMED_STATUS`, `DELIVERED_STATUS`, `MOVABLE_FROM` (Confirmed through On Delivery Partner) and `isTerminal`, plus `adminOrderStatusPath(id)` and `adminOrderCancelPath(id)`.
- **`client/admin/src/OrderDetailPage.tsx`:**
  - In the view (L57-223), `placed` is at L68, the notice at L83-87, and the Placed-only block at L159-220. Add the status and cancel controls and the cancellation display after the totals.
  - The page's `act(path, body?)` is at L331-396. It already does the 409 notice and refetch, the 401 signout, and busy handling.
    - Add a `reason` field-error branch (like `deliveryPrice` at L381).
    - Add a modal-close-on-409 rule.
  - `ViewProps` is at L42.
- **`client/storefront/src/OrderDetail.tsx`:** `CancelOrderModal` (L315-410) is the behaviour reference. Do not import it.
  - The parent Status section (L282-299) already renders `Reason:`.
  - The `OrdersPage.tsx` poll (L13, L244-257) already satisfies FR71/FR73.
- **`client/ui/base.css`:**
  - The `.modal*` rules are at L1680-1730 and `.button-danger-solid` at L1645.
  - The admin-order-detail rules are at L1998-2117. Add the `-status` / `-cancelled` / modal-textarea rules here, using tokens only.
- **`server/web/io-matrix.test.ts`:**
  - The 4.5 block is at L10584, port 18786 (L204). Use 18787 for the 4.6 block. Copy its helpers (L10651-10817).
  - **4.5 checks to narrow:**
    - L11356: the `.immediate()` count goes from 2 to 4.
    - L11377: the modal ban becomes `OrderDetailPage` with no inline `role="dialog"` (it is only in `TerminalModal.tsx`), and the confirm form is still not in a modal.
    - L11378: keep the PATCH / DELETE / `<select` ban. Allow `textarea` only in `TerminalModal.tsx`.
    - L11372-11376: the status-literal ban also covers `TerminalModal.tsx`.
  - L11224-11225 (Placed renders) and L11254-11258 still pass, because the modals are closed in static renders and the status buttons are not a `<form>`.

## Tasks & Acceptance

**Execution:**
- [x] `server/orders/admin.ts` -- Add the targets, `moveOrderStatus` and `cancelAdminOrder`. Each checks the rules, then runs a CAS and a re-read. -- This is the core of T1-T7.
- [x] `server/orders/admin-http.ts` -- Add the two routes and the three strict parsers. -- These are the HTTP contract.
- [x] `client/admin/src/orders.ts` -- Add the derived status constants and the two path helpers. -- This keeps literals out of the pages.
- [x] `client/admin/src/TerminalModal.tsx` -- Add the accessible one-deep modal, with an optional textarea slot. -- It is used for Delivered and Cancel.
- [x] `client/admin/src/OrderDetailPage.tsx` -- Add the status section, the two modals, the cancellation display, and the reason error and close handling. -- This is the admin UX.
- [x] `client/ui/base.css` -- Add the status-group, cancelled and modal-field styles, using tokens only. -- These are the visuals.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.6 block on 18787 that covers every matrix row, plus a parent GET after an admin cancel and after a move.
  - Add renders: the Confirmed view shows the `Move to` buttons excluding the current status. The Placed view shows `Cancel order` but no `Move to`. Delivered and Cancelled show no controls, and the admin-cancelled view shows `Reason:`.
  - Add source checks: no status literals, tokens only, `TerminalModal` holds the only dialog. Narrow the 4.5 checks listed above.

**Acceptance Criteria:**
- Given an order at Processing, when the admin taps `Ready To Deliver`, then the pill updates in place with no reload and no animation, and the button group re-forms around the new status.
- Given an order at On Delivery Partner, when the admin taps `Mark delivered` and then confirms in the modal, then the order shows Delivered with no controls. Choosing `Cancel` in the modal changes nothing.
- Given any non-terminal order, when the admin opens `Cancel order` and confirms with an empty reason, then an inline error shows and the modal stays open. With a reason, the order shows Cancelled plus `Reason: …`, and the parent's My Orders shows the same reason on its next poll.
- Given a parent page and an admin page are both open, when the admin acts on a stale status, then the 409 explanation shows and the page refetches the true status.

## Design Notes

- **`expectedStatus` makes the write a compare-and-set.** The rules are checked on `expected`. The CAS guarantees that the current status equals `expected`, so a rule pass on `expected` is a rule pass on the real row. A rule breach on a non-stale request is reported as `not_allowed`, while a lost race is reported as `stale`.
- **Skipping straight to Delivered.** T3 names skips among Processing … On Delivery Partner. Delivered is still a forward move, so Confirmed → Delivered is allowed (the shop may hand-deliver). The modal guards it. Placed is never skippable, because `/status` refuses it.
- **The modal is admin-local.** Admin cannot import from the storefront, so the storefront modal stays untouched. Lifting a shared modal into `client/ui` is out of scope.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18787 block and all earlier blocks

## Suggested Review Order

**Transition rules and compare-and-set (the core)**

- Entry point: one shared helper checks the rules, runs the compare-and-set, then classifies the re-read as 404, stale or not-allowed.
  [`admin.ts:317`](../../server/orders/admin.ts#L317)

- Move rules: Placed can't move, final statuses refuse moves, and the same status is refused.
  [`admin.ts:299`](../../server/orders/admin.ts#L299)

- A move is a single conditional UPDATE on the expected status.
  [`admin.ts:343`](../../server/orders/admin.ts#L343)

- The cancel records who cancelled, the reason and the time, and NULLs the payable the trigger requires.
  [`admin.ts:358`](../../server/orders/admin.ts#L358)

- The stale message names the real current status.
  [`admin.ts:289`](../../server/orders/admin.ts#L289)

**HTTP contract**

- Strict parsers: exact status strings, and a trimmed 1–500 character reason. Nothing is coerced.
  [`admin-http.ts:85`](../../server/orders/admin-http.ts#L85)

- The two new routes follow the 4.5 handler shape: no-store, then requireAdmin, then parseId.
  [`admin-http.ts:185`](../../server/orders/admin-http.ts#L185)

**Admin UI**

- The Status section has the Move to group, Mark delivered and Cancel order. Only non-terminal orders get it.
  [`OrderDetailPage.tsx:284`](../../client/admin/src/OrderDetailPage.tsx#L284)

- `act()` routing: success closes the modal, a 409 hides it but keeps the reason, a 400 on reason keeps it open.
  [`OrderDetailPage.tsx:507`](../../client/admin/src/OrderDetailPage.tsx#L507)

- The client checks the reason before sending, so a blank reason never reaches the server.
  [`OrderDetailPage.tsx:627`](../../client/admin/src/OrderDetailPage.tsx#L627)

- A one-deep modal: focus trap, Escape unless busy, a read-only textarea while busy, and a heading focus fallback.
  [`TerminalModal.tsx:37`](../../client/admin/src/TerminalModal.tsx#L37)

- A polite live region announces each outcome without animation.
  [`OrderDetailPage.tsx:146`](../../client/admin/src/OrderDetailPage.tsx#L146)

- The cancellation display shows who cancelled and the reason.
  [`OrderDetailPage.tsx:332`](../../client/admin/src/OrderDetailPage.tsx#L332)

- Statuses are derived from PIPELINE_STAGES, so there are no literals in the pages.
  [`orders.ts:56`](../../client/admin/src/orders.ts#L56)

**Peripherals**

- The status and modal styles use tokens only.
  [`base.css:2114`](../../client/ui/base.css#L2114)

- The 4.6 test block on port 18787 covers every matrix row, the renders and the source checks.
  [`io-matrix.test.ts:11432`](../../server/web/io-matrix.test.ts#L11432)

- Races: admin against admin, and a move against a cancel, on one expected status.
  [`io-matrix.test.ts:11936`](../../server/web/io-matrix.test.ts#L11936)
