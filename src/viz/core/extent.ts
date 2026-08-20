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
