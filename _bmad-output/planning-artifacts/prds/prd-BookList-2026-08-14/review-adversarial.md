---
title: "Adversarial Review: Book List PRD"
status: review
created: 2026-08-14
reviewer: adversarial product review
sources:
  - prd.md
  - addendum.md
---

# Adversarial Review: Book List PRD

## How to read this

My job here is to argue that this PRD's load-bearing decisions are wrong, and to argue it well enough that you must either change them or consciously accept them in writing. I am not neutral. Where the reasoning holds, I say so, because a review that attacks everything is worth nothing.

Severity means this:

- **CRITICAL** — plausible during the first six-week season and capable of losing orders, losing data, or stopping the business. Fix before handover.
- **HIGH** — likely during the first season, causes real operational pain or defeats a stated goal. Fix before handover or accept in writing with a named workaround.
- **MEDIUM** — will bite, but survivable and cheaply patched in-season.
- **LOW** — worth a line in the document, not worth a fight.

### What is genuinely strong, stated once so I do not have to keep conceding it

Total order snapshotting (§6) is the best decision in this document and it makes archiving, repricing, and a shared book master all safe. The separate individual-items catalog, cart lines cloned rather than merged for the second-child flow, the locked last title, the short read-aloud order ID, grouping admin home by status with per-status counts, the explicit "delivery not included" notice at checkout, archive-instead-of-delete, and server-side enforcement in NFR9 are all correct and unusually well-reasoned for a v1. The counter-metrics are the sharpest part of §3 — CM1 in particular is exactly the right thing to watch. And the framing in §1, that the app does not replace the confirmation call but makes it the only call, is the right product idea.

Almost everything below is about the six weeks, not about the model.

### Summary of findings

| # | Finding | Severity |
|---|---|---|
| 1 | Absolute price freeze; only recovery is cancelling a real order | CRITICAL |
| 2 | No password recovery — admin lockout recovery collides with NFR8 | CRITICAL |
| 3 | Zero outbound messaging plus unaided daily polling | HIGH |
| 4 | Free-tier hosting carries the entire revenue peak | CRITICAL |
| 5 | Single admin account, no roles, no audit of who acted | HIGH |
| 6 | Parent cancel window closes on an event the parent cannot see | MEDIUM |
| 7a | No backup or restore requirement anywhere in the document | CRITICAL |
| 7b | No way to record a failed or attempted confirmation call | HIGH |
| 7c | Admin has no write path into orders at all | HIGH |
| 7d | Email is the sole login identity and is never verified | HIGH |
| 7e | Q5 left open: the daily view has no memory of neglect | HIGH |
| 7f | No registration abuse controls on the admin's only screen | MEDIUM |
| 7g | FR40 forces a full pack rebuild to react to a price change | MEDIUM |
| 7h | No privacy, terms, or data-retention position | MEDIUM |
| 7i | Rich animation on the admin's hot screen contradicts NFR4 | MEDIUM |
| 7j | Unresolved race between parent cancel and admin confirm | MEDIUM |
| 7k | Open questions are in-scope behaviour, not architecture | MEDIUM |
| 7l | Sequential order IDs need an explicit authorization requirement | LOW |
| 7m | No way to record pickup or zero-delivery orders cleanly | LOW |

---

## 1. The absolute price freeze — CRITICAL

**The decision.** §5: Order Confirmed is an absolute freeze point. Nothing about a confirmed order changes — not lines, not prices, not the delivery charge. Backward movement floors at Order Confirmed. §5's accepted consequence: a mistyped delivery charge can only be recovered by cancelling the order and asking the parent to place it again. The addendum records that a softer freeze was considered and rejected because an absolute freeze is easier for the vendor to trust.

**The strongest case against it.** The freeze is defended as if the only thing it forbids is correcting a typo. It forbids far more than that, and it does so at the exact moment the shop receives its only new information.

Consider what the confirmation call actually is. It is the one conversation between the shop and the parent. It is where the parent says "actually my daughter already has the atlas, drop it", or "add one more of the exercise book", or "my mother's address is better for delivery this week". The PRD's own §1 describes phone as the place where parents "ask to drop a title they already own" and "sometimes order for a second child in the same call". You have moved that conversation to after placement and then made the order immutable during it. FR62 already blocks editing lines. The freeze then blocks the delivery figure too. The net effect is that the admin sits on a call, receives a perfectly ordinary request, and has exactly one instrument available: destroy the order.

Now look at what cancel-and-re-place costs, because the PRD treats it as a mild inconvenience and it is not one.

