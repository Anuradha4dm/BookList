---
title: 'Story 2.2 — Book master'
type: 'feature'
created: '2026-09-17'
status: 'done'
baseline_commit: '3641437d22213978457adaad68562441fae5b658'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Book master is an empty heading. Gothami cannot record titles and prices, so later packs have nothing to compose from and a price correction has nowhere to live.

**Approach:** `catalog` stores books as a title plus one integer-rupee price, archivable. Admin Book master can add, edit title and price, and archive from that screen. Empty list offers **Add book** on the page. Parent writes are refused.

## Boundaries & Constraints

**Always:** Domain writes live in `server/catalog` (new `books` module), not identity and not `named.ts`. Writes require `lookupSession` + `role === 'admin'`; pass a books-specific 403 — do not reuse the school/grade sentence. Parents and anonymous callers get `{ error: { code, message } }` and must not insert or update. Table `books`: `id`, `title`, `price INTEGER` (rupees), `archived_at` null, `created_at`. No edition column — the edition lives in the title string (FR15). One price on the master; no per-pack price field (FR16). JSON `{ id, title, price, archivedAt }` — `price` is a JSON integer, never a string or float. Title: required trimmed string, field `title`, non-strings refused. Price: JSON number, `Number.isInteger` and `Number.isSafeInteger`, `>= 1`, field `price`; do not coerce `"9,320"` or `9320.5`. Archive stamps `archived_at` (FR24); not `DELETE` as the admin happy path. If a DELETE route exists, refuse when a live pack references the book (`in_use`); with no `pack_books` table yet, that count is zero. Edits affect catalog reads from now on only (FR27). No image upload (FR26). Empty admin list: on-screen **Add book**. Money input: filled `Rs.` prefix; the user never types the symbol. List/display uses `formatRupees` (`Rs. 9,320`, no decimals). Inline errors keep typed values. One primary per surface. SQL snake_case; JSON camelCase. Mount on the existing `createCatalogRouter` (already between identity and the JSON 404). PATCH sends title and price together (the Save form), both validated.

**Ask First:** A public (unauthenticated) book list this story. Enforcing unique titles. Allowing price `0`. Any new dependency or unpinned version.

**Never:** Packs, items, storefront Browse, cart, orders. Stretching `NamedKind` or `CatalogNamedPage` to carry price. A separate edition field. Image uploads. Identity tables, cookies, or recovery. Hard-delete as the admin’s happy path. Changing schools/grades behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty list | Admin GET `/api/admin/books` | `200` `[]` | N/A |
| Add book | Valid POST `{ title, price }` | `201` `{ id, title, price, archivedAt: null }`; `price` is JSON integer | N/A |
| Edit | PATCH title and/or new integer price | `200` updated row; later GET shows new values only (no past-order rewrite) | N/A |
| Archive | POST `.../archive` | `200`; `archivedAt` set; row still in admin GET | N/A |
| Display | Saved price `9320` | JSON `9320`; UI `Rs. 9,320` | N/A |
| Invalid title or price | Empty title, float, string, or `0` | `400` `{ error: { code: 'invalid_input', message, field } }`; no row change | Client keeps typed values and flags that field |
| Anonymous | No/stale cookie | `401` `unauthenticated` | N/A |
| Parent session | Parent cookie on GET or write | `403` books-specific `{ error: { code, message } }`; no insert | N/A |
| Missing id | PATCH/archive unknown id | `404` `not_found` | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/identity/index.ts` -- `lookupSession`, `rejectUnauthorized` only.
- `server/catalog/http.ts:23-76,47-63` -- `sendError`, `safe`, `parseId`, `readBody`, `requireAdmin`. Generalize `requireAdmin` to take the 403 message so books do not reuse `http.ts:20-21`.
- `server/catalog/named.ts` -- **pattern only** (archive stamp, list includes archived, DELETE `in_use` when pack table appears). Do not add `'book'` to `NamedKind`.
- `server/catalog/validation.ts:8-14` -- copy the trim/non-coerce shape for `title`; add `validatePrice`.
- `server/web/api.ts:30-31` -- catalog already mounted; do not remount.
- `server/db/migrations/run.ts:19-23` -- append `004_…sql`.
- `client/ui/money.ts:1-4` / `client/ui/index.ts:4` -- `formatRupees` for list/display.
- `client/ui/base.css:441-464,575-606` -- form + catalog list. **Add** filled `Rs.` prefix (DESIGN `prefix-background` / divider); it does not exist yet.
- `client/admin/src/CatalogNamedPage.tsx:272-339` -- empty Add, Save primary, Archive, keep typed values. Copy chrome; do not extend this component.
- `client/admin/src/App.tsx:29` / `Shell.tsx:10` -- `/books` stub and nav already exist.
- `server/web/io-matrix.test.ts:102-103,2316` -- schools/grades own **18773**. Use **`18774`**. Reuse `startIdentityServer`, `sidCookie`, `cookieHeader`.

**Server — change here**

- `server/db/migrations/004_catalog_books.sql` -- `books` as above. No pack join table.
- `server/catalog/books.ts` -- create/list/update/archive (and DELETE-refuse-if-referenced if you expose DELETE). HTTP must not SQL.
- `server/catalog/http.ts` -- mount `GET`/`POST /admin/books`, `PATCH /admin/books/:id`, `POST .../archive` after the named resources.
- **Read-only:** `003_*.sql`, `named.ts`, identity routes, cookies, storefront, `tsconfig.json` (already includes `catalog/**/*.ts`).

**Client — change here**

- `client/admin/src/BooksPage.tsx` (new) + small `books.ts` helpers + `App.tsx` -- replace the stub. Empty: **Add book**. Form: Title + money field with filled `Rs.` prefix. List: title, `formatRupees(price)`, Archived. Edit title and price. Archive. No file input.
- `client/ui/base.css` -- money prefix on `.form-field`.
- **Read-only:** `Shell.tsx` destinations, `CatalogNamedPage.tsx`, schools/grades helpers.

**Tests**

- `server/web/io-matrix.test.ts` -- new `describe` on **18774** covering every matrix row, including parent-cookie 403 and integer `price` (reject float/string/`0`).

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/004_catalog_books.sql` + `run.ts` -- books table with integer `price` -- one edition is one row.
- [x] `server/catalog/books.ts` + `validation.ts` + `http.ts` -- admin-only create/list/update/archive; parent writes refused -- module owns authz and money.
- [x] `client/admin/src/BooksPage.tsx` + helpers + `App.tsx` + `base.css` prefix -- empty Add book, title+price, `Rs.` prefix, archive, no images -- Gothami maintains the master without a deploy.
- [x] `server/web/io-matrix.test.ts` -- matrix on port 18774.

