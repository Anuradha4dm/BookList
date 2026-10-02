---
title: 'Admin Orders — one list, open and past'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'c348cd86633e3dffcf6b53753f436eb6a24bbc3f'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/admin` currently lands on an empty `Orders` placeholder, so the shop has no way to see the orders that parents place.

**Approach:**
- Add an admin-only `GET /api/admin/orders` that reads only the orders tables.
- Add a nullable `call_attempted_at` column now, so the call chip can render. Story 4.5 writes it.
- Replace the placeholder with an `OrdersPage`. It shows every order, split into Open and Past sections. Each section is grouped by status in pipeline order with a count per group, and there is one status filter.

## Boundaries & Constraints

**Always:**
- **Migration `011_orders_call_attempted.sql`:** adds `call_attempted_at TEXT` (nullable, UTC). Register it after 010 in `run.ts`. This story never writes the column.
- **Server:**
  - Put the admin router in a new `server/orders/admin-http.ts` (`createAdminOrdersRouter`), with the SQL in a new `server/orders/admin.ts` (`listAdminOrders`).
  - Export the router from `orders/index.ts` and mount it in `web/api.ts`.
  - Copy `requireAdmin` into the new file. A parent gets `403 forbidden` with `Only the shop owner can see all orders. Sign in as the shop owner to continue.` No session gets 401.
  - Send `no-store` as the first line of the route.
- **List JSON:** `{ orders: [{ id, publicNumber, status, placedAt, parentName, whatsapp, goodsTotal, lineCount, linesSummary, callAttemptedAt|null }] }`, newest first (`id DESC`).
  - `parentName` and `whatsapp` come from the order's own snapshot columns.
  - `lineCount` counts pack lines plus item lines.
  - `linesSummary` is the pack names, then the item titles, in `position` order, joined with `, `.
- **Grouping (client):**
  - Open covers the six non-terminal statuses. Past covers `Delivered` and `Cancelled`.
  - Each section has a heading. Inside it, show only the non-empty status groups, in `ORDER_STATUSES` order.
  - Each group header shows the status name, a mustard `rounded.full` count badge and a 3px `border-strong` bottom rule.
  - Inside a group, Open lists oldest first and Past lists newest first.
  - When a section is empty, it shows `No open orders.` or `No past orders.`.
- **Filter:** one labelled `<select>` (`Status`) with `All statuses` plus the eight statuses, in order. Its state lives in the `?status=` search param, and an unknown value means All. The filter hides rows but never changes the landing page.
- **Row** (DESIGN.md `admin-order-row`, grid `88px 1.5fr 1.1fr 152px auto`):
  - `#publicNumber` with the placed time beneath it.
  - The parent name, with WhatsApp, line count and `Rs.` total in meta.
  - `linesSummary`, ellipsised.
  - `StatusPill`.
  - The call chip, shown only while the status is `Order Is Placed`:
    - `Not called yet` has a dashed `border-default` edge and a hollow ring glyph.
    - `Called {h:mm am} · no answer` has a `warn-tint` fill, a solid `warning` edge and a filled handset glyph.
    - The chip's text is its accessible name. The glyphs are `aria-hidden`.
  - Placed rows get the attention treatment: a `border-strong` edge with an 8px left edge.
  - Below 900px a row reflows to two lines: ID and pill on the first, parent and call chip on the second. Targets stay at least 44px.
- **Times:** shown in `Asia/Colombo` through `Intl.DateTimeFormat`. Stored times stay UTC.
- **Empty states** (DESIGN.md empty-state card):
  - No orders: `No orders yet.` with a primary `Refresh` button.
  - Filter matches none: `No {status} orders.` with a primary `Show all statuses` button.
- **Load** follows `BooksPage`: an AbortController, a 401 calls `signOut`, error copy comes from the API with fallbacks, a `Refresh` button sits in the heading, and a Skeleton shows on the first load.
- Use the new class names `admin-order-*`. Do not reuse the `.order-row*` classes. Use tokens only. Motion stays at 120–200ms and respects reduced motion.

**Ask First:** A new runtime dependency. Changing a 4.2 or 4.3 contract.

