# Epic 4 Context: Capture the order and work the morning list

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the persisted cart into real orders and give the shop one place to work them. Parents check out (account address, a fixed "delivery to be confirmed" line, optional note, stale lines resolved inline), place exactly once to get a snapshotted order with a short number like `#1042`, follow it on My Orders through a vertical pipeline, and cancel while it is still only placed. The admin works one Orders screen (open and past, status filter), confirms with a delivery price in the same action after a real phone call, marks call attempts, advances or cancels with a reason the parent can see, and exports a zip of CSVs plus the SQLite file. This replaces the vendor's paper notebook and is the first point where the app produces a payable total.

## Stories

- Story 4.1: Checkout — address, delivery line, note, and stale lines
- Story 4.2: Place Order — snapshot, number, one tap
- Story 4.3: My Orders — pipeline, cancel, and reason
- Story 4.4: Admin Orders — one list, open and past
- Story 4.5: Confirm the order and mark the call
- Story 4.6: Advance, skip forward, and close the order
- Story 4.7: Export the season

## Requirements & Constraints

- Checkout and Place require an authenticated parent. Only parents place orders; the admin can never create one. Cash on delivery; the app handles no payment.
- Checkout shows goods total only and the fixed line `Delivery charge: to be confirmed by the shop`. No delivery fee is calculated, estimated, or collected at checkout.
- Delivery address is the one on the account; no per-order override, no address book. The Place payload cannot substitute an address; the server uses identity's address.
- One optional free-text parent delivery note, set at Place only; admin reads it. No private admin scratchpad on the order. The only admin writing is the cancellation reason.
- Staleness: checkout compares each line to live catalog and flags archived pack/item, archived or removed constituent book, or changed price. Unavailable lines must be removed; repriced lines need explicit acceptance of the new figure. Nothing is silently substituted or repriced. Place refuses unresolved flags.
- Place creates exactly one order per checkout (idempotent), captures a full snapshot, allocates a collision-free short sequential number, sets `Order Is Placed`, and empties the cart. Failures leave no half-placed order. A lost session mid-checkout leaves the cart on the server.
- Parents see only their own orders, including Delivered and Cancelled. Order detail shows snapshot lines and prices, goods total, delivery charge once set, and payable total. Before confirmation it says delivery is still to be confirmed. A Cancelled order shows the admin's reason.
- Parent cancel is allowed only while `Order Is Placed`. If parent cancel and admin confirm race, the first commit wins, the loser is told, and a Cancelled order never carries a payable total.
- Admin order detail: parent name, WhatsApp, second phone (fallback contact) if given, snapshot address, note, snapshot lines, goods total. Placed contents are never editable.
- Call-attempted records a timestamp; "never called" and "called, no answer" must look different.
- Confirm sets `Order Confirmed` plus a required, non-negative integer-rupee delivery price in one action. Payable total = snapshot goods + delivery. After confirm the order is frozen.
- Status transitions: only admin advances; nothing past Order Confirmed without going through it; forward among Processing through On Delivery Partner may skip; backward floors at Order Confirmed; Delivered and Cancelled are final and need a confirmation prompt; cancel from any non-terminal state requires a reason; every transition checks expected current status and stale writes are rejected with an explanation. No separate paid status; no notifications.
- Export (admin only, any time): one zip with order and catalog CSVs (Excel-openable) plus a copy of the SQLite file. Parent requests are rejected.
- All rules enforced server-side. Errors are `{ error: { code, message } }`. Every failure (rejected transition, lost session, unavailable line, duplicate submit, failed export) has a defined message.

## Technical Decisions

