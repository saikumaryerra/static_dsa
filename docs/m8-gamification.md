# M8 — Gamification: "the mastery loop, quietly rendered"

Status: **shipped** — M8.1 in `2b6b821`, M8.2 and M8.3 together in `4f34cff`, on top of M7.2's
progress system and reset control. Spec §17 lists this milestone; §6/§7/§8/§9/§11 carry the
amendments this design required.

The phase sections below are the *plan as designed*, kept verbatim for their reasoning and their
line-exact feasibility notes. **What actually shipped, what was deferred, and the re-measured budget
are in "As shipped" at the end.** The design stance, the calm invariants and the killed list are
binding on new work regardless — they describe the product, not the plan.

## Provenance — how this design was produced

Designed on 2026-08-03 by a three-lens judge panel — learning-scientist, game-designer, and a
minimalist devil's-advocate — producing 13 candidate mechanics. Each mechanic was feasibility-
verified against this codebase line-by-line (which corrected several designs, notably the
binary-search prediction grading, see M8.2), then the whole set was reviewed by a pedagogy-and-
ethics critic for motivation science and dark patterns. Eight mechanics survived; five were killed
on the evidence and are recorded below so they are not re-proposed.

## Design stance (binding — these are review criteria, not aspirations)

1. **The game loop is the study loop.** Every mechanic is a named learning intervention (retrieval
   practice, generation/testing effect, spacing, successive relearning, self-explanation,
   hypercorrection). Nothing is ever awarded for presence, scrolling, or time-on-page.
2. **One currency.** Mastery states (Learned → Practiced → Mastered) are the *only* progress
   measure in the product. The track ring is their macro rendering; trials and the Final Run feed
   them. No XP, no levels, no badge cabinet, no second score.
3. **Grade against data we already have.** The precomputed `Step[]` trace is a complete answer key
   (state snapshots, per-step explanations, cumulative metrics). Prediction grades against
   `trace[i+1]`; challenges grade against the final step's metrics. Zero authored quiz banks; custom
   inputs (arrays ≤30) make the trace an infinite item bank.
