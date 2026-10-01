---
title: 'A cart that persists, totals, and can be emptied'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: 'd1fa4f5c67da13038d2dbd8bd5f91de8b12708dc'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The account cart lists pack chips and item lines, but parents can't see a goods total, change quantities, remove lines, or see an empty state.

**Approach:** `GET /api/cart` returns each pack line's stored members, every line's total, and the cart's goods total, all computed in `cart` from add-time figures. New parent-only routes change a ticked pack title's quantity, change an item line's quantity, and remove either kind of line. The Cart page shows composition, line totals, the goods total, 44px steppers, a danger-text Remove, and `Cart is Empty` with a refresh icon.

## Boundaries & Constraints

**Always:** Session parent only. Another parent's line returns `404` and stays unchanged. Quantity is an integer from 1 to 20 for both kinds. An out-of-range value returns `400` `invalid_input` with the existing cap sentence, and the row stays as it was. Cart edits never change ticks: an unticked pack member can't be edited (`400`), and minus on a ticked title stops at 1. That keeps the last ticked title locked. Deleting a pack line deletes its members. Labels and chip variants stay as stored, so removing Pack 1 leaves `Pack 2 of Grade 5` with its mustard chip. Totals come from stored add-time title and price only, and `GET` never writes. Goods total = Σ included members (qty × unitPrice) + Σ item lines (qty × unitPrice). Money renders through `formatRupees`. Composition meta is `{included} of {total} titles`, followed by ` · {title} ×{qty}` for each included member with qty > 1, in member order. Errors use `{ error: { code, message } }`. The badge refreshes after every successful edit or removal. Refresh refetches `/api/cart` in place.

**Ask First:** A new runtime dependency. Editing migrations `001`–`008` or adding a migration. Changing pack add or item add semantics.

**Never:** Checkout, staleness or live repricing, Place Order, or clearing the cart on order (Epic 4). Re-ticking a pack line in the cart. Browser storage. A Browse button or link in the empty state. Auto-add after login.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Totals | Pack: atlas ×2 @1,500 and reader ×1 @800 included, one unticked @900; item ×3 @120. | Pack `lineTotal` 3,800, item 360, `goodsTotal` 4,160. Meta `2 of 3 titles · Atlas ×2`. | N/A |
| Persists | Parent signs in with a fresh cookie (a second device). | Same lines and totals. Stored titles and prices are unchanged, even after a catalog price edit. | N/A |
| Pack qty | `PATCH /api/cart/packs/:lineId/members/:bookId` `{quantity: 5}` on a ticked member. | `200`. Member qty 5. Totals reflect it on the next `GET`. | N/A |
| Unticked member | The same call on an `included=0` member. | Row unchanged. | `400` `invalid_input` |
| Item qty | `PATCH /api/cart/items/:lineId` `{quantity: 7}`. | `200`. The same line has qty 7, and there's still one line for that item. | N/A |
| Bad qty | 0, 21, 2.5, or missing, on either route. | Row unchanged. | `400` `invalid_input` with the cap sentence |
| Remove | `DELETE /api/cart/packs/:lineId` or `/api/cart/items/:lineId`. | `204`. The line is gone, along with its members. Other lines and labels are unchanged. | N/A |
| Foreign or missing | Parent B targets A's line, or an unknown id. | A's line unchanged. | `404` `not_found` |
| Auth | No cookie, or an admin cookie, on any new route. | No write. | `401` `unauthenticated` or `403` `forbidden` |
| Empty | No lines, either never filled or the last one removed. | `goodsTotal` 0. The page shows `Cart is Empty` and a refresh icon button, with no Browse link. | N/A |

</frozen-after-approval>

## Code Map

