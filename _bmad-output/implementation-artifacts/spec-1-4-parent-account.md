---
title: 'Story 1.4 — Parent account'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_commit: 'c7b45b6780f1796ecebed5303b9a39fa12bec334'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A signed-in parent can only see their email and log out. The shop still cannot be given a corrected name, delivery address, or phone, and the parent cannot change their password in-app.

**Approach:** Account becomes the one profile surface: show email as identity, edit name / delivery address / WhatsApp / optional second phone, and optionally set a new password, all against the session's own parent row. The current session stays valid after a password change.

## Boundaries & Constraints

**Always:** Session-bound `GET`/`PATCH /api/parents/me` only — no parent id in the URL or body. `lookupSession` + `role === 'parent'`; admin sessions get `{ error: { code, message } }` and must not read or write a parent row. Reuse `validateRequiredText`, `validateMobile`, `validateOptionalMobile`, `validatePassword`, `hashSecret`. Email is displayed and never writable; ignore `email` on PATCH. Empty or omitted `password` leaves `password_hash` unchanged; a provided password is hashed and stored, and **no** `DELETE FROM sessions` runs. Current session cookie still authenticates. Success JSON camelCase; SQL snake_case. Inline errors keep typed values. One primary action (Save); Log out stays secondary. Labels match the register form: Name, Delivery address, WhatsApp number, Second phone (optional), Email, plus an optional new-password control whose empty state means "keep current". Same `{ error: { code, message, field? } }` shape as Story 1.3.

**Ask First:** Requiring the current password. Max length on name or address. Changing `GET /api/session` to carry profile fields. Any new dependency or unpinned version.

