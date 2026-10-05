---
title: 'Export the season'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '25da8685d72e519491b3f71b4909ffd828a196ea'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The season's orders and catalog live only in one SQLite file on the host. A redeploy or a lost volume would wipe them, and Gothami has no copy she can open. The sidebar `Export` link only leads to a placeholder page.

**Approach:**
- Add one admin-only `GET /api/admin/export`. It returns one zip with Excel-openable CSVs of orders and catalog, plus a consistent copy of the SQLite file.
- `orders` builds the zip. Catalog data comes from `catalog` TS functions; order data comes from its own tables.
- The sidebar `Export` becomes a button. It downloads the zip in place, shows only a spinner icon while it runs, and shows the fixed failure copy if it fails.

## Boundaries & Constraints

**Always:**
- **Route** — `GET /api/admin/export` in `admin-http.ts`, using the 4.5/4.6 shape: `safe`, `Cache-Control: no-store` first, then `requireAdmin` (401 with no session, 403 for a parent).
  - Success: 200, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="booklist-export-YYYY-MM-DD-HHmm.zip"`, using Asia/Colombo time. The body is the zip buffer.
  - Any build failure: 500 `export_failed` with `Exporting Job failed try again later`. Never a partial zip.
- **Zip contents**, in this order:

  | File | Rows | Columns |
  |---|---|---|
  | `orders.csv` | 1 per order | Order, Placed, Status, Parent, WhatsApp, Second phone, Address, Note, Goods total, Delivery charge, Payable total, Call attempted, Cancelled by, Cancellation reason, Cancelled at |
  | `order-lines.csv` | 1 per pack book and 1 per item line | Order, Line, Kind (`Pack` / `Item`), Pack, Grade, Label, Title, Unit price, Quantity, Line total |
  | `schools.csv`, `grades.csv` | all, including archived | ID, Name, Archived |
  | `books.csv` | all | ID, Title, Price, Archived |
  | `items.csv` | all | ID, Title, Description, Price, Archived |
  | `packs.csv` | all | ID, Name, School, Grade, Description, Price, Archived, Books (titles joined with `; `) |
  | `booklist.db` | — | The SQLite copy |

- **Order values** come from snapshot columns only, never live catalog.
  - The order number is `#1042`.
  - Money is integer rupees with no `Rs.`; an unset value is blank.
  - Times are Asia/Colombo `YYYY-MM-DD HH:mm`, or blank when unset.
  - `Cancelled by` is `Parent` or `Shop`.
  - Orders are sorted by `public_number`, and lines by order then `position`.
  - In `order-lines.csv`, a pack-book row's `Line total` is unit price × quantity.
- **CSV format** (Excel):
  - UTF-8 with a BOM, CRLF line endings and a header row.
  - RFC 4180 quoting for `,`, `"`, CR and LF.
  - A string cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`, to block formula injection. Numbers are written raw.
  - Exception: a phone-shaped value, which is `+` followed only by digits and spaces (for example `+94771234567`), is written as is with no `'`. Excel may show it as a number without the `+`; that is accepted.
- **Consistency** — the CSV reads run in one read transaction. The DB copy is `db.serialize()`, which is WAL-safe and needs no temp file and no `DATABASE_PATH`.
- **Zip writer** is hand-rolled on `node:zlib` (`crc32`, `deflateRawSync`) with no new dependency.
  - Local headers, a central directory and an EOCD record; DOS time from the export instant; UTF-8 flag on.
  - CSVs are deflated; the db is deflated as well.
- **Client** (`Shell.tsx`) — `Export` becomes a `button.nav-item` inside the existing `.admin-sidebar-export`.
  - Click → `fetch('/api/admin/export', { credentials: 'include' })` → blob → a temporary object-URL `<a download>` with the server's filename → revoke the URL.
  - While busy: the button shows only an inline spinner icon, with `aria-busy`, an accessible name `Exporting`, and single-submit.
  - Success: nothing else on screen.
  - Non-OK or network error: `Exporting Job failed try again later` in `p.form-error text-meta role="alert"` under the button. It clears on the next attempt.
  - 401 → `signOut()`.
  - Remove the `/export` placeholder route from `App.tsx`.
- **Inline spinner** — a token-only, icon-sized variant of the spinner (for example `.spinner-disc.is-inline`). It honours the existing reduced-motion rule.

**Ask First:** A new runtime dependency. Changing an existing JSON contract. Adding an import/restore path.

