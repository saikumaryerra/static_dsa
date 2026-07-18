# LearnDSA — M2 Architecture: Content Model + Trace-Then-Render Vertical Slice

**Author:** Systems-Architect · **For:** Frontend-Engineer (implementer), Lead-Developer (review), QA-Engineer (validation) · **Milestone:** M2 · **Status:** Ready to implement

## Executive Summary

M2 stands up a typed Astro Content Collection for lessons plus the full three-layer trace-then-render viz pipeline (Algorithm → Trace → Player → Renderer), wired through a lazy registry so each lesson page ships only the one algorithm + renderer it uses. The seam is designed so M3's "add an algorithm = one file + one registry entry" is literally true, and every layer degrades to readable static HTML with JS off.

**Environment facts that drove decisions** (verified from repo): `astro@^7.1.1`, `@astrojs/mdx@^7.0.3`, `output: 'static'`, `strict` tsconfig, Tailwind v4 CSS-first, Node ≥ 20, Vitest `environment: 'node'` with `tests/unit/**/*.test.ts`. `--hl-compare/-swap/-active/-visited/-frontier/-found` tokens already exist in `tokens.css` (both themes) and are exposed as Tailwind colors `hl-compare` etc. Reduced-motion already collapses `--duration-*` to `0.01ms` globally.

---

## 1. Content Collection & Schema

### 1.1 API shape — use the Content Layer `glob()` loader (NOT legacy folders)

