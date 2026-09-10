---
title: "PRD: Book List"
status: final
created: 2026-08-14
updated: 2026-08-14
---

# PRD: Book List

## 1. Context and Goals

Book List is a commissioned web application, built to the requirements of one bookshop owner who supplies private-school book lists. It is not a product for other bookshops, and it is not trying to beat other bookshop websites.

**It is an order trap, not a bookstore.** Everything in this document serves the capture and survival of orders the vendor has already won. Anything that would make it a better shop but not a better trap is out.

The shop takes book-list orders by phone. At the start of the school year that work arrives in a rush: parents read out a school list, ask to drop a title they already own, and sometimes order for a second child in the same call. Some of those orders never make it onto a list the shop can work. The vendor's problem is not selling more books. It is losing orders that were already agreed.

Phone is a poor capture tool for this job. A pack is not "Grade 5" — it is a named school's list of specific editions, and the parent needs to subtract titles and change quantities. A spoken list is easy to mis-hear and a photographed list on WhatsApp is easy to lose in the thread.

The online options in this market do not close the gap either, and the difference is the whole point of the commission. Fixed per-grade bundles cannot be unticked, so a parent who already owns three of the titles must buy them again. Photo-or-PDF booklist upload hands the interpretation work straight back to the shop, which is the work the vendor is trying to stop doing. **Per-title customisation is the differentiator — not booklist ordering itself.**

**Packs are the main job.** Individual items are a real but secondary catalog; the product exists for the school packs.

The application does not replace the vendor's confirmation call. It makes that call the only call.

### Goals

- **G1.** No agreed order is lost between the parent placing it and the shop working it.
- **G2.** The parent never has to phone the shop to learn the price or to check that the order exists.
- **G3.** Every order reaches a terminal state. Nothing sits in the middle without a decision.
- **G4.** The vendor maintains schools, grades, books, packs, and individual items himself, without a deploy.

### Non-goals

- Selling more books.
- Serving bookshops other than this customer.
- Replacing the vendor's confirmation call.
- Taking payment online in v1.
- Government-school stationery packs, which are a different job for a different buyer.
- Measuring or diagnosing lost orders — the vendor wants the orders in a list, not a forensic leak-hunt.

### Delivery bar

v1 is handed over as the complete scope described in this document, live and usable — not a pilot slice. §12 defines the sanctioned cut line if the build runs long.

## 2. Users and Roles

**The parent.** A private-school family buying this year's prescribed editions, or buying only stationery from the same shop. They need to find their own school's pack, drop titles they already own, adjust quantities, and order for more than one child without the second list overwriting the first. They self-register and manage their own account.

**The admin.** The vendor, and the only operator. One account, no staff roles. He works from a daily view of open orders — his "today list" — calls each parent once to communicate the final price, and advances every order to Delivered or Cancelled. He maintains the entire catalog himself.

**The delivery partner.** Not a user of the application and has no login. They receive the parent's WhatsApp number from the shop, deliver, collect cash, and report drop-off back to the admin, who then marks the order Delivered.

## 3. User Journeys

Captured from the vendor's described way of working. Correct these if the shape is wrong.

### UJ-1: Nimali orders for two children

Nimali has two children at the same private school, in different grades, and the term starts in three weeks. She opens the site on her phone in the evening, registers with her name, address, and WhatsApp number, and selects her school from the dropdown.

She filters to her elder child's grade and opens the pack. Every title is already ticked. She unticks the two she bought last year and still has on the shelf, and bumps the atlas to two copies because the younger one will need it as well. She adds the pack to her cart.

Then she goes back, switches the grade filter, and opens the younger child's pack. This is the moment the phone used to fail: she adds a second pack, and it arrives in the cart as its own line with its own ticks, leaving the first untouched. She adds a pack of pens from the items page.

At checkout she sees the goods total and a clear line saying the delivery charge will be confirmed by the shop. Her address is shown, and she adds a note asking for delivery after five. She places the order and gets a short order number.

The next morning the shop calls once. The vendor reads back her order number, tells her the total including delivery, and she agrees. She never rings the shop, and she watches the order move through the pipeline until it arrives at her door, where she pays cash.

### UJ-2: The vendor's daily pass

The vendor opens the app with his morning tea. The first thing he sees is a count: four orders awaiting confirmation, two ready to deliver, one on the partner.

He works the four. For each, he opens the order, sees the parent's name, WhatsApp number, and everything they selected, and calls. One does not answer, so he marks the call attempted and moves on rather than losing track of who he has spoken to. The other three agree, and for each he types the delivery price and sets Order Confirmed.

