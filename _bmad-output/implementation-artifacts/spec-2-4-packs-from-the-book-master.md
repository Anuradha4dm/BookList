---
title: 'Story 2.4 — Packs from the book master'
type: 'feature'
created: '2026-09-18'
status: 'done'
baseline_commit: '604284627fabb398a80f8cdc17283835feb7d162'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packs is an empty heading. Gothami cannot name a list for a school and grade or fill it from the book master, so the shop has no real product and later Browse has nothing to show.

**Approach:** `catalog` stores packs as a name, school, grade, short description, and books chosen from the master. No stored pack price — displayed price is the sum of current non-archived member prices at read time. Admin Packs can add, edit name/description/membership, and archive. Empty list offers **Add pack**. Parent writes are refused.

## Boundaries & Constraints

**Always:** Domain writes in `server/catalog` (new `packs` module), not identity, not `named.ts`, not `books.ts`. Admin via `lookupSession` + `role === 'admin'`; packs-specific 403 — do not reuse school/grade or books sentences. Parents and anonymous get `{ error: { code, message } }` and must not insert or update. Tables: `packs` (`id`, `name`, `school_id`, `grade_id`, `description`, `archived_at` null, `created_at`) and `pack_books` (`pack_id`, `book_id`) — those join columns are already queried by `livePackReferenceCount` / `livePackBookReferenceCount`; do not rename them. No `price` column on either table; no per-member override. JSON `{ id, name, schoolId, gradeId, description, price, archivedAt, books: [{ id, title, price, archivedAt }] }` — `price` is a JSON integer computed on read as the sum of members with `archivedAt === null` (empty live set → `0`). Title-bearing `books` on admin GET include archived members so Gothami can see they dropped off the sum. A storefront projection of the same pack **omits** archived members (FR25); test that helper in-process — do not mount a public Browse route. POST `{ name, schoolId, gradeId, description, bookIds }`. PATCH `{ name, description, bookIds }` together; school/grade are set at create only (a new school year is a new pack). Name: `validateName(..., 'pack')`. Description: required trimmed string, field `description`, non-strings refused. `schoolId` / `gradeId`: live (non-archived) named rows. `bookIds`: non-empty unique array of live book ids, field `bookIds`. Unknown/archived school, grade, or book → `400` `invalid_input` with `field`. Duplicate ids in `bookIds` → `400` `field: bookIds`. Extra `itemIds` (or any items join) is ignored as input and never persisted — do not create `pack_items`. Archive stamps `archived_at` (FR20); not DELETE as the happy path. Skip a packs DELETE route. Book-price edits change later pack `price` immediately (FR27). Empty admin list: on-screen **Add pack**. List/display uses `formatRupees`. No pack price input. Inline errors keep typed values. One primary. SQL snake_case; JSON camelCase. Mount on existing `createCatalogRouter` after books.

**Ask First:** A public (unauthenticated) pack list this story. Unique pack names. Allowing an empty `bookIds` set. Editing school/grade after create. Any new dependency or unpinned version.