**Never:**
- `web` dumping tables.
- SQL naming catalog, cart or identity tables inside `server/orders/`. Note that the test regex is case-insensitive, so this includes comments like "from books".
- `db.prepare` in `admin-http.ts`.
- Writing to the DB during export.
- Browser storage.
- A success screen, toast or modal.
- Zip64 or streaming.
- Exporting sessions, password hashes or recovery codes in the CSVs. They exist only inside the db copy, which is the restore file.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export | Admin, one confirmed and one admin-cancelled order, an archived book | 200 zip with 8 entries in order. `orders.csv` has both orders, the reason and a blank payable for the cancelled one. The archived book is in `books.csv`. `booklist.db` opens and has the same order rows | N/A |
| Empty season | No orders | 200 zip; the order CSVs are header-only | N/A |
| Hostile note | Note `=HYPERLINK("x")`, a comma, a quote, a newline | The cell is prefixed with `'` and correctly quoted, and parses back as one cell | N/A |
| Snapshot | Book renamed after Place | `order-lines.csv` keeps the snapshot title, and `books.csv` has the new title | N/A |
| Parent | Parent cookie | No zip | 403 `forbidden` |
| No session | No cookie | No zip | 401 |
| Build throws | Forced failure | No partial body | 500 `export_failed`, `Exporting Job failed try again later` |
| Client fail | Non-OK or network error | Spinner ends, alert copy shows, nothing is downloaded | Retry clears it |

</frozen-after-approval>

## Code Map

- **`server/orders/export.ts`** (new):
  - `buildSeasonExport(db, now: Date) → { fileName, zip: Buffer }`.
  - Order SQL reads only `orders`, `order_pack_lines`, `order_pack_line_books` and `order_item_lines`. The columns are listed in migrations 009/010/011, and `call_attempted_at` is from 011.
  - Catalog data comes through `listNamed(db,'school'|'grade')` (`catalog/named.ts:30`), `listBooks` (`books.ts:21`), `listItems` (`items.ts:29`) and `listPacks` (`packs.ts:339`, with `books[]`). Import them by deep path, as in `orders/place.ts:9`.
  - Pack School and Grade names are resolved from the `listNamed` results.
  - The CSV writer and the Colombo formatter are local to this file. Use `Intl` with `timeZone:'Asia/Colombo'`, as in `client/admin/src/OrdersPage.tsx:38`.
- **`server/orders/zip.ts`** (new) — `zipFiles(entries:{name,data:Buffer}[], at:Date): Buffer`.
- **`server/orders/admin-http.ts`**:
  - `sendError` is at L32, `safe` at L38-50 (it already guards `headersSent`), and `requireAdmin` at L52-69.
  - Add the route inside `createAdminOrdersRouter` (L111). Send with `res.status(200).type('application/zip').setHeader('Content-Disposition', …).end(buf)`.
  - Catch build errors and send `export_failed`.
- **`server/web/db.ts:6-12`** — read only. The handle is WAL, and `db.serialize()` comes from better-sqlite3 13.
- **`client/admin/src/Shell.tsx`**:
  - The export block is at L59-66; replace the NavLink with the button.
  - `useAdminAuth().signOut` is already in scope (L19).
  - The logout-error markup (L42-46) is the pattern for the alert.
- **`client/admin/src/App.tsx:40`** — delete the export route. `Page` may become unused; if so, remove its import.
- **`client/ui/base.css`**:
  - `.spinner` / `.spinner-disc` are at L1355-1375, and `.admin-sidebar-export` at L1047.
  - The reduced-motion rule is at L2185.
- **`server/web/io-matrix.test.ts`**:
  - Ports are at L183-221. Add `EXPORT_PORT = 18788` after L219.
  - Copy the 4.6 block helpers (L11486+: `signInAdmin`, `registerParent`, `placeOne`, `post`, `readDb`).
  - **Checks to narrow:**
    - L2190: the placeholder route assertion. Assert that the route is gone.
    - L2195-2196: keep `admin-sidebar-export`, and replace `to="/export"` with the button/fetch assertions.
    - L2406 ordering still holds.
  - **Must still pass:** the orders-dir SQL bans (L9032-9039, L9871-9878, L10521); the `admin-http.ts` `db.prepare` bans (L10503, L11350, L12164); the token-only CSS checks.

## Tasks & Acceptance

**Execution:**
- [x] `server/orders/zip.ts` -- A minimal zip writer (deflate, CRC32, central directory, EOCD, UTF-8 names). -- No dependency is added.
- [x] `server/orders/export.ts` -- One read transaction for the order and catalog CSVs, the Excel-safe CSV writer, `db.serialize()`, the filename, and the zip. -- This is the AD-10 assembly.
- [x] `server/orders/admin-http.ts` -- Add `GET /admin/export`: no-store, `requireAdmin`, the zip response, and `export_failed`. -- This is the HTTP contract.
- [x] `client/admin/src/Shell.tsx` -- Add the Export button with fetch→blob download, the spinner-only busy state, the failure alert, and the 401 signout. -- This is UX-DR31.
- [x] `client/admin/src/App.tsx` -- Remove the placeholder `/export` route. -- Export is an action, not a page.
- [x] `client/ui/base.css` -- Add the inline spinner variant and the export button/alert spacing, using tokens only. -- These are the visuals.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.7 block on 18788 that covers every matrix row.
  - The test unzips with its own small central-directory parser plus `inflateRawSync`, parses the CSVs, and opens `booklist.db` with better-sqlite3 from a temp file.
  - Force the failure through an env hook only if one already exists. Otherwise unit-test `buildSeasonExport` with a closed db handle and expect a throw, and assert that the route maps a throw to `export_failed` by source check.
  - Add source checks: `export.ts` imports the catalog functions and has no catalog SQL; there are no zip dependencies in `package.json`; and the Shell has no `/export` link. Narrow L2190 and L2195-2196.

