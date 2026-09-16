---
title: 'Story 2.1 — Schools and grades'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_commit: 'd0a49f0c0bff12854cfa434f2a43e73d85e8cc2e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The admin Schools and Grades screens are empty headings. Gothami cannot name the lists parents will later filter by, so the catalog has nowhere to hang a pack.

**Approach:** `catalog` stores schools and grades as named, archivable rows. Admin can add, rename, and archive both from those screens, with empty states that offer Add school / Add grade on the page. Grades are free-typed labels, not 1–13. Parent writes are refused.

## Boundaries & Constraints

**Always:** Domain writes live in `server/catalog`, not identity. Writes require `lookupSession` + `role === 'admin'` (use exported `lookupSession` / `rejectUnauthorized`; do not import private `refuseIfNotAdmin`). Parents and anonymous callers get `{ error: { code, message } }` and must not insert or update. Archive sets a timestamp/flag and hides the row from later storefront use; it is not `DELETE`. No hard-delete in the UI this story. If a DELETE route exists, it must refuse when a live pack references the row (`{ error: { code, message } }`); with no packs table yet, that check is “zero references”. Rename changes `name` only. Names are required trimmed text; empty/whitespace is `invalid_input` with `field`. Inline errors keep typed values. Empty admin list: on-screen **Add school** / **Add grade** (FR28). No image upload. JSON camelCase; SQL snake_case. One primary per surface. Catalog router mounts in `createApiRouter` before the JSON 404. Include `catalog/**/*.ts` in server tsconfig.

**Ask First:** A public (unauthenticated) list endpoint this story. Showing only live rows in admin (vs live+archived with an archived label). Any new dependency or unpinned version.

**Never:** Packs, book master, items, storefront Browse, cart, orders. Hard-delete as the admin’s happy path. Identity tables, cookies, or recovery. A fixed grade enum. Image uploads.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty lists | Admin session, no rows | `200` `[]`; UI empty state with Add school / Add grade | N/A |
| Create | Admin + valid name | `201` `{ id, name, archivedAt: null }`; row in `catalog` | N/A |
| Rename | Admin + existing id + new name | `200` updated name; same id | N/A |
| Archive | Admin + existing id | `200` with `archivedAt` set; row remains; not returned as live | N/A |
| Invalid name | Empty/whitespace/non-string | `400` `invalid_input` + `field`; no row change | Client keeps typed value |
| Unknown id | Admin + missing id | `{ error: { code, message } }`; no write | N/A |
| Hard-delete in use | DELETE while a live pack would reference it | Refusal `{ error: { code, message } }`; row remains | N/A |
| Parent / anonymous | Parent cookie or none on writes | Refusal `{ error: { code, message } }`; no write | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/identity/index.ts` -- `lookupSession`, `rejectUnauthorized` only. Catalog owns its 403 copy.
- `server/web/api.ts:25-41` -- `createIdentityRouter` then 404. Mount catalog **between** them.
- `server/db/migrations/run.ts:19-22` -- append `003_…sql`.
- `client/admin/src/ParentsPage.tsx` / `SettingsPage.tsx` -- form-stack, label-caps, keep typed values, `credentials: 'include'`, 401 → `signOut`.
- `client/ui/base.css:435-520` -- form/button classes. No empty-state class yet — add only if needed.
- `client/admin/src/App.tsx:25-26` / `Shell.tsx:7-8` -- `/schools` and `/grades` already exist as stubs.
- `server/web/io-matrix.test.ts` -- `startIdentityServer`, `sidCookie`, `cookieHeader`. Ports through **18772**. Use **`18773`**.

**Server — change here**

- `server/db/migrations/003_catalog_schools_and_grades.sql` -- `schools` and `grades`: id, name, archived_at null, created_at. No pack tables.
- `server/db/migrations/run.ts` -- append 003.
- `server/catalog/` -- replace `.gitkeep` with module: create/list/rename/archive (and DELETE-refuse-if-referenced if you expose DELETE). HTTP must not SQL.
- `server/web/api.ts` -- `createCatalogRouter`.
- `server/tsconfig.json` -- include `catalog/**/*.ts`.
- **Read-only:** identity routes, `002_*.sql`, cookies, storefront.

**Client — change here**

- `client/admin/src/SchoolsPage.tsx` / `GradesPage.tsx` (new) + `App.tsx` -- replace stubs. Empty: Add school / Add grade on that screen. List, add, rename, archive. No image control.
- **Read-only:** `Shell.tsx` destinations (already linked), Parents, Settings, Export pin, storefront.

**Tests**

- `server/web/io-matrix.test.ts` -- describe on `18773` covering every matrix row for **both** schools and grades, including parent-cookie 403.

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/003_catalog_schools_and_grades.sql` + `run.ts` -- schools and grades tables -- catalog data lives outside identity.
- [x] `server/catalog/` + `api.ts` + `tsconfig.json` -- admin-only create/list/rename/archive; parent writes refused -- module owns authz.
- [x] `client/admin/src/SchoolsPage.tsx` + `GradesPage.tsx` + `App.tsx` -- empty Add {entity}, add/rename/archive, no images -- Gothami names the lists without a deploy.
- [x] `server/web/io-matrix.test.ts` -- matrix on port 18773 for both resources.

