# Rubric Walk — Architecture Spine (Finalize)

- **Spine:** `_bmad-output/planning-artifacts/architecture/architecture-BookList-2026-08-18/ARCHITECTURE-SPINE.md`
- **Altitude:** feature (level below = epics / independently-built folders + the two React apps)
- **Inputs checked:** PRD + addendum, UX EXPERIENCE.md / DESIGN.md (for capability coverage and silent dims), memlog (constraints only — not treated as proof), repo (no application code)
- **Mechanical lint:** `lint_spine.py` → `ok: true`, 0 findings
- **Independent stack check (2026-08-18):** Express 5.2.1, better-sqlite3 13.0.3, React 19.2.8, Vite 8.2.1, TypeScript 7.0.2, tsx 4.23.12, Bonto Node 18/20/22 (no 24) — pins match current except tsx (see F6)

## Verdict

**revise**

The spine is a real contract: paradigm, module cut, write ownership, snapshots, session cookie, one SQLite file, Place Order atomicity, export, and the Bonto-free → Glitch path are load-bearing and mostly enforceable. It is not yet safe to hand to independently-built epics. Two client apps have no URL/mount contract; several Deferred items can still fork the two UIs; FR49 and pack-line server rules are bound by ID but not by Rule; the operational envelope is incomplete (connection owner, migration apply, session TTL).

---

## Checklist

### 1. Fixes real divergence points for the level below — **fail (gaps)**

Units one level down: `identity` → `catalog` → `cart` → `orders` folders, plus `client/storefront`, `client/admin`, and `web`.

**Caught well:** one process vs a second service (AD-1); UI-sliced “order” ownership (AD-1/AD-3); Next vs Vite React (AD-6); JWT vs cookie (AD-5); ORM vs SQL-in-owner (AD-8); tRPC/GraphQL vs JSON (AD-7); in-memory sessions vs SQLite (AD-5); stored pack price vs computed (AD-4); merged pack lines vs clone (AD-4); live catalog on placed orders (AD-4); CSV-only vs db-only export (AD-10); worker/mailer (AD-9); secrets in git (AD-11).

**Missed (would let two epics choose incompatibly):**

| Divergence | Why it is real at this altitude |
| --- | --- |
| How Express mounts storefront vs admin vs `/api` | Two SPAs + one API. Catch-all `/` swallows `/admin` and `/api` unless `web` and both Vite `base` values agree. AD-6 says “the Vite build” (singular). UX names an “Admin URL”; the spine never binds path vs subdomain. |
| Who holds the single `better-sqlite3` connection | AD-8 forbids per-request connections but does not name the singleton owner. Identity (built first) and catalog will each `new Database()` unless `server/db` (or `web`) injects one. Seed has `db/migrations/` only. |
| Who enforces FR49 stale-cart checks | Capability row puts “stale lines” in `cart` and cites AD-4/AD-9. AD-4’s Rule never mentions detection, acknowledgement, or Place Order refusal. Cart epic vs checkout/orders epic can duplicate or contradict (remove vs acknowledge vs silent reprice). |
| Who enforces locked-last-title and qty 1–20 server-side | NFR11 + AD-7 (“owning module”). Pack ticks live on cloned cart lines, not catalog. No AD or capability row names `cart` (and Place Order) as owner. Storefront can implement UI-only; catalog can grow a second validator. |

Build-order (AD-3) is a genuine epic-sequencing invariant and should stay.

**Action:** autofix the URL map and connection owner; discuss/bind FR49 + pack-line owners (F1, F3, F4).

### 2. Every AD Rule is enforceable and actually prevents its stated divergence — **fail (two ADs over-claim)**