**Never:** Story 1.5 (admin password, admin-set parent password, parent records in admin). Address book or per-order override. Editable email. Forgot-password UI. Returning `password_hash` or any secret. Copying admin recovery's session wipe (`http.ts:356`). Catalog, cart, or orders behaviour. New cookie names or a second session scheme.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load own profile | Parent session | `200` `{ name, deliveryAddress, whatsapp, secondPhone, email }` | N/A |
| Save profile | Valid PATCH of name/address/phones | `200` same shape; only that parent row changes; phones stored as `+947XXXXXXXX` | N/A |
| Optional password omitted | PATCH with empty/absent `password` | Hash unchanged; session still `ok` | N/A |
| Change password | PATCH with valid new password | New `scrypt` hash; **this** session still authenticates; old password fails `POST /session`; new password succeeds | N/A |
| Invalid fields | Several bad values on PATCH | `400` `{ error: { code: 'invalid_input', message, field } }` naming one field; no row change | Client keeps every typed value and flags that field |
| Anonymous | No/stale cookie on GET or PATCH | `401` `unauthenticated`; stale clears cookie | N/A |
| Admin session | Valid admin cookie on GET or PATCH `/parents/me` | Refusal `{ error: { code, message } }`; no parent row read or written | N/A |
| Foreign id | PATCH body includes some other `id` | Ignored; only `current.account.id` is updated | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/identity/http.ts:58-67,108-135` -- `sendError`, `lookupSession`, `rejectUnauthorized`. Call these; do not invent a parallel guard.
- `server/identity/http.ts:356` -- recovery wipes admin sessions. **Read-only anti-pattern** for this story.
- `server/identity/validation.ts:26-89` -- `validateRequiredText`, `validateMobile`, `validateOptionalMobile`, `validatePassword`. Field names: `name`, `deliveryAddress`, `whatsapp`, `secondPhone`, `password`.
- `server/identity/passwords.ts:31-58` -- `hashSecret` / `verifySecret`. Encoding unchanged.
- `server/identity/parents.ts:5-13,41-44` -- `ParentRow`, `findParentById`. Columns already exist; **no new migration**.
- `server/identity/index.ts:1-7` -- `lookupSession` already exported.
- `client/storefront/src/AuthGate.tsx:61-89,253-308` -- `Field` pattern and labels to mirror; storefront-scoped ids (`storefront-account-*`) so they do not collide.
- `client/ui/base.css:435-520,563-573` -- `.form-stack`, `.form-field`, `.form-control`, `.is-invalid`, `.form-error`, `.button-primary`, `.button-secondary`, `.account-summary`.
- `server/web/io-matrix.test.ts:89-90,134-189,652-689` -- `PARENT_PORT` `18769`, `startIdentityServer`, `sidCookie`, `cookieHeader`, parent `register`/`login` helpers. Pick a **new** port (e.g. `18771`) for this block so 1.3 stays isolated.

**Server — change here**

- `server/identity/parents.ts` -- add `updateParent` (contact fields) and `setParentPassword` (hash then UPDATE). Domain writes stay in the module; HTTP must not SQL the row.
- `server/identity/http.ts:159` -- `createIdentityRouter`: add `GET`/`PATCH /parents/me` after the existing `/parents` POST. Refuse `role !== 'parent'` even when lookup is `ok`. PATCH validates then updates `current.account.id` only.
- **Read-only:** `server/web/api.ts:27-38` (identity already mounted), `002_*.sql`, `cookies.ts`, `GET /session` body `{ role, email }`.

**Client — change here**

- `client/storefront/src/App.tsx:15-36,51` -- replace inline `AccountPage` with a real page (extract if the file would otherwise mix routing and the form).
- `client/storefront/src/auth.tsx:20-28` -- keep session auth-only. Profile GET/PATCH live on the Account page (or a sibling module), `credentials: 'include'`. Do not extend `GET /api/session`.
- **Read-only:** `Shell.tsx` destinations, `AuthGate` land-on-Browse (`navigate('/', { replace: true })`).

**Tests**

- `server/web/io-matrix.test.ts` -- new `describe` covering every matrix row, including admin-cookie on `/parents/me` and "old password fails, current cookie still works".

## Tasks & Acceptance

**Execution:**

- [x] `server/identity/parents.ts` -- `updateParent` + `setParentPassword` on `findParentById`'s row -- domain writes stay out of HTTP.
- [x] `server/identity/http.ts` -- `GET`/`PATCH /parents/me` via `lookupSession`; parent-only; optional password; never delete sessions -- session-bound profile.
- [x] `client/storefront/src/AccountPage.tsx` (new) + `App.tsx` -- load/save form, read-only email, optional new password, Save primary, existing Log out secondary -- Account is the one surface.
- [x] `server/web/io-matrix.test.ts` -- matrix block on its own port -- regression cover without colliding with 1.3.

**Acceptance Criteria:**

- Given I am logged in as a parent, when I open Account, then I see name, delivery address, WhatsApp, optional second phone, email, and a password control, and email is not editable.
- Given I save name, delivery address, WhatsApp, and/or second phone, then only my account row is updated and inline/server validation does not discard typed values.
- Given a new password is accepted, then it is stored as a new `scrypt` hash, my current session remains valid, and a subsequent login requires the new password.
- Given I am not that parent (anonymous, admin, or another account), when I request their profile, then the request is rejected with `{ error: { code, message } }` and no other parent row is read or written.

## Spec Change Log

## Design Notes

`/parents/me` rather than stuffing profile into `GET /session`: the probe stays `{ role, email }` for both apps; Account is the only consumer of contact fields.

Password is an optional field on the same PATCH, not a second endpoint and not a second primary button. Empty means leave the hash. The logged-in session is the proof of identity — do not invent a current-password field unless the human asks. Do not copy recovery's `DELETE FROM sessions WHERE admin_id = ?`.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors; both client bundles emit
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass, including untouched 1.2 and 1.3
- `GET /api/parents/me` then `PATCH` then `GET /api/session` -- profile round-trips; session still `{ role: 'parent', email }`
- After password PATCH: original cookie still `GET /parents/me` 200; `POST /session` with old password 401; with new password 200

**Manual checks:**

- Logged in, Account shows the six fields; email cannot be typed into. Save is the only primary. Invalid WhatsApp keeps every value. Both themes, narrow and 760px+. Log out still signs out.

## Suggested Review Order

**Session-bound profile API**

- GET `/parents/me` is session-only; admin role is refused before any parent row is read.
  [`http.ts:265`](../../server/identity/http.ts#L265)

- PATCH uses the same guard, then validates and writes `current.account.id` only.
  [`http.ts:292`](../../server/identity/http.ts#L292)

- Empty or whitespace password is omitted so the hash is left alone.
  [`http.ts:347`](../../server/identity/http.ts#L347)

- Response shape is camelCase contact fields with no id or secret.
  [`http.ts:144`](../../server/identity/http.ts#L144)

**Domain writes**

- Hash first, then contact + hash in one transaction so a failed hash cannot persist contact fields.
  [`parents.ts:127`](../../server/identity/parents.ts#L127)

**Account surface**

- Account stays behind the existing gate; the page is no longer an inline stub.
  [`App.tsx:27`](../../client/storefront/src/App.tsx#L27)

- Load and save use `/api/parents/me` with credentials; session probe stays `{ role, email }`.
  [`AccountPage.tsx:156`](../../client/storefront/src/AccountPage.tsx#L156)

- Email is read-only; Save is the only primary; optional new password lives on the same form.
  [`AccountPage.tsx:329`](../../client/storefront/src/AccountPage.tsx#L329)

- GET JSON maps to form/PATCH keys without a React runner.
  [`accountProfile.ts:18`](../../client/storefront/src/accountProfile.ts#L18)

- Log out stays visually secondary after the form fills the column.
  [`base.css:570`](../../client/ui/base.css#L570)

**Tests**

- Matrix block on port 18771: own profile, foreign id ignored, session kept after password change.
  [`io-matrix.test.ts:1138`](../../server/web/io-matrix.test.ts#L1138)

- Empty `secondPhone` on PATCH stays SQL null — what Account actually sends.
  [`io-matrix.test.ts:1326`](../../server/web/io-matrix.test.ts#L1326)

- Stale cookie on PATCH clears the cookie the same way GET does.
  [`io-matrix.test.ts:1391`](../../server/web/io-matrix.test.ts#L1391)

