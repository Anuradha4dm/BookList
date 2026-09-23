---
title: 'Add a configured pack to the cart'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: 'a8843e5a9cc411073dd67269a97a32b2b54c2c68'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A configured pack exists only in React state, so nothing is saved and a second child cannot have a separate line.

**Approach:** A signed-in parent posts the current ticks. `cart` stores a new cloned line on the account. The same pack added again is another line. Signed out, Add offers Log in and Create account on this pack screen and does not add until Add is tapped again.

## Boundaries & Constraints

**Always:** Each success inserts one line. Lines never merge. Sequence is `MAX+1` per parent per pack, fixed at insert. Clone pack id, grade name, and every live member (`included`, quantity, add-time title, add-time unit price). `GET` reads cart tables only. Validate by calling `getBrowsePack` and `configureBrowsePack`; insert nothing when the pack is not a live browse pack, ticks are empty, quantity is outside 1–20, a book is not a member, or `selection` is not `bookId:qty` pairs. Session parent only — no parent id in the route. Errors are `{ error: { code, message } }`. Label is `Pack ${sequence} of ${gradeName}` (`Grade 5` → `Pack 1 of Grade 5`). Sequence 1 chip: ink fill `--color-text-primary`, mustard text `--color-accent-primary`. Later chips: mustard fill, navy text `--color-focus-ring`, edge `--color-border-strong`. Cart tab shows the line count once it is at least 1.

**Ask First:** A new runtime dependency. Changing `AuthGate`'s `navigate('/')` for Cart, Orders, and Account. Editing migrations `001`–`006`.

**Never:** Item lines, goods total, in-cart steppers, Remove, or `Cart is Empty` (stories 3.2–3.3). Checkout or live repricing. Browser storage as the cart. SQL on `packs`, `books`, or `grades` from `cart`. Auto-add after login.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First add | Parent cookie. Live pack, grade `Grade 5`. Ticked `bookId:qty`, qty 1–20. | `201`. Sequence 1, label `Pack 1 of Grade 5`. One row per live member. Ticked: `included: true` and that qty. Unticked: `included: false`. Title and `unitPrice` copied at add time. | N/A |
| Repeat add | Same parent and pack, any ticks. | New line, sequence 2, label `Pack 2 of Grade 5`. First line unchanged. | N/A |
| Invalid configuration | Qty outside 1–20, zero ticks, duplicate or non-member, selection not `bookId:qty` pairs. | No new row. | `400` `invalid_input` plus the catalog message (`Item count exeeded, you can only order 20 per item`, `Keep at least one book to add this pack.`, or the member/shape message). |
| Pack not addable | Unknown id, or archived pack, school, or grade. | No new row. | `404` `not_found`. |
| Signed out | No cookie, or a stale one. | No new row. | `401` `unauthenticated`, `Sign in to continue.` |
| Not a parent | Admin cookie. | No new row. | `403` `forbidden`. |
| Other parent | Parent B lists the cart. | Only B's lines. | N/A |
| Signed-out tap | Add on `/packs/:id` while signed out. | Log in and Create account on that screen. After success, same pack and ticks. No line until Add is tapped again. | N/A |

</frozen-after-approval>

## Code Map

- `server/web/api.ts` `createApiRouter` — mount cart next to identity and catalog.
- `server/db/migrations/run.ts` `MIGRATIONS` — latest is `006_catalog_items.sql`. Append `007` only.
- `server/catalog/packs.ts` — reuse `getBrowsePack` ~216, `configureBrowsePack` ~267, messages ~205–208. `BrowsePackDetail` ~191 has no grade name; read `grades.name` (fixture value `Grade 5`).
- `server/identity/http.ts` — `lookupSession` ~116, `rejectUnauthorized` ~138, parent role gate on `GET /parents/me` ~295. Cookie `booklist.sid` (`server/identity/cookies.ts`). Envelope copy: `sendError` in `server/catalog/http.ts` ~59.
- `server/cart/.gitkeep` — empty. SQL stays in the domain module, not HTTP.
- `client/storefront/src/PackPage.tsx` — holds `choices`. `io-matrix.test.ts` ~5850–5852 forbids a second `fetch(`, `selection`, and `Add`; update those three.
- `client/storefront/src/packConfig.ts` `configuredLines` ~56 — build the ticked selection from here.
- `client/storefront/src/AuthGate.tsx` — `LoginPanel` ~92 and `RegisterPanel` ~213 are private; `onSignedIn` ~347 always `navigate('/')`. `session.logIn` already sets status `in` first. Pack route is outside `AuthGate` (`App.tsx` ~28); `/cart` is a title stub (~30).
- `client/storefront/src/Shell.tsx` `destinations` ~6–11 — no badge. Chips in `client/ui/base.css`; tokens in `client/ui/tokens.css`.
- `server/web/io-matrix.test.ts` — spawns `server/dist`. Ports `18770`–`18778` are taken; use `18779`.