| AD | Enforceable? | Prevents what it claims? |
| --- | --- | --- |
| AD-1 | Yes — one deployable, domain folders own writes | Yes |
| AD-2 | Mostly — process + durable file + named hosts + env-only config | Yes for rewrite/sleep-as-identity. “Ephemeral disk as production” is prevented by “durable SQLite file” + Glitch, not by a host-class rule that would survive leaving Bonto. Fine at this altitude. |
| AD-3 | Yes — folder table, depends-on arrows, function-only calls, build order | Yes |
| AD-4 | Partial — clone/merge, computed pack price, snapshot copy, no live deref | **No for its Binds.** Binds FR47–FR53 (includes FR49) and §7. Rule never states: checkout compares cart to live catalog; unavailable lines must be removed; repriced lines require acknowledgement of the **new** price; Place Order refuses unresolved stale lines. Archive/price “affect storefront and carts only” does not prevent two checkout semantics. |
| AD-5 | Yes — one cookie, flags, SQLite sessions, anonymous browse vs authed cart | Yes. Cookie **name**, Path, Max-Age/TTL unnamed (see F4). |
| AD-6 | Partial — two Vite apps, `client/ui`, no named kit, Express serves `/api` | Prevents Next/MUI/shadcn/Tailwind. Does **not** prevent incompatible static mounts or shipping both bundles to `/`. “The Vite build” under-specifies two `dist`s. |
| AD-7 | Envelope yes (`error.code` / `error.message`, camelCase, cookie credentials) | “All PRD rules … in the owning module” is not enforceable until the owner of pack-line and FR49 rules is named. Does not by itself stop a React-only lock. |
| AD-8 | Yes for file, library, WAL, no ORM, no cross-module SQL | “One connection” has no owner — the Prevents line is not actually closed. |
| AD-9 | Yes for one transaction, client idempotency key, T7 expected-status, T8 first-commit-wins, no second process | Yes for stated Prevents. T1–T6/T9 are PRD product rules; citing them in Binds without encoding them is acceptable (not an architecture trade-off). Idempotency key **transport** (header vs body) unnamed — only storefront places orders, so low. |
| AD-10 | Yes — one zip, CSV + SQLite copy, `orders` calls `catalog` | Yes. Safe-copy while WAL is hot (`backup()` vs `copyFile`) is a single-unit detail; ignore. |
| AD-11 | Yes — env secrets, scrypt, first-boot print-once, never in React | Yes. First-boot **variable names** are still “admin env vars” (F4). |

**Action:** tighten AD-4 and AD-6 Rules; name connection owner in AD-8 (autofix). Do not copy the whole status machine into AD-9.

### 3. Nothing under Deferred could let two units diverge — **fail**

| Deferred item | Two units could fork? | Disposition |
| --- | --- | --- |
| Client router library | **Yes.** Storefront and admin are two apps sharing `client/ui`. “Revisit when storefront routing is first implemented” does not bind admin. React Router vs TanStack vs wouter is a real trade-off. | Promote: both apps share **one** router; first storefront implementation binds admin (or name the library now). |
| CSRF extras beyond SameSite=Lax | **Yes.** One epic adding CSRF tokens (header + cookie) breaks the other app’s fetches. Same-origin + Lax is already the chosen story. | Promote to AD/convention: v1 is SameSite=Lax + same-origin; **no** CSRF tokens. |
| Automated test runner | Possible (Vitest vs `node:test`; server vs client). “Revisit at identity folder” is first-writer-wins for server only. | Autofix the Deferred line: identity’s pick binds the **repo**, including clients — or name one runner. |
| Rate limiting | Unlikely to break interfaces | Leave Deferred |
| Live push / poll | Independent pollers do not collide | Leave Deferred |
| Node 24, Litestream, payment, i18n, tRPC/ORM/Next/Postgres | Rejected or clearly later | Leave |
| Off-box replica | No — AD-10 is v1 | Leave |

**Action:** F2 — promote router-sameness and CSRF-none; tighten test-runner first-writer.

### 4. Named tech is verified-current — **pass with one pin gap**

Independent check, 2026-08-18:

