/**
 * Viz registry — the M3 extension seam (site spec §11.3, architecture §4).
 *
 * Maps a string id to a LAZY dynamic-import thunk. Because each value is a
 * `() => import(...)` thunk, Vite emits a separate chunk per algorithm/renderer,
 * and the Visualizer island fetches only the two chunks a given lesson names —
 * so per-page JS scales with what the page uses, not the whole catalog (keeping
 * the per-page JS budget as lessons grow). The registry module itself is tiny.
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
  // M4 Foundations batch 1 (site spec §5 L1–L5).
  // renderer="chart"
  'growth-rates': () =>
    import('./algorithms/growth-rates').then((m) => m.growthRates),
  // renderer="array"
  'array-operations': () =>
    import('./algorithms/array-operations').then((m) => m.arrayOperations),
  // renderer="linkedList"
  'linked-list-operations': () =>
    import('./algorithms/linked-list-operations').then(
      (m) => m.linkedListOperations,
    ),
  // renderer="stack"
  'stack-operations': () =>
    import('./algorithms/stack-operations').then((m) => m.stackOperations),
  // renderer="queue"
  'queue-operations': () =>
    import('./algorithms/queue-operations').then((m) => m.queueOperations),
  // M4 Foundations batch 2 (site spec §5 L6–L9).
  // renderer="hashTable"
  'hash-table-operations': () =>
    import('./algorithms/hash-table-operations').then(
      (m) => m.hashTableOperations,
    ),
  // renderer="tree"
  'bst-operations': () =>
    import('./algorithms/bst-operations').then((m) => m.bstOperations),
  // renderer="heap"
  'heap-operations': () =>
    import('./algorithms/heap-operations').then((m) => m.heapOperations),
  // renderer="graph"
  'graph-representations': () =>
    import('./algorithms/graph-representations').then(
      (m) => m.graphRepresentations,
    ),
  // M4 Algorithms batch 3 (site spec §5 L10–L14).
  // renderer="callStack"
  'recursion-callstack': () =>
    import('./algorithms/recursion-callstack').then(
      (m) => m.recursionCallStack,
    ),
  // renderer="bars" — Sorting I
  'bubble-sort': () =>
    import('./algorithms/bubble-sort').then((m) => m.bubbleSort),
  'selection-sort': () =>
    import('./algorithms/selection-sort').then((m) => m.selectionSort),
  'insertion-sort': () =>
    import('./algorithms/insertion-sort').then((m) => m.insertionSort),
  // renderer="bars" — Sorting II
  'merge-sort': () =>
    import('./algorithms/merge-sort').then((m) => m.mergeSort),
  'quick-sort': () =>
    import('./algorithms/quick-sort').then((m) => m.quickSort),
  // renderer="graph" — Graph Traversal
  bfs: () => import('./algorithms/bfs').then((m) => m.bfs),
  dfs: () => import('./algorithms/dfs').then((m) => m.dfs),
  // M6 (stretch) — Dynamic Programming (site spec §5 L15). renderer="table".
  'dp-fib-tabulation': () =>
    import('./algorithms/dp-fib-tabulation').then((m) => m.dpFibTabulation),
  'dp-fib-memoization': () =>
    import('./algorithms/dp-fib-memoization').then((m) => m.dpFibMemoization),
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
  'demo-hashtable': () =>
    import('./algorithms/demos').then((m) => m.demoHashTable),
  'demo-table': () => import('./algorithms/demos').then((m) => m.demoTable),
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
  // Separate-chaining hash table (site spec §5 L6); reuses the LinkedList layout.
  hashTable: () =>
    import('./renderers/HashTableRenderer').then((m) => m.hashTableRenderer),
  // 1-D dynamic-programming table (site spec §5 L15); forks the array cell.
  table: () => import('./renderers/TableRenderer').then((m) => m.tableRenderer),
} satisfies Record<string, () => Promise<RendererModule<unknown>>>;

/** Exact string-literal union of registered algorithm ids. */
export type AlgorithmId = keyof typeof algorithms;
/** Exact string-literal union of registered renderer ids. */
export type RendererId = keyof typeof renderers;

