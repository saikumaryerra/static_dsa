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
- Non-empty resting frames, so no renderer computes a box its own resting label cannot fit.
  **[corrected after implementation]** — this bullet claimed the fix is what "stops `trees-bst`
  shipping a 1,277 px blank box to JS-off readers and to print". That was true at `dab6108`, but it
  is **not what fixed it**: freezing the extent (Task 4) draws step 0 inside the trace's `380×222`
  box, and by the time the resting-frame fix ran (Task 5) both stills were already un-clipped. Task
  5 is a real fix only for **extent-less callers** — a unit test, a bare `renderStatic`, an
  all-empty trace — plus a position change on the shipped stills (the tree's label moves from a
  `start`-anchored 50→160 to a centred 10→120). The plan named `/dev/renderers` as one such
  surface and **that is wrong too**: the dev gallery renders through the real `<Visualizer>`, so it
  gets a frozen extent like every other page.
- Marker labels routed correctly, so **seven** instruments stop printing a search-window vocabulary
  their prose disowns. **[corrected]** — this said "five sorting algorithms and linear search";
  `array-operations` is the seventh, and it prints the bogus labels on all 13 steps of the arrays
  lesson.
- The legibility floor kept correct under the frozen extent — and, on measurement, *not* rebuilt:
  the shipped RSP-2 floor is already a two-axis floor and there is no height cap to exceed, so the
  vertical mechanism an earlier draft designed is deleted rather than specified.
- The custom-input P0.

Its scoping audit has been **run**, so the plan is sized by measurement rather than assumption:
**seven of twelve registered renderer ids** vary their extent across a trace (`array`, `tree`,
`heap`, `hashTable`, `callStack`, `stack`, `linkedList`) — **[corrected]** an earlier count said
"seven of eleven" because it omitted `queue`, which the audit covers and reports constant — and
**exactly two** algorithms render a broken resting frame — `bst-operations` (label entirely outside
its 40-unit viewBox) and `heap-operations` (label overflowing an 80-unit box). Six other resting
frames that an early draft assumed were broken are in fact fine and must be left alone.

**Depends on:** nothing. **Spec:** `2026-08-18-plan-a-renderer-contract-design.md`.

### Plan B — Achromatic palette

The chrome gives up its only hue so the six `--hl-*` roles keep all of them. Independent of A and
C; mergeable on its own at any point. **[corrected 2026-08-19 by audit]** — the claims below
replace an earlier summary that was wrong in three ways.

- 13 tokens = **46 declarations**, confirmed: 10 light `:root` + 13 `[data-theme="dark"]` + 13
  `prefers-color-scheme` mirror + 10 `@media print` mirror. The two other `:root` blocks carry no
  colour.
- The suite is **88 tests, not 74** — that figure omitted four DifficultyChip checks, two glossary
  checks and eight structural tests. The palette passes all of them, 0 failures, and dissolves a
  documented WCAG 1.4.11 defect (dark `--border-strong` on `--surface-raised`, 2.64:1 → 3.15:1).
- **Two literal sites undercounts.** Add `public/favicon.svg` (indigo, and `npm run og` inlines it
  *verbatim*, so the card keeps an indigo mark), its two un-scripted PNG derivatives, the shadow
  hue (built from the retired slate `--text`), and two hardcoded `rgb()` assertions in
  `m1-gaps.spec.ts` that fail CI.
- Five distinctions collapse because `--brand` becomes byte-identical to `--text` — the contrast
  matrix cannot see any of them, since it tests colour against grounds and never state against
  state.
- **The typeface is split out and deferred**, not dropped: the shipped Atkinson subset is missing
  16 codepoints the site renders, including the renderer's own `✓` and `✕` marker glyphs.

**Depends on:** nothing. **Spec:** `2026-08-19-plan-b-achromatic-palette-design.md`.

### Plan C — The ledger and the instrument

The redesign proper, and where nearly all the churn lived.

- Stable instrument ids (23 call sites across 17 files, including the dev gallery's 12 instruments
  from one `samples.map()` call site).
- `core/ledger.ts` (pure) + `Ledger.astro`; the collapsed default; the DOM row cap.
- The instrument restructured into one stacked frame; the scrub slider retained but visually hidden.
- `<StepLink>` anchors; the seven-spec test migration.
- binary-search declares columns; trees-bst proves the generic fallback.

**Depends on:** Plan A (stable frames). **Spec:** `2026-08-19-plan-c-ledger-design.md`.

**[corrected 2026-08-19 by audit]** — three additions the carried-forward list below missed
entirely, all found against the code:

- **The ledger is Predict mode's answer key.** Every predictor grades on `trace[i+1]`; the table
  renders it. For bubble and insertion sort the `swaps` column *is* the grading expression. Three
  answers read off a four-row table would earn a Practiced mastery state, and `?review=1` opens
  predict automatically. Gated in `setPredict`, with the row seeks declined the way the slider's
  handler already declines. **Not** the killed cost withholding — see the spec's §4.1 evidence
  table. Trace Trials are separately verified as *not* a conflict.
- **The worktree's ledger goes stale on every custom run** — built in frontmatter, captured once,
  never rebuilt. A capped run reaches 901 rows against a 29-row table.
- **`suppressFinalCost` was wrong on its own terms** as well as by premise: it blanked 12
  instruments to guard the 6 that host a Final Run.

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

**A vertical legibility floor is removed from Plan A entirely**, and by the same method. An earlier
draft designed a whole mechanism — a `--viz-label-min: 11px` token, an explicit pixel height,
`overflow-y: auto`, a `max-height` tied to the input cap, and scroll-into-view on step change.
Measurement retired all of it: uniform `meet` scaling makes the shipped RSP-2 `min-width` already a
two-axis floor; no `max-height` exists anywhere in `Visualizer.astro` to overflow against; and
adding one would *create* the WCAG 2.1.1 failure it claimed to prevent, because `measureCanvas`
derives `tabindex`/`role`/name from horizontal overflow alone. Plan A therefore ships **no source
change** for this item — only a regression test that `--viz-natural-w` holds one value for a whole
run. Both deletions are recorded in site spec §19.1 so they stay settled.

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

**Plan C** — all carried into its spec: the collapsed default is a native `<details>`, which
settles SSR-vs-hydrate (`hidden="until-found"` does not work on `<tr>` and is not used);
`<StepLink>` needs row ids **and** a `scroll-margin-top` that no rule currently gives a `<tr>`;
`firstSentence` must not break on `;` and must retain the terminator; the slider cannot be deleted
(the island early-exits without it — now `Visualizer.astro:2232`, moved by Plans A and B) and
**eight** specs depend on it, not seven. It is revealed-on-focus rather than permanently hidden,
because a permanently invisible focusable range input fails WCAG 2.4.7.

---

## Unchanged

The design is not reopened by this decomposition. What changed is how it ships: three reviewable
plans instead of one bundle. The invariants stand — trace-then-render unforked, no backend or
tracking, ≤ 60 KB gz per lesson page, full function with JavaScript disabled, WCAG 2.1 AA, no new
dependencies, mastery states as the only progress currency, no new `localStorage` key, nothing
fabricated.