| Name | Spine | Current | Notes |
| --- | --- | --- | --- |
| Node.js 22 | Bonto max | Bonto documents 18/20/22; no 24 | Correct constraint. Parenthetical “18/20 not current LTS” is sloppy (24 is current LTS; 22 is previous LTS still on Bonto). Ignore. |
| Express 5.2.1 | pinned | 5.2.1 | Verified |
| better-sqlite3 13.0.3 | pinned | 13.0.3 (2026-08-05) | Verified |
| TypeScript 7.0.2 | pinned | 7.0.2 latest (Go-native, 2026-07-08) | Verified current, not asserted |
| React 19.2.8 | pinned | 19.2.8 (2026-07-21) | Verified |
| Vite 8.2.1 | pinned | 8.2.1 (2026-08-06) | Verified |
| tsx | **“current 4.x matching Node 22”** | 4.23.12 (2026-08-10) | Range, not a pin. Lint does not flag it (cell is non-empty). |

Bonto Glitch as always-on + one custom domain is consistent with the memlog’s 2026-08-18 research; not re-litigated here.

**Action:** F6 — pin tsx `4.23.12` (or `4.23.x`). Autofix.

### 5. No brownfield code to ratify — **pass**

Greenfield. Memlog: no app code. Workspace has no application `ts`/`tsx`/`js` tree. Nothing to ratify or contradict.

### 6. No spec CAP-ids; PRD areas mapped — **pass (coverage almost enough)**

No spec, no CAP-ids. Capability table is area-based, which is correct.

Mapped: identity (incl. seed/recovery), catalog entities, pack discovery + computed price, cart clone/merge/stale, Place Order/snapshot/ids/parent cancel, today list + T1–T11, parent history, export, Chalk & Brass, HTTP/cookies/Vite.

**Thin or missing rows (not silent product areas, but weak governance links):**

- Pack-line rules FR31–FR33 / qty cap / NFR11 — no row, no owning AD Rule.
- FR49 — listed under cart as “stale lines” but not governed by a Rule that mentions it.
- FR5/FR7 profile address vs checkout snapshot — covered by AD-4 snapshot + identity, enough.
- FR10 admin resets parent password — folded into the identity row; enough.
- §11 empty/error states — UX EXPERIENCE.md owns behaviour; error envelope is a convention. Enough for architecture.
- NFR1 mobile-first, NFR5/NFR6 performance — no numeric budgets in PRD; not an architecture fork if deferred. They are **not** in Deferred (see F5).
- UX parks FR10/FR74 as v2; PRD and AD-11 keep them. Spine correctly follows PRD. Not a coverage miss.

**Action:** add one capability row for pack-line + FR49 owners once F3 is decided. Medium otherwise.

### 7. No parent spine — **pass**

No Inherited Invariants section. Frontmatter `companions: []`. Memlog: no parent spine. No AD can weaken an inherited one.

### 8. Every altitude-owned dimension decided, deferred, or open — **fail (ops / env holes)**

Feature altitude owns the operational/environmental envelope. Sweep:

| Dimension | State |
| --- | --- |
| Paradigm / process shape | Decided (AD-1) |
| Module cut / deps / build order | Decided (AD-3) |
| Authn/z | Decided (AD-5, Authz convention) |
| Persistence / WAL / SQL-in-owner | Decided (AD-8) |
| Mutations / races | Decided (AD-9) |
| Shared catalog vs snapshots | Decided (AD-4) |
| API envelope | Decided (AD-7) |
| Clients / visual tokens | Decided (AD-6, Visual convention) |
| Money / time / IDs / naming | Decided (conventions) |
| Deploy + host path | Decided (AD-2, env diagram) |
| Infra: one durable SQLite file on Bonto disk | Decided |
| Logging / no log service | Decided |
| Secrets | Decided (AD-11) — **names** of first-boot vars not decided |
| Durability beyond host | Decided (AD-10) + Deferred Litestream |
| No worker / no outbound | Decided |
| Node 24 | Deferred |
| Payment, i18n, images, extra domain | Deferred |
| **Two-app URL map / `base` / SPA fallback** | **Silent** |
| **Who opens the one DB connection** | **Silent** |
| **How numbered migrations run (boot vs CLI) and filename scheme** | **Silent** — shared `db/migrations/` + build order almost helps numbering; apply-on-deploy is ops |
| **Session TTL / cookie Max-Age** | **Silent** |
| **Process start / health / Bonto start command** | **Silent** (provider-default is acceptable if deferred) |
| **HTTPS termination** | Implicit on Bonto; acceptable if deferred as provider-owned |
| **NFR5/NFR6 performance budgets** | **Silent** (not deferred) |
| CSRF | Deferred but should be an AD (F2) |
| Client router | Deferred but should bind sameness (F2) |
| Test runner | Deferred (tighten) |
| Alerting / telemetry | Decided by omission + stdout-only (PRD: no telemetry). OK |

