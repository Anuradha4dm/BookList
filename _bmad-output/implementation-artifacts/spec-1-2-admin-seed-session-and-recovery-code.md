---
title: 'Story 1.2 — Admin seed, session, and recovery code'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '4c206bdb1feadaf6c45aa254c9d52e0beaa3e038'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/admin` is an empty themed shell. Gothami has no account, no session, and no way to regain the back office without a redeploy.

**Approach:** `identity` seeds the one admin from env, issues `booklist.sid` sessions, and prints a single-use recovery code to the log. Admin login and logout exist on `/admin`; recovery stays an API, never a page.

## Boundaries & Constraints

**Always:** Identity owns admin row, session rows, recovery-code hash, scrypt password hashes, and every Set-Cookie / Clear-Cookie. Cookie `booklist.sid`: `Path=/`, `Max-Age=14 days`, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS. `web` injects the one DB connection; identity never opens SQLite itself. Exactly one admin; no registration screen. Seed on first boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`; later boots do not create a second admin or reprint a code unless a new one was just generated. Recovery code printed once to stdout/stderr as plaintext; only a hash is stored; never rendered in either React app. JSON errors `{ error: { code, message } }` with a plain-English `message`. Same-origin + SameSite=Lax is CSRF control. Logging stdout/stderr only. WCAG 2.2 AA on the login form (labels, 44px targets, doubled `:focus-visible` ring, inline errors that keep typed values). `node:test` is the runner (identity is first-writer). EXPERIENCE wins over DESIGN on behaviour.

**Ask First:** Any npm package (cookie-parser, extra hash libs, a second test runner). Any extra env var. Changing the cookie name. A recovery UI. More than one admin.

**Never:** JWT, tRPC, ORM, parent accounts, parent login, forgot-password screens, outbound email/SMS/WhatsApp, second CSRF token, dotenv, committing secrets or plaintext recovery codes, admin APIs usable by a parent session, catalog/cart/orders behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First boot seed | Empty DB, both admin env vars set | One admin row with scrypt hash; one recovery hash stored; plaintext code printed once to the log | N/A |
| Later boot | Admin already exists | No second admin; no new recovery print | N/A |
| Admin login | `POST` correct email+password from `/admin` | Session row; `Set-Cookie: booklist.sid`; land on Orders | N/A |
| Bad credentials | Wrong password, or unknown email | No cookie; JSON `{ error: { code, message } }` | Plain-English message; HTTP 401 |
| Parent on admin API | Request to an admin identity route without an admin session | No cookie; JSON error | 401/403 with stable `code` |
| Logout | Signed-in admin | Session row deleted; cookie cleared; login form shown | N/A |
| Gated admin | No valid session, open `/admin` or an admin destination | Login form only — no sidebar destinations | N/A |
| Redeem recovery | Current plaintext code via identity API, new password | Password updated; new code printed once; only new hash stored; old code fails afterwards | Invalid/used code → JSON error, no password change |
| Recovery UI | Any storefront or admin page | No recovery field, copy, or flow | N/A |

</frozen-after-approval>

## Code Map

Story 1.1 scaffold is the tree. `server/identity/.gitkeep` is empty. `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` are validated in `env.ts` and unused after load.

- `server/web/index.ts:10-26` -- `loadEnv` → migrate → `/api`. Seed after migrate. Inject `db`+`env` into the API; no second SQLite open.
- `server/web/api.ts:3-15` -- 404 JSON catch-all. Mount identity **before** it. `express.json()` lives in `web`.
- `server/web/env.ts:1-35` -- typed `Env`. Identity uses the injected object, not ad hoc `process.env`.
- `server/web/db.ts:6-12` -- WAL opener. **Read-only.**
- `server/db/migrations/run.ts:8` -- `MIGRATIONS=[]`. Register numbered identity SQL. `web` owns no domain tables.
- `server/identity/.gitkeep` -- replace with seed, scrypt, sessions, recovery, cookies, handlers. Only Set/Clear-Cookie source.
- `server/tsconfig.json:12-13` -- add `identity/**/*.ts`; keep `*.test.ts` out of emit.
- `server/web/io-matrix.test.ts` -- `node:test` spawn/fetch pattern to extend.
- `client/admin/src/App.tsx:17-33` -- `basename: '/admin'`. Logged-out users never reach `Shell` destinations.
- `client/admin/src/Shell.tsx` -- chrome after login; logout here; no catalog screens.
- `client/ui` -- login uses existing CSS classes. No new component kit.
- `ARCHITECTURE-SPINE.md` AD-3/5/8/11 -- **read-only**.

## Tasks & Acceptance

**Execution:**

