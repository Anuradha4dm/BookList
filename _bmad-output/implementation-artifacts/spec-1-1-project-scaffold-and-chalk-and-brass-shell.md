---
title: 'Story 1.1 — Project scaffold and Chalk & Brass shell'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '3b8a86b21fd6d234f4387f32fd144ce68ab3a5e8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-BookList-2026-08-14/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The BookList repo holds only planning artifacts and a README. Nothing runs, so neither the storefront nor the admin app exists as a place a parent or the shop owner can open.

**Approach:** Scaffold the modular monolith from the architecture spine — one Node process serving Express plus two Vite React apps — and implement the Chalk & Brass token system and navigation chrome in `client/ui`. Both apps become real, themed, navigable doors with empty rooms behind them. No identity, catalog, cart, or orders behaviour.

## Boundaries & Constraints

**Always:** Versions pinned exactly: Express `5.2.1`, better-sqlite3 `13.0.3`, TypeScript `7.0.2`, React and React-DOM `19.2.8`, Vite `8.2.1`, tsx `4.23.12`, react-router `8.3.1`, `@vitejs/plugin-react` `6.1.1`, `@types/node` `^22.20.2`. `engines.node` is `>=22.12.0`. Source tree is exactly `server/{identity,catalog,cart,orders,db/migrations,web}` and `client/{storefront,admin,ui}`. Express mounts `/api` (JSON), `/admin` (admin app), `/` (storefront) on one origin with no CORS. `web` opens the single better-sqlite3 WAL connection at boot and runs numbered migrations; it owns no domain tables. All five env vars (`PORT`, `DATABASE_PATH`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) are read at boot from the environment only. Colour, typography, spacing, radius, elevation, focus, and skeleton token *values* are copied verbatim from the `DESIGN.md` YAML frontmatter. Where `DESIGN.md` and `EXPERIENCE.md` disagree on behaviour, `EXPERIENCE.md` wins. WCAG 2.2 AA: doubled focus ring on `:focus-visible`, 44×44 minimum targets, full keyboard operability. Logging is stdout/stderr only.

**Ask First:** Any dependency not in the pinned list above. Any deviation from a pinned version. Adding a test runner or assertion library — the spine defers that to the identity module in Story 1.2. Any server route beyond the three mounts.

**Never:** Next.js, MUI, shadcn, Tailwind, any named component kit, any ORM or Prisma, JWT, tRPC, `node:sqlite`. No authentication, sessions, cookies, admin seeding, recovery codes, or catalog/cart/orders logic — those are Stories 1.2–1.5 and Epics 2–4. No webfont, service worker, PWA, telemetry, or outbound email/SMS/WhatsApp. No domain tables or SQL in `web`. Never derive dark mode by filtering or inverting light values — use the designed `-dark` peers. Never use `accent-primary` as a border, rule, hairline, divider, underline, or text on a light surface, and never white text on mustard. Never commit `.env` or any secret value.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Healthy boot | All five env vars set | Express listens on `PORT`; one WAL connection open at `DATABASE_PATH`; migration runner completes with zero migrations applied; `/`, `/admin`, `/api` all mounted | N/A |
| Missing env var | `DATABASE_PATH` unset | Process refuses to start and exits non-zero | One stderr line naming every missing variable |
| Unknown page route | `GET /nonsense` or `GET /admin/nonsense` | Empty page: no message, no refresh control, no back CTA | N/A |
| Unknown API route | `GET /api/nope` | HTTP 404, JSON body `{ "error": { "code", "message" } }` | Stable machine `code`, plain-English `message` |
| Phone storefront | Viewport under 760px | Bottom tab bar, 56px plus safe-area inset, Browse active as a mustard fill block bounded by `border-strong` | N/A |
| Wide storefront | Viewport 760px or more | Same four destinations render as a top nav; content column capped at 760px | N/A |
| Narrow admin | Viewport under ~900px | 214px ink sidebar and all tokens still hold; layout remains usable with an empty main column | N/A |
| Reduced motion | `prefers-reduced-motion: reduce` | No skeleton shimmer, no press travel, no transitions | N/A |
| Dark mode | System reports dark | Every one of the 21 roles resolves to its designed `-dark` peer | N/A |

</frozen-after-approval>

## Code Map