He packs the confirmed ones, advancing them as he goes. When the delivery partner reports last night's drop-off, he marks that order Delivered and it leaves his list. Nothing is written on paper.

## 4. Success Metrics

The primary signal is the vendor logging in each day and immediately seeing what needs work. All metrics below are observable from the application itself or from the vendor's own behaviour; v1 collects no telemetry, deliberately.

- **M1.** Every order a parent places appears on the admin's open-orders view immediately.
- **M2.** Every order reaches Delivered or Cancelled. None are stranded mid-pipeline.
- **M3.** The vendor works a full book-list season without maintaining a parallel paper or WhatsApp list.
- **M4.** Parents place orders without phoning the shop beforehand, and do not phone afterwards to ask the price or confirm receipt.
- **M5.** The vendor adds a new school, grade, book, pack, or item without contacting the developer.

### Counter-metrics

- **CM1.** The vendor keeps a parallel list alongside the app. This means the open-orders view is not trusted. It is the single clearest failure signal.
- **CM2.** Parents still ring the shop to ask the price or whether their order exists. The status pipeline is then not doing its job.
- **CM3.** Orders accumulate in a non-terminal status without movement.
- **CM4.** The vendor cancels and re-places orders frequently. This would indicate the capture flow is producing wrong orders.

## 5. Functional Requirements

Priority tiers from the vendor's locked MoSCoW board are marked `[Should]` where they apply; everything unmarked is Must. See §12.

Requirement IDs are allocated once and never reused or resequenced, so a requirement added later carries a higher number than its neighbours.

### 5.1 Accounts and Access

- **FR1.** A parent can self-register with name, delivery address, WhatsApp number, email, and password. A second phone number is optional.
- **FR2.** Login uses email and password only. The WhatsApp number is contact data, not a login identity.
- **FR3.** Anyone may browse schools, grades, packs, and individual items without an account. Adding anything to a cart requires being logged in, because the cart belongs to the account.
- **FR4.** A parent must be authenticated to place an order.
- **FR5.** A parent can edit their own name, delivery address, WhatsApp number, and second phone from their profile. Edits affect future orders only; orders already placed keep their own snapshot, per §7.
- **FR6.** A parent can change their own password while logged in.
- **FR7.** The address held on the parent's account is the default delivery address at checkout. There is no per-order override and no saved-address book.
- **FR8.** The single admin account is seeded at deployment from configuration. There is no admin registration screen.
- **FR9.** The admin can change their own password while logged in.
- **FR10.** The admin can reset any parent's password to a value he communicates to them, from the parent's record. This is the only account-recovery path in v1; there is no reset email.
- **FR11.** The optional second phone number is presented to the admin on the order as a fallback contact when the WhatsApp number does not answer the confirmation call.
- **FR12.** Every form validates its input and reports failures inline, in the parent's context, without losing what they typed. Required fields, email format, and phone format are validated server-side as well as in the interface.
- **FR74.** A single-use admin recovery code is generated at deployment and shown once, for the vendor to keep outside the application. Entering it allows the admin to set a new password without a redeploy, and issues a fresh code. This is the admin's only recovery path.

### 5.2 Catalog Administration

- **FR13.** The admin can add, rename, and archive schools. A school in use by a pack cannot be hard-deleted.
- **FR14.** The admin can add, rename, and archive grades, on the same basis. Grades are unbounded and admin-typed, not a predefined 1–13 list, because private and international schools name year levels differently.
- **FR15.** The admin maintains a reusable **book master**. Each book record holds a title and a price. The title carries the edition, since the whole product depends on parents receiving the specific prescribed edition.
- **FR16.** A book record is shared across every pack that uses it. A title appearing in three schools' lists is one record, so a price correction applies everywhere at once. A pack cannot override the price of a book it contains.
- **FR17.** A pack has an admin-typed **name**, a school, a grade, a short description of what the pack is for, and a set of books chosen from the book master. The admin names each pack himself.
- **FR18.** A pack has no stored price. Its displayed price is computed as the sum of all its books, and falls as the parent unticks titles. It is a preview, never a discount that survives unchecking.
- **FR19.** The admin can create, edit, and archive packs at will, including adding and removing books from an existing pack. A new school year means a new pack; there is no separate academic-year versioning.
- **FR20.** Archiving a pack hides it from the storefront but does not delete it. Orders that already contain it keep their own snapshot of its name, titles, and prices.
- **FR21.** The admin maintains a separate **individual items** catalog for stationery and similar shop stock. Each item holds a title, a description, and a price only.
- **FR22.** Individual items are wholly separate from the book master and are never part of a pack.
- **FR23.** Books are sold inside packs only. A parent who wants a single title opens the pack containing it and unticks everything else — the locked-last-title rule (FR31) guarantees one remains. This route, not a separate loose-books catalog, is how the single-title need is met. See §13.
- **FR24.** Book-master records and individual items can be archived on the same basis as packs: hidden from the storefront, retained for existing orders.
- **FR25.** Archiving a book that belongs to a live pack removes it from that pack's storefront display. Carts holding that pack are handled per FR49.
- **FR26.** There are no image uploads anywhere in the catalog in v1.
- **FR27.** Editing a book, item, or pack affects the storefront and future orders only. Existing orders are never altered, per §7.
- **FR28.** Every catalog list has a defined empty state that tells the admin what to add and how.

