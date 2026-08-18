/**
 * ChartRenderer — Big-O growth curves on an x–y plot (architecture §4.9,
 * design §2b.8). The CVD-critical renderer: five curves are told apart by SHAPE,
 * never colour.
 *
 * TState: { n; maxN; functions:('1'|'logn'|'n'|'nlogn'|'n2')[] }. Each step
 * advances `n`, sweeping a vertical guide line across the plot. Id scheme: each
 * curve is `curveId(fn)` (`"c-n2"`).
 *
 * Color-free meaning (design §2b.8): every curve is `--text-muted` 2.5px with a
 * distinct `stroke-dasharray` AND a direct end-of-line label — that pairing IS
 * the non-color marker. Emphasis: `active` → `is-emph` (`--hl-active` 3px, keeps
 * its dash); `compare` → `is-emph-compare`.
 */
import type { Extent, RendererModule, Step } from '../core/types';
import { curveId } from '../core/ids';
import { group, line, polygon, polyline, text } from '../core/svg';
import { createRenderer, renderStaticSvg, type Canvas } from './shared';

/** The five growth functions this chart can plot. */
export type GrowthFn = '1' | 'logn' | 'n' | 'nlogn' | 'n2';

/** State ChartRenderer draws. */
export interface ChartState {
  n: number;
  maxN: number;
  functions: GrowthFn[];
}

/** Value, dash pattern, and end label per growth function (design §2b.8). */
const FUNCS: Record<
  GrowthFn,
  { f: (x: number) => number; dash: string; label: string }
> = {
  '1': { f: () => 1, dash: '', label: 'O(1)' },
  logn: { f: (x) => Math.log2(Math.max(x, 1)), dash: '2 5', label: 'O(log n)' },
  n: { f: (x) => x, dash: '8 5', label: 'O(n)' },
  nlogn: {
    f: (x) => x * Math.log2(Math.max(x, 1)),
    dash: '12 4 2 4',
    label: 'O(n log n)',
  },
  n2: { f: (x) => x * x, dash: '2 3 10 3', label: 'O(n²)' },
};

// --- Geometry ---
const PLOT_X0 = 40;
const PLOT_Y0 = 18;
const PLOT_W = 360;
const PLOT_H = 220;
const RIGHT = 96; // reserved for end-of-line labels
const ORIGIN_Y = PLOT_Y0 + PLOT_H;
const WIDTH = PLOT_X0 + PLOT_W + RIGHT;
const HEIGHT = ORIGIN_Y + 34;

/**
 * The natural box for one step. Extracted from `draw` (which now calls it) so a
 * caller can reduce a trace to its extent without building any markup.
 *
 * Takes no step BY DESIGN: the plot is a fixed frame and the curves are scaled
 * INTO it, so every step of every chart trace measures the same and freezing the
 * extent is a no-op here by construction. (Assignable to `RendererModule.measure`
 * — a function may declare fewer parameters than its contract passes.)
 */
const measure = (): Extent => ({ w: WIDTH, h: HEIGHT });

function draw(step: Step<ChartState>): Canvas {
  const { maxN, functions } = step.state;
  const n = Math.max(1, Math.min(step.state.n, maxN));
  const enabled = functions.length > 0 ? functions : (['1'] as GrowthFn[]);

  // Auto-scale y to the tallest enabled curve at maxN.
  const yMax = Math.max(1, ...enabled.map((fn) => FUNCS[fn].f(maxN)));
  const xPix = (x: number): number => PLOT_X0 + (x / maxN) * PLOT_W;
  const yPix = (v: number): number => ORIGIN_Y - (v / yMax) * PLOT_H;

  const active = new Set<string>();
  const compare = new Set<string>();
  for (const h of step.highlights ?? []) {
    if (h.kind === 'active') for (const id of h.ids) active.add(id);
    else if (h.kind === 'compare') for (const id of h.ids) compare.add(id);
  }

  // --- Axes + arrowheads (design §2b.8) ---
  let structure =
    line({
      class: 'viz-axis',
      x1: PLOT_X0,
      x2: PLOT_X0,
      y1: PLOT_Y0 - 6,
      y2: ORIGIN_Y,
    }) +
    line({
      class: 'viz-axis',
      x1: PLOT_X0,
      x2: PLOT_X0 + PLOT_W + 6,
      y1: ORIGIN_Y,
      y2: ORIGIN_Y,
    }) +
    polygon({
      class: 'viz-arrow',
      points: `${PLOT_X0},${PLOT_Y0 - 12} ${PLOT_X0 - 4},${PLOT_Y0 - 4} ${PLOT_X0 + 4},${PLOT_Y0 - 4}`,
    }) +
    polygon({
      class: 'viz-arrow',
      points: `${PLOT_X0 + PLOT_W + 12},${ORIGIN_Y} ${PLOT_X0 + PLOT_W + 4},${ORIGIN_Y - 4} ${PLOT_X0 + PLOT_W + 4},${ORIGIN_Y + 4}`,
    }) +
    text('operations', {
      class: 'viz-axis-label',
      x: PLOT_X0 - 6,
      y: PLOT_Y0 - 8,
      'text-anchor': 'start',
    }) +
    text('n', {
      class: 'viz-axis-label',
      x: PLOT_X0 + PLOT_W + 14,
      y: ORIGIN_Y + 16,
    });

  // Vertical sweep line at the current n.
  structure += line({
    class: 'viz-gridline',
    'stroke-dasharray': '3 3',
    x1: xPix(n),
    x2: xPix(n),
    y1: PLOT_Y0,
    y2: ORIGIN_Y,
  });
  structure += text(`n=${n}`, {
    class: 'viz-axis-label',
    x: xPix(n),
    y: ORIGIN_Y + 16,
    'text-anchor': 'middle',
  });

  // --- Curves (drawn full so the shape reads; sampled at integer x) ---
  const samples: number[] = [];
  for (let x = 1; x <= maxN; x += 1) samples.push(x);

  const labelYs: { fn: GrowthFn; y: number }[] = [];
  for (const fn of enabled) {
    const spec = FUNCS[fn];
    const id = curveId(fn);
    const pts = samples.map((x) => `${xPix(x)},${yPix(spec.f(x))}`).join(' ');
    const cls = [
      'viz-curve',
      active.has(id) ? 'is-emph' : undefined,
      compare.has(id) ? 'is-emph-compare' : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    structure += polyline({
      class: cls,
      id,
      points: pts,
      ...(spec.dash ? { 'stroke-dasharray': spec.dash } : {}),
    });
    labelYs.push({ fn, y: yPix(spec.f(maxN)) });
  }

  // De-collide end labels (design §2b.8): keep ≥ 14u apart, top-to-bottom.
  labelYs.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labelYs.length; i += 1) {
    if (labelYs[i]!.y - labelYs[i - 1]!.y < 14) {
      labelYs[i]!.y = labelYs[i - 1]!.y + 14;
    }
  }
  let markers = '';
  for (const { fn, y } of labelYs) {
    markers += text(FUNCS[fn].label, {
      class: 'viz-curve-label',
      x: PLOT_X0 + PLOT_W + 10,
      y: Math.min(y, ORIGIN_Y) + 4,
    });
  }

  const box = measure();
  return {
    viewBox: `0 0 ${box.w} ${box.h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered Big-O chart renderer. */
export const chartRenderer: RendererModule<ChartState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
  measure,
};
