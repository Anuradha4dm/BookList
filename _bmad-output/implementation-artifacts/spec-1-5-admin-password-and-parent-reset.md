---
title: 'Story 1.5 — Admin password and parent reset'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_commit: 'c55f0b9cd3dd50d8a90dc7206afc3acef7862a78'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Gothami can sign in, but she cannot change her own password in the admin app, and a parent who forgot theirs has no recovery path except the parked reset-email idea.

**Approach:** Logged-in admin gets a simple Settings field to set a new password, and a Parents surface that finds a parent by email and sets a new password she will tell them out of band. The Story 1.2 recovery-code API stays as-is with no extra recovery UI. Parents cannot call these APIs.

## Boundaries & Constraints

**Always:** Both writes require `lookupSession` + `role === 'admin'`. Parents and anonymous callers get `{ error: { code, message } }` and must not change any hash. Reuse `validatePassword` and `hashSecret`. Never return `password_hash` or any secret. Admin self-change hashes into the singleton `admins` row (`id` from the session; `CHECK (id = 1)` stays). Parent reset finds by normalised email via `findParentByEmail`; unknown email is a named `{ error }` with no row change. After a parent reset, that parent can `POST /session` with the new password immediately. Admin's **current** session stays valid after her own password change — do **not** copy recovery's `DELETE FROM sessions WHERE admin_id = ?` (`http.ts:485-490`). Do not delete parent sessions on reset unless the human asks. Empty/whitespace password is invalid (these fields are required, unlike Story 1.4's optional field). Inline errors keep typed values. One primary per surface. Labels: **New password** on Settings; Parents is find-by-email then set password on that record — no parent directory, no extra recovery screens. No reset email, SMS, or WhatsApp. Settings and Parents join the admin shell without removing catalog placeholders; Export stays pinned at the bottom.

**Ask First:** Requiring the current password. Invalidating parent sessions when the admin sets a new password. Any new dependency or unpinned version.

**Never:** Touching `POST /admin/recovery` behaviour or printing/rendering recovery codes in either app. Forgot-password UI. Storefront Account (`/parents/me`). Catalog, cart, orders. A second admin row. Returning the new password in JSON after save.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin changes own password | Admin session + valid new password | `200`; new `scrypt` hash on `admins`; **this** session still authenticates; old password fails `POST /session`; new succeeds | N/A |
| Admin resets parent | Admin session + existing parent email + valid password | `200` with no secret; parent row hash changed; parent can log in with the new password immediately | N/A |
| Unknown email | Admin session + email no parent holds | Refusal `{ error: { code, message } }`; no hash written | N/A |
| Invalid password | Empty, too short, or too long on either write | `400` `invalid_input` with `field`; no hash change | Client keeps typed values |
| Parent session | Parent cookie on either admin write | Refusal `{ error: { code, message } }`; hashes unchanged | N/A |
| Anonymous / stale | No or expired cookie on either write | `401` `unauthenticated`; stale clears cookie | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/identity/http.ts:58-67,108-135` -- `sendError`, `lookupSession`, `rejectUnauthorized`.
- `server/identity/http.ts:274-281` -- parent-only 403 pattern; invert to `role !== 'admin'` on new routes.
- `server/identity/http.ts:441-511,485-490` -- recovery: unauthenticated, **wipes admin sessions**. Leave this route. Do not copy the wipe onto logged-in admin password change.
- `server/identity/validation.ts:46-56` -- `validatePassword` (6–128).
- `server/identity/passwords.ts:31-58` -- `hashSecret` / `verifySecret`.
- `server/identity/parents.ts:35-44,127-146` -- `findParentByEmail`, `findParentById`, `saveParentProfile` (parent self-service — **do not** reuse for admin reset; it also writes contact fields).
- `client/admin/src/LoginForm.tsx:105-146` -- form-stack / label-caps / keep typed values.
- `client/ui/base.css:435-520` -- form and button classes.
- `server/web/io-matrix.test.ts:86-91,134-189` -- `startIdentityServer`, `sidCookie`, `cookieHeader`. Ports in use through `18771`. Use **`18772`**.

**Server — change here**

- `server/identity/parents.ts` -- password-only update by id or email (hash first, then UPDATE `password_hash`). HTTP must not SQL the row.
- `server/identity/http.ts` -- admin-gated own-password write (UPDATE the session's admin row) and admin-gated parent reset (email + password). Mount next to existing identity routes. Hash before write.
- **Read-only:** `POST /admin/recovery`, `PATCH /parents/me`, `seed.ts`, migrations, `cookies.ts`, `api.ts`.

**Client — change here**

- `client/admin/src/Shell.tsx:6-13,57-63` -- add **Parents** and **Settings** destinations; keep catalog items; Export stays in `.admin-sidebar-export`.
- `client/admin/src/App.tsx:18-29` -- routes for those pages.
- New admin pages: Settings = one New password field + Save primary. Parents = email find, then set password on that record; show email as identity, never a hash.
- **Read-only:** `AdminGate.tsx`, `auth.ts`, `LoginForm.tsx`, storefront Account.

**Tests**

- `server/web/io-matrix.test.ts` -- new describe on `18772` covering every matrix row, including parent-cookie 403 and "old admin password fails, this cookie still works". Assert neither app bundle gained recovery/forgot-password copy.

## Tasks & Acceptance

**Execution:**

- [x] `server/identity/parents.ts` -- password-only hash-then-UPDATE for a parent row -- admin reset must not rewrite contact fields.
- [x] `server/identity/http.ts` -- admin-only own-password + parent-reset routes; keep this admin session; never return secrets -- Gothami is the recovery path.
- [x] `client/admin/src/` Settings + Parents pages, `App.tsx`, `Shell.tsx` -- simple settings field and find-by-email reset; no extra recovery UI.
- [x] `server/web/io-matrix.test.ts` -- matrix block on port 18772 -- cover every row without colliding with 1.2–1.4.

**Acceptance Criteria:**

- Given I am logged in as admin, when I change my own password from the Settings field, then the new `scrypt` hash is stored and there is no extra recovery UI beyond this field and the already-shipped recovery-code API.
- Given a parent account exists, when I find that parent by email in admin and set a new password, then I cannot read the old or new password in clear text after save, and the parent can log in with the new password immediately.
- Given I am a parent, when I call the admin password-change or parent-reset APIs, then the request is rejected with `{ error: { code, message } }`.

## Spec Change Log

## Design Notes

Logged-in admin password change is not recovery: she already has a session, so keep that session (Story 1.4). Recovery-code redemption remains the only path that wipes admin sessions.

Parent reset is find-by-email, not a roster. `GET` of the record may return `{ email }` only — enough to confirm identity before setting a password.

Do not send the new password back in the JSON; Gothami already typed it and will tell the parent out of band.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors; both bundles emit
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass, including untouched 1.2–1.4
- Admin password: original cookie still `GET /session` `{ role: 'admin' }`; old password 401; new password 200
- Parent reset: parent `POST /session` with new password 200; storefront `/parents/me` still parent-only

**Manual checks:**

- `/admin` Settings: one password field, Save primary. Parents: find by email, set password, email visible, no hash. No forgot-password or recovery-code copy. Parent session cannot use these pages or APIs. Both themes, narrow admin.

## Suggested Review Order

**Admin-gated identity APIs**

- PATCH `/admin/me` is admin-session only; this cookie stays valid after the hash changes.
  [`http.ts:543`](../../server/identity/http.ts#L543)

- GET `/admin/parents` finds by email and returns `{ email }` with no secret.
  [`http.ts:568`](../../server/identity/http.ts#L568)

- PATCH `/admin/parents` sets a password by email; parent sessions are not wiped.
  [`http.ts:594`](../../server/identity/http.ts#L594)

- Shared admin guard refuses parents with a page-level 403, not a password-only message.
  [`http.ts:145`](../../server/identity/http.ts#L145)

**Domain write**

- Hash first, then UPDATE `password_hash` only so contact fields are untouched.
  [`parents.ts:127`](../../server/identity/parents.ts#L127)

**Admin surfaces**

- Parents and Settings join the sidebar; catalog placeholders stay; Export stays pinned.
  [`Shell.tsx:13`](../../client/admin/src/Shell.tsx#L13)

- Settings is one New password field and one primary Save.
  [`SettingsPage.tsx:24`](../../client/admin/src/SettingsPage.tsx#L24)

- Parents is find-by-email, then a labelled identity plus set-password — no roster.
  [`ParentsPage.tsx:190`](../../client/admin/src/ParentsPage.tsx#L190)

- Request JSON keys live in helpers so a renamed body fails the matrix.
  [`adminPasswords.ts:1`](../../client/admin/src/adminPasswords.ts#L1)

**Tests**

- Port 18772: own password keeps this session; parent reset keeps a pre-reset parent cookie.
  [`io-matrix.test.ts:1629`](../../server/web/io-matrix.test.ts#L1629)