Astro 5+ (and thus the repo's Astro 7) removed the legacy `type: 'content'` collection API. Lessons must use the **Content Layer `glob` loader** from `astro/loaders`. Config file stays at the spec's `src/content/config.ts` path (Astro still auto-detects it there; `src/content.config.ts` also works — keep the spec's location, leave a one-line comment noting both are valid).

**`src/content/config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const bigO = z.string().regex(/^O\(.+\)$/, 'Complexity must be Big-O, e.g. "O(log n)"');

const lessons = defineCollection({
  // `base` is resolved from the PROJECT ROOT, not this file. Content Layer, not legacy folders.
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
    track: z.enum(['foundations', 'algorithms']),
    order: z.number().int().positive(),
    summary: z.string(),
    difficulty: z.enum(['beginner', 'intermediate']),
    prerequisites: z.array(z.string()).default([]),
    estimatedMinutes: z.number().int().positive(),
    complexity: z.object({
      time: z.object({ best: bigO, average: bigO, worst: bigO }),
      space: z.object({ worst: bigO }),
    }),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(false),
  }),
});

export const collections = { lessons };
```

Notes:
- Schema matches §7 frontmatter **exactly** — no extra fields (no invented scope). The two `.regex()` and `bigO` validators are guardrails the spec implies ("complexity claims must match", "slug unique"); they only tighten, never widen, the contract.
- `published` defaults `false` per §15 ("placeholder lessons clearly marked"). Binary Search ships `published: true`.
- **Uniqueness of `slug`** is not enforceable inside Zod (per-entry). Enforce it in `[slug].astro`'s `getStaticPaths` by building a `Set` and throwing on collision — cheap build-time guard. `// SPEC-GAP:` note it there.

### 1.2 Routing & render — `src/pages/learn/[slug].astro`

Content Layer changed the render call: `entry.render()` is gone; use `render(entry)` from `astro:content`. Entries have `id` (from filename), not `slug` — we route off frontmatter `data.slug`.

```ts
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const lessons = await getCollection('lessons', ({ data }) => data.published);
  // build-time uniqueness guard (Zod can't do cross-entry) — throw on dup slug
  return lessons.map((entry) => ({ params: { slug: entry.data.slug }, props: { entry } }));
}
const { entry } = Astro.props;
const { Content, headings } = await render(entry);
```

`LessonLayout` receives `entry.data` (frontmatter → breadcrumb/track/complexity table/prev-next/reading-time) and `headings` (→ `TableOfContents`). Body renders via `<Content />`, which is where MDX `<Visualizer/>` islands live. Prev/next derive from `getCollection` sorted by `order` within `track`.

Filter to `published` in `getStaticPaths` so `published:false` lessons build no page (matches §17/M4 acceptance). MDX components (`Visualizer`, `CodeTabs`, etc.) are provided to the collection body via the `components` prop on `<Content components={{...}} />` **or** imported directly in each `.mdx`; recommend per-`.mdx` imports for M2 (explicit, tree-shake-friendly, one lesson only).

**ADR-1 — Content Layer glob loader.** *Context:* Astro 7 dropped legacy collections; §7 mandates Content Collections + typed schema. *Decision:* `glob()` loader + Zod. *Pros:* type-safe frontmatter surfaced into `Astro.props`, build-time validation fails fast, future-proof. *Cons:* (1) `entry.id`≠`slug` requires the explicit `data.slug` routing indirection above — a subtle trap for the next contributor; (2) `render()`-from-`astro:content` differs from every pre-Astro-5 tutorial, so copy-pasted examples will break. Mitigate both with the code above + inline comments.

---

## 2. Viz Core Types (`src/viz/core/`)

Finalized interfaces — these are the §11.2 shapes with the generic parameterization pinned down. One file `src/viz/core/types.ts`.

```ts
/** A stable renderer-element id, e.g. array cell "i3", node "n5". String by design so
 *  highlights/renderers agree on a name without sharing structure. */
export type ElementId = string;

export interface Highlight {
  kind: 'compare' | 'swap' | 'active' | 'visited' | 'frontier'
      | 'found' | 'insert' | 'delete' | 'pointer' | 'range';
  ids: ElementId[];
  meta?: Record<string, unknown>;
}

export interface Step<TState = unknown> {
  state: TState;                      // FULL deep-copied snapshot at this point
  highlights?: Highlight[];
  explanation: string;                // one line; also fed to aria-live
  metrics?: Record<string, number>;   // cumulative-to-here, e.g. { comparisons: 3 }
}

export type Trace<TState = unknown> = Step<TState>[];

export interface Algorithm<TInput, TState> {
  id: string;
  run(input: TInput): Trace<TState>;
  defaultInput(): TInput;
  parseInput(raw: string): TInput | { error: string };
}

export interface Renderer<TState> {
  mount(container: HTMLElement): void;
  render(step: Step<TState>): void;   // idempotent: same step → same SVG
  destroy(): void;
}
```

### 2.1 Id flow (algorithm → highlight → renderer)

Ids are **pure convention, never shared objects** — this is what keeps core ignorant of both algorithms and renderers:

- The **renderer** owns the id scheme and documents it (`ArrayRenderer`: cell at index `n` → `i${n}`).
- The **algorithm** constructs the same strings when emitting highlights (`{ kind:'compare', ids:['i'+mid] }`). It does not import the renderer.
- The **contract** between them is a one-line doc comment on each renderer ("consumes ids `i0..iN`"). A mismatch is caught by e2e (highlight targets nothing) and by unit tests asserting emitted ids.

This is the deliberate trade-off: string coupling is stringly-typed (a typo isn't a compile error) in exchange for zero structural dependency between the two layers. Mitigation: renderers export a `cellId(i: number) => \`i${i}\`` helper that algorithms *may* import (type-safe, still no structural coupling) — recommended but optional.

### 2.2 Deep-copy strategy — `structuredClone`, centralized

**Decision:** one helper `src/viz/core/snapshot.ts` → `export const snapshot = <T>(s: T): T => structuredClone(s);`. Algorithms call `snapshot(state)` when pushing each Step.

- **Availability:** `structuredClone` is global in Node ≥ 17 (repo is Node ≥ 20) and in Vitest's `node` environment, and in every browser Astro targets (baseline since 2022). No polyfill, no dependency.
- **Why over `JSON.parse(JSON.stringify())`:** JSON round-trips silently drop `undefined`, `Map`, `Set`, and turn `NaN`/`Infinity` into `null` — future renderers (graphs, heaps) will use `Map`/`Set`, and DP tables use sparse cells. `structuredClone` preserves them. **Why over hand-written immutable builders:** far less code, no per-algorithm bug surface, and at our input caps (arrays ≤ 30, graph nodes ≤ 15) the perf cost is negligible.
- **Cons:** (1) `structuredClone` throws on functions/DOM/class instances — so **state must be plain data only** (enforce by convention + review; it's also just good design for snapshots). (2) It's slightly slower than a targeted shallow copy — irrelevant at these caps but worth a comment so nobody "optimizes" it into a shared-reference bug.

**Centralizing in one helper** means M3 can swap the strategy in exactly one place if a renderer ever needs a class instance.

### 2.3 Metrics accumulation

Algorithm keeps a plain counter object (`let metrics = { comparisons: 0 }`), increments as it runs, and on every `push` emits `metrics: { ...metrics }` (spread = shallow copy; counters are flat numbers so no deep copy needed). Each Step therefore carries the **cumulative** metric value *at that step* — stepping backward shows historically-correct counts for free. The Visualizer displays `currentStep.metrics` when `showMetrics` is on.

---

## 3. Player (`src/viz/core/player.ts`) — algorithm-agnostic controller

Pure controller over a precomputed `Trace`. Knows nothing about arrays, binary search, or SVG — only "trace + renderer + an index."

```ts
export interface PlayerOptions<TState> {
  trace: Trace<TState>;
  renderer: Renderer<TState>;
  onStep?: (i: number, step: Step<TState>) => void; // island updates aria-live/slider/metrics
  onPlayStateChange?: (playing: boolean) => void;
}

export class Player<TState> {
  // state
  private index = 0;
  private playing = false;
  private speed = 1;            // 0.5–3, maps to interval delay
  private timer: number | null = null;

  // API
  play(): void; pause(): void; toggle(): void;
  stepForward(): void; stepBackward(): void;
  reset(): void;                        // → index 0, pause
  seek(i: number): void;                // scrub slider (clamped)
  setSpeed(mult: number): void;         // clamp 0.5–3
  loadTrace(trace: Trace<TState>): void;// custom-input recompute swaps trace + reset
  get currentIndex(): number; get length(): number; get isPlaying(): boolean;
}
```

**How it drives the renderer:** the only place that touches SVG is one private `draw()` → `this.renderer.render(this.trace[this.index])` then `onStep(...)`. Every public method mutates `index`/`playing` and calls `draw()`. Backward stepping is `index-- ; draw()` — trivial because the full trace is precomputed (§11 core promise).

**Timer model — `setTimeout` self-rescheduling, NOT `requestAnimationFrame`.** Steps are *discrete*: Player advances one precomputed step per tick; the *visual tween between states is CSS's job* (renderer sets target attributes, CSS transitions animate). rAF is for per-frame interpolation we explicitly don't do. `play()` schedules `setTimeout(tick, BASE_DELAY / speed)` where `BASE_DELAY ≈ 900ms`; each `tick` advances one step and reschedules, stopping (auto-pause) at the last step. Self-reschedule (not `setInterval`) avoids drift and overlapping ticks when a render is slow.

**`prefers-reduced-motion`:** the Player still auto-advances (that's user-requested playback, not decorative motion) — but the *CSS transitions already snap* because `tokens.css` collapses `--duration-*` to `0.01ms` under the media query. So no Player-side branching is needed for correctness; the renderer inherits snap-vs-tween from CSS. Keep it simple: no reduced-motion branch in Player.

**Purity guarantee:** Player imports only `./types`. It has zero references to any algorithm or renderer concrete type — parameterized by `TState`. This is what lets M3 reuse it unchanged for every future structure.

---

## 4. Registry (`src/viz/registry.ts`) — the M3 seam

**This is the file that makes "one file + one registry entry" real.** It maps a string id to **lazy dynamic-import thunks**, so per-page bundles code-split to only what that page's Visualizer references.

```ts
import type { Algorithm, Renderer } from './core/types';

// Each value is a THUNK returning a dynamic import → Vite code-splits per entry.
export const algorithms = {
  'binary-search': () => import('./algorithms/binary-search').then((m) => m.binarySearch),
} satisfies Record<string, () => Promise<Algorithm<unknown, unknown>>>;

export const renderers = {
  array: () => import('./renderers/ArrayRenderer').then((m) => m.ArrayRenderer),
} satisfies Record<string, () => Promise<new () => Renderer<unknown>>>;

export type AlgorithmId = keyof typeof algorithms;
export type RendererId = keyof typeof renderers;
```

**Why lazy import thunks, not a static object of instances:** a static `{ 'binary-search': binarySearch }` would pull *every* registered algorithm and renderer into *every* page that imports the registry — blowing the 60 KB/page budget as the catalog grows to 15 lessons. Thunks mean Vite emits a separate chunk per algorithm/renderer, and the Visualizer's dynamic import fetches only the two chunks a given lesson names. The registry module itself is tiny (just the map).

**Type-safety:** `satisfies` keeps the map's shape checked without widening the literal key type, so `AlgorithmId`/`RendererId` are exact string-literal unions. The Visualizer validates its `algorithm`/`renderer` props against these at build time (Astro/TS) where possible, and at runtime (island can't statically know the MDX string) falls back to a friendly "unknown visualization" render.

**M3 contract (make this literally true):** to add an algorithm in M3, the Frontend-Engineer (a) drops `src/viz/algorithms/foo.ts` exporting `Algorithm`, and (b) adds one line to `algorithms`. If it reuses an existing renderer, that's it — no other file changes. New structure family = also one renderer file + one line in `renderers`. Document this as a header comment in `registry.ts`.

**ADR-2 — Lazy thunk registry.** *Context:* one registry, 15+ future algorithms, hard 60 KB/page JS budget. *Decision:* registry values are `() => import(...)` thunks; Visualizer dynamically imports on demand. *Pros:* per-page JS scales with what the page uses, not the catalog; clean M3 one-line extension seam. *Cons:* (1) adds one async hop before first render (mitigated: island shows the static fallback until the chunk resolves — see §5); (2) the runtime string lookup can't be exhaustively type-checked against MDX prop strings, so a typo in `.mdx` surfaces only at runtime — mitigated by the friendly-error path and an e2e assertion.

---

## 5. Visualizer Island (`src/viz/Visualizer.astro` + client script)

### 5.1 MDX-facing props (§11.3)

```ts
interface Props {
  algorithm: string;             // registry AlgorithmId
  renderer: string;              // registry RendererId
  input?: string;                // e.g. "[1,3,5,7,9,11] target=7"; else algorithm.defaultInput()
  allowCustomInput?: boolean;    // default true
  showMetrics?: boolean;         // default true
}
```

The `.astro` renders a static container carrying these as `data-*` attributes plus the full control-set markup and the fallback (below). No framework — vanilla Astro island via a bundled `<script>` (matches the ThemeToggle pattern).

### 5.2 Vanilla-Astro hydration & code-split mechanism (important)

Astro `client:*` directives apply only to framework components; a vanilla-TS island hydrates through a bundled `<script>` tag. To get `client:visible`-style deferral **and** per-page code-splitting, the script does it explicitly:

1. Astro bundles the small shared controller script into the page (deduped across pages).
2. On load it finds each `[data-viz]` container and attaches an **`IntersectionObserver`** (manual `client:visible`): nothing heavy loads until the viz scrolls near the viewport.
3. On first intersection it reads `data-algorithm`/`data-renderer`, calls the registry **thunks** → dynamic-imports exactly those two chunks, then runs the mount sequence.

This yields: near-zero eager JS (just the tiny observer/controller), the algorithm+renderer chunks fetched lazily only for lessons that have a viz, and full code-splitting. **JS-budget implication:** the 60 KB/page gzip ceiling is comfortably met — the shared controller + Player + core is a few KB; ArrayRenderer + binary-search are small; nothing from the *other* 14 lessons loads.

**ADR-3 — Manual IntersectionObserver + dynamic import instead of `client:*`.** *Pros:* works with vanilla TS (no framework dep, honoring §4 "no component UI kit"), defers + splits JS, one shared script across the whole site. *Cons:* (1) we hand-roll observer/cleanup that a framework directive would give free — more code to test; (2) a race if the user scrolls to the viz before the chunk loads — mitigated because the static fallback is already interactive-looking and we show a brief "loading visualization…" state, and controls are disabled until `ready`.

### 5.3 Mount sequence

```
observe container → on intersect:
  1. algo    = await registry.algorithms[algoId]()      // dynamic import
  2. Renderer= await registry.renderers[rendererId]()
     (unknown id → render friendly "Visualization unavailable" box, stop)
  3. input   = props.input ? algo.parseInput(props.input) : algo.defaultInput()
     (parse error on the AUTHORED input is a build/dev bug → show error box)
  4. trace   = algo.run(input)
  5. renderer= new Renderer(); renderer.mount(svgContainer)
  6. player  = new Player({ trace, renderer, onStep, onPlayStateChange })
  7. player.reset()   // renders step 0, sets aria-live to step 0 explanation
  8. wire controls (buttons/slider/speed/custom-input) → player methods
  9. mark container data-viz-ready → enable controls
```

### 5.4 Custom-input flow (§11.3)

On submit of the custom-input field (only present if `allowCustomInput`):
```
result = algo.parseInput(raw)
  valid   → player.loadTrace(algo.run(result)); player.reset(); clear error
  invalid → show result.error in an inline aria-describedby error node;
            KEEP the previous trace/player intact (no reset, no blank viz)
```
The error node is `role="alert"` / tied to the input via `aria-describedby` so screen readers announce it; the input gets `aria-invalid="true"`. This satisfies §10 "validate input and show friendly errors."

### 5.5 JS-off / pre-hydration fallback (§17 acceptance — CRITICAL)

The `.astro` renders **real static HTML** so the page is useful with JS disabled and before the chunk hydrates:

- **Decision for M2:** the `.astro` draws a static `<svg>` of the initial state from the parsed `input` array alone (index labels + values, no highlights) — no algorithm run at build time needed. This keeps the generic island decoupled from concrete algorithm modules while still showing a real initial array, not a placeholder box. `// SPEC-GAP:` note the choice (the richer alternative — build-time `run(defaultInput())` to emit step 0's full SVG — is available later if a lesson needs it).
- Below the static SVG: a line "Enable JavaScript to play, step, and run this on your own input." and the control buttons rendered `disabled` (so keyboard users see the affordance; JS enables them on ready).
- **The prose above/below the viz is plain MDX → always readable JS-off.** The viz is the only degrading element, exactly per §4/§17.

This gives the §17 acceptance: *"page works with JS off (viz shows a static fallback)."*

---

## 6. ArrayRenderer (`src/viz/renderers/ArrayRenderer.ts`) — first renderer

Dumb, `viewBox`-based SVG renderer. Implements `Renderer<TState>` (M2 state carries the array + lo/mid/hi; §11.5 renderer draws what it's told).

- **`mount(container)`:** creates one `<svg viewBox="0 0 W H" preserveAspectRatio>` (no fixed px width — responsive per §11.5), width derived from array length. Caches the container.
- **Element ids:** cell group `i${index}` (rect + value text + index label), exported helper `export const cellId = (i: number) => \`i${i}\`` so algorithms can reuse it type-safely (§2.1).
- **`render(step)`:** reads `step.state` (the array) to (re)draw/position cells, then applies `step.highlights` by toggling a CSS class per cell. **Idempotent** — same step in → same DOM out (simplest for M2: clears highlight classes then re-applies from this step; redraw values). At ≤ 30 cells a full re-attribute per render is fine.
- **Highlight-kind → token mapping** (uses the existing Tailwind `hl-*` colors / `--hl-*` vars):

| Highlight kind | Visual | Token |
|---|---|---|
| `compare` | cell outline/fill accent | `--hl-compare` |
| `swap` | cell accent | `--hl-swap` |
| `active` (mid pointer) | strong outline + "mid" label | `--hl-active` |
| `found` | filled success | `--hl-found` |
| `range` (lo..hi window) | subtle band behind in-range cells | `--hl-active` at low alpha (band), **plus** an out-of-range dimming class on excluded cells |

- **Never color-only (§10/§12):** each highlight also gets a **text label / marker** — `mid`, `lo`, `hi` printed under the relevant cells, and excluded cells visibly dimmed (opacity), so the search window reads without color. SVG `<title>`/`<desc>` on the root describe the current state for AT.
- **CSS transitions + reduced-motion:** the renderer only sets target classes/attributes; movement & color tween via CSS `transition` on the cell using `--duration-base`/`--ease-standard`. Because `tokens.css` already collapses `--duration-*` to `0.01ms` under `prefers-reduced-motion`, the renderer needs **no motion branch** — it snaps automatically. Keep the renderer free of any `matchMedia` logic.
- **Stable ids enable smooth tweening:** because cell `i3` persists across renders, CSS animates its color/position change instead of teardown/rebuild.

---

## 7. Binary Search Algorithm (`src/viz/algorithms/binary-search.ts`)

```ts
export interface BinarySearchInput { array: number[]; target: number; }
export interface BinarySearchState {
  array: number[];
  lo: number; mid: number | null; hi: number;  // current search window + probe
  foundIndex: number | null;
}
export const binarySearch: Algorithm<BinarySearchInput, BinarySearchState> = { ... };
```

- **`run(input)`** — recognizable iterative binary search (§11.4: reader can map it to the code sample). Emits **one Step per compare**: set `mid = (lo+hi)>>1`, snapshot state, highlight `range` over `lo..hi` + `active` on `mid`, `explanation` like *"Search window is indices 2–5; check middle index 3 (value 7)."* Increment `comparisons` metric each compare.
  - target **found:** final Step sets `foundIndex = mid`, highlight `{ kind:'found', ids:['i'+mid] }`, explanation *"Found 5 at index 2."* ← **M2 acceptance: `[1,3,5,7] target=5` ends in a `found` highlight.**
  - target **absent:** loop ends `lo > hi`; final Step has an **empty range** (no in-window cells) and explanation *"Search window is empty — 9 is not in the array."* No `found` highlight. ← **M2 acceptance.**
  - Every pushed Step deep-copies via `snapshot()` (§2.2) so earlier windows aren't corrupted.
- **`defaultInput()`** → `{ array: [1,3,5,7,9,11], target: 7 }` (matches §11.3 example; present target → nice `found` ending for the default view).
- **`parseInput(raw)`** for `"[1,3,5,7] target=5"`:
  - Parse `[...]` → integer array; parse `target=<int>`.
  - **Validation + friendly errors** (return `{ error }`, never throw):
    - malformed → `"Type an array and target, e.g. [1,3,5,7] target=5"`
    - non-integers → `"Use whole numbers only, e.g. [1,3,5,7]"`
    - **cap:** length > 30 → `"Keep the array to 30 numbers or fewer."` (enforces §11.4 / CLAUDE.md array ≤ 30)
    - missing `target=` → `"Add a target, e.g. … target=5"`
    - **sorted precondition:** if not non-decreasing → `"Binary search needs a sorted array — try [1,3,5,7]."` `// SPEC-GAP:` spec doesn't say whether to auto-sort or reject; **reject** chosen because the lesson *teaches* the sorted precondition, so surfacing it is pedagogically correct. Flag for review.
  - On success returns `BinarySearchInput`.

---

## 8. File / Module Boundaries (§16) — M2 file list

| File | Responsibility |
|---|---|
| `src/content/config.ts` | Lessons collection: glob loader + Zod schema (§1). |
| `src/content/lessons/binary-search.mdx` | The one authored lesson (7 sections), embeds `<Visualizer algorithm="binary-search" renderer="array" .../>`. |
| `src/layouts/LessonLayout.astro` | Wraps MDX: breadcrumb, sticky ToC (from `headings`), prev/next, complexity table, mark-complete, reading-time. |
| `src/pages/learn/[slug].astro` | `getStaticPaths` over published lessons (+ slug-uniqueness guard); `render(entry)`; feeds `LessonLayout`. |
| `src/viz/core/types.ts` | `Step`/`Highlight`/`Trace`/`Algorithm`/`Renderer`/`ElementId` (§2). |
| `src/viz/core/snapshot.ts` | `snapshot()` deep-copy helper (structuredClone). |
| `src/viz/core/player.ts` | `Player` controller (§3). |
| `src/viz/registry.ts` | Lazy thunk registry `algorithms`/`renderers` + `AlgorithmId`/`RendererId` (§4). |
| `src/viz/algorithms/binary-search.ts` | Binary Search `Algorithm` (§7). |
| `src/viz/renderers/ArrayRenderer.ts` | Array SVG renderer + `cellId` helper (§6). |
| `src/viz/Visualizer.astro` | Island: props, static fallback, controls markup, bundled client script (observer + dynamic import + wiring) (§5). |
| `src/components/ComplexityTable.astro` | Renders `frontmatter.complexity` (§9) — small, needed by LessonLayout. |

**Dependency direction (strictly one-way):**
```
core/types  ← core/player, core/snapshot          (core knows nothing else)
core/*      ← algorithms/*, renderers/*            (they import core types only)
algorithms/*, renderers/*  ← registry.ts           (registry wires them, lazily)
registry.ts ← Visualizer.astro client script       (island consumes registry)
```
core imports **nothing** from algorithms/renderers/registry/island. Algorithms and renderers never import each other (only the shared `cellId` helper is allowed renderer→algorithm, and it's a pure string fn — see §2.1). This is what makes the M3 one-file extension safe.

**New dependencies:** **zero.** structuredClone is a platform global; SVG is hand-rolled; Zod ships with Astro (`astro:content`). No `// SPEC-GAP:` for deps needed. (SPEC-GAP notes are only the localized ones flagged above: slug-uniqueness guard, static-fallback variant, sorted-array rejection.)

---

## 9. Testability Handoff

**QA-Engineer — Unit (Vitest, `tests/unit/**/*.test.ts`, `node` env — no DOM needed for these):**
- `binary-search.test.ts` (§11.4 required):
  - `run({array:[1,3,5,7], target:5})` → **final Step has a `found` highlight** on the correct index; final `state.foundIndex` correct.
  - `run` with **absent target** → final Step has **empty range** and explanation contains "not found"/"not in the array"; no `found` highlight anywhere.
  - Snapshot integrity: mutate a returned step's `state.array` → earlier steps' arrays unchanged (proves deep-copy).
  - `parseInput`: valid string → correct `{array,target}`; each error case → the exact friendly message; length 31 → cap error; unsorted → sorted-precondition error.
  - metrics: `comparisons` is monotonic non-decreasing across steps.
- `player.test.ts` (uses a **fake Renderer** capturing rendered step indices — no SVG): stepForward/back clamp at bounds; `seek` clamps; `reset` → index 0; `loadTrace` swaps + resets; `setSpeed` clamps 0.5–3; play auto-pauses at last step (use fake timers).
- `snapshot.test.ts`: nested array/object cloned, no shared refs.

**QA-Engineer — E2E (Playwright, `tests/e2e`):**
- `/learn/binary-search` renders all 7 sections.
- Viz controls: play/pause, step ±, reset, speed, scrub slider all move the state; `aria-live` region updates with the step explanation.
- Custom input: `[1,3,5,7]` target `5` → trace ends on a cell marked found; **invalid** input → inline error shown, previous viz still present.
- **JS-off** (Playwright `javaScriptEnabled: false`): prose + code readable; viz shows the static initial SVG + "enable JS" message; controls present but disabled.
- axe a11y on the lesson page — zero critical violations (feeds §18 / M5).

---

## Failure Scenarios & Graceful Degradation

| Failure | Behavior |
|---|---|
| **JS disabled** | Prose/code fully readable; Visualizer shows static initial-state SVG + "enable JS to interact"; controls disabled. (§5.5) |
| **Registry chunk load fails / unknown id** | Island renders "Visualization unavailable" box, page otherwise intact; static fallback remains. (§4/§5.3) |
| **Invalid custom input** | Inline `role="alert"` error, `aria-invalid`; previous trace kept — never blanks the viz. (§5.4) |
| **Authored `input` prop malformed** | Build/dev-visible error box (author bug, caught before ship). |
| **Oversized input (>30 / >15)** | `parseInput` rejects with friendly cap message; trace never runs unbounded. |
| **Snapshot aliasing bug** | Guarded by centralized `structuredClone` + a unit test asserting earlier steps are immutable. |

---

**Open SPEC-GAPs for human review (do not block M2):** (1) slug cross-entry uniqueness enforced in `getStaticPaths`, not Zod; (2) static fallback = array-from-`input` SVG vs full build-time `run()` — recommend the simpler array variant; (3) `parseInput` **rejects** unsorted arrays rather than auto-sorting, to teach the precondition.
