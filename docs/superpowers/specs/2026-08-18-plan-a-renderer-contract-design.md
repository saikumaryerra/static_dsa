# Plan A — Renderer contract and the drawing's P0s

**Status:** design, reviewed and revised — ready for user review
**Branch:** `feat/show-your-work-slice`
**Date:** 2026-08-18
**Part of:** `2026-08-18-show-your-work-decomposition.md` (plan 1 of 3)

---

## 1. What this is

Five verified defects in how the drawing is produced. Every one is a bug at HEAD, independent of the
redesign — this plan would be worth shipping even if the ledger were never built. It also stabilises
the frames Plan C later mounts a table under.

**In scope**

1. One viewBox per trace — the canvas stops resizing while the reader steps.
2. Non-empty resting frames — no lesson opens on a blank or clipped box.
3. Marker labels read from `highlight.meta` where a renderer has no business inventing them.
4. The legibility floor kept correct under a frozen extent — **no new floor mechanism** (§6).
5. The custom-input P0.

**Out of scope**

The ledger, the palette, fonts, `<StepLink>`, stable instrument ids, the instrument's region
restructure, and any change to lesson prose. No new component ships in this plan.

**Spec amendments:** item 1 amends §11.2 (`Extent`, `RenderOpts.extent`, `Renderer.setExtent`,
`RendererModule.measure`) and `docs/m3-design.md:151`; item 3 amends §11.2's marker-meta contract. Items 2, 4 and 5
are defect fixes needing no amendment — item 4 in particular now *confirms* the shipped RSP-2
decision rather than changing it (§6). **[corrected]** — an earlier draft claimed item 1 needed no
amendment and that item 4 did.

---

## 2. The audit — run, with results

Two of the five items are scoped by measurement rather than assumption. **The audit has been run**
over every registered lesson algorithm's full trace, and its results are below; they are stated here
so the plan is scoped to facts rather than to an expected set. The script is committed as
`scripts/audit-frames.mjs` in step 1 so the numbers can be re-derived rather than believed.

### A. Which renderers vary their extent across a trace?

**Exactly seven of twelve registered renderer ids** — measured by
`scripts/audit-frames.mjs` over all 21 shipped instruments. Width and/or height range, per
algorithm:

| renderer | evidence | varies |
|---|---|---|
| `array` | `array-operations` W 322→384 | **yes** |
| `tree` | `bst-operations` W 40→380, H 66→222 | **yes** |
| `heap` | `heap-operations` W 80→326, H 184→308 | **yes** |
| `hashTable` | `hash-table-operations` W 224→308 | **yes** |
| `callStack` | `recursion-callstack` H 98→272 | **yes** |
| `stack` | `stack-operations` H 104→220 | **yes** |
| `linkedList` | `linked-list-operations` W 372→460 | **yes** |
| `bars` | all five sorts constant at 384×132 | no |
| `graph` | bfs/dfs/representations constant | no |
| `table` | both DP lessons constant at 446×118 | no |
| `chart` | `growth-rates` constant at 496×272 | no |
| `queue` | `queue-operations` constant at 194×144 — its box is keyed on capacity, which is fixed per run | no |

The five constant renderers are named inline in the test rather than silently omitted.
**[corrected]** — an earlier draft of this table listed only eleven ids and omitted `queue`
entirely; the audit covers all twelve. It also mis-assigned `linear-search` to `bars`: that
instrument uses the `array` renderer (`binary-search.mdx:158`), and `bars` serves the five sorts.

### B. Which algorithms render a broken resting frame at step 0?

**Exactly two**, and both fail the same rule — *the resting label does not fit its own viewBox*:

| algorithm | viewBox | label | spans | result |
|---|---|---|---|---|
| `bst-operations` | `0 0 40 66` | "empty tree" at x=50, anchor start | 50 → 149 | **entirely outside** — renders blank |
| `heap-operations` | `0 0 80 184` | "empty heap" at x=40, anchor middle | −10 → 90 | **overflows both edges** — renders "mpty hea" |

Every other resting frame fits: `stack-operations` ("empty", 85→135 in 168), `recursion-callstack`
("call stack empty", 113→271 in 332), `graph-representations` ("empty graph", 50→159 in 248),
`linked-list-operations`, `queue-operations`, `hash-table-operations` (which draws real buckets, not
a label at all) and both DP lessons.

