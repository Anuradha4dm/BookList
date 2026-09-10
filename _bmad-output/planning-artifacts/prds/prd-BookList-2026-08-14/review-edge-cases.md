---
title: "Book List PRD — adversarial edge-case review"
status: draft
created: 2026-08-14
reviewer: edge-case hunter
scope: prd.md, addendum.md
---

# Adversarial edge-case review: Book List PRD

## Verdict

**Not implementation-ready.** The PRD is unusually clear about *intent* and unusually silent about *contention*. Every rule in it is written as if exactly one actor is touching exactly one record at exactly one time, and the whole document contains no concept of a concurrency guard, an idempotency key, a status-change timestamp, an actor record, or an audit trail. NFR9 names three things that must be enforced server-side — quantity caps, the locked last title, the required delivery price — and by naming three it implicitly leaves everything else, including every status transition, as a client-side rule.

Three structural gaps generate most of the findings below:

1. **The freeze is declared, not specified.** §5 says "once an order is confirmed, nothing about it changes." But the delivery address, the WhatsApp number, and the payable total's inputs are not in the snapshot list in §6, and no requirement forbids a second confirm. The freeze holds only for the fields §6 happens to enumerate.
2. **FR46 protects the wrong granularity.** It flags "any pack or item" that was archived or repriced. Prices do not live on packs — FR15 puts them on shared book records and advertises that a correction "applies everywhere at once." The most likely drift in this system is therefore invisible to the only mechanism designed to catch drift.
3. **FR59 has no adjacency rule.** "Move an order forward or backward between non-terminal statuses" plus a floor at Order Confirmed is the entire transition specification. Nothing says a transition must be to a neighbouring status, which makes several money invariants reachable-around.

Counts: **9 CRITICAL, 14 HIGH, 15 MEDIUM, 4 LOW.**

---

## 1. The state machine (§5, FR57–FR62, FR67)

### E1. Parent cancel and admin confirm land in the same instant — CRITICAL

**Scenario.** The admin is on the phone with the parent and taps Order Confirmed with a delivery price. In the same second, the parent — who has changed their mind and is looking at a page loaded a minute ago — taps Cancel.

**What the PRD says.** FR67: the parent can cancel "while it is still **Order Is Placed**. The option disappears the moment the admin sets Order Confirmed." FR57: the admin sets Order Confirmed and enters the delivery price in the same action. NFR9 lists the server-side enforcement obligations and status transitions are not among them.

**What is undefined.** Whether either write checks the order's current status *at the moment of the write*. There is no compare-and-swap requirement, no row lock, no "expected current status" parameter, no rule for which write wins.

**Consequence.** Reachable end states include: (a) an order that is Cancelled but carries a delivery price and a payable total, which the parent may read as a live bill; (b) an order the parent was told was cancelled that is now Confirmed and frozen, with the parent's cancel button gone and no recovery path except asking the admin to cancel again; (c) both writes applying, producing a Cancelled order with a confirmation reason of record. The vendor has just verbally agreed a price on a call for an order that no longer exists. This is the single most likely serious defect in the build, because FR67's window is exactly the window in which the admin is doing his one piece of work.

**Resolution needed.** State that every status write is a conditional update on the expected current status, and that a losing write returns a specific "order has moved on" error the interface must surface.

### E2. The parent's cancel button is drawn from stale state — CRITICAL

**Scenario.** The parent opens their order detail at 10:00. The admin confirms at 10:04. The parent taps Cancel at 10:06.

**What the PRD says.** FR66: "The parent sees the order's position in the pipeline as the admin advances it." §5: no notification is sent, in either direction. NFR3 asks for modern non-reloading interactions but does not require live status subscription.

**What is undefined.** Whether FR66 means live push, poll-on-focus, or simply "the status is current when you load the page." Without live sync, FR67's "the option disappears the moment" is unimplementable on the client and must be a server-side rejection — which no requirement states.

**Consequence.** The parent taps a button the PRD promised would be gone and either cancels a frozen order or receives an undefined error. This is E1 without the coincidence, so it is far more frequent.

### E3. Backward movement to Order Confirmed contradicts FR57 — CRITICAL

**Scenario.** The admin mis-taps Processing → Packing The Order, corrects backward to Processing, then backward again to Order Confirmed.

**What the PRD says.** §5: "backward movement stops at Order Confirmed. An order can never return to Order Is Placed." FR59 permits backward movement "subject to the floor in §5." FR57: "The admin sets **Order Confirmed** and enters the delivery price in the same action. The delivery price is required to confirm."

**What is undefined.** Whether "stops at Order Confirmed" means Order Confirmed is *reachable* backward (the floor is inclusive) or is the *barrier* below which you cannot go (the floor is exclusive, and Processing is the lowest reachable). The two readings are both grammatical. If it is inclusive, FR57 binds delivery-price entry to the act of setting Order Confirmed, so arriving there backward must either re-prompt for a delivery price — which is precisely the "hidden edit path around the freeze" the addendum says was rejected — or use an undefined second, price-less variant of the same transition.

**Consequence.** Either an unintended edit path to the one number the entire freeze exists to protect, or an implementer picks the exclusive reading and the vendor discovers he can never undo a mis-tap back to the confirmed state. The addendum's rejected-alternatives list shows the authors were alert to this exact loophole for Order Is Placed and did not close it one status up.

