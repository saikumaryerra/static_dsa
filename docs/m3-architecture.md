# LearnDSA — M3 Design: Visualization Framework Hardening + Renderer Suite

**Author:** Systems-Architect · **For:** Frontend-Engineer (implementer), Lead-Developer (review), QA-Engineer (validation) · **Milestone:** M3 · **Status:** Ready to implement

## Executive Summary

M3 makes the trace-then-render pipeline renderer-agnostic by giving every renderer a pure, DOM-free `renderStatic(step): string` that the `Visualizer.astro` frontmatter calls **at build time** (zero client cost) to emit a correct JS-off/pre-hydration still and correct per-algorithm aria copy, while the client keeps lazy-loading exactly two chunks. On that foundation we ship 9 renderers plus three shared core modules (`svg`, `ids`, `highlight`) that eliminate the duplicated geometry (TD-2) and the algorithm→renderer id coupling (TD-3), and a single `AbortController`-based teardown contract (TD-4) — all with **zero new runtime dependencies**.

## The one insight that drives the whole design

`Visualizer.astro`'s frontmatter (the `---` fenced block) runs **only at build time in Node** and ships **no client JS**. Its `<script>` block is a **separate** client bundle. Therefore the frontmatter can `await` the registry's lazy thunks and call a DOM-free `renderStatic()` to produce the still, importing algorithm/renderer modules at build with **no impact on the 60 KB/page budget**. This is what makes TD-1 solvable without a second registry or a build-time DOM.

---

## 1. The renderer-agnostic Visualizer (TD-1) — the central problem

### Decision: per-renderer `renderStatic(step): string`, invoked at build via the existing lazy registry.

Each renderer module exports a `RendererModule` object with two members: `create()` (client, DOM) and `renderStatic(step, opts)` (build, pure string). The `.astro` **frontmatter** awaits the *same* registry thunk it already uses on the client, runs the algorithm to get `step0`, and calls `renderStatic(step0)`.

**Why over alternatives:**
- **separate "still" module** — rejected: re-derives geometry the renderer already owns, recreating the .astro↔ArrayRenderer drift TD-2 kills.
- **jsdom-at-build serialize** — rejected: adds a build dependency, slows builds, more machinery than a pure string builder.
- **`renderStatic`** — chosen: one geometry source per renderer (shared with its DOM path via `core/svg` + `core/ids`), still is *always* exactly `trace[0]`, and `renderStatic` doubles as the **dep-free unit-test surface** (§5).