**[corrected]** — an earlier draft of this plan assumed the broken set included hash-tables, stacks,
recursion and graphs. It does not; those are working resting frames and must not be "fixed".

---

## 3. One viewBox per trace

**The defect.** Renderers compute the viewBox from the *current* step, so the canvas resizes as the
reader steps and the transport row travels under their thumb — measured at 1,049 px on heaps, 825 px
on trees, 535 px on stacks. `DESIGN.md` promises the opposite in its own words: *"nothing ever jumps
under the finger."*

**The lifecycle.** The type surface does not allow a partial fix, and there are **two distinct
renderer mechanisms** to carry it:

1. `RenderOpts` gains `extent?: { w: number; h: number }`.
2. **Delivery channel — `Renderer` gains `setExtent(extent)`.** `mount()` alone is not enough: the
   island mounts each renderer exactly once (`Visualizer.astro:2920`) and `loadTrace` only swaps the
   trace and redraws, so an extent stored at mount can never be updated when custom input produces a
   differently-sized trace. `setExtent` is an additive method, applied on the next `render`. It is a
   contract change, so **item 1 does amend §11.2 after all** (§1 corrected).
3. **Applied generically in `shared.ts`, not threaded through every `draw`. [amended]** An earlier
   draft had `Draw<TState>` become `(step, extent?) => Canvas`. The implementation plan uses a
   smaller surface that reaches further: a pure post-processor

   ```ts
   fitToExtent(canvas: Canvas, extent: Extent | undefined, anchor: Anchor): Canvas
   ```

   which widens the natural viewBox to the extent and offsets `inner` by the renderer's anchor. It
   is applied once in `renderStaticSvg` and once in `createRenderer.render`, so **`Draw` is not
   changed and none of the ten `draw` functions are touched.** Three reasons this is the better
   mechanism, not merely a smaller one: it is a pure `Canvas → Canvas` function and therefore the
   only form of this logic the node-only Vitest harness can unit-test directly; it cannot drift
   between the still and the hydrated path, because both call the same function; and it keeps the
   anchoring rule declarative (one `ANCHOR` constant per renderer module) instead of arithmetic
   repeated in six places.

   **ArrayRenderer still needs its own edit**, because it implements neither `Draw` nor
   `createRenderer` — it ships `class ArrayDomRenderer implements Renderer` with its own static path
   `renderArrayStatic`, and sets its viewBox inside `buildCells` *only when the cell count changes*.
   It imports the same `fitToExtent` and moves the viewBox write out of the length-change branch.
   `array` is in the varying set, so this is not optional.
4. **`RendererModule` gains `measure(step): Extent` — geometry only, no markup. [amended]** An
   earlier draft had the extent read back out of `renderStatic`'s emitted string. **Measured, that
   is unusable on the client:** bubble sort at the permitted n = 30 emits 901 steps, and rendering
   each to a string costs **247 ms** on a fast desktop — a second or more on a phone, run
   synchronously in the custom-input submit handler, to compute a number that (for the sorts) never
   changes. The same reduction over a `measure(step)` that returns only the box costs **0.44 ms**, a
   560× difference. So each renderer extracts the viewBox computation its `draw` already performs
   into a `measure` its `draw` then calls — one source, no duplication, no drift, and a unit test
   asserts `measure(step)` equals the box `draw(step)` emits for every fixture.
5. **Build time:** `Visualizer.astro` reduces `measure` over the whole trace, taking the max. The
   still is then **re-emitted with that extent** — `renderStatic(step0, { title, idBase, extent })`
   — or the JS-off frame keeps the old per-step box and the fix does not reach the readers who need
   it most.
6. **Client:** the island runs the same reduction at mount and on **every `loadTrace()`** — the
   custom-input submit handler and the "Restore example" handler — calling `setExtent` before the
   redraw.

**Anchoring.** Freezing the box does not freeze the drawing's position, so each renderer declares
one `ANCHOR` and `fitToExtent` applies it:

