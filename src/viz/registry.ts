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
import type { Algorithm, Renderer } from './core/types';

/** Algorithm id → thunk resolving to the `Algorithm` instance (own chunk). */
export const algorithms = {
  'binary-search': () =>
    import('./algorithms/binary-search').then((m) => m.binarySearch),
} satisfies Record<string, () => Promise<Algorithm<unknown, unknown>>>;

/** Renderer id → thunk resolving to the `Renderer` constructor (own chunk). */
export const renderers = {
  array: () => import('./renderers/ArrayRenderer').then((m) => m.ArrayRenderer),
} satisfies Record<string, () => Promise<new () => Renderer<unknown>>>;

/** Exact string-literal union of registered algorithm ids. */
export type AlgorithmId = keyof typeof algorithms;
/** Exact string-literal union of registered renderer ids. */
export type RendererId = keyof typeof renderers;