- **It is the failure G1 exists to prevent.** G1 is "no agreed order is lost between the parent placing it and the shop working it." Cancel-and-re-place deliberately unmakes an agreed order and makes its survival depend on the parent doing the whole flow again, unsupervised, later. The admin cannot place it for them — nothing in §4.7 lets the admin create or amend an order. So the recovery path for an admin's typo is a customer action the shop cannot perform, cannot verify, and cannot chase without a second phone call. Some fraction of those never come back. That fraction is order loss caused by the design, in the product whose entire purpose is preventing order loss.
- **The re-placed order is not the same order.** FR47 snapshots prices at placement. If a book price was corrected in the book master between the two placements — and FR15 exists precisely because prices get corrected mid-season — the re-placed order silently carries different prices from the ones agreed on the call. You have now created a second, quieter version of the problem the freeze was meant to eliminate: a payable figure the parent did not agree to. Worse, it is invisible, because both parties believe they are re-doing the same order.
- **It burns the order ID that was already read aloud.** FR48 makes the ID short and sequential specifically so it can be spoken on the call. On a typo recovery, the ID the parent wrote down is now attached to a cancelled order, and the live order has a different number. In a six-week rush where the admin is reconciling by spoken number, this is how two people end up talking about different orders.
- **The recovery path corrupts your own instrumentation.** FR60 requires a reason, and FR68 shows that reason to the parent. So the customer-facing record of your typo reads "cancelled — wrong delivery price entered", which is a bad look on a commissioned shop's own site. And CM4 — "the vendor cancels and re-places orders frequently" — is defined in §3 as the signal that the capture flow is producing wrong orders. You have wired your primary recovery mechanism directly into your diagnostic for a different disease. After a month, the vendor cannot distinguish "my capture flow is broken" from "I fat-fingered some delivery charges", because both produce the same trace.
- **The rush is when typos happen and when recovery is most expensive.** The premise for accepting this — "mistyping is rare" — is an estimate made in a calm room about behaviour under time pressure. Delivery charges are typed on a phone keypad-style numeric field, in a shop, mid-call, dozens of times a day, for six weeks. A dropped zero or a transposed digit is not exotic; it is the single most predictable data-entry error in the system. And the correction requires the longest, most fragile procedure in the system.

**Realistic failure scenario.** Late December, twenty-six confirmations that day. On order #1071 the admin means to type 350 and types 3500. He notices while writing it on the packing slip, ten minutes later. He now has to: cancel #1071 with a reason the parent will read, phone the parent a second time — breaking the "one call" promise that §1 sells as the product's core idea — talk them through re-placing, and hope they do it that evening rather than next week. Meanwhile the parent, who has already seen a Rs. 3,500 delivery charge on their order page under FR64, has told their WhatsApp group about the bookshop that tried to charge 3,500 for delivery. Under FR64 the parent sees the payable total the moment it is written, so the typo is public before it is correctable.

**Where the author is right.** The instinct behind this is sound and I do not want it thrown away. An order whose price can quietly change after the parent agreed to it is a genuinely worse product, and "the figure you were told is the figure you pay" is a real promise worth protecting. The rejection of backward movement to Order Is Placed is also correct — that would have been a hidden re-confirmation loop with no record.

**What I would do instead.** Keep the promise, drop the absolutism. The freeze should be *accountable*, not *impossible*.

1. Make the delivery price correctable while the order is still in the shop's hands — up to and including Ready To Deliver, blocked from On Delivery Partner onward, since after that the courier is carrying a figure to collect.
2. Every correction writes an append-only price-history row: old value, new value, timestamp, reason. Show that history to the parent on the order page. A change the parent can see and audit is not a betrayal of trust; a change they cannot see is. This gives you a stronger version of what the freeze was buying.
3. Add a confirm step to the confirmation action: after typing the delivery price, show goods + delivery + payable total in a review dialog with the amount echoed clearly, and require a second tap. Most typos die here, before they ever reach the parent. This is an afternoon of work and it is the highest-value single change in this review.
4. Separately, split the cancel reason into a small closed set (parent changed mind / unreachable / stock unavailable / data correction / other) plus free text, and record `cancelled_by`. Without this, CM4 and CM3 are unreadable in season one.

If the vendor still wants absolutism after seeing this, then at minimum do (3) and (4), and state in §5 that the accepted consequence includes a second phone call, a new order ID, and possible price drift on re-placement. Right now §5 states the consequence in its cheapest possible form.

---

## 2. No password recovery at all — CRITICAL (admin) / HIGH (parent)

**The decision.** §7 and FR10: no password-reset email for either role, and the application sends no email, SMS, or WhatsApp message at all. Admin credentials are seeded from configuration; if the admin forgets his password and has not changed it in-app, recovery means redeploying with a new seeded credential. Q1 leaves the parent's recovery path unresolved.

**The strongest case against it.** Two separate problems are bundled here, and one of them is not a usability issue at all — it is a data-loss risk.

**The admin half.** Follow the documented recovery path to its end. The admin is locked out. Recovery is "redeploy with a new seeded credential." Ask who does that: the developer, after handover, on a commissioned project, possibly out of contract, at 9pm on a Tuesday in late December. Then ask what a redeploy does to a SQLite file on a free tier. The addendum specifies one Node process plus SQLite on the Bonto free tier. Unless that database file sits on a genuinely persistent volume that survives redeploys — and free tiers frequently do not provide one, which is why NFR8 had to be written down at all — the documented remedy for an admin lockout is an operation that can destroy every order in the system.

That is not a rough edge. §7's recovery procedure is in direct structural conflict with NFR8 ("Order data must survive restarts and redeployments. An order lost to a deploy is the exact failure this product exists to prevent"). Either NFR8 is satisfied by real persistence, in which case someone must prove it before handover and write down how, or the lockout procedure is an order-destroying event. The PRD does not currently know which.

There is also a subtler trap. FR9 lets the admin change his own password in-app. §7 notes that recovery is a redeploy "if he has not changed it in-app" — but the more he uses FR9, the *more* likely lockout becomes, because the config-seeded value in the deployment settings is now stale and the only live credential is one he typed into a browser once. FR9 as written quietly converts a recoverable state into an unrecoverable one, and nothing warns him of that.

