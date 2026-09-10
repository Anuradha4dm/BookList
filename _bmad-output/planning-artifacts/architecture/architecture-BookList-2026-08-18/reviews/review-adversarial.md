# Adversarial review — Architecture Spine

- **Artifact:** `_bmad-output/planning-artifacts/architecture/architecture-BookList-2026-08-18/ARCHITECTURE-SPINE.md`
- **Lens:** adversarial (finalize gate) — two units one level down, each obeying every AD to the letter, still incompatible
- **Altitude under test:** feature → epics / modules / storefront vs admin
- **Date:** 2026-08-18
- **Spine not edited.**

## Verdict

**Revise before finalize.** The paradigm, module cut, and a few mutation rules are real. They do not pin the shared *shapes* or the *second* mutation paths the next layer will invent. Two epics can follow every AD, compile, and still disagree on what a cart pack line is, where profile and money live, how status moves, and what `/api` returns.

An empty hole list would be a miss. The pairs below are the holes; each needs a new or tightened AD (or an explicit Deferred with a revisit that names the single owner).

## Method

For each pair: name the two units, show a build that satisfies every current Rule, show the clash (shared-data shape, two owners of one entity, or conflicting mutation path), then the AD to close it. PRD/UX citations are evidence that the divergence is load-bearing, not taste.

---

## Incompatible pairs

### Pair 1 — Configured pack line (catalog vs cart vs orders)

**Units:** catalog/pack-admin epic; cart/storefront-pack epic (orders inherits whatever cart emits at Place Order).

**Compliant builds:**

- *Catalog-literal:* A pack is `Pack` + `PackBook` (book ids). Cart “clone, never merge” (AD-4) means insert another `CartPack(pack_id)` row. Ticks/qty live only in the React pack screen and are dropped on add. Place Order copies “titles, prices, quantities” by re-reading live pack membership and current book prices (AD-4 never-store pack price; AD-3 orders may call catalog).
- *Cart-as-configuration:* Add-to-cart POSTs the configured subset (per-title included + qty 1–20). `CartPack` clones that payload; a second add of the same pack is a second row (AD-4). Place Order snapshots that payload and never reads catalog again.

**Clash:** The product’s differentiator (PRD FR31–FR34, FR39: independent tick/qty clones per child) has no spine shape. ER shows `Pack ||--o{ CartPack : cloned` with no configured-line entity. Parent history, admin detail, and export then disagree on grain (pack name vs ticked books).

**Hole:** Tighten **AD-4**. A cart pack line *is* a cloned configuration: pack identity + per-book included flag and quantity, never a live `pack_id` pointer. Item lines merge by item id + quantity. Place Order copies that configuration (pack name, each ticked title, unit prices, quantities) onto order lines of the same grain. Catalog pack membership is the template only.

---

### Pair 2 — Price-at-add vs live reprice (cart vs orders/checkout)

**Units:** cart module; orders Place Order / checkout epic.

**Compliant builds:**

- *Live cart (AD-4 letter):* “Archive and price edits affect storefront and carts only.” Cart stores ids only; every GET recomputes prices from catalog. Place Order copies whatever catalog says *now*. FR49 “changed since it was added” is undetectable — there is no baseline.
- *Frozen-at-add:* Cart stores `unit_price_rupees` per constituent at add. Checkout compares to catalog (stale flags). Place Order copies cart prices. Archive still “affects carts” as a flag, not a silent rewrite.

**Clash:** AD-4’s live-leak sentence and Place Order snapshot sentence can be read as opposites for the *cart* window. Capability map puts “stale lines” on cart and cites AD-9, but AD-9 binds FR51–FR52 and T1–T11, not FR49. No owner for the comparison baseline.

**Hole:** Split the window in **AD-4** (or a new AD): carts retain add-time titles/prices for drift detection; GET may *annotate* live catalog (archived / removed / repriced) and must not silently rewrite stored figures. Place Order copies the acknowledged cart figures, then never reads catalog. Orders does not own staleness; cart does; Place Order refuses unresolved flags.

