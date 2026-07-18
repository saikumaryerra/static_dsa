/**
 * Centralized deep-copy helper for trace snapshots (architecture §2.2).
 *
 * Every algorithm calls `snapshot(state)` when pushing a `Step`, so that later
 * mutations of the working state never corrupt earlier steps (site spec §11.4).
 * Keeping this in ONE place means the copy strategy can be swapped in exactly
 * one spot if a future renderer ever needs a non-plain-data state.
 */

/**
 * Deep-copies a plain-data snapshot via the platform-global `structuredClone`.
 *
 * `structuredClone` is a global in Node ≥ 17 (repo is Node ≥ 20), in Vitest's
 * `node` environment, and in every browser the site targets — so no dependency
 * and no polyfill. It is preferred over `JSON.parse(JSON.stringify(...))`
 * because the latter silently drops `undefined`, `Map`, and `Set` and mangles
 * `NaN`/`Infinity` — all of which future structures (graphs, heaps, DP tables)
 * will rely on.
 *
 * Caveat: `structuredClone` throws on functions, DOM nodes, and class
 * instances, so snapshot state must be plain data only. That is also just good
 * design for immutable snapshots. Do not "optimize" this into a shallow copy —
 * that reintroduces the shared-reference bug this helper exists to prevent.
 *
 * @param state - A plain-data snapshot to clone.
 * @returns A structurally independent deep copy.
 */
export const snapshot = <T>(state: T): T => structuredClone(state);
