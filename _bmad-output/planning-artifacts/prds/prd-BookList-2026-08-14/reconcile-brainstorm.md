---
title: "Input reconciliation — brainstorm memlog vs PRD + addendum"
input: _bmad-output/brainstorming/brainstorm-book-list-school-packs-2026-08-13/.memlog.md
targets:
  - prd.md
  - addendum.md
created: 2026-08-14
---

# Reconciliation: brainstorm memlog → PRD

## Scope of this pass

The brainstorm (75 locked entries, status `complete`, includes a locked MoSCoW board) was distilled into a product-brief addendum, and the PRD was authored from that distillation rather than from the brainstorm itself. This pass reads the brainstorm directly and reports **dropped, contradicted, or drifted content only**. It is not a quality review of the PRD.

The folder contains exactly one file (`.memlog.md`); there are no supporting artefacts to reconcile.

Coverage summary: of the 75 entries, roughly 55 are carried faithfully (pack pre-tick and locked-last-title rules, qty 1–20 cap, clone-not-merge cart lines, goods-total-from-ticked-only, no-delivery-fee-in-app, archive-not-delete plus order snapshots, single admin, email+password auth with WhatsApp as contact only, rich animated UI both sides, and every MoSCoW "Won't" item). The findings below are the residue.

---

## 1. Locked rules, decisions and MoSCoW Must/Should items absent from both targets

### 1.1 The entire logo / brand-identity thread — including a locked user decision

Three consecutive entries establish that the app has no logo and needs one, and the user then locks the icon:

> - (direction by user) Vendor commissioned the project; user is building it with the coach. Website currently has no logo; needs a better logo defined
> - (idea by coach) Logo: a closed book with one corner folded into a checklist tick — pack completeness you can un-tick. Wordmark Book List in a sturdy rounded sans. Colors: deep navy + school-bag mustard, not generic blue-tech
> - (decision by user) App name is Book List; icon is a pile of books (not the tick-on-book mark)

And the MoSCoW board carries it forward as a Could:

> - (idea by coach) MoSCoW board proposed: ... Could = illustrated pile-of-books mark; ...

**Status in targets:** nothing. The words logo, icon, mark, wordmark, navy, mustard, palette, typography and brand appear nowhere in `prd.md` or `addendum.md`. The addendum's "UX material (UX spec input)" section covers layout and interaction but carries no visual-identity input at all.

**Why it matters:** "icon is a pile of books" is a `(decision by user)`, i.e. locked at the same authority level as the qty-20 cap. It is not in scope, not in `§10 Out of Scope`, and not in the addendum's UX hand-off — so no downstream document will pick it up. The colour palette and wordmark direction were coach ideas attached to a mark the user then rejected, so their status is genuinely ambiguous and should be re-asked rather than assumed dead; the *need for a defined logo* is not ambiguous.

### 1.2 The "Could" tier no longer exists anywhere

The locked board has four tiers. The PRD has two: in scope (`§4`–`§9`) and out of scope (`§10`). The Could tier — the pile-of-books mark — has no home. There is no "nice to have if time allows" section in the PRD, so a deliberately-tiered decision has been silently collapsed into a binary.

### 1.3 Bonto free-tier capacity figures

> - (direction by user) Deploy target is Bonto (bonto.dev) free tier: Node.js/static, 50h/month, auto-sleep, 0.5 CPU + 512MB base

**Status in targets:** `prd.md §8` says only "v1 runs on the Bonto free tier." The addendum names the tier and `*.bonto.run`. **Every number is gone**: 50h/month, auto-sleep, 0.5 CPU, 512MB.

**Why it matters:** these are the binding constraints the whole architecture was reasoned against, and the brainstorm reasons against them explicitly:

> - (insight by coach) A starter dissolves setup/deploy friction, not Bonto runtime limits; a fat starter (Next+Postgres) worsens 512MB/sleep; Book List cannot be a static site so Node mode is required

Auto-sleep in particular has a user-visible consequence (first-hit cold start on a mobile-first storefront) that neither target states, and 50h/month is a hard ceiling that interacts with `§8`'s seasonal-burst discussion — the PRD discusses the burst without ever noting the monthly hour cap it must fit inside.

### 1.4 The explicit non-requirement for academic-year versioning

> - (decision by user) Admin has full access: add, keep, or remove packs (and lists) at will. New year is a new pack; old pack can be removed. No separate academic-year versioning required

**Status in targets:** `FR17` carries "A new school year means a new pack." The *negative* half — "No separate academic-year versioning required" — is stated nowhere, and is not listed in `§10`. It is the kind of omitted non-requirement an architect re-invents as a `year` column and a versioning story.

### 1.5 "Phone becomes backup not the pipeline" — with no backup mechanism specified