### 5.3 Pack Discovery and Selection

- **FR29.** The parent selects a school from a dropdown, then filters by grade. Grade options are scoped to grades that actually have live packs for the chosen school, so the parent cannot select a combination with no results. Further filter parameters may be added later.
- **FR30.** Discovery is structured filtering only. There is no free-text or smart search in v1.
- **FR31.** Opening a pack displays every book in it, with all titles pre-selected. The parent can untick any title they already own, except the last remaining selected title, whose checkbox is locked. To remove it, the parent must first tick another title.
- **FR32.** Each ticked title starts at quantity 1, with a stepper ranging from 1 to 20. The plus control is disabled at 20 with the cap visibly stated. The minus control at quantity 1 unticks the title, except on the last remaining ticked title, where it is locked.
- **FR33.** The pack screen shows a per-title line total alongside the running pack total, both recalculating as ticks and quantities change.
- **FR34.** The parent adds the configured pack to the cart as a single action.
- **FR35.** A school or grade with no live packs shows an explanatory empty state, not a blank screen.

### 5.4 Individual Items

- **FR36.** The parent can browse the individual-items catalog independently of any school or pack.
- **FR37.** Individual items are added to the same cart as packs, with the same quantity range of 1 to 20. Adding an item already in the cart adjusts that line's quantity rather than creating a second line, so the cap cannot be circumvented.

### 5.5 Cart

- **FR38.** The cart is stored against the parent's account and persists across sessions and devices. A cart built on a phone is still there on a laptop.
- **FR39.** The cart may hold multiple packs. The same pack may be added more than once, and each add creates a new cart line with its own independent ticks and quantities, which is how a parent orders for a second child. Lines never merge.
- **FR40.** Repeated adds of the same pack are labelled distinguishably in the cart, so two lines for the same pack can be told apart at a glance.
- **FR41.** A pack is not required. A valid cart may contain packs only, individual items only, or a mixture.
- **FR42.** The parent can remove any cart line and adjust quantities within it. Changing which titles are ticked requires removing the line and adding the pack again.
- **FR43.** The cart displays a running goods total, calculated per §7.
- **FR44.** An empty cart shows a defined empty state that routes the parent back to pack discovery.

### 5.6 Checkout and Order Placement

- **FR45.** Checkout displays the goods total and the fixed line *"Delivery charge: to be confirmed by the shop"*, so the parent is not surprised later.
- **FR46.** Checkout does not calculate, estimate, or collect a delivery charge.
- **FR47.** Checkout displays the delivery address held on the account so the parent can verify it before placing.
- **FR48.** The parent can attach one optional free-text note to the order, which the admin sees on the order detail.
- **FR49.** Checkout compares every cart line against current catalog state and flags any line whose pack or item has been archived, whose constituent book has been archived or removed from its pack, or whose price has changed since it was added. Because prices live on shared book records (FR16), book-level price drift is the common case and must be detected, not just whole-pack changes. Unavailable lines must be removed before placing; repriced lines require explicit acknowledgement of the new figure. Nothing is silently substituted or silently repriced.
- **FR50.** Placing the order captures a complete snapshot of its contents, prices, and delivery details, per §7.
- **FR51.** Each order is assigned a short sequential identifier, for example `#1042`, allocated so that concurrent placements cannot receive the same number. It is short because it is read aloud during the confirmation call.
- **FR52.** Place Order is idempotent. A repeated submission of the same checkout — a double tap, a retry after a timeout, a back-then-forward — creates exactly one order.
- **FR53.** A newly placed order enters the status **Order Is Placed**, and the cart is emptied.
- **FR54.** Payment method is cash on delivery. The application handles no payment.
- **FR55.** All orders are placed by the parent. The admin cannot create an order on a parent's behalf. See §13.

