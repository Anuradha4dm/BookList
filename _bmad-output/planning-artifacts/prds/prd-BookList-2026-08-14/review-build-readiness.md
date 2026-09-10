---
title: "Build-Readiness Review: Book List PRD"
status: review
created: 2026-08-14
reviewer: senior engineer (implementer perspective)
inputs:
  - prd.md
  - addendum.md
---

# Build-Readiness Review — Book List PRD

## How this review was conducted

I read the PRD and addendum as the sole implementer, with no access to the author, committed to
delivering **the complete v1 scope** described (§Delivery bar: "not a pilot slice"). Every finding
below is a place where I would either stop and wait for an answer, or make a guess that has a
material chance of being wrong.

**Severity key**

- **CRITICAL** — I cannot write the code without an answer. Guessing produces a structurally wrong
  data model, an unsafe state machine, or a broken core promise.
- **HIGH** — I can build something, but there is a strong chance I build the wrong thing and it is
  caught only at handover.
- **MEDIUM** — buildable with a defensible guess; expect rework.
- **LOW** — polish, copy, or presentation detail.

**Verdict up front:** the PRD is unusually strong on *intent*, *pipeline semantics*, and *rejected
alternatives*. It is not buildable as-is. It reads as a well-argued product decision record, not as
an implementable specification: it defines almost no validation rules, no error or empty states, no
concurrency rules, no admin catalog screens, and it leaves two explicitly open questions (Q1, Q4)
that sit directly on the critical path of the data model and the login flow. Roughly **17 CRITICAL**
items would block me on day one.

---

## 1. Summary counts

| Severity | Count |
|---|---|
| CRITICAL | 17 |
| HIGH | 24 |
| MEDIUM | 21 |
| LOW | 9 |

---

## 2. CRITICAL findings — I cannot start without answers

### C1. The pack entity has no name, but two requirements snapshot "the pack name" — FR16, FR18, §6

FR16 defines a pack as "a school, a grade, a short description of what the pack is for, and a set of
books." There is no name field. Yet FR18 says orders "keep their own snapshot of its **name**,
titles, and prices," and §6 says "Placing an order snapshots everything: **pack names**, book
titles…". FR56 requires the admin's order detail to show the lines.

I cannot build the pack table or the order-line snapshot without knowing whether:

- a pack has a first-class `name` the admin types, or
- the "name" is a derived display string (e.g. `"St. Bridget's — Grade 5"`), or
- the "short description" *is* the name.

This is not cosmetic. If the name is derived from school + grade, then the snapshot must freeze the
school and grade **strings** onto the order too (otherwise renaming a school — see C2 — would
retroactively rewrite last season's orders, breaking §6). If it is a typed field, packs need one
more required field with its own validation. Two different schemas.

### C2. Schools and grades can only ever be *added* — FR12, FR13 vs G4

FR12 and FR13 grant "add" only. There is no edit, rename, merge, deactivate, or delete for schools
or grades anywhere in the document, and §10 does not defer it either — it is simply absent.

Consequences I would be shipping deliberately:

- A mistyped school ("St. Josephs" typed once) is **permanently** in the parent-facing dropdown
  (FR24) with no admin remedy. G4 claims the vendor "maintains schools, grades, books, packs, and
  individual items himself" — maintenance that cannot fix a typo is not maintenance.
- Near-duplicate schools accumulate every season ("St. Peter's", "St Peters", "St. Peter's College").
- No uniqueness rule is stated. Can the admin add "Grade 5" twice? Is matching case-sensitive?
  Trimmed? If duplicates are allowed, FR24's grade scoping produces two identical "Grade 5" options
  for one school and the parent picks blind.

I need: full CRUD or add+rename+archive, plus a uniqueness/normalisation rule.

### C3. Is a grade global, or a child of a school? — FR13, FR24, addendum

FR13 says grades are unbounded and admin-typed. FR24 says grade options are "scoped to grades that
actually have packs for the chosen school." The addendum says grades are "admin-managed
enumerations… Grade options are queried scoped to the selected school."

Two incompatible models satisfy that text:

1. `grades` is one global list; the school↔grade relationship exists **only** implicitly through
   packs. Then a grade cannot exist for a school until a pack exists, and FR24's scoping is a join
   through packs.
2. Grades are owned per school (`school_id` on grade). Then the admin maintains grades per school
   and FR24's scoping is a direct lookup.

Model 1 means the admin can never pre-configure a school's grades; model 2 means "Grade 5" is
re-typed for every school. I cannot pick this on the developer's own authority — it changes the
admin UI, the schema, and every catalog query.

### C4. Archiving or removing a book that a live pack contains is undefined — FR15, FR21, FR46

FR15 makes books shared. FR21 (itself an `[ASSUMPTION]`, and Q4 is explicitly **open**) allows books
to be archived. Nothing states what happens when an archived book is still referenced by a
**non-archived** pack that is live on the storefront:

- Does the pack still display the archived title (FR26 says "every book in it")?
- Does the title silently vanish from the pack, changing what the parent believes the school
  prescribed?
- Is the admin blocked from archiving a book that is in use, or warned, or neither?
- If the archived title was the pack's only remaining book, FR26/FR28 (all pre-selected, last title
  locked) have no defined behaviour at all.