**Acceptance Criteria:**
- Given the admin is logged in, when they click Export, then only a spinner icon shows in its place until one `booklist-export-….zip` downloads, and no other screen or message appears.
- Given the export request fails, when the spinner ends, then `Exporting Job failed try again later` shows under Export and the next click clears it.
- Given the downloaded zip, when its CSVs are opened in Excel, then Sinhala and Tamil text and multi-line notes display correctly in single cells. The `booklist.db` copy can replace the live file to restore the season.
- Given the server process restarts, when the admin exports again, then the same orders are present (NFR10).

## Spec Change Log

- **Iteration 1 (review, 2026-10-05).** *Trigger:* the formula guard prefixed every stored phone (`+94…`) with `'`, so every WhatsApp and second-phone cell in `orders.csv` showed a literal apostrophe, and no test read those columns. *Amended (human-approved, option 1):* the CSV format rule now exempts phone-shaped values (`+` followed only by digits and spaces). *Avoids:* `'+94…` in every phone cell. *KEEP:* the rest of the implementation passed review. It was not reverted or rebuilt; only the cell rule and the review patches change.

## Design Notes

- **Order CSVs are snapshot-only. Catalog functions feed only the catalog CSVs** (from the adversarial review, L159). This is why there is no live join, and why a renamed book shows two different titles across the files.
- **Why `db.serialize()` instead of `copyFile`:** a WAL database's main file can lag behind its `-wal` file, so a raw copy can lose recent orders. `serialize()` returns a consistent image.
- **Why GET:** it is a read-only, idempotent download. Cross-site pages cannot read the response, and cookie auth plus `requireAdmin` gates it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18788 block and all earlier blocks

## Suggested Review Order

**Assembly (the core)**

- Entry point: one deferred read transaction feeds every CSV and the `db.serialize()` copy.
  [`export.ts:291`](../../server/orders/export.ts#L291)

- The WAL-safe database image, taken inside the same read snapshot as the CSVs.
  [`export.ts:298`](../../server/orders/export.ts#L298)

- Catalog data comes only through catalog's list functions (AD-10), never its tables.
  [`export.ts:2`](../../server/orders/export.ts#L2)

- Order lines come from snapshot tables only, with pack books and items merged by position.
  [`export.ts:177`](../../server/orders/export.ts#L177)

**Excel-safe CSV**

- The formula guard, with the human-approved exemption for phone-shaped values.
  [`export.ts:94`](../../server/orders/export.ts#L94)

- Quoting and the `'` prefix, applied per cell. Numbers stay raw.
  [`export.ts:100`](../../server/orders/export.ts#L100)

- UTF-8 BOM and CRLF, so Sinhala and Tamil text and multi-line notes open correctly in Excel.
  [`export.ts:110`](../../server/orders/export.ts#L110)

- Times stored as UTC are shown on the Asia/Colombo clock; the filename uses the same clock.
  [`export.ts:80`](../../server/orders/export.ts#L80)

**Zip writer (no dependency)**

- A hand-rolled writer on node:zlib: deflate, CRC32, central directory and EOCD.
  [`zip.ts:41`](../../server/orders/zip.ts#L41)

- DOS timestamps on the Colombo clock (DOS time stores only even seconds).
  [`zip.ts:27`](../../server/orders/zip.ts#L27)

**HTTP contract**

- Admin-only GET: no-store, then requireAdmin, then the zip is built in full before any header.
  [`admin-http.ts:239`](../../server/orders/admin-http.ts#L239)

- A build throw is logged, then mapped to `export_failed`; a partial zip is never sent.
  [`admin-http.ts:248`](../../server/orders/admin-http.ts#L248)

**Admin client**

- The export flow, with injected dependencies: 401 signs out, non-OK or non-zip fails.
  [`exportSeason.ts:27`](../../client/admin/src/exportSeason.ts#L27)

- The object URL is revoked after a delay, so the browser doesn't cancel the download.
  [`exportSeason.ts:56`](../../client/admin/src/exportSeason.ts#L56)

- Shell owns the busy guard, the spinner-only state and the alert copy.
  [`Shell.tsx:30`](../../client/admin/src/Shell.tsx#L30)

- The Export button in the separated sidebar block, plus its failure alert.
  [`Shell.tsx:80`](../../client/admin/src/Shell.tsx#L80)

**Peripherals**

- An icon-sized spinner, using tokens only; the existing reduced-motion rule stops it.
  [`base.css:1386`](../../client/ui/base.css#L1386)

- The 4.7 block on port 18788: it unzips the export, parses the CSVs, opens the db copy and tests the client helper.
  [`io-matrix.test.ts:12274`](../../server/web/io-matrix.test.ts#L12274)
