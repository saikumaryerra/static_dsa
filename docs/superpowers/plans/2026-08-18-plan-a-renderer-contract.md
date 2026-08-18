# Plan A — Renderer Contract and the Drawing's P0s — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze each visualization's drawing box for the whole trace, make two broken resting frames draw inside their own viewBox, stop seven algorithms printing a search-window vocabulary they don't use, and let the custom-input box accept the format its own help text advertises.

**Architecture:** Trace-then-render is not forked. A new pure `measure(step) → Extent` on every renderer module lets a caller reduce a whole trace to one box; a new pure `fitToExtent(canvas, extent, anchor)` in `renderers/shared.ts` widens each step's natural viewBox to that box and offsets the drawing by the renderer's declared anchor. Both the build-time still and the hydrated renderer call the same two functions, so they cannot drift. Everything else in this plan is a local defect fix.

**Tech Stack:** TypeScript (`strict: true`), Astro 7 static output, Tailwind, Vitest (`environment: 'node'` — no DOM, no `localStorage`), Playwright, ESLint + Prettier, npm, Node ≥ 22.12 (CI pins 24).

**Spec:** `docs/superpowers/specs/2026-08-18-plan-a-renderer-contract-design.md` (part 1 of 3 — see `docs/superpowers/specs/2026-08-18-show-your-work-decomposition.md`).

## Global Constraints

Copied from the spec and `CLAUDE.md`. Every task's requirements implicitly include this section.

- **Trace-then-render (site spec §11)** — an instrumented algorithm emits `Step[]`; a generic Player indexes into it; dumb renderers draw SVG. Never hand-code timers or mutations per algorithm.
- **No new dependencies** beyond site spec §4. Adding one requires a `// SPEC-GAP:` justification. **This plan adds none.**
- **Vitest runs `environment: 'node'`** with no DOM library and no `localStorage`. Unit tests must be pure functions with injected inputs. Anything DOM- or storage-shaped belongs in Playwright.
- **JS budget ≤ 60 KB gzipped per lesson page.** A size claim in a comment is a claim about the build — measure it (gzip every chunk in the page's static import closure) or don't write it.
- **WCAG 2.1 AA** — real buttons/inputs, fully keyboard-operable, `aria-live="polite"` step explanations, never colour-only signals, respect `prefers-reduced-motion`.
- **Every `--hl-*` colour needs a paired non-colour marker** (design §3.2). `tests/unit/renderers/marker-gate.test.ts` enforces this independently — it must stay green.
- **JS-off must work.** The still is `renderStatic(trace[0])` by construction; it is what JS-off readers and printed pages get permanently.
- **No `console.log` or dead code in production.** JSDoc on public functions; inline "why" comments.
- **Conventional Commits.** **Never add a `Co-Authored-By` line to a commit message.**
- **Never commit `opencode.json`** (contains an API key; gitignored).
- **Definition of Done for every commit:** `npm run build`, `npm run lint`, `npm run format:check`, `npm run test`, `npm run test:e2e` all clean.
- Branch: `feat/show-your-work-slice`. Do not merge to `main` in this plan.

---

## File Structure

| file | status | responsibility |
|---|---|---|
| `scripts/audit-frames.mjs` | **create** | Reproducible measurement: per algorithm×renderer, the viewBox range across a full trace and whether step 0's drawing fits its own box. Committed with its output so §2's scope can be re-derived rather than believed. |
| `src/viz/core/types.ts` | modify | `Extent`; `RenderOpts.extent`; `Renderer.setExtent`; `RendererModule.measure`. |
| `src/viz/core/extent.ts` | **create** | `traceExtent(measure, trace)` — the pure max-reduction over a trace. Its own file because it is consumed by both the Astro frontmatter and the island script, and must be unit-testable in the node harness. |
| `src/viz/renderers/shared.ts` | modify | `Anchor`, `TOP_LEFT`, pure `fitToExtent`; `createRenderer`/`renderStaticSvg` apply it; `metaRangeLabels`. |
| `src/viz/renderers/ArrayRenderer.ts` | modify | Its own extent path (it implements neither `Draw` nor `createRenderer`); `measure`; the `range` label branch. |
| `src/viz/renderers/TreeRenderer.ts` | modify | `measure`; the resting-frame fix. |
| `src/viz/renderers/HeapRenderer.ts` | modify | `measure`; `ANCHOR` (centre-x); the resting-frame fix. |
| `src/viz/renderers/StackRenderer.ts`, `CallStackRenderer.ts` | modify | `measure`; `ANCHOR` (bottom). |
| `src/viz/renderers/HashTableRenderer.ts`, `LinkedListRenderer.ts`, `QueueRenderer.ts`, `GraphRenderer.ts`, `TableRenderer.ts`, `ChartRenderer.ts` | modify | `measure` only. |
| `src/viz/core/input-hint.ts` | modify | `composeCustomInput` — the pure bracket-wrap, gated on the authored first field. |
| `src/viz/algorithms/binary-search.ts` | modify | `rangeHighlight` supplies `startLabel`/`endLabel`; the parse message. |
| `src/viz/algorithms/linear-search.ts` | modify | The parse message (identical defect). |
| `src/viz/Visualizer.astro` | modify | Build-time extent + still re-emission; island extent at three `loadTrace`/mount sites; the composer gate. |
| `tests/unit/extent.test.ts` | **create** | `fitToExtent` + `traceExtent` behaviour. |
| `tests/unit/renderers/measure.test.ts` | **create** | Invariant: `measure(step)` equals the box `draw(step)` emits, for every renderer × every fixture. |
| `tests/unit/renderers/marker-vocabulary.test.ts` | **create** | Positive + negative range-label assertions, scoped by highlight kind. |
| `tests/unit/input-compose.test.ts` | **create** | `composeCustomInput`. |
| `tests/e2e/plan-a-frames.spec.ts` | **create** | Canvas size constant across a run; resting frames non-blank; the legibility floor under a frozen extent; custom input. |

---

## Task Ordering and Why

1. **Audit** — no product change; establishes the numbers every later task is scoped by.
2. **Contract + `fitToExtent`** — pure, no behaviour change; nothing calls it yet.
3. **`measure` on all 11 modules + anchors** — pure; the drift-guard test lands with it.
4. **Extent lifecycle wired** — the first task that moves pixels; re-seeds visual baselines.
5. **Resting frames** — re-seeds.
6. **Marker labels** — re-seeds visual + the one aria baseline.
7. **Legibility-floor regression test** — test only, no source change.
8. **Custom-input P0** — no pixels move.
9. **Spec + docs amendments** — records the contract change and the two deletions.

---

## Task 1: The audit script

**Files:**

- Create: `scripts/audit-frames.mjs`
- Modify: `package.json` (one script line)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing importable. Its **printed table** is pasted into the commit message and is the evidence Tasks 3–5 are scoped by.

**Context you need:** `src/viz/registry.ts` maps ids to lazy import thunks. Every algorithm exports `defaultInput()`, `parseInput(raw)` and `run(input)`. Every renderer module exports `renderStatic(step, opts)`. `scripts/build-og.mjs` is run as `node --experimental-transform-types scripts/build-og.mjs`, which is how a `.mjs` script imports this repo's `.ts` modules — use the same invocation.

The spec's §2A table lists 11 renderer ids and **omits `queue`**. This script must cover all 12 registered ids. `QueueRenderer`'s viewBox is keyed on capacity (`widthOf(cap)`), which is fixed for a run, so it is expected to join the constant list — but expected is not measured. Report what you find.

- [ ] **Step 1: Write the script**

```javascript
/**
 * Frame audit (Plan A §2) — measures, per registered lesson instrument:
 *
 *   A. how the drawing's viewBox varies across a FULL trace, and
 *   B. whether step 0's drawing fits inside the box step 0 computes for it.
 *
 * Exists so Plan A's scope is a measurement rather than an assumption: an
 * earlier draft assumed six broken resting frames and there are two. Run it
 * again after any renderer geometry change.
 *
 * Run: `npm run audit:frames`
 */
import { algorithms, renderers } from '../src/viz/registry.ts';

/**
 * Every `<Visualizer>` instrument this site ships, as (algorithm, renderer,
 * authored input) triples. Authored inputs are copied from the lesson MDX so
 * the audit measures the runs readers actually see; `null` means the lesson
 * uses `defaultInput()`.
 */
const INSTRUMENTS = [
  ['binary-search', 'array', '[1,3,5,7,9,11] target=7'],
  ['linear-search', 'array', '[8,3,5,9,1,7] target=9'],
  ['growth-rates', 'chart', null],
  ['array-operations', 'array', null],
  ['linked-list-operations', 'linkedList', null],
  ['stack-operations', 'stack', null],
  ['queue-operations', 'queue', null],
  ['hash-table-operations', 'hashTable', null],
  ['bst-operations', 'tree', null],
  ['heap-operations', 'heap', null],
  ['graph-representations', 'graph', null],
  ['bfs', 'graph', null],
  ['dfs', 'graph', null],
  ['recursion-callstack', 'callStack', null],
  ['bubble-sort', 'bars', null],
  ['insertion-sort', 'bars', null],
  ['selection-sort', 'bars', null],
  ['merge-sort', 'bars', null],
  ['quick-sort', 'bars', null],
  ['dp-fib-memoization', 'table', null],
  ['dp-fib-tabulation', 'table', null],
];

/** Pulls `0 0 W H` out of an emitted `<svg>` string. */
function viewBoxOf(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error(`No parseable viewBox in: ${svg.slice(0, 120)}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Every drawn x-coordinate that could sit outside the box: `<text x=…>` plus
 * its rendered run, and `<rect>`/`<line>` extents. Text is the case that
 * actually breaks (a label anchored `start` at x=50 inside a 40-unit box), so
 * it is measured with a conservative monospace advance rather than skipped.
 */
function textOverflow(svg, box) {
  const CHAR_W = 11; // 18px `--font-mono` at ~0.6em advance, rounded up
  let worst = null;
  for (const m of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1];
    const content = m[2];
    const x = Number(/\bx="([-\d.]+)"/.exec(attrs)?.[1] ?? NaN);
    if (Number.isNaN(x) || content.length === 0) continue;
    const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? 'start';
    const width = content.length * CHAR_W;
    const start =
      anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const end = start + width;
    if (start < 0 || end > box.w) {
      const overflow = Math.max(-start, end - box.w);
      if (!worst || overflow > worst.overflow) {
        worst = { content, start, end, overflow };
      }
    }
  }
  return worst;
}

const varying = [];
const constant = [];
const broken = [];