The same hole exists for the admin **removing** a book from a pack, or **adding** one, after a
parent has already put that pack in the cart. FR46 flags only "any **pack or item** … archived, or
… price changed" — it says nothing about the pack's *composition* changing or a *constituent book*
being archived or repriced. This is the single most common real-world catalog edit (the vendor
corrects a school's list mid-season), and it has no specified behaviour at checkout, in the cart, or
on the pack screen.

Q4 being unresolved makes this worse: I do not even know whether book archiving exists.

### C5. The delivery address is live-referenced, which breaks the freeze — FR5, FR7, FR56, §5, §6

FR7: the account address "is the delivery address for every order they place." FR5: the parent can
edit that address at any time. §6's snapshot list is explicit and **does not include the delivery
address, name, or phone numbers** — it lists pack names, book titles, item titles, unit prices, and
quantities.

Therefore, as written, a parent who moves house and edits their profile silently rewrites the
delivery address of every order they have ever placed, including **Order Confirmed** orders that §5
declares frozen ("Once an order is confirmed, nothing about it changes") and **Delivered** orders
that are supposed to be historical record. FR56 requires the admin to see "delivery address" on the
order detail without saying whether it is live or snapshotted.

This is a direct requirement conflict on the product's core promise. I need an explicit rule:
snapshot address/name/phones at placement (and then FR5 edits do *not* affect open orders — which
the vendor may hate, because a parent correcting a wrong address before delivery is a real case), or
live-reference them (and then §5's freeze is false). Pick one and say so.

### C6. Parent self-cancel contradicts the transition rules, and the race is undefined — FR67, §5

§5 Transition rules: "**Only the admin advances status.**" §5 Failure terminal: "Cancelled — set by
the admin." FR67: "The parent can cancel their own order while it is still Order Is Placed."

Beyond the flat contradiction, the boundary is unspecified and highly likely in practice, because
the vendor is on the phone with the parent at exactly this moment:

- Parent taps Cancel at the same instant the admin submits Order Confirmed (FR57). Who wins? Is the
  transition guarded by an expected-current-status check, or last-write-wins?
- If the admin wins, the parent's cancel must fail — with what message?
- FR60 requires "a short reason" to cancel; FR68 shows the parent "the reason given." A
  parent-initiated cancel has no author-defined reason. Is a reason required from the parent? Is a
  system reason written ("Cancelled by parent")? What does FR68 display when the reason is empty?
- A parent-cancelled order disappears from the admin's open-orders view (FR52) with **no
  notification** (§10, §5). The vendor may call about an order that no longer exists.

### C7. Duplicate order submission has no defined behaviour — FR47, FR48, FR49, FR50

Nothing in §4.6 mentions idempotency, and this flow is the highest-stakes double-tap in the app:
mobile-first (NFR1), on a possibly slow free-tier host (§8), with a button that empties the cart
(FR50). Undefined:

- Double-tap Place Order → two orders with identical contents and two sequential IDs? CM4 names
  "cancels and re-places orders frequently" as a failure signal; I would be building the cause.
- Second submit after the cart is emptied → an empty order, an error, or a redirect to the placed
  order?
- Browser back into checkout after placement, then submit again.

I need an idempotency rule (single-use checkout token, or server-side "reject if cart empty",
or both) stated as a requirement, since NFR9's server-side enforcement list does not include it.

### C8. Sequential order IDs have no allocation rule — FR48

"A short sequential identifier, for example `#1042`." Unspecified: starting value (does the example
imply a 1000 offset, chosen so IDs are uniformly 4 digits when read aloud?), whether it resets per
season/year, whether gaps are acceptable, whether it is the primary key or a separate human-facing
number, and how it is allocated under concurrent placement. During the six-week burst (§8),
simultaneous placement is a real event. The answer also determines whether the ID is safe to expose
in URLs (NFR7 — a parent guessing `#1041` must be denied, and that rule is nowhere stated).

### C9. FR46's "acknowledge the change" is undefined as a behaviour — FR46

"Checkout flags the affected lines and the parent must acknowledge the change before placing.
Nothing is silently substituted or silently repriced."

I cannot implement "acknowledge" from this. Open:

- Does acknowledging an **archived** pack let the parent order it anyway? If yes, archiving no longer
  prevents sale (contradicting FR18's purpose). If no, the line must be removed — by the parent or
  automatically? — and if it was the only line, checkout now has an empty cart with no defined state.
- Does the flag apply to price **decreases** as well as increases?
- Is acknowledgement recorded on the order (evidence for the confirmation call) or transient?
- If the catalog changes *again* between the acknowledgement and the submit, does the check re-run?
  (Without this, acknowledgement is a TOCTOU hole and the "nothing is silently repriced" guarantee
  is false.)
- Does the cart screen (FR41) also show these flags, or only checkout?

### C10. Q1 is unresolved and it blocks the login flow — FR10, §7, Q1

FR10 removes password reset; §7 states a parent "cannot self-recover"; Q1 asks whether the admin
gets a reset control or the parent re-registers — "Unresolved, and likely to occur in the first
season."

This is not a deferrable question, because the two options are different builds:

- **Admin reset control** = a new admin screen, a parent lookup (which does not exist anywhere — see
  H12), a temporary-password mechanism with no channel to deliver it except the vendor's voice, and a
  forced-change-on-next-login flow.
- **Re-registration** = the email uniqueness rule must permit it, or the parent is hard-locked out
  because FR1 registration will collide on their existing email. And re-registration orphans the
  parent's order history (FR63), so the vendor loses the record that G1 exists to protect.

FR4 makes authentication mandatory to order, so lockout is a total loss of the customer for the
season. I would be building the flow that decides that, blind.

### C11. Admin credential seeding conflicts with the admin's own password change — FR8, FR9, §7

FR8: the admin account "is seeded at deployment from configuration." FR9: the admin can change their
own password in-app. §7: recovery for a forgotten admin password "means redeploying with a new
seeded credential."

These three cannot all hold unless the seeding rule is specified. If seeding is
create-if-absent-only, then the §7 recovery path **does not work** (a redeploy will not overwrite the
existing row). If seeding overwrites on every deploy, then FR9's in-app change is silently reverted
by the next deploy — and §8 anticipates redeploys. I need the exact rule, plus what configuration
keys exist and what happens if they are missing at boot.

### C12. NFR8 (durability) versus SQLite on the Bonto free tier — NFR8, §8, addendum

NFR8: "Order data must survive restarts and redeployments. An order lost to a deploy is the exact
failure this product exists to prevent." The addendum fixes the stack: "One Node process plus
SQLite," on the free tier, "treated as staging that the vendor uses for real work."

A single SQLite file is only as durable as the filesystem it sits on, and free tiers routinely
provide ephemeral disks and idle-sleep container recycling. The PRD asserts the strongest possible
durability requirement while the addendum selects a deployment that may not provide it, and **no
backup, export, or persistent-volume requirement appears anywhere in the document.** There is also
no data-retention or restore requirement despite §7's personal data.

I cannot resolve this by guessing. I need: confirmation of a persistent volume on the chosen tier,
and a stated backup/restore requirement (frequency, destination, who runs it) — noting that "no
outbound anything" (§7, addendum) rules out emailing a backup out.

### C13. Duplicate individual-item adds defeat the quantity cap — FR34, FR37, NFR9

FR37 establishes that pack lines "never merge into one another" — deliberately, for the second-child
flow. §4.4 says nothing about item lines. So either items merge (undefined behaviour: does the
quantity add up, and what happens when 15 + 10 exceeds the 20 cap?) or they do not, in which case a
parent trivially reaches an effective quantity of 40+ for one item by adding it twice. NFR9 demands
the quantity cap be "enforced server-side," which is meaningless if the cap is per line and lines are
unlimited.

Related and equally undefined: is there any cap on the number of cart lines?

### C14. Whether the order records the *unticked* titles is unstated — §6, FR47, FR56

§6 snapshots "book titles… and quantities as they stood at that moment" and says "unticked pack
titles contribute nothing" to the goods total. FR56 says the admin sees "every line with its snapshot
titles, quantities and prices."

Does the order store only the *selected* titles, or the full pack composition with a selected flag?
This is a schema decision I cannot reverse cheaply, and the operational value differs sharply: the
whole product thesis (§1) is per-title subtraction from a *named school's list*, so the vendor
picking the order may well need to see "parent dropped 3 of 12 titles" to sanity-check against the
school list on the phone. FR56's "every line with its snapshot titles" can be read either way.

### C15. Concurrency on the cart is entirely undefined — FR35, addendum

FR35 makes the cart server-persisted and explicitly cross-device ("a cart built on a phone is still
there on a laptop"), which guarantees two clients will hold stale views of the same cart. No rule
exists for: simultaneous quantity edits, removing a line another tab is editing, or one device
placing the order while the other is on the checkout screen (the second device then submits an
emptied cart — see C7). Last-write-wins is a choice, not a default I should make silently.

### C16. The admin catalog screens are never specified — FR12–FR23

FR12–FR23 imply five maintained entities (schools, grades, books, packs, individual items), each
needing at minimum a list, a create form, an edit form, an archive action, and validation. The PRD
specifies **none** of these screens, and the addendum states "Admin home is the open-orders
view… not the catalog," so I do not even know how the admin navigates to catalog management. Nothing
defines pack composition UI (how the admin picks books from a master that may hold hundreds of
records, with no search — §10 defers search), list ordering, pagination, or whether archived records
are visible to the admin at all. Given the delivery bar ("complete scope, live and usable"), this is
a large unspecified surface, not a detail.

### C17. Unarchive does not exist — FR17, FR18, FR21

FR17 grants "create, edit, and archive." Nothing grants restore. Archiving is described as reversible
in spirit ("hides it from the storefront but does not delete it"), and a mis-tapped archive at the
start of the season removes a school's pack from sale with no admin remedy — while C2 means the
admin cannot even rebuild it cleanly under the same school if a typo is involved. I need to know
whether unarchive exists, because it also determines whether archived records appear in admin lists.

---

## 3. HIGH findings — I will build it wrong

### H1. FR1 has no validation rules at all
"Name, delivery address, WhatsApp number, email, and password" with no field lengths, formats, or
required/optional beyond the second phone. Specifically unknown:

- **WhatsApp number**: local `07XXXXXXXX` or E.164 `+94…`? Is it normalised? Must it be unique
  across accounts (two parents, one household phone)? Is it validated as Sri Lankan? FR11 and the
  delivery partner handoff (§2) depend on it being dialable, so a bad format is an operational failure.
- **Password policy**: minimum length, complexity, maximum. With no reset path (FR10), a weak
  password rule is the one thing standing between the vendor and a lockout call.
- **Email**: uniqueness (see C10), case normalisation, and — since the app sends no mail (§7) —
  it is a permanently **unverified** identifier used as the sole login identity (FR2).
- **Delivery address**: one free-text block, or structured lines/city/district? Length cap? It is
  printed for a delivery partner, so this matters.

A tester cannot write a single pass/fail case for FR1 as written.

### H2. Login has no protection or session policy — FR2, NFR6
No rate limiting, no lockout, no failed-attempt handling, and NFR6 says only that authenticated
pages need "a valid session" without defining session lifetime, idle timeout, remember-me, or
whether sessions survive a redeploy (they will not, if in-memory — which collides with NFR8's spirit
and with C12's single-process stack).

### H3. Session expiry mid-flow is undefined — FR4, FR35, NFR6
The parent spends real time on the pack screen ticking titles. If the session expires between
opening the pack and adding to cart, or between checkout and Place Order, the specified behaviour is
nothing at all. Is the pack configuration preserved through re-login? Is the parent returned to
checkout, or dumped at the storefront root having lost the configuration? Given FR40 (ticks are not
editable in the cart), losing a configuration means redoing the entire pack.

### H4. The anonymous-browse-to-login handoff is unspecified, and Q2 is open — FR3, Q2
FR3 is an `[ASSUMPTION]`; Q2 asks the same question and is unresolved. Even granting FR3, the
critical path is undefined: an anonymous parent unticks 6 of 14 titles, sets quantities, taps Add to
Cart, and hits the login gate. Is that configuration carried through login? Through
**registration** (which is longer — FR1 asks for five fields)? Or discarded? Discarding it at the
exact moment of conversion is the most damaging possible answer and is what I would build by default.

### H5. Books have no identity beyond a title — FR14, FR15, §1
§1 insists the domain is "specific editions" ("A pack is not 'Grade 5' — it is a named school's list
of specific editions"), and the addendum's differentiator is per-title precision. But FR14 gives a
book record only a title and a price — no author, publisher, edition, year, or ISBN. Two different
editions of "Mathematics Grade 5" are indistinguishable to the parent on the pack screen, to the
admin in the book master (with no search — §10), and on the order snapshot. There is also no
uniqueness rule, so the master will accumulate duplicate titles, directly undermining FR15's promise
that "a title appearing in three schools' lists is one record."

### H6. Money has no defined representation or validation — FR14, FR19, FR57, §6
No currency is named anywhere (the addendum implies LKR), no decimal precision, no rounding rule for
the goods total, no minimum or maximum, and no statement whether zero or negative is allowed. FR57
makes the delivery price required to confirm but never says it must be positive — is free delivery
(0) legal? Is 999999 legal? NFR9 demands server-side enforcement of "the required delivery price"
without saying what valid means. Display formatting (symbol, thousands separator) is also unstated
though it appears on every screen.

### H7. Pack uniqueness per school+grade is unstated — FR16, FR17, FR24
FR17 says "a new school year means a new pack," which produces multiple packs for the same
school+grade over time. Nothing says the old one must be archived, and nothing prevents two
**active** packs for one school+grade. If two exist, FR24's result list shows two entries
distinguished only by FR16's "short description," with no year, no created date, and no name (C1).
The parent picks the wrong year's list — precisely the failure G1 exists to prevent.

### H8. An empty pack is not prevented — FR16, FR26, FR28
FR16 does not require a pack to contain at least one book. A zero-book pack breaks FR26 ("displays
every book in it"), FR28 (the last-title lock has nothing to lock), FR32 (add a configured pack with
nothing in it), and produces a zero-value order line. Is an empty pack blocked at save, or hidden
from the storefront, or publishable?

### H9. Packs cannot express a required quantity — FR16, FR29
Every ticked title "starts at quantity 1" (FR29) and the pack is only a "set of books" (FR16). Real
school lists prescribe quantities ("4 exercise books"). If the admin cannot set a default quantity,
the parent must know to step it up, and the vendor discovers the shortfall on the call — undermining
G2/M4. If the admin *can*, FR16 needs a quantity on the pack-book relation and FR29 is wrong. Also
undefined: may a pack contain the same book twice?

### H10. FR31 and FR40 conflict inside the cart — FR31, FR40
FR31: minus at quantity 1 unticks the title. FR40 (`[ASSUMPTION]`, and Q3 is open): quantities are
adjustable in the cart but ticks are not. So what does minus at quantity 1 do **in the cart**? It
cannot untick (FR40 forbids it), so it must be disabled — which means the cart's stepper behaves
differently from the pack screen's stepper for the same control. That divergence needs stating, or I
will implement one component and break one of the two requirements.

### H11. FR59's transition legality is unspecified — FR59, §5
"The admin can move an order forward or backward between non-terminal statuses." Can he skip
statuses (Order Confirmed → Ready To Deliver, bypassing Processing and Packing)? Can he jump
backward more than one step? Is any non-terminal→non-terminal transition legal except returning to
Order Is Placed? This is the core state machine and it is stated as freeform movement with a single
floor. NFR9 does not list transition legality among the server-enforced rules, which reads as
"client-side only" — unacceptable for the mechanism the whole product rests on.

### H12. The admin cannot find an order — FR48, FR52, FR55, §10
FR48's entire justification is that the order ID is read aloud on the phone. But the admin has only
two list views (FR52 open orders, FR55 completed) and **no lookup by order ID, parent name, or phone
number**, and §10 defers search. When a parent rings about `#1042` (which they will — CM2 is a
counter-metric, not an impossibility, and C10's locked-out parents *must* ring), the admin scrolls.
For the completed view (FR55), which grows for the life of the shop, scrolling is not a workaround.

### H13. Order timestamps and status history are never required — FR52, FR56, FR66, M2, Q5
FR52 references "an order placed three days ago," so a placement timestamp exists implicitly, but no
requirement states that any date is stored or displayed, on either side. FR66 says the parent "sees
the order's position in the pipeline" without saying whether they see *when* each step happened. Q5
(stale-order flagging) cannot be answered later without per-status timestamps in the schema, and
M2/G3 ("every order reaches a terminal state") is unobservable without them. Also unstated: is there
any audit trail of who changed what (relevant to §7's single shared admin account)?

### H14. Status-change concurrency and stale views — FR52, FR57, FR59, NFR3
The admin's open-orders view is the screen "most likely to be opened repeatedly under time pressure"
(§8) and NFR3 wants app-like interactions. Nothing defines behaviour when the admin acts on a stale
list — e.g. taps Confirm on an order the parent cancelled a minute ago (C6), or advances an order
from a tab opened an hour earlier. Without an expected-current-status guard, backward transitions
will happen by accident, and the freeze at Order Confirmed can be crossed.

### H15. NFR2 "richly animated" is not testable — NFR2, addendum
This is stated as a hard requirement covering both interfaces ("the vendor gets the same quality of
interface as the parent") with no examples, no inventory of which interactions are animated, and no
acceptance criterion. At handover, "richly animated" is whatever the author imagined and I did not.
It is also in tension with NFR4/NFR5 (speed and responsiveness under long lists) and with the
mobile-first free-tier context, with no stated priority when they conflict.

### H16. NFR4 and NFR5 have no numbers — NFR4, NFR5
"Loads quickly enough to be opened many times a day" and "stay responsive with a realistically long
book list" cannot be tested. I need a target (e.g. p95 under N ms) and a size for "realistically
long" (30 titles? 300?), plus an expected order volume for the six-week burst (§8) — the only sizing
hint in the entire document is "four awaiting confirmation and two ready to deliver" (FR54).

### H17. NFR9's enumeration implies everything else is client-side — NFR9
NFR9 names exactly three server-enforced rules (quantity caps, locked last title, required delivery
price). By omission it excludes: the last-title rule's server counterpart at add-to-cart, FR67's
cancel window, FR59/§5 transition legality, FR46's acknowledgement, FR62's contents lock, FR4's
authentication on placement, and NFR7's ownership checks. I will not guess which omissions are
intentional; state that all state-changing rules are server-enforced.

### H18. NFR7's enforcement and failure mode are unstated — NFR7, FR63, FR64
"A parent can only ever see their own orders, cart, and profile" — but with short sequential IDs
(C8/FR48), enumeration is trivial. Is the response 404 or 403? Does the same rule cover the admin's
routes (a logged-in parent hitting an admin URL)? Is there any object-level check on cart-line
mutation (parent A editing parent B's line id)?

### H19. Zero-catalog and zero-result states are undefined — FR24, FR33
On day one the catalog is empty. FR24 has the parent select a school from a dropdown with no schools
in it. FR33 has them browse an empty items catalog. FR24 promises the parent "cannot select a
combination with no results" — but that promise covers only grades; a school with **zero packs** is
still selectable, so the zero-results state it claims to prevent is reachable and undefined. Are
schools with no active packs filtered out of the dropdown? (That is a different query, and it
interacts with archiving: archiving a school's last pack must remove the school from the dropdown.)

### H20. Archived-pack reachability is undefined — FR18, FR26
"Hides it from the storefront" — but what happens to a direct URL to an archived pack (bookmarked,
or shared between parents at the same school, which is exactly how school lists circulate)? 404, a
"no longer available" state, or still viewable but not addable? And what does the parent see when
opening a cart line whose pack has been archived (FR46 flags it at checkout, but the cart is a
different screen)?

### H21. Out-of-scope search is a dependency of in-scope admin work — §10, FR16, FR14, H12
"Free-text or smart search" is deferred as a *storefront* concern, but two in-scope admin tasks
depend on finding records in an unbounded list with no search: composing a pack from the book master
(FR16, potentially hundreds of title-only records — H5), and finding an order by the ID read aloud
on the phone (H12). Either the deferral is narrower than §10 states, or these admin flows do not
work at season scale.

### H22. Out-of-scope notifications are a dependency of FR46/FR68 and G2 — §10, FR66, FR68, G2
The zero-messaging decision is coherent for order *placement* (the vendor checks daily). It is not
coherent for the parent side: when the admin cancels (FR68) or confirms with a delivery price
(FR58), the parent learns only by logging in unprompted. G2 says "the parent never has to phone the
shop to learn the price," but the app gives them no reason to come back and look. Nothing in the PRD
resolves how the parent learns the price — except the vendor's confirmation call, which then
*remains* the mechanism, making FR58/FR64/FR65 supporting evidence rather than the delivery channel.
That is defensible, but it should be stated, because it changes what "done" means for FR66.

### H23. FR41's total does not say what it includes when lines are stale — FR41, FR46
The cart shows "a running goods total, calculated per §6." If a book's price changed after the line
was created, is the cart total computed at the **current** price or the **added-at** price? FR46
implies the system knows both. §6 does not say which one the cart displays. Getting this wrong means
the number the parent sees at the cart differs from checkout for reasons they cannot see.

### H24. Nothing defines what happens after placement — FR47–FR50
There is no post-placement confirmation screen requirement: no statement that the parent is shown
the new order ID (FR48's read-aloud identifier), the goods total, or the "delivery to be confirmed"
notice (FR65 covers order detail, not a receipt moment). Given the cart is emptied (FR50), the
parent needs an unambiguous "this exists, here is its number" moment — the whole of G1/G2 depends on
the parent believing the order landed.

---

## 4. MEDIUM findings — expect rework

- **M-1. No logout requirement exists anywhere** (§4.1). Neither role has a specified sign-out. On a
  shared family phone this matters, and NFR7 assumes sessions are bounded.
- **M-2. Empty-cart state undefined** (FR35, FR41). What the cart shows when empty, and whether
  checkout is reachable with an empty cart (server-side).
- **M-3. Cart line removal has no confirmation or undo rule** (FR39), though a removed pack line
  costs the parent the entire tick/quantity configuration (FR40).
- **M-4. Order note has no constraints** (FR45): length cap, newlines, and how it is rendered to the
  admin (escaping). "One optional free-text note" is otherwise untestable at boundaries.
- **M-5. Cancellation reason has no constraints** (FR60): "a short reason" — minimum length (is a
  single space enough?), maximum, or a picklist. A tester cannot write the negative case.
- **M-6. Where the pack headline price is shown is not a requirement** (§6: "where shown"). It is
  either on the pack list, the pack detail, both, or nowhere. Also undefined whether the "all-titles
  preview" updates live as titles are unticked (§6 says it "does not survive" unticking — meaning it
  disappears, or is replaced by the live total?).
- **M-7. Item catalog presentation undefined** (FR33): ordering, grouping/categories, pagination, and
  whether descriptions are truncated. "Independently of any school or pack" is the only guidance.
- **M-8. List ordering and pagination undefined everywhere**: FR52 (within status groups), FR55
  (completed orders, unbounded growth), FR63 (parent's orders), plus all admin catalog lists (C16).
- **M-9. FR53's "pipeline order" is clear but FR54's counts are not scoped**: does the count row show
  all seven statuses including zero-count ones, or only non-empty ones? Does it include terminal
  statuses (it should not, per FR52)?
- **M-10. FR52's "regardless of when it was placed" plus Q5** means the open list grows without a
  stale signal; Q5 is open and its answer changes both schema (H13) and this screen.
- **M-11. Timezone and date formatting unstated** (implicitly Asia/Colombo). Relevant to H13 and to
  "daily" checking (§8).
- **M-12. Language and locale unstated.** English-only is a fair guess for the segment, but it is a
  guess, and it affects every string.
- **M-13. Browser and device support unstated** (NFR1 "mobile-first" only). No minimum viewport, no
  browser matrix — so "works on mobile" is untestable.
- **M-14. Accessibility is entirely absent.** The signature interaction is a dense checkbox+stepper
  list (FR26–FR31); keyboard/screen-reader/target-size expectations are unstated, and NFR2's rich
  animation raises a reduced-motion question with no answer.
- **M-15. No server-error, offline, or not-found states are specified** for either interface, despite
  a free-tier host that may cold-start (§8).
- **M-16. FR32's post-add behaviour undefined**: stay on the pack, navigate to the cart, or show a
  toast — and whether the pack screen resets to all-ticked afterwards (which matters for the
  second-child flow: adding the same pack twice with different ticks, FR37).
- **M-17. FR30's "visibly communicated" cap has no copy or mechanism** (tooltip, inline text,
  toast). Same for FR28's locked checkbox explanation (addendum calls both out as needing "visible
  explanation," still without specifying it).
- **M-18. Second-child flow has no labelling** (FR37, FR45). Two identical pack lines are
  distinguishable only by their tick sets, and the order carries one note for the whole order. The
  vendor packing two children's books has nothing to separate them by.
- **M-19. Profile edit validation and confirmation** (FR5, FR6): re-authentication before a password
  change? Current-password required? Same policy questions as H1.
- **M-20. No account deletion or data-retention rule** (§7), despite explicitly acknowledging that
  the app stores families' personal data.
- **M-21. FR23 vs FR46 wording**: FR23 says edits affect "the storefront and future orders only,"
  but FR46 makes a *pending cart* a third case. FR23 should name it, or a reader will implement
  cart lines as live-referencing the catalog (which is in fact what FR46's detection needs — see the
  addendum's "stale-cart detection" — meaning cart lines store an added-at price *and* a live
  reference; that duality is never stated as a data-model requirement).

---

## 5. LOW findings

- **L-1.** No currency symbol or number-format convention specified for display (H6 covers the
  storage side).
- **L-2.** FR54's example ("four awaiting confirmation and two ready to deliver") implies label copy
  that differs from the status names in §5 ("Order Confirmed", "Ready To Deliver"). Which strings are
  canonical on screen?
- **L-3.** Status names are title-cased inconsistently across §4.7 and §5 ("Order Is Placed",
  "Packing The Order"); the exact display strings should be fixed once.
- **L-4.** No favicon/branding/shop-name requirement, though the app is customer-facing for one
  named shop.
- **L-5.** No terms/privacy/refund pages in v1 — fine for v1, but the addendum notes PayHere
  *requires* them for the deferred payment cycle; worth a placeholder decision now.
- **L-6.** FR11's "fallback contact" has no presentation requirement beyond being present on the
  order (FR56 already covers it) — the two requirements overlap.
- **L-7.** No requirement that the parent can see their own registered email/profile read-back
  (FR5 covers editing only).
- **L-8.** "Institute" (FR12) is introduced as a synonym for school and never used again; pick one
  term for the UI.
- **L-9.** No stated behaviour for very long strings in the UI (school names, book titles) on a
  mobile-first layout.

---

## 6. Requirement conflicts, consolidated

| # | Conflict | Requirements | Severity |
|---|---|---|---|
| 1 | Profile address edits mutate frozen/delivered orders | FR5, FR7, §5 freeze, §6 snapshot list | CRITICAL |
| 2 | Parent cancels, but "only the admin advances status" | FR67 vs §5 transition rules | CRITICAL |
| 3 | Admin password change vs redeploy seeding as recovery | FR8, FR9, §7 | CRITICAL |
| 4 | Absolute durability promise vs free-tier SQLite, no backup requirement | NFR8 vs §8, addendum | CRITICAL |
| 5 | Per-line quantity cap vs unlimited duplicate item lines | FR34, FR37, NFR9 | CRITICAL |
| 6 | Stepper minus behaviour differs on pack screen vs cart | FR31 vs FR40 | HIGH |
| 7 | "Specific editions" thesis vs title-and-price-only book records | §1, FR15 vs FR14 | HIGH |
| 8 | "Cannot select a combination with no results" vs unfiltered school dropdown | FR24 (internal) | HIGH |
| 9 | Rich animation everywhere vs speed/responsiveness bars on a free tier | NFR2 vs NFR4, NFR5, §8 | HIGH |
| 10 | Search deferred vs admin needing to find books and orders | §10 vs FR16, FR48 | HIGH |
| 11 | Parent must not need to phone for price vs no outbound messaging | G2/M4 vs §7, §10 | HIGH |
| 12 | Archiving prevents sale vs FR46 acknowledgement possibly permitting it | FR18 vs FR46 | CRITICAL (see C9) |

---

## 7. Out-of-scope items that in-scope requirements depend on

1. **Password-reset email** (§10) — FR4 makes login mandatory to order; FR10/§7/Q1 leave lockout
   unresolved. In-scope ordering depends on some recovery mechanism existing. **CRITICAL.**
2. **Free-text search** (§10) — needed by FR16 (pack composition from an unbounded book master) and
   by the admin's order lookup implied by FR48's read-aloud ID. **HIGH.**
3. **Any notification** (§10) — FR58/FR64/FR65/FR66/FR68 all deliver information to a parent who has
   no trigger to return. **HIGH.**
4. **Custom domain / always-on hosting** (§10, §8) — NFR8's durability and NFR4's responsiveness are
   asserted against a tier chosen partly because it is free. **CRITICAL (C12).**
5. **Stock/inventory** (§10) — acceptable: the confirmation call plus FR60 cancellation absorbs it.
   No action, but note that FR60's reason field is now carrying inventory semantics with no
   structure (M-5).
6. **Additional admin accounts** (§10) — acceptable, but combined with §7's single shared credential
   and no audit trail (H13) there is no way to attribute a wrong cancellation.

---

## 8. Requirements a tester cannot write a pass/fail test for

FR1 (validation rules), FR12/FR13 (uniqueness), FR16 (name, minimum books), FR24 (zero-pack
schools), FR26 (what is displayed per book), FR30 ("visibly communicated"), FR28 (locked-checkbox
explanation), FR33 (presentation), FR40 (cart stepper at 1), FR41 (which price), FR45 (limits), FR46
("acknowledge"), FR48 (allocation), FR52/FR55/FR63 (ordering), FR54 (which statuses counted), FR56
(live vs snapshot contact data), FR57 (valid delivery price), FR59 (legal transitions), FR60 ("short
reason"), FR66 ("sees position as the admin advances it" — live or on refresh), FR68 (reason for a
parent-initiated cancel), M1 ("immediately"), NFR2, NFR3 ("modern application"), NFR4, NFR5, NFR6
("current standard", session policy), NFR8 (no backup/restore criterion), CM3 (explicitly no
threshold).

---

## 9. Minimum set of answers I need to start

Ordered by what unblocks the most work:

1. **Pack identity** (C1) and **grade ownership** (C3) — unblocks the entire schema.
2. **Snapshot boundary**: exactly which fields freeze at placement, including address, name, phones,
   school/grade strings, and unticked titles (C5, C14).
3. **Catalog lifecycle matrix**: for schools, grades, books, items, packs — which of
   add/edit/rename/archive/unarchive/delete exist, plus uniqueness rules, plus what happens when an
   archived record is still referenced by an active pack or a live cart line (C2, C4, C17).
4. **Q1 answered** (C10) and the **admin seeding rule** (C11).
5. **State machine table**: allowed transitions, who may perform each, and the guard on stale
   transitions, including the parent-cancel race (C6, H11, H14).
6. **Checkout contract**: idempotency, FR46 acknowledgement semantics including the archived case and
   the empty-cart-after-removal case, and order-number allocation (C7, C8, C9).
7. **Persistence and backup** on the chosen tier (C12).
8. **Validation table** for every input field with types, ranges, and failure messages (H1, H6, M-4,
   M-5).
9. **Numbers for NFR4/NFR5** and an inventory of what NFR2 "richly animated" means concretely (H15,
   H16).
10. **A screen inventory** covering admin catalog CRUD and every empty, error, first-run, and
    zero-result state (C16, H19, M-15).

---

## 10. What the PRD does well

Worth preserving verbatim into downstream docs: the status pipeline and its freeze semantics
(§5) including the explicitly *accepted* consequence of an uncorrectable delivery charge; the total
snapshot rule (§6); the cart-lines-never-merge decision (FR37) with its stated rationale; the
separation of the book master from individual items (FR20); and the rejected-alternatives log in the
addendum. Those are the parts of this document that read like they were written by someone who will
have to live with the answer.
