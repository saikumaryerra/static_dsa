# M6 Design Handoff — `TableRenderer` + "Intro to Dynamic Programming" (Lesson 15)

**Author:** UI_UX-Designer · **For:** Frontend-Engineer, Systems-Architect (core/ids, TState names, algorithm instrumentation, glossary), Lead-Developer, QA-Engineer · **Milestone:** M6 (stretch) · **Status:** Ready to implement.

**Reuses verbatim, introduces nothing new:** all `--hl-*`/`--surface`/`--border-strong`/`--text*`/`--radius-*`/spacing/motion tokens; the canonical `kind → {token, class, marker}` table in `src/viz/core/highlight.ts` (honors a SUBSET); m3 shared geometry (`PAD/GAP/CELL/TOP`, docs/m3-design.md §2.5); m2 Visualizer chrome. The DP table is visually a 1-D array that fills in, so `TableRenderer` is a near-sibling of `ArrayRenderer` and reuses its cell primitive, `cellId`, `.viz-cell*` CSS, and compare tie-line. No new tokens/colors/highlight kinds.

---

## UX Rationale
Beginners struggle with DP for one reason — they can't *see* a value being **reused instead of recomputed**. Making each `dp[i]` a cell that lights up its two dependency cells (dashed tie-lines) turns `dp[i]=dp[i-1]+dp[i-2]` into a watchable "these two feed this one." Showing memoization and tabulation as the **same table filled in two different orders** (side by side) lets the learner discover "DP is recursion without the recomputation" by comparing fill patterns.

---

## 1. TableRenderer canvas (new renderer)

### 1.1 Table shape — 1-D only for M6; 2-D deferred
Both lesson problems are 1-D: Fibonacci `dp[0..n]`, `dp[i]=dp[i-1]+dp[i-2]`; climbing stairs (identical recurrence, distinct story). 1-D teaches overlapping subproblems + memoization-vs-tabulation completely.
> `// SPEC-GAP:` §5 lesson 15 says "DP table filling in" + names Fib/climbing stairs (both 1-D). **2-D grid OUT of M6 scope.** Future grid-DP: extend with `tableCellId(r,c)` + grid layout (reserved in §1.3, build later).

### 1.2 Cell layout — reuse the ArrayRenderer primitive verbatim
Horizontal band of the §2.1 rectangular cell at §2.5 dimensions (identical to ArrayRenderer — fork its geometry):
```
CELL=54  GAP=8  PAD=10  TOP=26     (m3 §2.5 — do NOT invent values)
cellX(i)=PAD+i*(CELL+GAP)          (reuse ArrayRenderer cellX)
viewBox width = PAD*2 + n*(CELL+GAP) - GAP   → fluid, computed from dp length, never fixed px
```
```
[TOP band 26]  carets / tie-lines / + / ✓ overlay (rebuilt each step)
[cell row]  ┌────┐┌────┐┌────┐┌────┐┌╌╌╌╌┐┌╌╌╌╌┐
            │ 0  ││ 1  ││ 1  ││ 2  ││ ·  ││ ·  │
            └────┘└────┘└────┘└────┘└╌╌╌╌┘└╌╌╌╌┘
              0    1    2    3    4    5      ← index label (INDEX_Y), --text-muted mono 12px
```
- **Filled cell:** rect rx --radius-control, fill --surface, stroke --border-strong 1.5; value --text mono 20px weight 600 centered.
- **Empty cell (`null`):** reuse `is-eliminated` dim (opacity 0.42, m3 §2.6); value → centered `·` in --text-muted (reuse QueueRenderer empty-slot treatment). Optional: empty rect stroke --border (calmer) — FE's call, skip if it complicates the fork.
- **Index label** `0..n` under each cell at INDEX_Y (reuse ArrayRenderer). `dp[i]` framing carried by the caret + explanation, not per-cell relabeling (i18n-safe).

