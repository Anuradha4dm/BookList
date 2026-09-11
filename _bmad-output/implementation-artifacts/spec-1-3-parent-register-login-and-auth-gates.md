---
title: 'Story 1.3 — Parent register, login, and auth gates'
type: 'feature'
created: '2026-09-11'
status: 'done'
baseline_commit: '113cc5881c2c0829a9941c98d11c361a83a3b1d5'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Identity knows one admin. The storefront has no accounts, so Cart, Orders, and Account are open stubs and nothing can belong to a parent.

**Approach:** `identity` gains parent accounts, a session that carries which account it belongs to, and a unified email+password login. The storefront gates Cart, Orders, and Account behind an auth gate offering Log in and Create account, and lands on Browse after either succeeds.

## Boundaries & Constraints

**Always:** Reuse Story 1.2 primitives verbatim — `booklist.sid` with its Always flags, the HMAC binding, scrypt hash/verify, `normalizeEmail`. Identity stays the only Set-Cookie/Clear-Cookie writer and the only module that writes identity tables; `web` injects the one connection. Login is `POST /api/session` for both roles; role is derived from the account the session points at, never stored on the session as free text. Email is unique case-insensitively across parents *and* the admin: trim+lowercase before compare and store. WhatsApp and optional second phone accept `07XXXXXXXX` or `+947XXXXXXXX` with spaces/hyphens stripped, and are stored normalised as `+947XXXXXXXX`; they are contact data, never a login identity. Password minimum 6 characters, no composition rules. Delivery address required, any non-empty trimmed text. Required, email format, phone format, and password length are enforced server-side as well as in the interface, with `{ error: { code, message } }` and a plain-English message. Forms report inline and keep every typed value. Browse stays public and is the landing after any successful login or register from a gated tab. SQL snake_case, JSON camelCase, UTC in DB, logging stdout/stderr only. `node:test` only. WCAG 2.2 AA: 44px targets, doubled `:focus-visible` ring, labels, `role="alert"` errors. EXPERIENCE wins over DESIGN on behaviour.

**Ask First:** Any npm package. Any new env var. Changing the cookie name or its flags. Any identity route beyond parent register plus the three `/api/session` verbs. Making WhatsApp unique across accounts. Verifying email addresses.

**Never:** A parent forgot-password screen or reset endpoint (parked; Story 1.5 gives the admin the reset). A registration screen for admins. Parents reaching `/admin` or any admin API. Cart, order, or catalog tables, columns, or routes. Auto-adding anything after login. A local/client-side cart. An address book or per-order address override. Profile editing or password change while logged in — that is Story 1.4. JWT, tRPC, an ORM, dotenv, outbound email/SMS/WhatsApp, a second CSRF token. Rendering the admin recovery code anywhere.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Register | `POST /api/parents` with name, address, WhatsApp, email, password (second phone omitted) | Parent row with scrypt hash and normalised phone; session created; `booklist.sid` set with the Always flags; `201 { role: 'parent', email }` | N/A |
| Duplicate email | Registering an email already held by a parent or by the admin, any casing | No row written, no cookie | `409` `email_taken` |
| Bad field | Missing name or address, malformed email, phone that is not an SL mobile, password under 6 | No row written, no cookie | `400` `invalid_input`, message naming the offending field |
| Parent login | `POST /api/session` with correct parent email+password | Session row bound to that parent; cookie set; `200 { role: 'parent', email }` | N/A |
| Admin login unchanged | `POST /api/session` with the seeded admin credentials | `200 { role: 'admin', email }`, Story 1.2 behaviour intact | N/A |
| Wrong password | Correct email, wrong password, or unknown email | No cookie; constant-time compare against a dummy hash | `401` `invalid_credentials` |
| Session probe | `GET /api/session` with a valid parent cookie | `200 { role: 'parent', email }`, `Cache-Control: no-store` | Missing/tampered/expired → `401` `unauthenticated`, stale row deleted, cookie cleared |
| Parent at `/admin` | Valid parent cookie, open `/admin` | Admin login form only — no sidebar, no admin destinations | N/A |
| Gated tab, logged out | Open `/cart`, `/orders`, or `/account` with no session, or with one past `expires_at` | Auth gate announced to assistive tech, offering Log in and Create account; tab bar stays usable | Stale row deleted |
| Gate success | Log in or Create account from any gated tab | Land on Browse (`/`), not the tab that was tapped; nothing auto-added | N/A |
| Logout | Signed-in parent | Session row deleted, cookie cleared, gate returns on the protected tabs | N/A |
| Browse anonymous | No session, open `/` | Renders normally; no gate, no probe failure surfaced | N/A |

</frozen-after-approval>

## Code Map

**Reuse verbatim — do not re-derive**

