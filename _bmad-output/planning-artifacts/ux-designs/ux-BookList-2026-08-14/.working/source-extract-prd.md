# UX Source Extract — PRD + Addendum

**Sources:**
- `prd-BookList-2026-08-14/prd.md` (323 lines)
- `prd-BookList-2026-08-14/addendum.md` (75 lines)

**Extraction date:** 2026-08-14  
**Rule:** Extraction only. No design proposals. SILENT = source does not state.

---

## 1. Product in one line

Per §1 Context and Goals (prd.md L12–24):

> "Book List is a **commissioned web application**, built to the requirements of one bookshop owner who supplies private-school book lists."

> "**It is an order trap, not a bookstore.** Everything in this document serves the capture and survival of orders the vendor has already won."

> "The application does not replace the vendor's confirmation call. **It makes that call the only call.**"

> "**Packs are the main job.** Individual items are a real but secondary catalog; the product exists for the school packs."

Differentiator (prd.md L20): "**Per-title customisation is the differentiator — not booklist ordering itself.**"

---

## 2. Users / personas

### The parent (prd.md §2, L48–48)

- "A **private-school family** buying this year's prescribed editions, or buying only stationery from the same shop."
- Needs: "find their own school's pack, drop titles they already own, adjust quantities, and order for more than one child without the second list overwriting the first."
- "They **self-register** and manage their own account."

### Named protagonist: Nimali (prd.md UJ-1, L58–68)

- "Nimali has **two children at the same private school, in different grades**, and the term starts in three weeks."
- Opens site on phone in evening; registers with name, address, WhatsApp; selects school from dropdown; filters by grade; configures two packs + pens; checks out; receives order number; vendor calls next morning; watches order through pipeline; pays cash on delivery.

### The admin (prd.md §2, L50–50)

- "The **vendor**, and the **only operator**. **One account, no staff roles**."
- Works from "daily view of open orders — his **'today list'**"; calls each parent once for final price; advances every order to Delivered or Cancelled; maintains entire catalog himself.

### The delivery partner (prd.md §2, L52–52)

- "**Not a user** of the application and **has no login**."
- Receives parent's WhatsApp number from shop; delivers; collects cash; reports drop-off to admin.

### Constraints on roles (cross-references)

- Parent recovery via admin only (§8, FR10) — no reset email.
- Admin cannot create orders on parent's behalf (FR55, §13).
- Single admin account seeded at deployment; no admin registration screen (FR8).

---

## 3. Form factor & platform

### Stated

| Aspect | Source | Verbatim / summary |
|--------|--------|-------------------|
| Form factor | prd.md §1 L12 | "commissioned **web application**" |
| Parent device | prd.md NFR1 L264 | "**mobile-first**. Parents will predominantly order on **phones**." |
| UJ-1 | prd.md L60 | "opens the site on her **phone**" |
| Cross-device cart | prd.md FR38 L153 | "A cart built on a phone is still there on a **laptop**." |
| Both interfaces | prd.md NFR2 L265 | "**Both the storefront and the admin interface**" |
| Hosting | prd.md §9 L256; addendum L15 | Bonto free tier: Node.js, 50 hrs/month, auto-sleep, 0.5 CPU, 512MB; first URL **`booklist.bonto.run`** |
| Stack (addendum L14–16) | Thin starter: Express, SQLite, static `public/` HTML; "**cannot be a static site**, so Node mode is required" |
| Cold start | prd.md §9 L257 | "After an idle period the **first request pays a cold start**, on a **mobile-first storefront**" |
| Production path | addendum L17 | Later Bonto Glitch plan: custom domain, always-on |

### SILENT

- Specific browsers or browser versions
- Tablet-specific treatment
- Desktop as primary admin form factor (admin device not specified)
- PWA / install-to-homescreen
- Offline mode
- Native apps
- Screen size breakpoints
- Touch vs mouse as explicit input modality (phone/laptop implied only)

---

## 4. Functional scope → implied surfaces

For each surface: **name**, **requirement(s)**, **explicitly named vs implied**.

### Parent / storefront surfaces