**ADR-M3-1 — `renderStatic` string stills, generated at build via the lazy registry.**
- *Pros:* zero client-JS cost (frontmatter is build-only); one geometry source per renderer; still == hydrated step 0 by construction; unit-testable in Node with no jsdom.
- *Cons:* each renderer author writes a string path in addition to the DOM path — mitigated because both consume `core/svg`+`core/ids`+`core/highlight`; running `algo.run()` at build turns malformed authored `input` into a **build-time** failure (better DX than M2's runtime "unavailable").

### Frontmatter (build-only), replacing the hardcoded array-SVG block + `parseInitial` + KEEP-IN-SYNC constants:

```ts
import { algorithms, renderers } from './registry';
const algo = await (algorithms as AnyAlgoMap)[algorithm]?.();
const rmod = await (renderers as AnyRendererMap)[renderer]?.();
if (!algo || !rmod) throw new Error(`Unknown viz: algorithm="${algorithm}" renderer="${renderer}"`); // build fails loudly

const parsed = input ? algo.parseInput(input) : algo.defaultInput();
if ('error' in parsed) throw new Error(`Authored <Visualizer> input rejected: ${parsed.error}`);
const step0 = algo.run(parsed)[0];
const still = rmod.renderStatic(step0, { title: algo.label });  // full <svg>…</svg> string
const label = algo.label;                                        // per-algorithm
```

- `<section aria-label>` → `` `${label} visualization` ``. SVG `<title>` = `algo.label`. SVG `<desc>` = `step0.explanation` (renderer updates per step on live path).
- Add **`label: string`** to `Algorithm` (e.g. `"Binary search on a sorted array"`). Only metadata addition; per-step description already exists as `Step.explanation`.

### Edit surface for M4 lessons (seam intact)
- **Add a lesson on an existing algorithm+renderer:** author one `.mdx`. **0 code files.**
- **Add an algorithm (reusing a renderer):** 1 file `algorithms/<id>.ts` (exports `Algorithm` incl. `label`) + **1 line** in `registry.ts`.
- **Add a renderer family:** 1 file `renderers/<X>.ts` (exports `RendererModule`) + **1 line** in `registry.ts`. The `.astro` is fully generic.

---

## 2. Player / registry hardening

### Player — no functional change required.
The M2 `Player<TState>` is already generic (imports only `./types`), timer-safe (self-rescheduling `setTimeout`, idempotent `pause()`), and reduced-motion-correct (snap inherited from CSS token layer). **Keep as-is.** Do not add per-structure logic (would violate purity).

### Registry — extend lazy pattern; standardize renderer export shape.

```ts
// core/types.ts — new
export interface RenderOpts { title?: string }
export interface RendererModule<TState> {
  create(): Renderer<TState>;                          // client DOM path
  renderStatic(step: Step<TState>, opts: RenderOpts): string; // build/still/test path (DOM-free)
}
// Renderer.mount gains opts so live SVG <title> is per-algorithm:
export interface Renderer<TState> {
  mount(container: HTMLElement, opts?: RenderOpts): void;
  render(step: Step<TState>): void;
  destroy(): void;
}
```

```ts
// registry.ts — 9 renderers, N algorithms; one line each
export const renderers = {
  array:      () => import('./renderers/ArrayRenderer').then((m) => m.arrayRenderer),
  bars:       () => import('./renderers/ArrayRenderer').then((m) => m.barsRenderer),
  linkedList: () => import('./renderers/LinkedListRenderer').then((m) => m.linkedListRenderer),
  stack:      () => import('./renderers/StackRenderer').then((m) => m.stackRenderer),
  queue:      () => import('./renderers/QueueRenderer').then((m) => m.queueRenderer),
  tree:       () => import('./renderers/TreeRenderer').then((m) => m.treeRenderer),
  heap:       () => import('./renderers/HeapRenderer').then((m) => m.heapRenderer),
  graph:      () => import('./renderers/GraphRenderer').then((m) => m.graphRenderer),
  callStack:  () => import('./renderers/CallStackRenderer').then((m) => m.callStackRenderer),
  chart:      () => import('./renderers/ChartRenderer').then((m) => m.chartRenderer),
} satisfies Record<string, () => Promise<RendererModule<unknown>>>;
```

- **Per-structure state-type registration: none.** `TState` stays internal to each algorithm+renderer *pair*; registry map stays `unknown`-typed. Agreement is by convention, documented in a one-line comment per `algorithms` entry. Mismatches caught by render tests + e2e.
- **Id validation moves to build time** — frontmatter throws on unknown id, so a `.mdx` typo **fails the build**. Keep client `renderUnavailable()` as defense-in-depth for chunk-load failure.

### Teardown contract (TD-4) — single `AbortController` closure
- **`mount()`** creates `const controller = new AbortController()`; **every** `addEventListener` passes `{ signal: controller.signal }`.
- **`teardown()`** (idempotent, `destroyed` flag): `observer?.disconnect()`; `controller.abort()`; `player?.pause()` (clears pending tick); `renderer?.destroy()`.
- **When:** `document.addEventListener('astro:before-swap', teardown)` per viz so **M4 View Transitions** don't leak; re-init on `astro:page-load`.
- **Custom input is NOT a teardown:** reuses renderer+player via `player.loadTrace(...)`. Renderers handle a state whose collection length changed across `render()` calls (rebuild persistent elements when cardinality changes, patch otherwise).

---

## 3. Shared core modules (TD-2, TD-3)

Three new files under `src/viz/core/` (root of the one-way graph — import nothing outward).

| File | Responsibility |
|---|---|
| **`core/ids.ts`** | Element-id helpers imported by **both** algorithms and renderers: `cellId(i)`, `nodeId(i)`, `edgeId(a,b)`, `slotId(i)`, `frameId(i)`, `barId(i)`, `curveId(fn)`. **Resolves TD-3:** `cellId` moves here; `binary-search.ts` imports from `core/ids`, never a renderer. |
| **`core/svg.ts`** | DOM-free SVG **string** primitives for every `renderStatic`: `svgRoot({viewBox,title,desc}, ...children)`, `rect`, `text`, `line`, `polyline`, `circle`, `path`, `group`, `esc()`. Pure string→string. |
| **`core/highlight.ts`** | The **single** canonical mapping for the 10-kind `Highlight` union → `{ cssClass, token, marker }` + `applyHighlights()` helper. Centralizes token pairing + non-color pairing so no renderer invents its own. |

**Per-renderer geometry** stays as module-local constants inside each renderer (geometry differs per structure). TD-2 fixed by **deletion**: the `.astro` no longer draws arrays — it calls `ArrayRenderer.renderStatic`, so constants live in one place. No `KEEP IN SYNC` survives M3.

Updated one-way dependency direction:
```
core/types ← core/{player, snapshot, svg, ids, highlight}
core/*     ← algorithms/*  (import types, snapshot, ids)
core/*     ← renderers/*   (import types, svg, ids, highlight)
algorithms/*, renderers/* ← registry.ts (lazy thunks)
registry.ts ← Visualizer.astro  (frontmatter: renderStatic still · script: create/mount/render)
```
Invariant: **renderers never import algorithms; algorithms never import renderers; both import `core/ids` (pure strings) only.**

---

## 4. Renderer contract + per-structure design

**Common contract (all 9):** implement `Renderer<TState>` (`mount(container,{title})` / `render(step)` idempotent / `destroy()`), export `{ create, renderStatic }: RendererModule<TState>`, build responsive `viewBox`-based SVG (no fixed px width), stable ids from `core/ids`, **rebuild persistent elements only when cardinality changes** (patch otherwise). **Reduced-motion inherited from token layer — no `matchMedia`, no per-renderer branch.** Every honored highlight kind carries a **non-color marker** in addition to its `--hl-*` color.

### Canonical highlight → token + non-color pairing (defined once in `core/highlight.ts`)

| kind | token | non-color marker (required) |
|---|---|---|
| `compare` | `--hl-compare` | dashed tie-line between the two ids + amber outline |
| `swap` | `--hl-swap` | `↔` arrows between the two ids |
| `active` | `--hl-active` | lift (`translateY(-3px)`) + a named caret (`mid`/`curr`/…) |
| `visited` | `--hl-visited` | small `✓` badge / filled dot |
| `frontier` | `--hl-frontier` | dashed ring + "queued" affordance |
| `found` | `--hl-found` | `✓` glyph |
| `insert` | `--hl-found` *(reuse)* | `+` caret + fade-in |
| `delete` | `--hl-swap` *(reuse)* | `✕` / strikethrough + fade-out |
| `pointer` | `--hl-active` *(reuse)* | the **named label** from `highlight.meta.label` drawn as a caret/arrow |
| `range` | `--hl-active` low-alpha band *(reuse)* | underbar bracket + **dim** out-of-range cells |

> **SPEC-GAP (§13 defines only 6 tokens):** `insert`/`delete`/`pointer`/`range` reuse existing tokens, disambiguated purely by marker. **Handoff to UI_UX-Designer:** bless this reuse or add `--hl-insert`/`--hl-delete` to `tokens.css`; the mapping lives in one file so the swap is a one-line change. Do **not** block M3 on it.

### 4.1 ArrayRenderer — **exists; refactor + extend**
- **Refactors:** import `cellId` from `core/ids`; build SVG via `core/svg` in new `renderStatic`; consume `core/highlight`; `<title>` from `mount(_,{title})`; export `arrayRenderer` + `barsRenderer`.
- **TState:** generalize to serve Arrays + Search + Sorting: `{ array:number[]; lo?; hi?; mid?:number|null; foundIndex?:number|null; comparing?:number[]; swapping?:number[] }`.
- **Ids:** `i${index}`. **Highlights:** `range`, `active`, `found`, `compare`, `swap` (+ `insert`/`delete`).
- **Bars variant (`renderer="bars"`):** same ids/geometry, each cell a value-scaled `<rect>`; serves Sorting I/II. *(SPEC-GAP: "bars" not among named 9; minimal way to satisfy §5 Sorting without a new family.)*

### 4.2 LinkedListRenderer (§3)
- **TState:** `{ nodes:{value:number}[]; kind:'singly'|'doubly'; pointers?:{name:string;index:number|null}[] }`.
- **Layout:** horizontal row, `next` arrows; doubly adds `prev`; terminal `⌀` for null. **Ids:** `n${i}`; pointer names as captioned carets.
- **Highlights:** `pointer` (named), `insert`, `delete`, `active`, `compare`, `visited`.

### 4.3 StackRenderer (§4)
- **TState:** `{ items:number[]; top?:number }`. **Layout:** vertical, item 0 bottom. **Ids:** `slotId(i)`.
- **Highlights:** `insert`=push, `delete`=pop, `active`=top.

### 4.4 QueueRenderer (§5, incl. circular)
- **TState:** `{ slots:(number|null)[]; head:number; tail:number; size:number; circular:boolean }`.
- **Layout:** linear row of fixed `capacity` slots, front/rear captions; wrap shown by coloring + wrap indicator. **Ids:** `slotId(i)`.
- **Highlights:** `insert`=enqueue at tail, `delete`=dequeue at head, `pointer`=front/rear, `active`.
- > **SPEC-GAP:** linear-with-wrap-markers chosen over literal ring (readable, no trig, deterministic tests).

### 4.5 TreeRenderer (§7 BST) — **non-trivial (layout)**
- **TState:** `{ nodes:{id:number;value:number;left:number|null;right:number|null}[]; root:number|null }`.
- **Layout — simplest correct:** **in-order-rank × depth.** `x = inorderRank(node) * XSTEP`, `y = depth(node) * YSTEP`. No overlap, left-subtree-left, O(n), no tidy-tree machinery. **Ids:** `n${id}`, edge `edgeId(parent,child)`.
- **Highlights:** `active`, `compare`, `found`, `insert`, `visited` (search path = thicker/dashed edges + node ring).
- > **ADR-M3-2:** in-order-rank over Reingold–Tilford — dep-free, legible at caps; *con:* deep skewed trees wide (acceptable at caps).

### 4.6 HeapRenderer (§8) — tree + backing array side-by-side
- **TState:** `{ heap:number[]; size:number; comparing?:number[]; swapping?:number[] }`.
- **Layout — direct index math:** node `i` at `depth=floor(log2(i+1))`, spread within level; no traversal. Tree (top band) + backing array cells (bottom band). **Ids:** same index drives both — `nodeId(i)` + `cellId(i)`; a highlight on index `k` marks **both**.
- **Highlights:** `compare` (tie-line both views), `swap` (`↔` both views), `active`.

### 4.7 GraphRenderer (§9, §14) — node-link; **non-trivial (layout)**
- **TState:** `{ nodes:{id:number;label?:string;pos?:{x:number;y:number}}[]; edges:{from:number;to:number;weight?:number;directed?:boolean}[] }`.
- **Layout — deterministic circle:** node `i` at `angle=i/n*2π` on a circle. No force sim, no dependency, reproducible for tests at ≤15 nodes. Honor optional per-node `pos`. **Ids:** `n${id}`, `edgeId(from,to)`. Directed → arrowhead marker; weighted → midpoint label.
- **Highlights (traversal):** `visited` (`✓`), `frontier` (dashed ring), `active` (lift), `compare` (edge). BFS/DFS side-panel + adjacency toggle are **lesson-level**.
- > **ADR-M3-3:** circle over force-directed — dep-free, deterministic (no flaky tests); *con:* crossings on dense graphs (acceptable ≤15).

### 4.8 CallStackRenderer (§10)
- **TState:** `{ frames:{label:string;args?:string;returnValue?:string|null}[] }`. **Layout:** vertical frame cards, top=current. **Ids:** `frameId(i)`.
- **Highlights:** `insert`=call, `delete`=return, `active`=top, optional `pointer`.

### 4.9 ChartRenderer (§1 Big-O) — continuous plot
- **TState:** `{ n:number; maxN:number; functions:('1'|'logn'|'n'|'nlogn'|'n2')[] }`. Each step advances `n`.
- **Layout:** x–y plot with axes/gridlines; each curve an SVG `<polyline>`; y auto-scaled to max at `maxN` (~20–40 so O(n²) fits; log axis optional polish). **Ids:** `curveId(fn)`.
- **Highlights:** `active` (emphasized curve), `compare` (two curves). **Non-color critical** (5 curves): distinct `stroke-dasharray` + direct end-of-line label — never color-only.

**Non-trivial flags:** Tree (in-order-rank), Graph (circle), Heap (index-math), Chart (axis/scale). All dependency-free.

---

## 5. "Minimal demo/test" per renderer — dependency-free

- **Test (binding):** `tests/unit/renderers/<name>.test.ts` builds a hand-authored sample `Step<TState>` and asserts the `renderStatic(step,{title})` string: expected **ids**, correct **highlight classes**, `viewBox` + `<title>`/`<desc>` (desc == `step.explanation`). Because `renderStatic` and DOM `render()` share `core/svg`/`ids`/`highlight`, testing the string covers layout/id/highlight for both paths. **Zero new dependency** (node Vitest env).
- **DOM `render()` patching** (stateful rebuild-vs-patch, teardown) exercised by **Playwright e2e** against the demo route + Binary Search lesson.
- **Demo (dev-only, non-shipping):** `src/pages/dev/renderers.astro` enumerates each renderer with a hand-built sample trace via the real `<Visualizer>`. Gated: `if (import.meta.env.PROD) return Astro.rewrite('/404')` so production emits no renderer chunks; lives outside `src/content`.
  - > **SPEC-GAP:** Astro has no first-class prod-exclude; `import.meta.env.PROD` rewrite is the simplest no-ship guarantee. If stricter needed, drop the page and rely on `renderStatic` unit tests (the actual acceptance).

---

## 6. Scope & sequencing

**Renderers needed for the 14 required lessons:** `chart` (L1), `array` (L2, L11), `bars` (L12, L13), `linkedList` (L3), `stack` (L4), `queue` (L5), `tree` (L7), `heap` (L8), `graph` (L9, L14), `callStack` (L10).

**Deferred (flag):**
- **Hash Tables (§5 L6)** → small `HashTableRenderer` (array-of-slots + per-slot chain, reuses LinkedList layout). **Defer to M4** with its lesson; stub registry line. *(SPEC-GAP: §5 requires it but binding M3 list is the 9.)*
- **Intro DP table (§5 L15, stretch)** → `TableRenderer`; **defer to M6** (published:false).

**Build order:**
1. **Hardening + shared core** (`core/ids`, `core/svg`, `core/highlight`; `RendererModule`/`label`/`mount(opts)` type changes; refactor **ArrayRenderer**; rewrite **Visualizer.astro** frontmatter + AbortController teardown). Nothing else until this is green.
2. **Prove the seam:** add **`linear-search`** (reuses `renderer="array"`) — **1 file + 1 registry line, zero other changes.** Concrete evidence for "add algorithm = 1 file + 1 line."
3. **Simple linear renderers:** `stack`, `callStack`, `queue`, `linkedList`, + `bars` variant.
4. **Chart** — independent axis math.
5. **Complex layout:** `tree`, `heap`, `graph`.
6. **Deferred:** `HashTableRenderer` (M4), `TableRenderer` (M6).

**New-dependency check — target zero, met.** jsdom-at-build → `renderStatic` strings; jsdom tests → node env; force-directed → circle; tidy-tree → in-order-rank; charting lib → hand-rolled `<polyline>`.

---

## 7. Files — create / modify

**Create:** `src/viz/core/ids.ts`, `src/viz/core/svg.ts`, `src/viz/core/highlight.ts`, `src/viz/renderers/{LinkedListRenderer,StackRenderer,QueueRenderer,TreeRenderer,HeapRenderer,GraphRenderer,CallStackRenderer,ChartRenderer}.ts`, `src/viz/algorithms/linear-search.ts`, `tests/unit/renderers/*.test.ts`, `src/pages/dev/renderers.astro`.

**Modify:** `src/viz/core/types.ts` (add `RenderOpts`, `RendererModule<T>`, `Algorithm.label`, `Renderer.mount(opts)`), `src/viz/core/player.ts` (confirm only, no change), `src/viz/registry.ts` (9 renderers + N algorithms + `bars` + stub `hashTable` + `linear-search`), `src/viz/renderers/ArrayRenderer.ts` (core/ids + renderStatic + bars variant + mount opts + core/svg/highlight), `src/viz/algorithms/binary-search.ts` (cellId from core/ids + label), `src/viz/Visualizer.astro` (delete inline still/parseInitial/geometry; frontmatter renderStatic; client RendererModule.create()+mount(opts); AbortController teardown + astro:before-swap/page-load).

Invariant: `renderers/*` and `algorithms/*` never import each other; both import `core/ids` only; `core/*` imports nothing outward.

---

## Failure scenarios & graceful degradation

| Failure | Behavior |
|---|---|
| **JS disabled / pre-hydration** | `renderStatic(step0)` still + disabled controls + "enable JS" note; prose/code readable. Now correct for **every** renderer (TD-1). |
| **Unknown algorithm/renderer id** | **Build fails** (frontmatter throw); client keeps `renderUnavailable()` for chunk-load fallback. |
| **Malformed authored `input`** | **Build fails** with `parseInput` error. |
| **Invalid custom input (runtime)** | Inline `role="alert"`; `loadTrace` not called; previous trace intact. |
| **View-transition navigation (M4)** | `astro:before-swap` → `teardown()` aborts listeners, pauses timer, disconnects observer, destroys renderer. |
| **Renderer/algorithm `TState` mismatch** | Not compile-caught (string-keyed registry); caught by `renderStatic` unit test + e2e. |

**Open SPEC-GAPs for review (do not block M3):** (1) `insert/delete/pointer/range` reuse existing tokens; (2) `bars` is an ArrayRenderer variant, not one of the named 9; (3) circular queue drawn linear-with-wrap; (4) `HashTableRenderer` deferred to M4; (5) dev demo route prod-exclusion via `import.meta.env.PROD` rewrite.