**Never:** Storefront Browse UI, pack configure (ticks/qty/live totals), cart, orders, items catalog, `pack_items`, a stored pack price, per-book pack override, a loose-books storefront catalog, stretching `NamedKind` / `CatalogNamedPage` / `BooksPage`, image uploads, identity tables/cookies, hard-delete as the admin happy path, renaming `packs.school_id` / `packs.grade_id` / `pack_books.pack_id` / `pack_books.book_id`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty list | Admin GET `/api/admin/packs` | `200` `[]` | N/A |
| Add pack | Valid POST `{ name, schoolId, gradeId, description, bookIds }` | `201` row; `price` = sum of those books’ current integer prices; `archivedAt: null`; `books` matches ids | N/A |
| Computed price | Member book PATCH price then GET pack | Pack `price` is the new sum; no pack row price column | N/A |
| Edit membership | PATCH name, description, `bookIds` (add/remove) | `200`; school/grade unchanged; GET shows new members and sum | N/A |
| Archive pack | POST `.../archive` | `200`; `archivedAt` set; still in admin GET | N/A |
| Archive member book | Archive a book that is on a live pack, then GET pack | Admin `books` still includes it with `archivedAt` set; `price` excludes it; storefront projection omits it | N/A |
| Invalid | Empty name/description, `bookIds: []`, unknown/archived school/grade/book, duplicate ids | `400` `invalid_input` with `field`; no row change | Client keeps typed values |
| Item in pack | POST/PATCH with only `itemIds` or a non-book id | No `pack_items`; `bookIds` rules still apply (`400` if missing/invalid) | N/A |
| Anonymous | No cookie | `401` `unauthenticated` | N/A |
| Parent | Parent cookie GET or write | `403` packs-specific message; no insert | N/A |
| Missing id | PATCH/archive unknown id | `404` `not_found` | N/A |
| Live-pack guard | Real pack on a school/grade/book, then DELETE that named/book row | Existing `409` `in_use` still holds (no more temp `CREATE TABLE packs`) | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/catalog/http.ts:33-87,185-289,291-296` -- `requireAdmin` already takes a message. Copy `mountBooks` as `mountPacks` after it. New `PACKS_FORBIDDEN_MESSAGE`. `validateName(body.name, 'pack')` + new description validator + id/bookIds checks. No price field reader.
- `server/catalog/books.ts:21-98` / `named.ts:30-109` -- **pattern only** (archive stamp, list includes archived). Do not write packs into these modules. Keep `livePackReferenceCount` (`packs.school_id` / `grade_id`, live = `archived_at IS NULL`) and `livePackBookReferenceCount` (`pack_books.pack_id` + `book_id` join live packs) unchanged.
- `server/catalog/validation.ts:9-38` -- `validateName` / `validateTitle` / `validatePrice`. Add `validateDescription`.
- `server/web/api.ts:26-31` -- catalog already mounted.
- `server/db/migrations/run.ts:19-24` -- append `005_…sql`.
- `client/ui/money.ts` / `formatRupees` -- list/display of computed `price`.
- `client/ui/base.css:435-606` -- form + catalog-list. Do not restyle money; packs have no money input.
- `client/admin/src/BooksPage.tsx:21-36,377-417` -- empty Add, Archive, `asBook` filter. Copy chrome; do not extend this file. Add Name, School select, Grade select, Description textarea, live-book checkboxes. No `Rs.` input.
- `client/admin/src/books.ts` / `catalogNamed.ts` -- copy as `packs.ts`; also GET schools/grades/books for selects.
- `client/admin/src/App.tsx:31` / `Shell.tsx:11` -- `/packs` stub and nav exist.
- `server/web/io-matrix.test.ts:111,2594-2634,3174-3204` -- books own **18774**. Use **`18775`**. Reuse `startIdentityServer`, `sidCookie`, `cookieHeader`. Rewrite the two live-pack `CREATE TABLE IF NOT EXISTS packs` fixtures to insert via the real pack API (or full real columns) so `NOT NULL` name/description/school/grade do not break `in_use`.

**Server — change here**

- `server/db/migrations/005_catalog_packs.sql` -- `packs` + `pack_books` as above. No price. No `pack_items`.
- `server/catalog/packs.ts` -- create/list/update/archive; compute `price`; admin books vs storefront omit-archived helper. HTTP must not SQL.
- `server/catalog/http.ts` -- mount `/admin/packs` after books.
- **Read-only:** `004_*.sql`, `books.ts`, `named.ts`, identity, cookies, storefront, `tsconfig.json`.

**Client — change here**

- `client/admin/src/PacksPage.tsx` + `packs.ts` + `App.tsx` -- replace stub. Empty **Add pack**. Form: name, school, grade, description, book checkboxes from live master. List: name, school/grade labels, `formatRupees(price)`, Archived. Edit name/description/books, not school/grade. Archive. No file input, no price field.
- **Read-only:** `Shell.tsx`, `BooksPage.tsx`, money CSS, schools/grades pages.

**Tests**

- `server/web/io-matrix.test.ts` -- describe on **18775** covering every matrix row, including parent 403, computed integer `price`, archive-member omit, no `pack_items`, and updated named/book `in_use` fixtures. Leave **18774** books block intact except those two fixtures.

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/005_catalog_packs.sql` + `run.ts` -- packs + pack_books, no stored price -- join columns match existing live-pack guards.
- [x] `server/catalog/packs.ts` + `validation.ts` + `http.ts` -- admin-only create/list/update/archive; computed price; parent writes refused -- module owns authz.
- [x] `client/admin/src/PacksPage.tsx` + helpers + `App.tsx` -- empty Add pack, school/grade/books compose, computed `Rs.` display, archive, no images.
- [x] `server/web/io-matrix.test.ts` -- matrix on port 18775; retarget existing `in_use` fixtures to the real packs schema.