---

### Pair 3 — Profile has no write owner (identity vs orders vs storefront Account)

**Units:** identity; orders Place Order; storefront Account epic.

**Compliant builds:**

- *Credentials-only identity:* AD-3 writes “parent accounts, the one admin, sessions, password hashes, recovery-code hash.” Name, delivery address, WhatsApp, second phone, email live on a checkout payload and are written only onto the order at Place Order (AD-4 “copies … delivery address, and contacts”). Profile page has nowhere server-side to PUT. FR5/FR47 fail or get faked in React.
- *Identity-owns-profile:* Those fields sit on `Account`. Place Order reads identity and snapshots. Admin parent-reset (FR10) and profile share one row.

**Clash:** Authz convention says “parent sees only own … profile” and AD-4 copies profile onto the order, but AD-3 never grants identity those columns and never forbids orders from owning them. Two owners of one person-record.

**Hole:** Extend **AD-3** identity writes: parent profile (name, delivery address, WhatsApp, optional second phone, email). One address per account; no per-order override. Place Order reads identity and snapshots; it does not accept a substitute address in the place payload.

---

### Pair 4 — One `notes` column, three writers (storefront vs admin cancel vs admin detail)

**Units:** parent checkout; admin cancel; admin order-detail (call / shop notepad).

**Compliant builds:** Each writes `Order.notes` (AD-3: orders owns “notes”). Parent delivery note (FR48), required cancellation reason (FR73 / T6), PRD admin free-text note. UX EXPERIENCE.md also says no private shop notepad — so a fourth compliant build is to omit admin notes entirely.

**Clash:** Last writer wins. Confirm-call context, parent “after five,” and cancel reason overwrite each other. Export CSV has one ambiguous `notes` field.

**Hole:** Tighten **AD-3** orders writes to three distinct fields: `parent_delivery_note` (set only at Place Order, immutable after), `cancellation_reason` (required on cancel, visible to parent), `admin_note` (optional, admin-only) — or explicitly Deferred-drop `admin_note` if UX wins, but then say so. Do not bind a single `notes`.

---

### Pair 5 — Delivery price and payable total (admin confirm vs parent pipeline vs Place Order)

**Units:** admin confirm epic; parent order-detail epic.

**Compliant builds:**

- *Status-only AD-9:* Place Order snapshots goods lines (AD-4). Confirm is a status write with expected-current (T7). Delivery rupees typed in admin React and stored in `admin_note` or not at all. Parent computes payable as goods total. FR61 “same action” is UI-only.
- *Money-on-confirm:* `delivery_price_rupees` + `payable_total_rupees` written in the same SQLite transaction as the transition to Order Confirmed (T2, T9, FR61). Parent reads those columns.

**Clash:** AD-3 orders writes list omits delivery price and payable total. AD-9 prevents half-placed orders, not half-confirmed money. A Delivered order with no payable total is reachable if T2 is not an AD (it is only a PRD citation in AD-9’s Binds/Prevents prose, not a Rule).

**Hole:** Extend **AD-9**: Order Confirmed is one transaction: expected status + required non-negative integer delivery rupees + payable = snapshotted goods + delivery. No later edit of lines, delivery, address, or contacts (T9). Skip-confirm to later statuses is illegal. Cancelled must not carry a payable total (T8).

---

### Pair 6 — Status tokens and adjacency (admin today-list vs parent timeline)

**Units:** admin orders epic; storefront order-history epic.

**Compliant builds:** Both “validate expected current status (T7)” and “parent-cancel vs admin-confirm: first commit wins (T8).” One stores slugs `placed|confirmed|processing|packing|ready|on_partner|delivered|cancelled`. The other stores PRD display strings (`Order Is Placed`, `Packing The Order`, …). One allows admin to jump `placed → delivered`; the other implements T2–T6. Both are AD-9-legal because the Rule does not name the eight statuses or adjacency (T3 skip 3–6, T4 floor at Confirmed, T5 terminals, T6 cancel from non-terminal).