| # | Surface | Requirement(s) | Named? |
|---|---------|----------------|--------|
| P1 | **Pack discovery** (school dropdown + grade filter) | FR29, FR35 | Implied; UJ-1 "selects her school from the dropdown", "filters to her elder child's grade" |
| P2 | **Pack detail / selection screen** ("pack screen") | FR31–FR34, NFR6; addendum L40–41 | **Explicit** in NFR6 ("pack screen"); signature interaction in addendum |
| P3 | **Individual items page / catalog** | FR36, FR37; UJ-1 L64 "items page" | **Explicit** "items page" in UJ-1 |
| P4 | **Cart** | FR38–FR44 | Implied; UJ-1 "adds … to her cart" |
| P5 | **Checkout** | FR45–FR53 | Implied; UJ-1 "At checkout" |
| P6 | **Parent registration** | FR1 | Implied; UJ-1 "registers" |
| P7 | **Parent login** | FR2, FR4 | Implied |
| P8 | **Parent profile / account settings** (name, address, WhatsApp, second phone, password) | FR5, FR6, FR7 | Implied ("manage their own account" §2) |
| P9 | **Parent order list** (all orders incl. Delivered/Cancelled) | FR68 | Implied |
| P10 | **Parent order detail** (lines, totals, pipeline position, cancel, cancel reason) | FR69–FR73, FR71 | Implied; UJ-1 "watches the order move through the pipeline" |
| P11 | **Public browse** (schools, grades, packs, items without account) | FR3 | Implied |

### Admin surfaces