> - (insight by user) Previously phone-based; the web app makes that work easy so the vendor can take and fulfill all orders on time — not a forensic leak-hunt
> - (idea by coach) Success = every order captured in the list and worked on time; phone becomes backup not the pipeline

**Status in targets:** the PRD keeps the confirmation call (`§1`, `FR57`) but has no path for an order that arrives by phone. `FR62` locks placed orders and there is no admin-creates-order-on-behalf-of-parent capability, nor is one listed in `§10`. If the phone is still the backup channel, every phone order must be either refused or typed into the parent's own account by the parent. The brainstorm asserts the backup exists; the PRD neither provides it nor rules it out.

### 1.6 Named cart-line label for cloned lines

> - (idea by coach) Each Add to cart clones a new cart line (Pack x of Grade 1) with its own ticks, never merging into quantity-on-the-same-selection

The clone-never-merge rule survives well (`FR37`, addendum data-model note). The **line-labelling convention** — a per-add ordinal so the parent can tell two adds of the same pack apart ("Pack 2 of Grade 1") — is dropped. Without it, `FR37`'s two independent lines are visually indistinguishable in the cart, which undercuts the second-child flow it exists to serve.

### 1.7 Thin-starter specifics and the rejected fat starter

> - (idea by coach) Treat a thin Bonto Node starter (Express + SQLite + public HTML) as the asset; skip heavy fullstack starters

The addendum says "One Node process plus SQLite. Thin starter, no service split." **Express**, **static `public/` HTML**, and the explicit rejection of **Next + Postgres** are not carried. The addendum has a "Rejected alternatives" section; the fat-fullstack-starter rejection belongs in it and is missing.

---

## 2. Contradictions between brainstorm and PRD

### 2.1 The individual-books page has been replaced by a stationery-only catalog — reversing a locked decision

Four brainstorm entries, one of them a `(decision by user)` and one of them inside the MoSCoW Must list:

> - (decision by user) Not pack-only. Separate catalog page for individual books, also added by admin; customers can buy loose titles there
> - (idea by coach) Same book master list feeds packs and the individual shop page; one cart can mix pack lines and loose-book lines
> - (idea by coach) Loose titles use the same qty 1–20 cap and the same delivery-to-be-confirmed note at checkout
> - (decision by user) First live URL includes the full Keep list: signup/login, packs with ticks and qty 1-20, individual books page, mixed cart, place order, admin catalog and order statuses

The PRD says the opposite:

- `FR19` — "The admin maintains a separate **individual items** catalog for **stationery and similar shop stock**."
- `FR20` — "Individual items are wholly separate from the book master. They are never part of a pack, and **books are never sold as individual items**."

**This is the single most consequential divergence in the pass.** The brainstorm's customer-facing capability was *buy a loose book without buying the pack*. The PRD removes that capability entirely and repurposes the page for stationery.

The addendum does record a reversal, but only the data-model half of it:

> - **Loose titles sold from the book master.** Replaced during the brief session by a wholly separate individual-items catalog. Books sell inside packs only.

So the change is traceable, and it was made deliberately in a later session. Two things still need a decision:

1. The reversal is recorded as rejecting an *implementation* ("sold from the book master") but its effect is to delete a *user capability* the user locked and then re-affirmed in the Keep list. A parent who needs one replacement title mid-year now has no route to it.
2. `FR20`'s "books are never sold as individual items" is stated as a settled requirement with no note that it overturns a prior locked decision, so a reader of the PRD alone cannot tell that this was contested.

### 2.2 Cart lines hold a price snapshot (brainstorm) vs. cart lines track live prices (PRD)

> - (idea by coach) Each cart line is its own pack snapshot (selected books + prices), so two packs do not merge or overwrite each other

The brainstorm places the snapshot — **including prices** — at the moment of *add to cart*. The PRD moves it to the moment of *place order*, and then adds machinery that only makes sense if cart lines are live:

- `§6` — "**Placing an order snapshots everything**."
- `FR46` — "If any pack or item in the cart has been archived, or has had its price changed, since it was added, checkout flags the affected lines and the parent must acknowledge the change before placing."
- addendum — "**Stale-cart detection** requires comparing a cart line against current catalog state at checkout."

Both designs are defensible and the PRD's is arguably safer, but they are not the same design and the PRD does not acknowledge the change. Under the brainstorm rule there is no stale-price case to detect; under the PRD rule the parent can be re-priced between add and checkout. Worth confirming which one is intended, because `FR46` is a whole checkout screen state that exists only in the PRD's reading.

### 2.3 "Today's orders" redefined as "all open orders"

> - (idea by coach) Admin home is Today's orders (new/in progress), not the catalog — catalog is how orders get in; the job is not losing them once they exist

`FR52` deliberately inverts the date framing: "lists every order that has not reached Delivered or Cancelled, **regardless of when it was placed**. An order placed three days ago and still in Processing appears here."