### 5.7 Admin Order Management

- **FR56.** `[Should]` The admin's home screen is his today list: every order that has not reached Delivered or Cancelled, regardless of when it was placed. An order placed three days ago and still in Processing appears here.
- **FR57.** `[Should]` Orders on the home screen are grouped by status, in pipeline order, so orders awaiting the confirmation call appear first, with a count per status displayed above the list.
- **FR58.** Delivered and Cancelled orders remain accessible through a separate view, so completed work is retrievable without cluttering the today list.
- **FR59.** Order detail shows the parent's name, WhatsApp number, second phone if given, the snapshotted delivery address, the order note, every line with its snapshot titles, quantities, and prices, and the goods total.
- **FR60.** The admin can mark that a confirmation call was attempted, recording a timestamp, and can add free-text notes to any order. An order the parent did not answer must not look identical to one never called.
- **FR61.** The admin sets **Order Confirmed** and enters the delivery price in the same action. The delivery price is required and must be a non-negative amount.
- **FR62.** On confirmation, the order total becomes goods plus delivery. This is the first complete payable figure in the application.
- **FR63.** The admin can move an order between statuses subject to the transition rules in §6.
- **FR64.** The admin can cancel any non-terminal order. A short reason is required.
- **FR65.** Setting Delivered or Cancelled requires a confirmation prompt, because both are final.
- **FR66.** The admin cannot edit the contents of a placed order. The selection is locked at placement; anything wrong is resolved on the call and, if necessary, by cancelling.
- **FR67.** The admin can export all orders and catalog data as a downloadable file at any time, giving him a copy of his own season that does not depend on the hosting. See §8.

### 5.8 Parent Order Visibility

- **FR68.** The parent can see all of their orders, including Delivered and Cancelled ones, with the current status of each.
- **FR69.** Order detail shows the ordered lines with their snapshot prices, the goods total, the delivery charge once set, and the payable total.
- **FR70.** Before confirmation, order detail states that the delivery charge is still to be confirmed by the shop.
- **FR71.** The parent sees the order's position in the pipeline as the admin advances it.
- **FR72.** The parent can cancel their own order while it is still **Order Is Placed**. The option disappears the moment the admin sets Order Confirmed. This supersedes the earlier project rule that cancellation was admin-only.
- **FR73.** When the admin cancels an order, the parent sees both the Cancelled status and the reason given.

## 6. Order Lifecycle and Status Rules

The status pipeline is the mechanism that makes the daily login work. It is the reason the vendor can trust one screen instead of a paper list, and it is the reason the parent does not phone.

### Statuses

| # | Status | Set by | Notes |
|---|---|---|---|
| 1 | Order Is Placed | System, at placement | Parent may still cancel |
| 2 | Order Confirmed | Admin | Delivery price required; freeze begins |
| 3 | Processing | Admin | |
| 4 | Packing The Order | Admin | |
| 5 | Ready To Deliver | Admin | |
| 6 | On Delivery Partner | Admin | |
| 7 | Delivered | Admin | Success terminal; cash collected |
| — | Cancelled | Admin | Failure terminal; reason required |

### Transition rules

- **T1.** Only the admin advances status. There is no delivery-partner login.
- **T2.** An order cannot reach any status beyond Order Confirmed without passing through Order Confirmed. Confirmation cannot be skipped, because it is where the delivery price and the payable total are set. A Delivered order with no payable total must be unreachable.
- **T3.** Forward movement between statuses 3 through 6 may skip intermediate steps; the vendor knows what he has actually done.
- **T4.** Backward movement is permitted among non-terminal statuses but **stops at Order Confirmed**. An order can never return to Order Is Placed. This is what makes the freeze genuine rather than nominal.
- **T5.** Delivered and Cancelled are final. Neither can be reopened, and both sit behind a confirmation prompt.
- **T6.** Cancelled may be set from any non-terminal status, with a required reason.
- **T7.** Every transition is validated server-side against the order's current status. A transition submitted against a stale view is rejected with an explanation, not silently applied.
- **T8.** The parent's cancel and the admin's confirm target the same window and can be attempted simultaneously. Whichever commits first wins; the other is rejected and its actor is told what happened. A Cancelled order must never carry a payable total, and a Confirmed order must never be retroactively cancelled by a parent.
- **T9.** **Order Confirmed is a freeze point.** Once confirmed, nothing about the order changes: not the lines, not the prices, not the delivery charge, not the delivery address, not the contact details.
- **T10.** There is no separate "paid" status. Payment is cash on delivery and is implied by Delivered.
- **T11.** No notification is sent to the admin when an order arrives. He opens the application and checks daily.

