---
title: 'Checkout — address, delivery line, note, and stale lines'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: 'e1ba76eeecf7b290e93dbdfa309fff5e354c723b'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Parents have a cart with totals but no checkout. Nothing tells them that a line went stale because its pack, book or item was archived, removed or repriced after they added it.

**Approach:** The `cart` module gets a read-only `GET /api/cart/checkout` that annotates each line against the live catalog, explicit accept-price routes, and an exported readiness guard for Story 4.2's Place endpoint. A new `/cart/checkout` page shows the account address, the fixed delivery line, the goods total, an optional note, inline stale-line notices, a summary banner, and Place Order. Place Order stays in place as the blocked primary while any line is still flagged.

## Boundaries & Constraints

**Always:**
- Session parent only.
- The staleness logic lives in `cart` and reads the catalog only through `server/catalog/*` TS functions, never its tables.
- GET never writes, and the 3.3 `GET /cart` shape stays byte-identical. Goods total stays add-time.
- **Flag rules** (a line has at most one flag, and unavailable wins):
  - A pack line is `unavailable` when `getBrowsePack` returns undefined (pack, school or grade archived, or the pack is gone) or an **included** member's book is missing from its live `books`.
  - A pack line is `repriced` when an included member's stored `unitPrice` differs from the live book price.
  - An item line is `unavailable` when `getLiveItem` returns undefined, and `repriced` when its price differs.
  - Unticked members are never inspected.
- **Accept-price** rewrites only the stale stored `unit_price` values, and only when the client's expected figure still matches live. Otherwise it returns `409 conflict` and changes nothing.
- **Checkout copy:**
  - The fixed line `Delivery charge: to be confirmed by the shop` sits on an accent-quiet strip with a 2px border-default edge, above the goods total. No delivery figure appears anywhere.
  - Totals use `formatRupees`.
  - The address is read-only text from `GET /api/parents/me`.
  - The note is one optional `<textarea>` kept in page state and preserved across refetches. It is sent to the server only in 4.2.
- **Stale-line UI:**
  - Unavailable line: danger notice and `Remove this line` (secondary).
  - Repriced line: warning notice, `Accept Rs. {newLineTotal}` (primary) and `Remove this line` (secondary).
  - Summary danger banner: `{n} line(s) still need attention`. It stays until `n` is 0.
  - Blocked Place Order: same size and position, `aria-disabled="true"` (still focusable), and `aria-describedby` pointing at a visible reason. The banner region is `aria-live="polite"`.
- Remove reuses the 3.3 DELETE routes. After any change the page refetches and calls the badge `refresh()`.
- Errors use `{ error: { code, message } }`.

**Ask First:** A new runtime dependency. Any migration. Changing the `GET /cart` response or the 3.x add/edit semantics.

**Never:**
- `POST /api/orders`, order snapshots, `Idempotency-Key`, emptying the cart on Place, or wiring Place's click (all Story 4.2).
- An address override field.
- A delivery estimate.
- Silently rewriting prices or substituting titles.
- A modal for staleness.
- Browser storage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean | Lines all match the live catalog. | `200 { lines, goodsTotal, attentionCount: 0 }`. Each line is the 3.3 line plus `stale: null`. | N/A |
| Pack archived | The pack, its school or its grade is archived. | That line has `stale: { kind: 'unavailable' }`, and `attentionCount` counts it. | N/A |
| Book gone | An included book is archived, removed from the pack, or deleted. | `unavailable`. | N/A |
| Unticked book gone | Only an unticked member is archived or repriced. | `stale: null`. | N/A |
| Repriced | An included book goes from 1,500 to 1,600 at qty 2, so the line was 3,800. | `stale: { kind: 'repriced', lineTotal: 4,000 }`. Stored figures and `goodsTotal` are unchanged. | N/A |
| Accept pack | `POST /api/cart/packs/:lineId/accept-price { lineTotal: 4000 }` while live still gives 4,000. | `200`. Only the stale included `unit_price` rows are updated. The next GET shows `stale: null` and the new totals. | N/A |
| Accept item | `POST /api/cart/items/:lineId/accept-price { unitPrice }`, matching live. | `200`, and the stored price is updated. | N/A |
| Moved again | The expected figure no longer matches live, the line isn't repriced, or it's unavailable. | No write. | `409 conflict`, `That price changed again. Review this line.` |
| Bad body | Missing or non-integer figure. | No write. | `400 invalid_input` |
| Foreign or unknown line | | No write. | `404 not_found` (the existing line-not-found message) |
| Auth | No cookie, or an admin cookie, on any new route. | | `401` / `403` |
| Guard | `checkoutBlock(db, parentId)` | Returns `{ attentionCount }`, the same count GET reports. 4.2 refuses Place when it is above 0. | N/A |

</frozen-after-approval>

## Code Map

