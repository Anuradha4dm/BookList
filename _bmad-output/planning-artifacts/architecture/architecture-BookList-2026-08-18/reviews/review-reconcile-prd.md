---
title: Reconcile PRD/addendum against architecture spine
lens: reconcile-prd
target: ARCHITECTURE-SPINE.md
inputs:
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/prd.md
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/addendum.md
status: complete
created: 2026-08-18
verdict: conflict
---

# Review: reconcile PRD / addendum → spine

Spine is a build-substrate. This pass asks only: which **load-bearing** PRD/addendum calls did not land as an enforceable Rule, Convention, or explicit Deferred/rejected line — especially quiet tone, constraints, data rules, NFRs, lifecycle, and durability — and where the spine **contradicts** those inputs. Functional screens and copy that a single module can implement from the PRD are not findings. Items the spine already names under Deferred, matching PRD §13 Won’t, are ignored.

**Verdict: conflict.** Two spine ADs override load-bearing inputs. Several lifecycle and catalog invariants are cited (`Binds: T1–T11`, `FR16–FR18`) but not restated in the Rule, so a builder who follows the spine without re-reading the PRD will miss them.

---

## Conflicts (spine vs PRD / addendum)

### C1. Production host: PRD §9 vs AD-2

PRD §9 states v1 **runs on** the Bonto free tier and that **50 hours / auto-sleep / 0.5 CPU / 512MB are binding numbers**, not background. Auto-sleep is called out as a **user-visible** cost on a mobile-first storefront. The paid upgrade is due **before the buying season**, as a planned move, not as identity of the app — but v1 itself is the free-tier box.

Addendum: first live URL `booklist.bonto.run` is staging **the vendor uses for real work**; later production is Glitch (always-on, one custom domain).

AD-2 **Rule:** build and test on Bonto free; **go-live is Bonto Glitch**; free-tier sleep and the hour cap are **pre-production only**. **Prevents:** baking Bonto sleep or hour caps into app identity.

This is not a silent omission. It is a different operating envelope than the PRD. Consequences:

- A builder will not treat 50h / 512MB / cold-start as v1 production constraints.
- The PRD’s “architecture was reasoned against them” claim is inverted: AD-2 forbids reasoning the app against those numbers.
- Addendum “vendor uses free URL for real work” and AD-2 “pre-production only” disagree on whether real orders may live on a sleeping instance.

**Not excused by Deferred.** Custom domain is Won’t in PRD §13; Glitch-as-go-live pulls always-on (and the bundled domain) into the v1 production story. That may be the right call; it is still a contradiction with PRD §9 as written.

### C2. Thin starter: addendum vs AD-6

Addendum technical constraint (and a logged inherit constraint): **one Node process + SQLite + static `public/` HTML**. Fat fullstack (Next + Postgres) rejected because it worsens 512MB and auto-sleep.

AD-6 **Rule:** two Vite **React** apps + `client/ui`; **Prevents:** vanilla HTML sprawl and Next.js.

PRD NFR2–NFR3 (rich motion, no full-page reloads) make React defensible. The addendum’s named starter is still contradicted. Two independently-started clients could not have inferred React from the addendum; they would have inferred static HTML. The spine must treat this as an explicit override of a load-bearing input, not as silent inheritance.

---

## Gaps — quiet requirements the AD structure dropped

Grouped by the kind of miss. Each would let two units one level down choose incompatibly, or would let a builder “comply” with the spine while violating the PRD.

### G1. Lifecycle: T1–T11 cited, freeze/floor/skip not in the Rule (high)

AD-9 **Binds** `T1–T11` and FR51–FR52. The **Rule** only states: Place Order is one transaction (snapshot, sequential number, empty cart) and idempotent; numbers don’t collide; transitions check expected current status (T7); parent-cancel vs admin-confirm first-commit-wins (T8); no outbound messaging.

Dropped from any Rule (PRD §6 + accepted consequence):

