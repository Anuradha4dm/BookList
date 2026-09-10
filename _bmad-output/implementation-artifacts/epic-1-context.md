# Epic 1 Context: Open the door — accounts for Nimali and Gothami

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Parents can register, sign in, and keep one delivery address plus contact numbers on their account. The shop has one seeded admin who can sign in, change her password, and reset a parent’s password. A single-use admin recovery code is printed to the server log, never the UI. Both apps exist as real doors: Chalk & Brass chrome, light and dark, navigation shells, and auth gates. Identity, sessions, and shell only.

## Stories

- Story 1.1: Project scaffold and Chalk & Brass shell
- Story 1.2: Admin seed, session, and recovery code
- Story 1.3: Parent register, login, and auth gates
- Story 1.4: Parent account
- Story 1.5: Admin password and parent reset

## Requirements & Constraints

**Parent.** Self-register with name, one delivery address, WhatsApp, email, and password; second phone optional. Login is email + password only — WhatsApp is contact, never an identity. Profile can change name, address, WhatsApp, and second phone (future orders only). Email is visible on Account, not editable. One address — no address book, no per-order override. Password change while logged in is in-app. Own profile only.

**Admin.** Exactly one admin, seeded at first boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. No registration screen, no extra admin accounts, no staff roles. Logged-in password change is a simple settings field (required even though UX did not elicit it). Parent recovery is the admin setting a new password on that parent’s record (find by email is enough) and communicating it out of band — no reset email, SMS, or WhatsApp. Passwords must not be readable in clear text after save. First boot also generates a single-use recovery code, prints it once to stdout/stderr, and stores only a hash. Redeeming it through the identity API (not a React page) sets a new admin password and prints a fresh code. Never render the code in either app. Forgot-password screens are parked; these server capabilities still ship.

**Honesty.** Required, email format, and phone format are enforced server-side as well as in the UI. Failures report inline without discarding typed values, as `{ error: { code, message } }`. Never silently refuse. Authenticated routes are unreachable without a valid session. Ownership and role checks are enforced in the module. Parents cannot use admin APIs. Storefront is mobile-first. English only. No telemetry, no outbound email/SMS/WhatsApp, not a PWA. WCAG 2.2 AA. Honour `prefers-reduced-motion`.

## Technical Decisions

Modular monolith: one Node process, one SQLite file, two Vite React apps plus `client/ui`. Domain writes live in modules; `web` wires HTTP, Vite static, and the one DB connection. Build order is identity → catalog → cart → orders; this epic ships identity tryable, later folders as empty structure. Tree: `server/{identity,catalog,cart,orders,db/migrations,web}`, `client/{storefront,admin,ui}`. Depends-on may not reverse: `web → orders → cart → catalog`, identity used by all.

Stack: Node 22.12+ (`engines.node` `>=22.12.0`; Bonto runtime Node 22, not default 20); Express 5.2.1, better-sqlite3 13.0.3, TypeScript 7.0.2, React 19.2.8, Vite 8.2.1, tsx 4.23.12. No Next.js, MUI/shadcn/Tailwind, ORM, JWT, or tRPC.

Env only: `PORT`, `DATABASE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — never committed. SQLite at `DATABASE_PATH` on persistent disk. `web` opens one better-sqlite3 WAL connection at boot, runs numbered migrations, and passes the connection in. Logging is stdout/stderr only. Same app on Bonto free then Bonto Glitch.

Mounts: `/api` JSON, `/admin` admin app, `/` storefront. One origin. No CORS. Same-origin `/api/*` with `credentials: include`. Success bodies camelCase.

Identity owns parent profile, the one admin, sessions, recovery-code hash, and admin-set parent password. Passwords hashed with Node `scrypt`. Role lives on the account. Identity is the only Set-Cookie / Clear-Cookie source. Cookie `booklist.sid`: Path=`/`; Max-Age=14 days; HttpOnly; SameSite=Lax; Secure on HTTPS. One cookie for both apps. Session rows in SQLite; logout deletes the row. Same-origin + SameSite=Lax is the CSRF control. Browse may be anonymous; admin and later cart/checkout/orders require a session.

SQL `snake_case`; JSON `camelCase`. Time UTC in DB, Asia/Colombo on screens. EXPERIENCE wins over DESIGN on behaviour.

## UX & Interaction Patterns

**Visual.** DESIGN tokens in `client/ui` as CSS variables — 21 semantic colour roles with designed light and dark peers. Both themes ship in v1. System font stack only; `tabular-nums` globally. 44px targets, 56px tab bar, 214px admin sidebar, 760px storefront cap. Accent-primary is fill only, bounded by border-strong; white on mustard is banned; active nav is a mustard fill block, never a stripe. Chrome fills with text-primary in light; labels on chrome use dark-mode counterpart tokens. Brand lockup: pile-of-books mark plus **Book List** in an ink chip. No tagline.

**Storefront.** Phone bottom tabs: Browse / Cart / Orders / Account (plus safe-area; mustard filled active). At 760px+ those four become a top nav. Browse is the only public surface and the default landing. Cart, Orders, and Account open the auth gate if logged out. Footer: one short privacy note.

**Admin.** 214px ink sidebar: Orders first (home), then schools, grades, book master, packs, items; Export pinned at the bottom and visually separated. Narrow admin must remain usable. Logged-in admin lands on Orders (empty is fine). Parent reset lives on the parent record.

**Auth gate.** Offers Log in and Create account. After login/register from Cart, Orders, or Account — or after a timed-out session — land on Browse, not the tab that was tapped. Do not auto-add anything. No parent forgot-password screen. Announce the gate to assistive tech. Add-to-cart resume-to-pack is Epic 3.

**Forms.** Label-caps above a raised control. Error: 3px danger border and message beneath; keep the typed value. Focus is the doubled ring on `:focus-visible`. One primary per surface. Voice: warm, plain-spoken shopkeeper; every refusal says what to do next.

**Shell states.** Cold-start: branded skeleton in the shape of that page (dashed rows, accent-quiet bars), no spinner, no wording; no shimmer under reduced motion. Later loads: spinner only. Unknown URL: empty page — no message, refresh, or back CTA.

## Cross-Story Dependencies

- 1.1 precedes every other story in this epic.
- 1.2 (admin seed, session cookie, recovery-code API) precedes 1.3 and 1.5.
- 1.3 (parent accounts and storefront session) precedes 1.4 and 1.5.
- Catalog, cart, and orders folders are empty structure only. Pack content is Epic 2. Cart and Add-to-cart auth-resume are Epic 3.
