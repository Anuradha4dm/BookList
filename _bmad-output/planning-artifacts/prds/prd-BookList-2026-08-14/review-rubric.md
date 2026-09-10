---
title: "PRD Quality Review — Book List"
status: draft
created: 2026-08-14
updated: 2026-08-14
---

# PRD Quality Review — Book List

## Overall verdict

This is a strong PRD and a buildable one. It has a real thesis — "The vendor's problem is not selling more books. It is losing orders that were already agreed" (§1) — and the feature set, the status pipeline, and the snapshotting rules all serve it without padding; the trade-off disclosures in §5 "Accepted consequence", §7, and the addendum's rejected-alternatives list are the work of an author who is not trying to look good.

What is at risk is concentrated in three places, none of them structural. FR46's stale-cart acknowledgement is the one money-touching path whose semantics an engineer cannot derive (§4.6). Q1's password-recovery gap is the only Open Question with no buildable default, on a document whose delivery bar is "the complete scope described in this document, live and usable" (§1). And the absence of a Glossary and of any User Journey for the parent-facing storefront will cost the downstream UX and story workflows more than it cost this document — the multi-child flow, which is the product's actual differentiator, exists only as a subordinate clause inside FR37.

## Decision-readiness — strong

Decisions are stated as decisions. §5's "Accepted consequence" paragraph is the clearest example: it names that "there is no way to correct a mistyped delivery charge", states the recovery path (cancel and re-place), and says outright that this "was chosen deliberately over a softer freeze". That is a trade-off with the cost attached, not a choice dressed as a balance. The same posture runs through §7, which opens by saying the no-messaging decision "has consequences worth stating plainly rather than discovering in season" and then lists three of them, including that "Anyone with those credentials can see every parent's name, address, and phone number". §8 accepts a real operational risk in one line: "a day not checked is a day of orders not worked. This is accepted for v1."

The Open Questions are genuinely open rather than rhetorical, and three of the five are constructed the right way for a build-now PRD — each names the default the FRs already encode (Q2→FR3, Q3→FR40, Q4→FR21), so an engineer is never blocked while the question stays live. Q1 is the exception and it is the one the PRD itself predicts will fire.

Someone pushing back would find their objection acknowledged. The addendum's "Rejected alternatives" section pre-empts the five most obvious challenges, including the two most likely ("softening the price freeze", "allowing backward movement to Order Is Placed") with the reasoning for each.

### Findings

- **high** Q1 is the only Open Question without a buildable default (§11 Q1, §7, FR10) — Q1 says the resolution is "Unresolved, and likely to occur in the first season", and §7 states "the vendor has no in-app tool to help them". The two named options are not equivalent: re-registration silently breaks FR63 ("The parent can see **all** of their orders"), because the new account carries no history, and the PRD never states whether email is unique, which decides whether re-registration is even possible. On a document with a "complete scope" delivery bar, this is the one FR-shaped hole. *Fix:* pick admin-triggered parent password reset for v1 and write it as an FR in §4.1; if re-registration is genuinely the answer, state it as an FR too, with the order-history consequence and the email-uniqueness rule made explicit.
- **low** No `[NOTE FOR PM]` callouts anywhere in the document — the function they exist for is fully served by §5 "Accepted consequence", §7, and §11, so nothing is hidden. *Fix:* no content change needed; add the tags only if a downstream workflow greps for them.

## Substance over theater — strong

Very little furniture here. §2 carries three roles and prunes one of them on the spot: the delivery partner is described as "Not a user of the application and has no login". That is the opposite of persona theater — a role included to be explicitly excluded from the system boundary. The parent and admin descriptions each drive specific FRs (the second-child need drives FR37; "the only operator" drives FR8 and the absence of staff roles).

The Vision content in §1 could not swap into another PRD. "A pack is not 'Grade 5' — it is a named school's list of specific editions" is a domain-specific insight, and "The application does not replace the vendor's confirmation call. It makes that call the only call" is the whole product in one line. Market sizing and competitive strategy are absent, which is correct at this scope — and the research that does exist is parked in the addendum rather than inflating the PRD.

The NFR block mostly earns its place: NFR9 is the standout, naming exactly which three rules need server-side enforcement ("Quantity caps, the locked last title, and the required delivery price at confirmation") rather than asserting that validation matters. NFR7 and NFR8 are similarly specific, with NFR8 tying itself back to the thesis ("An order lost to a deploy is the exact failure this product exists to prevent"). NFR4 and NFR5 are the two that read as adjectives; they are handled under done-ness below.