| ID | Rule that did not land |
| --- | --- |
| **T2** | No status beyond Order Confirmed without passing through it. Delivery price and payable total are set here. A Delivered order with no payable total is unreachable. |
| **T3** | Forward skips among Processing → On Delivery Partner are allowed. |
| **T4** | Backward movement among non-terminal statuses **floors at Order Confirmed**. Never return to Order Is Placed. |
| **T5 / T9** | Delivered and Cancelled are final. **Order Confirmed is a freeze:** lines, prices, delivery charge, address, contacts do not change. |
| **T10** | No separate paid status; COD is implied by Delivered. |
| **FR61–FR62** | Confirm and delivery price are one action; payable total is written then, not at checkout. |
| **FR66** | Admin cannot edit placed-order contents. |
| **FR72** | Parent cancel only while status is Order Is Placed. |
| Consequence | Mistyped delivery charge is recovered by cancel + re-place (burns the spoken number). Soft freeze was **rejected** (addendum). |

Citing `T1–T11` in Binds is not an enforceable Rule. Two `orders` implementations can require linear status walks, allow return to Placed, allow delivery-price edits after confirm, or add a Paid status, and still match AD-9’s Rule text.

### G2. Catalog and cart data rules (high)

AD-4 lands the loud ones: shared book master, computed pack price, clone-vs-merge cart lines, total snapshot, archive/price edits don’t touch placed orders.

Not in AD-4, Conventions, or Deferred:

| Source | Dropped rule | Divergence it prevents |
| --- | --- | --- |
| **FR49** + addendum | Stale-cart detection is **book-level** (price drift on a shared book), not pack-level. Unavailable lines must be removed; repriced lines need explicit acknowledgement. **Nothing is silently substituted or silently repriced.** | Pack-only dirty check misses the common case (FR16). |
| **FR31–FR32**, NFR11 | All titles pre-ticked; last remaining title’s checkbox **and** minus at qty 1 are locked; qty **1–20**; plus disabled at 20. Enforced in the owning module, not only the UI. | Empty pack, qty 21, or “unlock last title in the API.” |
| **FR13–FR14** + addendum | Schools and grades are **admin-typed enumerations**, not a hardcoded 1–13 list and not free text on the pack. Rename + archive; **no hard-delete while in use.** Grade options scoped to the selected school’s live packs (FR29). | Enum table vs hard-coded years; `DELETE` vs archive. |
| **FR22–FR23**, §13 | Individual items are never part of a pack. Books are sold **inside packs only**. **No loose-books catalog** — reversed earlier decision; must not be silently reinstated. | A `/books` storefront or packing books into the items table. |
| **FR42** | Changing which titles are ticked in a cart pack line is **not** in-place edit; remove the line and add the pack again. | Two tick-editors vs immutable clone lines. |
| **FR7** + addendum | Account address is the checkout address. **No per-order override, no address book.** | Checkout address field that bypasses the snapshot story. |
| **FR41** | A valid cart may be packs only, items only, or mixed. Pack is not required. | Checkout that requires a pack. |
| **FR19** | New year = new pack; no academic-year versioning. | *(Partially covered: Deferred lists academic-year versioning.)* |

FR23 / no loose-books is one of three PRD §13 exclusions that “should not be silently reinstated.” It is **not** in Deferred or in the rejected list (the rejected list names tRPC/ORM/Next/Postgres only). Same for **no staleness flagging on aged orders** (grouping by status is enough; leak-hunt is a non-goal).

### G3. Checkout money and “the call” (medium)

| Source | Dropped rule |
| --- | --- |
| **FR45–FR46**, §7 | Checkout shows goods total only. **No delivery figure is calculated, estimated, or collected.** The parent-facing line is a fixed contract, not decoration. |
| **§7** | Payable total exists only after Order Confirmed (goods + admin delivery price). |
| **FR2**, addendum | Login is **email + password only**. WhatsApp number is contact data, not an identity. WhatsApp-as-login was **rejected**. |
| **FR3 / AD-5** | Browse catalog may be anonymous — landed. Fine. |
| **§8** | Email is **not verified** in v1 and is the sole login identity. |
| **§8** | Store only what the flow needs: name, address, WhatsApp, optional second phone, email. No extra PII. |
| **§10 NFR / §4** | **v1 collects no telemetry**, deliberately. Metrics are observable from the app or vendor behaviour. |

AD-5 does not say email/password is the only scheme. A second identity (WhatsApp OTP, magic link) would still satisfy “one httpOnly session cookie.”

### G4. Durability, recovery, ops tone (medium)

Landed: export zip (AD-10), recovery code hashed + printed once to the log (AD-11), no outbound messaging (AD-9), SQLite on persistent disk (AD-8), sessions in SQLite (AD-5).

Dropped or under-specified:

| Source | Issue |
| --- | --- |
| **FR74** | Recovery code is **shown once for the vendor to keep outside the application**, then entered to set a new password. Spine never renders it in React and prints it to **server stdout**. That can be right on Bonto’s dashboard — only if the vendor (or deployer) is guaranteed to capture it at first boot. The PRD’s durability story is “forgotten admin password must not require a redeploy”; it does not say “read the PaaS log.” Gap: who obtains the code when Daanlk deploys and Gothami operates. |
| **FR67 / §8** | Export exists so a redeploy / recycle / lost instance cannot take the season. AD-10 format is decided; **when** the vendor is expected to take a copy (any time, and as the recovery path) is PRD durability tone, not restated. |
| **T11 / §9** | No new-order alert; vendor checks daily; a day not checked is a day of orders not worked — **accepted for v1**. Deferred “live push” covers parent status polling, not this operating assumption. Fine if left as product, but it is a quiet ops constraint. |
| **NFR10** | Order data survives restarts **and** the export is recovery **beyond** hosting guarantees. AD-8+AD-10 together cover this if read as a pair; the spine never says the SQLite file is insufficient by itself (host loss). AD-10’s Prevents (“CSV-only / db-only”) is the closest. |

### G5. NFRs and tone the AD list flattened (medium)

| Source | What the spine does | What’s missing |
| --- | --- | --- |
| **NFR1** | Not mentioned. | Storefront is **mobile-first**. Parents order on phones. Double-submit (AD-9) assumes this; layout/touch targets do not. |
| **NFR2** + addendum | AD-6 binds NFR2–NFR3 and two apps + shared `client/ui`. | **Admin polish is load-bearing**, not a fairness nicety. Unpleasant admin → vendor returns to the phone → **CM1**. “No plain-admin split” is UX material. Two apps could still ship a sparse admin if the Rule is only “React + tokens.” |
| **NFR4** | Convention: no silent refusal; AD-7 error envelope. | Locked last title and qty cap must **explain why**, not only return `error.code`. |
| **NFR5–NFR7** | Unbound. | Today list cheap enough for many daily opens; pack screen stays live with a long title list; **motion never delays** vendor work or checkout. |
| **NFR11** | AD-7: all PRD rules enforced in the owning module. | Meta-rule without the actual caps/locks/transitions in G1–G2. It does not substitute for writing those rules. |
| **§11** | Error envelope + server cart (session expiry → cart intact) is implied by AD-4/AD-5. | Defined empty states (no packs, empty cart, no open orders, empty catalog on first run) and named failure cases (stale transition, lost session mid-checkout, duplicate submit) are a PRD-stated consistency contract. Empty states can live in UX; **stale-transition and duplicate-submit messages** are API + AD-7 and are only half-landed (shape, not the cases). |
| **§12 Should** | Capability map mentions today list. | Grouped-and-counted today list and archive-as-hide are v1 Should, sanctioned trim only if the build runs long. Spine doesn’t bind grouping/counts; a flat list would still “live in orders.” Product cut-line, not a hard architecture miss — note only. |

### G6. Exclusions that can be silently reinstated (medium)

PRD §13 + addendum rejected list vs spine Deferred/rejected:

| Exclusion | Spine |
| --- | --- |
| Payment gateway, image uploads, academic-year versioning, admin-created orders | Deferred — **correct** |
| Custom domain beyond Glitch’s one | Deferred — but see **C1** (Glitch go-live bundles a domain) |
| Sinhala/Tamil | Deferred — PRD does not require i18n; Convention says English microcopy |
| tRPC, ORM, Next, Postgres | Rejected — **correct** |
| **No loose-books catalog** | **Missing** from Deferred/rejected |
| **No staleness flagging on aged orders** | **Missing** |
| **No free-text / smart search (FR30)** | **Missing** |
| **No in-app delivery-fee calculation** | **Missing** (would also contradict FR46) |
| **No stock/inventory** | **Missing** |
| **No extra admin accounts / staff roles** | Implied by “the one admin,” not explicit |
| **No delivery-partner login** | Implied by T1 citation, not in Deferred |
| **No password-reset email** | Implied by no outbound messaging |
| **No telemetry / leak-hunt metrics** | **Missing** |
| **No per-order address / address book** | **Missing** (G2) |

---

## Landed correctly (not findings)

For the audit trail: these PRD/addendum calls **did** survive distillation.

