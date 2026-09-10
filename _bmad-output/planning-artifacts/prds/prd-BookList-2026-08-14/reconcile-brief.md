---
title: "Input reconciliation: brief → PRD"
status: review
created: 2026-08-14
---

# Input reconciliation pass — brief inputs vs PRD outputs

Scope of this pass: what the SOURCE documents contain that the TARGET documents failed to carry forward. This is a dropped-content audit, not a quality review.

**Sources**

- `briefs/brief-book-list-2026-08-14/brief.md` (S-BRIEF)
- `briefs/brief-book-list-2026-08-14/addendum.md` (S-ADD)
- `briefs/brief-book-list-2026-08-14/.memlog.md` (S-MEM)

**Targets**

- `prds/prd-BookList-2026-08-14/prd.md` (T-PRD)
- `prds/prd-BookList-2026-08-14/addendum.md` (T-ADD)

Known-deliberate change, excluded from findings: status renamed to **Order Is Placed** (source `Order Id Placed` was a typo).

---

## 1. Explicit rules, constraints, or scope items present in sources but nowhere in targets

### 1.1 The app's identity mark — icon is gone

S-ADD, Positioning:

> "App name: Book List. Icon: a pile of books."

The name survives. The icon does not appear in T-PRD or T-ADD in any form — not as a requirement, not as UX material, not as an out-of-scope item. This is the only branding instruction the vendor gave and it has been dropped entirely.

### 1.2 Government-school stationery packs are explicitly NOT the v1 job

S-MEM:

> "(decision) Primary market is private-school parents who must buy specific editions from a school list. Admin maintains those lists. Government-school stationery packs are not the v1 job"

T-ADD carries the *research* explaining why private schools are the segment, but neither target states the **exclusion** as a scope boundary. T-PRD §10 "Out of Scope for v1" does not mention it. A downstream reader could reasonably add a government-school stationery pack flow without violating anything written in the PRD.

### 1.3 The delivery timing constraint — "weeks not months", vendor waiting

S-MEM:

> "(decision) Coaching path chosen; brief audience is the PRD/architecture workflow (no external reader); timing is vendor-waiting, weeks not months -> right-size rigor, no market sizing"

There is no schedule, urgency, or time-box anywhere in T-PRD. §8 "Operating Constraints and Seasonality" discusses seasonality of *demand* but never that the vendor is already waiting and the build window is weeks. T-PRD §1 "Delivery bar" says "the complete scope described in this document, live and usable — not a pilot slice" — which is a *scope* bar with no time bar beside it. The source's rigor-calibration rationale ("right-size rigor") is also lost, so nothing tells a downstream agent not to gold-plate.

### 1.4 "More filter parameters later"

S-ADD, Packs and catalog:

> "Parent browse: dropdown to pick which school they are finding packs for, then dropdown to filter by grade. **More filter parameters later.** This is structured filter, not free-text smart search."

Confirmed again in S-MEM: *"Parents filter packs by school and by grade in v1; more filter params later."*

T-PRD FR24/FR25 carry the two filters and the no-free-text rule, but the deliberate "more filters are a later cycle" note is absent from FR25, from §10, and from T-ADD. The deferral was a decision, not an oversight, and it is now invisible.

### 1.5 Grades are not a 1–13 list

S-ADD:

> "Grade uses the same pattern: admin adds a grade, it becomes a dropdown option. **Not a predefined 1–13 list**, because international/private naming varies."

T-PRD FR13 keeps the *reason* ("because private and international schools name year levels differently") but drops the concrete anti-requirement. "Not 1–13" is the sentence that stops an implementer from seeding a 1–13 lookup table as a convenience.

### 1.6 Provenance and the locked prioritisation board

S-MEM:

> "Prior input: locked brainstorm memlog at _bmad-output/brainstorming/brainstorm-book-list-school-packs-2026-08-13/.memlog.md (75 entries, MoSCoW board locked)"
> "(decision) Structural: the 75 locked brainstorm functional rules go to addendum.md as PRD-ready product rules"
> "(change) MoSCoW Won't 'search' narrowed: school+grade filter is now Must because packs are unbounded."

T-ADD's provenance line reads only: *"Carried forward from the product brief, its addendum, and the PRD session."* The upstream brainstorm artifact, the count of 75 locked rules, and the existence of a locked MoSCoW board are all gone. The traceability chain now stops one hop short of where the rules actually came from, and the MoSCoW vocabulary (Must / Won't) has been replaced by an unsourced claim of ordering (see 2.2).

### 1.7 The market is never named in the PRD body

S-MEM topic line:

> "topic: Book List - school book pack e-commerce for a Sri Lankan bookshop vendor"