- `server/cart/http.ts`:
  - Existing helpers: `sendError` L30, `safe` L42, `requireParent` L54, `parsePositiveId` L72, `packLineJson` L81, `itemLineJson` L100, `sendLineNotFound` L112.
  - Existing routes: `GET /cart` L178, `DELETE` routes L244/L264.
  - Register `/cart/checkout` **before** any `/cart/:x` pattern.
  - SQL must stay out of this file: io-matrix asserts there is no `db.prepare`.
- `server/cart/packs.ts`:
  - `listCartPackLines` L230 and `packLineTotal` L104 already exist. `cartGoodsTotal` L116 must remain the expression used for `goodsTotal`.
  - Must not contain `FROM packs|books|grades` (io-matrix).
- `server/cart/items.ts` -- `listCartItemLines` L145, `withItemTotal` L167. Must not contain `SET title`.
- `server/cart/edits.ts` -- `CartEditFailure`, `lineNotFound()`. Add the conflict failure here.
- `server/cart/index.ts` -- currently exports only `createCartRouter`.
- **Catalog reads:**
  - `server/catalog/packs.ts`: `getBrowsePack(db,id)` L235 (live only, books filtered to live) and `PackRow`/`PackBook` L4–L11.
  - `server/catalog/items.ts`: `getLiveItem(db,id)` L71.
  - Cart already deep-imports these files.
- **Address:** `server/identity/http.ts` `GET /parents/me` L295 returns `{ name, deliveryAddress, whatsapp, secondPhone, email }`. The client helper is `client/storefront/src/accountProfile.ts` (`ProfileResponse` L10).
- `client/storefront/src/App.tsx` L31 -- `cart` is under `<AuthGate/>`. Nesting `cart/checkout` keeps the Cart tab active (Shell `end:false`). App.tsx must not contain the words refresh, not found or go back (io-matrix L352–358).
- `client/storefront/src/CartPage.tsx`:
  - The goods total is at L343. Add the Checkout entry here.
  - Patterns to reuse: `withLock`/`inFlight` L142, `runEdit` L155, `RefreshIcon` L25, `button-danger-text`.
- `client/storefront/src/cartLines.ts` -- strict `parseCartBody` L92 (extend it for `stale` and `attentionCount`, or add a sibling parser) and `compositionMeta` L106.
- `client/storefront/src/cart.tsx` -- line types L12–41, `useCartBadge` L50.
- **`client/ui/base.css`:**
  - Missing today: banner/notice classes and a blocked-primary style.
  - `.button-primary` L974 and `.button-secondary` L1000 exist.
  - Tokens: `--color-accent-quiet`, `--color-danger`, `--color-warning`, `--color-danger-tint`, `--color-warn-tint`.
  - Specs: DESIGN.md L618 (blocked button) and L695 (banner: radius md, `13px 15px`, 3px semantic border over the tint, heading-sm title in the hue, 13px action margin).
- **`server/web/io-matrix.test.ts`:**
  - Helpers: `startIdentityServer` L210 (needs `npm run build` first). The highest port is `CART_TOTALS_PORT=18781` L168, so use `18782`.
  - The 3.3 block starts at L6977. Its wiring test (L7594–7596) forbids `<Link` and `navigate` on CartPage. Relax those two and keep `/Browse/`.

## Tasks & Acceptance

**Execution:**
- [x] `server/cart/staleness.ts` (new) -- `annotateCart(db, parentId)` returns the 3.3 lines plus `stale`, `goodsTotal`, and `attentionCount`. Also add `checkoutBlock(db, parentId)`. The flag rules come only from catalog TS reads.
- [x] `server/cart/packs.ts`, `server/cart/items.ts` -- Add `acceptPackLinePrice(db, parentId, lineId, expectedLineTotal)` and `acceptItemLinePrice(db, parentId, lineId, expectedUnitPrice)`. Each re-checks staleness and writes inside `db.transaction`, scoped by `parent_id`.
- [x] `server/cart/edits.ts` -- Add `priceConflict()` with the 409 message.
- [x] `server/cart/http.ts` -- Add `GET /cart/checkout` (no-store), `POST /cart/packs/:lineId/accept-price` and `POST /cart/items/:lineId/accept-price`, following the matrix status codes.
- [x] `server/cart/index.ts` -- Export `checkoutBlock`.
- [x] `client/storefront/src/cartLines.ts`, `cart.tsx` -- Add a strict checkout parser and the types for it.
- [x] `client/storefront/src/CheckoutPage.tsx` (new) -- Fetch checkout and profile with AbortController, then render:
  - the banner and the lines with inline notices
  - the delivery strip, goods total, read-only address and note textarea
  - Place Order, either blocked or as a plain primary `button type="button"` with no handler
  - When the cart is empty: `Cart is Empty` and the refresh icon.
  - On a failure, show the API message with `role="alert"` and keep the note.
