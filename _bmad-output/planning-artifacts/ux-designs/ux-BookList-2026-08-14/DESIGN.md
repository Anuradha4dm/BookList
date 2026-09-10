---
name: Book List
description: 'Chalk & Brass — the visual identity for a commissioned school-bookshop order app. Chalk-white or ink-black surfaces, navy structure, school-bag mustard as a fill-only action colour. Light and dark are peers, not inversions.'
status: draft
updated: 2026-08-14
sources:
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/prd.md
  - _bmad-output/planning-artifacts/prds/prd-BookList-2026-08-14/addendum.md
  - .memlog.md
  - .working/source-extract-prd.md
  - .working/direction-navy-mustard.html
  - .working/color-themes-1.html
colors:
  # ─── LIGHT ─── 21 semantic roles. Values lifted verbatim from variation 03
  # "Chalk & Brass" in .working/color-themes-1.html, the treatment chosen by Daanlk.
  surface-base: '#FFFFFF'
  surface-raised: '#FFFDF6'
  surface-sunken: '#FBEBC6'
  text-primary: '#08131F'
  text-secondary: '#44526A'
  text-on-accent: '#08131F'
  border-default: '#7A6A46'
  border-strong: '#08131F'
  focus-ring: '#123A6E'
  focus-ring-offset: '#FFFFFF'
  accent-primary: '#E8A61A'
  accent-primary-hover: '#B87D08'
  accent-quiet: '#FBEBC6'
  danger: '#A81D14'
  warning: '#7E5100'
  success: '#0E5C3C'
  info: '#14477F'
  danger-tint: '#FCE9E7'
  warn-tint: '#FBEBC6'
  success-tint: '#E3F3EB'
  info-tint: '#E6EFFA'
  # ─── DARK ─── the same 21 roles. A peer mode, designed not derived.
  surface-base-dark: '#06090F'
  surface-raised-dark: '#121826'
  surface-sunken-dark: '#000205'
  text-primary-dark: '#FFFFFF'
  text-secondary-dark: '#B4C1D4'
  text-on-accent-dark: '#06090F'
  border-default-dark: '#5A6683'
  border-strong-dark: '#97A5BC'
  focus-ring-dark: '#FFE59A'
  focus-ring-offset-dark: '#06090F'
  accent-primary-dark: '#F5B32B'
  accent-primary-hover-dark: '#FFC94F'
  accent-quiet-dark: '#3A2C08'
  danger-dark: '#FFA79E'
  warning-dark: '#FFCF5C'
  success-dark: '#6BDCA8'
  info-dark: '#9AC8FF'
  danger-tint-dark: '#3A1613'
  warn-tint-dark: '#43300A'
  success-tint-dark: '#0E3A28'
  info-tint-dark: '#122A45'
  # ─── PIPELINE STATUS RAMP ─── 8 statuses × fill/ink/edge × 2 modes.
  # Not part of the 21 roles: a closed set used only by the status pill and the
  # parent's vertical timeline. Hue is the LAST of four channels — see Components.
  # Fills are near-iso-luminant on purpose: ink-on-fill sits between 7.4:1 and
  # 9.5:1 in light and 8.8:1 and 11.2:1 in dark, so the set survives greyscale.
  status-placed-fill: '#4A4A4E'
  status-placed-ink: '#FFFFFF'
  status-placed-edge: '#74747A'
  status-confirmed-fill: '#14477F'
  status-confirmed-ink: '#FFFFFF'
  status-confirmed-edge: '#2E6BA8'
  status-processing-fill: '#4E3390'
  status-processing-ink: '#FFFFFF'
  status-processing-edge: '#7357BC'
  status-packing-fill: '#7C2460'
  status-packing-ink: '#FFFFFF'
  status-packing-edge: '#AE4489'
  status-ready-fill: '#E8A61A'
  status-ready-ink: '#0B1B33'
  status-ready-edge: '#0B1B33'
  status-partner-fill: '#0A5C6B'
  status-partner-ink: '#FFFFFF'
  status-partner-edge: '#1A7F8F'
  status-delivered-fill: '#0E5C3C'
  status-delivered-ink: '#FFFFFF'
  status-delivered-edge: '#1F8258'
  status-cancelled-fill: '#A81D14'
  status-cancelled-ink: '#FFFFFF'
  status-cancelled-edge: '#CF3B31'
  status-placed-fill-dark: '#C4C9D0'
  status-placed-ink-dark: '#08131F'
  status-placed-edge-dark: '#8E949C'
  status-confirmed-fill-dark: '#8FC0FF'
  status-confirmed-ink-dark: '#08131F'
  status-confirmed-edge-dark: '#6C9BD0'
  status-processing-fill-dark: '#BBA6F2'
  status-processing-ink-dark: '#08131F'
  status-processing-edge-dark: '#9584D0'
  status-packing-fill-dark: '#F09AD0'
  status-packing-ink-dark: '#08131F'
  status-packing-edge-dark: '#C47AAB'
  status-ready-fill-dark: '#F0B434'
  status-ready-ink-dark: '#0B1B33'
  status-ready-edge-dark: '#FFD98A'
  status-partner-fill-dark: '#6FD0E2'
  status-partner-ink-dark: '#08131F'
  status-partner-edge-dark: '#4FA0B2'
  status-delivered-fill-dark: '#6BDCA8'
  status-delivered-ink-dark: '#08131F'
  status-delivered-edge-dark: '#4FA97C'
  status-cancelled-fill-dark: '#FF9A90'
  status-cancelled-ink-dark: '#08131F'
  status-cancelled-edge-dark: '#C8756B'
typography:
  # One stack, no webfont. Express + static public/ on a free tier that pays a
  # cold start on the first request of the evening (prd §9): a webfont would add
  # a blocking round trip and a FOUT to the exact moment the product is weakest.
  font-sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  display:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 34px
    fontWeight: '800'
    lineHeight: '1.15'
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 27px
    fontWeight: '800'
    lineHeight: '1.15'
    letterSpacing: -0.02em
  heading-lg:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 27px
    fontWeight: '800'
    lineHeight: '1.15'
    letterSpacing: -0.02em
  heading-md:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 22px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  heading-sm:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 17px
    fontWeight: '800'
    lineHeight: '1.25'
    letterSpacing: -0.015em
  amount-hero:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 30px
    fontWeight: '800'
    lineHeight: '1'
    letterSpacing: -0.03em
  amount-hero-wide:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 34px
    fontWeight: '800'
    lineHeight: '1'
    letterSpacing: -0.03em
  amount-row:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 16px
    fontWeight: '800'
    lineHeight: '1.3'
  body:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-strong:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 15px
    fontWeight: '700'
    lineHeight: '1.3'
  meta:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 12.5px
    fontWeight: '600'
    lineHeight: '1.4'
  label-caps:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 11.5px
    fontWeight: '800'
    lineHeight: '1.4'
    letterSpacing: 0.1em
  pill-label:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 12px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  step-number:
    fontFamily: '{typography.font-sans.fontFamily}'
    fontSize: 9.5px
    fontWeight: '800'
    lineHeight: '1'
    letterSpacing: 0.04em
