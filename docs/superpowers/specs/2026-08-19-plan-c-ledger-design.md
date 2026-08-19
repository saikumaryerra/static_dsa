# Plan C — The ledger and the instrument

**Status:** design, audited against the code, ready for review
**Branch:** `feat/show-your-work-slice`
**Date:** 2026-08-19
**Part of:** `2026-08-18-show-your-work-decomposition.md` (plan 3 of 3 — the redesign proper)

---

## 1. What this is

The trace, written out.

A `Step` already holds `{ state, highlights, explanation, metrics }`. That is one **row** with
columns, and `Trace = Step[]` is the **table**. The site has always computed this and then shown
it one frame at a time behind a slider. Plan C transcribes it: a ruled `<table>` under the
drawing, one row per step, columns from `step.state`, "what happened" from the authored sentence.

Plans A and B built the floor. A froze the drawing box so a table can sit under something that
does not move; B took the hue out of the chrome so the table reads as a document rather than a
widget. This is the part a reader sees.

**In scope:** `core/ledger.ts` (pure) + `Ledger.astro`; stable instrument ids; the instrument
restructured into one stacked frame with the scrub slider retained as a focus-revealed control;
`<StepLink>`; binary-search declaring columns and trees-bst proving the generic fallback.

**Out of scope:** the typeface (still deferred, see Plan B §8); any change to the `--hl-*` roles;
any new `localStorage` key.

---

## 2. The abandoned build, and what it costs to reuse

`.claude/worktrees/show-your-work` (`3bf4d70`) implemented this — `core/ledger.ts` (177 lines),
`Ledger.astro` (263), `tests/unit/ledger.test.ts` (215). It is a skeleton to learn from, and it
is **pre-Plan-A and pre-Plan-B**: its renderer contract has no `Extent` or `measure`, and its
palette is the uncorrected draft. Anything it does in those areas is superseded.

**Carry:** the pure-module split (derivation in `.ts` so the node-only Vitest harness can reach
it; render in `.astro`); `LedgerColumn`/`LedgerSpec` in `core/types.ts`; the `LedgerRow`/`Ledger`
shape; `cellOf` and `ABSENT = '·'`; `metricKeys()`'s first-seen-order fallback; header ordering;
`<th scope="row">` with an inner `<button>` rather than `<tr role="button">` (which would destroy
the column-header association); roving tabindex; buttons shipped `disabled` and enabled by the
island; the ledger placed **outside** `.viz-controls` so the `<noscript>` kill-switch spares it.

**Delete outright:** `suppressFinalCost`, `BuildLedgerOptions`, `LedgerCell.withheld`, the
`data-withheld` markup and its `::after` CSS, and the six tests that pin them. The review killed
the premise, and the implementation was independently wrong: `pinnedInput` reads `PINNED_INPUTS`,
which holds **12** pairs because it also serves Trace Trials, while only **6** host a Final Run.
The worktree therefore blanked the last-row cost of instruments with no Final Run at all —
`binary-search/linear-search` among them, and the committed aria baseline records the damage.
**Twelve instruments lost a legitimate value to guard six.**

**Rewrite:** `firstSentence`. Its regex `/^(.{0,120}?[.;])(\s|$)/` splits on semicolons and strips
the terminator, which guts the flagship lesson — *"Search window is indices 0–5; middle index 2
holds 5, which is less than 7"* truncates to *"Search window is indices 0–5"*, losing the probe.
Terminators are `.` `?` `!` only, and the terminator is **retained**. Its two unit tests pin the
bug as correct and must be rewritten with it.

Also drop the `aria-describedby` on the table: it points at the same visually-hidden `<caption>`
that already supplies the accessible name, so the name and description are the identical string.

---

## 3. The defect the worktree shipped: the ledger goes stale

**`buildLedger` runs only in frontmatter, and the island captures the rows once.** There is no
rebuild path. The custom-input submit handler and "Restore example" both call
`player.loadTrace(...)` and never touch the table, so after a custom run the reader sees the
**old table beside the new drawing** — the exact thing `core/ledger.ts`'s own header says cannot
happen, and that `binary-search.ts` claims in a comment ("the table and the picture cannot
disagree").

Measured, at the §11 input caps:

| instrument | rows in the DOM | steps in a capped custom run |
|---|---|---|
| bubble-sort | 29 | **901** |
| insertion-sort | 31 | 930 |
| selection-sort | 33 | 735 |
| bst-operations | 19 | 497 |
| quick-sort | 23 | 510 |

Past row 29 the "you are here" mark simply vanishes, the seek buttons address indices the new
trace may not have, and the value columns show the old run's numbers. No test catches it: all
four ledger e2e tests run the authored input only.

**Plan C owns this.** The ledger must be rebuilt on every `loadTrace` — which is exactly the
`applyTrace` seam Plan A already created for the extent, and the same three call sites. Rebuilding
in the island means the derivation must be reachable from client code, which the pure-module split
already allows.

**This is what makes a DOM row cap a real question.** Today the table never grows, so the cap is
moot. Once it tracks the run, a 901-row table is reachable. The cap and its "showing N of M" affordance
are therefore part of this plan, not an optimisation.

---

## 4. P0 — the ledger is Predict mode's answer key

**Neither the decomposition's carried-forward list nor any of the four audit lanes caught this.**

Predict mode's correctness requirement is that the next step must not be on screen.
`binary-search.ts` states it: *"Grading is deliberately one step ahead (grading the CURRENT step
would let the reader read the answer straight off the explanation this strip sits above)."* Every
predictor grades against `trace[i + 1]`. **The ledger renders every step — including `i + 1` —
with its state columns and its sentence.**