- [x] `client/storefront/src/App.tsx` -- Add `cart/checkout` under AuthGate.
- [x] `client/storefront/src/CartPage.tsx` -- Add a primary `Checkout` link to `/cart/checkout`, shown only when there are lines.
- [x] `client/ui/base.css` -- Add `.notice` (`-danger`/`-warning`) and banner, `.button-blocked`, `.checkout-delivery-strip`, and the textarea field.
- [x] `server/web/io-matrix.test.ts` -- Add a 4.1 block on port 18782 that covers every matrix row: catalog mutation via admin routes, `checkoutBlock` imported directly, and source checks (no `db.prepare` in http.ts, no catalog `FROM` in the cart files, the exact delivery copy, `aria-disabled`). Relax the 3.3 `<Link`/`navigate` assertions.

**Acceptance Criteria:**
- Given two flagged lines, when the parent resolves one, then the banner reads 1 line, and Place Order is still blocked in the same position with its reason announced.
- Given every flag is resolved, when the page refetches, then the banner disappears, Place Order renders as the normal primary, and the typed note is still there.
- Given a non-empty cart, when the parent opens Checkout, then the account address, the delivery strip above the goods total, and no delivery amount are shown.

## Spec Change Log

## Design Notes

Staleness lives on a separate endpoint so `GET /cart` keeps 3.3's contract. "Annotations never rewrite stored figures" then holds trivially, and the 3.3 deepEqual tests keep passing. Accept-price carries the figure the parent saw, so a second catalog edit between seeing and tapping can't be accepted blind.

The blocked button uses `aria-disabled` rather than `disabled`. That keeps it focusable, and its reason is read aloud (UX-DR32).

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including the 18782 block

**Manual checks (if no CLI):**
- Add a pack, then archive one of its ticked books in admin. Checkout shows a danger line and a banner, and Place Order is blocked. Remove the line and Place Order unblocks.
- Reprice an item. Accept shows the new total and clears the flag.

## Suggested Review Order

**Staleness rule**

- Entry point: one pass annotates every line, counts flags, keeps add-time goods total.
  [`staleness.ts:29`](../../server/cart/staleness.ts#L29)

- Pack flag: browse-live pack, included members only; unavailable beats repriced.
  [`packs.ts:357`](../../server/cart/packs.ts#L357)

- Item flag: live item lookup and price comparison through catalog TS reads.
  [`items.ts:222`](../../server/cart/items.ts#L222)

- Guard 4.2's Place will call; same count GET reports.
  [`staleness.ts:47`](../../server/cart/staleness.ts#L47)

**Explicit acceptance**

- Pack accept re-checks live inside a transaction; rewrites only stale included prices.
  [`packs.ts:368`](../../server/cart/packs.ts#L368)

- Item accept matches the parent-seen unit price or refuses.
  [`items.ts:235`](../../server/cart/items.ts#L235)

- One 409 shape for "moved again", clean, or unavailable lines.
  [`edits.ts:23`](../../server/cart/edits.ts#L23)

- Read-only checkout route registered before line-id patterns; GET /cart untouched.
  [`http.ts:206`](../../server/cart/http.ts#L206)

- Accept routes validate integer figures and share the parent session check.
  [`http.ts:225`](../../server/cart/http.ts#L225)

**Checkout page**

- Pure accept-request builder, tested against real repriced lines.
  [`cartLines.ts:172`](../../client/storefront/src/cartLines.ts#L172)

- Strict parser fails the whole body on any malformed flag.
  [`cartLines.ts:132`](../../client/storefront/src/cartLines.ts#L132)

- Inline notices; equal-total reprice gets its own honest copy.
  [`CheckoutPage.tsx:64`](../../client/storefront/src/CheckoutPage.tsx#L64)

- Changes keep their own error across a failed refetch; focus lands on banner/heading.
  [`CheckoutPage.tsx:224`](../../client/storefront/src/CheckoutPage.tsx#L224)

- Fixed delivery line on its strip above the goods total; note stays in page state.
  [`CheckoutPage.tsx:358`](../../client/storefront/src/CheckoutPage.tsx#L358)

- Blocked Place Order stays in place, focusable, with an announced reason.
  [`CheckoutPage.tsx:386`](../../client/storefront/src/CheckoutPage.tsx#L386)

- Checkout entry from Cart, shown only with lines.
  [`CartPage.tsx:350`](../../client/storefront/src/CartPage.tsx#L350)

**Peripherals**

- Route nested under the auth gate so the Cart tab stays active.
  [`App.tsx:33`](../../client/storefront/src/App.tsx#L33)

- Notice, blocked-primary and delivery-strip styles.
  [`base.css:763`](../../client/ui/base.css#L763)

- Public export of the guard for 4.2.
  [`index.ts:2`](../../server/cart/index.ts#L2)

- 4.1 matrix suite on port 18782.
  [`io-matrix.test.ts:7627`](../../server/web/io-matrix.test.ts#L7627)
