---
title: 'Story 2.3 — Individual items'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '617ef76017f5fae54837759ae96271a03243b07a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Items is an empty heading. Gothami cannot record stationery and similar stock outside a pack.

**Approach:** `catalog` stores each item as a title, a required description, and an integer-rupee price, separate from the book master. Admin Items can add, edit those three fields, and archive. Empty list offers **Add item**. Items are never pack members.

## Boundaries & Constraints

**Always:** New `server/catalog/items.ts` owns writes — not identity, `named.ts`, `books.ts`, or `packs.ts`. Admin via `lookupSession` + `role === 'admin'`. 403 sentence: `Only the shop owner can change the item list. Sign in as the shop owner to continue.` Parents and anonymous get `{ error: { code, message } }` and must not insert or update. Table `items` (`id`, `title`, `description`, `price` INTEGER, `archived_at`, `created_at`). No `pack_items`. JSON `{ id, title, description, price, archivedAt }` with `price` stored, not summed. POST and PATCH both `{ title, description, price }`. Empty title message exactly `Enter an item title.` Leave `Enter a book title.` unchanged. Description: `validateDescription`. Price: `validatePrice` (integer ≥ 1; refuse string, float, `0`). Unknown id: `404` `That item is not on the list.` Archive stamps `archived_at` and stays on the admin list. No items DELETE route. Admin GET includes archived rows. No cart or order rows. Empty screen shows **Add item**. List: title, `formatRupees(price)`, Archived; description lives in the form. Existing filled `Rs.` prefix. No image upload. Inline errors keep typed values. One primary. SQL snake_case; JSON camelCase. Mount on `createCatalogRouter` after packs.

**Ask First:** A public item list this story. Unique titles. A max length on title or description. Any new dependency. Changing the book title message.

**Never:** Storefront Browse, pack configure, cart, orders, `pack_items`, an item id on a pack, stretching `NamedKind` / `CatalogNamedPage` / `BooksPage` / `PacksPage`, image uploads, identity cookies, hard-delete as the happy path, a loose-books catalog, a stored formatted price.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty list | Admin GET `/api/admin/items` | `200` `[]` | N/A |
| Add item | POST `{ title, description, price }` | `201`; integer `price`; `archivedAt: null` | N/A |
| Edit | PATCH the same three fields | `200`; GET shows the new values | N/A |
| Archive | POST `.../archive` | `200`; `archivedAt` set; still in admin GET | N/A |
| Invalid | Empty title or description; bad `price` | `400` `invalid_input` with `field`; no row change | Client keeps typed values |
| Anonymous | No cookie | `401` `unauthenticated` | N/A |
| Parent | Parent cookie on GET or write | `403` items sentence; no insert | N/A |
| Missing id | PATCH or archive unknown id | `404` `not_found` | N/A |
| Not a pack | Item create; pack body may still send `itemIds` | No `pack_items`; item is not a book; pack `itemIds` ignore stays as in 2.4 | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/catalog/http.ts:36-86,197-301,465-471` -- `requireAdmin(db, env, req, res, message)`. Copy `mountBooks` as `mountItems` after `mountPacks`.
- `server/catalog/books.ts:21-66` -- archive-stamp and list-includes-archived pattern only. Do not edit `books.ts` or `packs.ts`.
- `server/catalog/validation.ts:17-30,58-71` -- description and price validators. Title message for items is `Enter an item title.`
- `server/web/api.ts:30-31` -- catalog already mounted.
- `server/db/migrations/run.ts:19-25` -- append `006_catalog_items.sql` after `005`.
- `client/ui/money.ts:1-4` / `client/ui/base.css:461-492` -- `formatRupees` and `.form-field-money`. Do not restyle.
- `client/admin/src/BooksPage.tsx:336-338,377-387` / `books.ts:1-22` -- copy chrome into new files. Paths become `/api/admin/items`.
- `client/admin/src/App.tsx:33` / `Shell.tsx:12` -- replace the `/items` stub. Nav already exists.
- `server/web/io-matrix.test.ts:121,166-187,204-221,277,2211` -- packs use **18775**. Use **`18776`**. Reuse `startIdentityServer`, `sidCookie`, `cookieHeader`. Both `applied.n === 5` asserts become `6`.

**Change here**

- `server/db/migrations/006_catalog_items.sql` + `server/catalog/items.ts` + `http.ts` mount after packs. HTTP must not SQL. Read-only: migrations `001`–`005`, `books.ts`, `packs.ts`, `named.ts`, identity, storefront.
- `client/admin/src/ItemsPage.tsx` + `items.ts` + `App.tsx` -- title, description, `Rs.` price, **Add item**, archive, no file input. Read-only: `Shell.tsx`, `BooksPage.tsx`, `PacksPage.tsx`, `base.css`.
- `server/web/io-matrix.test.ts` -- one `describe` on **18776** for every matrix row, plus the two migration-count bumps.

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/006_catalog_items.sql` + `run.ts` -- `items` table -- stationery is not a book row.
- [x] `server/catalog/items.ts` + `http.ts` -- admin create/list/update/archive; no DELETE -- module owns authz and money.
- [x] `client/admin/src/ItemsPage.tsx` + `items.ts` + `App.tsx` -- empty **Add item**, three fields, archive, no images.
- [x] `server/web/io-matrix.test.ts` -- matrix on port 18776; migration counts become 6.