**The parent half.** The workaround floated in Q1 — "the parent simply registers again with a different email" — does not survive contact with reality. It requires the parent to *have* a second email address, which many will not. It orphans their cart (FR35, server-persisted against the account) and their entire order history (FR63), so the parent loses visibility of a live order that the shop is actively working. The admin then sees two accounts for one family with no link between them, in a system that already has no dedupe and no admin order tooling. And it means the parent must phone the shop to be told to do it — which is precisely CM2, the counter-metric you named as proof the status pipeline is not doing its job, and it defeats G2.

Scale it. If a few hundred families use this in six weeks, a lockout rate anywhere in the normal range for a once-a-year, low-frequency account — and once a year is the *worst* case for password recall — gives you dozens of lockouts, each one a phone call, clustered in the days when the admin has least time. The no-messaging decision means the only recovery channel is the phone, and the phone is the thing this product was built to unburden.

**Realistic failure scenario.** A parent placed order #1063 on 20 December. On 27 December they want to check whether it has shipped. They cannot remember the password they invented a week earlier. They phone the shop. The admin has no tool. He tells them to register again; they have one email address, so they cannot. He now reads them the order status over the phone, and does this eleven more times that week. By January he is keeping a notebook of "who called about what", which is CM1 — the single clearest failure signal in this document — reached by an entirely mundane path.

**Where the author is right.** Dropping SMTP from v1 is a defensible call. Mail deliverability, domain reputation, and a transactional-mail provider are real work and real ongoing configuration, and on a `*.bonto.run` subdomain with no custom domain, reset emails would land in spam anyway. So "no reset email" is fine. "No recovery at all" is a different decision, and it is the one that does not hold.

**What I would do instead.** Note that the fix requires no messaging infrastructure whatsoever, which is why this is the cheapest CRITICAL in the review to close.