Success Metrics are where the theater risk sits. M3, M4, CM1, and CM2 are real behavioural signals, and CM1 ("The vendor keeps a parallel list alongside the app") is a genuinely sharp falsifier — it is the kind of counter-metric most PRDs never write. M1 and M5 are weaker.

### Findings

- **medium** M1 and M5 restate requirements rather than measure outcomes (§3) — M1 ("Every order a parent places appears on the admin's open-orders view immediately") is FR52 restated, and M5 ("The vendor adds a new school, grade, book, pack, or item without contacting the developer") is G4 restated. Both are true-by-construction if the build is correct, so neither can distinguish a successful launch from a failed one. *Fix:* drop both and lean on M3/M4 with CM1/CM2 as the falsifiers, or reframe M5 as observed behaviour ("the vendor added at least one new pack unaided between seasons").
- **low** No owner or review point for any metric (§3) — the preamble states "v1 collects no telemetry", which is a fine decision, but it means every metric is judged by the vendor's recollection with no moment at which anyone looks. *Fix:* name one review point, e.g. a debrief at the end of the first book-list season.

## Strategic coherence — strong

The PRD has a thesis and bets on it. The problem framing in §1 is that agreed orders are being lost at capture, and every major mechanism traces back: the status pipeline exists so "the vendor can trust one screen instead of a paper list" (§5), the open-orders home (FR52–FR54) is the daily-login surface, snapshotting (§6) protects orders from catalog drift, and FR48's short sequential ID exists specifically "so it can be read aloud during the confirmation call". Even the omissions follow the thesis — §10 defers payment, search, and images, none of which touch order loss.

G1–G4 map cleanly onto feature clusters, and the MVP scope kind is unambiguously problem-solving with scope logic to match. §10 orders the deferrals "in the vendor's own priority order", which is the right authority for a commissioned build. Counter-metrics are present and mostly well-aimed.

The one seam is between G2 and the pricing model. G2 promises "The parent never has to phone the shop to learn the price", but §6 states "The payable total is written at Order Confirmed", which is after the shop's call. The PRD's own framing in §1 is the honest version — the shop initiates the one call — but G2 and CM2 as written promise something the flow cannot deliver.

### Findings

- **medium** G2 and CM2 overclaim against §6's pricing model (§Goals G2, §3 CM2, FR42, FR65) — the parent has no in-app route to the payable total before Order Confirmed, so CM2 counting "Parents still ring the shop to ask the price" as a failure signal makes the flow's only available behaviour look like a defect. The order-exists half of CM2 is fully solved by FR63–FR66; the price half is not solvable in v1 by design. *Fix:* split CM2 so only "rings to confirm the order exists or chase progress" counts as failure, and restate G2 as "the parent never has to phone the shop to check that the order exists or learn where it is; the shop initiates the single price call."
- **low** The sharpest statement of the thesis sits in the addendum, not the PRD (addendum, "Market and domain research") — "The differentiator here is per-title customisation, not booklist ordering itself" is the one line that explains why FR26–FR31 are the product rather than a UI detail. §1 implies it but never says it. *Fix:* promote that sentence into §1.

## Done-ness clarity — adequate

The FR body is unusually testable, and close to strong. FR28 through FR31 specify the pack-screen mechanics exactly, including the awkward cases: the last ticked title's checkbox is locked, the plus control is "disabled at 20, with the cap visibly communicated rather than silently ignored", and the minus at quantity 1 unticks except on that locked last title. FR37 states the rule an implementer would otherwise get wrong ("Lines never merge into one another"). FR57 makes the delivery price "required to confirm". FR67 pins the exact moment the parent's cancel option disappears. §5's transition rules and §6's pricing rules are both written as enforceable statements rather than descriptions. An engineer could write tests directly from most of §4.

Three gaps matter, and one of them is on the money path. FR46 describes stale-cart handling — "checkout flags the affected lines and the parent must acknowledge the change before placing" — but never says what acknowledgement does. Whether acknowledging a repriced line means the order snapshots the new price or the old one is undetermined, and it is the difference between two different amounts of money. Nor does the FR distinguish archived lines from repriced ones, though they need different outcomes: an archived pack presumably cannot be ordered at all, but FR46 puts both behind the same acknowledge gate.

The second gap is the book master. FR14 gives a book record "a title and a price", and FR15 makes that record shared across every pack with no override. But §1 insists a pack "is a named school's list of specific editions". There is no field in which an edition, author, or ISBN can live, so two prescribed editions of the same title are either one record with one price or two records distinguished only by how the admin types the title string.