rounded:
  xs: 3px
  sm: 6px
  DEFAULT: 8px
  md: 12px
  lg: 18px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 32px
  '8': 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  touch-min: 44px
  control-h: 44px
  cta-h: 52px
  tabbar-h: 56px
  admin-sidebar-w: 214px
  pack-rail-w: 288px
  storefront-max: 760px
  edge-hairline: 2px
  edge-strong: 3px
  lift-offset: 3px
components:
  brand-lockup:
    mark-viewbox: '0 0 24 24'
    mark-fill: '{colors.accent-primary}'
    wordmark-typography: '{typography.heading-sm}'
    wordmark-color: '{colors.surface-base}'
    chrome-fill: '{colors.text-primary}'
    radius: '{rounded.DEFAULT}'
    padding: '7px 12px'
    mark-min-size: 18px
  focus-indicator:
    ring-width: 3px
    ring-color: '{colors.focus-ring}'
    offset-width: 2px
    offset-color: '{colors.focus-ring-offset}'
    radius: 4px
  pack-title-row:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-default}'
    radius: '{rounded.md}'
    padding: '10px 12px 12px'
    grid: '44px 1fr'
    gap: '{spacing.3}'
    title-typography: '{typography.body-strong}'
    edition-typography: '{typography.meta}'
    edition-color: '{colors.text-secondary}'
    total-typography: '{typography.amount-row}'
  pack-title-row-unticked:
    background: '{colors.surface-base}'
    border: '2px dashed {colors.border-default}'
    title-color: '{colors.text-secondary}'
    title-decoration: 'line-through 2px'
  pack-title-row-locked:
    background: '{colors.accent-quiet}'
    border: '3px solid {colors.border-strong}'
    radius: '{rounded.md}'
  checkbox:
    size: 26px
    target: '{spacing.touch-min}'
    border: '3px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    background-unchecked: '{colors.surface-base}'
    background-checked: '{colors.accent-primary}'
    tick-color: '{colors.text-on-accent}'
    tick-width: 3px
  quantity-stepper:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-default}'
    radius: '{rounded.DEFAULT}'
    button-size: '{spacing.control-h}'
    divider: '2px solid {colors.border-default}'
    readout-background: '{colors.accent-quiet}'
    readout-min-width: 46px
    readout-typography: '{typography.amount-row}'
    button-disabled-background: '{colors.surface-sunken}'
    button-disabled-color: '{colors.text-secondary}'
  button-primary:
    background: '{colors.accent-primary}'
    color: '{colors.text-on-accent}'
    border: '3px solid {colors.border-strong}'
    radius: '{rounded.md}'
    min-height: '{spacing.cta-h}'
    shadow: '0 4px 0 {colors.accent-primary-hover}'
    press-shadow: 'none'
    press-translate: '2px'
    press-duration: 120ms
    typography: '{typography.heading-sm}'
  button-secondary:
    background: '{colors.surface-raised}'
    color: '{colors.text-primary}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.DEFAULT}'
    min-height: '{spacing.control-h}'
    shadow: '2px 2px 0 {colors.border-strong}'
  button-destructive:
    background: '{colors.surface-raised}'
    color: '{colors.danger}'
    border: '2px solid {colors.danger}'
    radius: '{rounded.DEFAULT}'
    min-height: '{spacing.control-h}'
    solid-background: '{colors.danger}'
    solid-color: '{colors.surface-base}'
  button-blocked:
    background: '{colors.surface-sunken}'
    color: '{colors.text-secondary}'
    border: '2px solid {colors.border-default}'
    shadow: 'none'
  locked-title-notice:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.DEFAULT}'
    padding: '8px 9px'
    typography: '{typography.meta}'
    color: '{colors.text-primary}'
    glyph: padlock
    glyph-size: 13px
  cart-line:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-default}'
    radius: '{rounded.md}'
    padding: '{spacing.3}'
    label-typography: '{typography.label-caps}'
    label-radius: '{rounded.full}'
    label-background-first: '{colors.text-primary}'
    label-color-first: '{colors.accent-primary}'
    label-background-repeat: '{colors.accent-primary}'
    label-color-repeat: '{colors.text-on-accent}'
    label-border-repeat: '2px solid {colors.border-strong}'
    amount-typography: '{typography.amount-row}'
    remove-color: '{colors.danger}'
  status-pill:
    typography: '{typography.pill-label}'
    step-typography: '{typography.step-number}'
    radius-in-flight: '{rounded.full}'
    radius-terminal: '{rounded.xs}'
    border-width-in-flight: 2px
    border-width-day-ending: 3px
    border-style-not-started: dashed
    padding: '5px 9px'
    glyph-size: 12px
    gap: '{spacing.1}'
  call-state-chip-never:
    background: '{colors.surface-raised}'
    border: '2px dashed {colors.border-default}'
    color: '{colors.text-secondary}'
    radius: '{rounded.DEFAULT}'
    glyph: 'hollow ring, 2.6px stroke'
  call-state-chip-attempted:
    background: '{colors.warn-tint}'
    border: '2px solid {colors.warning}'
    color: '{colors.warning}'
    radius: '{rounded.DEFAULT}'
    glyph: 'filled handset with struck tail'
  admin-group-header:
    border-bottom: '3px solid {colors.border-strong}'
    title-typography: '{typography.heading-sm}'
    count-background: '{colors.accent-primary}'
    count-color: '{colors.text-on-accent}'
    count-radius: '{rounded.full}'
    note-typography: '{typography.meta}'
    note-color: '{colors.text-secondary}'
  admin-order-row:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-default}'
    radius: '{rounded.md}'
    padding: '12px 14px'
    grid: '88px 1.5fr 1.1fr 152px auto'
    gap: '14px'
    id-typography: '{typography.heading-sm}'
    name-typography: '{typography.body-strong}'
    meta-typography: '{typography.meta}'
    attention-border: '2px solid {colors.border-strong}'
    attention-border-left: 8px
  sidebar-nav-item:
    chrome-fill: '{colors.text-primary}'
    color: '{colors.text-secondary-dark}'
    active-background: '{colors.accent-primary}'
    active-color: '{colors.text-on-accent}'
    radius: '{rounded.DEFAULT}'
    min-height: '{spacing.control-h}'
    typography: '{typography.body-strong}'
    section-label-typography: '{typography.label-caps}'
  tabbar-item:
    bar-background: '{colors.surface-raised}'
    bar-border-top: '2px solid {colors.border-strong}'
    bar-height: '{spacing.tabbar-h}'
    target: '{spacing.touch-min}'
    label-typography: '{typography.label-caps}'
    color: '{colors.text-secondary}'
    active-background: '{colors.accent-primary}'
    active-border: '2px solid {colors.border-strong}'
    active-color: '{colors.text-on-accent}'
    active-radius: '{rounded.DEFAULT}'
    badge-background: '{colors.accent-primary}'
    badge-color: '{colors.text-on-accent}'
    badge-border: '2px solid {colors.border-strong}'
    badge-radius: '{rounded.full}'
    badge-min-size: 20px
    badge-typography: '{typography.pill-label}'
  form-field:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-default}'
    radius: '{rounded.DEFAULT}'
    min-height: '{spacing.control-h}'
    color: '{colors.text-primary}'
    label-typography: '{typography.label-caps}'
    prefix-background: '{colors.surface-sunken}'
    prefix-divider: '2px solid {colors.border-default}'
    error-border: '3px solid {colors.danger}'
    error-message-color: '{colors.danger}'
    error-message-typography: '{typography.meta}'
  banner-notice:
    radius: '{rounded.md}'
    padding: '13px 15px'
    border-width: 3px
    title-typography: '{typography.heading-sm}'
    body-typography: '{typography.body}'
    danger-background: '{colors.danger-tint}'
    danger-border: '{colors.danger}'
    warn-background: '{colors.warn-tint}'
    warn-border: '{colors.warning}'
    success-background: '{colors.success-tint}'
    success-border: '{colors.success}'
    info-background: '{colors.info-tint}'
    info-border: '{colors.info}'
  modal-confirm:
    background: '{colors.surface-raised}'
    border: '3px solid {colors.border-strong}'
    radius: '{rounded.lg}'
    padding: '{spacing.5}'
    shadow: '{spacing.lift-offset} {spacing.lift-offset} 0 {colors.border-strong}'
    backdrop: '{colors.text-primary} at 55%'
    title-typography: '{typography.heading-md}'
  empty-state:
    background: '{colors.surface-raised}'
    border: '3px solid {colors.border-strong}'
    radius: '{rounded.lg}'
    padding: '26px 18px'
    shadow: '{spacing.lift-offset} {spacing.lift-offset} 0 {colors.border-strong}'
    mark-size: 46px
    mark-stroke: '3px {colors.border-strong}'
    title-typography: '{typography.heading-sm}'
    body-color: '{colors.text-secondary}'
    body-max-width: 30ch
  skeleton:
    row-border: '2px dashed {colors.border-default}'
    row-radius: '{rounded.md}'
    bar-height: 14px
    bar-radius: '{rounded.sm}'
    bar-fill: '{colors.accent-quiet}'
    shimmer-to: '{colors.surface-raised}'
    shimmer-duration: 1200ms
    shimmer-reduced-motion: none