- [x] `server/db/migrations/` -- numbered snake_case SQL for admin, sessions, recovery hash; register in `run.ts` -- identity first.
- [x] `server/identity/` -- first-boot seed from env with Node `scrypt`; print recovery once; store hash only; later boots no-op.
- [x] `server/identity/` -- session rows; set/clear `booklist.sid` (Always flags, bound with `SESSION_SECRET`); identity is the only cookie writer.
- [x] `server/web/api.ts`, `server/web/index.ts` -- `express.json()`, inject `db`+`env`, mount identity before the JSON 404.
- [x] `server/tsconfig.json` -- include `identity/**/*.ts`.
- [x] `client/admin/src/` -- logged-out `/admin` is email+password (labels, inline errors keep values); success → Orders; logout → form; no recovery UI.
- [x] `server/web/io-matrix.test.ts` or `server/identity/*.test.ts` via `node:test` -- every matrix row; grep both apps to prove no recovery copy.

**Acceptance Criteria:**

- Given first boot with admin env vars, when seed runs, then one scrypt admin exists, a recovery hash is stored, and the plaintext code is in the log once and in neither React bundle.
- Given `/admin` with no session, when it loads, then only the login form is reachable.
- Given correct admin credentials on that form, when submitted, then `booklist.sid` is set with the Always flags and the app lands on Orders.
- Given a signed-in admin, when they log out, then the session row is gone, the cookie is cleared, and `/admin` shows login.
- Given wrong credentials, when handled, then `{ error: { code, message } }`, no session cookie, typed email kept.
- Given the current recovery code, when redeemed via the identity API with a new password, then the password changes, a fresh code is printed once, only the new hash is stored, and the old code fails.

## Spec Change Log

## Design Notes

Bind `booklist.sid` to a random SQLite session id with `SESSION_SECRET` (HMAC). Never put the password hash in the cookie.

Same-origin, `credentials: include`: `POST /api/session` `{ email, password }` → Set-Cookie; `DELETE /api/session` → Clear-Cookie; `POST /api/admin/recovery` `{ code, password }` → new password, log new code. Login must require the seeded admin row.

Print the recovery code once, one human-readable log line. `node:test` is first-writer — extend `io-matrix.test.ts`; do not add Vitest/Jest.

## Verification

**Commands:**

- `npm run typecheck && npm run build` -- identity in `server/dist`, zero errors
- `node --import tsx --test server/web/io-matrix.test.ts` -- matrix rows pass (plus any `server/identity/*.test.ts`)
- First `npm start` (five env vars) -- recovery line once; one admin row
- Second start, same DB -- no second admin, no new recovery print
- `POST` login -- `Set-Cookie` has `booklist.sid`, `HttpOnly`, `Path=/`, `SameSite=Lax`
- Wrong password -- 401 JSON, no session cookie
- Redeem recovery, retry old code -- old code errors; new code logged once

**Manual checks:**

- Cold `/admin` is login, not the sidebar. Success lands on Orders; doubled focus ring; inline error keeps email. Logout returns to login. No recovery field or plaintext code in either app.

## Suggested Review Order

**Boot and seed**

- Seed the one admin after migrate, then mount identity on `/api`.
  [`index.ts:13`](../../server/web/index.ts#L13)

- First boot inserts admin id 1 and prints the recovery code once.
  [`seed.ts:22`](../../server/identity/seed.ts#L22)

- Numbered identity SQL: singleton admin, sessions, recovery hash.
  [`001_identity_admin_sessions_and_recovery.sql:1`](../../server/db/migrations/001_identity_admin_sessions_and_recovery.sql#L1)

- Register that file as the first migration.
  [`run.ts:19`](../../server/db/migrations/run.ts#L19)

**Sessions and cookies**

- Identity is the only Set-Cookie / Clear-Cookie writer.
  [`cookies.ts:55`](../../server/identity/cookies.ts#L55)

- Login creates a session row and HMAC-binds `booklist.sid`.
  [`http.ts:111`](../../server/identity/http.ts#L111)

- Recovery rotates the password, revokes sessions, and reprints a code.
  [`http.ts:212`](../../server/identity/http.ts#L212)

- JSON body parser, identity router, then the 404 envelope.
  [`api.ts:27`](../../server/web/api.ts#L27)

**Admin gate**

- Logged-out `/admin` is the login form, including unknown paths.
  [`App.tsx:20`](../../client/admin/src/App.tsx#L20)

- Session probe, then login or shell; logout only after DELETE succeeds.
  [`AdminGate.tsx:9`](../../client/admin/src/AdminGate.tsx#L9)

- Email+password with inline errors that keep typed values.
  [`LoginForm.tsx:15`](../../client/admin/src/LoginForm.tsx#L15)

- Log out under the lockup; Export stays pinned at the bottom.
  [`Shell.tsx:37`](../../client/admin/src/Shell.tsx#L37)

**Peripherals**

- Matrix coverage for seed, cookie flags, 401, recovery, and gate copy.
  [`io-matrix.test.ts:379`](../../server/web/io-matrix.test.ts#L379)