T-ADD's research section says "Sri Lankan" repeatedly. T-PRD itself never names Sri Lanka, and §6 says only "All amounts are handled in a single currency" without naming it. Someone reading T-PRD alone does not know the country, the currency, or the school calendar it is built around.

### 1.8 The stack constraint is not in the requirements document

S-ADD:

> "Stack constraint: one Node process + SQLite. Thin starter. Rich animated UI on both shop and admin."

This is carried in T-ADD ("Technical constraints (architecture input)") and is arguably correctly routed there. Flagged as low severity only because the source frames it as a *constraint from the vendor's side of the table*, i.e. a given rather than an architectural choice, and the PRD body contains no pointer to it.

---

## 2. Rules in the targets that contradict the sources

### 2.1 Parent self-cancellation — direct contradiction (highest severity)

S-ADD, Order status:

> "Failure terminal:
> - Cancelled — admin could not deliver, for some reason. **Admin-set, not parent self-serve.**"

T-PRD FR67:

> "**FR67.** The parent can cancel their own order while it is still **Order Is Placed**. The option disappears the moment the admin sets Order Confirmed."

The source rules out parent self-serve cancellation in the exact words "not parent self-serve". T-PRD grants it. This is not a clarification or an elaboration — it is the reversal of a locked rule, and it is not flagged as `[ASSUMPTION]`, not listed in §11 Open Questions, and not recorded in T-ADD's "Rejected alternatives" as a reconsidered decision. Note also the knock-on: S-ADD says Cancelled is the *failure* terminal for "admin could not deliver"; FR67 quietly turns Cancelled into a dual-purpose status that also means "parent changed their mind", which the pipeline semantics and the vendor's Cancelled-with-reason (FR60) were not designed for.

### 2.2 Deferral ordering is asserted as the vendor's priority but does not match the source order

S-BRIEF, Executive Summary:

> "First live is Bonto free tier. **Custom domain, payment gateway, and a ping when an order arrives** come after this customer's flow works."

S-BRIEF, Vision:

> "the same app ... can take **a custom domain, then a payment gateway** next to COD, **then a ping** instead of opening a tab."

T-PRD §10:

> "Deferred deliberately, **in the vendor's own priority order**: online payment gateway; custom domain at launch; in-app delivery-fee calculation at checkout; ..."

The source states the next-cycle sequence twice and both times it is custom domain → payment gateway → notification. T-PRD inverts the first two while explicitly claiming to be reproducing the vendor's order. Either the list must be reordered or the claim "in the vendor's own priority order" must be dropped.

### 2.3 "Today's orders" has been redefined as "every open order"

S-ADD, UI:

> "Admin home is today's orders (new / in progress), not the catalog."

S-BRIEF:

> "every order sits on the admin's **today list**" / "The admin works from **today's orders**."

T-PRD FR52:

> "The admin's home screen lists every order that has not reached Delivered or Cancelled, **regardless of when it was placed**. An order placed three days ago and still in Processing appears here."

The source's parenthetical "(new / in progress)" supports the target's reading, so this is defensible as an interpretation rather than a straight reversal — but it is a *decision*, made silently, that redefines the vendor's own term for his primary screen. It is not marked as an assumption and the vendor has not confirmed that "today's list" means "all open orders". Flagging because the phrase "today list" is the vendor's language for the artifact this whole product replaces (see 3.5), and it now appears nowhere in either target.

---

## 3. Qualitative content the FR structure silently dropped

### 3.1 "Closing a phone-taken list means more phone"

S-BRIEF, The Problem:

> "The parent should not have to call the shop to ask if the order arrived, or what it costs. **Today, closing a phone-taken list means more phone.**"

T-PRD §1 keeps the phone-as-bad-capture-tool argument but loses this closing line, which is the sentence that names the *loop* — phone creates work that can only be closed by more phone. G2 and CM2 encode the outcome; nothing encodes the reason it grates.

### 3.2 The status pipeline as an answer to silence

S-MEM:

> "(decision) Parent-visible order pipeline: ... Admin advances status. **This is the in-app confirmation that replaces silence after Place Order**"

T-PRD §5 opens with: *"The status pipeline is the mechanism that makes the daily login work."* That is the vendor-side rationale. The parent-side rationale — that the alternative to the pipeline is *silence*, and silence is what makes parents phone — is gone. The pipeline now reads as an admin workflow feature rather than as a reassurance mechanism, which risks a UX spec that treats status display as a data field instead of a message to an anxious parent.

### 3.3 The competitive contrast has been demoted out of the problem statement

S-BRIEF, The Problem:

