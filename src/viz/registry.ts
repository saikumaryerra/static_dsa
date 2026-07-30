/**
 * Viz registry — the M3 extension seam (site spec §11.3, architecture §4).
 *
 * Maps a string id to a LAZY dynamic-import thunk. Because each value is a
 * `() => import(...)` thunk, Vite emits a separate chunk per algorithm/renderer,
 * and the Visualizer island fetches only the two chunks a given lesson names —
 * so per-page JS scales with what the page uses, not the whole catalog (keeping
 * the ≤ 60 KB/page budget as lessons grow). The registry module itself is tiny.
 *
 * ── M3 extension contract (make "add an algorithm = one file + one line" true) ──
 *   To add an algorithm:
 *     1. Create `src/viz/algorithms/<id>.ts` exporting an `Algorithm`.
 *     2. Add ONE line to `algorithms` below: `'<id>': () => import(...).then(...)`.
 *   If it reuses an existing renderer, that's it — no other file changes.
 *   A new structure family also needs one renderer file + one line in `renderers`.
 *
 * Dependency direction: this module imports algorithms/renderers lazily; core
 * imports nothing from here (architecture §8).
 */
import type { Algorithm, RendererModule } from './core/types';

/** Algorithm id → thunk resolving to the `Algorithm` instance (own chunk). */
export const algorithms = {
  // renderer="array"
  'binary-search': () =>
    import('./algorithms/binary-search').then((m) => m.binarySearch),
  // renderer="array" — the seam proof: this line + one algorithm file, nothing else.
  'linear-search': () =>
    import('./algorithms/linear-search').then((m) => m.linearSearch),
  // Dev-only renderer fixtures for /dev/renderers (prod-gated). Not lessons.
  'demo-stack': () => import('./algorithms/demos').then((m) => m.demoStack),
  'demo-callstack': () =>
    import('./algorithms/demos').then((m) => m.demoCallStack),
  'demo-queue': () => import('./algorithms/demos').then((m) => m.demoQueue),
  'demo-linkedlist': () =>
    import('./algorithms/demos').then((m) => m.demoLinkedList),
  'demo-chart': () => import('./algorithms/demos').then((m) => m.demoChart),
  'demo-tree': () => import('./algorithms/demos').then((m) => m.demoTree),
  'demo-heap': () => import('./algorithms/demos').then((m) => m.demoHeap),
  'demo-graph': () => import('./algorithms/demos').then((m) => m.demoGraph),
} satisfies Record<string, () => Promise<Algorithm<unknown, unknown>>>;

/** Renderer id → thunk resolving to the `RendererModule` (own chunk). */
export const renderers = {
  array: () => import('./renderers/ArrayRenderer').then((m) => m.arrayRenderer),
  bars: () => import('./renderers/ArrayRenderer').then((m) => m.barsRenderer),
  stack: () => import('./renderers/StackRenderer').then((m) => m.stackRenderer),
  callStack: () =>
    import('./renderers/CallStackRenderer').then((m) => m.callStackRenderer),
  queue: () => import('./renderers/QueueRenderer').then((m) => m.queueRenderer),
  linkedList: () =>
    import('./renderers/LinkedListRenderer').then((m) => m.linkedListRenderer),
  chart: () => import('./renderers/ChartRenderer').then((m) => m.chartRenderer),
  tree: () => import('./renderers/TreeRenderer').then((m) => m.treeRenderer),
  heap: () => import('./renderers/HeapRenderer').then((m) => m.heapRenderer),
  graph: () => import('./renderers/GraphRenderer').then((m) => m.graphRenderer),
  // hashTable: deferred to M4 with its lesson (architecture §6).
} satisfies Record<string, () => Promise<RendererModule<unknown>>>;

/** Exact string-literal union of registered algorithm ids. */
export type AlgorithmId = keyof typeof algorithms;
/** Exact string-literal union of registered renderer ids. */
export type RendererId = keyof typeof renderers;