### Accepted consequence

Because the delivery price is set once and backward movement floors at Order Confirmed, there is no way to correct a mistyped delivery charge. The recovery path is to cancel the order with a reason and ask the parent to place it again. This was chosen deliberately over a softer freeze, on the basis that mistyping is rare and an absolute freeze is easier to trust. The cost is real: it burns the order number already spoken aloud and requires a second call.

## 7. Pricing, Totals and Snapshots

- **Goods total** is the sum of ticked pack titles, each at quantity times unit price, plus any individual items at quantity times price. Unticked pack titles contribute nothing.
- A pack's displayed price is computed from its books and is never stored (FR18).
- **Checkout shows the goods total only.** No delivery figure is calculated, estimated, or displayed.
- **The payable total is written at Order Confirmed**, not at checkout, as goods plus the delivery price the admin enters.
- **Placing an order snapshots everything the order depends on**: pack names, book titles, item titles, unit prices, quantities, the delivery address, and the parent's contact numbers as they stood at that moment. Later edits to the catalog or to the parent's profile never alter a placed order, and archiving a pack never disturbs the orders that contain it. Last season's orders keep last season's prices, and an order ships to the address it was placed with.
- All amounts are handled in a single currency; v1 has no multi-currency or tax handling.

## 8. Access, Recovery and Data Durability

v1 sends no email, SMS, or WhatsApp message. That removes any mail-server or messaging dependency from the build, and it means account recovery has to be human.

- **Parent recovery is the admin.** A parent who forgets their password contacts the shop, and the admin resets it from their record (FR10). This is workable precisely because the vendor is already on the phone with these people.
- **The admin recovers with a code, not a redeploy.** His credentials are seeded at deployment, and a single-use recovery code is issued at the same time for him to keep outside the application (FR74). Without it, a forgotten admin password would require redeploying — the very operation the export exists to survive — so the code closes the last single point of failure in the design.
- **There is one admin account with no roles.** Anyone with those credentials can see every parent's name, address, and phone number, and can advance or cancel any order.
- **Order data must be recoverable independently of the hosting.** The admin export (FR67) exists for this reason: a redeploy, a container recycle, or a lost instance must not be able to take the season with it. The export is the vendor's own copy and does not depend on anyone else being available.
- Parent contact details and delivery addresses are personal data belonging to identifiable families. v1 stores only what the flow needs: name, address, WhatsApp number, optional second phone, and email.
- Email addresses are not verified in v1, and are the sole login identity.

## 9. Operating Constraints and Seasonality

- v1 runs on the Bonto free tier: Node.js, **50 hours per month, auto-sleep, 0.5 CPU and 512MB**. These are binding numbers, not background detail — the architecture was reasoned against them.
- **Auto-sleep has a user-visible cost.** After an idle period the first request pays a cold start, on a mobile-first storefront, for a parent who may be deciding whether this shop is worth the trouble. v1 has no telemetry, so this will not announce itself.
- **The monthly hour ceiling and the demand curve point in opposite directions.** Book-list buying compresses into roughly six weeks around the turn of the year, so the application is near-idle for most of its life and then takes its entire year's load in a short burst — the same burst that must fit inside 50 hours a month.
- **Risk with a trigger.** The free tier is accepted for v1. The paid upgrade, which brings a custom domain and an always-on instance, should be treated as due before the buying season rather than as a response to failure during it.
- The vendor checks the application daily. There is no alerting, so a day not checked is a day of orders not worked. This is accepted for v1.

## 10. Non-Functional Requirements

