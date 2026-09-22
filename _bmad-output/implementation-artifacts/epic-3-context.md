# Epic 3 Context: Build a cart that survives the evening

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Parents can build a durable cart after login: each configured pack becomes its own cloned line (so a second child’s pack never overwrites the first), individual items merge by quantity on the same cart, and the cart lives on the account across devices. They can remove lines, adjust quantities within rules, see a running goods total, and meet a defined empty state. Checkout and Place Order are out of scope — those belong to Epic 4.

## Stories

- Story 3.1: Add a configured pack to the cart
- Story 3.2: Add individual items to the same cart
- Story 3.3: A cart that persists, totals, and can be emptied

## Requirements & Constraints

- Adding anything requires an authenticated parent session. Browse remains anonymous; cart does not.
- Pack add clones the configured pack at add time: pack identity, per-book included flag and quantity (1–20), and add-time titles and unit prices. It is not a live pack pointer. Last remaining ticked title cannot be removed; quantity cap 1–20 is enforced on the server, not only in the UI.
- The same pack may be added repeatedly; each add creates a **new** line with its own ticks and quantities — pack lines never merge. Labels use the exact shape `Pack 1 of Grade 5` / `Pack 2 of Grade 5`.
- Individual items join the same cart. Re-adding an item already present **merges** quantity on that line (still capped at 20). Items never merge with pack lines or become pack members. Pack-only, items-only, and mixed carts are all valid.
- Changing which titles are ticked on a pack line requires removing the line and adding the pack again. Quantity edits within a cloned pack (1–20, locked last title) and item-line quantity edits are allowed; any pack or item line can be removed.
- Cart is stored against the account (survives sessions and devices), not browser storage. Reading the cart must not silently rewrite stored add-time titles or unit prices; live-catalog staleness handling waits for checkout (Epic 4).
- Goods total = sum of ticked pack titles (qty × unit price) + item lines (qty × price). Unticked titles contribute nothing. Amounts render as `Rs.` with comma thousands and no decimals.
- Empty cart shows verbatim `Cart is Empty` plus a refresh icon — **no** button that routes to Browse.
- Failures never add silently; API errors use `{ error: { code, message } }`. Parents see only their own cart.
- Cap message when plus is disabled at 20: `Item count exeeded, you can only order 20 per item` (spelling as specified).

## Technical Decisions

- Domain ownership: the `cart` module owns the authenticated parent’s saved lines (configured pack clones and merged items). Build order is identity → catalog → cart → orders; `cart` depends on `catalog` and `identity`, never the reverse.
- Pack line = clone of configuration at add; item line = merge by item id + quantity. Both store add-time titles and unit prices. GET may later annotate live catalog state for checkout, but must not rewrite stored figures.
- Auth is the identity session cookie (`booklist.sid`); cart routes require a session. Parent authorization (own cart only) is enforced in the module.
- Same-origin JSON under `/api/*` with cookie credentials; success bodies camelCase; rules enforced in `cart`, not only in React.
- Persistence is SQLite via the shared connection; cart data is durable with the account, not an offline/local store. No PWA / service worker.

## UX & Interaction Patterns

- Cart tab shows a line-count badge. Phone: bottom tabs Browse / Cart / Orders / Account; at ~760px+ the same four become top nav.
- Unauthenticated Add to cart (pack or item): auth gate offers Log in and Create account. After success, return to **the same pack or items surface**; do **not** auto-add — parent taps Add again. (Other authed-tab logins land on packs; cart still persists server-side.)
- Pack cart lines: first line’s chip is ink fill with mustard text; a repeat line for the same pack inverts to mustard fill with navy text and a strong edge. Show composition meta such as `6 of 8 titles · atlas ×2`. In-row Remove is danger text (44px target), not a second primary.
- Quantity steppers stay 44×44 at both ends when disabled. Totals may count up; honour `prefers-reduced-motion`.

## Cross-Story Dependencies

- Depends on Epic 1 (accounts/sessions/auth gate) and Epic 2 (pack configuration and items catalog; Add to cart is explicitly not in Epic 2).
- Story 3.1 establishes pack-line clone semantics and the auth-gated add path; 3.2 extends the same cart with mergeable item lines; 3.3 needs lines from either/both and owns persistence, goods total, in-cart edits, remove, and empty state.
- Epic 4 consumes this cart for checkout, staleness resolution, Place Order, and emptying the cart on successful place — do not implement those here.