**Never:**
- An `Add order` control.
- Order detail, confirm, call marking or status actions (those are 4.5 and 4.6). Rows are not links yet.
- Writing to `call_attempted_at`.
- `db.prepare` in `admin-http.ts`.
- A `FROM` or `JOIN` on foreign tables in `server/orders/*`.
- Browser storage.
- A separate completed-orders route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All orders | Parents A and B place orders; one of A's is Cancelled and one is Delivered (direct DB writes). | `200`: every order from both parents, `id DESC`, with the snapshot `parentName` and `whatsapp`. | N/A |
| Summary | An order has one pack plus two items. | `lineCount: 3`, `linesSummary: "{pack}, {item1}, {item2}"`. | N/A |
| Snapshot holds | A parent renames their account after placing. | The list still shows the placed name. | N/A |
| Call state | The DB sets `call_attempted_at` on one order. | That order has `callAttemptedAt` set. Every other order has `null`. | N/A |
| Empty | No orders. | `200 { orders: [] }`. | N/A |
| Auth | No cookie, or a parent cookie. | | `401` / `403 forbidden` |

</frozen-after-approval>

## Code Map

- `server/orders/http.ts`:
  - Patterns to copy: `sendError` (L18), `safe` (L24), the `requireParent` shape (L38).
  - The 4.3 test asserts `doesNotMatch(ordersHttp, /\/admin\//)`, which is why admin routes go in a new file.
- `server/catalog/http.ts`:
  - `requireAdmin` (L83-100) is private, so copy it.
  - The forbidden copy style is at L47-54.
- `server/orders/place.ts`:
  - `OrderSqlRow` and `toSummary` (L46-64) are patterns to follow.
  - `placeOrder` snapshots `parent_name` and `whatsapp` (L136-156).
- `server/orders/detail.ts`: the line-table reads are at L194 and use `position` order.
- `server/db/migrations/009_*.sql`: the `orders` columns and line tables. `010` is the latest. `run.ts` holds the `MIGRATIONS` array (L19-30), and 011 goes after L29.
- `server/web/api.ts` mounts the routers (L32-35).
- `client/admin/src/App.tsx`: the placeholder at L29 is `<Page title="Orders" />`. Replace it with `<OrdersPage />`.
- `client/admin/src/Shell.tsx`: the Orders nav entry (L7) already exists. Leave it unchanged.
- `client/admin/src/BooksPage.tsx`:
  - The load pattern is at L139-185, with the copy `SIGN_IN_AGAIN` and `UNREACHABLE`.
  - The list is at L392-420.
  - `books.ts` is a path helper that the test imports. Add `orders.ts` with `adminOrdersPath()`.
- `client/ui/StatusPill.tsx`: exports `ORDER_STATUSES` (L4), `PIPELINE_STAGES`, `CANCELLED_STATUS`, `isOrderStatus` and `StatusPill`. Pages must not hard-code status literals (4.3 test).
- `client/storefront/src/OrdersPage.tsx`: the Colombo `Intl.DateTimeFormat` is at L56-68. Mirror it locally in the admin page.
- `client/ui/base.css`:
  - `.nav-badge` (L572) is mustard.
  - The admin layout is at L1014-1056 and `.catalog-list` at L1250.
  - The breakpoint idiom is `@media (max-width: 899px)` (L148).
- `client/ui/tokens.css`: `--color-warning` and `--color-warn-tint` (L16 and L20, with dark twins), `--space-edge-strong` (3px), and the radius tokens (L146-151).
- DESIGN.md (`ux-designs/ux-BookList-2026-08-14/`):
  - Tokens: the call chips are at L348-359, the group header at L360-367, the row at L368-379 and the empty state at L440-450.
  - Prose: L663-677 and L703-705.
- `server/web/io-matrix.test.ts`:
  - Ports are at L154-186. `ORDERS_DETAIL_PORT` 18784 is the highest, so 4.4 uses 18785.
  - The 4.3 block (L9114) has `signInAdmin`, `registerParent`, `seed`, `placeOne`, `writeDb` and `expectRefused` to copy.
  - The source checks are at L9800-9968.

## Tasks & Acceptance

**Execution:**
- [x] `server/db/migrations/011_orders_call_attempted.sql`, `run.ts` -- Add the column and register the migration. The call chip needs it.
- [x] `server/orders/admin.ts` -- Add `listAdminOrders(db)`: one orders query plus two grouped line reads, so there are no N+1 queries.
- [x] `server/orders/admin-http.ts`, `index.ts`, `server/web/api.ts` -- Add the admin route and mount it.
- [x] `client/admin/src/orders.ts`, `OrdersPage.tsx`, `App.tsx` -- Add the path helper and the page (load, filter, sections, groups, rows, call chip, empty states), then wire up the index route.
- [x] `client/ui/base.css` -- Add the `admin-order-*`, group header, call chip, empty-state card and below-900px reflow styles, using tokens only.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.4 block on port 18785 that covers every matrix row. Add source checks:
  - 011 is listed after 010.
  - `admin-http.ts` has no `db.prepare`.
  - The page has no `Add order` and no storage.
  - The page has no status literals.
  - The `admin-order-*` rules use tokens only.