**Clash:** Shared order row, incompatible state machine. Parent timeline and admin filters do not round-trip. Export status column is a dialect.

**Hole:** Put the **named statuses + adjacency** in **AD-9** (or a new AD). Canonical stored tokens (pick one set), who may set each, skip/floor/terminal rules. Citing “T1–T11” is not enforceable without the table.

---

### Pair 7 — Cookie and session (web vs identity)

**Units:** `web`; `identity`.

**Compliant builds:**

- *Web-owns-HTTP:* AD-1/AD-3: `web` wires HTTP and cookies. `web` signs the cookie, chooses name/path/TTL, calls identity only to check password. Session row shape is identity’s; cookie mechanics are web’s.
- *Identity-owns-session:* AD-5: session rows in SQLite, one cookie for both apps. `identity.login` is the only Set-Cookie / destroy path. `web` is a pass-through.

**Clash:** Two owners of one session. Storefront vs admin can still share *a* cookie (AD-5) while login TTL, cookie `Path` (`/` vs `/api` vs `/admin`), and logout disagree. Sleep/restart survival (AD-5) holds either way; cross-app logout does not.

**Hole:** Tighten **AD-5**: identity is the only module that creates, reads, and destroys sessions and is the only Set-Cookie / Clear-Cookie source. Name, Path=`/`, Max-Age (pick one), and logout that kills the row. `web` forwards the cookie bytes; it does not invent a second session scheme.

---

### Pair 8 — Actor context (every domain module vs web)

**Units:** any two of catalog, cart, orders (plus web).

**Compliant builds:** Authz convention + AD-7: “enforced in the module, not the page.” Catalog implements `updateBook(body)` and trusts `web` already checked admin. Cart implements `getCart(accountId)` with the id taken from a query string web passed through. Orders implements `listOrders()` with no actor and filters in the admin React app only — forbidden by the convention if someone notices, but AD-7’s Rule is “PRD rules in the owning module,” not a single `Actor` type. Meanwhile identity exposes `currentAccount(cookie)` and expects every module to call it.

**Clash:** Same HTTP request, three notions of “who.” Parent isolation (NFR9) holds in one module and leaks in another. Admin catalog writes exist without a shared gate.

**Hole:** New **AD** (or AD-5/AD-7): `web` resolves the session to an `Actor { accountId, role }` via identity and passes that object into every module call. Modules never take account id from the client body for authz. Catalog mutations require `role=admin`. Cart/orders parent reads require `actor.accountId === resource.accountId` unless admin.

---

### Pair 9 — JSON API contract (storefront vs admin)

**Units:** `client/storefront`; `client/admin` (both doors per AD-1, both `/api/*` per AD-7).

**Compliant builds:** Success bodies camelCase; failures `{ error: { code, message } }`. That is the entire Rule.

- Storefront: REST `/api/cart`, `/api/orders`, HTTP 200 with `{ error }` on failure, idempotency key in JSON body as `clientKey`, lists as bare arrays, codes like `CART_STALE`.
- Admin: RPC `POST /api/admin/*`, HTTP 4xx with the same envelope, header `Idempotency-Key`, lists as `{ items, total }`, codes like `stale-status`.

Same-origin cookies still work. No tRPC/GraphQL. No SQLite from the browser.

**Clash:** Shared-data shapes at the wire. A later shared `client` helper cannot exist. Error handling forks. Place Order idempotency (AD-9) is not a shared header/body rule.

**Hole:** Tighten **AD-7**: resource map (at least auth, profile, catalog reads, cart, place, parent orders, admin orders, export), HTTP status with the error object (never 200-with-error), list envelope, and the idempotency key’s exact location and reuse semantics. Freeze a starter set of `error.code` tokens for the races already in AD-9 (stale transition, cancel-vs-confirm loser, duplicate place, unresolved stale cart).

---

### Pair 10 — Export joining live catalog (orders export vs AD-4 freeze)

**Units:** admin export epic; orders snapshot reads.