No Open Questions section. Silent dimensions were not recorded as questions. That is the failure mode the template warns about — especially migrations-on-deploy and the URL map.

**Action:** F1, F4, F5.

---

## Findings

### F1 — Two Vite apps have no URL / mount contract
- **Severity:** high
- **Checklist:** 1, 2 (AD-6), 8
- **Action:** autofix

AD-6/AD-7 and the seed tree create two SPAs plus `/api`, but never bind:

- storefront origin path (almost certainly `/`)
- admin path (`/admin` vs a separate host; UX says “Admin URL”)
- Vite `base` for each app
- Express static + SPA fallback order so `/api` and `/admin` are not eaten by the storefront catch-all

Independently built `web`, storefront, and admin epics will pick incompatible prefixes. This is the highest-probability cold-start fork.

**Fix:** one Rule sentence (or a Structural Seed note that is clearly binding): production is same-origin; Express serves `/api/*` first, admin at `/admin`, storefront at `/`; each Vite app’s `base` matches; no second hostname in v1 (custom domain is Glitch’s one, AD-2).

### F2 — Deferred CSRF and client router can still fork the two UIs
- **Severity:** high
- **Checklist:** 3
- **Action:** autofix (promote); discuss only if a CSRF token is actually wanted

Same-origin cookie API + two React apps:

- CSRF: if identity adds token middleware and storefront does not send it (or admin does and storefront does not), authenticated routes diverge. The spine already chose SameSite=Lax + same-origin. Leaving “CSRF extras” in Deferred reads as optional later work **during** v1 epics.
- Router: storefront can adopt React Router and admin TanStack Router; `client/ui` cannot stay coherent.

Test runner is the same class, weaker: first-writer at identity does not bind client tests.

**Fix:**

- AD or convention: v1 CSRF control is SameSite=Lax on same-origin; do not add CSRF tokens.
- AD or Deferred rewrite: both apps use the same client router; storefront’s first pick binds admin (or name the library).
- Deferred rewrite: identity’s test runner binds the whole repo.

Rate limiting, polling, Litestream can stay Deferred.

### F3 — FR49 and pack-line rules are bound by ID, not by Rule
- **Severity:** high
- **Checklist:** 1, 2 (AD-4, AD-7), 6
- **Action:** discuss (owner), then autofix the Rule

AD-4 Binds FR47–FR53 but the Rule stops at clone/merge + snapshot. FR49 is the money-touching seam between `catalog`, `cart`, and `orders`. PRD already specifies outcomes (remove unavailable; acknowledge **new** price; no silent reprice). Architecture still must name **who compares** and that Place Order is refused until resolved — otherwise cart vs orders vs React-only.

Same hole for FR31–FR32 / NFR11: last remaining title locked, qty 1–20. AD-7’s “owning module” is vacuous until that module is `cart` (validate on write and at Place Order). Catalog must not grow a second tick model.

**Fix:** extend AD-4 (or a thin AD): `cart` owns tick/qty/last-title and stale-line detection against catalog reads; `orders` Place Order re-validates and refuses unresolved stale lines; snapshot uses the acknowledged live prices. Add a capability row.

Do **not** restate the whole pack-screen UX; EXPERIENCE.md already owns copy and layout.

