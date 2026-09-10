---
title: "Book List — addendum (locked product rules)"
status: ready
created: 2026-08-14
updated: 2026-08-14
---

# Addendum: locked product rules

Source: brainstorm memlog `brainstorm-book-list-school-packs-2026-08-13` plus brief-session decisions. These belong in the PRD, not the 1–2 page brief.

## Positioning

- App name: Book List. Icon: a pile of books.
- Job: built to one bookshop owner’s requirements. Capture and track every school book-pack order so he does not miss work that used to arrive by phone.
- Primary market: this customer’s private-school parents, who must buy specific editions from a school book list. Not a multi-shop product.
- Deploy: Bonto free tier first (`*.bonto.run`) as staging. Custom domain + always-on is a later upgrade to Bonto Glitch plan when the vendor asks for production. Same app, no rewrite.
- Stack constraint: one Node process + SQLite. Thin starter. Rich animated UI on both shop and admin.

## Auth and account

- Must log in before placing an order.
- Signup requires: name, address, WhatsApp number; second phone optional.
- Login: email + password only. WhatsApp is not a login identity.
- Delivery partner is not a user of the app. They receive the parent’s WhatsApp number from the shop and report drop-off back to the admin, who marks **Delivered**.
- One admin account. No staff roles in v1.
- No password-reset email in v1.

## Packs and catalog

- Opening a pack pre-selects every book. Parent may uncheck titles they do not need.
- The last remaining selected book cannot be unticked (locked checkbox). To drop it, tick another title first.
- Each ticked title starts at qty 1. Stepper 1–20. Plus disables at 20 with a visible cap. Minus at 1 unchecks, except on the last remaining title where minus is locked.
- Cart may hold more than one pack. Same pack may be added more than once; each add clones a new cart line with its own ticks (second-child order). Lines never merge by quantity.
- Goods total = selected pack books (qty × unit price) + individual items. Unchecked pack books do not count. Admin “pack final price” is an all-selected preview, not a discount that survives unchecking. Payable total is goods + delivery, written onto the order at **Order Confirmed**, not at checkout.
- Separate **individual items** catalog — not the book master, not a pack. Pens, pencils, and similar shop stock. Admin fields only: product title, description, price. No images in v1. Same cart and checkout as packs; same qty 1–20.
- A pack is **not mandatory**. Main focus is packs; an order may be pack(s) only, individual items only, or mixed. Books themselves sell inside packs (school-list editions). Individual items do not go into packs.
- A pack is not “Grade 5.” It is **School/Institute + Grade**, plus a short description (what the pack is for, extra detail).
- School/Institute is an admin-managed list that behaves like an enumeration: when the admin adds a school, that value becomes an option. It is not a hardcoded code enum and not free text on the pack. Counts are unbounded.
- Grade uses the same pattern: admin adds a grade, it becomes a dropdown option. Not a predefined 1–13 list, because international/private naming varies.
- Parent browse: dropdown to pick which school they are finding packs for, then dropdown to filter by grade. More filter parameters later. This is structured filter, not free-text smart search.
- Admin may add, keep, or archive packs at will. New year = new pack; old pack is archived (hidden from shop), not hard-deleted. Past orders keep name + book/price snapshot.
- No per-book image uploads. No free-text smart search in v1.

## Money and delivery (v1)

- Payment method: cash on delivery.
- Online payment gateway is explicitly next-cycle, not v1.
- Checkout still does **not** calculate delivery. It shows the goods total and a note that a delivery charge will be confirmed by the shop.
- After Place Order, the **admin calls the parent once** and communicates the final price (goods + delivery). The parent does not call the shop. Admin then sets **Order Confirmed** and enters the delivery price on the order. The order total updates to goods + delivery. That is the first complete payable figure in the app.
- WhatsApp number is how the shop places that one confirmation call, and how the delivery partner coordinates drop-off. The partner is not an app user.
- Cash is collected on delivery. No separate “paid” status in v1; money is implied by **Delivered**.

## Order status (parent-visible)

Admin advances status. Parent can see it on the order. There is no delivery-partner login in v1.

Happy path (v1):

1. Order Is Placed
2. Order Confirmed (delivery price entered; order total becomes goods + delivery)
3. Processing
4. Packing The Order
5. Ready To Deliver
6. On Delivery Partner
7. Delivered (success terminal — partner has confirmed drop-off)

Failure terminal:

- Cancelled — admin could not deliver, for some reason. Admin-set, not parent self-serve.

Deferred: push/notify admin when a new order arrives. v1 assumption is the admin opens the app and checks daily.

Locked: delivery partner has no login; they tell the shop, and the admin marks **Delivered**. Cancelled may be set by admin from any non-terminal status.

## UI

- Mobile-first storefront. Rich UX, lots of animation — not plain page reloads.
- Admin gets the same rich animated interface. No calm/plain admin split.
- Admin home is today’s orders (new / in progress), not the catalog.

## Explicitly out of v1

- Password-reset email
- Per-book cover image uploads
- Free-text / smart search (school + grade filter is in v1)
- Custom domain at launch
- In-app delivery-fee calculator at checkout (admin types delivery price at Order Confirmed)
- Stock / inventory
- Extra admin accounts / roles
- Payment gateway
- Push or WhatsApp notify when a new order lands (admin polls)