**Acceptance Criteria:**

- Given I am logged in as admin, when I open Schools and there are none, then the list states it is empty and shows on-screen **Add school**; Grades behaves the same with **Add grade**.
- Given I add a school or grade, when I save a name, then `catalog` stores it, grades are unbounded admin-typed labels, I can rename it, and I can archive it (hide, not hard-delete).
- Given a school or grade is referenced by a live pack, when a hard-delete is attempted, then the API refuses with `{ error: { code, message } }`.
- Given I am a parent, when I call school or grade write APIs, then the request is rejected and there are no image uploads.
- Given a form is invalid, when I submit, then errors are inline, typed values are kept, and rules are enforced server-side.

## Spec Change Log

## Design Notes

Do not create a packs table here. “Referenced by a live pack” is a query that returns zero rows until Story 2.4; a DELETE route must still go through that check so 2.4 cannot forget it. Prefer archive in the UI so Gothami never sees hard-delete as the happy path.

Schools and grades are the same shape on purpose — two resources, one pattern — so Book master can copy it next.

Admin list should include archived rows with a clear archived state; otherwise she cannot tell a hide from a failed create.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors; catalog compiles
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass, including untouched identity
- Admin create school then archive -- row remains with `archivedAt`; parent POST is refused

**Manual checks:**

- `/admin/schools` empty shows Add school; add, rename, archive. Same for Grades. No image control. Parent session cannot write. Both themes, narrow admin.

## Suggested Review Order

**Catalog HTTP**

- One resource mounter serves both schools and grades before the JSON 404.
  [`http.ts:78`](../../../server/catalog/http.ts#L78)

- Writes use exported session lookup plus catalog's own 403 copy.
  [`http.ts:47`](../../../server/catalog/http.ts#L47)

- DELETE refuses live pack refs with `in_use`; the UI never offers it.
  [`http.ts:146`](../../../server/catalog/http.ts#L146)

- Router mounts after identity and before the catch-all 404.
  [`api.ts:31`](../../../server/web/api.ts#L31)

**Persistence**

- Schools and grades are named rows with nullable `archived_at`, no pack tables.
  [`003_catalog_schools_and_grades.sql:1`](../../../server/db/migrations/003_catalog_schools_and_grades.sql#L1)

- SQL stays in the catalog module; HTTP does not query.
  [`named.ts:44`](../../../server/catalog/named.ts#L44)

- Archive stamps `archived_at` and leaves the row for the admin list.
  [`named.ts:66`](../../../server/catalog/named.ts#L66)

- Live-pack count is zero until `packs` exists; Story 2.4 must keep these columns.
  [`named.ts:83`](../../../server/catalog/named.ts#L83)

- Names are required trimmed text; non-strings are not coerced.
  [`validation.ts:9`](../../../server/catalog/validation.ts#L9)

**Admin UI**

- Empty Schools offers on-screen Add school; Grades reuses the same page.
  [`SchoolsPage.tsx:3`](../../../client/admin/src/SchoolsPage.tsx#L3)

- Empty copy and Add hide on load failure; list is not capped at the form width.
  [`CatalogNamedPage.tsx:273`](../../../client/admin/src/CatalogNamedPage.tsx#L273)

- Add, rename, and archive stay on `/api/admin/...` helpers; no file input.
  [`catalogNamed.ts:13`](../../../client/admin/src/catalogNamed.ts#L13)

- Existing `/admin/schools` and `/admin/grades` routes now render the pages.
  [`App.tsx:27`](../../../client/admin/src/App.tsx#L27)

**Tests**

- Port 18773 covers both resources, including parent 403 and live GET after create.
  [`io-matrix.test.ts:2316`](../../../server/web/io-matrix.test.ts#L2316)
