/**
 * Deterministic per-instance id counter for build-time components (H4).
 *
 * Astro frontmatter runs once per component instance, but a plain `let` there is
 * instance-local. This module's state persists across every render in a build, so
 * each call returns a distinct, monotonic number — giving components stable,
 * collision-free id bases WITHOUT `Math.random()` (which makes build output
 * non-deterministic). Callers prefix their own namespace, e.g. `ct-${nextUid()}`.
 */
let counter = 0;

/** Returns the next monotonic id number (1, 2, 3, …), unique within a build. */
export function nextUid(): number {
  counter += 1;
  return counter;
}