for (const [algoId, rendererId, input] of INSTRUMENTS) {
  const algo = await algorithms[algoId]();
  const rmod = await renderers[rendererId]();
  const parsed = input ? algo.parseInput(input) : algo.defaultInput();
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`${algoId}: authored input rejected — ${parsed.error}`);
  }
  const trace = algo.run(parsed);

  let minW = Infinity, maxW = 0, minH = Infinity, maxH = 0;
  for (const step of trace) {
    const { w, h } = viewBoxOf(rmod.renderStatic(step, { title: '', idBase: 'a' }));
    minW = Math.min(minW, w); maxW = Math.max(maxW, w);
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
  }
  const varies = minW !== maxW || minH !== maxH;
  const row = { algoId, rendererId, steps: trace.length, minW, maxW, minH, maxH };
  (varies ? varying : constant).push(row);

  const still = rmod.renderStatic(trace[0], { title: '', idBase: 'a' });
  const box = viewBoxOf(still);
  const bad = textOverflow(still, box);
  if (bad) broken.push({ algoId, rendererId, box, ...bad });
}

console.log(`\nA. VARYING extent (${varying.length} of ${INSTRUMENTS.length} instruments)`);
for (const r of varying) {
  console.log(
    `  ${r.rendererId.padEnd(11)} ${r.algoId.padEnd(24)} W ${r.minW}→${r.maxW}  H ${r.minH}→${r.maxH}  (${r.steps} steps)`,
  );
}
console.log(`\n   CONSTANT (${constant.length})`);
for (const r of constant) {
  console.log(`  ${r.rendererId.padEnd(11)} ${r.algoId.padEnd(24)} ${r.maxW}×${r.maxH}`);
}
console.log(`\nB. BROKEN resting frames (${broken.length})`);
for (const r of broken) {
  console.log(
    `  ${r.algoId}: viewBox 0 0 ${r.box.w} ${r.box.h} — "${r.content}" spans ${Math.round(r.start)}→${Math.round(r.end)} (overflow ${Math.round(r.overflow)})`,
  );
}
console.log('');
```

- [ ] **Step 2: Add the npm script**

In `package.json`, alongside the existing `"og"` entry:

```json
"audit:frames": "node --experimental-transform-types scripts/audit-frames.mjs"
```

- [ ] **Step 3: Run it**

Run: `npm run audit:frames`

Expected: three sections print. Section A should report **7 varying** (`array`/array-operations, `tree`/bst-operations, `heap`/heap-operations, `hashTable`, `callStack`, `stack`, `linkedList`) and the rest constant — including `queue`, which §2A's table omitted. Section B should report **exactly 2 broken**: `bst-operations` (`0 0 40 66`, "empty tree" spanning ~50→160) and `heap-operations` (`0 0 80 184`, "empty heap" spanning ~-15→95).

**If the counts differ from those, STOP and report the real numbers before continuing** — later tasks are scoped by this output, not by the prose above.

- [ ] **Step 4: Lint and format**

Run: `npm run lint && npm run format:check`
Expected: clean. (If Prettier rewrites the script, accept its formatting.)

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-frames.mjs package.json
git commit -m "chore(viz): add the frame audit that scopes Plan A

Measures, per registered instrument, how the viewBox varies across a full
trace and whether step 0's drawing fits its own box. Committed with its
output so the scope is reproducible rather than asserted.

<paste the script's printed output here>"
```

---

## Task 2: The contract and `fitToExtent`

**Files:**

- Modify: `src/viz/core/types.ts`
- Modify: `src/viz/renderers/shared.ts`
- Create: `tests/unit/extent.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `interface Extent { w: number; h: number }` (from `core/types`)
  - `RenderOpts.extent?: Extent`
  - `Renderer<TState>.setExtent(extent: Extent | undefined): void` — **required**, not optional
  - `RendererModule<TState>.measure(step: Step<TState>): Extent` — **required**
  - `interface Anchor { x: 'left' | 'center'; y: 'top' | 'bottom' }` (from `renderers/shared`)
  - `const TOP_LEFT: Anchor`
  - `fitToExtent(canvas: Canvas, extent: Extent | undefined, anchor?: Anchor): Canvas`

This task deliberately leaves the codebase **not compiling** at the type level for `RendererModule.measure` and `Renderer.setExtent` until Task 3 implements them on all 11 modules. Land Task 2 and Task 3 as one commit if you prefer green-at-every-commit; the steps below assume you run `npm run build` only at the end of Task 3. **`npm run test` must still pass at the end of Task 2** — Vitest does not type-check.

- [ ] **Step 1: Add the types**

In `src/viz/core/types.ts`, after the `Step`/`Trace` block and before `PredictQuestion`:

```typescript
/**
 * The drawing box for a WHOLE trace, in viewBox user units: the per-step
 * maximum of every box the renderer would compute for that trace.
 *
 * Exists because renderers size their viewBox from the CURRENT step, so a
 * structure that grows mid-trace (a tree gaining a level, a stack gaining a
 * slot) resized the canvas while the reader stepped — up to 1,049px on heaps,
 * moving the transport row under their thumb. Freezing one box per trace is the
 * fix; `Extent` is how that box travels from the caller to the renderer.
 */
export interface Extent {
  /** viewBox width in user units. */
  w: number;
  /** viewBox height in user units. */
  h: number;
}
```

In the same file, extend `RenderOpts`:

```typescript
  /**
   * The frozen box for the whole trace (see {@link Extent}). OPTIONAL: with it
   * omitted a renderer draws its natural per-step box, which is what the unit
   * tests and the dev gallery want. It can only ever WIDEN the drawing — a
   * stale or undersized extent is clamped, never allowed to clip.
   */
  extent?: Extent;
```

And extend `Renderer`:

```typescript
  /**
   * Replaces the extent used by every subsequent `render`.
   *
   * Required rather than optional, and separate from `mount`, because `mount`
   * runs exactly ONCE per island (`Visualizer.astro`) while `Player.loadTrace`
   * re-traces on every custom run. An extent that could only arrive at mount
   * would be frozen at the authored run's size, so the custom run — the case
   * that varies most — would draw against a stale box.
   */
  setExtent(extent: Extent | undefined): void;
```

And extend `RendererModule`:

```typescript
  /**
   * The NATURAL drawing box for `step` — geometry only, no markup built.
   *
   * Callers reduce this over a whole trace to get its {@link Extent}. It exists
   * as its own entry point because reading the box back out of `renderStatic`'s
   * emitted string costs 247ms for bubble sort at the permitted n = 30 (901
   * steps) on a fast desktop, and that reduction runs synchronously in the
   * custom-input submit handler; the geometry-only form costs 0.44ms.
   *
   * MUST agree with `draw`: each renderer computes its viewBox by calling its
   * own `measure`, so there is one source and no drift.
   * `tests/unit/renderers/measure.test.ts` asserts the agreement.
   */
  measure(step: Step<TState>): Extent;
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/extent.test.ts`:

```typescript
/**
 * `fitToExtent` — the pure post-processor that widens one step's natural canvas
 * to the whole trace's frozen box (Plan A §3). Pure `Canvas → Canvas`, which is
 * why it is testable here at all: the Vitest harness is `environment: 'node'`
 * with no DOM.
 */
import { describe, expect, it } from 'vitest';
import { fitToExtent, TOP_LEFT, type Anchor } from '../../src/viz/renderers/shared';

const canvas = (viewBox: string, inner = '<rect/>') => ({ viewBox, inner });