**Acceptance Criteria:**
- Given the admin signs in, when `/admin` loads, then the Orders page shows the Open and Past sections, each grouped by status with counts, and has no Add order control.
- Given the filter is set to `Cancelled`, when the page renders, then only Cancelled rows show and the URL carries `?status=Cancelled`. Given a filter that matches nothing, the filter-empty card shows with `Show all statuses`.
- Given a Placed order with no call and another with `call_attempted_at`, when the list renders, then the chips differ in edge, glyph and wording, and both rows carry the 8px attention edge.
- Given a viewport under 900px, when rows render, then each row reflows to two lines and the controls stay at least 44px.

## Spec Change Log

## Design Notes

- Filtering happens on the client over one fetch. That keeps the filter instant and the API small, because a season holds hundreds of orders, not millions.
- "Needs a call" means the status is `Order Is Placed`. A called-but-unanswered order still needs a call, so it keeps the rail and shows the warning chip.
- The empty states keep DESIGN's "one primary button" rule by using Refresh and Show all statuses. Neither of them is Add order.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18785 block and every earlier block

## Suggested Review Order

**Admin list read**

- Entry point: one orders query plus two grouped line reads, using only snapshot columns and no N+1 queries.
  [`admin.ts:39`](../../server/orders/admin.ts#L39)

- The lines summary follows `position`, not insertion order.
  [`admin.ts:53`](../../server/orders/admin.ts#L53)

- The admin-only route lives in its own file, so `http.ts` stays free of `/admin/`. It sends no-store first.
  [`admin-http.ts:58`](../../server/orders/admin-http.ts#L58)

- The copied `requireAdmin`: 401 without a session, 403 forbidden for a parent.
  [`admin-http.ts:34`](../../server/orders/admin-http.ts#L34)

**Grouping and filter (client logic)**

- Strict parse: an unknown status fails the whole list instead of an order silently vanishing.
  [`orders.ts:65`](../../client/admin/src/orders.ts#L65)

- Open is the pipeline minus Delivered, and Past is Delivered plus Cancelled.
  [`orders.ts:35`](../../client/admin/src/orders.ts#L35)

- Open and Past sections, non-empty groups in pipeline order, Open oldest first and Past newest first.
  [`orders.ts:104`](../../client/admin/src/orders.ts#L104)

- A pure `?status=` transform that keeps other params, and an unknown value means All.
  [`orders.ts:72`](../../client/admin/src/orders.ts#L72)

**Page behaviour**

- Loading: AbortController, a 401 clears the rows and then signs out, and a failed refetch keeps the last list.
  [`OrdersPage.tsx:314`](../../client/admin/src/OrdersPage.tsx#L314)

- The board: the filter select, sections, group headers with counts, and both empty cards.
  [`OrdersPage.tsx:225`](../../client/admin/src/OrdersPage.tsx#L225)

- The call chip shows only for Placed orders, with dashed and hollow versus solid and filled styling, and its text is the accessible name.
  [`OrdersPage.tsx:133`](../../client/admin/src/OrdersPage.tsx#L133)

- Colombo times: the call time adds the day when it is not today, and the placed time carries the year.
  [`OrdersPage.tsx:70`](../../client/admin/src/OrdersPage.tsx#L70)

**Styles**

- The row grid `88px 1.5fr 1.1fr 152px auto`, built from tokens.
  [`base.css:1816`](../../client/ui/base.css#L1816)

- The 8px attention edge, with compensated padding so the columns stay aligned.
  [`base.css:1830`](../../client/ui/base.css#L1830)

- The two-line reflow below 900px, keeping 44px targets.
  [`base.css:1930`](../../client/ui/base.css#L1930)

**Peripherals**

- The migration adds a nullable `call_attempted_at`, which this story only reads.
  [`011_orders_call_attempted.sql:2`](../../server/db/migrations/011_orders_call_attempted.sql#L2)

- The router mount and the index route swap.
  [`api.ts:36`](../../server/web/api.ts#L36)
  [`App.tsx:30`](../../client/admin/src/App.tsx#L30)

- The 4.4 matrix block on port 18785: HTTP rows, client logic, renders and source checks.
  [`io-matrix.test.ts:9980`](../../server/web/io-matrix.test.ts#L9980)