| anchor | renderers | why |
|---|---|---|
| top-left (default) | `array`, `tree`, `hashTable`, `linkedList`, and the four constant renderers | they lay out from the origin and grow right/down into the reserved space |
| bottom | `stack`, `callStack` | both draw a ground line under the lowest slot at `slotYTop(0, n) + SLOT_H + 2`; under a top-anchored frozen box that ground would slide down on every push. Offsetting by `extent.h - naturalH` keeps the floor still and the structure grows upward, which is also the physical model the lesson teaches. |
| centre-x | `heap` | `treeCx` already centres each level within the *natural* content width, so centring the natural box inside the extent keeps the root at the box's centre across a level gain; top-left anchoring would jump the whole tree sideways every time a level is added. |

**Clamp, never shrink:** `fitToExtent` uses `max(extent, natural)` on both axes, so a stale extent
can only widen the box — it can never clip the drawing.

**What this does to §4's resting frames.** Freezing the box to the trace max means `bst-operations`'
step 0 is drawn inside `0 0 380 222`, not `0 0 40 66`. Its "empty tree" label at x=50 is then
*inside* the box — §3 alone removes the blank frame. §4 is still required and still separate: it
makes the empty-state viewBox correct **on its own terms** (an instrument whose whole trace is empty,
a renderer used bare, a unit test — **[corrected]** an earlier draft also listed the dev gallery, and
that is wrong: `/dev/renderers` renders through the real `<Visualizer>`, so it gets a frozen extent
like every other page and is *not* an extent-less caller), and §3's anchoring rule then centres that
label in the larger extent rather than parking it in a corner. The visible consequence for a JS-off
`trees-bst` reader is a small label in a large frame — accepted deliberately, because the only
alternative is a small step-0 box that jumps to full size at step 1, which is the defect §3 exists to
remove.

**Scope:** the renderers the §2 audit reports as varying. Renderers reported constant are named
inline in the test rather than silently omitted.

**One documented behaviour is amended:** `docs/m3-design.md:151` records "viewBox height grows with
size" for the stack renderer. That was the intended behaviour for one renderer and is now the
defect; §6 records the amendment.

---

## 4. Resting frames that fit their own box

**The defect, precisely.** Two renderers emit a resting label that does not fit the viewBox they
compute for it (§2B). `TreeRenderer` places "empty tree" at `x = PAD + 40 = 50` while computing the
empty viewBox as `0 0 40 66`, so the text is outside the box at any scale and the frame renders
blank. `HeapRenderer` centres a label roughly 100 units wide inside an 80-unit box, so it clips to
"mpty hea".

Because the still is `renderStatic(trace[0])` by construction, this is not a transient
pre-hydration state: it is what JavaScript-off readers and printed pages get **permanently**, which
contradicts the project's own "the viz degrades gracefully" constraint.

**The fix is one rule at the renderer level, not six authored frames.** A renderer that draws a
resting label must size its viewBox to contain it — i.e. the empty-state viewBox is computed *from*
the label's extent rather than from an empty structure's. Only `TreeRenderer` and `HeapRenderer`
need the change; the other resting frames already satisfy the rule and are left alone.

**[corrected after implementation] — three renderers needed the change, not two.**
`LinkedListRenderer` drew `"empty list ⌀"` `start`-anchored at x=50 in a 108-unit box (50→182, 74
units outside it) and was missed because §2B's instrument reads `trace[0]` only, where
`linked-list-operations` draws four nodes and no resting label. Unreachable from product input —
the delete index is clamped, so the list never empties — so it is the rule that was broken, not a
frame a reader saw. The lesson is in the assertion, not the count: two per-renderer tests shipped
where this section asked for "the rule itself", and a rule asserted renderer-by-renderer cannot fail
for a renderer nobody listed. It is now one table-driven test over every registered renderer's empty
state (`tests/unit/renderers/empty-frames.test.ts`), sharing its span model with the audit script.
See the plan doc's post-implementation correction 4.