**Acceptance Criteria:**

- Given I am logged in as admin, when I open Book master and it is empty, then I see **Add book** on that screen.
- Given I add a book, when I save a title and a price, then the title carries the edition, the price is integer rupees in the database and JSON, the field shows a filled `Rs.` prefix and renders `Rs. 9,320` (no decimals), I can edit title and price (from now on only), I can archive it (hidden from storefront, retained), there is no image upload, and there is no per-pack price field.
- Given I am a parent, when I call book-master write APIs, then the request is rejected.

## Spec Change Log

## Design Notes

Books are not a third `NamedKind`. Copy the auth/archive/list skeleton; the row shape is `title` + integer `price`. The Save form always sends both so PATCH stays one code path.

Edition example: title `"Mathematics Grade 6 (2026)"` — no extra column.

Money: the input is digits beside a filled `Rs.` prefix; the request body is `{ title, price: 9320 }`. Display with `formatRupees`. Do not store a formatted string.

Until Story 2.4, live-pack book refs are zero; a DELETE route must still go through that check. Prefer archive in the UI.

Admin GET includes archived rows with a clear Archived state, same as schools.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors; books compile
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass, including untouched schools/grades and identity
- Admin create book `price: 9320` then archive -- JSON integer; `archivedAt` set; parent POST refused; `price: 9320.5` is `400` `field: price`

**Manual checks:**

- `/admin/books` empty shows Add book; add title+price with `Rs.` prefix; list shows `Rs. 9,320`; edit; archive. No image control. Parent session cannot write. Both themes, narrow admin.

## Suggested Review Order

**Catalog HTTP**

- Books mount on the existing catalog router, after schools and grades.
  [`http.ts:291`](../../../server/catalog/http.ts#L291)

- Admin-only book collection and item routes; books-specific 403 copy.
  [`http.ts:196`](../../../server/catalog/http.ts#L196)

- PATCH always validates title and integer price together.
  [`http.ts:185`](../../../server/catalog/http.ts#L185)

- DELETE refuses live pack refs; UI never offers it.
  [`http.ts:263`](../../../server/catalog/http.ts#L263)

**Persistence**

- Books are title plus integer rupees, no edition column.
  [`004_catalog_books.sql:1`](../../../server/db/migrations/004_catalog_books.sql#L1)

- SQL stays in the books module; HTTP does not query.
  [`books.ts:35`](../../../server/catalog/books.ts#L35)

- Archive stamps `archived_at` and leaves the row on the admin list.
  [`books.ts:59`](../../../server/catalog/books.ts#L59)

- Live-pack count is zero until `pack_books` exists; Story 2.4 must keep these columns.
  [`books.ts:69`](../../../server/catalog/books.ts#L69)

- Title and price refuse coercion; price is a safe integer ≥ 1.
  [`validation.ts:17`](../../../server/catalog/validation.ts#L17)

**Admin UI**

- Empty Book master offers on-screen Add book; no image control.
  [`BooksPage.tsx:387`](../../../client/admin/src/BooksPage.tsx#L387)

- Price input is digits beside a filled `Rs.` prefix.
  [`BooksPage.tsx:336`](../../../client/admin/src/BooksPage.tsx#L336)

- List rows must be integer-price books before render.
  [`BooksPage.tsx:30`](../../../client/admin/src/BooksPage.tsx#L30)

- Existing `/admin/books` route now renders the page.
  [`App.tsx:30`](../../../client/admin/src/App.tsx#L30)

- Money prefix is sunken chrome; overflow does not clip the focus ring.
  [`base.css:461`](../../../client/ui/base.css#L461)

**Tests**

- Port 18774 covers the matrix, parent 403, and integer `price`.
  [`io-matrix.test.ts:2791`](../../../server/web/io-matrix.test.ts#L2791)
