---
review: reconcile-ux
spine: architecture-BookList-2026-08-18/ARCHITECTURE-SPINE.md
against:
  - ux-BookList-2026-08-14/EXPERIENCE.md
  - ux-BookList-2026-08-14/DESIGN.md
date: 2026-08-18
verdict: conflict
---

# Reconcile UX → architecture spine

**Verdict: conflict**

Bar used: architecture must not copy EXPERIENCE microcopy, flows, or DESIGN.md tokens. A finding is only something a builder could ship while obeying every AD (and the capability map / conventions) and still violate a load-bearing UX decision — or a direct contradiction between the two spines.

EXPERIENCE.md and DESIGN.md remain draft (`status: draft`). The architecture spine lists both as `sources`.

## What already landed (not findings)

These UX decisions have an enforceable home. Do not restated them as ADs.

| UX decision | Where it landed |
|---|---|
| Two interfaces (parent storefront + Gothami’s admin), split bundles | AD-1, AD-6; tree `client/storefront` + `client/admin`; Prevents shipping admin JS to parents |
| DESIGN.md as visual contract (Chalk & Brass) | AD-6 Rule; Visual convention (`DESIGN.md` tokens → `client/ui` CSS variables) |
| Light and dark both v1 | AD-6 (“light and dark”); capability map row for Chalk & Brass |
| No named UI kit (not shadcn, not MUI, not Tailwind) | AD-6 Prevents + “No named component kit” |
| English only in v1 | Visual convention “English microcopy only”; AD-7 `error.message` “plain English”; Deferred Sinhala/Tamil |
| Cold-start skeleton remains | AD-2 Rule (free-tier still sleeps; Glitch makes it a no-op) |
| WCAG 2.2 AA named | Capability map: “Chalk & Brass, light/dark, WCAG 2.2 AA floor” → `client/ui` / AD-6 |
| Browse is the only anonymous surface | AD-5: catalog may be anonymous; cart, checkout, orders, admin require a session |
| Cart pack lines never merge; items merge by qty | AD-4 |
| Place Order snapshots; delivery still unconfirmed at checkout | AD-4, AD-9; money convention `Rs. 9,320` |
| No outbound email / SMS / WhatsApp | AD-9 “No outbound messaging” |
| One seeded admin, no admin registration | AD-3, AD-11 |
| One Export action | AD-10 |
| No catalog images, no admin-created orders, no payment UI | Deferred |
| NFR3: tick / qty / status without full reloads | Implied by AD-6 React apps + AD-7 JSON API |

Correctly **not** in the architecture spine (leave in UX):

- Voice/tone table and verbatim strings (`Cart is Empty`, `Item count exeeded`, …)
- Tab labels, sidebar order, pack-screen lock/qty behaviour, modal depth, empty-state copy
- Token lists, mustard-fill-only, doubled focus ring, status-pill four channels, breakpoints 760 / ~900
- UJ-1 / UJ-2 step scripts
- DESIGN.md empty-state / skeleton *visual* specs (except the EXPERIENCE supersession gap below)

## Conflicts

### C1 — Admin home: “Today list” vs all-orders (builder-visible)

EXPERIENCE Information Architecture: admin default landing is **Orders**; **one screen**, all orders, open and past, clear split; status filter only; FR58 override of a separate completed-orders screen. Component Patterns: “Admin today list” row is reused on the **merged** Orders screen; open and past are both present by default. UJ-2 climax depends on that merged list.

Architecture capability map:

> Today list, transitions T1–T11, call-attempted, notes → orders / AD-9

A builder who obeys every AD and uses the capability map as the screen list will ship an open-only / morning “today” list. That is the stale shape EXPERIENCE explicitly killed (and warned `.working/direction-navy-mustard.html` still shows).

DESIGN.md still names the component “Admin today list” and Brand & Style still says the vendor “works a single today list.” EXPERIENCE says this file wins on that admin-home shape. Architecture sided with the stale name, not with EXPERIENCE.

**Fix (spine, later):** rename the capability-map cell to “Admin Orders (all orders, open + past, status filter)” and point at EXPERIENCE IA, not “Today list.” Do not copy the row layout.

### C2 — Parent password reset listed as a v1 identity capability