- The `orders` module owns placed orders, snapshots, `public_number`, status, `delivery_price_rupees`, `payable_total_rupees`, `parent_delivery_note`, `cancellation_reason`, call-attempted, and export assembly. Dependencies run `web → orders → cart → catalog`, with `identity` used by all. `orders` reads catalog and cart only through their TypeScript functions, never their tables.
- Cart GET may annotate live catalog state (archived / removed / repriced) but must never rewrite stored add-time titles or prices. Acceptance of a reprice is an explicit parent action.
- Place Order is one SQLite transaction: copy the acknowledged configuration (pack names, book titles, item titles, unit prices, quantities) plus identity's address and contact numbers, allocate sequential `public_number`, empty the cart, set status. It never reads catalog or profile again afterwards. The client sends an `Idempotency-Key` header and the server dedupes on it.
- Stored status strings, exactly: `Order Is Placed`, `Order Confirmed`, `Processing`, `Packing The Order`, `Ready To Deliver`, `On Delivery Partner`, `Delivered`, `Cancelled`.
- Order Confirmed is one transaction: expected-status check, delivery price, payable total.
- Money is integer rupees in DB and JSON. Time is UTC text in DB and shown in Asia/Colombo. Integer PKs; the public order number is a separate short integer shown as `#1042`. SQL is snake_case, JSON camelCase.
- Parent pipeline visibility may poll. No WebSocket or push, no outbound messaging, no worker or queue. Migrations for orders come after identity, catalog, and cart.
- Export: `orders` builds the zip from catalog reads plus its own reads; `web` does not dump tables.

## UX & Interaction Patterns

- Checkout: the delivery line sits on an accent-quiet strip above the goods total. Staleness is inline per line, not a modal: unavailable shows a danger notice with Remove; repriced shows a warning notice with `Accept Rs. …` and Remove. A summary danger banner counts lines still needing attention. Place Order stays in place as the blocked primary until every flag is resolved, and the blocked state is announced to screen readers.
- Place success lands on My Orders with the cart empty and the short number visible. The empty cart is still `Cart is Empty` plus refresh. Empty My Orders shows `No Orders yet.` plus a refresh icon.
- Parent order detail uses a vertical timeline (completed ticked, current emphasised, remaining quiet), never a horizontal stepper. Parent cancel opens a one-deep confirmation modal and then stays on My Orders with the order still listed.
- Status pill for all eight statuses, distinguished before hue by step number (`×` for Cancelled), glyph, border weight/style, and corners. Cancelled strikes its label. `Order Is Placed` is neutral grey. `Ready To Deliver` is the only mustard pill.
- Admin lands on Orders: all orders with a clear open/past split, grouped by status in pipeline order (3px strong rule, mustard count badge), status filter only, and no Add order. Rows show order ID, parent, lines summary, status pill, and call chip. Rows needing a call get an 8px strong left edge. Below about 900px rows reflow to two lines while keeping 44px targets. Empty and filter-empty lists say they are empty.
- Call chip: `Not called yet` has a dashed edge and hollow ring. `Called · no answer` plus timestamp has warn-tint, a solid warning edge, and a filled handset.
- Terminal actions (parent cancel, admin Delivered, admin Cancelled) use a modal with a solid destructive confirm and a secondary Cancel. The delivery price field uses a filled `Rs.` prefix block.
- Export lives at the bottom of the admin sidebar, set apart. While it runs only a spinner icon shows. Failure copy: `Exporting Job failed try again later`. Success is just the download.
- Motion stays at 120–200ms and never runs on the path to Place Order or the admin's next status change. Honour `prefers-reduced-motion`.

## Cross-Story Dependencies

- Depends on Epic 1 (sessions, account address and contacts), Epic 2 (live catalog state for staleness, catalog reads for export), and Epic 3 (persisted cart lines with add-time figures).
- 4.1 provides staleness resolution that 4.2 relies on; Place must refuse unresolved flags. 4.2 creates the orders that 4.3–4.7 consume.
- 4.3's parent cancel and 4.5's admin confirm share the first-commit-wins race. 4.5 (confirm) must happen before 4.6's forward transitions. 4.6's status changes and cancel reasons appear on 4.3's parent view.
- 4.4's list rows link to the 4.5/4.6 detail and actions. 4.7 needs orders data and catalog reads.