### 1.3 Stable ids — reuse `cellId`, add nothing for 1-D
The 1-D DP table is index-addressed like an array → reuse `cellId(i)` from `core/ids.ts` unchanged (`dp[3]` = `#i3`); algorithm+renderer agree via the same import (M3 TD-3). No new id fn for M6.
> Coordinate with architect: reserve `tableCellId(r,c) → "t{r}_{c}"` for the future 2-D grid (document only). A distinct `dpCellId` for M6 is unnecessary coupling — reuse `cellId`.

### 1.4 Highlights honored — a subset of the m3 canonical table
Reads `core/highlight.ts`, honors five kinds; each = existing token + mandatory non-color marker (m3 §1 gate: a `--hl-*` fill without its marker is a QA fail):

| kind | token | class | marker | meaning in a DP table |
|---|---|---|---|---|
| `active` | --hl-active | is-active | named caret + 3px stroke + lift | the cell being computed now (`dp[i]`); caret label from `meta.label` |
| `compare` | --hl-compare | is-compare | dashed tie-line + amber ring | cells `dp[i]` depends on and is reading/recomputing now |
| `visited` | --hl-visited | is-visited | `✓` badge | a dependency already computed and being **reused** (the cache hit) |
| `insert` | --hl-found (reuse) | is-insert | `+` caret + fade-in | a cell just filled this step |
| `found` | --hl-found | is-found | `✓` glyph | the final answer cell `dp[n]` once complete |

Plus `is-eliminated` (0.42) for not-yet-reached cells. Precedence/stacking already correct in `applyHighlights`.

**Dependency `dp[i]=dp[i-1]+dp[i-2]` reads as:** (1) `dp[i]` `active` (blue ring + lift + caret); (2) each dependency `compare` (amber, "recomputing now") OR `visited` (violet ✓, "cached, reused") — the choice is what distinguishes recompute-avoidance, emitted per step by the algorithm; (3) a dashed tie-line per dependency from its top-center into the TOP band to the active cell (reuse `.viz-tie`, `stroke: var(--hl-compare)` 1.5px `dasharray "4 3"`); two deps → two converging lines; (4) the running arithmetic lives in the explanation/`<desc>` (§1.6), not on-canvas (calm palette). Optional on-canvas result via `active.meta.expr` NOT recommended (clutter/i18n).

> **Data shape (FE/architect finalize names):** per step `state.table: (number|null)[]` (`null`=uncomputed) + optional `state.n` (target). Dependency edges via `highlights` only — renderer draws a tie-line from every `compare`/`visited` id to the single `active` id; no extra edge field. Caret text via `active.meta.label`.