- **NFR1.** The storefront is mobile-first. Parents will predominantly order on phones.
- **NFR2.** `[Should]` Both the storefront and the admin interface are richly animated and visually polished; the application should feel a cut above what this market offers. This is not a fairness nicety between the two sides — **an unpleasant admin screen sends the vendor back to the phone, which is CM1.** The admin interface has to be somewhere he is willing to spend his morning.
- **NFR3.** Interactions behave as they would in a modern application rather than as full page reloads, particularly ticking titles, stepping quantities, and advancing status.
- **NFR4.** **Never silently undo or refuse a parent's action.** Where the application prevents something — the locked last title, the quantity cap, an unavailable cart line — it says so visibly and explains why. This governs the cases the requirements above do not enumerate.
- **NFR5.** The admin's today list loads quickly enough to be opened many times a day without friction.
- **NFR6.** The pack screen stays responsive with a realistically long book list, since ticking and quantity changes recalculate totals continuously.
- **NFR7.** Motion serves the interaction and never delays the vendor's work or a parent's checkout.
- **NFR8.** Passwords are stored using a current password-hashing standard. Authenticated pages are not reachable without a valid session.
- **NFR9.** A parent can only ever see their own orders, cart, and profile.
- **NFR10.** Order data survives restarts and redeployments, and the export in FR67 provides recovery beyond what the hosting guarantees.
- **NFR11.** **All rules in this document are enforced server-side**, not only in the interface — quantity caps, the locked last title, the required delivery price, every status transition, and every ownership check. The interface may enforce them too, for feedback.

## 11. Validation, Empty and Error States

Named here because earlier reviews found them to be the largest single gap, and because leaving them to build time is how a rich interface becomes an inconsistent one.

- Every form states its required fields, validates server-side, and reports failures without discarding input.
- Every list has a defined empty state: no packs for a school or grade, an empty cart, no open orders, no past orders, an empty catalog on first run.
- Every action that can fail has a defined failure message: a rejected transition, a lost session mid-checkout, an unavailable cart line, a duplicate submission.
- A session that expires mid-flow returns the parent to their cart intact after logging in again, since the cart is server-held.

## 12. Priority and Cut Line

The vendor locked a MoSCoW board. This section preserves the cut line he gave himself, so that time pressure does not force an unplanned decision.

- **Must.** Everything unmarked in §5, plus the pack, cart, and auth rules, the status pipeline, the snapshot rules, and the export.
- **Should.** The grouped-and-counted today list (FR56, FR57), archive-as-hide, and the rich animated interface on both sides (NFR2). These ship in v1; if the build runs long, they are the sanctioned place to trim — a plain sorted order list would still function, at a cost to CM1.
- **Could.** The illustrated pile-of-books mark. Nice if time allows.
- **Won't.** §13.

## 13. Out of Scope for v1

Deferred deliberately, in the vendor's stated order of interest: **custom domain**, then an **online payment gateway**, then a **notification when an order arrives**.

Also out: in-app delivery-fee calculation at checkout; stock and inventory tracking; additional admin accounts or staff roles; a delivery-partner login; password-reset email; per-book cover images; free-text or smart search; and academic-year versioning, which is unnecessary because a new year is simply a new pack.

Three exclusions are recorded here because they overturn or resolve earlier project decisions, and should not be silently reinstated:

- **No separate loose-books catalog.** An earlier decision called for a page selling individual titles from the book master. The single-title need is met instead by opening a pack and unticking everything else (FR23), and the individual-items catalog carries non-book stock only.
- **No phone-order entry.** All orders are placed by the parent (FR55). The admin cannot enter an order taken over the phone. The consequence is accepted: a parent who will not use the site is not served, and the vendor must resist writing it down.
- **No staleness flagging on aged orders.** Grouping by status is sufficient. Flagging aged orders is the leak-hunt instinct the product explicitly rejects.

## 14. Open Questions

- **Q1.** Is the deep-navy and school-bag-mustard palette still the direction? It was attached to a logo concept that was rejected in favour of the pile-of-books icon, so its status is genuinely unsettled. Owner: whoever writes the UX spec. Revisit before any visual design work begins.

## 15. Glossary

| Term | Meaning |
|---|---|
| **Pack** | An admin-named set of books for one school and grade, with a description. The product's main unit of sale. |
| **Book master** | The reusable catalog of book records, each a title and a price, shared across all packs. |
| **Individual item** | Non-book shop stock — pens, pencils, and similar — sold from its own catalog, never part of a pack. |
| **Cart line** | One add-to-cart action. Two adds of the same pack are two independent lines, which is how a second child is ordered for. |
| **Goods total** | The sum of everything selected, before any delivery charge. |
| **Payable total** | Goods plus delivery, written once at Order Confirmed. |
| **Snapshot** | The frozen copy of titles, prices, quantities, address, and contact details taken when an order is placed. |
| **Today list** | The admin's home view of all orders not yet Delivered or Cancelled. |
| **The call** | The single phone call the admin makes to communicate the final price. The product exists to make it the only one. |