Greenfield: no application code exists. Only `README.md` and `_bmad*` folders are present, and `_bmad/` plus `_bmad-output/` are committed planning artifacts — read-only for this story.

- `DESIGN.md` YAML frontmatter -- the authoritative token source; copy values verbatim from `colors:` (21 roles, each with a `-dark` peer), `typography:` (14 roles, system stack), `spacing:`, `rounded:`, `components.focus-indicator`, `components.skeleton`, and `components.brand-lockup`. Load-bearing values that are easy to miss: `touch-min`/`control-h` 44px, `cta-h` 52px, `tabbar-h` 56px, `admin-sidebar-w` 214px, `storefront-max` 760px, `edge-hairline` 2px, `edge-strong` 3px.
- `DESIGN.md` Brand & Style -- the pile-of-books SVG: `viewBox="0 0 24 24"`, `fill="currentColor"`, three rounded rects at `(3,15.5,18,4)`, `(4.5,10.2,15,4)`, `(6.2,4.9,11.6,4)`, all `rx="1.2"`.
- `DESIGN.md` Elevation -- printed, never atmospheric: flat (2px `border-default` edge), lifted (`2px 2px 0 border-strong`), standing (`3px 3px 0 border-strong`). Zero blur anywhere.
- `EXPERIENCE.md` IA / Component Patterns / State Patterns -- nav order for both apps, the page-shaped cold-start skeleton, the spinner-only later load, the blank unknown URL, and the privacy-note footer.
- `ARCHITECTURE-SPINE.md` AD-3, AD-6, AD-8, AD-12 and Structural Seed -- module tree, allowed dependency direction, single-connection rule, and the three mounts.

## Tasks & Acceptance

**Execution:**

- [x] `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example` -- create the npm-workspaces root over `client/*` and `server`, pin every dependency, set `engines.node` to `>=22.12.0`, and add `dev`, `build`, `start`, and `typecheck` scripts -- one install and one process, per AD-1 and AD-2. `.gitignore` must cover `node_modules`, `dist`, `.env`, and SQLite artifacts (`*.db`, `*.db-wal`, `*.db-shm`); `.env.example` lists the five variable names with empty values.
- [x] `server/web/env.ts` -- read and validate the five env vars, exiting non-zero with one stderr line naming all missing ones -- satisfies the missing-env row of the I/O matrix and keeps secrets out of code.
- [x] `server/web/db.ts` -- open the one better-sqlite3 connection at `DATABASE_PATH` with WAL enabled and export it for injection -- AD-8 forbids modules opening the file themselves.
- [x] `server/db/migrations/run.ts` -- numbered-migration runner backed by an applied-migrations table, iterating an empty ordered list -- the AC requires the runner, not any migration.
- [x] `server/web/index.ts` -- compose boot: validate env, open the connection, run migrations, mount `/api` then `/admin` then `/`, listen on `PORT`, log the listening line to stdout -- AD-12 mount order and AD-8 injection.
- [x] `server/web/api.ts` -- mount an empty JSON router whose fallback returns 404 with `{ error: { code, message } }` -- proves the `/api` mount and fixes the failure envelope from AD-7 before any endpoint exists.
- [x] `server/web/static.ts` -- serve each built Vite app under its mount in production and proxy to the Vite dev servers in development, with an SPA fallback that serves each app's `index.html` so client routing owns unknown paths -- AD-12, one origin, no CORS.
- [x] `server/{identity,catalog,cart,orders}/.gitkeep` -- create the four module folders as empty structure -- AD-3 fixes the tree now; build order fills them later.
- [x] `client/ui/tokens.css` -- declare every token as a CSS custom property on `:root`, with the `-dark` peers under `[data-theme='dark']` -- single source of truth for both apps, per AD-6 "tokens only".
- [x] `client/ui/base.css` -- reset, system font stack, global `font-variant-numeric: tabular-nums`, the doubled `:focus-visible` ring, 44px minimum targets, printed-elevation utilities, and a `prefers-reduced-motion` block that removes shimmer, press travel, and transitions -- the accessibility floor lives in one place.
- [x] `client/ui/theme.ts` -- set `data-theme` on `<html>` from `prefers-color-scheme` before first paint and follow later system changes; expose one function to override explicitly, unused for now -- the chosen mechanism, with room for a later toggle.
- [x] `client/ui/BrandLockup.tsx`, `client/ui/Skeleton.tsx`, `client/ui/Spinner.tsx`, `client/ui/money.ts`, `client/ui/index.ts` -- the lockup (mark plus "Book List" in an ink chip, no tagline), the page-shaped dashed-row skeleton, the later-load spinner, and a `Rs. 9,320`-style integer formatter -- shared chrome primitives both apps consume.
- [x] `client/storefront/{index.html,vite.config.ts,src/main.tsx,src/App.tsx,src/Shell.tsx}` -- storefront app with a `/api` dev proxy, react-router routes for Browse, Cart, Orders, and Account plus a catch-all rendering a blank page, and a shell that switches bottom tabs to a top nav at 760px, caps content at 760px, and ends in the privacy-note footer -- Browse is the landing route.
- [x] `client/admin/{index.html,vite.config.ts,src/main.tsx,src/App.tsx,src/Shell.tsx}` -- admin app with `base: '/admin/'` and router `basename="/admin"`, routes for Orders (index), Schools, Grades, Book master, Packs, Items, and Export plus a blank catch-all, and a 214px ink sidebar with Export pinned bottom and separated -- Orders is the landing route.
- [x] Route placeholders in both apps -- render each destination as its heading over an empty region -- the story ships navigable doors with empty rooms, so no screen invents content it does not own.