**Acceptance Criteria:**

- Given at least one school, grade, and book exist, when I open Packs and it is empty, then I see **Add pack** on that screen.
- Given I create a pack, when I save a name, school, grade, short description, and books from the master, then those references are stored, the pack has no stored price, displayed price is the sum of current non-archived member prices, a pack cannot override a book’s price, I can add and remove books, a new school year is a new pack, and I can archive a pack (hidden from storefront, retained).
- Given I archive a book that belongs to a live pack, when that pack is read for the storefront, then the book is omitted from the storefront member list and from the computed price, and no order rows are invented.
- Given I try to put an individual item into a pack or expose a loose-books catalog, when the request is handled, then items cannot be pack members and books stay inside packs only.

## Spec Change Log

## Design Notes

Packs are not a `NamedKind` and not a price on `books`. Copy the books HTTP/archive skeleton; extra fields are school, grade, description, and a join table. Save always sends name + description + bookIds so PATCH stays one code path.

Do not create `pack_items`. Compose chooses live books only. Archiving a member later leaves the join row; storefront reads skip it.

Admin GET includes archived packs with an Archived label. Computed `price` never includes archived members, including on admin JSON, so the figure matches what Browse will show.

This branch is `origin/main` (through 2.2). Items/2.3 is not present — do not add an items module to refuse membership. Migration number is **005** here; unmerged 2.3 also wants 005 for items — do not pre-skip to 006 unless asked.

Existing schools/grades/books `in_use` tests insert a skinny `packs` table. After this migration that `CREATE TABLE IF NOT EXISTS` is a no-op and a partial INSERT will fail. Those tests must create a real live pack.

## Verification

**Commands:**

- `npm run typecheck && npm run build`
- `node --import tsx --test server/web/io-matrix.test.ts` -- including untouched books on 18774 except the rewritten `in_use` fixtures
- Create pack of books priced `5000` and `4320`; GET `price: 9320`; archive the `4320` book; GET `price: 5000` and storefront members omit it; parent POST refused; `bookIds: []` is `400` `field: bookIds`

**Manual checks:**

- `/admin/packs` empty shows Add pack; add name+school+grade+description+two books; list shows `Rs. 9,320`; edit membership; archive. No image, no price input. Parent cannot write. Both themes, narrow admin.

## Suggested Review Order

**Catalog HTTP**

- Packs mount on the existing catalog router, after books.
  [`http.ts:470`](../../server/catalog/http.ts#L470)

- Admin-only pack collection; packs-specific 403 copy.
  [`http.ts:386`](../../server/catalog/http.ts#L386)

- Create reads school/grade/books; PATCH does not retarget school or grade.
  [`http.ts:350`](../../server/catalog/http.ts#L350)

**Persistence**

- Packs and pack_books have no price column; join names match live-pack guards.
  [`005_catalog_packs.sql:1`](../../server/db/migrations/005_catalog_packs.sql#L1)

- Displayed price is the sum of non-archived members, never stored.
  [`packs.ts:37`](../../server/catalog/packs.ts#L37)

- Storefront projection omits archived members from the list and the sum.
  [`packs.ts:92`](../../server/catalog/packs.ts#L92)

- PATCH keeps archived join rows so admin GET still shows who dropped off.
  [`packs.ts:83`](../../server/catalog/packs.ts#L83)

**Validation**

- Description is required trimmed text; non-strings are refused.
  [`validation.ts:25`](../../server/catalog/validation.ts#L25)

- Membership is a non-empty unique array of live book ids.
  [`validation.ts:32`](../../server/catalog/validation.ts#L32)

**Admin UI**

- Empty Packs offers on-screen Add pack; no price input or image control.
  [`PacksPage.tsx:604`](../../client/admin/src/PacksPage.tsx#L604)

- Existing `/admin/packs` route now renders the page.
  [`App.tsx:32`](../../client/admin/src/App.tsx#L32)

**Tests**

- Port 18775 covers the matrix, parent 403, computed price, and archived-member omit.
  [`io-matrix.test.ts:3303`](../../server/web/io-matrix.test.ts#L3303)