The third is the NFR pair. NFR4 asks that the open-orders view load "quickly enough to be opened many times a day without friction" and NFR5 that the pack screen "stay responsive with a realistically long book list" — neither is verifiable, and "realistically long" is the number the pack screen's whole design depends on. NFR2's "richly animated" is similarly unfalsifiable, though the addendum routes animation to the UX spec, which is a reasonable place for it to be pinned down.

### Findings

- **high** FR46 acknowledgement semantics are undefined on a money path (FR46, §6) — "the parent must acknowledge the change before placing" does not say whether acknowledging a repriced line commits the new price or the old, and it applies the same gate to archived lines, which cannot sensibly be ordered at all. FR47 then snapshots "a complete snapshot of its contents and prices" without saying which prices won. *Fix:* split FR46 into two rules — an archived line must be removed before checkout can proceed; a repriced line is shown old and new price, and acknowledgement accepts the new price, which is what FR47 snapshots.
- **medium** The book master cannot represent editions, which §1 makes load-bearing (FR14, FR15, §1) — a record holding only "a title and a price", shared globally with no per-pack override, cannot distinguish two prescribed editions of one title, yet §1 defines a pack as "a named school's list of specific editions". *Fix:* add edition and author (and optionally ISBN) to the book-master record, or state explicitly in FR14 that the title string is expected to carry the edition and accept the consequence for FR15's shared pricing.
- **medium** NFR4 and NFR5 have no bounds (§9) — the only two NFRs written as adjectives, in a document that gives thresholds everywhere else. *Fix:* state a target for the open-orders view on the Bonto free tier at an expected open-order count, and give "realistically long" a number (a pack size, e.g. 60 titles) with a recalculation budget for tick and quantity changes.
- **low** Checkout from an empty cart is unspecified (FR38, FR39, §4.6) — FR39 lets the parent "remove any cart line" including the last, and no rule blocks placing from there. *Fix:* one clause stating checkout requires at least one line.
- **low** §6 defers whether a pack headline price exists at all — "A pack's headline price, **where shown**" describes behaviour for a UI element the PRD never decides to have. *Fix:* decide it here, or move the whole clause to the UX spec as an open UX decision.

## Scope honesty — strong

Omissions are explicit to an unusual degree, and stated in more than one register. §1 carries a short Non-goals paragraph, §10 lists nine deferrals "in the vendor's own priority order", §5 and §7 each own a consequence of a scope choice rather than leaving it to be discovered, and the addendum records five rejected alternatives with reasoning. Nothing appears to have been de-scoped silently.

The PRD also negates inline, throughout the FRs, which is more useful than a tag would be: FR7 ("no per-order address override and no saved-address book"), FR20 ("books are never sold as individual items"), FR22 ("no image uploads anywhere in the catalog in v1"), FR25 ("no free-text or smart search"), FR43, FR51, FR62, and §5's "There is no separate 'paid' status". A reader cannot mistake these for oversights.

Open-items density is appropriate rather than alarming. Four `[ASSUMPTION]` tags (FR3, FR21, FR40, CM3) and five Open Questions on a green-light-to-build PRD would be a concern only if the assumptions were load-bearing and undefaulted — and they are not; each is stated as the operative decision with the question kept visible beside it. The exception is Q1, covered under Decision-readiness.

### Findings

- **low** No Assumptions Index section, though the roundtrip effectively holds (FR3, FR21, FR40, CM3 → Q2, Q4, Q3, Q5) — all four inline assumptions are picked up in §11 under a different name, so nothing is orphaned; only the named section is missing. *Fix:* add a short index, or state at the head of §11 that it serves as the assumptions index.

## Downstream usability — adequate

Mechanical hygiene is genuinely strong. FR1–FR68 are contiguous with no gaps or duplicates across all eight subsections, and G1–G4, M1–M5, CM1–CM4, NFR1–NFR9, and Q1–Q5 are likewise clean. Every cross-reference resolves: FR10→§7, FR23/FR41/FR47→§6, FR59→§5, §7→§11, and Q2/Q3/Q4→FR3/FR40/FR21. Sections stand alone well — §5 and §6 in particular can be pulled out and handed to architecture as-is, and the addendum is already organised by consuming workflow.

What will cost the downstream workflows is the absence of a Glossary, in a document that leans hard on precise domain nouns. Pack, book master, individual item, cart line, goods total, payable total, snapshot, archive, school, and grade all carry defined meaning assembled across §4 and §6, and a UX or story workflow extracting from one section alone will have to reconstruct them. The naming is mostly disciplined — "goods total" and the status names never drift — but the delivery figure has three names.