Verified per predictor against a real build:

| instrument | predict items | what the table prints | leak |
|---|---|---|---|
| binary-search | 3 | `# · lo · mid · hi · what happened · comparisons` | row 4 is the verbatim answer; the `mid` column answers the other two |
| bubble-sort | 14 | `# · what happened · comparisons · swaps` | **the `swaps` column *is* the grading expression** |
| insertion-sort | 11 | same | same |
| bfs / dfs | 6 each | `# · what happened · visited` | the next row names the answer node |

`predictAdjacentSwap` is literally `correctIndex = nextSwaps > swaps ? 0 : 1`, and the generic
fallback emits every metric key as a column — so the reader subtracts two adjacent cells.
`predictNextVisit` is only asked where `trace[i+1]` is a visit step, so the answer is always the
next row, by construction. Nothing else on screen shows `trace[i+1]`.

**Second breach: the row seek buttons are an unguarded scrub channel.** The slider's handler
already declines input while predicting — *"scrubbing past a question is the one thing predict
mode exists to prevent"* — and `m8-gamification.md` states the rule. The worktree's `wireLedger`
binds a bare `player.seek(index)` with no guard; `setPredict` never touches the ledger.

**The consequence is mastery, not just pedagogy.** `passFloor` is 3 on binary-search, and a passing
session calls `recordPass` → **Practiced**. Three answers read off a four-row table would earn a
mastery state. And `?review=1` auto-opens predict mode, so `/learn`'s spaced-review deep link is
precisely the path that lands a reader on the answer key.

### 4.1 This is not the killed cost-withholding

That deletion was right, and this is the opposite shape reached by the same method:

| | cost withholding (deleted) | the predict leak |
|---|---|---|
| scope | permanent, every reader | opt-in mode only |
| already on screen? | **yes** — re-verified: the metric pill is present on all six Final Run lessons | **no** — `onStep` writes only step `i` |
| design intent | the product deliberately shows the number | the design deliberately hides `i + 1` |
| precedent | none | autoplay and scrub are **already** made unavailable-with-a-reason during predict |

**Trace Trials are separately verified as NOT a conflict** — they grade a run the reader crafts in
the custom-input form, and every trial requires an input different from the pinned example by
construction (a unit test asserts the pinned example never clears its own trial). No withholding
there either.

### 4.2 The rule

**While Predict is on, the ledger is hidden, with a reason.** Not blanked, not partially masked —
hidden. Blanking cells past the current row still leaks through the row count, and "styling a
leak is not hiding it" is a rule this codebase already wrote down: opacity and colour are defeated
by forced-colors, by a screen reader reading the accessible name, by select-all and by print.

Implemented in `setPredict`, which is already the single writer of every piece of predict state
"so the toggle, the review deep link and teardown cannot disagree." Row seek buttons are declined
on the same condition the slider's handler uses.

**The on-screen note must be rewritten and it is asserted verbatim by a test.** It currently reads
*"Auto-play and the step slider are off while Predict is on."* After this plan that sentence is
wrong twice — the slider is no longer a visible control (§6), and the table is now also gated.

---

## 5. Stable instrument ids

`Visualizer.astro:136` is `const uid = \`viz-${Math.random().toString(36).slice(2, 8)}\`` — the
**last `Math.random()` in `src/`**. Row anchors and `<StepLink>` need a stable target.

- **23 call sites across 17 files is correct** — 21 across 15 lesson MDX files, plus `/about` and
  the dev gallery's one `samples.map()`. Nuance the doc omits: the gallery is `import.meta.env.DEV`
  gated, so production ships **22 instruments, not 34**.
- **Three siblings already went stable** and say why: `index.astro` uses `idBase: 'hero-demo'`
  (*"a value that changed per build would churn the e2e visual/aria baselines for no reason"*),
  `404.astro` uses `'nf-demo'`, `build-og.mjs` uses `'og-still'`. `src/components/uid.ts` exists
  precisely to avoid `Math.random()`.
- **Nothing depends on randomness.** The aria baselines record role/name/structure and contain no
  `viz-` string at all — they were already deterministic. What becomes deterministic for the first
  time is **the built HTML**. Pixel baselines are unaffected (ids are not painted). No e2e spec
  hardcodes a uid; the two that touch ids read them back at runtime and assert only suffixes.
- **The worktree's scheme is nearly right and lies in a comment:** it hashes
  `pathname:algorithm:renderer`, then claims a counter tiebreak that does not exist. Plan C uses
  the same hash **with a real collision tiebreak**, because `sorting-basics` mounts three
  instruments and the dev gallery mounts twelve from one call site.