// ---------------------------------------------------------------------------
// Resolved modules (React migration, plan §5 P2 WS-I step 1)
//
// The Astro frontmatter could `await` a thunk in the middle of rendering; a
// React render cannot. So the modules a render needs are resolved FIRST and
// read synchronously afterwards: on the server `preloadVizRegistry()` resolves
// every thunk once before the first page renders, and in the browser the island
// registry's `load` resolves the two a given instrument names
// (`loadAlgorithm`/`loadRenderer`) before React renders it. Either way the
// component reads them through `loadedAlgorithm`/`loadedRenderer`, which never
// wait and never guess.
//
// The thunks above are unchanged and still the ONLY way a module is loaded, so
// each algorithm and renderer is still its own chunk in the client build: a
// lesson's island fetches the two it names and nothing else.
// ---------------------------------------------------------------------------

type AnyAlgorithm = Algorithm<unknown, unknown>;
type AnyRenderer = RendererModule<unknown>;

/** Resolved algorithms by id. */
const resolvedAlgorithms = new Map<string, AnyAlgorithm>();
/** Resolved renderer modules by id. */
const resolvedRenderers = new Map<string, AnyRenderer>();
/** The one in-flight (or finished) full preload; memoized so it runs once. */
let preloading: Promise<void> | null = null;

/**
 * Resolves one algorithm's chunk and remembers it.
 *
 * @param id - Registry algorithm id.
 * @returns The algorithm.
 * @throws When the id is not registered, or its chunk fails to load.
 */
export async function loadAlgorithm(id: string): Promise<AnyAlgorithm> {
  const known = resolvedAlgorithms.get(id);
  if (known) return known;
  const thunk = (algorithms as Record<string, () => Promise<AnyAlgorithm>>)[id];
  if (!thunk) throw new Error(`Unknown viz: algorithm="${id}"`);
  const algo = await thunk();
  resolvedAlgorithms.set(id, algo);
  return algo;
}

/**
 * Resolves one renderer's chunk and remembers it.
 *
 * @param id - Registry renderer id.
 * @returns The renderer module.
 * @throws When the id is not registered, or its chunk fails to load.
 */
export async function loadRenderer(id: string): Promise<AnyRenderer> {
  const known = resolvedRenderers.get(id);
  if (known) return known;
  const thunk = (renderers as Record<string, () => Promise<AnyRenderer>>)[id];
  if (!thunk) throw new Error(`Unknown viz: renderer="${id}"`);
  const rmod = await thunk();
  resolvedRenderers.set(id, rmod);
  return rmod;
}

/**
 * Resolves EVERY registered algorithm and renderer — the build's half. The
 * server render reads them synchronously afterwards; a build that cannot load
 * one of them fails here, before any page is written. Idempotent.
 *
 * @returns Resolves once every module is resolved.
 */
export function preloadVizRegistry(): Promise<void> {
  preloading ??= Promise.all([
    ...Object.keys(algorithms).map((id) => loadAlgorithm(id)),
    ...Object.keys(renderers).map((id) => loadRenderer(id)),
  ]).then(() => {});
  return preloading;
}

/**
 * An algorithm that has already been resolved, synchronously.
 *
 * @param id - Registry algorithm id.
 * @returns The algorithm.
 * @throws On an unregistered id (the legacy build-time message), or on a
 *   registered one nobody resolved first — a wiring bug, never a reader's.
 */
export function loadedAlgorithm(id: string): AnyAlgorithm {
  const algo = resolvedAlgorithms.get(id);
  if (algo) return algo;
  if (!(id in algorithms)) throw new Error(`Unknown viz: algorithm="${id}"`);
  throw new Error(
    `Viz algorithm "${id}" was read before it was resolved: await preloadVizRegistry() (server) or loadAlgorithm() (client) first.`,
  );
}

/**
 * A renderer module that has already been resolved, synchronously.
 *
 * @param id - Registry renderer id.
 * @returns The renderer module.
 * @throws On an unregistered id, or on one nobody resolved first.
 */
export function loadedRenderer(id: string): AnyRenderer {
  const rmod = resolvedRenderers.get(id);
  if (rmod) return rmod;
  if (!(id in renderers)) throw new Error(`Unknown viz: renderer="${id}"`);
  throw new Error(
    `Viz renderer "${id}" was read before it was resolved: await preloadVizRegistry() (server) or loadRenderer() (client) first.`,
  );
}