- `server/cart/http.ts` -- `sendError` L15, `safe` L28, `requireParent` L41, `parsePositiveId` L59, `GET /cart` L129. Add PATCH and DELETE here. Keep SQL out of the router (an io-matrix test asserts there's no `db.prepare` here).
- `server/cart/packs.ts` -- `membersForLine` (ORDER BY book_id), `listCartPackLines` returns summaries, add uses `db.transaction`. Add the member-qty update and the line delete. `cart_pack_line_members` cascades on delete, and the router enables foreign keys.
- `server/cart/items.ts` -- `parseQuantity`, `addCartItem` L62 (the merge UPDATE pattern), `listCartItemLines`. Add the set-quantity and delete functions.
- `server/catalog/packs.ts` L205–208 -- `QUANTITY_MIN/MAX`, `QUANTITY_RANGE_MESSAGE` ("exeeded" is intentional). Reuse these.
- `client/storefront/src/CartPage.tsx` -- `parseLines` L13 validates the GET shape strictly, so extend it. The fetch uses AbortController plus `refresh()` from `useCartBadge`. An empty cart renders `null` today. Chips: `.cart-line-chip.is-first/.is-later`.
- `client/storefront/src/cart.tsx` -- line types L12–30, `useCartBadge` L39, the badge counts `lines.length`.
- `client/storefront/src/PackPage.tsx` L190–217 and `ItemsPage.tsx` L136–170 -- stepper markup to copy (`pack-stepper`, `pack-stepper-end`, `pack-stepper-value`, `CAP_COPY`, `aria-describedby` notices).
- `client/ui/money.ts` -- `formatRupees`, imported from `@booklist/ui`.
- `client/storefront/src/Shell.tsx` L109–150 -- inline SVG icon pattern (24 viewBox, `aria-hidden`, `currentColor`). There's no refresh icon yet.
- `client/ui/base.css` -- stepper L453–500, cart L594–635. There's no danger button or empty class yet. Tokens: `--color-danger`, `--space-touch-min`. Reduced motion is handled globally at L1090.
- `server/web/io-matrix.test.ts` -- these forbid what 3.3 now needs: L6438–6441 and L6961–6964 (`Remove`, `Cart is Empty`, `formatRupees`, `stepper` on CartPage). The story-block pattern is at L6455. `startIdentityServer` L210 needs `npm run build` first. Ports through `18780` are taken, so use `18781`.

## Tasks & Acceptance

**Execution:**
- [x] `server/cart/packs.ts` -- List lines with members, `lineTotal` and `composition` data. Add `setPackMemberQuantity(db, parentId, lineId, bookId, qty)`, which refuses an unticked member, and `removeCartPackLine`. Both are scoped by `parent_id`.
- [x] `server/cart/items.ts` -- Add `lineTotal` to listed lines. Add `setCartItemQuantity` and `removeCartItemLine`, scoped by `parent_id`.
- [x] `server/cart/http.ts` -- `GET /cart` returns `{ lines, goodsTotal }`, where a pack line adds `members[]` (`bookId, included, quantity, title, unitPrice`) and `lineTotal`, and an item line adds `lineTotal`. Add `PATCH /cart/packs/:lineId/members/:bookId`, `PATCH /cart/items/:lineId`, `DELETE /cart/packs/:lineId` and `DELETE /cart/items/:lineId`, following the matrix status codes.
- [x] `client/storefront/src/cart.tsx` -- Extend the line types with members and `lineTotal`. The badge stays `lines.length`.
- [x] `client/storefront/src/CartPage.tsx` -- Each pack line shows its chip, the composition meta, ticked members with steppers (minus disabled at 1, plus disabled at 20 with the cap notice), its line total and Remove. Each item line shows a stepper, line total and Remove. Show the goods total. On failure, show the API message and keep the prior state. After success, refetch and call `refresh()`. Empty state: `Cart is Empty` plus a refresh icon `button` with `aria-label="Refresh cart"`.
- [x] `client/ui/base.css` -- Add a danger-text Remove (44px target, `--color-danger`), and styles for the composition meta, line totals, the goods-total row and the centred empty state.
- [x] `server/web/io-matrix.test.ts` -- Cover every matrix row on port `18781`. Update the 3.1 and 3.2 source assertions that forbade Remove, `Cart is Empty`, `formatRupees` and `stepper`, and keep their other checks.

**Acceptance Criteria:**
- Given a cart with a pack line, when the parent views Cart, then ticked titles show steppers, unticked titles have no tick control, and minus is disabled at 1.
- Given the parent removes the last line, when the page updates, then `Cart is Empty` and a refresh icon show, there's no Browse control, and the badge reads 0.
- Given a failed edit, when the error returns, then the message shows and the displayed quantities and totals match the server.

## Spec Change Log

## Design Notes

Totals are computed on the server so the rule lives in `cart` and isn't duplicated in React. The client only formats them. Removing a line never renumbers the others, because `nextSequence` is MAX+1 and labels are part of the order identity that parents already saw.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0
- `node --import tsx --test server/web/io-matrix.test.ts` -- expected: exit 0, including port 18781

**Manual checks (if no CLI):**
- Add two Grade 5 packs and an item. Change quantities, and the totals update in `Rs. 1,234` form. Remove everything, and `Cart is Empty` shows with a refresh icon only.

## Suggested Review Order

**Totals rule**

- Entry point: the goods total sums ticked pack members and item lines from add-time figures.
  [`packs.ts:116`](../../server/cart/packs.ts#L116)

- Pack line total counts included members only.
  [`packs.ts:104`](../../server/cart/packs.ts#L104)

- GET returns members, line totals, and goods total without writing.
  [`http.ts:178`](../../server/cart/http.ts#L178)

**Edits and removal**

- Pack title quantity change refuses unticked members, so ticks never change in cart.
  [`packs.ts:252`](../../server/cart/packs.ts#L252)

- Item quantity set runs in one transaction; a vanished row is a 404, not a 500.
  [`items.ts:174`](../../server/cart/items.ts#L174)

- Pack removal deletes members then line; other labels keep their sequence.
  [`packs.ts:303`](../../server/cart/packs.ts#L303)

- Four parent-only routes share the session check and error shape.
  [`http.ts:195`](../../server/cart/http.ts#L195)

- One shared not-found failure type and messages for both line kinds.
  [`edits.ts:2`](../../server/cart/edits.ts#L2)

**Cart page**

- Strict parser: any malformed line fails the whole load instead of hiding lines.
  [`cartLines.ts:92`](../../client/storefront/src/cartLines.ts#L92)

- Composition meta `N of M titles · Title ×Q` built from stored members.
  [`cartLines.ts:106`](../../client/storefront/src/cartLines.ts#L106)

- In-flight ref blocks double taps; every edit reloads and refreshes the badge.
  [`CartPage.tsx:142`](../../client/storefront/src/CartPage.tsx#L142)

- Stepper keeps 44px ends; minus stops at 1, plus at 20 with cap notice.
  [`CartPage.tsx:48`](../../client/storefront/src/CartPage.tsx#L48)

- Empty state: `Cart is Empty` and a refresh icon, no Browse control.
  [`CartPage.tsx:235`](../../client/storefront/src/CartPage.tsx#L235)

- Goods total row announces changes politely.
  [`CartPage.tsx:343`](../../client/storefront/src/CartPage.tsx#L343)

**Peripherals**

- Danger-text Remove and centred empty-state styles.
  [`base.css:692`](../../client/ui/base.css#L692)

- 3.3 matrix suite on port 18781, including parser and composition checks.
  [`io-matrix.test.ts:6977`](../../server/web/io-matrix.test.ts#L6977)