### E4. Transitions have no adjacency rule — CRITICAL

**Scenario.** From the open-orders view the admin sets a just-placed order straight to Delivered, or straight to Ready To Deliver, skipping Order Confirmed.

**What the PRD says.** FR59: "The admin can move an order forward or backward between non-terminal statuses, subject to the floor in §5." §5 lists the happy path as a numbered sequence but never states that a transition must be to an adjacent status. FR60 allows cancellation "from any non-terminal status." §5 describes Delivered as set "after the delivery partner reports drop-off" — a description of practice, not a guard.

**What is undefined.** The legal transition set. Whether Delivered is reachable from anything other than On Delivery Partner. Whether Order Confirmed is mandatory on every path to Delivered.

**Consequence.** A Delivered order with no delivery price and therefore no payable total, because §6 says "the payable total is written at Order Confirmed." The parent's order detail shows the FR65 notice that the delivery charge is still to be confirmed, permanently, on an order that has been delivered and paid for in cash. The shop has no record of what was collected. This breaks FR58's claim that confirmation produces "the first complete payable figure" and it is reachable with two taps on a grouped-by-status list where adjacent rows are different statuses.

### E5. Delivered and Cancelled are reachable from physically impossible states — HIGH

**Scenario.** An order is On Delivery Partner. The courier is at the door. The admin cancels it (FR60) because a different order's stock ran out and he tapped the wrong row.

**What the PRD says.** FR60: "The admin can cancel any non-terminal order. A short reason is required." FR61: both terminals sit behind a confirmation prompt. §5: "There is no separate 'paid' status. Payment is cash on delivery and is implied by Delivered."

**What is undefined.** Whether cancellation is permitted once goods have physically left the shop, and what the order records when cash may already have been collected. There is no state that represents "cancelled after dispatch" or "returned."

**Consequence.** An order marked Cancelled for which the parent has paid cash. The application's own rule says payment is implied by Delivered, so a Cancelled order asserts no payment was taken. The vendor's books and the app disagree, with no in-app way to reconcile.

### E6. Two admin sessions, or one admin double-tapping — HIGH

**Scenario.** The admin has the app open on his phone and his desktop, or taps Advance twice on a slow connection during the seasonal burst (§8, Bonto free tier).

**What the PRD says.** FR8: one admin account, seeded from configuration. Nothing anywhere restricts concurrent sessions for that account. FR59 describes movement without specifying whether the control is relative ("next status") or absolute ("set to Packing The Order"). NFR3 requires status advancement to behave without page reloads, which removes the browser's own double-submit friction.

**What is undefined.** Idempotency of the transition write, and the semantics of the control itself. If the control is relative, a double-tap advances two statuses. If it is absolute, a double-tap is harmless — but the PRD does not choose.

**Consequence.** Orders silently skipping a stage during the busiest six weeks of the year, on the screen §8 identifies as "the screen most likely to be opened repeatedly under time pressure." Undiagnosable afterwards, because of E10.

### E7. Confirm can be submitted twice, overwriting the frozen delivery price — CRITICAL

**Scenario.** The admin submits Order Confirmed with a delivery price; the response is slow; he submits again with a different figure, or the same form is replayed.

**What the PRD says.** §5: "Once an order is confirmed, nothing about it changes: not the lines, not the prices, not the delivery charge." §5's accepted consequence: "there is no way to correct a mistyped delivery charge," and the recovery path is cancel-and-re-place. FR57 defines the confirm action.

**What is undefined.** No requirement states that the server must reject a confirm on an order that is not currently Order Is Placed. The freeze is stated as a property of the order, never as a precondition on the write.

**Consequence.** The one absolute rule the vendor is being asked to trust — and which the addendum records as a deliberate rejection of a softer freeze — has an unguarded write path. Worse than a soft freeze, because the vendor believes it is absolute and will not check.

### E8. Parent cancellation has no reason, no actor, and no signal to the admin — HIGH

**Scenario.** The admin's open-orders view shows four orders awaiting confirmation. He calls one, agrees the price, and reaches for Confirm. Meanwhile a different parent cancels theirs. Later the admin cannot find an order he remembers seeing.

**What the PRD says.** FR60 requires a reason for *admin* cancellation. FR67 gives the parent an unqualified cancel with no reason requirement. FR68: "When the admin cancels an order, the parent sees both the Cancelled status and the reason given" — the reverse direction is never specified. FR52 excludes Cancelled orders from the admin's home screen; FR55 puts them in a separate view. §5: no notification is sent to the admin.