**Compliant builds:** AD-10: one zip; `orders` assembles it “by calling `catalog` and its own reads.” Export *enriches* order rows with current book titles/prices from catalog so Excel looks “complete.” AD-4: placed orders never dereference live catalog — export uses snapshot tables only; catalog is called solely for the catalog CSV files.

**Clash:** AD-10’s call to catalog does not say *which* files it may feed. Season-old orders in the CSV can show this season’s prices while the SQLite copy in the same zip has snapshots. Restore vs Excel disagree.

**Hole:** Tighten **AD-10**: catalog functions feed **catalog** CSVs only. Order CSVs are snapshot-only (same grain as Pair 1). SQLite copy is the restore; no live join.

---

### Pair 11 — Allowed depends-on (web→catalog vs linear chain)

**Units:** web/catalog-browse epic; web-as-orders-facade epic.

**Compliant builds:**

- Mermaid: `WEB → ID, ORD, CART, CAT`. Storefront browse is `web` calling `catalog` directly. Legal by diagram.
- AD-3 sentence: “Allowed depends-on: `web → orders → cart → catalog`.” Read as a pipeline: `web` may import only `orders`. Browse goes through orders, which then calls catalog — or is implemented by putting read DTOs on orders.

**Clash:** Import graph and HTTP layout fork. Catalog TypeScript API is either a first-class web dependency or an internal of cart/orders.

**Hole:** Tighten **AD-3** to match the mermaid (if that is the intent): `web` may call any domain module; domain arrows never reverse; `web` still owns no tables. Delete the linear-chain reading.

---

### Pair 12 — App mount and deferred router (storefront vs admin vs web static)

**Units:** storefront routing epic; admin routing epic; `web` static serving.

**Compliant builds:** AD-6: two Vite apps, Express serves the production build. Deferred: “Client router library (revisit when storefront routing is first implemented).” Admin ships first with a different router and is mounted at `/`. Storefront later uses another router at `/shop`. Cookie `Path` and SameSite same-origin (AD-5, AD-7) break or require two origins. Alternatively both apps are SPAs at `/` and `/admin` but `web` has no AD for the URL split, so a third epic serves admin as a second port (not same-origin).

**Clash:** Deferred router is allowed to diverge two clients. Mount path is unset, so the “one cookie, same-origin `/api`” pair is not actually constrained.

**Hole:** Do not Deferred the mount. New rule under **AD-6** or **AD-7**: storefront origin path `/`, admin `/admin/`, both same host; `/api` shared. Router *library* may stay Deferred if both apps use the same one when the first app picks it — say that, or pick it now.

---

### Pair 13 — Quantity cap and last-title lock (catalog vs cart vs storefront)

**Units:** pack-discovery/storefront; cart adjust-qty.

**Compliant builds:** AD-7: all PRD rules enforced in the owning module — but no AD names the owner of FR31–FR32 and FR37 (last title locked; qty 1–20; item merge must not exceed 20). Catalog validates configuration on “preview pack.” Cart validates on save and allows 21 if the line was created another way. Storefront disables the stepper and trusts the server. Both servers can pass AD-7 by claiming the other module owns it.

**Clash:** Invalid configurations persist, Place Order snapshots them, admin packs the impossible line.