This is very likely a correct correction — a literal "today" view would hide exactly the stranded orders the product exists to catch, and `G1`/`M2` depend on it. Logging it as a contradiction only because the brainstorm's named screen ("Today's orders") no longer exists under that name or that definition, and the rename is undocumented. The "not the catalog" half is carried faithfully in the addendum.

---

## 3. MoSCoW classification drift

The locked board:

> - (idea by coach) MoSCoW board proposed: Must = full Keep list plus locked pack/cart/auth rules; Should = admin Today's orders + archive hide + rich UI both sides; Could = illustrated pile-of-books mark; Won't = password reset email, covers, search, domain at launch, delivery calc, stock, extra admins
> - (decision by user) MoSCoW board locked as proposed — Must/Should/Could/Won't stand for the first Bonto build

| Brainstorm tier | Item | PRD treatment | Drift |
|---|---|---|---|
| Must | individual books page | removed as a book-selling surface (`FR20`) | **Must → dropped** (see 2.1) |
| Should | admin Today's orders | `FR52`–`FR55`, four mandatory FRs | Should → Must |
| Should | archive = hide | `FR18`, mandatory, plus `FR21` extends archiving to books and items | Should → Must, and scope widened |
| Should | rich UI both sides | `NFR2`, `NFR3`, mandatory | Should → Must |
| Could | pile-of-books mark | absent entirely | **Could → nowhere** |
| Won't | all seven items | `§10` carries all of them | faithful |

**The pattern:** the PRD has flattened a four-tier board into a single flat scope. Everything the vendor put in Should is now indistinguishable from everything in Must, and the `§31` delivery bar hardens this — "v1 is handed over as the complete scope described in this document, live and usable — not a pilot slice." That sentence converts the vendor's own Should tier into a launch blocker.

This matters because the board was the vendor's **de-scoping instruction for a 50h/month free-tier build**. If the build runs long, the PRD as written offers no sanctioned cut line, even though the brainstorm supplies one. Recommend either restoring the tiering as a priority annotation on the affected FRs/NFRs, or recording explicitly that the vendor has since promoted Should to Must.

Also note the one downward drift: `§10` lists "custom domain at launch" as out of scope, which matches the board's Won't and matches the user's final position:

> - (decision by user) Custom domain is NOT a launch blocker. Ship on Bonto free tier first; upgrade to Glitch plan when vendor asks for production

This is correct and supersedes the earlier reversed entry ("Custom domain is a launch blocker, not a later upgrade"). No action; recorded so the reversal is not re-litigated downstream.

---

## 4. Numbers, limits, field names and named behaviours lost or changed

**Lost outright:**

| Brainstorm value | Verbatim source | Target status |
|---|---|---|
| 50h/month, auto-sleep, 0.5 CPU, 512MB | "Bonto (bonto.dev) free tier: Node.js/static, 50h/month, auto-sleep, 0.5 CPU + 512MB base" | absent |
| Pack final price as an admin-set field | see 4.1 below | absent from `FR16` |
| `Pack x of Grade 1` line label | "clones a new cart line (Pack x of Grade 1)" | absent |
| Express, `public/` HTML | "thin Bonto Node starter (Express + SQLite + public HTML)" | absent |
| `booklist.bonto.run` | "Ship first on booklist.bonto.run free" | generalised to `*.bonto.run` |
| Glitch plan = 1 custom domain + 1 always-on app | "Bonto has an /mo plan named Glitch with 1 custom domain + 1 always-on app" | qualitative only ("custom domain and always-on hosting") |

**4.1 The admin-set pack final price**

> - (decision by user) Admin sets each book price, then sets the pack's final price from those books

`FR16` defines a pack as "a school, a grade, a short description of what the pack is for, and a set of books chosen from the book master." **There is no pack price field.** The concept survives only obliquely in `§6`: "A pack's headline price, where shown, is an all-titles-selected preview."