### F4 — Operational envelope incomplete (connection, migrations, session TTL, env names)
- **Severity:** high
- **Checklist:** 1, 2 (AD-8), 8
- **Action:** autofix connection + migrate-on-boot; defer-or-decide TTL and env names

Feature altitude owns deploy/env/infra/ops. AD-2 and the env diagram cover host and disk. Missing:

1. **Connection owner** — `server/db` (recommended) opens the one `better-sqlite3` connection (WAL) and passes it in; modules never open their own. Closes AD-8.
2. **Migration apply** — numbered files in `server/db/migrations/`, global sequence in dependency order, **applied on process start** (or a named CLI only — pick one). Silent today. Identity and catalog will invent different runners.
3. **Session TTL** — AD-5 flags cookies but not Max-Age. Identity vs “stay logged in” vs sleep-through-Bonto-free will fork. Decide (e.g. 30d sliding) or Deferred with a revisit (“when identity implements sessions”).
4. **First-boot env names** — convention lists `PORT`, `DATABASE_PATH`, `SESSION_SECRET`, then unnamed admin vars. AD-11 cannot be implemented consistently without names (`ADMIN_EMAIL` / `ADMIN_PASSWORD` or equivalent).
5. Start command / health check — provider-owned on Bonto is acceptable; record as Deferred “Bonto process start; no custom health endpoint in v1” so it is not silent.

**Fix:** 1–2 into AD-8 (or a one-line ops AD). 3–5 decided or explicitly Deferred/open. Do not leave them unlisted.

### F5 — NFR5 / NFR6 performance dimension is silent
- **Severity:** medium
- **Checklist:** 8, 6
- **Action:** defer (explicit)

PRD NFR5 (today list snappy) and NFR6 (long pack list) have no numbers. Architecture does not decide, defer, or ask. Two UI epics can invent conflicting “must virtualize / must not” rules, or ignore them.

**Fix:** one Deferred line: “NFR5/NFR6 remain qualitative; no virtualization/pagination invariant in v1; revisit if a pack exceeds ~N titles or the today list is slow on Bonto.” Or an open question if a number is wanted from the user.

### F6 — tsx stack row is not a version pin
- **Severity:** medium
- **Checklist:** 4
- **Action:** autofix

`tsx (dev) | current 4.x matching Node 22` is the only unpinned Stack row. Current is **4.23.12**. Pin it. Other named versions verified current; not asserted.

---

## Tail (plus 4 more)

- **low** AD-3 orders write-list omits delivery price and payable total. Unlikely to fork inside one module. Autofix: add those columns to the writes list if the table is meant to be complete.
- **low** Idempotency key transport (header vs body field) unnamed. Only storefront places orders. Defer: “client-supplied key; `web` picks header vs body when checkout is implemented; admin must not invent a second Place Order.”
- **low** Node 22 parenthetical (“18/20 not current LTS”) is imprecise given Node 24 LTS. Ignore or trim to “Bonto max 22.”
- **low** UX EXPERIENCE.md still describes vanilla HTML on `public/` and parks FR10/FR74. Spine AD-6/AD-11 correctly follow the later architecture decisions and the PRD. Reconcile UX in a later UX update; not a spine AD. Ignore here.

Not findings: no CAP-ids; no parent spine; no brownfield; rejected tRPC/ORM/Next/Postgres listed as rejected; money/time/error conventions are enforceable; lint clean.

---

## Suggested gate actions (for the Finalize parent)

| ID | Autofix vs user |
| --- | --- |
| F1 | Autofix URL map into AD-6 / seed |
| F2 | Autofix CSRF-none + shared router; tighten test-runner Deferred |
| F3 | Needs a one-line owner pick if not already implied (`cart` + Place Order recheck) — then autofix AD-4 |
| F4 | Autofix `server/db` connection + migrate-on-boot; name env vars; TTL decide or Deferred |
| F5 | Autofix one Deferred line |
| F6 | Autofix tsx pin |

After those, re-walk items 1, 2, 3, 8. Stack, brownfield, parent, CAP-id checks can stay pass.