**Acceptance Criteria:**

- Given a clone on Node 22.22.0+ with no `node_modules`, when `npm install && npm run typecheck && npm run build` runs, then all three succeed and no forbidden package (Next.js, Tailwind, MUI, shadcn, Prisma, an ORM, JWT, tRPC) appears anywhere in the dependency tree.
- Given the built app started with all five env vars set, when the storefront is opened at `/` and the admin at `/admin`, then each serves its own bundle, `/admin` does not serve storefront JS, and neither app ships the other's code.
- Given the storefront on a phone-width viewport, when it loads, then the Chalk & Brass shell renders from `client/ui` CSS variables and Browse is the active tab, styled as a mustard fill block bounded by `border-strong` with `text-on-accent` ink.
- Given either app in light mode, when chrome renders, then chrome fills with `text-primary` and labels on that chrome use the dark-mode counterpart tokens.
- Given either app with the system set to dark, when it loads, then `data-theme` is `dark` and computed colours match the designed `-dark` values rather than any filtered or inverted light value.
- Given either app, when a control is reached by keyboard, then the doubled focus indicator appears on `:focus-visible` only, and every interactive target measures at least 44×44.
- Given a slow or cold first paint in either app, when a page is loading, then a page-shaped skeleton of dashed rows and `accent-quiet` bars appears with no spinner and no wording; a later in-flight load shows a spinner only.
- Given `prefers-reduced-motion: reduce`, when any page renders, then the skeleton does not shimmer and no press travel or transition runs.

## Spec Change Log

## Design Notes

**react-router raises the practical Node floor.** `react-router@8.3.1` declares `engines.node >= 22.22.0`, stricter than the AC-mandated `engines.node` of `>=22.12.0`. Keep `>=22.12.0` in `package.json` verbatim as the AC requires, and install Node 22.23.x or newer so npm emits no `EBADENGINE` warning. Node 22.12–22.21 will warn.

**Optional peers are genuinely optional.** `@vitejs/plugin-react@6.1.1` lists `oxc-transform-react`, `@rolldown/plugin-babel`, and `babel-plugin-react-compiler` as peers, all marked optional. Do not install them.

**Theme init must precede first paint** to avoid a light flash in dark mode. Set `data-theme` from a small inline script in each `index.html`, or in `main.tsx` before `createRoot`, not inside a component effect.

**Dark elevation differs in kind.** Light mode carries depth with hard offset shadows; dark mode carries it with the `surface-base-dark` → `surface-raised-dark` tonal step plus `border-strong-dark`. Do not reuse the light offsets in dark as the primary depth cue. Never thin `border-default` below 2px in dark mode.

**Blank means blank.** The unknown-route page and this story's empty route regions render nothing — no "not found" text, no illustration, no refresh affordance, no back link. `EXPERIENCE.md` overrides the `DESIGN.md` empty-state card here.

## Verification

**Commands:**