| # | Surface | Requirement(s) | Named? |
|---|---------|----------------|--------|
| A1 | **Admin login** | FR8 (seeded creds, no registration) | Implied |
| A2 | **Admin recovery** (single-use recovery code entry) | FR74 | Implied |
| A3 | **Admin home / today list** (open orders, grouped by status, counts) | FR56, FR57; addendum L39 | **Explicit** "today list", "home screen" (FR56) |
| A4 | **Admin completed orders view** (Delivered + Cancelled) | FR58 | **Explicit** "separate view" |
| A5 | **Admin order detail** (parent contact, lines, notes, status actions, delivery price entry, call-attempted) | FR59–FR66, FR60–FR61 | Implied; UJ-2 "opens the order" |
| A6 | **Admin schools list / management** | FR13, FR28 | Implied |
| A7 | **Admin grades list / management** | FR14, FR28 | Implied |
| A8 | **Admin book master list / management** | FR15, FR16, FR28 | Implied ("book master") |
| A9 | **Admin packs list / create-edit** | FR17–FR20, FR28 | Implied |
| A10 | **Admin individual items list / management** | FR21–FR24, FR28 | Implied |
| A11 | **Admin password change** | FR9 | Implied |
| A12 | **Admin parent password reset** (from parent's record) | FR10 | Implied |
| A13 | **Admin export** (download orders + catalog) | FR67 | Implied ("export … as a downloadable file") |

### Surfaces explicitly excluded (not to build in v1)

- Admin registration screen (FR8)
- Delivery-partner login (§6 T1, §13)
- Loose-books catalog page (FR23, §13)
- Phone-order entry by admin (FR55, §13)
- Payment collection UI (FR54 — cash on delivery, app handles no payment)
- Image upload anywhere in catalog (FR26)
- Free-text / smart search (FR30, §13)

**Surface count: 24** (11 parent-facing including public browse, 13 admin-facing). Catalog admin counted as five distinct list/management surfaces per FR28 ("Every catalog list").

---

## 5. User journeys / flows already described

### UJ-1: Nimali orders for two children (prd.md §3, L58–68)

**Order preserved from source:**

1. Opens site on phone in evening
2. Registers: name, address, WhatsApp number
3. Selects school from dropdown
4. Filters to elder child's grade → opens pack
5. Every title already ticked; unticks two owned titles; bumps atlas to 2 copies
6. Adds pack to cart
7. Goes back; switches grade filter; opens younger child's pack
8. Adds second pack (separate cart line, first untouched)
9. Adds pack of pens from items page
10. Checkout: sees goods total; line "delivery charge will be confirmed by the shop"; address shown; adds note (delivery after five)
11. Places order → short order number
12. Next morning: shop calls once; vendor reads order number, states total incl. delivery; she agrees
13. She never rings shop; watches order through pipeline until door delivery; pays cash

### UJ-2: The vendor's daily pass (prd.md §3, L70–76)

1. Opens app with morning tea
2. First thing: count — "four orders awaiting confirmation, two ready to deliver, one on the partner"
3. Works the four confirmation orders:
   - Opens order → sees parent name, WhatsApp, everything selected → calls
   - One no answer → marks call attempted → moves on
   - Three agree → types delivery price → sets Order Confirmed
4. Packs confirmed ones, advancing status as he goes
5. Partner reports drop-off → marks Delivered → leaves list
6. "Nothing is written on paper"

### Order lifecycle pipeline (prd.md §6, L203–214)

Statuses in order: Order Is Placed → Order Confirmed → Processing → Packing The Order → Ready To Deliver → On Delivery Partner → Delivered; plus Cancelled (terminal).

Key flow rules affecting UX:
- Parent may cancel only while Order Is Placed (FR72)
- Admin sets Order Confirmed + delivery price in same action (FR61)
- Forward steps 3–6 may skip intermediates (T3)
- Delivered/Cancelled require confirmation prompt (FR65)
- Parent cancel vs admin confirm race — first wins, other rejected with explanation (T8)

### Parent account recovery flow (§8, FR10)

Parent contacts shop → admin resets password from parent's record → communicates new password. No self-service reset.

### Admin recovery flow (FR74, §8)

Vendor enters single-use recovery code (kept outside app) → sets new password → fresh code issued.

### Checkout staleness flow (FR49)

Before place: compare cart vs catalog → flag archived/removed/repriced lines → unavailable must be removed; repriced require explicit acknowledgement → nothing silently substituted or repriced.

---

## 6. Data & content shape

### Entities and fields the UI displays or captures

**Parent account (FR1, FR5):**
- Name, delivery address, WhatsApp number, email, password
- Optional second phone number

**School (FR13):** admin-typed; rename, archive

**Grade (FR14):** admin-typed, unbounded (not predefined 1–13); scoped to school for discovery

**Book master record (FR15):**
- Title (carries edition — "specific prescribed edition")
- Price
- Shared across packs; no per-pack price override

**Pack (FR17–FR18):**
- Admin-typed name, school, grade, short description
- Set of books from master
- **No stored price** — displayed price = sum of books; falls as parent unticks
- Per-title line total + running pack total on pack screen (FR33)

**Individual item (FR21):**
- Title, description, price
- Separate from book master; never in packs

**Cart line (FR39–FR40, glossary):**
- Pack line: independent tick set + quantities per title; repeated adds = separate lines with distinguishable labels
- Item line: merges by quantity on repeat add
- Quantity range **1–20** per title/item (FR32, FR37)
- Running goods total (FR43)

**Order (FR48–FR51, FR59, FR69, §7):**
- Short sequential ID (e.g. `#1042`) — "read aloud during the confirmation call"
- Optional free-text order note (one)
- Snapshotted: pack names, book/item titles, unit prices, quantities, delivery address, contact numbers
- Goods total at placement; delivery charge at confirmation; payable total = goods + delivery
- Status; cancel reason (admin); admin free-text notes; call-attempted timestamp

**Admin order actions capture:**
- Delivery price (required, non-negative) at confirmation (FR61)
- Cancel reason — short, required (FR64)

### Scale / volume hints

- Pack may have "realistically **long book list**" (NFR6)
- Two+ cart lines for same pack (second-child flow) — FR39–FR40
- Today list: all non-terminal orders regardless of age (FR56) — unbounded count implied
- Buying season: ~six weeks compressed demand (addendum L60); vendor checks daily
- Grade options filtered to grades with live packs for chosen school (FR29) — bounded per school
- No stock/inventory counts in v1 (§13)

### Content explicitly absent

- No book cover images (FR26, §13)
- No payment method selection (cash on delivery only, FR54)
- No delivery fee at checkout (FR46)
- No per-order address override or address book (FR7, addendum L70)

---

## 7. States the PRD implies

| State | Source | Requirement detail |
|-------|--------|-------------------|
| **Empty — no packs for school/grade** | FR35 | "explanatory empty state, not a blank screen" |
| **Empty — cart** | FR44 | "defined empty state that routes the parent back to pack discovery" |
| **Empty — catalog lists (admin first run)** | FR28, §11 L281 | "Every catalog list has a defined empty state that tells the admin what to add and how" |
| **Empty — no open orders** | §11 L281 | "no open orders" |
| **Empty — no past orders** | §11 L281 | "no past orders" |
| **Loading / cold start** | §9 L257 | Auto-sleep cold start on first request — user-visible cost; **no specific loading UI defined** |
| **Form validation error** | FR12, §11 L280 | Inline failures; server-side too; "without losing what they typed" |
| **Locked last title** | FR31, FR32, NFR4 | Last remaining ticked title checkbox locked; minus at qty 1 locked; must explain visibly (NFR4) |
| **Quantity cap reached** | FR32 | Plus disabled at 20 "with the cap visibly stated" |
| **Checkout — unavailable cart line** | FR49 | Archived pack/item/book or removed from pack — must remove before placing |
| **Checkout — repriced line** | FR49 | Requires explicit acknowledgement of new figure |
| **Duplicate submission** | FR52 | Idempotent place order — implied success without duplicate |
| **Session expired mid-checkout** | §11 L283 | Return to cart intact after re-login |
| **Rejected status transition** | T7, §11 L282 | Stale view rejected "with an explanation, not silently applied" |
| **Parent/admin race** | T8 | Loser "rejected and its actor is told what happened" |
| **Pre-confirmation delivery charge** | FR70 | Order detail states delivery charge "still to be confirmed by the shop" |
| **Post-confirmation totals** | FR62, FR69 | Payable total visible once delivery price set |
| **Call attempted vs never called** | FR60 | "must not look identical" |
| **Parent cancel available** | FR72 | Only while Order Is Placed |
| **Admin cancel shown to parent** | FR73 | Cancelled status + reason |
| **Terminal action confirmation** | FR65 | Delivered/Cancelled require confirmation prompt |
| **Success — order placed** | FR51, FR53 | Short order number; status Order Is Placed; cart emptied |
| **Auth required for cart** | FR3 | Browse without account; cart requires login |
| **Parent data isolation** | NFR9 | Parent sees only own orders, cart, profile |

### SILENT on UI treatment for

- Offline
- Permission-denied pages (beyond auth gate NFR8)
- Generic network failure
- 404 / not found
- Admin export in-progress / failure

---

## 8. NFRs and constraints touching UX

### From prd.md §10 (L263–275)

- **NFR1:** Mobile-first storefront
- **NFR2 [Should]:** "Both the storefront and the admin interface are **richly animated and visually polished**"; "feel a cut above what this market offers"; unpleasant admin screen → vendor returns to phone (CM1)
- **NFR3:** Interactions like modern app — "**not full page reloads**" for ticking, stepping quantities, advancing status
- **NFR4:** "**Never silently undo or refuse** a parent's action" — visible explanation for locked title, quantity cap, unavailable line
- **NFR5 [Should]:** Admin today list loads quickly for many opens/day
- **NFR6:** Pack screen responsive with long book lists; continuous total recalculation
- **NFR7:** Motion serves interaction; never delays vendor work or parent checkout
- **NFR8:** Session required for authenticated pages
- **NFR9:** Parent sees only own data
- **NFR11:** All rules enforced server-side; UI may mirror for feedback

### §11 Validation, empty and error states (L276–283)

Explicit mandate that empty and failure states be defined — listed in §7 above.

### §9 Operating constraints (L254–260)

- Bonto free tier limits; auto-sleep cold start on mobile storefront
- No telemetry v1
- No alerting — vendor checks daily
- Seasonal burst (~6 weeks) vs 50 hrs/month

### §8 Access (L244–252)

- **No email, SMS, or WhatsApp** from application v1
- No password-reset email; no email verification
- Personal data stored: name, address, WhatsApp, optional second phone, email
- Single admin sees all parent PII

### §13 Out of scope affecting UX

- No notifications when order arrives (deferred)
- No in-app delivery-fee calculation
- No stock/inventory display
- No free-text/smart search
- No per-book cover images
- No online payment in v1

### Addendum technical constraints (L12–21)

- Single currency; no tax
- Export format/delivery = architecture decision (requirement: downloadable complete copy)

### SILENT

- Accessibility (WCAG, screen readers, contrast)
- i18n / localization / UI language
- Dark mode
- Print styles
- Push notifications
- Voice input
- Barcode/scan
- Keyboard shortcuts
- Explicit performance budgets (ms targets)
- Cookie/consent banners

---

## 9. Explicit UX/UI decisions already made

### Interaction patterns (locked by requirements)

| Decision | Source |
|----------|--------|
| School dropdown then grade filter; no free-text search v1 | FR29, FR30 |
| Pack opens with **all titles pre-selected**; untick to subtract | FR31 |
| **Locked last title** — cannot untick last remaining selection | FR31, FR32 |
| Quantity **stepper 1–20**; plus disabled at 20 with cap visible | FR32 |
| Per-title line total + running pack total on pack screen | FR33 |
| Add pack to cart as single action | FR34 |
| Repeated same-pack adds = **separate cart lines**, never merge | FR39 |
| Repeated pack lines need **distinguishable labels** | FR40; addendum L42 suggests "along the lines of 'Pack 2 of Grade 1'" |
| Item repeat-add merges quantity (not new line) | FR37 |
| Changing ticks in cart requires remove line + re-add pack | FR42 |
| Checkout shows goods total only + **literal line** *"Delivery charge: to be confirmed by the shop"* | FR45 (quoted in FR45 and addendum L41) |
| Account address shown at checkout; **no per-order override** | FR47, FR7 |
| One optional free-text order note | FR48 |
| Short sequential order ID for reading aloud | FR51; addendum L43 |
| Place Order idempotent | FR52 |
| Cash on delivery; no payment UI | FR54 |
| Admin home = today list; grouped by status with counts [Should] | FR56, FR57 |
| Call attempted recorded; must visually differ from never called | FR60 |
| Delivery price + Order Confirmed in **same action** | FR61 |
| Delivered/Cancelled need confirmation prompt | FR65 |
| Parent sees pipeline position as admin advances | FR71 |
| Parent self-cancel only at Order Is Placed | FR72 |
| Inline form validation; no discarding input | FR12 |
| SPA-like updates for tick/step/status | NFR3 |

### Tech / delivery choices affecting UX build

| Decision | Source |
|----------|--------|
| Express + SQLite + static `public/` HTML | addendum L14 |
| Node on Bonto (not static site) | addendum L16 |
| Mobile-first | NFR1, addendum L37 |
| Rich animation both sides [Should — cut line if needed] | NFR2, §12 L290 |
| No images in catalog v1 | FR26 |
| Server-persisted cart (not browser-local) | FR38, addendum L30 |

### Brand / identity (partially locked)

| Decision | Source |
|----------|--------|
| App name: **Book List** | addendum L47 |
| Icon: **pile of books** (locked over folded-corner checklist concept) | addendum L47–48 |
| **No logo** yet; illustrated pile-of-books mark = Could tier | addendum L48; §12 L292 |
| Palette deep navy + school-bag mustard: **unsettled** (Q1) | §14 L308; addendum L49 |

### MoSCoW cut line (§12)

If build runs long, trim: grouped/count today list (FR56–57), archive-as-hide polish, rich animated interface (NFR2) — "a plain sorted order list would still function."

---

## 10. Voice / tone / brand signals

### Product framing (prd.md §1)

- "**order trap, not a bookstore**"
- Not trying to "beat other bookshop websites"
- Vendor problem: "losing orders that were already agreed"
- Phone is "a poor capture tool"; product closes gap vs fixed bundles and photo-upload competitors

### Quality bar (NFR2, addendum L37–38)

- Should "feel **a cut above what this market offers**"
- Admin UI quality is "**load-bearing, not cosmetic**" — unpleasant admin → back to phone (CM1)
- Vendor ambition: site feels above market (addendum L37)

### Interaction voice (NFR4, addendum L40)

- Explanations over silent refusal for locked title, cap at 20, unavailable lines
- Checkout copy sets expectation: delivery charge confirmed later — parent "not surprised later" (FR45)

### Trust / transparency themes

- "Never silently substituted or silently repriced" (FR49)
- Absolute freeze at Order Confirmed — deliberate trust choice (§6 T9, Accepted consequence L232)
- No forensic "leak-hunt" — vendor wants orders in a list (§1 Non-goals L40)

### SILENT

- Formal brand voice guidelines
- Microcopy tone (friendly vs formal)
- Error message wording specifics (beyond "defined failure message" §11)
- Marketing copy style

---

## 11. Open UX questions

### Tagged in source

**Q1 (prd.md §14 L308–308):** "Is the **deep-navy and school-bag-mustard palette** still the direction? It was attached to a logo concept that was **rejected** in favour of the pile-of-books icon, so its status is **genuinely unsettled**. Owner: whoever writes the UX spec."

**Logo (addendum L48, §12 L292):** "The site has **no logo and needs one defined**." Illustrated pile-of-books mark is Could tier.

**Cart line labels (addendum L42):** Distinguishing label needed "along the lines of **'Pack 2 of Grade 1'**" — phrasing not locked.

**Further filters (FR29 L138):** "**Further filter parameters may be added later.**"

**Export UI (addendum L21):** "Format and delivery are an **architecture decision**" — UX for trigger, progress, filename SILENT.

### Gaps noticed (neutral questions; options open)

1. What is the parent-facing **information architecture / navigation** between discovery, cart, orders, and profile?
2. How is **order pipeline position** presented to the parent (FR71) — list labels only, stepper, timeline, or other?
3. What is the **visual treatment** for "call attempted" vs "never called" on admin order detail (FR60)?
4. What does **checkout staleness UI** look like when FR49 flags archived, removed, or repriced lines — modal, inline banner, per-line?
5. Where does **admin export** live in the admin IA (global action, settings, per-list)?
6. How does the parent reach **order history** — dedicated nav item, post-checkout only, account menu?
7. What is shown during **auto-sleep cold start** — spinner, skeleton, message? (§9 acknowledges cost; no UI spec)
8. What is the **admin catalog IA** — single hub with tabs, separate pages, or other?
9. Is **admin password reset for parents** accessed from order detail, a parent search/list, or both (FR10)?
10. What **copy** appears for locked-last-title and quantity-cap explanations (NFR4 requires visibility; wording SILENT)?
11. Does the storefront need **terms, refund, and privacy pages** in v1? (Mentioned in addendum L62 re PayHere gating for deferred payments — v1 has no online payment)
12. What **language** is the UI in (Sri Lankan context implied by market research; UI locale SILENT)?
13. What happens on **admin recovery code** first display at deployment — separate screen vs setup flow (architecture concern; UX SILENT)?
14. How are **admin free-text order notes** displayed vs parent-visible order note (FR48 vs FR60)?
15. What is the **empty-state routing** destination copy/action for cart → pack discovery (FR44 — destination stated, presentation SILENT)?

**Open question count: 18** (1 tagged Q1 + 2 semi-open from addendum + 15 gaps).

---

## Traceability index (key sections)

| PRD section | Lines (approx) | UX relevance |
|-------------|----------------|--------------|
| §1 Context and Goals | 10–44 | Product framing, non-goals |
| §2 Users and Roles | 46–52 | Personas |
| §3 User Journeys | 54–76 | Flows, named protagonist |
| §5 Functional Requirements | 95–197 | Surfaces, interactions, data |
| §6 Order Lifecycle | 199–232 | Pipeline, states, races |
| §7 Pricing and Snapshots | 234–241 | Totals display rules |
| §8 Access and Recovery | 243–252 | No messaging, PII |
| §9 Operating Constraints | 254–260 | Cold start, seasonality |
| §10 NFRs | 262–275 | Mobile-first, animation, feedback |
| §11 Empty/Error States | 276–283 | State mandate |
| §12 Priority / Cut line | 285–292 | Should vs Must UI polish |
| §13 Out of Scope | 294–304 | Excluded surfaces |
| §14 Open Questions | 306–308 | Palette Q1 |
| §15 Glossary | 310–322 | Term definitions |
| Addendum UX material | 35–49 | Brand, signature interactions |
| Addendum market | 51–63 | Context only (Sri Lanka, season) |