---

## Brand & Style

Book List is a commissioned tool for one bookshop, and the PRD is blunt about what it is: *an order trap, not a bookstore.* It exists so that orders the vendor has already won do not evaporate between a WhatsApp message and a paper list. Two people use it. Nimali configures her two children's packs on a phone in the evening; the vendor works a single "today list" every morning with his tea. Neither of them is browsing. Both of them are trying to finish something.

So the aesthetic posture is **sturdy, signposted, physically weighted** — the direction Daanlk chose from four, rendered in `.working/direction-navy-mustard.html`. Nothing floats. Things *sit*. Edges are 2px and 3px, not hairlines. Shadows are hard offsets with no blur, as if each card were a card. Controls are chunky and obviously pressable, with a 120ms press that flattens the offset so the surface feels like it takes weight. This is a satchel and a school ledger, not a glassy consumer app, and that register does real work: it makes the vendor's daily grind legible at a glance, and it makes a parent trust a cash-on-delivery order placed with a shop she has never seen.

The colour treatment is **Chalk & Brass**, chosen from four refinements inside the navy-and-mustard family in `.working/color-themes-1.html`. Loud and unembarrassed: a chalk-white page in light mode, ink-black in dark, navy as the structural ink, and school-bag mustard as the one brand action colour — treated as brass, always a filled block with a hard navy edge around it. Mustard is where the money is: the primary button, the ticked checkbox, the active nav item, the *Ready To Deliver* pill. Nothing else gets to be mustard.

**Dark mode is a peer, not an inversion.** Parents order at night (UJ-1), so every one of the 21 semantic roles carries a designed dark value, and the dark set is not a filter applied to the light set — the status ramp flips from dark fills with white ink to light fills with ink-black text, because that is what stays legible on a near-black page.

Quality is load-bearing rather than decorative. The PRD asks the product to "feel a cut above what this market offers", and warns that an unpleasant admin screen sends the vendor back to running the shop off his phone (CM1). The admin surfaces therefore get the same care as the storefront: same tokens, same edges, same weight.

Motion is rich but subordinate. Presses flatten, totals count up rather than jump, rows settle in when they change. Nothing animates on the path between the vendor and his next phone call, or between Nimali and Place Order. Every transition is short (120–200ms) and every one of them, including the cold-start skeleton's shimmer, is dropped under `prefers-reduced-motion`.

Voice, owned by EXPERIENCE.md, is warm and plain-spoken — a helpful shopkeeper, never a system. It shows up here only as a typographic consequence: explanation text is a first-class citizen sized at `{typography.meta}` or `{typography.body}` inside a bordered notice, not a 10px grey aside.

**Brand mark.** A type-led wordmark plus a geometric pile-of-books mark, both buildable by the developer with no illustrator in the loop.

The mark is three stacked books in a `0 0 24 24` viewBox — three rounded rectangles, each 4 units tall with a 1.3-unit gap, each narrower than the one beneath it, all centred on x=12:

```html
<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
  <rect x="3"   y="15.5" width="18"   height="4" rx="1.2"/>
  <rect x="4.5" y="10.2" width="15"   height="4" rx="1.2"/>
  <rect x="6.2" y="4.9"  width="11.6" height="4" rx="1.2"/>
</svg>
```