This resolves what an earlier draft left as an open question ("authored per algorithm or derived per
renderer?"): the defect is uniform and affects two renderers, so it is derived, and the assertion in
§9 is the rule itself rather than a list of blessed strings.

---

## 5. Marker labels

**The defect.** `ArrayRenderer`'s `range` branch hardcodes the strings `lo` and `hi` for *any*
`range` highlight, and the registry maps both the `array` and `bars` renderer ids to it.

**Eight algorithms emit a `range` highlight** — `binary-search`, `linear-search`, `array-operations`
and the five sorts (`bubble`, `insertion`, `selection`, `merge`, `quick`). **Exactly one of them
wants `lo`/`hi`:** binary search. The other **seven** print a search-window vocabulary their own
prose disowns — linear search does so two paragraphs after saying *"There is no `lo`, `hi`, or
`mid`"*, and `array-operations` does it on all 13 steps of the arrays lesson. **[corrected]** — an
earlier draft counted six affected and then exempted `array-operations` from the test, which would
have left the one lesson still printing the wrong vocabulary as the one lesson the test never looked
at.

**The fix, narrowly.** `renderers/shared.ts:49` already exports `metaLabel(h, fallback)`. Route
`ArrayRenderer`'s `range` branch through it **with no fallback**, and fold ArrayRenderer's inline
active/pointer meta read into the same helper.

`metaLabel` reads only `meta.label` and returns one string, but a range needs **two** end labels, so
`shared.ts` gains a sibling:

```ts
export const metaRangeLabels = (h: Highlight): { start: string | null; end: string | null };
```

reading `meta.startLabel` / `meta.endLabel`. That is the meta contract: `meta.label` for
single-target markers, `startLabel`/`endLabel` for a range.

**In the same commit, binary-search supplies its own labels** (`startLabel: 'lo'`,
`endLabel: 'hi'`), or the lesson that legitimately wants them loses them.

**What does not change, and must not be broken by a blanket rule:** other renderers keep their
documented fallbacks. `GraphRenderer` draws `at` via `metaLabel(h, 'at')` for a current node and
both BFS and DFS rely on it; `array-operations` authors `read` and `shift` deliberately;
`insertion-sort` authors `key`. A "no renderer default anywhere" rule would strip labels from
renderers that are working correctly.

---

## 6. The legibility floor — measured, and mostly left alone

**A legibility floor already ships, and the measurement says this plan should not build a second
one.** `Visualizer.astro:817-833` carries the "RSP-2 legibility floor": `.viz-canvas > svg` has
`min-width: calc(var(--viz-natural-w, 0px) * 0.75)`, with `--viz-natural-w` written by the script
from the live viewBox — never at build time, deliberately, so a JavaScript-off page has no
measurement, no scroll container and therefore no unreachable-scroller keyboard failure.

Its 0.75 is a documented decision, not an arbitrary constant: *"chosen over the intrinsic 100%
because a 6-cell default would otherwise start scrolling on a 390px screen it currently fits."*

**[corrected] — an earlier draft of this plan proposed a whole vertical mechanism** (a new
`--viz-label-min: 11px` token, an explicit pixel height, `overflow-y: auto`, a `max-height` "tied to
the cap", and scroll-into-view on step change). Three measurements retire all of it:

1. **The shipped floor is already a two-axis floor.** Every SVG is emitted with
   `preserveAspectRatio="xMidYMid meet"` and `height: auto`, so the scale is *uniform*. A width held
   at `0.75 × naturalW` therefore holds the height at `0.75 × naturalH` as well. There is no axis on
   which the drawing can fall below the floor while the other stays above it.
2. **There is no height cap to exceed.** `max-height` does not appear anywhere in
   `Visualizer.astro`; `.viz-canvas` declares `overflow-x: auto` only. `.viz-frame`'s
   `overflow: hidden` exists for the full-bleed negative-margin trick (RSP-2) and does not clip a
   child that makes the frame taller. A tall drawing makes the page taller — it never clips and never
   scrolls vertically.
3. **Adding the cap would *create* the a11y bug, not fix one.** `measureCanvas` decides `tabindex`,
   `role="group"` and the canvas's accessible name from horizontal overflow alone
   (`scrollWidth - clientWidth > 1`, `:2807-2830`). Introducing `overflow-y: auto` + `max-height`
   would produce a container that can overflow vertically while fitting horizontally — an
   unreachable keyboard scroll region, exactly the WCAG 2.1.1 failure the RSP-2 comment says the
   JS-off path was designed to avoid.

The earlier 11px proposal was also wrong on its own terms: the smallest authored label is 12px, so
11/12 ≈ 0.917 against the shipped 0.75 is a 22% tightening that would push the DP table (viewBox 446
wide) to 409 px on a 390 px phone where 0.75 gives 334 px and it fits today. It would have violated
this project's own standing rule — check the design docs before "fixing" something that looks off.

**What item 4 actually is, then — one real defect and one test:**

- **`--viz-natural-w` must be written from the frozen extent, not from the current step's viewBox.**
  `measureCanvas` reads `svg.viewBox.baseVal.width` live, so under §3 it would still change while
  stepping — the floor would move under the reader even though the box no longer does, and on a
  narrow screen the drawing would resize *anyway*, defeating §3 on the exact screens it matters on.
  This is the item's whole implementation: the measure reads the extent the island already holds.
- **A regression test** pinning the floor's behaviour under the new extent (§9).

No new token, no `max-height`, no `overflow-y`, no scroll-into-view, and `measureCanvas`'s
horizontal-only verdict stays correct because vertical overflow remains impossible. If a height cap
is ever wanted it is a separate design decision with its own a11y work — and it belongs to Plan C,
which restructures the instrument, not here.

## 7. The custom-input P0

**The defect.** `parseInput` requires a `[…]` literal while the field's help text says "Up to 30
whole numbers, comma-separated", and the fallback error then tells a reader who filled in both
fields to fill in both fields. Verified reproduction: `9,2,7,4,1` + `4` → *"Type an array and target,
e.g. [1,3,5,7] target=5"*.

**The fix lives in the island's field composer**, so no algorithm's `parseInput` changes and the 19
algorithm unit tests and `probeListCap` are untouched.

**It must be gated per instrument, and the gate must be a client-side one.** There is one composer
serving all 21 instruments, and an unconditional bracket-wrap breaks every non-array lesson: a graph
reader types `0-1,0-2,1-3` and a DP reader types `7`.

**[corrected]** — an earlier draft gated on `arrayPlaceholder` (`Visualizer.astro:255`). That is
wrong twice: it is a build-time frontmatter const the bundled script never sees, and its fallback
lies — `authored.input || inputPlaceholder || '[1,3,5,7,9,11]'` hands a bracketed default to an
instrument that authored no input at all. The correct carrier already exists: the script reads
`root.dataset['input']` (`:2122`) and already calls `splitAuthoredInput(rawInput)` (`:3096`). **Gate
on `splitAuthoredInput(rawInput).input.startsWith('[')`** — the instrument's real authored value,
absent when there is none.

**The transformation, stated exactly.** When the gate is on and the typed first field does not
already start with `[`, the composer wraps *only* that field: `trim()`, wrap in `[…]`, leave the
second field and the `target=` join untouched. Accepted forms for an array instrument: `1,3,5,7` and
`[1,3,5,7]` both compose to `[1,3,5,7] target=N`. Nothing else is normalised — no whitespace
rewriting, no separator coercion — so a malformed list still reaches `parseInput` and still produces
that algorithm's own message.

**The error message is a second, separate edit, and the plan owns it explicitly.** The string
*"Type an array and target, e.g. [1,3,5,7] target=5"* is a literal inside `binarySearch.parseInput`
(`binary-search.ts:155`), not in the composer — so "the fix lives in the composer and nowhere else"
and "the fallback message is rewritten" cannot both be true. **[corrected]** — an earlier draft
asserted both, and scoped the rewrite to one file. This plan does both edits and says so:

- **The composer gate** — no algorithm touched, the 19 algorithm unit tests and `probeListCap`
  untouched.
- **The message rewrite in two siblings**, not one: `binary-search.ts:155` and
  `linear-search.ts:127` carry the identical bracket-literal defect (*"…e.g. [4,1,7,2] target=7"*)
  and both instruments live on lesson pages this plan already re-baselines. Rewriting one and not
  the other would leave the same lie on the next lesson down.

**Constraint on the new wording:** `errorField` decides which field gets `aria-invalid` and focus by
reading the message prose against `FIRST_FIELD_WORDS` (`core/error-field.ts`). Both rewrites must
keep a first-field word — "array" — or the error lands on the target field. That is asserted in the
same commit, alongside the re-baselined string tests.

Fixing the composer alone already makes the "binary search needs a sorted array" message reachable —
today it is not — so the message rewrite is about naming the *remaining* failure honestly, not about
the P0 itself.

---

## 8. Files

| area | files |
|---|---|
| contract | `src/viz/core/types.ts` — `Extent`, `RenderOpts.extent`, `Renderer.setExtent`, `RendererModule.measure` |
| shared | `src/viz/renderers/shared.ts` — new pure `fitToExtent` + `Anchor`; `createRenderer`/`renderStaticSvg` apply it; new `metaRangeLabels` |
| extent reducer | `src/viz/core/extent.ts` (new, pure) — `traceExtent(measure, trace)` |
| every renderer | all 11 modules gain `measure`, extracted from the viewBox their `draw` already computes; `stack`/`callStack`/`heap` also declare an `ANCHOR` |
| array family | `src/viz/renderers/ArrayRenderer.ts` — its own extent path (`viewBoxOf`, `buildCells`, `renderArrayStatic`, the client scaffold at `:312-318`) and the `range` label branch at `:180`/`:188` |

| resting frames | `TreeRenderer`, `HeapRenderer` only (§2B) |
| host | `src/viz/Visualizer.astro` — build-time measure and still re-emission; client re-measure + `setExtent`; `--viz-natural-w` sourced from the extent in `measureCanvas` (`:2807-2830`); the composer gate on `splitAuthoredInput(root.dataset['input']).input` (`:2122`, `:3096`) |
| algorithms | `binary-search.ts` — range meta labels **and** the rewritten parse message (`:155`); `linear-search.ts:127` — the same message defect |
| unchanged, deliberately | the RSP-2 CSS block (`:817-833`) — §6 measured it correct as shipped; no `max-height`, no `overflow-y`, no new token |
| audit | `scripts/audit-frames.mjs` (new, committed with its output) |

## 9. Testing

**Unit (Vitest, node, pure):**

- `metaRangeLabels` returns both ends, or nulls, and never invents a string.
- `firstSentence` is **not** in this plan.
- The extent reducer (max across a trace's viewBoxes) is a pure function and is tested as one,
  including the malformed-viewBox failure path.

**End-to-end:**

- **Canvas height is constant across a whole run**, at 1440 and 390, for each renderer the audit
  reports as varying; renderers reported constant are named inline as such.
- **No empty stage at step 0** for the audited set, asserted as "the frame's viewBox contains every
  drawn element", not as a screenshot.
- **Marker vocabulary, scoped by highlight kind rather than by algorithm.** Positive:
  binary-search's `range` still renders `lo` and `hi` from its own meta; `array-operations`' authored
  `read`/`shift`, `insertion-sort`'s `key` and `GraphRenderer`'s `at` all survive. Negative: **no
  `range` highlight on any of the seven affected instruments renders marker text unless its
  algorithm supplied `startLabel`/`endLabel`** — which covers `array-operations` instead of exempting
  it. The assertion reads `class="viz-marker"` text nodes only, never `<desc>`, which legitimately
  contains the authored sentence.
- **The legibility floor under a frozen extent:** at 390 px, `--viz-natural-w` is **constant across
  a whole run** on a varying renderer (today it tracks the current step), so the drawing's rendered
  width never changes while stepping — the assertion §3 makes on the box, made again on the floor.
  The 6-cell array and the DP table still fit without scrolling at 390 px, the cases the shipped
  0.75 was chosen to protect, and a canvas that overflows horizontally is still a reachable scroll
  region (`tabindex="0"`, `role="group"`, an accessible name).
- **Custom input:** `1,3,5,7` + `5` is accepted on binary-search and on linear-search; the
  sorted-array message is reachable; a graph instrument's `0-1,0-2,1-3`, a DP instrument's `7` and a
  BST instrument's `50,30,70` are unaffected — including an instrument that authored no `input` at
  all, the case the old `arrayPlaceholder` gate would have mis-classified.
- **Error attribution survives the rewrite:** unit-test both new messages through `errorField` and
  assert `'input'`.

**Baselines:** this plan moves drawings, so it re-seeds the visual baselines **inside its own
commits**, reviewed as part of those diffs.

**[corrected after implementation] — the pixel baseline is not the gate this section leans on it to
be, and the aria baseline is.** Measured while landing the marker-label fix: `maxDiffPixelRatio:
0.002` against an ~8,626 px full-page screenshot tolerates roughly **30,000** changed pixels, and
removing two 12px labels changed **569** — about 0.005% of the page — all of it inside one 653×18
band. So **all 14 captures passed unchanged** before they were re-seeded; the pixel gate literally
cannot see a text-level change of this size, and a green visual run is not evidence a label moved or
vanished. What caught it was `baseline-aria.spec.ts`, whose snapshot carries the marker text
verbatim: linear search's still lost its trailing `lo hi` and binary search's kept it, one line of
diff, reviewed in the commit. Two consequences for anyone re-reading this section: the pixel
baselines here were re-seeded for *fidelity*, not because they failed; and a change that only alters
text should be gated on the aria snapshot (or a DOM assertion), never on pixels. The frozen-extent
task moved no committed baseline at all — the four routes under pixel baseline all draw with the
array renderer, whose authored runs were already constant at 384×132.

**Aria snapshots are also affected. [corrected]** — an earlier draft claimed they were not. Exactly
one file re-records: `baseline-aria.spec.ts-snapshots/lesson-binary-search.aria.yml`, the only
lesson under aria baseline. It already contains the marker text verbatim, and it carries **both**
sides of §5's evidence on one page:

```yaml
- img "Binary search on a sorted array Ready. …": /1 0 3 1 5 2 7 3 9 4 \d+ 5 lo hi/   # keeps lo hi
- img "Linear search through an array Ready. Scanning left to right…": 8 0 3 1 5 2 9 3 1 4 7 5 lo hi
```

After step 4 the second line loses its trailing `lo hi` and the first keeps it. That diff *is* the
assertion, reviewed in the commit. Steps 2 and 3 re-record it too, since the still's `img` name and
its coordinate text come from the frame §3 and §4 change. Step 5 does not touch it: `--viz-natural-w`
is a CSS variable, not accessible content, and §6 leaves `tabindex`, `role` and the accessible name
exactly as they ship.

**Definition of done:** `build`, `lint`, `format:check`, `test`, `test:e2e` clean, with all fifteen
lessons passing and the JS budget spec green. The only client-side additions are the extent reducer
and the `setExtent` call in the re-measure path — small, but the number goes in the commit message
as a measured gzip delta on a lesson page's static import closure, not as an estimate.

---

## 10. Sequencing

1. **The audit script.** `scripts/audit-frames.mjs`, committed with its output (§2) in the commit
   message so the scope is reproducible. No product change.
2. **Extent lifecycle.** Types, `mount` storage, build-time measure, client re-measure, the varying
   renderers. Re-seeds visual baselines.
3. **Resting frames.** `TreeRenderer` and `HeapRenderer` only, via the fits-its-own-box rule.
   Re-seeds.
4. **Marker labels.** `metaRangeLabels`, `ArrayRenderer`'s range branch, binary-search's labels.
   Re-seeds.
5. **Legibility floor.** One change: `--viz-natural-w` is written from the frozen extent rather
   than the live viewBox. No CSS, no new token, no pixels move at 1440; on narrow screens a varying
   renderer stops resizing, so it re-seeds the mobile visual baselines only.
6. **Custom-input P0.** The composer gate and the two rewritten messages. No pixels move.
7. **Spec amendment.** §11.2's renderer contract (`RenderOpts.extent`, `Renderer.setExtent`, the
   marker-meta contract) and `docs/m3-design.md:151`. The RSP-2 floor is *not* amended — §6's
   measurement confirmed it, and that finding is recorded in this plan rather than in the spec.

Steps 2–5 each move pixels and each re-seed inside themselves, so every step ends green including
`test:e2e`. Step 4 also re-records aria snapshots (§9), which is the point: that diff is the
evidence the wrong vocabulary is gone.

---

## 11. Open questions

None blocking. The one an earlier draft carried — whether resting frames are authored per algorithm
or derived per renderer — is resolved by §2B's measurement: two renderers break one uniform rule, so
the fix is derived (§4).