- `server/identity/cookies.ts:4-61` -- `COOKIE_NAME` `'booklist.sid'`, `SESSION_MAX_AGE_SECONDS` (14d), `signedCookieValue`/`sessionIdFromCookie` (HMAC-SHA256 base64url, wire form `{id}.{mac}`, `timingSafeEqual`), `setSessionCookie`/`clearSessionCookie`, private `flags()` at `:49-53`. **Read-only** — `io-matrix.test.ts:721-733` asserts no other file emits Set-Cookie.
- `server/identity/passwords.ts:31-58` -- `hashSecret`, `verifySecret`, `dummyPasswordHash`. Encoding is `scrypt$N$r$p$salt$key` (6 `$` segments). Recovery helpers at `:60-77` are admin-only; leave them.
- `server/identity/seed.ts:14-20` -- `enableForeignKeys` (`PRAGMA foreign_keys = ON`), `normalizeEmail` (trim+lowercase). `seedAdmin` at `:22-43` is unchanged.

**Server — change here**

- `server/db/migrations/001_identity_admin_sessions_and_recovery.sql:8-14` -- `sessions.admin_id INTEGER NOT NULL` FK `admins(id)`; no role column. SQLite cannot relax `NOT NULL`, so migration 002 must rebuild the table. `admins.id` has `CHECK (id = 1)` at `:2` — parents need their own table.
- `server/db/migrations/run.ts:19-21` -- `MIGRATIONS` array, applied in order, tracked in `applied_migrations`. Append 002 here.
- `server/identity/http.ts:67-112` -- `lookupAdminSession` (cookie → `sessionIdFromCookie` → `SELECT … sessions` → expiry delete → join `admins`) and `createAdminSession` (`randomBytes(18).toString('base64url')`, INSERT, set cookie). Generalise both to resolve either account column.
- `server/identity/http.ts:42-60` -- private `sendError(res, status, code, message)` → `{ error: { code, message } }`, and `safe(handler)` → 500 `internal_error`. Reuse for every new route; existing codes are `invalid_input`, `invalid_credentials`, `unauthenticated`, `invalid_recovery_code`.
- `server/identity/http.ts:118-149` -- `POST /session`: hardcoded `role: 'admin'` at `:144`, admin-table lookup at `:130`. Extend to fall through to parents.
- `server/identity/http.ts:91-96,152-170` -- `rejectUnauthorized`, `GET /session` (`no-store`), `DELETE /session` (204 + clear). Must report the resolved role.
- `server/identity/http.ts:46-48` -- `isNonEmptyString` is the only validation that exists. No email or phone format check anywhere yet.
- `server/identity/index.ts:1-4` -- barrel: `createIdentityRouter`, `seedAdmin`, `IdentityEnv`, `COOKIE_NAME`, `RECOVERY_LOG_PREFIX`.
- `server/web/api.ts:27-38` -- `express.json()`, `jsonParseError`, identity router at `:29`, JSON 404 at `:31`. Anything new mounts before the 404.
- **Read-only:** `server/tsconfig.json:12-13` (`identity/**/*.ts` already included, tests excluded), `server/web/index.ts:11-28`, `server/web/env.ts:1-7` (no new env var), `server/web/db.ts:6-13`, `client/storefront/vite.config.ts:8-12`.

**Client — change here**

- `client/storefront/src/App.tsx:17-28` -- `createBrowserRouter` + `createRoutesFromElements`, no basename; `/`(index), `/cart`, `/orders`, `/account` nested under `<Shell />`; `*` renders `null` at `:13-15,26`. Gate wraps the three protected routes here.
- `client/storefront/src/Shell.tsx:5-10,19-31,57-67` -- `destinations` array, cold-start `<Skeleton />` then `<Spinner />` on navigation, `NavLink` tab bar and top nav. Session provider belongs above `<Outlet />`.
- `client/admin/src/AdminGate.tsx:15-45` -- the pattern to mirror: `GET /api/session` with `{ credentials: 'include', signal }`, states `'checking' | 'out' | 'in'`, role check at `:24`, logout that only clears local state after `DELETE` returns ok-or-401, `navigate('/', { replace: true })`. Copy and adapt; it is admin-coupled.
- `client/admin/src/LoginForm.tsx:82-125` -- form conventions: `.form-stack` + `noValidate`, `.form-field` toggling `.is-invalid`, `.text-label-caps` labels, `.form-control` inputs, controlled values never cleared on failure, `aria-invalid` + `aria-describedby`, `<p className="form-error text-meta" role="alert">`, `.button-primary.press-travel` disabled while submitting. Its ids (`admin-email`, `admin-login-error`) are admin-scoped — do not collide.
- `client/admin/src/auth.ts:3-17` -- context + `useAdminAuth()` hook shape; no fetch logic inside. Mirror the shape for the storefront.
- `client/ui/base.css:435-490` -- `.form-stack`, `.form-field`, `.form-control` (44px via `--space-control-h`), `.form-error`, `.button-primary`; `.form-field.is-invalid .form-control` gives the 3px danger border at `:457-459`. Doubled focus ring is global at `:58-63`. **`.button-secondary` does not exist** — the gate's second action needs it; spec is `DESIGN.md:616-617`.
- `client/ui/index.ts:1-5` -- `BrandLockup`, `Skeleton`, `Spinner`, `formatRupees`, `applyTheme`, `initTheme`. `Spinner` already sets `role="status"`.