**What is undefined.** Whether a parent-cancelled order records a reason (FR68's display would render an empty field), who cancelled (no actor is recorded anywhere in the PRD), and whether the admin gets any indication at all. Orders simply vanish from his working list between refreshes.

**Consequence.** The admin cannot distinguish "the parent changed their mind" from "I cancelled this myself last week," and per-status counts (FR54) change under him with no explanation. Directly undermines CM1: a working list that silently loses rows is a list the vendor will start shadowing on paper.

### E9. An unreachable parent strands an order forever — HIGH

**Scenario.** The admin calls the WhatsApp number, no answer. He calls the second phone (FR11), no answer. He tries again for three days.

**What the PRD says.** G3: "Every order reaches a terminal state." M2 repeats it. FR11 provides the fallback number. §7: the application "sends no email, SMS, or WhatsApp message at all." CM3 flags accumulation in non-terminal status but "no threshold is defined."

**What is undefined.** The exit path. The order cannot be confirmed without a call, and the only terminal available is Cancelled, which requires the admin to unilaterally kill an order the parent may still be expecting. There is no "attempted contact" state, no way for the parent to see that the shop tried, and no way for the parent to be prompted.

**Consequence.** Orders sitting in Order Is Placed indefinitely, which is exactly CM3, with the parent's only recourse being CM2 — phoning the shop. Both named counter-metrics trigger from one undefined path.

### E10. No status history, timestamps, or actor on any transition — MEDIUM

**Scenario.** The vendor asks why order #1042 is in Packing when he is sure he never touched it.

**What the PRD says.** FR52 says open orders appear "regardless of when it was placed," which implies a placement timestamp and nothing more. Q5 asks whether stale orders should be flagged, which is unanswerable without a status-changed-at value that no requirement mandates storing.

**What is undefined.** Whether any transition is recorded at all.

**Consequence.** Q5 cannot be resolved later without a schema change. Every race condition above is undiagnosable in production. FR66's "position in the pipeline" has no history behind it, so a parent who watched their order go backward has no explanation.

### E11. Cancel-after-cancel and the confirmation prompt — LOW

**Scenario.** Two tabs, both showing the cancel dialog; both submit with different reasons.

**What the PRD says.** FR61 requires a confirmation prompt "because both are final." FR60 requires a reason.

**What is undefined.** Whether the second cancel is rejected or overwrites the reason the parent already saw (FR68).

**Consequence.** The reason shown to the parent changes after the fact. Low frequency, but it is another instance of the missing precondition-on-write pattern.

---

## 2. Money rules (§6, FR41–FR47, FR57–FR58, FR64)

### E12. The delivery address is not snapshotted, and the parent can edit it after confirmation — CRITICAL

**Scenario.** The parent places an order, the admin confirms it, and then the family moves house. The parent updates their profile address (FR5). The order is already On Delivery Partner with the old address written on the packing slip.

**What the PRD says.** FR7: "The address held on the parent's account is the delivery address for every order they place. There is no per-order address override." FR5 lets the parent edit that address freely. FR56 shows the admin the "delivery address" on the order detail. §6's snapshot enumerates exactly: "pack names, book titles, item titles, unit prices, and quantities." The address is absent. So is the WhatsApp number and the second phone. §5: "Once an order is confirmed, nothing about it changes."

**What is undefined.** Whether the order's address is a copy taken at placement or a live reference to the account. FR7's wording ("the address held on the account *is* the delivery address for every order") reads as a live reference; §5's freeze reads as a copy; §6's enumeration silently excludes it either way.

**Consequence.** With a live reference: a frozen order's delivery destination mutates after freeze, and the admin's screen shows a different address from the one the courier was given. With a copy: FR7 is wrong, and a parent who corrects a typo in their address cannot get it applied to the order that is about to be delivered, with no per-order override to fall back on (FR7 explicitly removes one). Both readings produce a failed delivery, and the PRD supports both. The same ambiguity applies to the WhatsApp number the admin is about to call and the number handed to the delivery partner.

### E13. FR46 cannot see the price changes FR15 is designed to cause — CRITICAL

**Scenario.** A parent's cart holds a Grade 5 pack line added in November. In December the admin corrects the price of one book in the book master. The parent checks out.

**What the PRD says.** FR46: "If any **pack or item** in the cart has been archived, or has had its price changed, since it was added, checkout flags the affected lines." FR15: a book "is one record, so a price correction applies everywhere at once. A pack cannot override the price of a book it contains." §6: a pack's headline price is only a preview and "does not survive the parent unticking titles" — so a pack has no price of its own to change.

**What is undefined.** FR46 is scoped to packs and items. A pack has no price; only its constituent books do. Read literally, no book-level price change in a pack line is ever flagged, and the pack itself can only trip the archived half of the rule. FR21 additionally assumes books can be archived — an archived book inside a live pack in a cart line is covered by nothing at all.

**Consequence.** The mechanism whose stated purpose is "nothing is silently substituted or silently repriced" silently reprices the most common case in the system. FR15 exists precisely to make mid-season price corrections easy and global; FR46 does not watch the entity FR15 changes. A parent is charged a price they never saw, on the exact scenario the requirement was written for.

### E14. "Acknowledge the change" has two opposite meanings for an archived line — CRITICAL

**Scenario.** A parent's cart holds last season's pack. It has been archived. Checkout flags it. The parent acknowledges.

**What the PRD says.** FR46: "checkout flags the affected lines and the parent must acknowledge the change before placing. Nothing is silently substituted or silently repriced." FR18: "Archiving a pack hides it from the storefront but does not delete it. Orders that already contain it keep their own snapshot."

**What is undefined.** What acknowledgement *does*. Two readings: (a) the parent acknowledges the line will be **dropped**, and the order is placed without it; (b) the parent acknowledges the pack is discontinued but orders it **anyway**, and FR18's snapshot language suggests archived packs can legitimately sit on orders. The PRD supports both and the outcomes are opposite.

**Consequence.** Under (a), a parent acknowledges a notice and receives an order missing the thing they wanted — and if every line was archived, an empty order with a goods total of zero, which no requirement forbids placing. Under (b), the shop is contractually committed to supplying a pack it deliberately withdrew, discovered only on the confirmation call. The vendor will hit this in the first week of a new school year, when last season's packs are archived en masse and every returning parent's cart is stale.

### E15. Price can change between acknowledgement and placement — HIGH

**Scenario.** The parent acknowledges a flagged price change at 10:00:05 and taps Place Order at 10:00:40. The admin saves another price edit at 10:00:20.

**What the PRD says.** FR46 requires acknowledgement "before placing." FR47: "Placing the order captures a complete snapshot of its contents and prices." §6: prices are snapshotted "as they stood at that moment."

**What is undefined.** Whether the snapshot is re-validated against what was acknowledged. FR46's check happens on entry to checkout; FR47's snapshot happens on submit; nothing binds them.

**Consequence.** An order snapshotted at a price the parent never saw and explicitly did not acknowledge, defeating FR46 through a gap of seconds. Also unspecified: whether acknowledgement is required when the price went *down*, and whether the acknowledgement survives a back-navigation or a session refresh.

### E16. No validation rules exist for any price, anywhere — HIGH

**Scenario.** The admin fat-fingers a book price as `250` instead of `2500`, or as `-250`, or leaves it blank. Or he types a delivery price of `50000` instead of `500`.

**What the PRD says.** FR14: a book record "holds a title and a price." FR19: an item holds "a title, a description, and a price only." FR57: "The delivery price is required to confirm." NFR9 enumerates the server-side validations: "quantity caps, the locked last title, and the required delivery price at confirmation" — presence of the delivery price only, not its value.

**What is undefined.** Non-negativity, an upper bound, whether zero is permitted, decimal places, and whether a required field accepts `0` at all (a genuine question for free delivery). Nothing prevents a negative price producing a negative goods total.

**Consequence.** For catalog prices, a typo propagates instantly to every pack (FR15) and into every order snapshotted while it stands. For the delivery price, §5's accepted consequence removes all recovery — "there is no way to correct a mistyped delivery charge" — which makes input validation the *only* defence against the mistake, and the PRD specifies none. The accepted consequence was reasoned on the basis that "mistyping is rare"; an unvalidated numeric field on a phone during a rushed call is where mistyping happens.

### E17. No money representation or rounding rule — MEDIUM

**Scenario.** The cart's running total (FR41) is recalculated continuously as the parent steps quantities (NFR5). At checkout the goods total is displayed, then snapshotted, then added to the delivery price.

**What the PRD says.** §6: "All amounts are handled in a single currency; v1 has no multi-currency or tax handling." The addendum says only "single-currency money handling. No tax engine."

**What is undefined.** Whether money is stored as integer minor units or as a floating-point value; the rounding rule at display; whether the displayed goods total, the stored snapshot total, and the recomputed sum of snapshot lines are guaranteed to agree.

**Consequence.** With floats, a long book list can display a total that differs by a cent from the stored one, and the figure read aloud on the confirmation call may not match the figure the parent sees. There is no arithmetic here that *requires* rounding — no discounts, no tax, no percentages — so this is cheap to close now and expensive to retrofit once orders are stored.

### E18. The pack headline price is unspecified and drifts from the cart — MEDIUM

**Scenario.** A pack listing shows "Rs 12,400." The parent opens it, changes nothing, adds it, and sees a different figure in the cart.

**What the PRD says.** §6: "A pack's headline price, **where shown**, is an all-titles-selected preview. It is not a bundle discount, and it does not survive the parent unticking titles." No FR requires, defines, or places this figure.

**What is undefined.** Whether the preview assumes quantity 1 per title (§6 says "all titles selected," not "at quantity 1"); whether it is computed live from the book master or stored on the pack; whether it updates as the parent ticks. A live preview against an at-add cart line means the listing page and the cart legitimately disagree after any price edit, with no FR46 flag on the listing.

**Consequence.** The one number a parent sees before committing attention to a pack is the one number with no requirement behind it. Mismatch here reads as a bait-and-switch and drives the phone call M4 exists to eliminate.

### E19. No cart-level or order-level value ceiling — MEDIUM

**Scenario.** A parent adds forty pack lines at twenty copies each.

**What the PRD says.** FR29/FR30 cap quantity at 20 per title. FR34 applies the same range to items. FR36/FR37 place no limit on the number of cart lines. FR51: cash on delivery.

**What is undefined.** Any bound on order value or line count, and any review step before a COD order is accepted.

**Consequence.** An unbounded cash-on-delivery liability with no credit check and no deposit, on a shop whose entire business runs six weeks a year. FR62 forbids editing a placed order, so the admin's only tool is cancellation.

### E20. Delivered without a payable total — HIGH

**Scenario.** Reached via E4, or via any implementation that permits Delivered from a pre-confirmation state.

**What the PRD says.** §6: "The payable total is written at Order Confirmed, not at checkout." FR58: on confirmation the total becomes goods plus delivery. FR64: parent order detail shows "the delivery charge once set, and the payable total." FR65: before confirmation, the detail states the charge is still to be confirmed.

**What is undefined.** What FR64 renders when the delivery charge was never set on a terminal order.

**Consequence.** A delivered, cash-collected order that displays "delivery charge to be confirmed by the shop" forever, with no payable total on record. The shop has no in-app figure for what it collected.

---

## 3. Pack selection (FR26–FR32)

### E21. A book is removed from a pack while the parent is configuring it — CRITICAL

**Scenario.** The parent opens a 24-title pack, unticks six titles they own, sets three quantities. While they work, the admin edits the pack (FR17) and removes two books. The parent taps Add to Cart (FR32).

**What the PRD says.** FR26: opening a pack displays every book in it, all pre-selected. FR32: the parent adds the configured pack "as a single action." FR23: "Editing a book, item, or pack affects the storefront and future orders only. Existing orders are unaffected." FR17: the admin can edit packs "at will."

**What is undefined.** The submitted payload now references books that are no longer part of the pack. The PRD does not say whether the server accepts the stale configuration, rejects the whole add, silently drops the removed titles, or re-renders the pack. FR23 protects *existing orders* from edits; a cart line is not an order, and a half-configured screen is not even a cart line. The mirror case is equally undefined: if the admin *adds* a book, is it pre-ticked per FR26, or absent from an add-to-cart submitted from a screen that never showed it?

**Consequence.** Either an order snapshotting a book the pack no longer contains — which the shop is then obliged to supply, at a price that may also have moved — or the parent's minutes of tick-and-stepper work being discarded with no warning, on the screen the addendum calls "the product's signature interaction." Add-to-cart during the six-week burst is exactly when the admin is most likely to be correcting packs.

### E22. Composition changes are never flagged at checkout — HIGH

**Scenario.** A cart line for the Grade 5 pack was created in November. In December the admin adds two prescribed titles to that pack. The parent checks out in January.

**What the PRD says.** FR46 flags archival and price change only. The addendum: "Cart lines are cloned, never merged. Two adds of the same pack are two independent line records with their own tick sets." FR40 assumes tick sets cannot be edited in the cart at all.

**What is undefined.** Whether a cart line is re-reconciled against the pack's current book set, and whether composition drift is surfaced anywhere.

**Consequence.** The parent orders "the Grade 5 pack" and receives last month's version of it, missing two required titles, with no flag and no way to fix it in the cart (FR40 requires remove-and-re-add). They discover it at school. This is the product's core promise — the right editions for the right school list — failing silently.

### E23. An empty pack is constructible and addable — HIGH

**Scenario.** The admin creates a pack, saves it before adding books, or removes its last book. A parent opens it.

**What the PRD says.** FR16: "A pack is composed of a school, a grade, a short description of what the pack is for, and a set of books chosen from the book master." No minimum cardinality is stated. FR26: opening a pack displays every book in it. FR28: the last remaining selected title cannot be unticked.

**What is undefined.** Whether a pack with zero books can be saved, whether it appears on the storefront (FR24 scopes grade options to grades that "actually have packs," which an empty pack satisfies), and what FR28 locks when there is nothing to lock. FR32 would add a line with no contents and a goods total contribution of zero.

**Consequence.** A zero-line order that the admin must call about and cancel. Also breaks FR24's promise that "the parent cannot select a combination with no results" — the combination has a result, and the result is empty.

### E24. A one-book pack locks the checkbox and the PRD's explanation is a lie — MEDIUM

**Scenario.** A pack contains exactly one book. The parent opens it.

**What the PRD says.** FR26 pre-selects it. FR28: "The last remaining selected title cannot be unticked; its checkbox is locked. **To remove it, the parent must first tick another title.**" FR31: minus at quantity 1 unticks, "except on the last remaining ticked title, where it is locked." The addendum: "The locked checkbox and the disabled plus at 20 both need visible explanation rather than silent refusal."

**What is undefined.** The explanatory text the addendum mandates. FR28's stated remedy — tick another title — is impossible in a one-book pack, so the explanation derived from FR28 is actively wrong.

**Consequence.** The parent is told to do something that cannot be done, on a locked control, with no alternative offered (there is no "don't add this pack" affordance on the pack screen — only navigating away).

### E25. Minus-at-1 on the last title: disabled or silent no-op? — MEDIUM

**Scenario.** The parent taps minus on the only ticked title at quantity 1.

**What the PRD says.** FR30 for the plus control at 20 is explicit: "disabled at 20, with the cap visibly communicated rather than silently ignored." FR31 for the minus control says only that it "is locked" on the last remaining ticked title, with no equivalent communication clause.

**What is undefined.** Whether the minus control is visually disabled or accepts the tap and does nothing.

**Consequence.** Silent refusal on the interaction the addendum singles out as needing explanation — inconsistent with the sibling requirement one line above it.

### E26. Re-ticking a title: does the quantity survive? — MEDIUM

**Scenario.** The parent sets a title to quantity 7 (twins plus a spare), unticks it by mistake, and ticks it again.

**What the PRD says.** FR29: "Each ticked title **starts at quantity 1**, with a stepper ranging 1 to 20." FR31: minus at quantity 1 unticks the title.

**What is undefined.** Whether "starts at quantity 1" applies to the initial render only or to every tick event, and therefore whether the 7 is preserved or reset.

**Consequence.** Either a silently reset quantity the parent does not re-check, or a silently retained one they assumed was cleared. Both ship the wrong number of books. Compounded by FR31: an accidental extra minus press at quantity 1 unticks the title entirely, so the untick-then-retick sequence is a routine slip, not a rare one.

### E27. The quantity cap is per line, not per order — LOW

**Scenario.** The parent adds the same pack twice at 20 copies of a title (FR37, legitimately) for 40 total.

**What the PRD says.** FR29/FR30 cap at 20. FR37 permits unlimited independent lines of the same pack. NFR9 enforces caps server-side, presumably per line.

**What is undefined.** Whether 20 is meant as a per-line guard or a real ceiling on units of a title per order.

**Consequence.** Minor, but if the cap exists as a sanity check against fat-fingering, it does not bind. Worth one sentence stating it is per line and intentionally so.

### E28. Double-tapping Add to Cart is indistinguishable from the second-child flow — MEDIUM

**Scenario.** On a slow connection during the burst, the parent taps Add to Cart twice.

**What the PRD says.** FR32: adding is "a single action." FR37: "The same pack may be added more than once. Each add creates a new cart line... **Lines never merge into one another.**" The addendum: "Any uniqueness constraint on cart lines would break the second-child flow."

**What is undefined.** Idempotency of the add. The one deduplication mechanism that would normally catch a double-tap has been explicitly forbidden for good reason.

**Consequence.** A duplicate pack line that looks exactly like a deliberate second-child line, doubling the order value. Caught only if the parent reads the cart carefully (FR39 allows removal). The feature that makes the product distinctive also removes its accident protection, so this needs a deliberate answer — a confirm step, an add-token, or an explicit "added twice — is this for a second child?" prompt.

---

## 4. Cart and catalog interaction (FR35–FR41, FR46)

### E29. Cart lines: at-add prices or live prices? — HIGH

**Scenario.** The cart shows a goods total of Rs 18,200 in November. In December the parent opens the same cart.

**What the PRD says.** FR41: "The cart displays a running goods total, calculated per §6." §6 defines the goods total arithmetic but never says which prices feed it before placement. FR47/§6 fix prices at *placement*, not at add. FR46 flags a price change "since it was added," which presupposes a recorded at-add price. The addendum agrees only obliquely: "Stale-cart detection requires comparing a cart line against current catalog state at checkout."

**What is undefined.** Whether cart lines store the at-add unit prices. No FR requires it, although FR46 is unimplementable without it.

**Consequence.** If the cart shows live prices, the total silently changes between visits and FR46 has no baseline to compare against, so the whole stale-cart protection collapses. If it shows at-add prices, the cart displays a figure the parent will not be charged, and FR41's "running total" is a quote with no expiry. Either way, FR35's promise that a cart persists indefinitely across sessions and devices means these lines can be arbitrarily old.

### E30. The cart has no lifetime and no seasonal reset — MEDIUM

**Scenario.** A parent's cart from January is still there the following November, referencing archived packs from a school year that has ended.

**What the PRD says.** FR35: the cart "persists across sessions and devices." Nothing expires it. FR17: "A new school year means a new pack." FR18: archiving hides the old one.

**What is undefined.** Any TTL, any season boundary, any prompt to clear.

**Consequence.** At the start of every season, returning parents hit a checkout wall of FR46 flags on lines they no longer remember creating — colliding directly with E14's undefined acknowledgement semantics, at the highest-traffic moment of the year.

### E31. Cross-device cart edit races the Place Order that empties it — HIGH

**Scenario.** The parent has the cart open on a laptop and places the order from their phone. Or adds an item on the laptop one second before the phone's Place Order lands.

**What the PRD says.** FR35: the cart is server-persisted and follows the parent across devices — "A cart built on a phone is still there on a laptop." FR47: placing captures a snapshot of the cart's contents. FR50: "The cart is emptied once the order is placed."

**What is undefined.** Whether the snapshot and the empty are one atomic operation over a fixed set of lines, or two steps over whatever is in the cart at each moment. A line added between them is deleted without ever being ordered.

**Consequence.** Silent loss of a cart line — the parent adds something, watches it appear, and it is gone with no order containing it. FR35's explicitly advertised cross-device behaviour is what makes this reachable.

### E32. The same pack twice, then archived: acknowledgement granularity — MEDIUM

**Scenario.** The cart holds the Grade 5 pack twice (two children, different tick sets). The pack is archived, or one of its books is repriced.

**What the PRD says.** FR46 "flags the affected lines and the parent must acknowledge the change." FR37: the lines are independent.

**What is undefined.** Whether acknowledgement is per line or per order, and whether one underlying catalog change presents as one notice or two.

**Consequence.** Two identical warnings about one change reads as two problems, or one acknowledgement silently covers a line the parent did not look at. Minor alone; it compounds E14, where what is being acknowledged is already ambiguous.

### E33. Adding to the cart from a page whose pack was just archived — MEDIUM

**Scenario.** The parent has a pack page open (or bookmarked) when the admin archives it. They tap Add to Cart.

**What the PRD says.** FR18: archiving "hides it from the storefront." FR46 handles archived packs already *in* the cart. FR3: adding to a cart requires login.

**What is undefined.** Whether adding an archived pack is rejected at the server. "Hidden from the storefront" describes listing behaviour, not write authorisation.

**Consequence.** A brand-new cart line that FR46 will immediately flag as archived at checkout — the parent adds something and is warned about it seconds later, which reads as a broken app.

### E34. Anonymous pack configuration is lost at the login gate — HIGH

**Scenario.** A first-time parent browses without an account (FR3), spends five minutes on a 30-title pack unticking what they own, and taps Add to Cart.

**What the PRD says.** FR3 `[ASSUMPTION]`: "Anyone may browse schools, grades, packs, and individual items without an account. Adding anything to a cart requires being logged in, because the cart belongs to the account." FR1 requires name, delivery address, WhatsApp number, email, and password to register. Q2 records this as unresolved.

**What is undefined.** Whether the pack configuration survives the registration detour. The cart cannot hold it — FR3's own reasoning is that the cart belongs to an account that does not yet exist.

**Consequence.** The parent completes a five-field registration including a full delivery address and returns to an empty, all-pre-ticked pack screen, having lost the work. This is the single highest-drop-off moment in the funnel, on the product's signature interaction, and it is created by an `[ASSUMPTION]` that no one has ratified.

### E35. Re-registration orphans a parent's orders and cart — HIGH

**Scenario.** A parent forgets their password. Per Q1's own fallback, they register again with a different email.

**What the PRD says.** §7: "A parent who forgets their password cannot self-recover. They must reach the shop, and the vendor has no in-app tool to help them." Q1 offers admin-triggered reset or "accepting re-registration" as options. NFR7: a parent can only ever see their own orders. FR67: a parent can cancel their own order while it is Order Is Placed.

**What is undefined.** The fate of the first account's live orders. They remain attached to an identity the parent can no longer access — invisible to them (NFR7), uncancellable by them (FR67), and duplicated in the admin's view under the same name, address, and phone number with no link between the two records.

**Consequence.** The admin sees two parents who are one family and cannot tell which order is live. During a season, a phone number appearing on two accounts is a confirmation call to the wrong order. The PRD's own suggested workaround for its most likely first-season support issue creates a data-integrity problem it does not acknowledge — Q1 treats the choice as a UX question when it is a data question.

### E36. Registration field validation is unspecified — MEDIUM

**Scenario.** Two parents register with the same email, or one registers with an unreachable WhatsApp number or a one-line address.

**What the PRD says.** FR1 lists the fields. FR2: "Login uses email and password only."

**What is undefined.** Email uniqueness (required for FR2 to function, never stated), phone format or minimum length, and any address completeness rule — despite FR7 making that single address the delivery destination for every order with no per-order override.

**Consequence.** Duplicate emails break login outright. A malformed address cannot be corrected per-order (FR7), and a wrong WhatsApp number breaks the confirmation call, which is the only communication channel in the system (§7).

---

## 5. Cross-cutting

### E37. Place Order has no idempotency guard — CRITICAL

**Scenario.** The parent taps Place Order on a phone (NFR1) against a free-tier host during the six-week burst (§8). Nothing visibly happens for four seconds. They tap again.

**What the PRD says.** FR47 snapshots contents, FR48 assigns "a short sequential identifier," FR49 sets Order Is Placed, FR50 empties the cart. NFR3 requires non-reload interactions, which removes the browser's own resubmit warning. No requirement mentions submit-once semantics, a pending state, or a disabled button.

**What is undefined.** Whether a second submit creates a second order. If FR50's empty is fast enough, the second submit produces an empty order; if not, a full duplicate.

**Consequence.** Two orders, two sequential IDs to read aloud on the call, one confirmation call spent untangling it, and — because FR62 forbids editing a placed order — a mandatory cancellation with a reason the parent will see (FR68) saying, in effect, "you double-tapped." Directly attacks G1 and CM4: the vendor cancelling and re-placing orders is the named signal that the capture flow is producing wrong orders.

### E38. Sequential IDs collide under concurrency and are enumerable — MEDIUM

**Scenario.** Two parents place orders in the same instant. Separately, a parent who received #1042 types #1041 into the URL.

**What the PRD says.** FR48: "Each order is assigned a short sequential identifier, for example `#1042`, chosen so it can be read aloud during the confirmation call." NFR7: "A parent can only ever see their own orders, cart, and profile." The addendum notes the ID is short "because it is read aloud during a phone call."

**What is undefined.** Uniqueness under concurrent placement — a naive max-plus-one collides. And while NFR7 states the access rule, the PRD does not acknowledge that FR48 makes every other order's identifier trivially guessable, so NFR7 must be enforced on every single order route rather than by obscurity.

**Consequence.** Duplicate or skipped order numbers during the only period when concurrent placement is likely, on the identifier the vendor uses as his primary reference. Plus a standing enumeration exposure over families' names, addresses, and phone numbers (§7 identifies these as personal data).

### E39. Session expiry mid-checkout — MEDIUM

**Scenario.** The parent acknowledges FR46's flags, is interrupted, returns twenty minutes later, and taps Place Order.

**What the PRD says.** NFR6: "Authenticated pages are not reachable without a valid session." No session lifetime is specified anywhere. FR4 requires authentication to place an order.

**What is undefined.** Session duration, whether re-login returns the parent to checkout, and whether the FR46 acknowledgement survives. The cart itself survives (FR35, server-side).

**Consequence.** Either the acknowledgement is lost and the parent repeats it, or it is silently retained across a re-authentication and E15's stale-acknowledgement window widens from seconds to hours.

### E40. An order is placed while the admin is mid-edit of the catalog — HIGH

**Scenario.** The admin is rebuilding a pack for the new year: he has removed six titles and not yet added the eight replacements. A parent places an order containing that pack in that window.

**What the PRD says.** FR17: the admin can create, edit, and archive packs "at will." FR47/§6: placement snapshots contents and prices "as they stood at that moment." FR23: edits affect the storefront and future orders only. FR62: "The admin cannot edit the contents of a placed order."

**What is undefined.** Whether catalog edits are atomic or draft-then-publish. The PRD offers no draft state, so every intermediate save is live to the storefront.

**Consequence.** An order permanently snapshotting a half-built pack, uneditable by anyone (FR62), recoverable only by cancelling and asking the parent to re-place. The seasonal pattern in §8 guarantees that heavy catalog editing and heavy ordering happen in the same six weeks.

### E41. NFR8 versus SQLite on an ephemeral free tier — CRITICAL

**Scenario.** The vendor's host restarts, or the developer redeploys a fix mid-season.

**What the PRD says.** NFR8: "Order data must survive restarts and redeployments. **An order lost to a deploy is the exact failure this product exists to prevent.**" §8: "v1 runs on the Bonto free tier." The addendum: "One Node process plus SQLite" and the free tier is "treated as staging that the vendor uses for real work."

**What is undefined.** Whether the free tier provides a persistent volume for the SQLite file, and what the backup and restore procedure is. There is no backup requirement anywhere in the PRD. The addendum's phrase "staging that the vendor uses for real work" names the risk without resolving it.

**Consequence.** If the filesystem is ephemeral, NFR8 is violated by the deployment target chosen in the same document, and the product fails at the one thing G1 exists to guarantee. Even with a persistent volume, a single unbacked-up SQLite file holding a season's orders is one corrupted write from total loss. This must be settled before the first real order, not at the first incident.

### E42. Cold start on the seasonal profile contradicts NFR4 — MEDIUM

**Scenario.** The vendor opens the app at 8am. It has had no traffic overnight.

**What the PRD says.** NFR4: "The admin's open-orders view loads quickly enough to be opened many times a day without friction." §8: the application "will be near-idle for most of its life and then take its entire year's load in a short burst," and "must remain usable when the shop is busy."

**What is undefined.** Free-tier idle-sleep and cold-start behaviour, and any performance target expressed as a number. "Quickly enough" is unfalsifiable at handover.

**Consequence.** The first load of the day — the exact interaction M1 and CM1 hinge on — is the slowest one. A vendor who waits for the daily list is a vendor who starts keeping a paper list beside it.

### E43. FR52's open-orders view has no bound and no staleness marker — MEDIUM

**Scenario.** By season's end the view holds every order that never terminated, including E9's unreachable parents from six weeks ago.

**What the PRD says.** FR52: the home screen lists every non-terminal order "regardless of when it was placed." FR53 groups by status; FR54 shows per-status counts. Q5 asks whether staleness should be flagged and leaves it open.

**What is undefined.** Sorting within a status group, pagination, and any age indicator. Q5 cannot be answered later without the timestamps E10 does not require.

**Consequence.** The screen the product is built around degrades exactly when it matters most, and old stranded orders are indistinguishable from this morning's.

### E44. No terminal-state guard on the parent's own actions after a long absence — LOW

**Scenario.** A parent returns four months later to an order still in Order Is Placed (via E9) and cancels it.

**What the PRD says.** FR67 permits cancellation while the order is Order Is Placed, with no time bound.

**What is undefined.** Whether an aged order can still be parent-cancelled, and whether the admin learns of it (see E8).

**Consequence.** Low impact, but it is the tail of E9: the stranded-order path ends with a silent cancellation the vendor never sees.

---

## Priority resolution list

Settle these before build, in this order. Each is a single sentence in the PRD and a schema decision that is expensive to retrofit.

1. **Concurrency model** (E1, E2, E6, E7, E11, E37, E38): every status write and Place Order is a conditional write on expected current state, with a defined losing-write behaviour. Add to NFR9.
2. **The legal transition table** (E3, E4, E5, E20): enumerate permitted transitions explicitly, resolve whether the Order Confirmed floor is inclusive, and state that Order Confirmed is mandatory on every path to Delivered.
3. **Snapshot completeness** (E12): add delivery address, WhatsApp number, and second phone to §6's snapshot list, or state explicitly that they are live and amend §5's freeze wording to match.
4. **FR46 at book granularity** (E13, E14, E22, E29): rewrite FR46 to cover book-level archival, book-level price change, and pack composition change; define what acknowledgement *does*; state that cart lines record at-add prices.
5. **Catalog write rules** (E16, E17, E21, E23, E40): price validation bounds, money representation, a minimum of one book per publishable pack, and a rule for stale pack-configuration payloads.
6. **Persistence and backup** (E41): resolve the SQLite-on-free-tier question and add a backup requirement. NFR8 is currently a promise with no mechanism.
7. **Identity edge cases** (E34, E35, E36): decide Q1 as a data question, not a UX one; email uniqueness; and whether anonymous pack configuration survives the login gate (Q2).
8. **Status history** (E10, E43): record actor and timestamp on every transition. Q5 depends on it and so does every post-incident investigation.