**Hole:** Name the owner in **AD-3**/**AD-4**: catalog defines pack template constraints; **cart** is the owner of configured-line invariants (at least one ticked title, per-title qty 1–20, item qty 1–20 after merge). Orders refuses to place a cart that fails those checks; it does not reimplement them.

---

### Pair 14 — School–grade–pack cardinality (catalog admin vs storefront discovery)

**Units:** catalog CRUD; storefront filter (FR29).

**Compliant builds:** ER: `School ||--o{ Pack` and `Grade ||--o{ Pack` as independent 1:N. A pack has a school *or* a grade, or two FKs, or a M:N join — all fit. Storefront assumes one pack = one school + one grade and filters grades “that have live packs for the chosen school.” Admin creates reusable grades globally or per school.

**Clash:** Discovery empty-states and admin forms do not share a pack identity. Grade dropdown scoping cannot be implemented against the other epic’s tables without a rewrite.

**Hole:** Seed is allowed to be thin, but this cardinality *is* an invariant. Add to **AD-4** or ER-as-rule: a pack belongs to exactly one school and exactly one grade; grades are a global list; live-pack existence scopes the grade dropdown. Items are not school-scoped (FR36).

---

### Pair 15 — Parent password reset (identity vs admin vs UX v2)

**Units:** identity; admin parents epic.

**Compliant builds:** Capability map: “parent password reset” lives in identity (AD-3, AD-11). PRD FR10: admin sets a new parent password from the parent record. AD-11 Rule text only specifies *admin* recovery code, env seed, scrypt. EXPERIENCE.md parks parent reset, admin recovery, and FR10 to v2. Identity ships admin recovery only. Admin epic ships FR10 against `/api/parents/:id/password`. Storefront has no recovery UI (obeys UX). All can cite an AD.

**Clash:** Two owners of password hashes (already identity’s write) vs who may call `setPassword`. v1 vs v2 cut is not an AD. Capability map contradicts UX; AD-11 is silent on FR10.

**Hole:** Either bind FR10 on identity as an admin-only function (no email; admin supplies the new secret; never echoed to React beyond success), or move parent reset to Deferred with a revisit. Do not leave it only on the capability map.

---

### Pair 16 — `call-attempted` shape (admin list vs admin detail)

**Units:** two admin order stories, or list vs detail.

**Compliant builds:** AD-3 lists “call-attempted” as an orders write. Boolean toggle. Timestamp (PRD: marker + timestamp). Counter of attempts. Each is a legal row. AD-9 does not mention it.

**Clash:** List filter “not yet called” vs detail “last tried at” vs export column.

**Hole:** Tighten **AD-3**: `call_attempted_at` nullable UTC text; set/clear is an orders mutation that does not change status.

---

## Deferred items that already let two units diverge

- **Client router library** — two apps, two libraries, two URL schemes (Pair 12). Revisit condition is “when storefront routing is first implemented,” which invites admin to choose first, alone.
- **CSRF extras / rate limiting** — storefront vs admin can each add a different extra and break the shared cookie.
- **Live push vs poll** — only one parent client, weaker; still no poll interval if both a PWA later and the current SPA appear.

These are holes if left as unconstrained Deferred. Name the single picker (first app to implement) or pin the mount/cookie now.

---

## What is already tight enough

Not every seam is open. Do not spend another AD on: one process / one SQLite file; no Next/tRPC/ORM; no worker/mailer; React+Vite two bundles + `client/ui`; integer rupees; Place Order as one transaction that empties the cart; first-commit-wins on cancel vs confirm *as a race rule* (the gap is the rest of the state machine and the money write, not T8’s slogan); WAL + one connection; recovery code never rendered in React.

---

## AD amendments this gate is asking for

Close with new or tightened rules, not commentary:

1. **AD-4** — configured pack-line shape; add-time price/title baseline; no silent cart rewrite; Place Order grain = that configuration.
2. **AD-3** — identity owns profile fields; orders owns three note fields + `call_attempted_at` + delivery/payable columns; cart owns configured-line invariants; depends-on matches the mermaid.
3. **AD-9** — named statuses + adjacency; confirm + delivery rupees + payable in one transaction.
4. **AD-5 + actor AD** — identity-only cookie; `Actor` passed from `web`; modules do not trust client ids.
5. **AD-7** — routes, list envelope, HTTP status, idempotency key location, starter `error.code` set.
6. **AD-10** — no live catalog join into order CSVs.
7. **AD-6** — URL mount `/` and `/admin/` same origin (router library may stay Deferred only with a first-picker rule).
8. **AD-11 / Deferred** — FR10 parent reset: bind or explicitly defer; capability map must match.

Until those land, the spine does not keep independently built epics compatible.
