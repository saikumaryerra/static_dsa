/**
 * Growth Rates — instrumented "algorithm" for the Complexity & Big-O lesson
 * (site spec §5 L1, §11.4). There is no classic algorithm here; instead we walk
 * the input size `n` from 1 up to `maxN`, emitting one `Step` per value of `n` so
 * the Player sweeps the chart's guide line across the plot and the reader watches
 * each growth function pull away from the others.
 *
 * TState matches ChartRenderer's `ChartState` ({ n, maxN, functions }); each step
 * highlights the O(n²) curve (`active`) — the one that "explodes" — via its stable
 * `curveId('n2')`. Imports only core types + `snapshot` + the pure `curveId`
 * helper (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { curveId } from '../core/ids';

/** The five growth functions the chart plots (mirrors ChartRenderer's GrowthFn). */
export type GrowthFn = '1' | 'logn' | 'n' | 'nlogn' | 'n2';

/** Typed input: how far to grow `n` before the sweep stops. */
export interface GrowthRatesInput {
  maxN: number;
}

/** Snapshot state ChartRenderer draws: the current `n`, the axis max, the curves. */
export interface GrowthRatesState {
  n: number;
  maxN: number;
  functions: GrowthFn[];
}

/** Sensible bounds on the custom `maxN` so the chart stays readable. */
const MIN_MAX_N = 2;
const MAX_MAX_N = 40;

/** The full set of curves, drawn on every step (the chart's fixed backdrop). */
const ALL_FUNCS: GrowthFn[] = ['1', 'logn', 'n', 'nlogn', 'n2'];

/** Operation count for each growth function at size `n` (rounded for display). */
const opsAt = (n: number): Record<GrowthFn, number> => ({
  '1': 1,
  logn: Math.max(1, Math.round(Math.log2(n))),
  n,
  nlogn: Math.round(n * Math.log2(Math.max(n, 2))),
  n2: n * n,
});

/**
 * Sweeps `n` from 1 to `input.maxN`, emitting one `Step` per value. Each step
 * deep-copies its state via `snapshot()` (site spec §11.4) and reports the live
 * operation counts as metrics so the reader can compare the numbers, not just the
 * shapes. The O(n²) curve is emphasized throughout to anchor the "watch this one"
 * story the prose tells.
 */
function run(input: GrowthRatesInput): Trace<GrowthRatesState> {
  const maxN = Math.min(Math.max(Math.trunc(input.maxN), MIN_MAX_N), MAX_MAX_N);
  const trace: Trace<GrowthRatesState> = [];
  const emphasizeQuadratic: Highlight = {
    kind: 'active',
    ids: [curveId('n2')],
  };

  for (let n = 1; n <= maxN; n += 1) {
    const ops = opsAt(n);
    const explanation =
      `At n=${n}: O(1)=1, O(log n)≈${ops.logn}, O(n)=${n}, ` +
      `O(n log n)≈${ops.nlogn}, O(n²)=${ops.n2} operations. ` +
      (n === 1
        ? 'They all start close together.'
        : 'Notice how O(n²) pulls away as n grows — that gap is what Big-O captures.');

    trace.push({
      state: snapshot({ n, maxN, functions: ALL_FUNCS }),
      explanation,
      highlights: [emphasizeQuadratic],
      // Two representative counts as pills; the explanation lists them all.
      metrics: { n, 'n²': ops.n2 },
    } satisfies Step<GrowthRatesState>);
  }

  return trace;
}

/**
 * Parses the custom-input box into a `maxN`. The generic Visualizer form submits
 * `"<value> target="`, so we ignore any `target=` tail and read the first whole
 * number as `maxN`, clamping it to a sane range. Returns `{ error }` (never
 * throws) when no number is present.
 */
function parseInput(raw: string): GrowthRatesInput | { error: string } {
  // Drop the generic form's "target=" tail; we only want the size field.
  const cleaned = raw.replace(/target\s*=\s*-?\d*/gi, '').trim();
  const match = cleaned.match(/-?\d+/);
  if (!match) {
    return { error: `Type a maximum n between ${MIN_MAX_N} and ${MAX_MAX_N}.` };
  }

  const value = Number(match[0]);
  if (value < MIN_MAX_N) {
    return { error: `Use a maximum n of at least ${MIN_MAX_N}.` };
  }
  if (value > MAX_MAX_N) {
    return { error: `Keep the maximum n to ${MAX_MAX_N} or fewer.` };
  }

  return { maxN: value };
}

/** The registered Growth Rates comparison. */
export const growthRates: Algorithm<GrowthRatesInput, GrowthRatesState> = {
  id: 'growth-rates',
  label: 'Big-O growth rates as n grows',
  run,
  defaultInput: () => ({ maxN: 16 }),
  parseInput,
};