### 1.5 viewBox / responsiveness / motion — all inherited
Fluid viewBox from `table.length`; `width=100% height=auto preserveAspectRatio=xMidYMid meet`; transparent bg. At cap (n≤30) frame scales down; never shrink the 54u cell. Reduced motion inherited (token layer → 0.01ms; insert fade single-phase snaps); no matchMedia. Build via `createRenderer`/`renderStaticSvg` in `shared.ts` (still == hydrated step 0); marker overlay in `viz-markers` rebuilt each step; stable cellIds so CSS tweens color/lift (fork ArrayRenderer's persistent-cell path for cross-step tween, or the shared atomic-redraw path — both fine for ≤30 cells).

### 1.6 `<title>`/`<desc>` (m3 §3.1, rewritten each step)
`<title>` = static label from `mount({title})`. `<desc>` mirrors `step.explanation`:
| situation | `<desc>` |
|---|---|
| tabulation fill | "Filling dp[5] = dp[4] + dp[3] = 3 + 2 = 5." |
| cache hit (memo) | "dp[3] already computed (2) — reusing it, not recomputing." |
| base case | "Base case: dp[0] = 0, dp[1] = 1." |
| recursive descent | "Computing dp[5] needs dp[4] and dp[3]; both empty, so recurse first." |
| final answer | "Done: dp[5] = 5 is the answer." |

### 1.7 memoization vs tabulation — TWO Visualizer instances, same renderer
Both fill the same 1-D table; they differ only in fill order (the lesson). Run as two independently-steppable `<Visualizer renderer="table">` islands:
- **`dp-fib-tabulation`** (bottom-up): fills strictly L→R; `dp[0]`,`dp[1]` base (`insert`), then each `dp[i]` `active` with its two already-filled neighbors as `compare` + tie-lines, then `insert`. No cell dimmed after filling.
- **`dp-fib-memoization`** (top-down): `dp[n]` `active` first while `dp[n-1]`/`dp[n-2]` still empty (dimmed); recurse down (active walks left, cells empty) to base cases, then backfill upward. When a needed `dp[k]` is already filled, mark it `visited` (violet ✓, cache hit) instead of `compare`. Dimmed-then-backfilled + ✓ hits = memoization's visual signature.
A `<Callout variant="tip">` between them names the contrast. Two instances beat an in-viz mode toggle (independently steppable, JS-off shows both stills).

---

## 2. DP lesson (Lesson 15)
Standard 7-section template; DP-specific only below. Frontmatter: `slug: dynamic-programming`, `track: algorithms`, `order: 15` (FE reconciles), `prerequisites: ['recursion','complexity-big-o']`, `difficulty: beginner`, `published: true` (REQUIRED — the glossary validator fails the build if the DP slug is referenced but unpublished, m5-architecture §1.3).

### 2.1 Intuition — the two pillars, concretely
Lead with overlap: "computing `fib(5)` naively recomputes `fib(3)` three times and `fib(2)` five times." Then name plainly: **Overlapping subproblems** ("the same smaller problem shows up again and again" — link back to the recursion lesson's naive-Fibonacci point); **Optimal substructure** ("the big answer is built directly from smaller answers" — `dp[i]` is just `dp[i-1]+dp[i-2]`). Land the payoff: **"DP is recursion without the recomputation — solve each subproblem once, write it in a table, reuse it."**

### 2.2 Layout — two Visualizers
```
[## Visualizer]  intro "Watch the same table fill in two ways."
  [Tabulation]  <h3> "Bottom-up (tabulation)"
     <Visualizer algorithm="dp-fib-tabulation" renderer="table" input="6" inputLabel="n" showTarget={false} />
     caption: "Fills left→right; every value is ready before it's needed."
  [Callout tip — the contrast]  (§2.3)
  [Memoization]  <h3> "Top-down (memoization)"
     <Visualizer algorithm="dp-fib-memoization" renderer="table" input="6" inputLabel="n" showTarget={false} />
     caption: "Recurses down, then backfills; a ✓ marks a value reused from the cache."
```
Mobile-first: stacked single column (primary). ≥768px: MAY go 2-up only if each clears min legibility at half-width (n≤~8); **recommend stacked at all breakpoints** (dev-gallery precedent, easier step-for-step compare, no CLS). Default `input="6"`; cap n≤30 in parseInput.

### 2.3 Contrast Callout (`variant="tip"`, between the two)
"**Same table, two directions.** Tabulation fills bottom-up, left to right — dull but complete. Memoization starts from the top (`dp[n]`), recurses down to the base cases, then fills back up — and whenever it needs a value it already has, it **reuses it** (the ✓) instead of recomputing. Both do O(n) work and use O(n) space; they only differ in the order cells light up." Reuse `.callout`/`variant="tip"`.

### 2.4 Code — both variants, three languages each (mirror binary-search's two-CodeTabs)
- `### Bottom-up (tabulation)` → `<CodeTabs tabs={tabulationTabs}>` Python/JS/Java: explicit `dp` array in a `for i in range(2,n+1)` loop; structure matches the L→R fill.
- `### Top-down (memoization)` → `<CodeTabs tabs={memoTabs}>`: recursive `fib(n)` + a cache (`memo`/dict/array) with the `if n in memo: return memo[n]` guard (the code embodiment of ✓). Recognizable as "the recursion lesson's `fib`, now remembering answers." Keep CodeTabs code strings BLANK-LINE-FREE (MDX ESM rule).

### 2.5 Reference the prerequisite (recursion/call stack)
Intuition links back: "In the [Recursion](/learn/recursion) lesson the call stack for `fib(5)` recomputed the same calls over and over — DP fixes exactly that." Memoization = the recursion lesson's call structure + a lookup table (say so). Do NOT render a second CallStackRenderer (one viz = one renderer; contrast in prose + cross-link). List `recursion` in prerequisites.

---

## 3. Accessibility (WCAG 2.1 AA)
- **Non-color dependency cues:** dashed tie-lines + rings + `✓` badge + `+`/caret, all redundant with `<desc>` — CVD/SR users get "dp[5]=dp[4]+dp[3]" from geometry AND words. compare(amber) vs visited(violet) distinction backed by the `✓` shape + `<desc>` ("already computed — reusing it"), so the memoization insight never depends on hue.
- **`<desc>`** per step (§1.6), mirroring `step.explanation` (same sentence as the `aria-live` line).
- **Contrast both themes** (existing tokens, m3 §3.3): value 16.6/11.9:1; index --text-muted 7.0/5.7:1; stroke --border-strong 4.8/3.9:1; tie-lines/rings/glyphs --hl-* ≥3:1. The `·` empty placeholder (0.42) is decorative-redundant (dimmed cell + missing value + `<desc>` already signal empty) — acceptable per 1.4.1.
- **Reduced motion** inherited (single-phase insert fade snaps). **Keyboard/JS-off** inherited from m2 chrome (static still at build via renderStaticSvg). One h1; 7 `##` = h2; approach labels h3 (no skipped levels).

---

## 4. Glossary terms (architect/FE — `src/lib/glossary.ts`)
Add these, all → the DP lesson slug (recommend `dynamic-programming`; must match frontmatter, lesson must be `published:true`). m5-architecture §1.5 deferred "Memoization → OMIT until M6"; M6 wires them in:

| term | definition (author real copy, no lorem) | lessonSlug |
|---|---|---|
| Dynamic programming | Solving a problem by breaking it into overlapping subproblems, solving each once, and reusing the stored results. | dynamic-programming |
| Memoization | Top-down DP: run the natural recursion but cache each subproblem's answer so it is never recomputed. | dynamic-programming |
| Tabulation | Bottom-up DP: fill a table of subproblem answers in dependency order, smallest first. | dynamic-programming |
| Overlapping subproblems | The property that a recursive solution solves the same smaller problem many times — the signal DP will help. | dynamic-programming |
| Optimal substructure | The property that an optimal answer is built from optimal answers to its subproblems. | dynamic-programming |

---

## Handoff summary
- **FE:** build `src/viz/renderers/TableRenderer.ts` by forking ArrayRenderer (reuse cellId, cellX, .viz-cell*, .viz-tie, is-active/compare/visited/insert/found/eliminated, insertMark/foundMark/visitedBadge/caretMark from shared.ts); register `renderer="table"`; author `dynamic-programming.mdx` (7 sections, two Visualizers, two CodeTabs, contrast Callout, recursion cross-link); wire the 5 glossary terms.
- **Architect/FE:** confirm cellId reuse (reserve tableCellId(r,c) for future 2-D, document only); finalize TableState (`table:(number|null)[]`, `n`); instrument `dp-fib-tabulation` + `dp-fib-memoization` emitting the §1.4/§1.7 highlight sequence (memo emits `visited` on cache hits); add glossary terms.
- **QA:** assert renderStatic emits the paired marker whenever a --hl-* class is present (m3 §3.2 gate, incl. a tie-line for every compare/visited dep); axe + keyboard on the DP lesson both themes; `<desc>` mirrors explanation each step; the memoization `✓` cache-hit reads without color.