**Tests**

- `server/web/io-matrix.test.ts:379` -- `describe('Admin seed, session, and recovery', { concurrency: 1 })` block to mirror. Helpers: `startIdentityServer(dbPath, port, extraEnv?)` at `:130-151` (spawns `dist/web/index.js`), `stopChild` `:153-166`, `sidCookie` `:168-170`, `cookieHeader` `:183-185`, per-test `mkdtemp` DB at `:385-396`. Cookie-flag assertions at `:437-441`, Secure-behind-proxy at `:471-484`, tampered cookie at `:517-521`. Use a third port; file is 736 lines.

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/002_identity_parents_and_session_accounts.sql` -- create `parents` (autoincrement id, unique email, password_hash, name, delivery_address, whatsapp, nullable second_phone, created_at); rebuild `sessions` as nullable `admin_id`/`parent_id`, each with its own FK, plus `CHECK` that exactly one is set; copy existing rows keeping `admin_id` -- SQLite cannot relax the existing `NOT NULL`, and keeping both FKs preserves referential integrity while making role derivable.
- [x] `server/db/migrations/run.ts` -- append 002 to `MIGRATIONS` -- ordered application.
- [x] `server/identity/validation.ts` (new) -- required/trim, email format, SL mobile normaliser to `+947XXXXXXXX`, password length; each returns the field name for the error message -- single source for server-side FR12.
- [x] `server/identity/parents.ts` (new) -- `createParent` (scrypt via `hashSecret`) and `findParentByEmail` on normalised email, rejecting the admin address -- keeps domain writes in the module.
- [x] `server/identity/http.ts` -- generalise `lookupAdminSession`/`createAdminSession` to either account column and return the derived role; make `POST /session` try admin then parent; report the role from `GET /session`; add `POST /parents` that validates, creates, and signs in -- one cookie scheme, role on the account.
- [x] `server/identity/index.ts` -- export the session guard so Stories 1.4/1.5 need not reach into `http.ts`.
- [x] `client/ui/base.css` -- add `.button-secondary` per `DESIGN.md:616-617` and the auth-gate panel classes, honouring 44px targets and the accent-fill-only rule -- the gate needs a non-primary second action.
- [x] `client/storefront/src/auth.tsx` (new) -- session context, `useSession()` hook, and the probe/login/register/logout fetches with `credentials: 'include'` -- mirrors `client/admin/src/auth.ts` plus `AdminGate`'s probe.
- [x] `client/storefront/src/AuthGate.tsx` (new) -- gate offering Log in and Create account, the two forms following `LoginForm.tsx` conventions with storefront-scoped ids, inline errors that keep typed values, and `navigate('/', { replace: true })` on success -- EXPERIENCE's gate rule.
- [x] `client/storefront/src/App.tsx`, `client/storefront/src/Shell.tsx` -- provide the session above `<Outlet />` and wrap `/cart`, `/orders`, `/account` in the gate -- Browse stays public.
- [x] `server/web/io-matrix.test.ts` -- add a parent block on its own port covering every matrix row, including that admin login still returns `role: 'admin'` -- regression cover for the shared endpoint.

**Acceptance Criteria:**

- Given a fresh database, when migrations run, then `parents` exists, `sessions` accepts exactly one of `admin_id`/`parent_id`, and a database already carrying a Story 1.2 admin session keeps that session valid.
- Given a registered parent, when they log in on a second device, then both sessions are valid independently and each resolves to the same parent.
- Given a parent session cookie, when it is sent to the admin app, then `/admin` shows only the login form.
- Given a parent submits a form with several invalid fields, when the server responds, then it is a single `{ error: { code, message } }` whose message names a field, and every value the parent typed is still on screen.
- Given a signed-in parent, when they log out and revisit a gated tab, then the gate is shown and the session row is gone from the database.
- Given `npm run build` output, when both client bundles are searched, then neither contains recovery-code copy nor any forgot-password affordance.

## Design Notes

Role is derived, never stored as a string: a session row with `parent_id` set is a parent session. That keeps "role lives on the account" literally true and makes the `CHECK` constraint the enforcement point.

Unified login must stay constant-time on the miss path — resolve admin, then parent, and when neither matches still `verifySecret` against `dummyPasswordHash()` before returning `401`, exactly as `http.ts:134-139` does today.

Registration signs the parent in as part of the same request, so the gate's Create account path lands on Browse without a second round trip.

The gate is rendered in place on the protected route rather than being a `/login` route — EXPERIENCE calls for one gate reached from three tabs, and an in-place gate makes "land on Browse, not the tab you tapped" a single `navigate('/')` with no redirect bookkeeping. Announce it with `role="status"` or an `aria-live` region on the panel heading.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- zero errors; `server/dist` and both client bundles emit
- `node --import tsx --test server/web/io-matrix.test.ts` -- all blocks pass, including the untouched Story 1.2 admin block
- Boot against a database file created before this story -- migration 002 applies once, the existing admin session still authenticates
- `POST /api/parents` then `GET /api/session` -- `201` then `{ role: 'parent' }`; Set-Cookie carries `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age=1209600`
- Register with `+94 77 123 4567`, then read the row -- stored as `+94771234567`

**Manual checks:**

- Logged out, `/cart`, `/orders`, `/account` each show the gate; `/` browses normally. Log in from `/orders` and land on `/`. Keyboard-only through both forms: doubled focus ring, 44px targets, inline error keeps the typed email. Both themes. Narrow and 760px+.

## Suggested Review Order

**Schema — where role comes from**

- Parents get their own table; the admin singleton `CHECK (id = 1)` could not hold them.
  [`002_identity_parents_and_session_accounts.sql:1`](../../server/db/migrations/002_identity_parents_and_session_accounts.sql#L1)

- Sessions rebuilt with two nullable FKs and a CHECK; role is derived, never stored as text.
  [`002_identity_parents_and_session_accounts.sql:20`](../../server/db/migrations/002_identity_parents_and_session_accounts.sql#L20)

**Unified login**

- One lookup resolves either account column and reports the derived role.
  [`http.ts:108`](../../server/identity/http.ts#L108)

- `POST /session` tries admin then parent, still hashing a dummy on the miss path.
  [`http.ts:242`](../../server/identity/http.ts#L242)

- Register validates, creates, and signs in within one request.
  [`http.ts:163`](../../server/identity/http.ts#L163)

- Email uniqueness spans parents and the admin, checked inside the transaction.
  [`parents.ts:62`](../../server/identity/parents.ts#L62)

**Validation**

- Every validator refuses non-strings outright rather than coercing them away.
  [`validation.ts:74`](../../server/identity/validation.ts#L74)

- Password bounded at both ends so an anonymous request cannot drive scrypt.
  [`validation.ts:46`](../../server/identity/validation.ts#L46)

**Cross-app role guards — the highest-risk boundary**

- Storefront refuses a non-parent and deletes the cookie the server already set.
  [`auth.tsx:118`](../../client/storefront/src/auth.tsx#L118)

- Admin refuses a non-admin on the success path, not only at mount.
  [`LoginForm.tsx:84`](../../client/admin/src/LoginForm.tsx#L84)

**Storefront gate**

- Gate renders in place and lands on Browse, never the tab that was tapped.
  [`AuthGate.tsx:328`](../../client/storefront/src/AuthGate.tsx#L328)

- One draft shared by both panels, so switching modes keeps what was typed.
  [`AuthGate.tsx:213`](../../client/storefront/src/AuthGate.tsx#L213)

- `aria-describedby` scoped to the refused control instead of all six inputs.
  [`AuthGate.tsx:244`](../../client/storefront/src/AuthGate.tsx#L244)

- Only Cart, Orders, and Account nest under the gate; Browse stays public.
  [`App.tsx:48`](../../client/storefront/src/App.tsx#L48)

- Session provided above the outlet so the chrome and pages share one probe.
  [`Shell.tsx:36`](../../client/storefront/src/Shell.tsx#L36)

**Peripherals**

- The regression the review caught: each app refusing the other account.
  [`io-matrix.test.ts:1036`](../../server/web/io-matrix.test.ts#L1036)

- Expired-cookie path, backdated through a second connection.
  [`io-matrix.test.ts:966`](../../server/web/io-matrix.test.ts#L966)

- Upgrade cover: 002 applies once and a live Story 1.2 session survives.
  [`io-matrix.test.ts:1136`](../../server/web/io-matrix.test.ts#L1136)

- Secondary button added per DESIGN; accent stays fill-only.
  [`base.css:492`](../../client/ui/base.css#L492)

- Gate panel classes.
  [`base.css:522`](../../client/ui/base.css#L522)