EXPERIENCE Auth / v2 parking: parent password reset (email or WhatsApp) is **parked v2**; it reopens “no outbound messages in v1.” Admin website forgot-password is also parked v2.

Architecture capability map:

> Accounts, sessions, admin seed, recovery, **parent password reset** → identity / AD-3, AD-5, AD-11

AD-11 only specifies **admin** recovery (first-boot code, server log, never in React). No AD parks parent reset. A builder filling the capability map will put parent-reset in the identity folder in v1.

**Fix:** drop “parent password reset” from the v1 map (or mark parked / Deferred). Keep admin log-recovery under AD-11 if that ops path stays.

### C3 — EXPERIENCE still requires custom HTML; AD-6 forbids it

EXPERIENCE Foundation:

> No named UI system (not shadcn, not MUI): **custom HTML on Express + static `public/`**, as the addendum requires.

DESIGN.md Typography repeats Express + static `public/` HTML as the reason there is no webfont.

Architecture AD-6 Prevents **vanilla HTML sprawl** and binds two Vite React apps; Express serves the production Vite build (static output, not hand-written `public/` HTML). The memlog records this as a deliberate override of the inherited HTML starter.

Internally the architecture spine is consistent. Across artifacts it is not: a builder who treats EXPERIENCE as equal `sources` with AD-6 gets two client stacks. UX was not updated after the React call.

**Fix:** not an AD change — update EXPERIENCE Foundation (and DESIGN.md’s “static public/ HTML” rationale) to “Express serves two Vite React builds; still no named kit; system font stack still stands because cold start.” Until then, sources conflict.

### C4 — Admin recovery in v1 vs UX “forgot-password parked v2” (narrower)

EXPERIENCE parks **admin recovery code (FR74)** for v2.

AD-11 ships v1 admin recovery: generate on first boot, print once to the server log, hash in SQLite, redeem sets a new password, **never rendered in either React app**.

This does not revive outbound mail or a website forgot-password screen, so it does not smash AD-9 or the UX “no UI recovery” line. It does change v1 scope: FR74 is in the architecture, parked in UX. Redeem-with-no-React-surface is also unspecified (CLI? env? hidden POST?).

**Fix:** one sentence in AD-11 or Deferred: redeem is out-of-band (log + operator action), not a storefront/admin route — and note the UX park so epics do not grow a forgot-password page.

## Gaps (quiet UX constraints a builder can violate while obeying every AD)

### G1 — AD-6 binds DESIGN.md; EXPERIENCE supersedes DESIGN.md on behaviour

EXPERIENCE: later decisions in that file win where DESIGN.md still describes an earlier empty-state or admin-home shape. Explicit supersessions:

- Empty Cart / My Orders = label + refresh icon, **no routing CTA**. DESIGN.md Empty state: “Every empty state has that [primary] button.”
- Cold-start = shape of the page, **no spinner, no wording**. DESIGN.md Cold-start skeleton: info notice above the skeleton in the shopkeeper’s voice.
- Admin Orders empty = the list **says** it is empty (not a silent blank).

AD-6 and the Visual convention name **DESIGN.md** as the visual source. They do not say EXPERIENCE wins on behaviour. A builder implementing `client/ui` from DESIGN.md (as AD-6 requires) will ship primary buttons on empty Cart/Orders and a worded cold-start notice — both EXPERIENCE bans.

Skeleton “stays” in AD-2 does not bind no-spinner / no-copy / `prefers-reduced-motion` (EXPERIENCE Component Patterns). DESIGN.md still has shimmer + copy.

**Fix:** one convention row, not microcopy: “Visual tokens: DESIGN.md. Behaviour, empty states, cold-start treatment, IA: EXPERIENCE.md (EXPERIENCE wins on conflict).”

### G2 — AA floor is mapped, not ruled

Capability map claims WCAG 2.2 AA lives in `client/ui` under AD-6. AD-6’s Rule never mentions AA, keyboard, touch 44×44, doubled focus, or `prefers-reduced-motion`. DESIGN.md covers contrast, focus-indicator, and 44×44 if followed; EXPERIENCE additionally requires full keyboard operability, SR name/role/state, and status never hue-only.

Two apps (`storefront` vs `admin`) can each “use the tokens” and still ship one inaccessible admin (CM1). That is a two-unit divergence AD-6’s Prevents list does not cover.