describe('fitToExtent', () => {
  it('returns the canvas untouched when there is no extent', () => {
    const c = canvas('0 0 40 66');
    expect(fitToExtent(c, undefined)).toEqual(c);
  });

  it('widens the viewBox to the extent and leaves a top-left drawing in place', () => {
    const out = fitToExtent(canvas('0 0 40 66'), { w: 380, h: 222 }, TOP_LEFT);
    expect(out.viewBox).toBe('0 0 380 222');
    expect(out.inner).toBe('<rect/>');
  });

  it('CLAMPS rather than shrinks: a stale extent never clips the drawing', () => {
    const out = fitToExtent(canvas('0 0 500 300'), { w: 380, h: 222 }, TOP_LEFT);
    expect(out.viewBox).toBe('0 0 500 300');
  });

  it('offsets a bottom-anchored drawing so its base stays put', () => {
    const anchor: Anchor = { x: 'left', y: 'bottom' };
    const out = fitToExtent(canvas('0 0 168 104'), { w: 168, h: 220 }, anchor);
    expect(out.viewBox).toBe('0 0 168 220');
    expect(out.inner).toBe('<g transform="translate(0 116)"><rect/></g>');
  });

  it('centres a centre-x drawing so its middle stays put', () => {
    const anchor: Anchor = { x: 'center', y: 'top' };
    const out = fitToExtent(canvas('0 0 80 184'), { w: 326, h: 184 }, anchor);
    expect(out.viewBox).toBe('0 0 326 184');
    expect(out.inner).toBe('<g transform="translate(123 0)"><rect/></g>');
  });

  it('adds no wrapper when the offset is zero', () => {
    const out = fitToExtent(canvas('0 0 168 220'), { w: 168, h: 220 }, {
      x: 'left',
      y: 'bottom',
    });
    expect(out.inner).toBe('<rect/>');
  });

  it('throws loudly on a viewBox it cannot reason about', () => {
    expect(() => fitToExtent(canvas('-10 0 40 66'), { w: 80, h: 80 })).toThrow(
      /unsupported viewBox/,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/extent.test.ts`
Expected: FAIL — `fitToExtent is not a function` / no such export.

- [ ] **Step 4: Implement `fitToExtent`**

In `src/viz/renderers/shared.ts`, change the import line to pull in `group` and `Extent`:

```typescript
import type {
  Extent,
  Highlight,
  Renderer,
  RenderOpts,
  Step,
} from '../core/types';
import { group, svgRoot, text } from '../core/svg';
```

Then, immediately after the `Canvas` interface and `Draw` type:

```typescript
/**
 * Where a drawing sits inside a frozen box larger than its natural one.
 *
 * Freezing the box does not freeze the drawing's POSITION, so each renderer
 * declares the edge that must not move. Most grow right and down into the
 * reserved space and want the default; the two stack-shaped renderers draw a
 * ground line under their lowest slot, which would slide down on every push
 * under a top anchor; the heap centres each tree level within its own content
 * width, so centring keeps the root still across a level gain.
 */
export interface Anchor {
  /** `left`: origin-aligned (default). `center`: centred horizontally. */
  x: 'left' | 'center';
  /** `top`: origin-aligned (default). `bottom`: base-aligned. */
  y: 'top' | 'bottom';
}

/** The default anchor: the drawing grows right and down into reserved space. */
export const TOP_LEFT: Anchor = { x: 'left', y: 'top' };

/**
 * The `0 0 W H` form every renderer emits. Anything else (a non-zero origin, a
 * negative dimension) means a renderer changed shape without this function
 * being taught about it, and is a build/test failure rather than a silent pass.
 */
const VIEW_BOX = /^0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/;

/**
 * Widens one step's natural canvas to the trace's frozen `extent`, offsetting
 * the drawing by `anchor` so the edge that matters stays put.
 *
 * Applied in exactly two places — `renderStaticSvg` and `createRenderer.render`
 * — so the build-time still and the hydrated drawing cannot disagree. Pure, so
 * the node-only Vitest harness can test it directly.
 *
 * @param canvas - What the renderer's own `draw` produced for this step.
 * @param extent - The whole trace's box; `undefined` means "draw naturally".
 * @param anchor - This renderer's declared anchor (defaults to {@link TOP_LEFT}).
 * @returns A canvas whose viewBox is the extent (never smaller than natural).
 */
export function fitToExtent(
  canvas: Canvas,
  extent: Extent | undefined,
  anchor: Anchor = TOP_LEFT,
): Canvas {
  if (!extent) return canvas;
  const parts = VIEW_BOX.exec(canvas.viewBox);
  if (!parts) {
    throw new Error(
      `fitToExtent: unsupported viewBox "${canvas.viewBox}" (expected "0 0 W H").`,
    );
  }
  const naturalW = Number(parts[1]);
  const naturalH = Number(parts[2]);
  // Clamp, never shrink: a stale extent may only widen the box, so a drawing
  // can never be clipped by a measurement that ran against a different trace.
  const w = Math.max(extent.w, naturalW);
  const h = Math.max(extent.h, naturalH);
  const dx = anchor.x === 'center' ? Math.round((w - naturalW) / 2) : 0;
  const dy = anchor.y === 'bottom' ? Math.round(h - naturalH) : 0;
  return {
    viewBox: `0 0 ${w} ${h}`,
    inner:
      dx === 0 && dy === 0
        ? canvas.inner
        : group(canvas.inner, { transform: `translate(${dx} ${dy})` }),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/extent.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/viz/core/types.ts src/viz/renderers/shared.ts tests/unit/extent.test.ts
git commit -m "feat(viz): add Extent to the renderer contract and a pure fitToExtent

Renderers size their viewBox from the current step, so the canvas resized
while the reader stepped. Extent is the whole trace's box; fitToExtent
widens one step's natural canvas to it and offsets by the renderer's
anchor. Pure Canvas -> Canvas, applied in both the still and the hydrated
path so the two cannot drift.

setExtent is required rather than optional because mount runs once per
island while loadTrace re-traces on every custom run."
```

---

## Task 3: `measure` on all 11 renderer modules, plus anchors

**Files:**

- Modify: `src/viz/renderers/shared.ts` (thread extent + anchor through `createRenderer` and `renderStaticSvg`)
- Modify: all 11 renderer modules (add `measure`; three add `ANCHOR`)
- Create: `tests/unit/renderers/measure.test.ts`

**Interfaces:**

- Consumes: `Extent`, `Anchor`, `TOP_LEFT`, `fitToExtent` (Task 2).
- Produces: `measure` on every `RendererModule`; `createRenderer(draw, anchor?)`; `renderStaticSvg(draw, step, opts, anchor?)`.

**The rule for every renderer:** its `draw` already computes a viewBox. Extract that computation into a module-level `measure(step): Extent` and have `draw` call it, so there is **one** source. Do not copy the formula.

- [ ] **Step 1: Write the failing drift-guard test**

Create `tests/unit/renderers/measure.test.ts`:

```typescript
/**
 * The one invariant that keeps `measure` honest: for every renderer and every
 * fixture, the box `measure(step)` reports MUST be the box `draw(step)` emits.
 *
 * `measure` exists as a second entry point purely for speed (247ms → 0.44ms on
 * the 901-step n=30 sort, Plan A §3), so the only way it can hurt is by
 * disagreeing with the drawing. This drives the same algorithm×renderer pairs
 * `marker-gate.test.ts` uses, so a new renderer is covered the moment it is
 * registered there.
 */
import { describe, expect, it } from 'vitest';
import type { RendererModule, Step } from '../../../src/viz/core/types';
import * as demos from '../../../src/viz/algorithms/demos';
import { binarySearch } from '../../../src/viz/algorithms/binary-search';
import { linearSearch } from '../../../src/viz/algorithms/linear-search';
import {
  arrayRenderer,
  barsRenderer,
} from '../../../src/viz/renderers/ArrayRenderer';
import { stackRenderer } from '../../../src/viz/renderers/StackRenderer';
import { callStackRenderer } from '../../../src/viz/renderers/CallStackRenderer';
import { queueRenderer } from '../../../src/viz/renderers/QueueRenderer';
import { linkedListRenderer } from '../../../src/viz/renderers/LinkedListRenderer';
import { chartRenderer } from '../../../src/viz/renderers/ChartRenderer';
import { treeRenderer } from '../../../src/viz/renderers/TreeRenderer';
import { heapRenderer } from '../../../src/viz/renderers/HeapRenderer';
import { graphRenderer } from '../../../src/viz/renderers/GraphRenderer';
import { hashTableRenderer } from '../../../src/viz/renderers/HashTableRenderer';
import { tableRenderer } from '../../../src/viz/renderers/TableRenderer';

type Pair = {
  name: string;
  trace: Step<unknown>[];
  renderer: RendererModule<unknown>;
};

const run = (algo: unknown, input?: string): Step<unknown>[] => {
  const a = algo as {
    run(i: unknown): Step<unknown>[];
    parseInput(r: string): unknown;
    defaultInput(): unknown;
  };
  return a.run(input ? a.parseInput(input) : a.defaultInput());
};

const pairs: Pair[] = [
  { name: 'array', trace: run(binarySearch, '[1,3,5,7,9,11] target=7'), renderer: arrayRenderer },
  { name: 'array/linear', trace: run(linearSearch, '[8,3,5,9,1,7] target=9'), renderer: arrayRenderer },
  { name: 'bars', trace: run(bubbleSort), renderer: barsRenderer },
  { name: 'stack', trace: run(demos.demoStack), renderer: stackRenderer },
  { name: 'callStack', trace: run(demos.demoCallStack), renderer: callStackRenderer },
  { name: 'queue', trace: run(demos.demoQueue), renderer: queueRenderer },
  { name: 'linkedList', trace: run(demos.demoLinkedList), renderer: linkedListRenderer },
  { name: 'chart', trace: run(demos.demoChart), renderer: chartRenderer },
  { name: 'tree', trace: run(demos.demoTree), renderer: treeRenderer },
  { name: 'heap', trace: run(demos.demoHeap), renderer: heapRenderer },
  { name: 'graph', trace: run(demos.demoGraph), renderer: graphRenderer },
  { name: 'hashTable', trace: run(demos.demoHashTable), renderer: hashTableRenderer },
  { name: 'table', trace: run(demos.demoTable), renderer: tableRenderer },
];

describe('RendererModule.measure agrees with the drawing', () => {
  for (const { name, trace, renderer } of pairs) {
    it(`${name}: measure(step) is the viewBox draw(step) emits, every step`, () => {
      expect(trace.length).toBeGreaterThan(0);
      for (const step of trace) {
        const svg = renderer.renderStatic(step, { title: '', idBase: 'm' });
        const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
        expect(m, `no parseable viewBox for ${name}`).not.toBeNull();
        expect(renderer.measure(step)).toEqual({
          w: Number(m![1]),
          h: Number(m![2]),
        });
      }
    });
  }
});
```

**Note:** the demo fixture export names above are guesses at `src/viz/algorithms/demos.ts`'s API. Open that file and use its real export names — `marker-gate.test.ts` already imports them, so copy that file's import list and pair table verbatim rather than retyping it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/renderers/measure.test.ts`
Expected: FAIL — `renderer.measure is not a function`.

- [ ] **Step 3: Thread extent and anchor through `shared.ts`**

In `src/viz/renderers/shared.ts`, replace the body of `renderStaticSvg`:

```typescript
export function renderStaticSvg<TState>(
  draw: Draw<TState>,
  step: Step<TState>,
  opts: RenderOpts,
  anchor: Anchor = TOP_LEFT,
): string {
  const { viewBox, inner } = fitToExtent(draw(step), opts.extent, anchor);
  const idBase = opts.idBase ?? 'viz';
  return svgRoot(
    {
      viewBox,
      title: opts.title ?? '',
      desc: step.explanation,
      titleId: `${idBase}-t`,
      descId: `${idBase}-d`,
    },
    inner,
  );
}
```

And `createRenderer`:

```typescript
export function createRenderer<TState>(
  draw: Draw<TState>,
  anchor: Anchor = TOP_LEFT,
): Renderer<TState> {
  const uid = `r${(domInstance += 1)}`;
  let svg: SVGSVGElement | null = null;
  let content: SVGGElement | null = null;
  let descEl: SVGDescElement | null = null;
  let extent: Extent | undefined;

  return {
    mount(container: HTMLElement, opts: RenderOpts = {}): void {
      extent = opts.extent;
      const el = document.createElementNS(SVG_NS, 'svg');
      // …the rest of mount() is UNCHANGED — do not retype it, only add the
      // `extent = opts.extent;` line above.
    },

    setExtent(next: Extent | undefined): void {
      extent = next;
    },

    render(step: Step<TState>): void {
      if (!svg || !content) return;
      const { viewBox, inner } = fitToExtent(draw(step), extent, anchor);
      svg.setAttribute('viewBox', viewBox);
      // Single atomic redraw of the drawing group (SVG-namespaced innerHTML).
      content.innerHTML = inner;
      if (descEl) descEl.textContent = step.explanation;
    },

    destroy(): void {
      svg?.remove();
      svg = null;
      content = null;
      descEl = null;
      extent = undefined;
    },
  };
}
```

- [ ] **Step 4: Extract `measure` in each `createRenderer`-based renderer**

Apply this shape to **`TreeRenderer`, `HeapRenderer`, `StackRenderer`, `CallStackRenderer`, `HashTableRenderer`, `LinkedListRenderer`, `QueueRenderer`, `GraphRenderer`, `TableRenderer`, `ChartRenderer`**. Worked example — `StackRenderer.ts`:

```typescript
/**
 * The natural box for one step. Extracted from `draw` (which now calls it) so
 * a caller can reduce a trace to its extent without building any markup.
 */
const measure = (step: Step<StackState>): Extent => ({
  w: width,
  h: heightOf(step.state.items.length),
});

/**
 * Bottom-anchored: a physical stack sits on the ground, and `draw` puts that
 * ground line under slot 0. Under a top anchor a frozen box would slide the
 * ground down on every push.
 */
const ANCHOR: Anchor = { x: 'left', y: 'bottom' };
```

and at the end of `draw`, replace the literal:

```typescript
  const { w, h } = measure(step);
  return {
    viewBox: `0 0 ${w} ${h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
```

and the module export:

```typescript
export const stackRenderer: RendererModule<StackState> = {
  create: () => createRenderer(draw, ANCHOR),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts, ANCHOR),
  measure,
};
```

Per-renderer specifics:

| renderer | `measure` returns | `ANCHOR` |
|---|---|---|
| `Stack` | `{ w: width, h: heightOf(n) }` | `{ x: 'left', y: 'bottom' }` |
| `CallStack` | `{ w: width, h: heightOf(n) }` | `{ x: 'left', y: 'bottom' }` |
| `Heap` | the `width`/`height` its `draw` computes — hoist that arithmetic (`maxDepth`, `treeWidth`, `arrayWidth`, `contentWidth`, `arrayTop`) into `measure` and have `draw` call it for both the box *and* the layout constants it still needs | `{ x: 'center', y: 'top' }` |
| `Tree` | `{ w: maxX + R + PAD, h: maxY + R + PAD }` from `layout(state)` | default (omit) |
| `HashTable` | `{ w: widthOf(maxChain), h: heightOf(cap) }` | default |
| `LinkedList` | `{ w: widthOf(n), h: HEIGHT }` | default |
| `Queue` | `{ w: widthOf(cap), h: HEIGHT }` | default |
| `Graph`, `Table`, `Chart` | whatever their `draw` computes | default |

**`HeapRenderer` is the one that needs care** — its width and the `arrayTop`/`contentWidth` values are interdependent. Extract a single `geometry(step)` helper returning every derived constant, have `measure` return `{ w, h }` from it and `draw` destructure the rest from the same call. Do not compute anything twice.

For a renderer whose `draw` builds the box from values only available mid-draw, hoist those values above the drawing loops — never duplicate the formula.

- [ ] **Step 5: Give ArrayRenderer its `measure`**

`ArrayRenderer` implements neither `Draw` nor `createRenderer`, so it needs its own. In `src/viz/renderers/ArrayRenderer.ts`, after `viewBoxOf`:

```typescript
/** Natural box for a step — the same numbers `viewBoxOf` renders (§3). */
const measure = (step: Step<ArrayWindowState>): Extent => ({
  w: viewWidth(step.state.array.length),
  h: HEIGHT,
});
```

and add `measure,` to both `arrayRenderer` and `barsRenderer`. Import `Extent` from `../core/types`. (Its extent *plumbing* lands in Task 4; this step only adds the measurement.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/renderers/measure.test.ts`
Expected: PASS — 12 pairs, every step agreeing.

- [ ] **Step 7: Full check**

Run: `npm run build && npm run lint && npm run format:check && npm run test`
Expected: all clean. `astro check` now type-checks the new required members, so any renderer missing `measure` or `setExtent` fails here.

- [ ] **Step 8: Commit**

```bash
git add src/viz tests/unit/renderers/measure.test.ts
git commit -m "feat(viz): give every renderer a geometry-only measure() and an anchor

Reading a trace's extent back out of renderStatic costs 247ms for bubble
sort at n=30 (901 steps) on a fast desktop, run synchronously in the
custom-input handler; measure() costs 0.44ms. Each renderer extracts the
viewBox computation its draw already performed, so there is one source
and a unit test asserts the two agree on every fixture step.

Stack and call stack anchor bottom (their ground line must not slide);
heap anchors centre-x (its levels are already centred on content width)."
```

---

## Task 4: Wire the extent lifecycle

**Files:**

- Create: `src/viz/core/extent.ts`
- Create: `tests/unit/extent-trace.test.ts` (or extend `tests/unit/extent.test.ts` — either is fine; keep one file per exported module if you split)
- Modify: `src/viz/renderers/ArrayRenderer.ts` (its own extent path)
- Modify: `src/viz/Visualizer.astro` (build-time extent + still re-emission; island `setExtent` at three sites)

**Interfaces:**

- Consumes: `Extent`, `RendererModule.measure`, `Renderer.setExtent`, `fitToExtent`.
- Produces: `traceExtent(measure, trace): Extent` from `src/viz/core/extent.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/extent-trace.test.ts`:

```typescript
/**
 * `traceExtent` — the max-reduction that turns a whole trace into one box.
 * Pure and injected-`measure`, so it needs no renderer here.
 */
import { describe, expect, it } from 'vitest';
import { traceExtent } from '../../src/viz/core/extent';
import type { Extent, Step } from '../../src/viz/core/types';

const steps = (...boxes: Extent[]): Step<Extent>[] =>
  boxes.map((b) => ({ state: b, explanation: 'x' }));

describe('traceExtent', () => {
  it('takes the max of each axis independently', () => {
    const trace = steps({ w: 40, h: 200 }, { w: 380, h: 66 }, { w: 100, h: 100 });
    expect(traceExtent((s) => s.state, trace)).toEqual({ w: 380, h: 200 });
  });

  it('returns the single box for a one-step trace', () => {
    expect(traceExtent((s) => s.state, steps({ w: 12, h: 34 }))).toEqual({
      w: 12,
      h: 34,
    });
  });

  it('throws on an empty trace rather than inventing a zero box', () => {
    expect(() => traceExtent((s) => s.state, [])).toThrow(/empty trace/);
  });

  it('throws on a non-finite or non-positive measurement', () => {
    expect(() =>
      traceExtent(() => ({ w: Number.NaN, h: 10 }), steps({ w: 1, h: 1 })),
    ).toThrow(/measurement/);
    expect(() =>
      traceExtent(() => ({ w: 0, h: 10 }), steps({ w: 1, h: 1 })),
    ).toThrow(/measurement/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/extent-trace.test.ts`
Expected: FAIL — cannot resolve `src/viz/core/extent`.

- [ ] **Step 3: Implement `traceExtent`**

Create `src/viz/core/extent.ts`:

```typescript
/**
 * Trace → one drawing box (site spec §11.2, Plan A §3).
 *
 * Imported by BOTH the Visualizer's Astro frontmatter (build time) and its
 * island script (every custom run), so it lives in `core/` and imports nothing
 * but types — a renderer-specific home would drag a renderer into every page.
 * Pure and `measure`-injected, so the node-only Vitest harness tests it whole.
 */
import type { Extent, Step, Trace } from './types';

/**
 * Reduces a trace to the box that contains every one of its steps.
 *
 * @param measure - The renderer module's `measure` (geometry only, no markup).
 * @param trace - The precomputed trace the Player will index into.
 * @returns The per-axis maximum across every step.
 * @throws If the trace is empty, or a measurement is not a positive finite
 *   number — either means a renderer changed shape without this being taught
 *   about it, and a silently wrong box would show as a clipped drawing on a
 *   page nobody is looking at. Fail the build instead.
 */
export function traceExtent<TState>(
  measure: (step: Step<TState>) => Extent,
  trace: Trace<TState>,
): Extent {
  if (trace.length === 0) {
    throw new Error('traceExtent: empty trace has no drawing box.');
  }
  let w = 0;
  let h = 0;
  for (const step of trace) {
    const box = measure(step);
    if (
      !Number.isFinite(box.w) ||
      !Number.isFinite(box.h) ||
      box.w <= 0 ||
      box.h <= 0
    ) {
      throw new Error(
        `traceExtent: bad measurement { w: ${box.w}, h: ${box.h} } — expected positive finite numbers.`,
      );
    }
    w = Math.max(w, box.w);
    h = Math.max(h, box.h);
  }
  return { w, h };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/extent-trace.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Give ArrayRenderer its extent path**

Three edits in `src/viz/renderers/ArrayRenderer.ts`. It only ever varies in **width** and its anchor is the default top-left, so no transform is needed — the viewBox alone carries it.

(a) `renderArrayStatic` honours `opts.extent`:

```typescript
function renderArrayStatic(
  step: Step<ArrayWindowState>,
  opts: RenderOpts,
  variant: Variant,
): string {
  const natural = measure(step);
  // Clamp, never shrink — the same rule `fitToExtent` applies for the
  // createRenderer family. Top-left anchored, so no transform is needed.
  const w = Math.max(opts.extent?.w ?? 0, natural.w);
  const h = Math.max(opts.extent?.h ?? 0, natural.h);
  const idBase = opts.idBase ?? 'viz';
  return svgRoot(
    {
      viewBox: `0 0 ${w} ${h}`,
      title: opts.title ?? '',
      desc: step.explanation,
      titleId: `${idBase}-t`,
      descId: `${idBase}-d`,
    },
    cellsMarkup(step, variant) +
      group(markersMarkup(step), { class: 'viz-markers' }),
  );
}
```

(b) `ArrayDomRenderer` stores the extent, gains `setExtent`, and **writes the viewBox on every render** rather than only when the cell count changes — a frozen box must survive a same-length redraw after `setExtent`:

```typescript
class ArrayDomRenderer implements Renderer<ArrayWindowState> {
  // …existing fields…
  private extent: Extent | undefined;

  mount(container: HTMLElement, opts: RenderOpts = {}): void {
    this.extent = opts.extent;
    // …the rest of mount() is UNCHANGED…
  }

  setExtent(next: Extent | undefined): void {
    this.extent = next;
  }

  render(step: Step<ArrayWindowState>): void {
    if (!this.svg || !this.cellsGroup || !this.markersGroup) return;
    const { array } = step.state;

    // The viewBox is written EVERY step, not only on a length change: after
    // setExtent the box must change while the cell count does not.
    const natural = measure(step);
    this.svg.setAttribute(
      'viewBox',
      `0 0 ${Math.max(this.extent?.w ?? 0, natural.w)} ${Math.max(this.extent?.h ?? 0, natural.h)}`,
    );

    if (this.builtLength !== array.length) {
      this.buildCells(array);
      this.builtLength = array.length;
    } else {
      this.updateCells(array);
    }
    // …the rest of render() is UNCHANGED…
  }

  destroy(): void {
    // …existing body…
    this.extent = undefined;
  }
```

(c) Delete the now-duplicated viewBox write from `buildCells`:

```typescript
  private buildCells(array: number[]): void {
    const groupEl = this.cellsGroup!;
    groupEl.replaceChildren();
    // (the `this.svg!.setAttribute('viewBox', …)` line moves to render())
    groupEl.innerHTML = array
      .map((v, i) =>
        cellMarkup(i, v, 'viz-cell', this.variant, scaleMax(array)),
      )
      .join('');
  }
```

- [ ] **Step 6: Wire the build-time extent in `Visualizer.astro`**

In the frontmatter, replace the `still` line (currently `const still = rmod.renderStatic(step0, { title: label, idBase: uid });`):

```typescript
// One box for the whole trace (Plan A §3). Renderers size their viewBox from
// the CURRENT step, so a growing structure resized the canvas mid-trace and
// moved the transport row under the reader's thumb. The still is re-emitted
// with the SAME extent the island will use, or the JS-off frame would keep
// step 0's small box and the drawing would jump once, at hydration.
const extent = traceExtent(rmod.measure, trace);
const still = rmod.renderStatic(step0, { title: label, idBase: uid, extent });
```

Add the import beside the other `core` imports in the frontmatter:

```typescript
import { traceExtent } from './core/extent';
```

Emit the extent for the island to reuse — on the same element that already carries `data-input`, alongside it:

```astro
  data-extent={`${extent.w} ${extent.h}`}
```

- [ ] **Step 7: Wire the island's three sites**

In the island script, add a parser beside the other `dataset` reads in `setupViz`:

```typescript
    /**
     * The authored run's extent, measured by the BUILD (so the first hydrated
     * draw matches the still exactly, byte-for-byte in the viewBox). Custom
     * runs recompute it — see `applyTrace` below.
     */
    const authoredExtent = ((): Extent | undefined => {
      const parts = (root.dataset['extent'] ?? '').split(' ');
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
        ? { w, h }
        : undefined;
    })();
```

At `mount`, pass it (the line currently reads `renderer.mount(canvas!, { title });`):

```typescript
      renderer.mount(canvas!, { title, extent: authoredExtent });
```

Then add one helper next to the submit handler and route **both** `loadTrace` call sites through it — the custom-input submit handler **and** the "Restore example" handler. Missing either leaves that path drawing against a stale box:

```typescript
    /**
     * Swaps in a new trace with its OWN frozen box. Both callers (custom run
     * and "Restore example") must go through here: `mount` runs once, so
     * `setExtent` is the only channel that can update the box afterwards.
     * Order matters — the extent must be in place before the redraw
     * `loadTrace` triggers, and the canvas is re-measured after it.
     */
    function applyTrace(next: Trace<unknown>): void {
      if (!player || !renderer || !rendererModule) return;
      renderer.setExtent(traceExtent(rendererModule.measure, next));
      player.loadTrace(next);
      syncTraceBounds();
      measureCanvas();
    }
```

This needs the resolved `RendererModule` in the closure — `mount()` currently holds `rmod` as a local. Hoist it to a `let rendererModule: RendererModule<unknown> | null = null;` beside `renderer`/`player`, assign it where `rmod` is resolved, and null it in teardown. Then both handlers reduce to:

```typescript
          input = parsed;
          currentTrace = algo.run(parsed);
          applyTrace(currentTrace);
```

(the submit handler keeps its trailing `announceRun(raw);`).

- [ ] **Step 8: Write the failing e2e test**

Create `tests/e2e/plan-a-frames.spec.ts`:

```typescript
/**
 * Plan A — the drawing's P0s, asserted against the running site.
 *
 * These belong here rather than in Vitest because every one of them is a
 * question about layout or the DOM, and the unit harness is `environment:
 * 'node'` with no DOM.
 */
import { expect, test } from '@playwright/test';

/** Steps a visualizer to the end, collecting the canvas's rendered box. */
async function boxesAcrossRun(page: import('@playwright/test').Page, root: string) {
  const canvas = page.locator(`${root} [data-viz-canvas]`);
  const forward = page.locator(`${root} [data-viz-forward]`);
  const boxes: { w: number; h: number }[] = [];
  for (let i = 0; i < 40; i += 1) {
    const b = await canvas.boundingBox();
    if (b) boxes.push({ w: Math.round(b.width), h: Math.round(b.height) });
    if (await forward.isDisabled()) break;
    await forward.click();
  }
  return boxes;
}

test.describe('one viewBox per trace', () => {
  test('the BST canvas does not resize while stepping', async ({ page }) => {
    await page.goto('/learn/trees-bst');
    const root = '[data-viz-root]';
    await page.locator(root).first().waitFor({ state: 'attached' });
    await expect(page.locator(`${root}[data-viz-ready="true"]`).first()).toBeVisible();
    const boxes = await boxesAcrossRun(page, `${root} >> nth=0`);
    expect(boxes.length).toBeGreaterThan(3);
    const heights = new Set(boxes.map((b) => b.h));
    expect(heights.size, `canvas height varied: ${[...heights].join(', ')}`).toBe(1);
  });
});
```

**Before writing more of this file, read `tests/e2e/m7-player-v2.spec.ts`** and reuse its selectors and its ready-state helper verbatim — the attribute names above (`data-viz-root`, `data-viz-ready`) are read from `Visualizer.astro` but that suite already has working, maintained helpers for waiting on a hydrated island. Do not invent a second convention.

- [ ] **Step 9: Run the e2e test to verify it fails**

Run: `npx playwright test tests/e2e/plan-a-frames.spec.ts`
Expected: FAIL — heights vary (the BST grows from 66 to 222 viewBox units across its run).

Then apply Steps 5–7 if you have not already, and re-run.
Expected: PASS.

- [ ] **Step 10: Re-seed the visual baselines**

Run: `npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots`

Then **look at the diff**: `git diff --stat tests/e2e/baseline-visual.spec.ts-snapshots`. Frames that grew are expected. A frame that went blank or lost its drawing is a bug in this task, not a baseline to accept.

- [ ] **Step 11: Full check**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`
Expected: all clean.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(viz): freeze one drawing box per trace

The canvas resized while the reader stepped — 1,049px on heaps, 825px on
trees, 535px on stacks — moving the transport row under their thumb.
traceExtent reduces a whole trace to one box; the build re-emits the
still with it so the JS-off frame matches, and the island re-applies it
through setExtent on both loadTrace paths (custom run and restore).

Re-seeds the visual baselines: frames that used to grow now open at
their final size."
```

---

## Task 5: Resting frames that fit their own box

**Files:**

- Modify: `src/viz/renderers/shared.ts` (`nullLabelWidth`)
- Modify: `src/viz/renderers/TreeRenderer.ts`, `src/viz/renderers/HeapRenderer.ts`
- Modify: `tests/unit/renderers/tree.test.ts`, `tests/unit/renderers/heap.test.ts`

**Interfaces:**

- Consumes: `measure` (Task 3).
- Produces: `nullLabelWidth(label: string): number` from `renderers/shared`.

**The defect (measured by Task 1):** `TreeRenderer` draws "empty tree" at `x = PAD + 40 = 50` with the default `text-anchor: start` while computing the empty viewBox as `0 0 40 66` — the label is entirely outside the box, so the frame renders blank. `HeapRenderer` centres a ~110-unit label inside an 80-unit box, so it clips to "mpty hea". Because the still is `renderStatic(trace[0])` by construction, this is what JS-off readers and printed pages get permanently.

**Only these two renderers.** `stack-operations`, `recursion-callstack`, `graph-representations`, `linked-list-operations`, `queue-operations`, `hash-table-operations` and both DP lessons already fit and **must not be touched**.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/renderers/tree.test.ts`:

```typescript
  it('draws its resting label INSIDE its own viewBox', () => {
    const step: Step<TreeState> = {
      state: { nodes: [], root: null },
      explanation: 'Ready. The tree is empty.',
    };
    const svg = treeRenderer.renderStatic(step, OPTS);
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
    const width = Number(box[1]);
    // The label is centred, so it fits iff the box is at least as wide as it.
    expect(svg).toContain('empty tree');
    expect(svg).toContain('text-anchor="middle"');
    expect(width).toBeGreaterThanOrEqual(nullLabelWidth('empty tree'));
  });
```

and the mirror in `tests/unit/renderers/heap.test.ts` with `'empty heap'` and `heapRenderer`. Import `nullLabelWidth` from `../../../src/viz/renderers/shared` in both, and match each file's existing `TreeState`/`HeapState` empty-state shape — read the file's other fixtures rather than assuming the field names above.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/renderers/tree.test.ts tests/unit/renderers/heap.test.ts`
Expected: FAIL — tree's width is 40 against a required ~110; heap's is 80.

- [ ] **Step 3: Add the shared helper**

In `src/viz/renderers/shared.ts`, beside the marker glyphs:

```typescript
/**
 * Conservative rendered width of a `.viz-null` resting label, in viewBox units.
 *
 * `.viz-null` is 18px `--font-mono`; a monospace advance is ~0.6em, so 11 units
 * per character rounds up. Exists because two renderers computed an empty-state
 * viewBox from an empty STRUCTURE and then drew a label into it — "empty tree"
 * is ~110 units wide inside a 40-unit box, so the frame rendered blank for
 * every JS-off reader and every printed page.
 */
export const nullLabelWidth = (label: string): number => label.length * 11;
```

- [ ] **Step 4: Fix `TreeRenderer`**

`maxX`/`maxY` are already computed near the top of `draw` (the loop over `pos.values()`). Compute the box there, and use it for the label:

```typescript
  // The resting frame must contain its own label (Plan A §4): an empty tree's
  // natural box is 40 units wide and "empty tree" is ~110, so the label used to
  // render entirely outside it and the still read as blank.
  const emptyW = state.root === null ? nullLabelWidth('empty tree') + PAD * 2 : 0;
  const boxW = Math.max(maxX + R + PAD, emptyW);
```

Then the empty-state branch becomes:

```typescript
  if (state.root === null) {
    structure += text('empty tree', {
      class: 'viz-null',
      x: boxW / 2,
      y: PAD + TOP + R,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
  }
```

and `measure` (Task 3) must return the **same** `boxW` — extract the two lines above into `measure` and have `draw` call it, exactly as Task 3 requires. Import `nullLabelWidth` from `./shared`.

- [ ] **Step 5: Fix `HeapRenderer`**

Its label is already `text-anchor: middle` at `x: width / 2`, so only the width needs to grow. Where `width` is computed:

```typescript
  // Same rule as TreeRenderer: the resting label must fit its own box, or the
  // still clips it to "mpty hea".
  const width = Math.max(
    PAD * 2 + contentWidth,
    n === 0 ? nullLabelWidth('empty heap') + PAD * 2 : 0,
  );
```

Keep this inside the shared `geometry`/`measure` helper from Task 3 so `draw` and `measure` cannot disagree.

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run tests/unit/renderers/`
Expected: PASS, including `measure.test.ts` (the drift guard proves the new width reached `measure` too).

- [ ] **Step 7: Re-seed baselines and check the two frames by eye**

Run: `npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots`

Then open the `trees-bst` and `heaps-priority-queues` light-mode PNGs and confirm the resting frame now reads "empty tree" / "empty heap" instead of blank or clipped. **This is the one step in the plan that requires looking at an image** — the assertion is geometric but the defect was visual.

- [ ] **Step 8: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`

```bash
git add -A
git commit -m "fix(viz): draw resting labels inside their own viewBox

trees-bst shipped a blank frame and heaps a clipped 'mpty hea' to every
JS-off reader and every printed page, because both computed the empty
viewBox from an empty structure and then drew a label wider than it.
Both now size the empty box from the label. Two renderers, measured —
the other six resting frames already fit and are untouched."
```

---

## Task 6: Marker labels

**Files:**

- Modify: `src/viz/renderers/shared.ts` (`metaRangeLabels`)
- Modify: `src/viz/renderers/ArrayRenderer.ts` (the `range` branch, and fold the inline `active`/`pointer` meta read into `metaLabel`)
- Modify: `src/viz/algorithms/binary-search.ts` (`rangeHighlight` supplies its labels)
- Modify: `tests/unit/renderers/array.test.ts`
- Create: `tests/unit/renderers/marker-vocabulary.test.ts`

**Interfaces:**

- Consumes: `metaLabel` (existing).
- Produces: `metaRangeLabels(h: Highlight): { start: string | null; end: string | null }`.

**The defect:** `ArrayRenderer`'s `range` branch hardcodes `lo` and `hi` for *any* `range` highlight, and the registry maps both `array` and `bars` to it. **Eight algorithms emit a `range` highlight** — `binary-search`, `linear-search`, `array-operations` and the five sorts. Exactly one of them wants `lo`/`hi`. Linear search prints them two paragraphs after its own prose says *"There is no `lo`, `hi`, or `mid`"*; `array-operations` prints them on all 13 steps of the arrays lesson.

**Critical — do not over-apply.** Only the `lo`/`hi` **text** becomes meta-driven. The **range underbar** (`viz-range-bar`) is the WCAG non-colour cue for the `range` kind and must still be drawn for **every** range highlight; `tests/unit/renderers/marker-gate.test.ts` asserts it per kind, and stripping it would fail both that gate and design §3.2. Likewise `GraphRenderer`'s `at`, `array-operations`' authored `read`/`shift` and `insertion-sort`'s `key` are authored labels on *other* kinds and are untouched.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderers/marker-vocabulary.test.ts`:

```typescript
/**
 * A renderer may not invent a vocabulary the lesson disowns.
 *
 * ArrayRenderer hardcoded "lo"/"hi" for every `range` highlight, so linear
 * search printed a search-window vocabulary two paragraphs after its prose says
 * "There is no lo, hi, or mid", and the arrays lesson printed it on all 13
 * steps. Scoped by highlight KIND rather than by algorithm: an exemption per
 * algorithm would have left array-operations the one lesson still printing the
 * wrong labels and the one lesson the test never looked at.
 */
import { describe, expect, it } from 'vitest';
import type { Algorithm, Step } from '../../../src/viz/core/types';
import { binarySearch } from '../../../src/viz/algorithms/binary-search';
import { linearSearch } from '../../../src/viz/algorithms/linear-search';
import { arrayOperations } from '../../../src/viz/algorithms/array-operations';
import { bubbleSort } from '../../../src/viz/algorithms/bubble-sort';
import { insertionSort } from '../../../src/viz/algorithms/insertion-sort';
import { selectionSort } from '../../../src/viz/algorithms/selection-sort';
import { mergeSort } from '../../../src/viz/algorithms/merge-sort';
import { quickSort } from '../../../src/viz/algorithms/quick-sort';
import {
  arrayRenderer,
  barsRenderer,
} from '../../../src/viz/renderers/ArrayRenderer';

const OPTS = { title: 't', idBase: 'v' };

/** Every `<text class="viz-marker">…</text>` body in an emitted SVG. */
const markerTexts = (svg: string): string[] =>
  [...svg.matchAll(/<text[^>]*class="viz-marker"[^>]*>([^<]*)<\/text>/g)].map(
    (m) => m[1]!,
  );

const trace = (algo: unknown, input?: string): Step<unknown>[] => {
  const a = algo as Algorithm<unknown, unknown>;
  return a.run(input ? (a.parseInput(input) as unknown) : a.defaultInput());
};

describe('range end-labels come from the algorithm, never the renderer', () => {
  it('POSITIVE: binary search still shows lo and hi, because it supplies them', () => {
    const steps = trace(binarySearch, '[1,3,5,7,9,11] target=7');
    const labels = steps.flatMap((s) =>
      markerTexts(arrayRenderer.renderStatic(s as never, OPTS)),
    );
    expect(labels).toContain('lo');
    expect(labels).toContain('hi');
  });

  const silent: [string, unknown, typeof arrayRenderer, string | undefined][] = [
    ['linear-search', linearSearch, arrayRenderer, '[8,3,5,9,1,7] target=9'],
    ['array-operations', arrayOperations, arrayRenderer, undefined],
    ['bubble-sort', bubbleSort, barsRenderer, undefined],
    ['insertion-sort', insertionSort, barsRenderer, undefined],
    ['selection-sort', selectionSort, barsRenderer, undefined],
    ['merge-sort', mergeSort, barsRenderer, undefined],
    ['quick-sort', quickSort, barsRenderer, undefined],
  ];

  for (const [name, algo, renderer, input] of silent) {
    it(`NEGATIVE: ${name} prints no range end-label`, () => {
      const steps = trace(algo, input);
      const labels = steps.flatMap((s) =>
        markerTexts(renderer.renderStatic(s as never, OPTS)),
      );
      expect(labels).toEqual([]);
    });
  }

  it('the range UNDERBAR survives — it is the non-colour cue for the kind', () => {
    const steps = trace(bubbleSort);
    const withRange = steps.find((s) =>
      (s.highlights ?? []).some((h) => h.kind === 'range'),
    );
    expect(withRange).toBeDefined();
    expect(barsRenderer.renderStatic(withRange as never, OPTS)).toContain(
      'viz-range-bar',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/renderers/marker-vocabulary.test.ts`
Expected: FAIL — every NEGATIVE case reports `['lo', 'hi']`.

- [ ] **Step 3: Add `metaRangeLabels`**

In `src/viz/renderers/shared.ts`, beside `metaLabel`:

```typescript
/**
 * The two END labels for a `range` highlight, read from `meta`.
 *
 * `metaLabel` reads `meta.label` and returns ONE string, but a range has two
 * ends. That is the meta contract: `meta.label` for a single-target marker,
 * `meta.startLabel`/`meta.endLabel` for a range.
 *
 * Deliberately NO fallback. A renderer that invents an end label is inventing
 * vocabulary for a lesson it knows nothing about — which is how five sorting
 * algorithms and linear search came to print a search window.
 */
export const metaRangeLabels = (
  h: Highlight,
): { start: string | null; end: string | null } => ({
  start: typeof h.meta?.['startLabel'] === 'string' ? h.meta['startLabel'] : null,
  end: typeof h.meta?.['endLabel'] === 'string' ? h.meta['endLabel'] : null,
});
```

- [ ] **Step 4: Route ArrayRenderer's range branch through it**

In `markersMarkup`, the range block becomes (the `line(...)` underbar is **unchanged** — only the two `text(...)` calls are gated):

```typescript
  // range → underbar bracket (always: it is the non-colour cue for the kind)
  // plus END LABELS only where the algorithm supplied them.
  const ranges = highlights.filter((h) => h.kind === 'range');
  const rangeIds = ranges.flatMap((h) => h.ids).map(idIndex);
  if (rangeIds.length > 0) {
    const lo = Math.min(...rangeIds);
    const hi = Math.max(...rangeIds);
    out += line({
      class: 'viz-range-bar',
      x1: cellX(lo),
      x2: cellX(hi) + CELL,
      y1: BRACKET_Y,
      y2: BRACKET_Y,
    });
    const { start, end } = metaRangeLabels(ranges[0]!);
    if (start !== null) {
      out += text(start, {
        class: 'viz-marker',
        x: cellCenterX(lo),
        y: MARKER_Y,
        'text-anchor': 'middle',
      });
    }
    if (end !== null && hi !== lo) {
      out += text(end, {
        class: 'viz-marker',
        x: cellCenterX(hi),
        y: MARKER_Y,
        'text-anchor': 'middle',
      });
    }
  }
```

In the same function, fold the inline `active`/`pointer` meta read into the shared helper:

```typescript
      const label =
        h.kind === 'active' ? metaLabel(h, 'mid') : metaLabel(h, 'p');
```

Import `metaLabel` and `metaRangeLabels` from `./shared`.

- [ ] **Step 5: Give binary search its labels**

In `src/viz/algorithms/binary-search.ts`, the single `rangeHighlight` helper:

```typescript
/**
 * Builds `range` highlights over the inclusive window `lo..hi` (empty when
 * lo > hi). The end labels travel WITH the highlight: the renderer draws seven
 * other algorithms' ranges and must not name this one's window for them.
 */
function rangeHighlight(lo: number, hi: number): Highlight {
  const ids: string[] = [];
  for (let i = lo; i <= hi; i += 1) ids.push(cellId(i));
  return { kind: 'range', ids, meta: { startLabel: 'lo', endLabel: 'hi' } };
}
```

- [ ] **Step 6: Re-pin the array renderer fixture**

`tests/unit/renderers/array.test.ts` asserts `expect(svg).toContain('>lo<')` on a hand-built fixture with no meta — that fixture is now correctly silent. Add the meta to the fixture so the assertion keeps testing what it means to test:

```typescript
      highlights: [
        { kind: 'range', ids: ['i0', 'i1', 'i2', 'i3'], meta: { startLabel: 'lo', endLabel: 'hi' } },
        { kind: 'active', ids: ['i1'] },
      ],
```

Scan the rest of that file (and `marker-gate.test.ts`) for any other `>lo<` / `>hi<` assertion and give those fixtures the same meta.

- [ ] **Step 7: Run to verify**

Run: `npm run test`
Expected: PASS — including `marker-gate.test.ts`, which proves the underbar survived.

- [ ] **Step 8: Re-seed both baselines**

Run:

```bash
npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots
npx playwright test tests/e2e/baseline-aria.spec.ts --update-snapshots
```

**Read the aria diff — it is this task's real assertion.** `tests/e2e/baseline-aria.spec.ts-snapshots/lesson-binary-search.aria.yml` carries both sides on one page:

```yaml
- img "Binary search on a sorted array Ready. …": /1 0 3 1 5 2 7 3 9 4 \d+ 5 lo hi/
- img "Linear search through an array Ready. Scanning left to right…": 8 0 3 1 5 2 9 3 1 4 7 5 lo hi
```

After this task the **second** line must lose its trailing `lo hi` and the **first** must keep it. If both change, or neither, the fix is wrong — do not accept the baseline.

- [ ] **Step 9: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`

```bash
git add -A
git commit -m "fix(viz): range end-labels come from the algorithm, not the renderer

ArrayRenderer hardcoded lo/hi for any range highlight, so seven of the
eight algorithms that emit one printed a search-window vocabulary their
own prose disowns — linear search two paragraphs after saying 'There is
no lo, hi, or mid', and array-operations on all 13 steps of the arrays
lesson. Binary search now supplies its own labels through highlight meta.

The range underbar is unchanged: it is the non-colour cue for the kind
and every range still draws it.

The aria baseline diff is the assertion — linear search's still loses its
trailing 'lo hi' and binary search's keeps it."
```

---

## Task 7: The legibility floor — regression test only

**Files:**

- Modify: `tests/e2e/plan-a-frames.spec.ts`
- Modify: `src/viz/Visualizer.astro` (comment only)

**Interfaces:** consumes Task 4's frozen extent. Produces nothing.

**There is no source change to make here, and that is the finding.** A legibility floor already ships — `Visualizer.astro:817-833`, `min-width: calc(var(--viz-natural-w, 0px) * 0.75)` — and three measurements say it needs no vertical twin:

1. Every SVG is emitted `preserveAspectRatio="xMidYMid meet"` with `height: auto`, so the scale is **uniform**. A width held at `0.75 × naturalW` holds the height at `0.75 × naturalH` too.
2. `max-height` appears **nowhere** in `Visualizer.astro`; `.viz-canvas` declares `overflow-x` only, and `.viz-frame`'s `overflow: hidden` serves the RSP-2 full-bleed negative margin and does not clip a child that makes the frame taller. There is no cap to exceed.
3. Adding one would **create** an a11y bug: `measureCanvas` decides `tabindex`, `role="group"` and the canvas's accessible name from horizontal overflow alone, so `overflow-y: auto` + `max-height` would produce a container that overflows vertically while fitting horizontally — an unreachable keyboard scroll region, the exact WCAG 2.1.1 failure the RSP-2 comment says the JS-off path was designed to avoid.

What Task 4 *did* change for free: `measureCanvas` reads `svg.viewBox.baseVal.width` live, and that value is now trace-constant, so `--viz-natural-w` stops moving mid-run and `remeasureIfResized`'s string compare stops firing. **Do not add separate plumbing for this — it would be dead code.** Assert it instead.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/plan-a-frames.spec.ts`:

```typescript
test.describe('the legibility floor under a frozen extent', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('--viz-natural-w is constant across a run on a growing renderer', async ({
    page,
  }) => {
    await page.goto('/learn/trees-bst');
    const root = page.locator('[data-viz-root][data-viz-ready="true"]').first();
    await expect(root).toBeVisible();
    const canvas = root.locator('[data-viz-canvas]');
    const forward = root.locator('[data-viz-forward]');

    const seen = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      seen.add(
        await canvas.evaluate(
          (el) => getComputedStyle(el).getPropertyValue('--viz-natural-w').trim(),
        ),
      );
      if (await forward.isDisabled()) break;
      await forward.click();
    }
    expect([...seen], 'the floor moved mid-run').toHaveLength(1);
  });

  test('a horizontally overflowing canvas is still a reachable scroll region', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const root = page.locator('[data-viz-root][data-viz-ready="true"]').first();
    const canvas = root.locator('[data-viz-canvas]');
    const overflows = await canvas.evaluate(
      (el) => el.scrollWidth - el.clientWidth > 1,
    );
    if (overflows) {
      await expect(canvas).toHaveAttribute('tabindex', '0');
      await expect(canvas).toHaveAttribute('role', 'group');
      await expect(canvas).toHaveAttribute('aria-label', /scrollable diagram/);
    } else {
      await expect(canvas).toHaveAttribute('tabindex', '-1');
    }
  });

  test('the 6-cell default array still fits without scrolling at 390px', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const canvas = page
      .locator('[data-viz-root][data-viz-ready="true"]')
      .first()
      .locator('[data-viz-canvas]');
    expect(
      await canvas.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/plan-a-frames.spec.ts`
Expected: PASS — the first test passes *because of* Task 4. If it fails, Task 4 is incomplete: the extent is not reaching the hydrated renderer.

The third test encodes the shipped 0.75's own documented rationale ("a 6-cell default would otherwise start scrolling on a 390px screen it currently fits"). If it fails, the floor was changed — revert that change rather than the test.

- [ ] **Step 3: Record the finding where the next reader will look**

Extend the RSP-2 comment block at `src/viz/Visualizer.astro:817-833` with one paragraph:

```
     Plan A considered a vertical twin for this floor and MEASURED it away:
     `meet` + `height:auto` makes the scale uniform, so this min-width is
     already a two-axis floor; no `max-height` exists anywhere here, so there is
     no cap to overflow against; and adding one would make a canvas that
     overflows vertically while fitting horizontally — which measureCanvas
     below would leave `tabindex="-1"`, i.e. exactly the unreachable scroller
     this comment says the design avoids. The floor is correct as it stands.
```

- [ ] **Step 4: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`

```bash
git add -A
git commit -m "test(viz): pin the legibility floor under a frozen extent

No source change: the shipped RSP-2 min-width is already a two-axis floor
under uniform meet scaling, there is no max-height to overflow against,
and adding one would create the unreachable keyboard scroll region the
floor's own comment says the design avoids. What the frozen extent did
change is that --viz-natural-w stops moving mid-run; that is now a test,
along with the 390px 6-cell case the 0.75 was chosen to protect."
```

---

## Task 8: The custom-input P0

**Files:**

- Modify: `src/viz/core/input-hint.ts`
- Modify: `src/viz/Visualizer.astro` (the composer, one line)
- Modify: `src/viz/algorithms/binary-search.ts`, `src/viz/algorithms/linear-search.ts` (one message each)
- Modify: `src/viz/core/error-field.ts` (stale doc comment at `:83`)
- Modify: `tests/unit/binary-search.test.ts:104`, `tests/unit/error-field.test.ts:109` and `:218`
- Create: `tests/unit/input-compose.test.ts`
- Modify: `tests/e2e/plan-a-frames.spec.ts`

**Interfaces:**

- Produces: `composeCustomInput(first: string, target: string, authoredFirst: string): string` from `src/viz/core/input-hint.ts`.

**The defect.** `parseInput` requires a `[…]` literal while the field's help text says "Up to 30 whole numbers, comma-separated", and the fallback error then tells a reader who filled in both fields to fill in both fields. Reproduction: `9,2,7,4,1` + `4` → *"Type an array and target, e.g. [1,3,5,7] target=5"*.

**The gate must be client-side.** `Visualizer.astro:255`'s `arrayPlaceholder` is a build-time frontmatter const the bundled script never sees, and its fallback lies (`authored.input || inputPlaceholder || '[1,3,5,7,9,11]'` hands a bracketed default to an instrument that authored no input). The script already reads `root.dataset['input']` (`:2122`) and already calls `splitAuthoredInput(rawInput)` (`:3096`) — gate on that.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/input-compose.test.ts`:

```typescript
/**
 * `composeCustomInput` — the bracket-wrap that makes the custom-input box
 * accept the format its own help text advertises ("Up to 30 whole numbers,
 * comma-separated"), gated so it cannot corrupt a non-array instrument's field.
 */
import { describe, expect, it } from 'vitest';
import { composeCustomInput } from '../../src/viz/core/input-hint';

const ARRAY = '[1,3,5,7,9,11]';
const GRAPH = '0-1,0-2,1-3';
const DP = '6';

describe('composeCustomInput', () => {
  it('wraps a bare list for an instrument whose authored input is bracketed', () => {
    expect(composeCustomInput('9,2,7,4,1', '4', ARRAY)).toBe('[9,2,7,4,1] target=4');
  });

  it('leaves an already-bracketed list alone', () => {
    expect(composeCustomInput('[9,2,7]', '4', ARRAY)).toBe('[9,2,7] target=4');
  });

  it('trims before wrapping', () => {
    expect(composeCustomInput('  9, 2 ', '4', ARRAY)).toBe('[9, 2] target=4');
  });

  it('NEVER wraps for a graph instrument', () => {
    expect(composeCustomInput(GRAPH, '0', GRAPH)).toBe('0-1,0-2,1-3 target=0');
  });

  it('NEVER wraps for a DP instrument', () => {
    expect(composeCustomInput('7', '', DP)).toBe('7 target=');
  });

  it('never wraps when the instrument authored no input at all', () => {
    // `arrayPlaceholder`'s build-time fallback would have claimed "[1,3,5,7,9,11]"
    // here and corrupted the field; the authored value is the honest gate.
    expect(composeCustomInput('1,2,3', '2', '')).toBe('1,2,3 target=2');
  });

  it('does not wrap an empty first field into an empty array literal', () => {
    expect(composeCustomInput('', '4', ARRAY)).toBe(' target=4');
  });

  it('normalises nothing else — a malformed list still reaches parseInput', () => {
    expect(composeCustomInput('1,,x', '4', ARRAY)).toBe('[1,,x] target=4');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/input-compose.test.ts`
Expected: FAIL — no such export.

- [ ] **Step 3: Implement the composer**

Append to `src/viz/core/input-hint.ts`:

```typescript
/**
 * Composes the raw string `parseInput` receives from the two rendered fields.
 *
 * Exists for one defect: every array `parseInput` requires a `[…]` literal
 * while the field's own help text says "Up to 30 whole numbers,
 * comma-separated", so a reader who typed exactly what they were asked for got
 * an error telling them to fill in both fields. This wraps the bare list.
 *
 * GATED on the instrument's own authored input, because one composer serves all
 * 21 instruments and an unconditional wrap corrupts every non-array lesson — a
 * graph reader types `0-1,0-2,1-3` and a DP reader types `7`. It gates on the
 * AUTHORED value rather than the rendered placeholder: the placeholder falls
 * back to a bracketed literal for an instrument that authored nothing, which
 * would be exactly the wrong answer.
 *
 * Normalises nothing else, so a malformed list still reaches `parseInput` and
 * still produces that algorithm's own message.
 *
 * @param first - What the reader typed in the first field.
 * @param target - What they typed in the second (may be empty).
 * @param authoredFirst - `splitAuthoredInput(authored).input` for this instrument.
 * @returns The raw string, in the `` `${first} target=${target}` `` wire format.
 */
export function composeCustomInput(
  first: string,
  target: string,
  authoredFirst: string,
): string {
  const trimmed = first.trim();
  const wrap =
    authoredFirst.startsWith('[') && trimmed.length > 0 && !trimmed.startsWith('[');
  return `${wrap ? `[${trimmed}]` : first} ${TARGET_SEPARATOR}${target}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/input-compose.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Wire it into the island**

In `Visualizer.astro`'s submit handler, replace:

```typescript
          const raw = `${arrayInput?.value ?? ''} target=${targetInput?.value ?? ''}`;
```

with:

```typescript
          const raw = composeCustomInput(
            arrayInput?.value ?? '',
            targetInput?.value ?? '',
            splitAuthoredInput(rawInput).input,
          );
```

and extend the island's existing import (`import { splitAuthoredInput } from './core/input-hint';` at `:2016`) to `import { composeCustomInput, splitAuthoredInput } from './core/input-hint';`.

- [ ] **Step 6: Rewrite the two messages**

`src/viz/algorithms/binary-search.ts:155`:

```typescript
    return { error: 'Enter an array of whole numbers, e.g. 1,3,5,7' };
```

`src/viz/algorithms/linear-search.ts:127`:

```typescript
    return { error: 'Enter an array of whole numbers, e.g. 4,1,7,2' };
```

**Both must keep the word "array".** `core/error-field.ts` decides which field gets `aria-invalid` and focus by matching the message prose against `FIRST_FIELD_WORDS`, which contains `'array'`; a message without a first-field word would send the error to the target field.

Leave the `Add a target, …` messages and the bracketed `Use whole numbers only, e.g. [1,3,5,7]` alone — those are reached only when a list was already parsed, so the bracketed form is accurate there.

- [ ] **Step 7: Re-pin the message tests**

- `tests/unit/binary-search.test.ts:104` — swap to the new string.
- `tests/unit/error-field.test.ts:109` — swap `'Type an array and target, e.g. [1,3,5,7] target=5'` to `'Enter an array of whole numbers, e.g. 1,3,5,7'`, expectation stays `'input'`.
- `tests/unit/error-field.test.ts:218` — the same for the linear-search string.
- `src/viz/core/error-field.ts:83` and the comment at `:77` in the test — both quote the old message as their worked example. Update the quoted text so the comment still describes the code.

- [ ] **Step 8: Add the e2e coverage**

Add to `tests/e2e/plan-a-frames.spec.ts`:

```typescript
test.describe('custom input accepts the advertised format', () => {
  test('a bare comma-separated list runs on binary search', async ({ page }) => {
    await page.goto('/learn/binary-search');
    const root = page.locator('[data-viz-root][data-viz-ready="true"]').first();
    await root.locator('[data-viz-array]').fill('1,3,5,7,9');
    await root.locator('[data-viz-target]').fill('5');
    await root.locator('[data-viz-run]').click();
    await expect(root.locator('[data-viz-error]')).toBeHidden();
  });

  test('an unsorted bare list reaches the sorted-precondition message', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const root = page.locator('[data-viz-root][data-viz-ready="true"]').first();
    await root.locator('[data-viz-array]').fill('9,2,7,4,1');
    await root.locator('[data-viz-target]').fill('4');
    await root.locator('[data-viz-run]').click();
    await expect(root.locator('[data-viz-error-text]')).toContainText(/sorted/i);
  });

  test('a graph instrument is unaffected by the wrap', async ({ page }) => {
    await page.goto('/learn/graphs-bfs');
    const root = page.locator('[data-viz-root][data-viz-ready="true"]').first();
    await root.locator('[data-viz-array]').fill('0-1,0-2,1-3');
    await root.locator('[data-viz-target]').fill('0');
    await root.locator('[data-viz-run]').click();
    await expect(root.locator('[data-viz-error]')).toBeHidden();
  });
});
```

Confirm the lesson slugs and the error-box selectors against `tests/e2e/m7-player-v2.spec.ts` before running — that suite already exercises this form.

- [ ] **Step 9: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`

```bash
git add -A
git commit -m "fix(viz): accept the custom-input format the help text advertises

The field said 'Up to 30 whole numbers, comma-separated' and parseInput
required a [...] literal, so a reader who typed 9,2,7,4,1 + 4 was told to
type an array and a target. The island now wraps a bare list, gated on
the instrument's own AUTHORED input read client-side — not on the
build-time placeholder, whose no-authored-input fallback is bracketed and
would have corrupted graph and DP fields.

Both search algorithms' fallback messages are rewritten to describe the
accepted format; both keep the word 'array' so errorField still
attributes them to the first field."
```

---

## Task 9: Spec and documentation amendments

**Files:**

- Modify: `docs/site-spec.md` (§11.2, §19)
- Modify: `docs/m3-design.md:151`
- Modify: `CLAUDE.md` (the "Visualization" bullet under "Know what an area already guarantees")
- Modify: `README.md` if the new npm script changes how the project is run

**Interfaces:** none.

- [ ] **Step 1: Amend site spec §11.2**

Record the contract as shipped: `Extent`; `RenderOpts.extent`; `Renderer.setExtent`; `RendererModule.measure`; and the marker-meta contract (`meta.label` for a single-target marker, `meta.startLabel`/`meta.endLabel` for a range, no renderer default for range end-labels).

- [ ] **Step 2: Amend `docs/m3-design.md:151`**

It records "viewBox height grows with size" for the stack renderer. That was the intended behaviour for one renderer and is now the defect. Replace it with the frozen-extent rule and the bottom anchor, and say why the ground line drove the choice.

- [ ] **Step 3: Update `CLAUDE.md`'s Visualization bullet**

Add: every renderer module now ships `measure`, whose agreement with `draw` is a test; the extent is frozen per trace and reaches the client through `setExtent` (never `mount` alone, which runs once); and the RSP-2 floor was measured and deliberately left alone — a vertical twin is a rejected proposal, not a gap.

- [ ] **Step 4: Add the audit script to README's command list**

`npm run audit:frames` re-derives Plan A's scope. One line beside the existing scripts.

- [ ] **Step 5: Full check and commit**

Run: `npm run build && npm run lint && npm run format:check && npm run test && npm run test:e2e`

```bash
git add -A
git commit -m "docs: record Plan A's contract change and its two deletions

Spec §11.2 gains Extent, RenderOpts.extent, Renderer.setExtent,
RendererModule.measure and the marker-meta contract. m3-design's 'viewBox
height grows with size' is retired — that was one renderer's intended
behaviour and is now the defect.

Also recorded as decisions rather than gaps: cost withholding (FinalRun's
rule is card-scoped and the number is on screen by design) and the
vertical legibility floor (the shipped min-width is already a two-axis
floor and there is no cap to overflow against)."
```

- [ ] **Step 6: Measure the JS budget delta and report it**

Run `npm run build`, then gzip every chunk in a lesson page's static import closure and compare against `dab6108`. This plan adds `core/extent.ts`, `fitToExtent`, `composeCustomInput` and eleven `measure` functions to the client. **Put the measured number in the final report — not an estimate.** `tests/e2e/js-budget.spec.ts` is the existing gate; it must stay green.

---

## Self-Review

**1. Spec coverage.** Every numbered item in the spec maps to a task: §3 one-viewBox-per-trace → Tasks 2, 3, 4; §4 resting frames → Task 5; §5 marker labels → Task 6; §6 legibility floor → Task 7 (test only, by measurement); §7 custom input → Task 8; §2 audit → Task 1; the spec amendments §10 step 7 names → Task 9. No spec section is unclaimed.

**2. Placeholders.** None: every code step carries the actual code, every test step the actual assertions, every command the actual invocation. Three steps deliberately say *read the neighbouring file first* rather than guessing at an API (`demos.ts`'s export names, `m7-player-v2.spec.ts`'s selectors, the tree/heap empty-state fixture shapes) — that is an instruction to verify, not a gap to fill in later.

**3. Type consistency.** `Extent` is `{ w, h }` everywhere. `measure(step): Extent` — always a `Step`, never a state. `fitToExtent(canvas, extent, anchor?)` — argument order fixed at Task 2 and used identically in Tasks 3, 4 and 5. `setExtent(extent: Extent | undefined)` — the same nullable signature in `createRenderer` and `ArrayDomRenderer`. `traceExtent(measure, trace)` — measure first, matching its Task 4 definition and both its Task 4 call sites. `metaRangeLabels(h)` returns `{ start, end }` with `string | null`, consumed under exactly those names.

**One risk worth naming:** Tasks 2 and 3 straddle a compile break — `RendererModule.measure` and `Renderer.setExtent` are declared as required before all 11 modules implement them. Task 2's commit therefore does **not** satisfy `npm run build`. Land them as one commit, or run `npm run build` only at the end of Task 3, as Task 2's interface note says.

---

## Post-implementation corrections (Task 9)

The plan shipped in seven commits, `dca2d89 … 6b0ca3b`. Three things it asserted turned out to be
wrong once measured, and they are recorded here rather than left in the prose above, because a plan
that reads as if it predicted everything is a plan nobody checks next time.

1. **Task 5 did not fix the blank `trees-bst` frame — Task 4 did, incidentally.** The decomposition
   doc sold the resting-frame fix as what "stops `trees-bst` shipping a 1,277 px blank box to JS-off
   readers and to print". That box was real at `dab6108`, but freezing the extent draws step 0
   inside the trace's `380×222` box, so by the time Task 5 ran both stills were already un-clipped.
   Task 5's honest scope is the box **on its own terms**: an all-empty trace, a bare `renderStatic`,
   a unit test — every caller that passes no extent. On the shipped stills it is a *position*
   change, not a repair.
2. **`/dev/renderers` is not an extent-less surface.** Both this plan and the design spec named the
   dev gallery as a caller Task 5 protects. It renders through the real `<Visualizer>`, so it gets a
   frozen extent like every other page. (The same disproved claim survives in
   `src/viz/core/types.ts`'s `RenderOpts.extent` JSDoc — *"which is what the unit tests and the dev
   gallery want"* — and should be corrected the next time that file is opened for a code change.)
3. **The visual baseline is not the gate Tasks 4–6 leaned on.** `maxDiffPixelRatio: 0.002` on an
   ~8,626 px full-page screenshot tolerates roughly 30,000 changed pixels; removing two 12px marker
   labels changed 569, inside a single 653×18 band, so **all 14 captures passed unchanged** and were
   re-seeded for fidelity rather than because they failed. The **aria** baseline caught it, in one
   line. Gate text-level changes on aria snapshots or DOM assertions; treat a green pixel run as
   saying nothing about them. (`tests/e2e/baseline-visual.spec.ts`'s own header and its
   `SKIP_REASON` constant still describe the pre-`dab6108` state — *"STATUS: UNSEEDED"*, *"no PNG
   has ever been committed"*, *"never on the DoD gate"* — and all three are false: 14 PNGs are
   committed and `.github/workflows/ci.yml` sets `VISUAL_BASELINE: '1'` on the DoD gate step. Like
   the `types.ts` JSDoc above, rewrite it the next time that file is opened for a code change;
   `README.md` now carries the correct statement in the meantime.)

One handoff is left open rather than closed, and is filed in site spec §19: **twelve** array-family
instruments still answer a *failed* parse with a bracketed-only example (*"Type an array to sort,
e.g. `[5,2,9,1,7]`"*). Those strings are still accurate — brackets parse — but they now understate
what `composeCustomInput` accepts. Counted rather than estimated: all twelve parsers accept the
wrapped bare list, `hash-table-operations` included (its `cap=` companion defaults). Wording debt,
not a defect, and out of scope for a documentation-only task: the rewrite touches twelve algorithm
files, their string assertions and `tests/unit/error-field.test.ts`.