4. **Privacy is a feature.** No behavioral inference — behavioral tracking is surveillance-shaped
   even when local, and it misfires (skimming counts, JS-off reading doesn't). Only explicit acts
   and explicit self-reports. Every persistent surface says "on this device only."
5. **Never punish absence.** Compatible with the spacing effect by construction: no decay, no
   demotion, no streak, no countdown, no empty-state guilt.
6. **Calm invariants are tested, not intended** (see the test list) — maintenance pressure erodes
   design intentions but not failing tests.

## The loop

| State | Earned by | Rendered |
|---|---|---|
| **Learned** | the existing "Mark as complete" click — unchanged key (`lesson:{slug}:complete`) and unchanged completion semantics (M7 restyles/relocates the button and M8.1 adds the milestone line to it) | pip 1 — the *existing check glyph* becomes pip 1's fill, so the old mental model survives |
| **Practiced** | all Practice questions self-graded "I had it" **or** one predict session ≥5 answers at ≥80% **or** a cleared Final Run — three paths, all retrieval | pip 2 + label |
| **Mastered** | re-meeting the Practiced bar **≥3 days after** `practicedAt` | pip 3 + label |

No decay, no demotion; only the reset control clears state. Nothing gates navigation on any state.
The 3-day gate always explains itself in one line ("Mastery needs a return visit after a few days —
that's how memory consolidates"); static "ready from Tuesday" is permitted, a ticking countdown is
not (attention trap). Because Learned is self-reported with no learning precondition, the track
header must always show Practiced/Mastered counts beside it — the self-reported number is never
displayed alone, and nothing (reviews, milestones) gates on Learned alone.

## Data model

One shared store module (`src/lib/progress.ts`) owns every read/write; every mechanic imports the
same `isPracticed()` predicate or the definitions will drift.

| Key | Shape | Notes |
|---|---|---|
| `lesson:{slug}:complete` | `"1"` | **Existing, untouched.** Stays the OR-win source of truth for Learned; lazy migration (a legacy-complete lesson with no record renders Learned with `practicedAt: null`) |
| `progress:v1:{slug}` | `{ practicedAt, masteredAt, intervalIndex, lastReviewAt, checks[] }` | Timestamps not booleans — the review scheduler derives everything from them. `note` was designed into this record for Explain-it-back and **never shipped**; the parser carries unknown fields through, so adding it later still needs no migration |
| `ld:challenges:v1` | `{ "sorting-efficient/worst-case": 1 }` | id = `{lessonSlug}/{challenge-slug}` — **lesson slugs, not algorithm ids**: quick sort's lesson is `sorting-efficient` |
| `ld:finalrun:v1` | `{ "binary-search": { c: 1 } }` | cleared Final Runs; cleared-only — **no first-try flag** (see killed list) |
| `ld:days:v1` | `{ count, last }` | M8.3 learning-days counter; global, not per-lesson. **Designed, not built** — the key is enumerated in spec §6 but nothing writes it, so no device holds one |

Versioned prefixes; unknown versions ignored on read; every access `try/catch`-guarded (private
mode). Displays are **derived**, never stored as ledgers — so state retro-earns correctly and
can't double-award. Every key above is a **progress** key and is cleared by M7.2's reset control
(including notes); preference keys (`theme`, `pref:viz-speed`, `pref:code-lang`) are explicitly
*not* cleared by it. The Predict toggle is **never persisted** — it is per page visit, which is why
`?review=1` cannot rewrite a preference: there is none. Every key here is enumerated in spec §6;
adding another is a spec change.

## M8.1 — Ground floor (~2 KB gz)

- **Shared store module** — *extend* M7.2's `src/lib/progress.ts` (same file, not a second one) with
  `isPracticed()`, mastery records and date math; imported by every other piece.
- **PracticeCheck** (`src/components/PracticeCheck.astro`, composed *around* the existing
  `Collapsible`, native `<details>` untouched): the retrieval prompt ("Answer it in your head or on
  paper first") is added as a line **above** the `<details>` — it does not replace the `summary`,
  which keeps M7.1/CNT-8's per-question-unique label ("Show answer to question 1"). Opening reveals
  a footer with real "I had it" / "Not yet" buttons + a per-lesson tally in one polite live region.
  Buttons ship `disabled` in SSR and enable on hydrate (Visualizer's A3 pattern); the component
  carries its **own** `<noscript>` block (`Collapsible` has none). `checks[]` is indexed by an
  explicit `index` prop so reordering questions is an author-visible act — and an explicit `total`
  prop supplies the denominator, since `checks[]` alone cannot say how many questions a lesson has
  and the Practiced write-path needs it (`isPracticed()` itself reads the stored `practicedAt`, so
  `/learn` never needs per-lesson counts). Retrieval practice (Roediger & Karpicke) + judgments of
  learning (Koriat); self-report is honest at zero stakes.
- **Mastery pips** on `LessonCard` + lesson header. A11y: pips are `aria-hidden` decoration always
  paired with visible text; extend the **existing** `<span class="sr-only">Completed</span>`
  (LessonCard.astro:74) to carry the stage — do **not** add `aria-label` to the card link, which
  would replace its accessible name and hide the title/summary. "Mastered" detection needs an
  **in-memory (per page visit — never `sessionStorage`, which §6 forbids)** re-grade counter:
  persisted `checks[]` stay 1 after first practicing, so a re-pass isn't derivable from storage.
- **Track Arc** — a 28px ring beside each track h2 with `3 of 9 complete` text plus
  `Practiced n · Mastered n`. This **is** M7.2's per-track counter, drawn: extend that util, don't
  build a second one. Derived from the **shared store module** (reads `lesson:{slug}:complete` for
  the build-injected slug list) — *not* by scraping `[data-complete]` from the DOM, which would be a
  second source of truth and can race `reflectCompletion()` (Astro guarantees no execution order
  between a page script and a component script). One function sets both the card attribute and the
  ring, re-running on `astro:page-load`; denominator from the build-time collection query. Hidden
  until the script runs (LessonCard check pattern) — hidden is more honest than a static "0 of 9".
  Bake `stroke-dasharray` at build so runtime writes only the offset.
- **Quiet Milestone** — when a click completes a track: the check draws in
  (`animation: … var(--duration-base) var(--ease-standard)` — **never a hardcoded 200ms**: the
  site's only reduced-motion strategy is the token collapse at `tokens.css:143`, with no blanket
  `animation-duration` override anywhere; a keyframe animation rather than a transition because
  MarkComplete swaps icons via `display`) and one line appears: "Foundations complete — all 9
  lessons, on this device." The `role="status"` element ships **empty** in the static template.
  Needs `trackSlugs` threaded `[slug].astro` → `LessonLayout` → `MarkComplete` — note M7.1/IA-5
  replaces the track-filtered sibling query with a global-order sort, so M8.1 adds its own one-line
  build-time `lessons.filter(l => l.data.track === entry.data.track)`. The system's **only**
  celebration.

*Accept:* DoD green; every M8 component carries its own `<noscript>` kill-switch so no gamification
affordance appears without JS (no pip, ring, milestone, challenge or review card) — only static
prompt copy differs from M7;
pips/ring/milestone absent — not broken — when storage is blocked; unit tests for `isPracticed()`
and the ring math (pure functions with injected storage, mirroring `resolveTheme`).

## M8.2 — Retrieval engine

- **Predict-the-Step** — opt-in toggle in the control bar; when on, autoplay + scrub are
  `aria-disabled` with a reason, and a question strip renders 2–4 real buttons (hard cap 4, matching
  the §11.2 contract; binary search alone can need all four).
  **Verified grading rules** (the first-pass design was wrong — algorithms push each compare step
  *before* mutating `lo`/`hi`, so a naive `lo`/`hi` delta gives no signal on step 0 and leaks the
  already-displayed decision afterward). Signature `predictStep(trace, i, input)`; the island must
  hold the parsed input (additive: hoist `input` out of `mount()` into the `setupViz` closure and
  reassign it in the submit success path). Ask about the **next probe** and grade from `trace[i+1]`
  in this order: no `trace[i+1]` → return `null`; `next.state.foundIndex !== null` → **Found**;
  `next.state.mid === null` (the empty-window terminal, `binary-search.ts:121`) → **Not present**;
  else `next.state.array[next.state.mid] < input.target` → right, else left. (Order matters: reading
  `array[mid]` before the terminal check dereferences `array[null]` and misgrades as "left".)

  **Adjacent-swap sorts only** get the free generic `[Swap / No swap]` from the metrics delta, asked
  only on compare steps (gate on `highlights` kind `compare`): **bubble-sort and insertion-sort**,
  where the swap step immediately follows its own compare. **quick-sort and selection-sort are
  excluded** — both defer a swap to *after* the last compare of a partition/pass, so the delta
  grades "Swap" on a compare that did not swap (verified on quick-sort's authored input
  `[5,2,9,1,7,3]`: step 8 compares 7 against pivot 3 and would be graded Swap, marking a correct
  learner wrong), and quick-sort's `i !== j` self-swap guard produces the inverse error. Give those
  two a bespoke predictor or return `null`. merge-sort has comparisons only → no predictor.

  **BFS/DFS:** return `null` unless `trace[i+1]` is a dequeue step — its first `active` highlight
  must target a node id (`n*`, not an edge `e*_*`; a step can carry a second `active` for the
  traversed edge, `bfs.ts:133` / `dfs.ts:157`) that differs from the current active node and appears
  in the current step's `frontier` ids. Choices: the correct node plus up to 2 decoys. **A floor
  guard is mandatory** — the shipped graph (`0-1,0-2,1-3,2-3,3-4,4-5`, authored identically in
  `graph-traversal.mdx` and `bfs.defaultInput()`) is nearly a path, so the frontier holds a single
  id at most predictable steps, including the very first: sourcing choices from the frontier alone
  would render a one-button "prediction" with no distractor. Either draw decoys from non-frontier
  node ids (the answer must still be a frontier id) or return `null` when fewer than 2 distinct
  candidates exist. `choices.length` is always 2–4. The strip is **runtime-injected only**
  (predict needs JS
  anyway) — placing it inside `.viz-frame` in SSR would escape the existing noscript kill-switch,
  which only targets `.viz-controls`. Verdict announces through the existing live region as one
  combined string. Session chip shows a neutral **"7 answered · 2 skipped"** — never a ratio or
  percent (accuracy scoreboards make beginners protect their score instead of attempting hard
  predictions; wrong-but-attempted predictions are the intervention working). Step-forward stays
  live as a no-penalty skip. `updateButtons()` must become predict-aware (it re-enables buttons on
  every `onStep`). Optional `predictStep` field on the `Algorithm` interface — additive, existing
  algorithms unaffected (spec §11.2 amendment). Ship binary-search + bubble/insertion first.
- **Ready-to-review queue** — at most **two** cards under `/learn`'s head: "Binary Search — quick
  check (~2 min)". Due when
  `now - max(practicedAt, lastReviewAt) >= INTERVALS[Math.min(intervalIndex, INTERVALS.length - 1)]`
  days with `INTERVALS = [3, 10, 30]` — **the clamp is required**: an unclamped lookup returns
  `undefined` after the third pass, the comparison is always false, and that lesson silently never
  becomes reviewable again. Derived at render, never stored (multi-tab safety); a "Not yet" grade
  halves the current interval. Deep-links to `#practice`; `?review=1` enables Predict **for that visit only** — the
  toggle is never persisted at all, so no preference can be rewritten. A pass ≥3 days after
  `practicedAt` stamps `masteredAt`; later
  passes advance `intervalIndex`. Failing costs nothing. Empty renders **zero DOM**. The pass-write
  lives in the practice/predict scripts via the store module (it has no other home). Spacing effect
  (Cepeda et al.) + successive relearning (Rawson & Dunlosky). This is the **only** surface in the
  entire system that ever prompts the user.

*Accept:* DoD green; predictor unit tests beside each algorithm's existing trace tests — covering
the found-first ordering, the empty-window terminal, the last-step `null`, and the single-candidate
frontier that must not render a one-button question; `selectDueReviews` covered including a record
at `intervalIndex: 3` still becoming due after 30 days; calm-invariant tests (below) green; keyboard
path through the question strip verified; JS-off unchanged.

## M8.3 — Enrichment (trims first under budget pressure)

- **Trace Trials** (`src/components/Challenge.astro`) — 1–3 input-crafting puzzles per Algorithms
  lesson, cleared through the **existing** custom-input form. Requires a ~3-line additive
  amendment to the Visualizer's submit success path: dispatch a bubbling `viz:run` CustomEvent
  `{ algorithmId, input, finalStep }` (spec §11.3). Predicate DSL (~5 rule kinds, AND-ed):
  `metric | inputLen | found | pinnedArray | duel`; a required `witness` input is run at build time
  (the Visualizer-still pattern) so **an unsolvable challenge fails the build**. Challenge
  definitions live in a single data module (`src/lib/challenges.ts`) imported by both the component
  and any counter — client code cannot call `getCollection()`. Verified examples: quick-sort
  `[1,2,3,4,5,6,7]` yields 21 comparisons **and** 0 swaps (the `i !== j` self-swap guard), clearing
  a deliberate twin-reveal that sorted input *is* the worst case (zero swaps comes from **both**
  self-swap guards: `i !== j` in the scan, `quick-sort.ts:84`, and `i !== hi` on pivot placement,
  `:102`); binary-search ≤2 comparisons on
  15 elements = indices 7/3/11; duel witness `[2,1,3,4,5,6]` → insertion 5 vs bubble 9 comparisons.
  Merge-sort trials must be comparison- or shape-based (no swaps metric). The duel validator awaits
  the registry thunks itself rather than assuming chunks are loaded. Pinned arrays are rendered as
  copyable code in the card. Named titles ("Worst Case Scenario") carry the identity payoff the
  badge system would have. Hints always present; nothing is ever timed. Ships its own `<noscript>`
  kill-switch so a JS-off visitor never sees an uncompletable challenge.
- **The Final Run** (`src/components/FinalRun.astro`) — one numeric prediction per lesson, truth
  computed at **build time** via the registry thunks, so an authored answer cannot be wrong.
  Unlimited attempts, no penalty, visible "Show the answer" escape. **No first-try flag or bonus**
  (killed — see below). The "Watch why" link cannot pre-load input into the island (no external
  API; a pre-hydration `requestSubmit` would reload the page): instead FinalRun takes an explicit
  `algorithm` id (five of the six Algorithms lessons host 2–3 visualizers under one `## Visualizer`
  heading, so "the lesson Visualizer" is ambiguous) and the build asserts its pinned input equals
  that visualizer's. An Astro component cannot read a sibling MDX component's props, so name the
  mechanism: **move pinned inputs into a shared data module** (the `src/lib/challenges.ts` pattern
  this same phase establishes) that both the MDX `<Visualizer input={…}>` and `FinalRun` import —
  making divergence impossible by construction rather than by assertion. (Fallback if inputs stay
  inline: pass the lesson slug, read the entry's raw `body` in FinalRun's frontmatter, and match
  `<Visualizer …>` tags for that `algorithm` id, throwing on 0 or >1 matches.) "Watch why" is then
  a plain anchor to the visualization heading. Hypercorrection
  (Butterfield & Metcalfe) + predict–observe–explain. Placed after `## Practice` (spec §7
  amendment). Ships its own `<noscript>` kill-switch, like every M8 component.
- **Explain-it-back — DEFERRED, not shipped.** The design below is unchanged and remains the plan of
  record; see "As shipped" for why it was cut and what landing it would take. Optional 280-char
  "why does this work?" note after completion, replayed at
  review time ("You wrote last time: … — still agree?"). **Delete button beside Save** (a privacy
  promise with no deletion path is an erosion of it), notes enumerated in the reset control, the
  "saved only in this browser" label adjacent to the textarea. Mount from the lesson shell near
  MarkComplete (delegate a click listener on `[data-mark-complete]`; MarkComplete emits no event) —
  do not invent a new lesson section or touch 15 MDX bodies. Optional `explainPrompt` frontmatter
  field. Self-explanation (Chi et al.) + elaborative interrogation.
- **Learning Days — NOT BUILT.** It was named here as the first cut under budget pressure, and it was
  the cut. Design of record, unimplemented: an optional single line, a monotonic count of days with a
  qualifying learning act, stored in `ld:days:v1` as `{ count, last }` only (no history array). Copy states the point:
  "there's no streak to break here." First cut under budget pressure. Never gets a target (a target
  re-creates the attendance goal the design bans).

*Accept:* DoD green; the challenge predicate evaluator has Vitest coverage — a witness that fails
its own predicate throws, so the build guard is regression-tested in CI without committing a
deliberately-broken fixture; trials authored only where the metric exists (audit per algorithm);
budget re-measured by gzipping the page's `dist/_astro` chunks by hand (no size harness exists;
adding `size-limit` would need a SPEC-GAP).

## Progression across the course

Progressive disclosure: **Foundations 01–09** surface only practice checks, pips, and the track
ring — lowest cognitive overhead where learners are newest (Predict appears where a predictor
exists but stays an unobtrusive toggle). **Algorithms 10–15** concentrate the demanding mechanics —
Trials (1 in lesson 10 ramping to 2–3 by 15) and Final Run across the track, with Predict wherever
a predictor exists — at ship time lessons 11, 12 and 14: recursion emits no compare-kind steps; DP's
`compare` highlights mark cell *reads*, not comparisons, and it has no swaps metric; merge-sort has
no swaps metric; and quick-sort/selection-sort defer their swaps, so lesson 13 gains Predict only if
a bespoke quick-sort predictor is written — where complexity reasoning is the actual objective. The review strip is structurally invisible until the first `practicedAt`
exists, so week one is pure learning and later weeks shift to review-to-mastery: successive
relearning emerges from the mechanics rather than being imposed.

## Calm invariants (enforce with tests, not intentions)

The harness splits them: `vitest.config.ts` is `environment: 'node'` with no DOM and no
`localStorage`, so **pure-function halves are unit tests** and **DOM/storage halves are Playwright**
(adding jsdom would be a new dependency needing a SPEC-GAP).

- Review strip: **max 2 cards**; empty ⇒ **zero DOM**. *Unit:* `selectDueReviews(records, now)`
  returns `length <= 2` and `[]` when nothing is due. *E2E:* the strip renders no nodes when empty.
- Copy never contains "overdue" / "missed" / days-behind counts; **no countdowns anywhere**.
  *Unit:* assert over the exported copy constants.
- The Predict toggle is never persisted — it has no storage surface at all. *Unit:* the store
  module's exported key list (the same list the reset control clears) contains no predict key.
  *E2E:* toggling Predict and loading `?review=1` leave `localStorage` byte-identical.
- No accuracy ratios or percentages are ever displayed during a learning act; the ≥80% check is
  computed silently, infinitely retriable, with no attempt history stored.
- Nothing gates on Learned alone; un-toggling completion removes state with no shaming copy.
- Every persistent surface carries "on this device only"; every **progress** key is in the reset
  control's clear list (preference keys deliberately are not).
- Budget: worst-case lesson page ≈ 4.3 KB gz, `/learn` ≈ 2.2 KB — a self-imposed ~5 KB slice of
  §4's 60 KB per-page budget (the spec grants no gamification allowance of its own). Re-measure by
  hand per phase.

## As shipped — what landed, what was deferred, and the re-measured budget

**Landed.** M8.1: the shared store (`src/lib/progress.ts`, extended — never a second store),
`PracticeCheck.astro` in all 15 lessons, `MasteryPips.astro` on `LessonCard` and the lesson header,
`TrackArc.astro` on `/learn`, and the single Quiet Milestone in `MarkComplete.astro`. M8.2:
predict mode in the Visualizer plus `src/viz/algorithms/predictors.ts`, and the review strip
(`ReviewStrip.astro`) reading `selectDueReviews` from the store. M8.3: `Challenge.astro` +
`FinalRun.astro` over the `src/lib/challenges.ts` data module, with the `viz:run` event added to the
Visualizer's submit success path exactly as §11.3 describes. Guarded by
`tests/unit/{progress,challenges,predictors,mastery-ui}.test.ts` and
`tests/e2e/m8-{calm-invariants,decisions,degraded,mastery-ladder,milestone,practice-check,predict,review-queue,trials-final-run}.spec.ts`.

**Deviations and deferrals — decisions, not drift:**

1. **Predict shipped wider than "binary-search + bubble/insertion first":** binary-search,
   bubble-sort, insertion-sort **and** BFS/DFS (with the mandatory floor guard — no one-button
   question). quick-sort and selection-sort still expose no `predictStep`, for the deferred-swap
   reason above; recursion, merge-sort and DP have none either.
2. **Trace Trials: 11 trials across 5 lessons** — recursion (1), binary-search (2), sorting-basics (3),
   sorting-efficient (3), dynamic-programming (2). **Lesson 14 (graph traversal) gets none**: BFS/DFS
   expose only `visited` and no rule can constrain how big the graph *was*, so every honest prompt
   would be clearable by drawing a smaller graph. Its enrichment is the Final Run, which all six
   Algorithms lessons carry. The reasoning is repeated at the catalog in `src/lib/challenges.ts`.
3. **Explain-it-back — DEFERRED, and deliberately so.** Nothing implements it: no component, no
   `note` field written to `progress:v1:{slug}`, and the `explainPrompt` frontmatter field named in
   spec §7 has no reader and no lesson that sets it (§7 and §17 now mark it deferred). It is the only
   mechanic in this design that would store free-form reader text, which is not one component but
   four obligations — a delete button beside Save, the note named in the reset control's warning and
   announcement copy, the "saved only in this browser" label, and a `note` field carried through
   every read-modify-write — in the phase this document defines as the one that trims first under
   budget pressure. The M8.3 spine (Trials + Final Run) shipped instead. **To land it later:** the
   record parser already carries unknown fields through verbatim (`readStored`), so `note` needs no
   migration; add the field to the content schema, the delete path, and the reset enumeration in
   `storedProgress`, and re-measure the lesson-page slice below.
4. **Learning Days — not built**, as this document already anticipated ("first cut under budget
   pressure"). `ld:days:v1` stays enumerated in spec §6 with **no writer**, so no device holds one;
   `resetProgress` deliberately does not spell the literal (its `SPEC-GAP` comment says why, and how
   the key joins the delete list when a writer exists).
5. **A failed review does not halve the interval.** "Not yet" writes no pass at all, so the schedule
   does not move and the lesson stays due *now* — sooner than any halved interval, and it keeps the
   promotion path single by never sending a failure signal into the store. Recorded at `recordPass`.
6. **`/learn` gained a currency legend** the design never named — a collapsed `<details>` explaining
   what the three pips mean and who does the grading (`SPEC-GAP` at the source). It is **hidden with
   JS off**, alongside the reset control: with no script there is no pip, no ring and no stage word
   anywhere on the page, so a legend would describe things that are not there. That is the same
   `<noscript>` rule every M8 component follows, applied to page-level copy.
7. **Mastery pips are the only currency, as promised** — no XP, level, badge, streak or accuracy
   ratio ships anywhere; the predict session line counts activity only ("7 answered · 2 skipped"),
   and the review strip remains the only surface that ever prompts.

**Budget, re-measured after M8.3.** Method — the only one that counts here: build, then `gzip -9`
every chunk in a page's static import closure (lazily-imported algorithm/renderer chunks are extra).
Do not estimate, and do not copy the numbers into a second document: the one measurement that made
this phase's bundling problem invisible was a comment repeating a figure nobody had re-measured.

Every page is far inside §4's 60 KB budget — a worst-case lesson page carries roughly 15 KB gz of
eager JS and `/learn` roughly 5 KB. Against this document's *self-imposed* slice both budgeted pages
are still over: `/learn` carries ≈2.5 KB of M8 code against its ≈2.2 KB allowance (review strip,
pips/ring helpers, the enrichment keys, and the ≈1.1 KB mastery/review half of `src/lib/progress.ts`),
and a lesson hosting trials and a Final Run is over its ≈4.3 KB. Being over a self-imposed slice
inside a budget with 45 KB of headroom is a note, not an emergency — but it is why the two
structural questions below were settled with measurements rather than instincts:

- **The enrichment keys moved out of the trial catalog** (`src/lib/enrichment-store.ts`). Two key
  names and the `viz:run` event were living beside the predicate DSL, so one import from
  `progress.ts` put that whole ~1.3 KB gz chunk on every page with a reset control or a resume line —
  18 of the 21 built pages, none of which hosts a trial. Splitting them took ~900 B gz off `/` and
  `/learn` each and cost no page an extra request; the before/after table is in that module's header.
- **The mastery half stays inside `progress.ts`** rather than becoming `mastery.ts`. Splitting saves
  ≈1.1 KB gz on `/` but costs `/learn` and a lesson page ≈270–285 B each, because a page needing both
  halves then fetches two separately-compressed chunks; the shared chunk is cached site-wide, so the
  home saving is only ever collected by a visitor who bounces. Reasoning and the reproduce recipe are
  at the top of `src/lib/progress.ts`.

## Designed and killed (do not re-propose without new evidence)

- **XP / levels / points** — the panel built the most defensible version possible (bounded, fully
  derived from learning acts, finite maximum) and it was still killed: a second, less honest
  currency whose level labels can outrun real mastery (reachable in one massed sitting with zero
  Mastered lessons), with genuine overjustification exposure (Deci 1971; Lepper, Greene & Nisbett
  1973). Pips + arcs carry the same information truthfully.
- **Badge cabinet** — 15 lessons can't sustain one; the 2–3 genuinely behavior-steering criteria
  survive as Trace Trial **titles**. Never display an aggregate "n of N collected" (a completionism
  meter in itself).
- **First-try bonuses / "Sharpshooter"-style flags** — loss-frames the errorful first attempt the
  mechanic exists to elicit (Kornell & Metcalfe); beginners start peeking before committing, which
  destroys the testing-effect value. Identical credit regardless of attempts.
- **Daily streaks** — pedagogically backwards (the spacing effect says the gap is the point) and a
  loss-aversion guilt mechanic that manufactures a quit moment. The monotonic Learning Days line is
  the honest ceiling.
- **Personal-best scores** — the same generation-effect act as Trace Trials with worse scaffolding
  and a short live span; two numeric frames on one visualizer.
- Also rejected on constraint, WCAG, or honesty grounds: confetti/particles and success sounds,
  timed or countdown challenges (2.2.1 + beginner anxiety), hearts/lives/energy gating, locked
  lesson progression, endowed-progress head starts, completion certificates (unverifiable
  credential theater), leaderboards/leagues/social comparison (needs a backend; harms beginner
  self-efficacy), auto-detected completion from scroll/time, authored MCQ banks (permanent
  authoring tax — the trace is a better item bank), a full SM-2 scheduler (complexity theater at
  n=15), and a global XP/progress pill in site chrome.
- **Deferred, not damned:** a progress export/import code (mitigates "cleared browser data = lost
  progress" without a backend) — revisit only if users ask.