1. **Admin-issued parent password reset.** On the parent's record, an admin control that generates a temporary password, displays it once on screen, and forces a change at next login. The admin is already on the phone with these people; he reads it out. Zero infra, no SMTP, no queue, fully consistent with the zero-messaging constraint. This closes Q1 outright, and Q1 is not a question you can ship open — §1's delivery bar says v1 is complete scope, not a pilot slice.
2. **A break-glass path for the admin himself.** Options, in order of preference: seed two admin accounts from configuration at deploy (a working account and a sealed recovery account whose credential goes into the vendor's password manager at handover); or ship a documented one-shot command the vendor can run from the host's console to reset the admin password *without* redeploying. Either way, write down the procedure in a handover runbook and test it once, in front of the vendor, before the season.
3. **Make FR9 safe.** If the admin changes his password in-app, tell him plainly on that screen that the seeded configuration value no longer works and that this is now his only credential. Changing a password should also invalidate other sessions.
4. Have the vendor store both credentials in a password manager at handover, and confirm he has done it. This is a process fix, but it is the one that actually prevents the incident.

---

## 3. Zero outbound messaging plus unaided daily polling — HIGH

**The decision.** §5 and §8: no notification to the admin when an order arrives; he opens the app and checks daily. No message of any kind to the parent. §8 accepts that "a day not checked is a day of orders not worked."

**The strongest case against it.** The PRD states the risk accurately and then under-prices it, because it models a missed day as a delay. It is not a delay. It is an invisible delay, and that is a different failure.

Three things compound.

**First, the queue has no age.** FR52 shows all non-terminal orders and FR53 groups them by status. Nothing sorts or flags by age — Q5 explicitly leaves "should a stale order be flagged" unresolved. So an order placed four days ago that was somehow skipped sits in the "awaiting confirmation" bucket looking exactly like one placed an hour ago. There is no mechanism anywhere in the system by which the app tells the admin he neglected something. The daily check is the *only* memory in the system, and the design gives it nothing to recover with when it fails. A missed day is therefore not self-correcting; the orders at the bottom of a long list can stay missed.

**Second, the six-week window is the worst possible window for a human-memory dependency.** The addendum puts the peak from late November to early January with term 1 starting 1 January. That period in Sri Lanka contains Christmas, the New Year turn, poya days, and school-holiday family obligations. It is simultaneously the highest-volume period and the period with the most days when a shop owner is not at his desk. Betting the order pipeline on an unbroken daily habit is betting against the calendar you yourself documented. And the deadline is hard: books that arrive after term starts are close to worthless to the parent. A two-day gap on 28–29 December is not "some latency", it is orders that miss the start of school.

**Third, the parent is also polling, and nobody said so.** G2 promises the parent never has to phone to learn the price or check the order exists. FR66 delivers that only if the parent logs back in and looks. Nothing tells them the delivery charge has been set. So the mechanism keeping parents off the phone is their willingness to repeatedly visit a website to check on something — while an unfamiliar bookshop holds an order for their child's schoolbooks with no confirmed price. Some will do that. Many will phone. CM2 is going to trip in week one, and when it does, it will look like a pipeline design failure when it is actually a notification gap.

**Realistic failure scenario.** 28 December, the admin's daughter has a fever and he spends the day at a clinic. 31 orders arrive over that day and the next morning. On 30 December he opens the app to a list of 40-odd unconfirmed orders grouped by status with no ordering by age. He works down the visible list, calls maybe twenty-five people, and six orders sit below the fold. Those six parents phone the shop on 2 January asking where their books are, after term has started. Two cancel. The vendor's conclusion is that the app "lost" his orders, and he starts writing them in a notebook again — CM1, from one sick child.

**Where the author is right.** Refusing SMTP and refusing a messaging-provider integration in v1 is correct: it removes a queue, a worker, a provider account, deliverability tuning, and a whole class of ongoing failure from a free-tier single-process app. I am not asking for that. I am arguing that "no messaging integration" and "no outbound communication" are not the same constraint, and the PRD has conflated them.

**What I would do instead.** All three of these respect the zero-integration constraint.

1. **Resolve Q5 as yes, in v1.** Show an age on every order ("placed 3 days ago"), sort by age within each status group, badge anything past a vendor-set threshold, and put a single line at the top of admin home: "Oldest unworked order: 4 days." This is a timestamp subtraction and a CSS class. It is the difference between a daily check that forgives a missed day and one that does not, and it is what makes G3 and CM3 real rather than aspirational.
2. **WhatsApp click-to-chat deeplinks.** On the order detail, a button that opens `wa.me/<number>` with a pre-filled message containing the order ID, status, and payable total. This is a hyperlink. There is no provider, no API, no queue, no credential, no cost, and no dependency — the admin taps it and his own WhatsApp opens with the text ready to send. It gives you outbound parent messaging on the country's dominant channel while keeping the addendum's "no SMTP, no messaging-provider integration, no queue" constraint fully intact. Given the addendum already cites 16.5M Sri Lankan WhatsApp users as the reason WhatsApp is the contact channel, not using it this way is leaving the cheapest win in the document on the floor.
3. **A public order-status lookup**, by order ID plus the last digits of the phone number, so a parent can check status without logging in. This blunts both the polling problem and the password-lockout problem at once.

If the vendor genuinely wants none of this, then (1) is still non-optional. Without an age signal, "he checks daily" is not a mitigation, it is a hope.

---

## 4. Free-tier hosting for the revenue peak — CRITICAL

**The decision.** §8: v1 runs on the Bonto free tier; a custom domain and always-on hosting are a later upgrade. The addendum treats the free-tier deployment as "staging that the vendor uses for real work."

**The strongest case against it.** "Staging that the vendor uses for real work" is the sentence I would put on the front page of this review. There is no such thing. It is production. It holds the only copy of the shop's order book during the only six weeks of the year that matter.

**Cold starts are structurally guaranteed to hit the worst moment.** §8 says the app is near-idle for most of its life. Free tiers idle out inactive apps and cold-start them on the next request. Combine those two facts: the app will be asleep at exactly the moments that matter most — the first parent of the morning, the first parent after a quiet afternoon, and every single visitor during the pre-season weeks when a parent hears about the shop for the first time. That first visitor gets a blank screen for however long the cold start takes, on mobile data, on an Android phone. NFR1 says parents predominantly order on phones; a phone browser user who waits fifteen seconds for a first byte is gone, and they are gone during the *acquisition* window. You will never see this in your metrics, because §3 says v1 collects no telemetry. Bounced parents are indistinguishable from parents who never came.

**The admin's hot screen inherits the same problem.** NFR4 says open-orders must load quickly enough to be opened many times a day without friction. On a sleeping free-tier instance, the first open each morning — and after every idle gap in a shop day full of interruptions — is the slow one. That is the screen the whole product's credibility rests on, and it is slowest exactly when the vendor is most rushed. If it feels unreliable, he goes back to paper. CM1 again.

**The data risk is worse than the latency risk.** Free tiers commonly recycle containers and reset filesystems. A single SQLite file on ephemeral storage is one container recycle away from an empty order book. NFR8 demands survival across restarts and redeploys, but nothing in the PRD or addendum states *how* — no persistent volume named, no verification step, no backup. This is a requirement asserted rather than designed, and it is the requirement the product exists for.

**There are second-order costs too.** A `*.bonto.run` subdomain is the address on which you ask families to type their home address and their child's school. Legitimacy matters when the payment model is a stranger arriving at your door to collect cash. And the addendum notes PayHere requires a complete live HTTPS site with terms, refund, and privacy pages — so the free-tier-plus-no-static-pages posture also gates the next cycle.

**Realistic failure scenario.** Two variants, both plausible.

*Latency:* 5 January, the busiest day. A WhatsApp group of forty parents shares the link within ten minutes. The free-tier instance cold-starts and then throttles under concurrent load; the pack screen — which NFR5 already flags as computation-heavy with long book lists and continuous total recalculation — crawls. Parents abandon mid-pack. The vendor's single busiest referral event converts almost nobody, and nobody ever knows, because there is no telemetry.

*Data:* mid-December, the platform recycles the container during a maintenance window. The SQLite file was on ephemeral storage. Forty-one orders, the entire catalog of schools, grades, books, packs and items the vendor typed in by hand, and every parent account are gone. There is no backup requirement in this document. The product's founding promise — no agreed order is lost — is broken not at the margin but completely, and the vendor has no paper list because M3 told him he would not need one.

**Where the author is right.** Choosing a thin, boring stack — one Node process, SQLite, no service split — is exactly right for this scale and this budget, and the claim that the paid upgrade is the same application with no rewrite is credible and worth protecting. The mistake is not the stack. It is treating always-on hosting as a post-launch nicety when the launch *is* the season.

**What I would do instead.**

1. **Move to the paid always-on plan before the season starts, not after it.** Reframe it in §8 as a launch cost, not an upgrade. Quantify it for the vendor: a few dollars a month against a year's book-list revenue is the cheapest insurance in this project. This is a conversation you have once, before December, not a discovery you make during it.
2. **Make backup a numbered NFR.** Something like: the SQLite database is backed up automatically at least daily to storage outside the application host, with a restore procedure documented and *tested once* before handover. Continuous replication (e.g. streaming the SQLite WAL off-box) is better if the host allows it. NFR8 is currently the only durability requirement and it only covers the polite failures.
3. **Prove persistence explicitly.** Before handover, deploy, place a test order, redeploy, and confirm the order still exists. Write the result into the handover notes. If it does not survive, NFR8 is unmet and nothing else in this PRD matters.
4. If the free tier is truly non-negotiable for launch, then add an external uptime pinger to keep the instance warm, measure a real cold-start time and write the number into §8 rather than leaving it abstract, and set an explicit trigger for upgrading mid-season.
5. Set a performance budget for the pack screen against a low-end Android device on 3G, since NFR5 and NFR2 are pulling in opposite directions on precisely the hardware your users have.

---

## 5. Single admin account, no roles — HIGH

**The decision.** §2 and FR8: one admin account, no staff roles, seeded from configuration. §10 defers additional admin accounts and staff roles. §7 notes that anyone with those credentials can see every parent's details and advance or cancel any order.

**The strongest case against it.** The decision does not do what it appears to do. It does not prevent a second person from operating the shop's system; it guarantees that when a second person operates it — and during a six-week peak, one will — they do so on the owner's identity, with no record of who did what.

The workaround is not hypothetical, it is the *only* workaround: the owner tells his son, his wife, or a seasonal assistant the password. From that moment: every status transition, every confirmation, every delivery price, and every cancellation is attributed to nobody in particular. If a delivery charge is wrong or an order was cancelled that should not have been, there is no way to find out how it happened — and under an absolute freeze (§1 above), "who typed this figure and when" is exactly the question you will want answered. There is no actor and no timestamp recorded on transitions anywhere in §4.7 or §5. The audit trail you would want in order to trust the freeze does not exist.

Then there is revocation. When the season ends and the helper goes back to university, the only way to remove their access is for the owner to change the password — and FR9 does not say that other sessions are invalidated, so a logged-in session may simply continue working. And nothing addresses two people using one account at once: no optimistic locking, no "this order was updated while you were looking at it" guard. Two people working the same queue on the same credential will double-confirm an order or fight over a status, and the loser's write silently wins or loses with no trace.

The illness case is starker and simpler. If the owner is in hospital for three days, there is no legitimate way for anyone to work the queue, because there is no second account to hand over. The business's continuity plan is "the owner does not get ill during the six weeks that carry the year."

**Realistic failure scenario.** Peak week. The owner's nephew helps with calls, using the owner's login on his own phone. He confirms #1088 at Rs. 450 delivery; the owner, unaware, had already confirmed it. Or he cancels #1091 believing the parent asked him to, and the parent later denies it. There is no history, no actor, no way to reconstruct it, and — because of the absolute freeze — no way to undo it. In February, the nephew's phone still has an authenticated session.

**Where the author is right.** Not building a role system for a one-person shop is correct. Permissions, role assignment, an invitation flow, and per-role UI are a large amount of work for a business with one operator, and deferring RBAC is a good call.

**What I would do instead.** Separate three things the PRD has fused into one.

1. **Multiple admin accounts with identical permissions is not a role system.** It is a table with more than one row. Seed a second admin account at deploy, or let the admin create additional admin logins. No roles, no permission matrix, no invitation flow — just distinct identities. This solves illness, delegation, and revocation at once.
2. **Stamp every status transition with actor and timestamp, in a status-history table.** You want this table regardless: it is what powers the age/staleness signal in item 3, it is what makes the price freeze auditable, and it is what lets you answer "what happened to #1091". This is the highest-leverage schema addition in the review.
3. **Invalidate other sessions on password change,** so revocation actually revokes.
4. Add a server-side guard against concurrent status writes — reject a transition whose expected current status no longer matches.

Keep "no roles" in §10. Move "additional admin accounts" out of it.

---

## 6. The parent cancel window closing at Order Confirmed — MEDIUM

**The decision.** FR67: the parent can cancel while the order is Order Is Placed; the option disappears the moment the admin sets Order Confirmed. The defence is that confirmation follows a call the parent participated in.

**The strongest case against it.** The defence is half right, and the half that is wrong is about timing, not consent.

The parent consented on the call. But the *system event* that removes their button is not the call — it is the admin's tap, which may come minutes or hours later, in a different order, batched at the end of a run of calls. From the parent's side, the cancel button vanishes at an unpredictable moment triggered by someone else's action, with no notice (there is no messaging). So a parent who hangs up, talks to their spouse, learns the neighbour is lending them three of the five books, and opens the app twenty minutes later finds either a working cancel button or no cancel button, depending on how the admin happened to sequence his afternoon. Same intent, same elapsed time, different outcome. That is not a rule the parent can understand or plan around.

And the restriction does not achieve what it is for. Under cash on delivery, the parent's real cancellation power is at the door: they simply do not pay. Removing the in-app button does not remove the ability to cancel; it removes the shop's *early warning*. So the strict window converts a cheap cancellation at Order Confirmed — before picking, packing, or dispatching a courier — into an expensive one at the doorstep, after the shop has spent the labour and the delivery cost. The rule imposes cost on the shop and buys nothing.

Third, it launders the data. A parent who wants to cancel post-confirmation must phone the shop (G2, CM2, again), and the admin then cancels under FR60 with a reason. In the data, a parent-initiated cancellation is now indistinguishable from a shop-initiated one. That is the same instrumentation blindness described in item 1, arriving from another direction — and together they make CM4 uninterpretable.

**Realistic failure scenario.** A parent confirms on the call at 11am. At 11:20 her husband says he bought half the list in Colombo. The admin batched his taps at 4pm, so she still had the button at 11:20 — fine. Her neighbour, whose call was earlier and whose order the admin tapped immediately, has no button in the identical situation and phones the shop twice before getting through. Meanwhile a third parent, who could not get through, says nothing, and refuses the delivery at the door on 2 January. The shop has packed the order and paid a courier.

**Where the author is right.** Genuinely: a parent unilaterally cancelling an order that is already picked, packed, and on a delivery partner is not acceptable, and a hard floor somewhere is correct. The confirmation call is also a real consent event and it is right that it means something.

**What I would do instead.**

1. Let the parent cancel directly through **Processing** — that is, until the shop has started physically picking. It is still cheap for the shop and it captures most changes of mind.
2. From **Packing The Order** onward, replace cancel with a **cancellation request**: the parent taps it, the order gets a visible flag on the admin's queue, and the admin decides. This keeps admin authority while giving the shop the early warning that COD otherwise denies it.
3. Record `cancelled_by` (parent / admin) and a reason category on every cancellation, so CM4 means something.
4. In the UI, never let the button vanish without explanation. If it is gone, say why: "This order is confirmed. To change it, call the shop on 0xx-xxxxxxx."

---

## 7. Other load-bearing calls

### 7a. There is no backup or restore requirement anywhere in this document — CRITICAL

**The decision.** By omission. NFR8 requires order data to survive restarts and redeployments. Nothing requires it to survive file corruption, accidental deletion, a bad migration, a lost host, or a container recycle.

**The case against it.** This is the largest gap in the PRD, and it is a gap rather than a wrong decision, which is why it is easy to miss. The document is otherwise careful about durability — snapshotting is total, archiving never deletes, last season's orders keep last season's prices. That care stops precisely at the point where it matters most: the single SQLite file on a free tier that holds all of it. NFR8 covers the polite failure modes. The impolite ones are unaddressed, and any one of them destroys the entire product thesis in a way no amount of good UX recovers from. There is also no export — the vendor cannot get his own order book out of the system, so he has no independent copy even manually, and no way to work if the app is down for a day.

**What I would do instead.** Add explicit NFRs: automated off-host backup at least daily during season, retained at least a week; a restore procedure documented and tested once before handover; and a plain CSV export of orders and of the catalog from the admin UI. The export is small, and it is also the vendor's disaster plan, his accountant's data source, and his fallback when the app is unreachable.

### 7b. There is no way to record a call that did not connect — HIGH

**The decision.** By omission. FR11 gives the admin a second phone number as a fallback "when the WhatsApp number does not answer the confirmation call", so unreachable parents are anticipated. But there is no state, no field, and no note in which to record that an attempt was made.

**The case against it.** The admin's queue has one bucket for "awaiting confirmation" and it silently mixes two completely different populations: parents nobody has called yet, and parents who have been called two or three times and never picked up. With a handful of orders he remembers which is which. With forty, over six weeks, he does not. So he re-calls people he already reached, fails to re-call people he did not, and the ones who never answer sit in the bucket indefinitely — which is exactly CM3 (orders accumulating in a non-terminal status) with no mechanism to detect it, since Q5 is unresolved.

Note also that FR45's note belongs to the parent. There is **no admin-writable field on an order anywhere in this PRD**. The operator of the system cannot write a single word about the work he is doing. That is a striking omission for a tool whose purpose is to replace a notebook, and it is the specific reason the notebook comes back — the notebook's killer feature is that you can write "no answer, try after 6" next to a name.

**What I would do instead.** Two small additions: an admin-only internal notes field on every order, and a "contact attempted" action that records a timestamp and increments a visible counter ("3 attempts, last 29 Dec"). Optionally an `Awaiting Contact` state between Placed and Confirmed. This is cheap and it removes one of the strongest remaining reasons to keep a parallel list.

### 7c. The admin has no write path into orders at all — HIGH

**The decision.** FR62 forbids editing a placed order; §5 forbids post-confirmation change; nothing anywhere lets the admin create an order.

**The case against it.** Taken together, the admin can only move an order along a track or destroy it. He cannot create one. So the ordinary case — a parent phones because they are elderly, or their registration failed, or they are locked out per item 2, or they simply prefer the phone — cannot be served through the application. The vendor's only option is to write it down somewhere else. That is CM1, the failure signal the PRD itself identifies as clearest, reachable by the single most predictable event in a phone-first business: a customer phoning. §1 says the app "does not replace the vendor's confirmation call, it makes that call the only call" — but for a phone order there is no app record for that call to attach to.

**What I would do instead.** Let the admin place an order on behalf of a parent account, using the same pack-configuration UI the parent uses. This also becomes the recovery path for item 1's typo problem — instead of begging the parent to re-place, the admin re-places it himself while still on the phone. Two problems, one feature. If that is too much scope, at minimum let the admin create a parent account (name, address, phone) so a phone order can be captured after a five-minute conversation.

### 7d. Email is the sole login identity and is never verified — HIGH

**The decision.** FR1 and FR2: login is email and password only; the WhatsApp number is contact data, not identity. The addendum records that WhatsApp-as-login-identity was rejected.

**The case against it.** The identity choices are inverted relative to what the business actually verifies and uses.

The phone number is the field the shop *confirms by using it* — every order passes through a phone call to that number. It is the field the parent cannot mistype without noticing, because a wrong number means no call and no books. It is the field they cannot forget. Meanwhile the email address is never verified (there is no verification step, and there could not be, since the app sends no mail), is never used for anything at all, and is the field a once-a-year user is most likely to mistype or misremember. You have made the unverified, unused, forgettable field the sole key to the account, and relegated the verified, load-bearing, memorable field to a display string.

The consequences chain into item 2. A parent who typos their email at registration has an account nobody can ever recover, and the shop cannot even tell that the address is wrong. And because email uniqueness is the account key, the "just register again" workaround requires a *second* email address rather than a second phone number.

**Where the author is right.** WhatsApp-number-as-password-reset-channel would need a messaging integration, which is correctly out of scope. Email-and-password is also the least surprising pattern for a web app.

**What I would do instead.** Allow login by email *or* phone number, and treat the phone number as unique. Alternatively make phone the primary identifier and email optional. Combined with the admin-issued reset in item 2, the identity a parent can always produce on a phone call — their number — becomes the thing that gets them back in. Make email optional rather than required if you are not going to verify or use it.

### 7e. Q5 unresolved means the daily view has no memory — HIGH

Covered in item 3, but stated separately because it is the single cheapest fix in this review and because G3 ("every order reaches a terminal state, nothing sits in the middle without a decision") and CM3 are both unenforceable without it. CM3 currently reads "no threshold is defined; the vendor's judgement applies" — that is not a counter-metric, it is a hope. Resolve Q5 as yes: age display, age sort within status, staleness badge past a threshold, and an oldest-order line on admin home.

### 7f. No registration or abuse controls on the admin's only screen — MEDIUM

**The decision.** By omission. Self-registration with no email verification, no rate limiting mentioned, no captcha, and FR52 puts every non-terminal order on the admin's home screen.

**The case against it.** Anyone can create accounts and place orders that land directly on the vendor's working queue during his busiest week, and his only tool is cancel-with-a-reason, one at a time. It does not take malice — one bored teenager or one bot crawling registration forms produces a queue the vendor cannot trust, and an untrusted queue means a paper list. There is also no login rate limiting stated, on an app with no password recovery, so brute-force protection and lockout policy interact awkwardly and need a deliberate answer.

**What I would do instead.** Rate-limit registration, login, and order placement per IP and per account. Add an obvious spam signal to the admin view rather than nothing. Consider requiring the phone number to be unique (see 7d), which alone kills most casual abuse. And decide the lockout policy explicitly, since account lockout plus no recovery equals a permanently dead account.

### 7g. FR40 forces a full pack rebuild to react to a price change — MEDIUM

**The decision.** FR40 assumes quantities are editable in the cart but tick changes require removing the line and re-adding the pack. FR46 requires the parent to acknowledge price changes at checkout.

**The case against it.** These two interact badly at the worst moment. A parent has spent real effort configuring a twenty-title pack on a phone — the product's signature interaction, per the addendum. At checkout, FR46 tells them a title's price went up. The natural response is to drop that title. Under FR40 they must delete the line and re-tick nineteen checkboxes from scratch. That is the highest-effort, highest-frustration moment in the funnel, at the last step before order placement, on a phone. Some of them just leave. And the pack-configuration component already exists — reusing it on a cart line is far cheaper than the abandonment it prevents.

**What I would do instead.** Resolve Q3 the other way: allow tick editing in the cart line, reusing the pack screen. If that is genuinely too much, at least let the parent untick the specific flagged line at the acknowledgement step.

### 7h. No privacy, terms, or data-retention position — MEDIUM

**The decision.** §7 notes that parent contact details and delivery addresses are personal data belonging to identifiable families, and that v1 stores only what the flow needs. That is the whole position. There is no privacy notice, no terms page, no retention rule, no parent-initiated account or data deletion, and no stated position on Sri Lanka's Personal Data Protection Act (No. 9 of 2022), which is being phased into effect.

**The case against it.** You are collecting home addresses and phone numbers of identifiable children's families, on a free-tier subdomain, with a single unaudited admin credential and no defined retention period, and asking them to open the door to a delivery partner. Three static pages — privacy, terms, delivery/refund — cost almost nothing, materially increase the trust needed to make a stranger's COD order work, and are also the exact gating dependency the addendum records for PayHere in the next cycle. Deferring them saves a day and costs conversion now and a blocked payment integration later. Retention also deserves one sentence: last season's orders are kept for pricing history, which is right, but "kept forever, with no deletion path" should be a decision rather than a default.

**What I would do instead.** Add the three static pages to v1 scope, write one retention sentence into §7, and give the admin a way to delete or anonymise a parent account on request while preserving the order snapshots.

### 7i. Rich animation on the admin's hot screen contradicts NFR4 — MEDIUM

**The decision.** NFR2: both storefront and admin are richly animated; there is no calm-admin split; "the vendor gets the same quality of interface as the parent."

**The case against it.** NFR2 and NFR4 are in tension and the PRD does not acknowledge it. NFR4 wants the open-orders view opened many times a day without friction, and §8 says it is the screen most likely to be opened repeatedly under time pressure. Animation is, by construction, delay with a nice feeling attached. Delight on first use becomes tax on the four-hundredth. The equivocation is in the phrase "same quality of interface" — quality for a parent browsing once a year and quality for an operator working a queue for six weeks are different things, and treating them as the same is a category error dressed as generosity. Add the free tier and a mid-range Android and the animation budget is being spent on the machine least able to afford it.

**Where the author is right.** This is a commissioned app for one owner who will look at this screen more than anyone; making it feel good is a legitimate deliverable and "the admin screen can be ugly" is a real and common failure. I am not arguing for a plain admin.

**What I would do instead.** Keep the aesthetic, budget the motion: no animation on the critical path of the open-orders list (load, status change, count update), animation reserved for transitions the user initiates and waits for anyway. Honour `prefers-reduced-motion`. Set a concrete interaction-latency target for status advancement and hold NFR2 to it, so the two requirements have a defined precedence instead of colliding at implementation time.

### 7j. Unresolved race between parent cancel and admin confirm — MEDIUM

FR67 lets the parent cancel while an order is Order Is Placed; FR57 lets the admin confirm it. Nothing says what happens when both occur within the same second — which is not exotic, since the admin typically taps confirm right after a call in which he just discussed the order with the parent. Given that Cancelled is terminal and Order Confirmed is a freeze point, the outcome differs materially depending on which write lands first, and the PRD is silent. Decide it server-side and write it down: I would let the cancel win if it commits before the confirm transaction, and show the admin a clear "this order was cancelled by the parent" message instead of a generic error.

### 7k. The open questions are in-scope behaviour, not architecture — MEDIUM

§1 sets the delivery bar at "the complete scope described in this document, live and usable — not a pilot slice." Q1 through Q4 are all functional behaviour, and Q1 is described in the PRD's own words as "likely to occur in the first season." A document cannot promise complete scope and leave its most probable first-season incident unresolved. Close all five before build: Q1 → admin-issued reset (item 2); Q2 → keep anonymous browsing, it is right and it is how parents will arrive from WhatsApp; Q3 → allow tick editing in the cart (7g); Q4 → yes, archive uniformly; Q5 → yes, flag staleness (7e).

### 7l. Sequential order IDs need an explicit authorization requirement — LOW

FR48's short sequential ID is the right call for a phone call, and I would keep it. But sequential IDs are guessable, and NFR7 ("a parent can only ever see their own orders") therefore has to be enforced as a server-side ownership check on every order read, not just by not linking to other orders. Say so explicitly so it gets tested, since an enumerable ID plus a missing check exposes every family's name, address, and phone number. Starting the sequence at a non-obvious number, as the `#1042` example suggests, is a nice touch worth keeping.

### 7m. No way to record pickup or a zero delivery charge cleanly — LOW

FR57 makes the delivery price required to confirm. A parent collecting from the shop, or a waived charge, has to be recorded as a typed zero, which is indistinguishable from a mistake — and under the absolute freeze, a zero typed by accident is unfixable. A "collection / no delivery" option on the confirm action costs a radio button.

---

## What I would change before build, in order

1. **Backup, restore, and proven persistence** (7a, item 4). Nothing else in this document survives getting this wrong.
2. **Always-on hosting before the season, not after** (item 4). Reframe as launch cost.
3. **A confirm-and-review step on the delivery price, plus a correctable-with-history freeze** (item 1). Highest value per hour of work in the review.
4. **Admin-issued parent password reset, and a break-glass path for the admin's own account** (item 2). No infrastructure required; closes Q1.
5. **Status history with actor and timestamp, plus a second admin account** (item 5). One schema addition, three problems solved.
6. **Order age, age-sorting, and staleness badges on admin home** (7e, item 3). Trivial to build; makes G3 and CM3 real.
7. **Admin internal notes and a contact-attempt record** (7b). The notebook's killer feature, brought inside.
8. **Admin ability to place an order for a parent** (7c). Removes the last honest reason to keep a parallel list.
9. **WhatsApp click-to-chat deeplinks** (item 3). Outbound messaging with zero integration.
10. **Login by phone or email; make email optional** (7d). Aligns identity with the field the business actually verifies.
11. **Parent cancel through Processing, then cancel-requests; record `cancelled_by` and reason categories** (item 6).
12. **Tick editing in the cart** (7g), **privacy/terms/delivery pages** (7h), **rate limiting** (7f), **motion budget** (7i), **the cancel/confirm race rule** (7j).

Items 1 through 5 are the ones I would refuse to hand over without. Everything else can be argued.

## Closing position

The domain modelling in this PRD is better than most commissioned v1 documents I read: the snapshotting, the pack customisation flow, the cart-line cloning, and the counter-metrics show someone who understood the business before writing requirements. My objections cluster almost entirely in one place — the gap between a well-modelled system and a system that survives six weeks of one tired human operating it alone on free infrastructure with no way to undo a mistake, no way to write a note, no way to get back in, and no copy of the data.

Three of the decisions under review are not trade-offs but unbounded exposures: an admin lockout whose documented remedy can destroy the order book, a season's data on a single ephemeral file with no backup, and a freeze whose only recovery path is the precise failure the product was commissioned to prevent. Those need to change. The rest — the polling, the single account, the cancel window — are defensible if and only if the cheap mitigations above are built, because each of them currently relies on the vendor's memory being perfect during the only weeks of the year when it will not be.