The lack of User Journeys also lands here, since story creation is where it will be felt; it is written up under Shape fit because the question is whether the shape is right at all.

### Findings

- **high** No Glossary, in a PRD whose domain nouns are load-bearing and defined by assembly (whole document) — "book master" is defined across FR14, FR15, and FR20; "goods total" across §6 and FR41; "snapshot" across FR18, FR47, and §6. This is the chain-top document for UX, architecture, and stories, and the addendum shows it is meant to be extracted from. *Fix:* add a Glossary defining pack, book master, individual item, cart line, goods total, payable total, delivery price, snapshot, and archive, and cross-reference by term instead of by section where the FRs currently say "per §6".
- **medium** One money concept carries three names — "delivery price" (FR57, FR58, §5), "delivery charge" (FR42, FR64, FR65, §7), and "delivery-fee" (§10 "in-app delivery-fee calculation") — on the single field that turns a goods total into a payable total. *Fix:* pick one term, propagate it through §4.6, §4.7, §4.8, §5, §6, and §10, and land it in the Glossary.

## Shape fit — strong

The capability-spec shape is right for most of this document. The admin is a single operator with one account and no roles, so User Journeys for his loop would be overhead, and the rubric's allowance for operational rather than user-facing metrics is exactly what §3 uses. The deliberate exclusion of market sizing and competitive strategy is correct at this scope — this is a commissioned build for one named customer, and §1 says so in its first sentence ("It is not a product for other bookshops"). The research that would have padded those sections is in the addendum where architecture and UX can still use it. At 233 lines for 68 FRs there is no formalism this document did not need.

The half that is under-formalized is the parent-facing storefront, which is a consumer surface with a signature interaction. FR26–FR32 are sequenced tightly enough to read as a journey, and the addendum names the pack screen as "the product's signature interaction", so this is partially mitigated. But the multi-child flow — the differentiator, per the addendum — appears nowhere as a journey; it survives only as a clause inside FR37 ("which is how a parent orders for a second child"). A story-creation workflow reading FR35–FR41 will produce cart-line CRUD stories and may never build the flow the product exists to enable.

### Findings

- **high** No User Journeys for the parent-facing surface, and the differentiating flow exists only as a clause in FR37 (§4.5, whole document) — the storefront is a consumer product with mobile-first delivery (NFR1) and a signature interaction, which is where UJs with named protagonists are load-bearing. *Fix:* add two or three UJs with named protagonists — a parent ordering for two children in one session, a parent buying stationery only, and optionally the vendor's daily open-orders-to-Delivered loop — or state deliberately in §4.3 that the FR26–FR32 sequence stands in for a journey and that the second-child flow is promoted to its own FR.

## Mechanical notes

- **Glossary drift.** The delivery figure appears as "delivery price", "delivery charge", and "delivery-fee" (see the Downstream usability finding). "School" is "school or institute" in FR12 and plain "school" everywhere else. "Book master" appears as "book master" (FR14), "book record" (FR15, FR23), and "book-master records" (Q4) — readable, but worth fixing once a Glossary exists. Status names, "goods total", "payable total", and "individual items" are used identically throughout.
- **ID continuity.** Clean. FR1–FR68 contiguous with no gaps or duplicates (11 + 12 + 9 + 2 + 7 + 10 + 11 + 6 = 68). G1–G4, M1–M5, CM1–CM4, NFR1–NFR9, Q1–Q5 all contiguous and unique.
- **Cross-references.** All resolve. FR10→§7, FR23→§6, FR41→§6, FR47→§6, FR59→§5, §7→§11, Q2→FR3, Q3→FR40, Q4→FR21. No "see above" references.
- **Assumptions Index roundtrip.** No index section exists, but all four inline `[ASSUMPTION]` tags (FR3, FR21, FR40, CM3) are picked up by §11 (Q2, Q4, Q3, Q5 respectively), and the one `[OPEN]` tag in §7 points to Q1. Effectively complete under a different name.
- **UJ protagonist naming.** No UJs present; see Shape fit.
- **Required sections.** Present and appropriate for the stakes and product type. Goals, Non-goals, Delivery bar, Users, Success Metrics with counter-metrics, FRs, NFRs, Out of Scope, and Open Questions are all here. Missing: Glossary, User Journeys, Assumptions Index. Deliberately and correctly absent: market sizing, competitive strategy, monetisation.
