/**
 * Element-id vocabulary (architecture §3, §M3 TD-3).
 *
 * The single source of the stable renderer-element ids that BOTH algorithms and
 * renderers name. An algorithm builds a `Highlight` targeting `cellId(3)`; the
 * renderer draws the cell with the same id — so the two layers agree without the
 * algorithm importing the renderer (the coupling M3 removes: `binary-search.ts`
 * now imports `cellId` from HERE, never from `ArrayRenderer`).
 *
 * This module imports nothing — it is a leaf of the one-way dependency graph
 * (architecture §3). Every id is a plain string, deliberately CSS-`id`-safe
 * (letter-prefixed, no spaces) so `querySelector('#'+id)` and `url(#id)` work.
 */

/** Array / linear-cell at index `i` → `"i3"`. Used by array, bars, heap-array. */
export const cellId = (i: number): string => `i${i}`;

/** Graph / tree / heap-tree node with id `i` → `"n5"`. */
export const nodeId = (i: number): string => `n${i}`;

/** Edge between nodes `a` and `b` → `"e2_5"` (directed: from `a` to `b`). */
export const edgeId = (a: number, b: number): string => `e${a}_${b}`;

/** Stack / queue / hash-table-bucket slot at index `i` → `"s2"`. */
export const slotId = (i: number): string => `s${i}`;

/**
 * Hash-table chain entry at bucket `b`, chain position `p` → `"h1_0"`. Buckets
 * themselves use {@link slotId}; this names the individual entries WITHIN a
 * bucket's chain so an algorithm and the HashTableRenderer agree on a colliding
 * entry without coupling (the same TD-3 contract every other id here serves). The
 * `h` prefix is distinct from `edgeId`'s `e`, so the two never alias.
 */
export const entryId = (b: number, p: number): string => `h${b}_${p}`;

/** Call-stack frame at depth `i` → `"f1"` (0 = bottom of the stack). */
export const frameId = (i: number): string => `f${i}`;

/** Value-scaled bar at index `i` → `"b4"` (bars variant's own vocabulary). */
export const barId = (i: number): string => `b${i}`;

/** Big-O curve for growth function `fn` (`"n2"`, `"logn"`, …) → `"c-n2"`. */
export const curveId = (fn: string): string => `c-${fn}`;
