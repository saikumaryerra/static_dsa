# Show Your Work — decomposition

**Status:** approved design, decomposed into three sub-projects
**Branch:** `feat/show-your-work-slice`
**Date:** 2026-08-18

---

## Why this document exists

The "Show Your Work" redesign was approved as a design, then specified as a single **vertical
slice**: the ledger machinery proven on two lessons. That spec was reviewed twice by five
adversarial lenses.

| round | blockers | should-fix | nits |
|---|---|---|---|
| 1 | 23 | 44 | 15 |
| 2 | 20 | 39 | 14 |

The count barely moved, but the *content* of the blockers changed almost entirely: round 2's were
largely new problems exposed by round 1's fixes. That is not convergence. All five lenses
independently reached the same structural verdict — **the slice bundles three loosely-coupled
workstreams, and their interactions generate fresh contradictions faster than the fixes retire
them.**

So the work is split. Each sub-project gets its own spec → plan → implementation cycle, and each is
small enough to converge and to review as one diff.

---

## The three plans

### Plan A — Renderer contract and the drawing's P0s

Fixes verified bugs and ships value with no new components and no visual redesign. Everything Plan C
later draws on top of is made stable here first.

- One viewBox per trace (the full `extent` lifecycle), so the canvas stops resizing while stepping.
- Non-empty resting frames, so `trees-bst` stops shipping a 1,277 px blank box to JS-off readers
  and to print.
- Marker labels routed correctly, so five sorting algorithms and linear search stop printing a
  search-window vocabulary their prose disowns.
- The legibility floor kept correct under the frozen extent — and, on measurement, *not* rebuilt:
  the shipped RSP-2 floor is already a two-axis floor and there is no height cap to exceed, so the
  vertical mechanism an earlier draft designed is deleted rather than specified.
- The custom-input P0.

Its scoping audit has been **run**, so the plan is sized by measurement rather than assumption:
**seven of eleven renderers** vary their extent across a trace (`array`, `tree`, `heap`,
`hashTable`, `callStack`, `stack`, `linkedList`), and **exactly two** algorithms render a broken
resting frame — `bst-operations` (label entirely outside its 40-unit viewBox) and `heap-operations`
(label overflowing an 80-unit box). Six other resting frames that an early draft assumed were broken
are in fact fine and must be left alone.

**Depends on:** nothing. **Spec:** `2026-08-18-plan-a-renderer-contract-design.md`.

### Plan B — Achromatic palette, fonts, OG card

Already solved and verified: the palette passes all **74** contrast checks (37 per theme) across
`CORE_PAIRS`, the six highlight tints and their strokes, the marker glyphs and the elevation
ordering. Independent of A and C; mergeable on its own at any point.

- 13 tokens (10 light, 13 dark) across `tokens.css`'s three theme blocks, the `@media print` mirror
  in `global.css`, and the hardcoded literals in `BaseLayout.astro:72-73` and
  `ThemeToggle.astro:147` — 46 declarations plus two literal sites.
- Atkinson Hyperlegible Next + Mono, 51,748 B, checked in with `OFL.txt`.
- `npm run og` regenerated in the same commit (the card reads its colours from the light `:root`).
- The contrast matrix extended; `m7-brand.spec.ts` migrated for the retired chrome shadow.

**Depends on:** nothing. **Spec:** to be written when its turn comes.

### Plan C — The ledger and the instrument

The redesign proper, and where nearly all the churn lived.

- Stable instrument ids (23 call sites across 17 files, including the dev gallery's 12 instruments
  from one `samples.map()` call site).
- `core/ledger.ts` (pure) + `Ledger.astro`; the collapsed default; the DOM row cap.
- The instrument restructured into one stacked frame; the scrub slider retained but visually hidden.
- `<StepLink>` anchors; the seven-spec test migration.
- binary-search declares columns; trees-bst proves the generic fallback.

**Depends on:** Plan A (stable frames). **Spec:** to be written when its turn comes.

---

## Order

**A → B → C.** A first because it fixes the verified P0s and stabilises the drawings that C builds
on. B may merge at any time, before or after A, since it shares no files with either. C last.

---

## What the review deleted

**Cost withholding is removed from the design entirely.** The first spec invented a mechanism to
hide a ledger's cost column because it would "publish the Final Run's answer". The premise was
wrong, and checking it is what killed the mechanism:

- `FinalRun`'s earned-credit rule is **card-scoped**. `shown` is a local `let` at
  `FinalRun.astro:542`, set only when *that card* reveals its own answer (`:584`, `:627`) and read
  at `:599`. Nothing in that path inspects the visualizer.
- The number is already on screen by design: `showMetrics` defaults to `true`
  (`Visualizer.astro:122`), so the comparisons pill is live on binary-search.
- The final step's own authored explanation reads *"Found 7 at index 3 after 3 comparisons."*
- `FinalRun`'s "Watch it happen" link sends the reader to that instrument deliberately.

The mechanism would have guarded a number the product intentionally shows, at a cost of authored
props on six lessons, a unit test, an e2e test, a JS-off table with an amputated column, and an
assertion that could not pass on the flagship lesson (`comparisons === rows − 1` there). Six
blockers dissolve with it.

If hiding the metric is ever wanted, it is a **product** decision about `showMetrics`, the metric
pill and the authored final sentence — not a ledger implementation detail.

---

## Carried forward into the sub-specs

Findings from both review rounds that remain live, filed against the plan that owns them:

**Plan A** — all carried into its spec and resolved there: the `extent` lifecycle needs a
`setExtent` channel, because `render` takes no opts and `mount` runs once; the marker-vocabulary
assertion is scoped by highlight *kind* rather than by algorithm, so authored labels
(`GraphRenderer`'s `at`, `array-operations`' `read`/`shift`, `insertion-sort`'s `key`) survive while
`array-operations`' bogus range labels are still caught; `metaLabel` reads only `meta.label`, so a
range gets a sibling helper; the vertical floor is measured away entirely, because uniform
`meet` scaling makes the shipped `min-width` a two-axis floor and no `max-height` exists to overflow
against; and the custom-input bracket-wrap is gated client-side on
`splitAuthoredInput(root.dataset['input']).input`, never on the build-time `arrayPlaceholder`, whose
no-authored-input fallback lies.

**Plan B** — 13 tokens / 46 declarations / two literal sites, not "a one-line diff";
`m7-brand.spec.ts` pins the chrome shadow.

**Plan C** — the collapsed default must decide SSR-vs-hydrate (a server-collapsed table plus a
JS-off disclosure button is a dead control); `hidden="until-found"` does not work on `<tr>`;
`<StepLink>` needs row ids to anchor to; `firstSentence` must not break on `;`; the slider cannot be
deleted (`Visualizer.astro:2173` early-exits without it) and seven e2e specs assert on it.

---

## Unchanged

The design is not reopened by this decomposition. What changed is how it ships: three reviewable
plans instead of one bundle. The invariants stand — trace-then-render unforked, no backend or
tracking, ≤ 60 KB gz per lesson page, full function with JavaScript disabled, WCAG 2.1 AA, no new
dependencies, mastery states as the only progress currency, no new `localStorage` key, nothing
fabricated.