## Tasks & Acceptance

**Execution:**
- [x] `server/db/migrations/007_cart_pack_lines.sql` — Line (`parent_id`, `pack_id`, `sequence`, `grade_name`) and member (`line_id`, `book_id`, `included`, `quantity`, `title`, `unit_price`). Register it in `server/db/migrations/run.ts`.
- [x] `server/catalog/packs.ts` — Export the live grade name using `getBrowsePack`'s joins. Keep it off the browse JSON.
- [x] `server/cart/packs.ts` — Add and list the session parent's clones. Assign sequence in the insert transaction. Store every live member; `included` only for a priced line.
- [x] `server/cart/http.ts` — `POST /api/cart/packs` `{ packId, selection }` and `GET /api/cart`. Parent session required. Export from `server/cart/index.ts` and mount in `server/web/api.ts`.
- [x] `client/storefront/src/packConfig.ts` — Serialize ticked choices to `bookId:qty`.
- [x] `client/storefront/src/AuthGate.tsx` — Export Log in / Create account with a caller-supplied `onSignedIn`. Leave the tab gate on `navigate('/')`.
- [x] `client/storefront/src/PackPage.tsx` — Add to cart. Signed out: show that surface and keep `choices`. Signed in: `POST` with `credentials: 'include'`. Show the error and keep the configuration.
- [x] `client/storefront/src/App.tsx` — Cart lists labels and chips only. `client/storefront/src/Shell.tsx` — badge Cart when the count is at least 1, and refresh it after a successful add. `client/ui/base.css` — chip classes from the tokens above.
- [x] `server/web/io-matrix.test.ts` — Cover every matrix row on port `18779`, and update the story 2.6 assertions that forbid Add.

**Acceptance Criteria:**
- Given a signed-in parent on a configured pack, when they tap Add to cart, then the badge equals the line count and the line is a clone.
- Given a second add of that pack, when the cart is listed, then both lines remain, labels are `Pack N of Grade 5`, and chips follow sequence 1 versus later sequences.
- Given a failed add, when the response is not success, then the stored count is unchanged.
- Given a signed-out parent, when they sign in from the pack screen, then they stay on that pack and a line appears only after a later Add.

## Spec Change Log

## Verification

**Commands:**
- `npm run typecheck` — expected: exit 0
- `npm run build` — expected: exit 0, producing `server/dist`
- `node --import tsx --test server/web/io-matrix.test.ts` — expected: exit 0, including port `18779`

**Manual checks (if no CLI):**
- Signed out, tap Add: Log in and Create account show; after login the ticks remain and nothing is added until Add is tapped again.
- Two adds: `Pack 1 of …` is an ink chip with mustard text; `Pack 2 of …` is a mustard chip with navy text and a strong edge. Badge is 2. No total, Remove, or stepper.

## Suggested Review Order

**Clone**

- Each add stores a new cloned line and its members in one transaction.
  [`packs.ts:124`](../../server/cart/packs.ts#L124)

- Sequence is the next number for this parent and pack, fixed at insert.
  [`packs.ts:109`](../../server/cart/packs.ts#L109)

**Schema**

- Pack lines belong to the parent; member rows cascade with the line.
  [`007_cart_pack_lines.sql:1`](../../server/db/migrations/007_cart_pack_lines.sql#L1)

**Auth and routes**

- Only a parent session can add or list; an admin cookie is forbidden.
  [`http.ts:39`](../../server/cart/http.ts#L39)

- Add and list use the session parent, with no parent id in the path.
  [`http.ts:70`](../../server/cart/http.ts#L70)

**Grade label**

- The live grade name is read for the label and kept off the browse JSON.
  [`packs.ts:242`](../../server/catalog/packs.ts#L242)

**Pack screen**

- Signed out, Add opens Log in here; signed in, it posts the current ticks.
  [`PackPage.tsx:94`](../../client/storefront/src/PackPage.tsx#L94)

- The sign-in surface stays on the caller’s screen instead of Browse.
  [`AuthGate.tsx:335`](../../client/storefront/src/AuthGate.tsx#L335)

**Cart display**

- Sequence 1 uses the ink chip; later lines use the mustard chip.
  [`CartPage.tsx:81`](../../client/storefront/src/CartPage.tsx#L81)

- The Cart tab shows the line count once the parent has at least one line.
  [`Shell.tsx:24`](../../client/storefront/src/Shell.tsx#L24)

- Chip colours come from the existing ink, mustard, and navy tokens.
  [`base.css:619`](../../client/ui/base.css#L619)

**Tests**

- The cart matrix, including a frozen add-time price, runs on port 18779.
  [`io-matrix.test.ts:5960`](../../server/web/io-matrix.test.ts#L5960)