**Fix:** one clause on AD-6: both apps meet WCAG 2.2 AA per EXPERIENCE Accessibility Floor; DESIGN.md contrast/focus tokens are necessary, not sufficient. Do not paste the AA bullet list.

### G3 — Not a PWA / no offline client (silent)

EXPERIENCE Responsive & Platform: **not a native app, not a PWA**. Foundation: no offline mode; a down connection is a wait; cart is server-side.

Deferred rejects tRPC/ORM/Next/Postgres and lists Sinhala/Tamil, images, admin-created orders, WebSocket push. It does not reject a service worker, `vite-plugin-pwa`, or a local cart cache. AD-4/AD-5 describe a server cart but do not forbid a second client store “for offline.”

**Fix:** Deferred or AD-6 Prevents: no PWA / service worker / local cart in v1.

### G4 — Post-login landing (UX vs PRD §11) unbound

EXPERIENCE: Add-to-cart gate returns to **the same pack**, not auto-added; Cart / Orders / Account gate and session timeout land on **packs**; cart remains on the server. Marked **SCOPE DELTA vs PRD §11** (“return to cart intact” as a *landing*).

Architecture sources include the PRD and UX. AD-5 does not mention resume. Client router is Deferred. Identity-slice vs cart-slice builders can pick PRD landing or EXPERIENCE landing and both still satisfy every AD.

**Fix:** one line under AD-5 or conventions: “Post-login destinations follow EXPERIENCE (not PRD §11 as a landing).” Do not copy the event table.

## Not gaps (checked, left in UX)

- **IA table** (Browse / Cart / Orders / Account, pack screen, checkout, privacy note, admin Schools/Grades/Book master/Packs/Items). Architecture should not duplicate screens. Only the admin-home *name* in the capability map is wrong (C1). Default landings are UX once G4 is fixed.
- **Dark mode as peer, not inversion.** AD-6 already requires DESIGN.md light and dark variables; generating dark by invert would violate that contract.
- **No webfont / system stack.** DESIGN.md Typography; AD-6 already points at DESIGN.md. No extra AD unless Vite is free to add Google Fonts against DESIGN.md — treat as DESIGN.md compliance, not a missing invariant.
- **Responsive desktop-first, 760px / ~900px, tab bar vs sidebar.** DESIGN.md Layout & Spacing + EXPERIENCE Responsive. Not an architecture cut.
- **Mustard fill-only, four-channel status, call-state chips, 120ms press.** DESIGN.md. Token/component contract, not ADs.
- **Quantity 1–20, locked last title, checkout staleness inline.** EXPERIENCE + PRD; AD-7 already says PRD rules are enforced in the owning module.
- **Delivery note + cancellation note only (no vendor notepad).** Product rule; AD-3 “notes” is loose but not a second notepad owner. Optional tighten: orders notes = those two writings only — not required for this reconcile if epics read EXPERIENCE “Notes on an order.”
- **English microcopy content.** Convention already forbids other languages; strings stay in EXPERIENCE.

## Suggested spine edits (do not apply in this review)

1. Capability map: “Today list” → “Admin Orders, all orders (open + past).”
2. Capability map: remove v1 “parent password reset.”
3. Visual convention: EXPERIENCE wins on behaviour vs DESIGN.md.
4. AD-6: AA floor on both apps; Prevents PWA / named kit already; add no service worker if G3 is accepted.
5. AD-5 or conventions: login resume per EXPERIENCE.
6. Out of band: patch EXPERIENCE/DESIGN “custom HTML / static public/” so they match AD-6 React — otherwise C3 remains a source conflict no AD can paper over.

## Compact findings (for the gate)

1. **Conflict — C1:** Capability map “Today list” contradicts EXPERIENCE all-orders admin home (FR58).
2. **Conflict — C2:** Capability map lists parent password reset; EXPERIENCE parks it for v2.
3. **Conflict — C3:** EXPERIENCE still specifies custom HTML + static `public/`; AD-6 binds React + Vite and prevents vanilla HTML.
4. **Gap — G1:** AD-6 names DESIGN.md only; a builder will implement DESIGN.md empty-state CTAs and worded cold-start, which EXPERIENCE supersedes.
5. **Gap — G2/G3:** AA is mapped but not in AD-6’s Rule; not-a-PWA / no offline client is silent.