Rules for the mark: it is drawn with `fill="currentColor"` and nothing else, so it is one-colour by construction and inherits whatever ink surrounds it — mustard on ink chrome (8.8:1), ink on a mustard surface (8.8:1), never mustard on white. Minimum rendered size is **18px** square; below that the 1.3-unit gaps close up. Clear space is **one book-height (4 units, one sixth of the mark's height) on all four sides** `[ASSUMPTION] the artifacts never state clear space; one book-height is derived from the mark's own internal rhythm`. At 40px and above, an outlined variant is used instead — same three books in a `0 0 48 48` box at `(7,33,34,8) (10,23,28,8) (13,13,22,8)`, `fill="none"`, `stroke-width="3"` — which is the form the empty states use.

The lockup is the mark plus the words **Book List** set in `{typography.heading-sm}` (weight 800, `-0.015em`), sitting inside an ink chip: `{colors.text-primary}` fill, `{rounded.DEFAULT}` corners, `7px 12px` padding, mark in `{colors.accent-primary}` and words in `{colors.surface-base}` (18.7:1). Mark and wordmark may be separated — the mark alone is the favicon and the empty-state illustration — but the wordmark is never re-set in another face, never tracked out, and never given a tagline.

## Colors

Twenty-one semantic roles, each with a light and a dark value, plus a closed 24-value pipeline ramp. Every ratio below was computed with the WCAG 2.x relative-luminance formula, not eyeballed. That matters here: the first draft of the colour pass contained 37 genuine AA failures that only computation caught.

**Surfaces — `surface-base` (`#FFFFFF` / `#06090F`), `surface-raised` (`#FFFDF6` / `#121826`), `surface-sunken` (`#FBEBC6` / `#000205`).** Chalk-white is the page, deliberately not warm cream — Chalk & Brass earns its warmth from mustard, not from paper. `surface-raised` is a barely-warm white (`#FFFDF6`) and is where nearly all content sits: title rows, cart lines, order rows, notices, modals. `surface-sunken` is the odd one out and needs care: in light it is the *mustard wash* `#FBEBC6`, so a "sunken" surface reads warm and brass-tinted rather than recessed. Use it for quantity readouts, input prefixes, disabled control fills and blocked buttons — never for large page areas, or the chalk register is lost. In dark, `surface-sunken` inverts to a true void `#000205` and behaves conventionally. Text-primary measures 18.7:1 on base, 18.4:1 on raised and 15.9:1 on sunken in light; 19.9:1, 17.7:1 and 20.8:1 in dark.

**`text-primary` (`#08131F` / `#FFFFFF`).** Near-black navy ink in light, pure white in dark. It is the body colour, the heading colour, and — this is the load-bearing part — it is *also* `border-strong` and `text-on-accent` in light mode. One ink does three jobs, which is why the palette holds together at speed. In light mode it is additionally the **chrome fill**: the storefront top bar, the pack screen's running-total bar and the admin sidebar are filled with `{colors.text-primary}` `[ASSUMPTION] Chalk & Brass defines no chrome surface token; the chosen direction has navy chrome, and the ink token is the only faithful way to realise it inside this palette`. On ink chrome the text tokens flip to their dark-mode counterparts, because chrome *is* a dark surface no matter which theme is active: labels in `text-secondary-dark` (10.3:1 on `#08131F`), values in `surface-base` (18.7:1), accents in `accent-primary` (8.8:1).

**`text-secondary` (`#44526A` / `#B4C1D4`).** Editions, timestamps, WhatsApp numbers, "6 of 8 titles", unit-price sublines. 7.9:1 on base and 7.8:1 on raised in light; 10.9:1 and 9.7:1 in dark. Generous for a secondary role, on purpose — this is where the shopkeeper's explanations live, and none of it is throwaway. Not for anything interactive.

**`text-on-accent` (`#08131F` / `#06090F`).** The only text colour permitted on a mustard surface: 8.8:1 in light, 10.8:1 in dark. White on mustard is **2.1:1** and is banned outright.

**`border-default` (`#7A6A46` / `#5A6683`).** The brass-brown control edge: every checkbox, stepper, input, cart line and order row boundary in its resting state. 5.3:1 against base and 5.2:1 against raised in light, comfortably over the 3:1 boundary floor. In dark it measures 3.1:1 against raised and 3.5:1 against base — it clears, but with almost nothing spare, so it must never be thinned below 2px in dark mode.

**`border-strong` (`#08131F` / `#97A5BC`).** Promotion, not decoration. It bounds every mustard fill, draws the 3px rule under a today-list group header, marks the row that needs the vendor's attention, and outlines cards, modals and empty states. 18.7:1 in light, 7.1:1 on raised in dark. When a component gains `border-strong` it is saying *this one matters* — the locked title row, the order awaiting a call — so it stays rare.

**`focus-ring` (`#123A6E` / `#FFE59A`) and `focus-ring-offset` (`#FFFFFF` / `#06090F`).** A **doubled ring**, and non-negotiable: 3px `focus-ring` with a 2px `focus-ring-offset` gap. There is no single hue that clears 3:1 against both a page surface and a mustard button, so the two halves cover for each other. In light, the core measures 11.3:1 on base and 5.3:1 on mustard — the core carries. In dark, the core measures 16.1:1 on base but only **1.5:1** on mustard, while the halo `#06090F` measures 10.8:1 on that same mustard — the halo carries. Whichever half is weak, the other one is at least 5.3:1. Never ship one ring.

**`accent-primary` (`#E8A61A` / `#F5B32B`) — school-bag mustard, the brand.** It is the primary button, the ticked checkbox, the active nav item, the cart count badge, the repeat-pack cart label, the *Ready To Deliver* pill, and the mark inside the lockup. It is **2.1:1 against white** (logged as 2.0:1 in the decision record; either figure is nowhere near the 3:1 floor), which produces the single hardest rule in this system: **mustard is only ever a fill.** Never a border, never a rule, never a hairline, never a divider, never text on a light surface. When a mustard fill needs an edge, that edge is `border-strong`. The memlog's "mustard as a structural band" is realised as filled bands bounded by ink, never as mustard lines. In dark, mustard is 10.8:1 against the page and behaves as brass — still fill-only, for consistency and because inverting the rule per mode is how the rule gets forgotten.

**`accent-primary-hover` (`#B87D08` / `#FFC94F`).** The deeper brass beneath a pressed button — it is the colour of the hard 4px bottom shadow that collapses under a press, and the hover fill. It carries `text-on-accent` at 5.3:1 in light and 13.0:1 in dark. Note it is only 3.5:1 against white, so like mustard it is a fill, not an edge.

**`accent-quiet` (`#FBEBC6` / `#3A2C08`).** The mustard *wash* — the way to say "brand-adjacent" without a saturated block. It is the quantity readout, the locked title row's background, and the skeleton's bones. In light it is the same hex as `surface-sunken` and `warn-tint`; that triple duty is a genuine property of Chalk & Brass and has a consequence spelled out under Components: anything relying on that wash to mean *warning* must also carry the solid `warning` edge, or it is indistinguishable from a quiet brand surface. `text-primary` measures 15.9:1 on it in light and 13.6:1 in dark.

**`danger` (`#A81D14` / `#FFA79E`) and `danger-tint` (`#FCE9E7` / `#3A1613`).** Unavailable checkout lines, removals, cancellations, field errors. 7.4:1 on base in light and 10.7:1 in dark; the ink measures 6.3:1 on its own tint in light and 8.6:1 in dark. Danger is allowed to be a border, unlike mustard.

**`warning` (`#7E5100` / `#FFCF5C`) and `warn-tint` (`#FBEBC6` / `#43300A`).** Reserved for two things: the repriced-line notice, and *call attempted*. 6.9:1 on base in light, 13.6:1 in dark; 5.8:1 and 8.6:1 respectively on their own tints.

**`success` (`#0E5C3C` / `#6BDCA8`) and `success-tint` (`#E3F3EB` / `#0E3A28`).** Confirmations and *Delivered*. 8.0:1 / 11.8:1 on base; 7.0:1 / 7.5:1 on tint. Success is never used to mean "order placed" — that state is deliberately neutral grey, because a placed order is not yet a good outcome for anybody.

**`info` (`#14477F` / `#9AC8FF`) and `info-tint` (`#E6EFFA` / `#122A45`).** Neutral explanatory notices — the cold-start message, "delivery charge to be confirmed by the shop". 9.4:1 / 11.5:1 on base; 8.1:1 / 8.4:1 on tint.

**The pipeline ramp** is a closed set of 24 fill/ink/edge triples, one per status per mode, and it is not available for anything except the status pill and the parent's vertical timeline. Its fills are near-iso-luminant by design: ink-on-fill lands between 7.4:1 and 9.5:1 across all eight statuses in light, and between 8.8:1 and 11.2:1 in dark. That tight band is what lets the set survive greyscale printing and colour-blind vision — no status is the "bright" one. `Order Is Placed` is **true neutral grey** (`#4A4A4E` / `#C4C9D0`), not slate-blue, because slate sat only five degrees of hue from `Order Confirmed`'s blue.

## Typography

**One system stack, no webfont.** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. This is a deliberate cost decision, not laziness: the stack is Express plus static `public/` HTML on a free tier that auto-sleeps, so the first request of the evening already pays a cold start (prd §9). A webfont would add a blocking round trip and a flash of unstyled text at exactly the moment the product is least forgiving. Weight does the work a second family would otherwise do — 800 for anything structural, 700 for names, 600 for supporting text, 400 for prose.

The ramp is deliberately short and heavily weighted at the top end, because both users read *numbers and names*, not paragraphs:

- `{typography.display}` (34px/800, `-0.02em`) — page titles at desktop width; drops to `{typography.display-mobile}` (27px) below 900px.
- `{typography.heading-lg}` (27px) — admin page headings. `{typography.heading-md}` (22px) — pack name on the pack screen, modal titles. `{typography.heading-sm}` (17px) — today-list group headers, notice titles, the wordmark.
- `{typography.amount-hero}` (30px/800, `-0.03em`) — the running pack total and the today-list counts, the two numbers each user is actually looking for. `{typography.amount-hero-wide}` (34px) is its desktop-rail variant. `{typography.amount-row}` (16px/800) is every per-line and per-order figure.
- `{typography.body}` (16px/1.5) — prose and explanations. `{typography.body-strong}` (15px/700/1.3) — book titles, parent names: dense list content that must stay scannable when a pack is realistically long (NFR6).
- `{typography.meta}` (12.5px/600) — editions, timestamps, unit-price sublines. Never below 12.5px, even in dense admin rows.
- `{typography.label-caps}` (11.5px/800, `0.1em`, uppercase) — section labels, field labels, tab labels, kickers. `{typography.pill-label}` (12px/800) — status pills, chips and badges. `{typography.step-number}` (9.5px/800) — the 1–8 step numeral inside a status pill, the only type permitted below 11.5px because it is a redundant channel, never the sole carrier of meaning.

**Numerals.** `font-variant-numeric: tabular-nums` is set globally on `body`. This is not a nicety: the vendor scans a column of totals and the parent watches a total recalculate as she unticks titles, and proportional digits make both jitter.

**Currency.** Money is always `Rs.` prefix, comma thousands, **no decimals** — `Rs. 9,320`, `Rs. 450`, `Rs. 21,020`. There is one currency and no tax, so a currency selector never appears. The prefix is part of the string in prose and totals; in an input it is a separate filled prefix block (see `{components.form-field}`). Amounts are right-aligned in any row or column that repeats, left-aligned in prose. Never render a bare numeral for money, and never render `Rs. 9,320.00`. Note that `.working/color-themes-1.html` shows bare numerals throughout — it was rendered before the currency was confirmed, and its sample copy is stale on this point only.

## Layout & Spacing

The scale is 8px-based with 4px half-steps: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40. `[ASSUMPTION] the HTML artifacts were hand-tuned and contain off-scale values (9, 11, 13, 22, 26px); the spine normalises them onto the 4px scale, which changes nothing perceptible but makes the build predictable.` A handful of values are fixed rather than scalar because they are physical or structural: `{spacing.touch-min}` and `{spacing.control-h}` at 44px, `{spacing.cta-h}` at 52px, `{spacing.tabbar-h}` at 56px, `{spacing.admin-sidebar-w}` at 214px, `{spacing.pack-rail-w}` at 288px.

**Mobile is the design origin.** `{spacing.margin-mobile}` (16px) frames every storefront screen; content is a single column of full-width rows with 8–12px between them. Rows are self-contained bordered blocks rather than items separated by dividers, because that is what survives a long pack list scrolling under a thumb. The bottom tab bar occupies 56px plus the device safe-area inset, and the pack screen's running-total bar sits directly above it — the total and the way forward are always on screen, never scrolled away.

**Desktop is a first-class target, not a stretched phone.** At `{spacing.storefront-max}` (760px) and above, the pack screen becomes two columns: the title list on the left, and a fixed 288px ink rail on the right carrying the running total, the per-title breakdown and the primary action. Storefront content is capped at 760px so the reading measure never sprawls `[ASSUMPTION] the artifact's desktop pack layout has a 760px minimum (1fr + 288px rail); no maximum content width was ever stated`.

**The admin is a two-column grid**: a 214px persistent left sidebar (the today list pinned at top, then the five catalog sections, then the export action pinned at the bottom and visually separated) and a fluid main column with `{spacing.margin-desktop}` (24px) padding. It is comfortable from about 900px `[ASSUMPTION] breakpoints of 760px and 900px are derived from the artifacts' own layout minimums; no breakpoints were ever specified`. Below that the same tokens must still hold — the vendor's screen is not guaranteed, and CM1 warns that an unpleasant admin sends him back to his phone.

Density is asymmetric on purpose. The storefront breathes: 12px inside a title row, 10px between rows, 20px between sections. The admin is tighter: 12–14px inside an order row, 8–10px between them, because the vendor's job is to see the whole morning at once. Neither side ever compresses a touch target to buy density.

## Elevation & Depth

Depth is **printed, not atmospheric**. There are no blurred shadows anywhere in this system. A raised surface is a bordered block with a hard offset shadow — a rectangle of solid ink displaced down and right — which is why things read as objects sitting on a page rather than panes floating above one.

Three levels, and no more:

1. **Flat.** Content rows in their resting state: `{colors.surface-raised}` fill, 2px `{colors.border-default}` edge, no shadow. Most of the app lives here.
2. **Lifted.** `2px 2px 0 {colors.border-strong}` — secondary buttons, count cards, small promoted blocks.
3. **Standing.** `3px 3px 0 {colors.border-strong}` with a 3px `border-strong` edge — cards, modals, empty states.

The primary button is the exception and the signature: its shadow is a **4px bottom-only** offset in `{colors.accent-primary-hover}`, so the button reads as a physical key with brass under its lip. On press the shadow goes to zero and the button translates 2px down over 120ms — the control visibly takes weight. Secondary buttons do the same trick at 2px. This press is the one piece of motion the product cannot do without, because it is the feedback that replaces a page reload (NFR3).

Ordering within a surface never depends on the shadow. The boundary is always carried by the border, which clears 3:1 in both modes; the shadow is decoration on top of a boundary that already passes.

**In dark mode the offset shadow is decorative only.** An ink shadow on a near-black page is invisible, so depth in dark is carried by the tonal step from `surface-base-dark` (`#06090F`) to `surface-raised-dark` (`#121826`) plus the `border-strong-dark` edge at 7.1:1. Where a shadow is still wanted — a modal over a raised surface — it is drawn in `{colors.surface-sunken-dark}`, reading as a hole rather than a highlight. `[ASSUMPTION] neither artifact renders Chalk & Brass in dark with an offset shadow; dark elevation is inferred, and a light-coloured offset was rejected because a highlight below-right of an object is physically incoherent.`

## Shapes

Corners are the quietest of the four status channels and the loudest bit of personality elsewhere. The logic is one sentence: **round means in motion, square-cut means final, and the bigger the object the softer its corners.**

- `{rounded.xs}` (3px) — square-cut. Terminal status pills (`Delivered`, `Cancelled`) and the step numeral's chip. Used nowhere else, so that a square corner in the pipeline reads as "this order is done."
- `{rounded.sm}` (6px) — checkboxes and skeleton bars: small enough that anything larger would look like a bubble.
- `{rounded.DEFAULT}` (8px) — the control radius. Steppers, inline buttons, inputs, chips, nav items, the brand chip.
- `{rounded.md}` (12px) — the content radius. Title rows, cart lines, order rows, notices, count cards.
- `{rounded.lg}` (18px) — the container radius. Cards, modals, empty states.
- `{rounded.full}` (9999px) — count badges, cart-line labels, and in-flight status pills. A pill says *moving*.

Radii are never mixed within one component, and an inner element always uses a radius at least one step tighter than its container. Nothing is a perfect circle except a glyph.

## Components

Every component below is specified in light-mode tokens; each token has a `-dark` peer and the dark rendering follows automatically unless stated otherwise. All interactive elements sit in a minimum 44×44px target and take `{components.focus-indicator}` — the doubled ring — on `:focus-visible`.

### Pack-screen title row

The signature surface of the storefront (NFR6, FR31–FR33). A `{rounded.md}` block on `{colors.surface-raised}` with a 2px `{colors.border-default}` edge, `10px 12px 12px` padding, laid out as a 44px checkbox column plus a fluid content column.

- **Checkbox** — 26px box, 3px `{colors.border-strong}` edge, `{rounded.sm}`, centred in a 44×44 target. Unchecked: `{colors.surface-base}` fill. Checked: `{colors.accent-primary}` fill with a 3px `{colors.text-on-accent}` tick at 8.8:1 (10.8:1 dark). `[ASSUMPTION] the direction pass drew this inverted — navy fill, mustard tick; the chosen colour pass draws a mustard fill with a navy tick, and the colour pass wins because it is the treatment Daanlk selected.`
- **Title** — `{typography.body-strong}`; edition and unit price beneath in `{typography.meta}` / `{colors.text-secondary}` at 7.8:1.
- **Footer** — stepper on the left, line total on the right in `{typography.amount-row}` with its `2 × Rs. 2,250` working beneath in `{typography.meta}`.
- **Unticked variant** — drops to `{colors.surface-base}` (visibly *not* raised), edge becomes 2px **dashed**, and the title is struck through with a 2px line in `{colors.text-secondary}`. Three channels, no reliance on hue.
- **Locked-last-title variant** — the row is **promoted, never greyed**: `{colors.accent-quiet}` wash, edge thickens to 3px `{colors.border-strong}`, and the checkbox stays at full strength with `opacity: 1` even while disabled. A dead-looking control would read as a bug; this is a rule, and it looks like one.

### Locked-title notice

The visible explanation NFR4 demands, sitting inside the locked row: `{colors.surface-raised}` fill, 2px `{colors.border-strong}` edge, `{rounded.DEFAULT}`, `8px 9px` padding, a 13px padlock glyph, text in `{typography.meta}` / `{colors.text-primary}`. Bordered and inside the row it explains — never a toast, never a tooltip, never colour-only. The same shell carries the cap-at-20 explanation.

### Quantity stepper

An inline group on `{colors.surface-raised}` with a 2px `{colors.border-default}` edge and `{rounded.DEFAULT}`, clipped so the two 2px internal dividers read as one continuous frame. Minus and plus are 44×44 with a 20px glyph; the readout is 46px minimum wide on `{colors.accent-quiet}` in `{typography.amount-row}`.

- **Disabled at 1** — the minus button only takes `{colors.surface-sunken}` fill with `{colors.text-secondary}` glyph (6.7:1 light, 11.4:1 dark). The frame does not change, the plus stays live, and the row's notice says why in words.
- **Capped at 20** — the plus button takes the same treatment and the cap is stated as text beside the stepper. Both disabled states remain 44×44 and remain focusable-looking; nothing vanishes.

`[ASSUMPTION] Chalk & Brass never renders a disabled control; the sunken-fill-plus-secondary-ink treatment is inferred from the direction pass's disabled stepper, translated into this palette.`

### Buttons

- **Primary** — `{colors.accent-primary}` fill, `{colors.text-on-accent}` label at 8.8:1, 3px `{colors.border-strong}` edge, `{rounded.md}`, 52px tall full-width or 44px inline, with the 4px `{colors.accent-primary-hover}` bottom shadow. Hover swaps the fill to `accent-primary-hover` (5.3:1 with the same ink); press flattens the shadow and translates 2px over 120ms. One primary per surface.
- **Secondary** — `{colors.surface-raised}` fill, `{colors.text-primary}` label, 2px `{colors.border-strong}` edge, `{rounded.DEFAULT}`, `2px 2px 0` lift. This is the default button; most actions are secondary.
- **Destructive** — `{colors.surface-raised}` fill with a 2px `{colors.danger}` edge and `{colors.danger}` label at 7.4:1 (10.7:1 dark). A solid variant — `danger` fill with `{colors.surface-base}` ink at 7.4:1, and `surface-base-dark` ink on the salmon dark fill at 10.7:1 — is reserved for the confirming action inside a terminal-action modal. In-row removals are an underlined `danger` text button in a 44px-tall target instead of a bordered block, so a cart line does not look like a row of equals.
- **Blocked** — a primary action that cannot fire yet (Place Order with unresolved staleness) renders as `{colors.surface-sunken}` fill, `{colors.text-secondary}` label, 2px `{colors.border-default}` edge, no shadow. It keeps its size and position: the button does not move or disappear when it unblocks.

### Cart line

`{colors.surface-raised}`, 2px `{colors.border-default}`, `{rounded.md}`, 12px padding, content left and amount right. The label chip carries the PRD's verbatim shape — `Pack 1 of Grade 5` — in `{typography.label-caps}` at `{rounded.full}`. The first line for a pack uses `{colors.text-primary}` fill with `{colors.accent-primary}` text (8.8:1); a repeat line for the same pack inverts to `{colors.accent-primary}` fill with `{colors.text-on-accent}` text and a 2px `{colors.border-strong}` edge. Two children's packs are therefore distinguishable by chip inversion *and* by wording. Name in `{typography.body-strong}`, composition in `{typography.meta}` (`6 of 8 titles · atlas ×2`), amount in `{typography.amount-row}`, and a `danger` underlined Remove beneath it.

### Status pill — all eight

Four channels, hue last, so the set survives greyscale, colour blindness and a bad phone screen:

1. **Step number** — `1`–`8`, `×` for Cancelled, in `{typography.step-number}` inside a 1.5px `currentColor` chip at `{rounded.xs}`.
2. **Unique glyph** at 12px, one per status, listed below.
3. **Weight band** — border style and thickness: **dashed 2px** = not started (`Order Is Placed`), **solid 2px** = in flight (statuses 2, 3, 4, 6), **solid 3px** = day-ending (`Ready To Deliver`, `Delivered`, `Cancelled`).
4. **Corners** — `{rounded.full}` while the order is in motion, `{rounded.xs}` square-cut for the terminal states (`Delivered`, `Cancelled`). Cancelled additionally strikes its label through with a 2px line.

Only then, hue. Padding is `5px 9px`, label in `{typography.pill-label}`, gap 4px.

| # | Status | Glyph | Band | Corners | Light fill / ink | Dark fill / ink |
|---|---|---|---|---|---|---|
| 1 | Order Is Placed | dashed ring | dashed 2px | full | `#4A4A4E` / white **8.8:1** | `#C4C9D0` / `#08131F` **11.2:1** |
| 2 | Order Confirmed | tick | solid 2px | full | `#14477F` / white **9.4:1** | `#8FC0FF` / `#08131F` **9.9:1** |
| 3 | Processing | half-disc | solid 2px | full | `#4E3390` / white **9.5:1** | `#BBA6F2` / `#08131F` **8.8:1** |
| 4 | Packing The Order | crate | solid 2px | full | `#7C2460` / white **9.2:1** | `#F09AD0` / `#08131F` **9.1:1** |
| 5 | Ready To Deliver | flag | solid 3px | full | `#E8A61A` / `#0B1B33` **8.1:1** | `#F0B434` / `#0B1B33` **9.3:1** |
| 6 | On Delivery Partner | arrow | solid 2px | full | `#0A5C6B` / white **7.6:1** | `#6FD0E2` / `#08131F` **10.5:1** |
| 7 | Delivered | double-tick | solid 3px | **xs** | `#0E5C3C` / white **8.0:1** | `#6BDCA8` / `#08131F` **11.1:1** |
| × | Cancelled | cross + strike | solid 3px | **xs** | `#A81D14` / white **7.4:1** | `#FF9A90` / `#08131F` **9.1:1** |

Edges clear the 3:1 boundary floor throughout: 4.6 / 5.5 / 5.4 / 5.2 / 16.9 / 4.6 / 4.7 / 4.8 in light against `surface-base`, and 5.8 / 6.1 / 5.5 / 5.7 / 13.1 / 5.9 / 6.2 / 5.2 in dark against `surface-raised-dark`. `Ready To Deliver` is the only pill whose fill is mustard, and it obeys the mustard rule: navy ink, and a `#0B1B33` edge around the fill.

The eight glyphs, in a `0 0 14 14` box unless noted, `stroke="currentColor"` with `stroke-linecap="square"`:

```html
<!-- 1 dashed ring     --><circle cx="7" cy="7" r="5" fill="none" stroke-width="2.4" stroke-dasharray="2.6 2.2"/>
<!-- 2 tick            --><path d="M2 7.6l3.2 3.2L12 3.6" fill="none" stroke-width="2.6"/>
<!-- 3 half-disc       --><circle cx="7" cy="7" r="5.4" fill="none" stroke-width="2"/><path d="M7 1.6a5.4 5.4 0 010 10.8z" fill="currentColor"/>
<!-- 4 crate           --><rect x="1.6" y="3.4" width="10.8" height="8.4" fill="none" stroke-width="2"/><path d="M1.6 6.6h10.8M7 6.6v5.2" stroke-width="2"/>
<!-- 5 flag            --><path d="M3 12.6V1.8h8.4L9.2 5.4l2.2 3.6H4.4" fill="currentColor"/>
<!-- 6 arrow           --><path d="M1 7h10M8.4 3.2L12.6 7l-4.2 3.8" fill="none" stroke-width="2.4"/>   <!-- 0 0 16 14 -->
<!-- 7 double-tick     --><path d="M1 7.6l3 3.2 5.6-7.2M8 10.8l1 1 6-7.6" fill="none" stroke-width="2.4"/> <!-- 0 0 18 14 -->
<!-- × cross           --><path d="M2.4 2.4l9.2 9.2M11.6 2.4l-9.2 9.2" stroke-width="2.8"/>
```

`[ASSUMPTION] two channels needed reconciling. Chalk & Brass rendered all eight pills as solid fills at a uniform 3px radius, which is what makes its fills near-iso-luminant — but that flattens the weight-band and corner channels the decision record requires. Resolution: keep Chalk & Brass's exact solid fills (iso-luminance and the measured ratios above are preserved untouched) and carry the weight band on border style and thickness instead of on fill weight, and restore full-pill corners for non-terminal states so square-cut still means terminal. Four channels survive; the chosen palette is unaltered.`

### Call-state chip (FR60)

`call-attempted` and `never-called` must not look identical, and they differ on three axes before hue:

- **Not called yet** — `{colors.surface-raised}` fill, 2px **dashed** `{colors.border-default}` edge, `{colors.text-secondary}` label at 7.8:1, a hollow 2.6px ring glyph, and the words "Not called yet".
- **Called · no answer** — `{colors.warn-tint}` fill, 2px **solid** `{colors.warning}` edge, `{colors.warning}` label at 5.8:1 (8.6:1 dark), a *filled* handset glyph with a struck tail, and the words plus a timestamp: "Called 9:15 am · no answer".

Dashed versus solid, hollow versus filled, and different words. Note that in light mode `warn-tint` is the same wash as `accent-quiet`, so the attempted chip **must** keep its solid `warning` edge — without it, the chip is indistinguishable from a quiet brand surface.

### Admin today list

- **Group header** — status name in `{typography.heading-sm}`, a count badge in `{colors.accent-primary}` / `{colors.text-on-accent}` at `{rounded.full}`, a right-aligned note in `{typography.meta}` / `{colors.text-secondary}`, all sitting on a 3px `{colors.border-strong}` bottom rule. The heavy rule is what lets the vendor find "Awaiting confirmation" without reading.
- **Order row** — `{colors.surface-raised}`, 2px `{colors.border-default}`, `{rounded.md}`, `12px 14px` padding, five columns at `88px 1.5fr 1.1fr 152px auto` with 14px gaps: order ID, parent, lines summary, status pill, call chip. ID in `{typography.heading-sm}` with tabular numerals and its time beneath in `{typography.meta}`; parent name in `{typography.body-strong}` with WhatsApp number, line count and total in `{typography.meta}`.
- **Attention variant** — the row that needs a call takes `{colors.border-strong}` and thickens its **left** edge to 8px. A vertical ink rail down the left of the list is readable at arm's length across a whole screen of rows, which is the actual job of the today list.
- Below 900px the same row reflows to two lines — ID and status on the first, parent and call state on the second — keeping every token and every target size.

### Sidebar navigation item

The admin sidebar is ink chrome: `{colors.text-primary}` fill in light, `{colors.surface-raised-dark}` in dark, 214px wide. Section labels in `{typography.label-caps}` / `{colors.text-secondary-dark}`. Items are 44px tall, `{rounded.DEFAULT}`, `{typography.body-strong}`, label left and count right. Resting label is `{colors.text-secondary-dark}` at 10.3:1 on ink; the active item is a `{colors.accent-primary}` fill with `{colors.text-on-accent}` label at 8.8:1 — a mustard block, never a mustard stripe. A count on a resting item is a `{colors.border-strong-dark}`-edged chip with light text; a count on the active mustard item inverts to `{colors.text-primary}` fill with `{colors.accent-primary}` text, so it stays visible inside the brass. The export action sits at the bottom, separated by 24px and a 2px `{colors.border-default-dark}` rule.

### Bottom tab bar item

Four tabs — Browse, Cart, Orders, Account. The bar is `{colors.surface-raised}` with a 2px `{colors.border-strong}` top edge, 56px tall plus the safe-area inset. Each item is a 44×44 minimum target with a 22px glyph over a `{typography.label-caps}` label in `{colors.text-secondary}`. The active tab is a `{colors.accent-primary}` block behind glyph and label, 2px `{colors.border-strong}`, `{rounded.DEFAULT}`, ink label at 8.8:1 — the mustard rule forbids the obvious mustard underline, and a filled block is both compliant and louder. The Cart badge is a `{rounded.full}` chip, 20px minimum, `{colors.accent-primary}` fill with a 2px `{colors.border-strong}` edge and `{typography.pill-label}` ink; on the active Cart tab it inverts to `{colors.text-primary}` fill with `{colors.accent-primary}` digits. `[ASSUMPTION] the tab bar was decided after both render passes and appears in no artifact; height, indicator and badge treatment are inferred from the system's own rules, with the mustard-fill-not-stripe constraint doing most of the deciding.`

### Form field

Label above in `{typography.label-caps}`. Control is `{colors.surface-raised}`, 2px `{colors.border-default}`, `{rounded.DEFAULT}`, 44px minimum height, value in `{typography.amount-row}` for money or `{typography.body}` for text. A money field carries a filled `Rs.` prefix block — `{colors.surface-sunken}` with a 2px `{colors.border-default}` right divider — so the currency is never typed. Focus takes the doubled ring; the field's own border does not change colour on focus, because the ring is the signal.

**Error state**: the border thickens to 3px `{colors.danger}` and the message sits directly beneath in `{typography.meta}` / `{colors.danger}` (7.4:1) with a 12px triangle glyph. The field keeps its `surface-raised` fill and keeps the typed value. Never a red fill behind text the user still has to read, never an error that only appears as colour. `[ASSUMPTION] the artifacts specify banner-level errors but no field-level error rendering; the 3px-danger-edge treatment is inferred from the banner language.`

### Banner / notice

`{rounded.md}`, `13px 15px` padding, a **3px** solid border in the semantic hue over the matching tint fill, title in `{typography.heading-sm}` in the hue, body in `{typography.body}` / `{colors.text-primary}`, actions on a 13px top margin. Four flavours: `danger`, `warning`, `success`, `info`.

The **blocking checkout-staleness banner** (FR49) is the `danger` flavour, sits at the top of the checkout summary, states how many lines still need attention, and stays until the last one is resolved. Its per-line partners are inline: a repriced line takes the `warning` flavour with an "Accept Rs. 1,240" primary and a "Remove this line" secondary; an unavailable line takes `danger` with a single remove action. While any flag is open, Place Order renders as `{components.button-blocked}` in place, so the parent can see exactly what is standing between her and the order. Nothing is hidden behind a modal, and the literal FR45 line — *Delivery charge: to be confirmed by the shop* — stays visible on a `{colors.accent-quiet}` strip with a 2px `{colors.border-default}` edge, above the goods total.

### Modal confirmation

Terminal actions only (FR65: Delivered, Cancelled, and the parent's cancel). `{colors.surface-raised}`, 3px `{colors.border-strong}`, `{rounded.lg}`, 20px padding, `3px 3px 0` standing shadow, title in `{typography.heading-md}`, body in `{typography.body}`, actions right-aligned with the destructive confirm as the solid variant and a secondary Cancel beside it. Backdrop is `{colors.text-primary}` at 55% in light and `{colors.surface-sunken-dark}` at 70% in dark `[ASSUMPTION] backdrop treatment appears in no artifact`. Modals stack one level deep, never two.

### Empty state

A standing card: `{colors.surface-raised}`, 3px `{colors.border-strong}`, `{rounded.lg}`, `3px 3px 0` shadow, centred content with 26px vertical padding. A 46px **outlined** pile-of-books mark in `{colors.border-strong}` at 3px stroke, then a title in `{typography.heading-sm}`, then at most two lines of `{typography.body}` / `{colors.text-secondary}` capped at 30ch, then one primary button that goes somewhere. Every empty state has that button — cart, pack discovery with no packs, no open orders, no past orders, and each of the five admin catalog lists.

### Cold-start skeleton

The branded stand-in for the auto-sleep first request. It is the *shape of the page being loaded*, not a spinner: dashed 2px `{colors.border-default}` rows at `{rounded.md}`, each holding a 26px `{rounded.sm}` block where the checkbox will be and two bars where the title and edition will be, bars 14px tall at `{rounded.sm}` filled with `{colors.accent-quiet}`. Brass bones on a chalk page — it looks like Book List, not like a generic loader. An `info` notice above it names what is happening in the shopkeeper's voice and reassures about the cart.

Shimmer is a 1200ms linear sweep from `{colors.accent-quiet}` toward `{colors.surface-raised}`, and it is **removed entirely** under `prefers-reduced-motion` — the skeleton then holds still at its base fill. `[ASSUMPTION] the decision record fixes the branded skeleton and the reduced-motion requirement but not the shimmer's direction, duration or colour delta.`

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use mustard `{colors.accent-primary}` as a **fill only**, bounded by `{colors.border-strong}` when it needs an edge | Use mustard as a border, rule, hairline, divider, underline or text on a light surface — it is **2.1:1** on white and fails every threshold |
| Put `{colors.text-on-accent}` (navy ink, 8.8:1) on every mustard surface | Put white on mustard — 2.1:1, banned outright, no exceptions for "large text" |
| Ship the **doubled** focus indicator: 3px `{colors.focus-ring}` plus a 2px `{colors.focus-ring-offset}` gap | Ship a single-hue focus ring — the dark core is **1.5:1** on mustard and disappears |
| Encode status on four channels — step number, glyph, border weight, corner shape — before hue | Let hue, or any single channel, carry a status; the set must survive greyscale |
| Keep `Order Is Placed` true neutral grey | Give it a slate-blue tint; it sat five hue-degrees from `Order Confirmed` |
| Differentiate `call-attempted` from `never-called` on edge style, glyph fill and wording | Rely on the warm fill alone — in light mode it is the same wash as `{colors.accent-quiet}` |
| Render money as `Rs. 9,320` — prefix, comma thousands, no decimals, tabular numerals | Render bare numerals, decimals, or a currency selector |
| **Promote** blocked-by-rule elements: heavier edge, `{colors.accent-quiet}` wash, full-strength control | Grey out the locked last title or a capped stepper; a dead control reads as a bug, not a rule |
| Keep every interactive element in a 44×44px target and explain every refusal in bordered text | Shrink a target to buy density, or refuse with only a colour change or a toast |
| Use hard offset shadows with zero blur, over a border that already clears 3:1 | Add blurred or ambient shadows, gradients, or let a shadow carry a boundary |
| Give dark mode its designed values from the `-dark` tokens | Generate dark by inverting or filtering light; the status ramp flips fill and ink, it does not invert |
| Keep to the system font stack | Add a webfont — the free tier already pays a cold start on the first request of the evening |
| Keep motion at 120–200ms, and drop all of it — including the skeleton shimmer — under `prefers-reduced-motion` | Animate anything on the path to Place Order or to the vendor's next status change |
| Assert accessibility with a measured ratio | Assert AA without a number; the first colour draft hid 37 real failures |