Two problems. First, "where shown" is undefined — no FR requires it to be shown, so the storefront may legitimately never display a pack price. Second, the brainstorm has the admin performing an *action* (setting the pack's final price, derived from its books); the PRD has only a computed preview with no admin step. If it is purely derived, `FR16` should say the pack price is computed and not stored, because the brainstorm's wording implies a stored, admin-confirmed figure — and the clarifying entry stops short of settling it:

> - (insight by coach) Admin pack final price is the all-selected preview (sum of every book in the pack), not a discount that survives unchecking

**Carried faithfully** (recorded so they are not re-checked): qty cap 20 and the visible "max 20" (`FR29`, `FR30`); qty starts at 1 (`FR29`); minus-at-1-unticks-except-last (`FR31`); locked last checkbox (`FR28`); signup fields name / address / WhatsApp required, second phone optional, email login (`FR1`, `FR2`); qty 1–20 applied to individual items too (`FR34`).

**Microcopy that survived in substance but not in wording:** the brainstorm specifies a literal fixed checkout line —

> - (idea by coach) Place-order screen: books total is the payable-for-books figure; a fixed line Delivery charge: to be confirmed by the shop so the parent is not surprised later

`FR42` requires "an explicit notice that a delivery charge will be confirmed by the shop." Equivalent in force; the exact label is gone. Low risk, but the addendum's UX section is the right home for it and does not have it.

---

## 5. Qualitative and UX intent the FR structure dropped

**5.1 "Don't silently re-check a title" — the anti-silence principle**

> - (idea by coach) If they uncheck the last book, disable Add to cart and show pick at least one book — don't silently re-check a title

The specific mechanic here was superseded by the pre-select-all/locked-last-title decision, so the mechanic is correctly gone. What should have outlived it is the stated principle: **never silently undo or refuse a parent's action, always explain**. It survives in two places (`FR30`'s visible cap, the addendum's "visible explanation rather than silent refusal") but is never stated as a general UX rule, so nothing governs the cases the FRs do not enumerate.

**5.2 The rationale for a rich admin UI is gone, leaving only the fact**

> - (decision by user) Admin gets the same rich animated interface as the shop — no plain/calm admin split
> - (insight) ... rich admin UI so the vendor stays in the list instead of going back to the phone ...

`NFR2` keeps the requirement and justifies it as parity — "the vendor gets the same quality of interface as the parent." The actual reason is **retention**: an unpleasant admin screen sends the vendor back to the phone, which is `CM1`. As written, `NFR2` reads as a fairness nicety and is therefore the first thing a time-pressed build will trim; with the real rationale attached it is load-bearing.

**5.3 "Not a forensic leak-hunt"**

> - (insight by user) Previously phone-based; the web app makes that work easy so the vendor can take and fulfill all orders on time — not a forensic leak-hunt

This is an explicit anti-goal: the vendor does not want measurement and diagnosis of lost orders, he wants the orders in a list. The PRD honours it in practice (`§3` "v1 collects no telemetry") but never states it as intent. `§3` then carries four counter-metrics and `Q5` asks about staleness flagging — which is the leak-hunt instinct reappearing. Worth stating the anti-goal in `§3` so it stays suppressed.

**5.4 "An order trap, not a bookstore"**

> - (insight) ... Through-lines: app is an order trap not a bookstore; archive+price snapshots survive next year's lists; WhatsApp is reach email is identity; clone cart lines are the second-child order the phone used to miss; ...

Four of five through-lines are carried (snapshots in `§6`; WhatsApp-vs-email in `FR2`; second-child in `FR37`; staging-then-production in the addendum). The framing phrase itself — **order trap, not a bookstore** — is the one-line statement of what the product is, and the PRD's `§1`, while consistent with it, never lands it. It is the sentence that would keep a downstream reader from adding bookstore features.

**5.5 Per-row line totals on the pack screen**

> - (decision by user) Each ticked title starts at quantity 1. Customer can add more copies of a title; line total and pack total increase (qty x unit price)

The PRD requires a running goods total (`FR41`) and a continuously recalculating pack screen (`NFR5`), but never requires the **per-title line total** the brainstorm names alongside the pack total. Small, and squarely UX-spec territory, but it is a named display element that is currently unrequired.

---

## Recommended actions, in order of value

1. **Resolve the individual-books question (2.1).** Confirm whether parents can buy a loose book at all in v1. If not, add a line to `§10` and to the addendum's rejected alternatives noting that this overturns a locked brainstorm decision.
2. **Reinstate the logo/icon thread (1.1).** At minimum, put "icon is a pile of books" and the outstanding logo need into the addendum's UX section; re-ask about the navy/mustard palette, whose status is genuinely unclear.
3. **Restore the Bonto figures (1.3)** to the addendum's technical constraints — 50h/month, auto-sleep, 0.5 CPU, 512MB — and note the cold-start consequence against `NFR1`.
4. **Settle the pack price field (4.1).** Either give `FR16` a pack-price field with an admin step, or state in `§6` that it is computed, never stored, and where it is shown.
5. **Decide cart-line snapshot vs live pricing (2.2).** `FR46` and the addendum's stale-cart note stand or fall on this.
6. **Reinstate the MoSCoW tiering (§3 above)** as priority annotations, or record that Should has been deliberately promoted to Must — and give the Could item a home.
7. **Add the missing intent statements (5.1, 5.2, 5.3, 5.4)** — one sentence each, in `§1`, `§3` and `NFR2`.
8. **Clarify the phone-order backup path (1.5)** and add the "no academic-year versioning" non-requirement (1.4) to `§10`.