**Acceptance Criteria:**

- Given I am logged in as admin, when I open Items and it is empty, then I see **Add item** on that screen.
- Given I add an item, when I save a title, description, and price, then it is stored apart from the book master, it is never a pack member, the price is integer rupees with a filled `Rs.` prefix and renders `Rs. 9,320`, I can edit all three fields and archive it, and there is no image upload.
- Given I am a parent, when I call item write APIs, then the request is rejected.

## Spec Change Log

## Design Notes

`validateTitle(..., 'item')` yields `Enter a item title.` Use `Enter an item title.` and do not change the book sentence.

Books have DELETE because a live pack can reference them. Items must not be referenced. Skip DELETE, same as packs. Save always sends title, description, and price so PATCH is one path. Body example: `{ title, description, price: 9320 }`.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass; both migration counts are 6

**Manual checks:**

- `/admin/items` empty shows **Add item**; save title, description, and `Rs.` price; list shows `Rs. 9,320`; edit; archive. No image control. Parent cannot write. Both themes, narrow admin.

## Suggested Review Order

**Separate catalog**

- Items are their own rows, not books and not pack members.
  [`items.ts:43`](../../server/catalog/items.ts#L43)

- Archive stamps `archived_at` and does not delete.
  [`items.ts:78`](../../server/catalog/items.ts#L78)

**Schema**

- Stationery table stores an integer price and a required description.
  [`006_catalog_items.sql:1`](../../server/db/migrations/006_catalog_items.sql#L1)

- Migration 006 runs after the packs migration.
  [`run.ts:25`](../../server/db/migrations/run.ts#L25)

**Admin boundary**

- Empty title says “Enter an item title.” and leaves the book sentence alone.
  [`http.ts:469`](../../server/catalog/http.ts#L469)

- Parents and anonymous callers get the items 403, not the books sentence.
  [`http.ts:46`](../../server/catalog/http.ts#L46)

- Items mount on the existing catalog router after packs.
  [`http.ts:560`](../../server/catalog/http.ts#L560)

**Admin screen**

- Empty Items shows Add item; the price field uses the filled Rs. prefix.
  [`ItemsPage.tsx:433`](../../client/admin/src/ItemsPage.tsx#L433)

- The Items route replaces the old stub page.
  [`App.tsx:34`](../../client/admin/src/App.tsx#L34)

**Tests**

- The items matrix runs on port 18776 and covers every row.
  [`io-matrix.test.ts:4299`](../../server/web/io-matrix.test.ts#L4299)