- Modular monolith, one Node process, four write-owning modules, two client doors (AD-1, AD-3).
- Shared book master, computed pack price, clone pack lines / merge item lines, total order snapshot including address and contacts (AD-4).
- Cart server-persisted on the account (AD-3/AD-4).
- Anonymous browse; cart/checkout/orders/admin require a session (AD-5).
- Place Order atomic + idempotent; sequential spoken order numbers; T7/T8 race (AD-9).
- Zero outbound messaging; no worker/queue/mailer (AD-9).
- Export as vendor-owned durability (AD-10).
- Admin seeded from env; single-use recovery code; scrypt; no secrets in git (AD-11).
- NFR8–NFR9 authz convention; NFR4 named on the error row; NFR11 named on AD-7.
- Single currency, no tax (Money convention).
- COD / payment gateway out of v1 (Deferred).
- Image uploads, academic-year versioning, admin-created orders out (Deferred).

---

## Correctly ignored (not gaps)

- Goals G1–G4, journeys UJ-1/UJ-2, success metrics M1–M5 / CM1–CM4 — product intent; they constrain quality of the today list and pipeline, not a second AD, except where they become T-rules (G1) or CM1/admin polish (G5).
- Brand Q1 (navy/mustard), pile-of-books icon, Could-tier illustrated mark — UX / DESIGN.md. Spine points visual at DESIGN.md. Out of this lens except that PRD Q1 remains unsettled while the spine already binds Chalk & Brass via UX (not a PRD contradiction).
- Market research (Kapruka, Sarasavi, PayHere, WhatsApp penetration) — context, not invariants.
- MoSCoW Could (illustrated mark) and handover “complete scope” — delivery bar, not module cut.
- FR56–FR57 marked `[Should]` — sanctioned trim; not required as an AD.
- Literal checkout microcopy and cart “Pack 2 of Grade 1” labels — UX, as long as FR40/FR45 remain in the UX spec.
- Integer rupees / no decimals — architecture fill; PRD only requires one currency and no tax. Not a conflict.

---

## What to do (for Finalize, not this reviewer)

Spine must not be edited by this pass. Suggested parent actions:

1. **Resolve C1 in the open:** either amend PRD §9 / addendum (free = test; Glitch = v1 production; vendor real-work URL is Glitch) or put the free-tier envelope back into AD-2 as the v1 production box with Glitch as a planned pre-season move.
2. **Resolve C2 in the open:** note in the spine (or memlog→distill) that the addendum static-HTML starter is **superseded** by AD-6 because of NFR2–NFR3 — so inheritance is explicit, not a silent drop.
3. **Put T2, T3, T4, T9, T10 (and FR61 freeze-at-confirm) into AD-9’s Rule**, not only Binds. That is the largest AD-structure drop.
4. **Extend AD-4** with book-level FR49, FR31–FR32 caps/lock, FR13–FR14 enum+no-hard-delete-in-use, FR22–FR23 no loose-books, FR7 no address override, FR42 no in-cart tick edit.
5. **Add to Deferred or rejected:** no search, no aged-order staleness flags, no inventory, no telemetry, no delivery-fee engine, no partner login, no extra admin roles — matching PRD §13 so they cannot be reinstated from a spine-only read.

---

## Compact findings (for gate rollup)

1. **Conflict — AD-2 vs PRD §9:** spine makes Bonto free pre-production and Glitch go-live; PRD binds v1 to free-tier hours/sleep/RAM and treats paid upgrade as a pre-season move, not as v1 identity.
2. **Conflict — AD-6 vs addendum starter:** React+Vite vs Express + static `public/` HTML (Next+Postgres stays rejected on both sides).
3. **Gap — AD-9:** `Binds: T1–T11` but Rule omits freeze (T9), floor at Confirmed (T4), must-pass-through-confirm (T2), skip-forward 3–6 (T3), no Paid status (T10), admin cannot edit lines (FR66).
4. **Gap — AD-4:** book-level stale detection (FR49), qty 1–20 + locked last title (FR31–FR32), schools/grades as archived enumerations with no in-use hard-delete (FR13–FR14), no loose-books catalog (FR23 / §13).
5. **Gap — quiet constraints:** WhatsApp is not login identity (FR2); no per-order address (FR7); no delivery estimate at checkout (FR46); no telemetry; email unverified; several §13 exclusions absent from Deferred/rejected.