> "Existing online options in this market do not close the gap: **fixed per-grade bundles cannot be unticked**, and **'upload a photo of the list' hands the work back to the shop to interpret**."

S-BRIEF, What Makes This Different:

> "What he needs that a fixed 'Grade 5 bundle' does not give the parent: this list is *their* school's editions, and they can take things out."

T-PRD §1 contains no competitor contrast at all. It survives only in T-ADD under "Market and domain research", rendered as neutral market facts. The consequence: the PRD never states *why the untick behaviour is the product* rather than a nice interaction. FR26–FR31 describe the mechanic in full, correct detail with zero indication that this is the differentiator the entire commission rests on. An implementer optimising for simplicity could reasonably propose a fixed pack and nothing in the FRs would object.

### 3.4 "The shop's way of closing money stays his way"

S-BRIEF, What Makes This Different:

> "The shop's way of closing money stays his way: he calls once with the final price, cash on delivery. **The app does not try to replace that call. It makes that call the only call.**"

T-PRD §1 keeps "It makes that call the only call" (good — this is the strongest surviving phrase). What is lost is the framing sentence before it: that the vendor's method of closing money is being *deliberately preserved*, not tolerated as a v1 limitation. Without it, "no payment gateway in v1" and "admin types the delivery price" read as temporary shortfalls awaiting automation, when the source frames the call as the vendor's chosen way of working. This inverts the emotional posture of the whole money section.

### 3.5 The vendor's vocabulary has been replaced with product-management vocabulary

Source terms and their target replacements:

| Source phrase (S-BRIEF / S-ADD) | Target phrase |
| --- | --- |
| "today's orders" / "today list" | "open-orders view" (FR52, M1, CM1) |
| "Admin 'pack final price'" | "a pack's headline price, where shown" (§6) |
| "Main focus is packs" | "A pack is not required" (FR38) |
| "he checks the app daily" | "The vendor checks the application daily" (retained) |

The last row is fine. The first three are losses: the vendor named these things, and the names carried his mental model. "Today list" in particular is the name of the paper artifact the app is replacing, which is why CM1 ("keeps a parallel list") is the clearest failure signal.

### 3.6 The vision's deliberately open door

S-BRIEF, Vision:

> "the same app — still his, still to his requirements — can take a custom domain ... **It is not a product for other shops unless he later asks for that.**"

T-PRD §1 Non-goals: *"Serving bookshops other than this customer."* The flat non-goal drops the conditional. The source's position is "not now, and only if he asks" — an open door held shut. The target's position reads as a permanent architectural stance, which could justify decisions (hardcoded single-tenant assumptions) that the source was careful not to authorise outright.

### 3.7 Texture of the rush that survived, and what didn't

Retained well: "the work arrives in a rush", "parents read out a school list", "easy to lose in the thread", "sometimes order for a second child in the same call", "He collects cash at the door."

Lost: S-BRIEF Vision's closing image —

> "Parents place the list; he calls once for the final price; **the bag goes out.**"

The physicality of the end state ("the bag goes out") is the vendor's own summary of a successful order. T-PRD's equivalent is FR/§5's "Delivered — success terminal, set by the admin after the delivery partner reports drop-off. Cash has been collected." Accurate, and entirely drained.

---

## 4. Content softened, generalised, or made blander

### 4.1 "Packs are the main job" flattened into "a pack is not required"

S-ADD:

> "A pack is **not mandatory**. **Main focus is packs**; an order may be pack(s) only, individual items only, or mixed."

S-BRIEF:

> "The same cart can hold only pens, only packs, or both. **Packs are the main job**; they are not required to check out."

T-PRD FR38:

> "A pack is not required. A valid cart may contain packs only, individual items only, or a mixture."

Only the permissive half survived. The source states a *hierarchy* — packs are the point, items are the same shop's other stock — and both source documents say it explicitly. The target now treats packs and individual items as peer catalogs. FR33 reinforces this ("browse the individual-items catalog independently"). Nothing in T-PRD would stop a UX spec from giving stationery equal billing on the storefront home.

### 4.2 The admin's pack price became hypothetical

S-ADD:

> "**Admin 'pack final price'** is an all-selected preview, not a discount that survives unchecking."

T-PRD §6:

> "A pack's headline price, **where shown**, is an all-titles-selected preview."

The source implies an admin-facing field with a name. The target hedges with "where shown", never attributes it to the admin, and no FR in §4.2 mentions a pack price at all — FR16 lists a pack as school + grade + description + books, with no price field. The rule survived; the thing the rule is about was quietly made optional.

### 4.3 Animation requirement generalised

S-ADD, UI:

> "Mobile-first storefront. Rich UX, **lots of animation — not plain page reloads**."
> "Admin gets the same rich animated interface. **No calm/plain admin split.**"

T-PRD NFR2 keeps "richly animated" and "no calm-admin split" (good). NFR3 renders the second half as: *"Interactions behave as a modern application rather than full page reloads."* "Lots of animation" → "behave as a modern application" is a measurable softening of an explicitly maximalist instruction; the vendor asked for abundance, the NFR asks for adequacy.

### 4.4 A time-bound success criterion became an untimed constraint

S-BRIEF, Success Criteria:

> "First live URL is on Bonto free tier **in time for this customer to use it before he asks for a custom domain**."

T-PRD §8:

> "v1 runs on the Bonto free tier. A custom domain and always-on hosting are a later upgrade, not a rewrite."

The source's criterion is about *beating a deadline defined by the vendor's own patience*. The target keeps the hosting fact and discards the timing test. Combined with 1.3, T-PRD has no notion of "late" anywhere in it.

### 4.5 Private-school specificity diluted in the requirements

S-ADD:

> "Primary market: this customer's private-school parents, **who must buy specific editions from a school book list**. Not a multi-shop product."

T-PRD §2 keeps "buying this year's prescribed editions" in the user description, but §4.2's data rules do not (see 5.1). The market rationale lives only in T-ADD research. The PRD's own catalog requirements are segment-neutral.

---

## 5. Numbers, specifics, and named details lost

### 5.1 "Specific editions" has no representation in the data rules

S-BRIEF says it three times:

> "It is a named school's list, with **specific editions**"
> "A private-school family buying this year's **prescribed editions**"
> "this list is *their* school's **editions**"

S-ADD: *"Books themselves sell inside packs (**school-list editions**)."*

T-PRD FR14:

> "The admin maintains a reusable **book master**. Each book record holds a title and a price."

Title and price only. There is no edition, publisher, ISBN, or year attribute, and no note explaining that edition identity is expected to live inside the title string. Given that "the right edition" is the stated reason parents cannot just buy from a generic bundle, a two-field book record is the single largest specificity loss in this pass. Flagging as a lost detail rather than a contradiction because the sources never named an edition *field* — but they named the requirement four times.

### 5.2 QLess — the named India analogue

S-MEM:

> "India analogue **QLess** shows child's prescribed list on login. Differentiator is therefore per-title customisation (untick + qty), not pack ordering itself"

T-ADD's incumbents list carries Kapruka, Sarasavi and BookBee, and carries the differentiator conclusion, but QLess is dropped. It was the only cited example of the *adjacent* model (prescribed list surfaced on login) as opposed to the local competitors, and it is the evidence for the differentiator sentence that was kept.

### 5.3 "75 entries" and the locked board

See 1.6. The count is a traceability fact: it tells a reviewer how many rules should be findable downstream.

### 5.4 "1–13" grade range

See 1.5.

### 5.5 The icon

See 1.1.

### 5.6 Research numbers — verified as carried

For completeness, these source specifics were checked and are present in T-ADD: grades 2–5 and 7–11 free textbooks; grades 1 and 6 simplified modules under 2026 reforms; late-Nov-to-early-Jan peak with term 1 starting 1 January; ~six weeks of compressed demand; ~52% COD preference; PayHere sole-proprietor plus live-HTTPS-with-T&C/refund/privacy gating; 16.5M WhatsApp users (TRCSL Q4 2025); `*.bonto.run`; Bonto Glitch plan. Quantities 1–20, the 20 cap, and the locked last title are all present in T-PRD. No loss here.

---

## Summary of severity

**Must resolve before finalisation**

1. FR67 parent self-cancellation directly contradicts a locked source rule (2.1).
2. §10 misattributes a deferral order to the vendor (2.2).
3. The untick/edition differentiator is present as a mechanic but absent as a rationale, and the book master has no edition attribute (3.3, 5.1).
4. Government-school stationery packs are no longer excluded anywhere (1.2).

**Should resolve**

5. "Packs are the main job" hierarchy lost (4.1).
6. No timing or urgency constraint anywhere (1.3, 4.4).
7. "Today's orders" silently redefined without an assumption marker (2.3).
8. App icon dropped (1.1); QLess dropped (5.2); "more filter parameters later" dropped (1.4); "not 1–13" dropped (1.5); provenance thinned (1.6).

**Worth a line each**

9. Pack price hedged into near-nonexistence (4.2).
10. Sri Lanka / currency never named in the PRD body (1.7).
11. Qualitative losses: the phone loop, silence-after-placement, "the bag goes out", the conditional open door on multi-shop (3.1, 3.2, 3.6, 3.7).