- `node --version` -- expected: 22.22.0 or higher; below this, halt rather than working around the floor
- `npm install` -- expected: completes with no `EBADENGINE` warning and no peer-dependency error
- `npm run typecheck` -- expected: TypeScript reports zero errors across server and both client apps
- `npm run build` -- expected: server compiles and both Vite apps emit bundles, admin under a `/admin/` base
- `npm start` with the five env vars set -- expected: one listening line on stdout; the SQLite file and its `-wal` sidecar appear at `DATABASE_PATH`
- `curl -i http://localhost:$PORT/` and `curl -i http://localhost:$PORT/admin` -- expected: HTTP 200 and each app's own HTML
- `curl -i http://localhost:$PORT/api/nope` -- expected: HTTP 404 and a JSON body containing `error.code` and `error.message`
- `npm start` with `DATABASE_PATH` unset -- expected: non-zero exit and one stderr line naming the missing variable

**Manual checks:**

- Storefront under 760px shows the 56px bottom tab bar with safe-area padding and Browse active; at 760px and above the same four destinations sit in a top nav with content capped at 760px.
- Admin shows the 214px ink sidebar in the specified order with Export pinned at the bottom behind a 24px gap and a 2px rule; narrowing below ~900px keeps it usable.
- Tab through both apps: the doubled ring appears on keyboard focus and not on mouse click.
- Emulate dark mode in devtools: all 21 roles resolve to their `-dark` values.
- Emulate `prefers-reduced-motion: reduce`: the skeleton holds still at its base fill.
- Open `/nonsense` and `/admin/nonsense`: both render a genuinely empty page.

## Suggested Review Order

**Boot and mounts**

- Compose env, one SQLite connection, migrations, then `/api` `/admin` `/`.
  [`index.ts:10`](../../server/web/index.ts#L10)

- Refuse boot with one stderr line naming every missing env var.
  [`env.ts:17`](../../server/web/env.ts#L17)

- Open the single WAL connection and fail if journal mode is not WAL.
  [`db.ts:6`](../../server/web/db.ts#L6)

- Run the numbered migrator against an empty list and an applied-migrations table.
  [`run.ts:10`](../../server/db/migrations/run.ts#L10)

- JSON 404 envelope for every unmatched `/api` path.
  [`api.ts:3`](../../server/web/api.ts#L3)

**One origin, two apps**

- Mount admin only on `/admin` or `/admin/…`, never `/adminfoo`.
  [`static.ts:7`](../../server/web/static.ts#L7)

- Vite middleware in dev; built SPA fallbacks in production.
  [`static.ts:48`](../../server/web/static.ts#L48)

- Workspace root: one install, one process, pinned engines.
  [`package.json:5`](../../package.json#L5)

**Chalk & Brass tokens**

- Twenty-one colour roles plus designed `-dark` peers on `:root`.
  [`tokens.css:1`](../../client/ui/tokens.css#L1)

- Doubled `:focus-visible` ring, 44px targets, reduced-motion kill switch.
  [`base.css:58`](../../client/ui/base.css#L58)

- Set `data-theme` from `prefers-color-scheme` before first paint.
  [`index.html:7`](../../client/storefront/index.html#L7)

- Follow later system theme changes; expose an unused explicit override.
  [`theme.ts:7`](../../client/ui/theme.ts#L7)

- Pile-of-books mark plus "Book List" in an ink chip, no tagline.
  [`BrandLockup.tsx:1`](../../client/ui/BrandLockup.tsx#L1)

**Storefront chrome**

- Data router so `useNavigation` is valid; Browse landing; blank catch-all.
  [`App.tsx:17`](../../client/storefront/src/App.tsx#L17)

- Bottom tabs under 760px, top nav above, skeleton then spinner then outlet.
  [`Shell.tsx:17`](../../client/storefront/src/Shell.tsx#L17)

**Admin chrome**

- Same data-router pattern with `basename: '/admin'` and Orders landing.
  [`App.tsx:17`](../../client/admin/src/App.tsx#L17)

- 214px ink sidebar, Export pinned at the bottom behind a rule.
  [`Shell.tsx:32`](../../client/admin/src/Shell.tsx#L32)

**Peripherals**

- Matrix coverage for boot, mounts, chrome CSS, and dark-token remap.
  [`io-matrix.test.ts:81`](../../server/web/io-matrix.test.ts#L81)

- Ignore dotenv variants and SQLite artifacts; keep `.env.example`.
  [`.gitignore:1`](../../.gitignore#L1)