All eight derived ids (`-explain`, `-err`, `-help`, `-step`, …) are template literals off `uid` and
move for free.

---

## 6. The instrument, and the slider that cannot be deleted

**The early exit is real and total.** `Visualizer.astro:2232` — `if (!canvas || !explain || !slider)
return;` — sits inside `setupViz` before the abort controller, `mount()`, `wireControls()` and
`data-viz-ready`. Remove the slider and the island never hydrates: no play, no step, no predict, no
custom input, and every spec waiting on `data-viz-ready` hangs. `slider` is then dereferenced
non-null eight more times. (The decomposition cites `:2173`; that was right at `dab6108` and Plans
A and B moved it. Same for `showMetrics`, now `:123`.)

**Eight specs, not seven** — seven locate `[data-viz-slider]` directly, and one snapshot fails when
it moves. They assert scrub-to-end, four-way sync (counter, `aria-valuetext`, explanation text and
SVG state), and full keyboard operation (`Home`/`End`/`ArrowRight`).

**"Visually hidden" is wrong; "revealed on focus" is right.** A permanently invisible focusable
range input fails WCAG 2.4.7 — a sighted keyboard user tabs into a control with no visible focus
indicator. The correct pattern is the one this site already ships on its skip link: hidden until
focused, visible while focused. The ledger's rows become the *pointer* scrub affordance; the slider
remains the keyboard and AT one and shows itself when used.

**`/about`'s prose falsifies itself if this is done carelessly.** It says *"the slider jumps
anywhere"* and *"**Scrub** — drag the slider to jump to any point."* Hiding the slider makes the
site's own explainer describe a control nobody can see. That copy is in scope.

---

## 7. `<StepLink>` and the sticky chrome

A `<tr id>` inside the visualizer's scoped stylesheet inherits **no** `scroll-margin-top`. The only
rule covering lesson-body content is scoped to `h2`/`h3`, so a fragment jump parks the target row up
to ~6.75rem under the sticky header and ToC bar. Every anchor target on a lesson page today is a
heading, which is why nothing catches this.

Two further occluders: the well's sticky `<thead>` sits over the top of the scroll region, and the
instrument's `overflow: hidden` wrapper is a scrollable ancestor that fragment navigation will also
scroll. The worktree's `markLedgerRow` deliberately avoids `scrollIntoView` in favour of adjusting
the well's `scrollTop`, which is the right pattern — but a `<StepLink>` in prose is a *document*
jump, so it needs the CSS offset **and** the manual well correction.

---

## 8. JS-off, and the budget

**Budget is not a constraint on this plan.** Measured headroom is **41.2 KB gz** — the worst page
is 18.8 KB of 60. A server-rendered table costs **zero** gated JS; it costs HTML, measured at
**+698 B gz** on binary-search and **+2,750 B gz** on sorting-basics (93 rows across three tables).
The worktree's entire interaction layer — seek buttons, roving tabindex, arrow-key nav, scroll
sync, `aria-current` — measured **+18 B gzipped**. Design for correctness, not bytes.

**The ledger is M7-class server-rendered content, not an M8 component.** It transcribes a
precomputed trace; with JavaScript off it *is* the lesson, and it must appear. That settles the
collapsed default: the collapse is a native `<details>` (zero JS, works with JS off, and the
disclosure is real rather than a dead button), not a JS-toggled `hidden` attribute.
`hidden="until-found"` does not work on `<tr>` and is not used.

The seek buttons ship `disabled` and are enabled by the island — the existing honesty mechanism, so
a JS-off reader is never offered a control that cannot act.

---

## 9. `/about` and the dev gallery need an opt-out

`/about` sets `showMetrics={false}` — and the worktree's ledger, which has no prop at all, rendered
a `comparisons` column on it anyway. The prop that says *"no numbers on this demo"* is defeated by
the table.

`<Visualizer>` gains **`showLedger`** (default `true`); `/about` and the dev gallery set it `false`,
because both are chrome demonstrations rather than lessons. Independently, the ledger's **cost
column inherits `showMetrics`**, so the two props cannot contradict each other.

---

## 10. What this plan must not disturb

Verified negatives, so they are not re-litigated:

- **No double announcement.** The page has one live region and one `role="status"`; the ledger is a
  static table and `aria-current` announces nothing.
- **Two instruments on one page is fine.** Captions are unique by construction; collapse state is
  per-instrument; the tab-order spec walks a fixed ten stops and asserts nothing about what follows,
  so appended ledger stops pass unchanged.
- **The stacked frame is compatible** with RSP-2's full-bleed negative margin and Plan A's frozen
  extent — the worktree has a working implementation of the layout.
- **Trace Trials do not conflict** (§4.1).

---

## 11. Open questions

**One, and it is a design call rather than a fact:** the DOM row cap's value and its affordance.
A 901-row table is reachable once §3 is fixed. The cap must state a number, what the reader sees
when it binds ("showing the first N of M steps"), and whether the cap applies to the server-rendered
authored run as well as to custom runs. Everything else in this spec is settled by measurement.
