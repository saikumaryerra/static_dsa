/**
 * Shared renderer plumbing (architecture §4 common contract).
 *
 * DEVIATION (flagged): not in the architecture §7 file list. Introduced to avoid
 * repeating the identical mount/render/destroy/desc-sync boilerplate across the
 * eight new renderers. It imports ONLY `core/*` (types + svg), so it respects the
 * one-way dependency direction (renderers → core; never algorithms). Each new
 * renderer supplies a single pure `Draw<TState>` — the ONE geometry source shared
 * by both the client DOM path and the build-time still, exactly as architecture
 * §1 intends ("still == hydrated step 0 by construction").
 *
 * The DOM path is a single atomic redraw per step (design §3.4): on each `render`
 * the drawing group's `innerHTML` is replaced with the freshly-drawn body. For
 * the ≤30-element structures the input caps allow, this is imperceptible and
 * removes an entire class of patch-vs-rebuild defects. (ArrayRenderer keeps its
 * bespoke persistent-cell patching to preserve M2's cross-step colour tween.)
 */
import type {
  Extent,
  Highlight,
  Renderer,
  RenderOpts,
  Step,
} from '../core/types';
import { group, svgRoot, text } from '../core/svg';

// --- Shared marker glyphs (the non-color layer, design §2.4). Pure strings so
// every renderer emits the SAME paired marker for a given kind (design §3.2). ---

/** Named caret label (`top`, `front`, `curr`, …) — the `pointer`/`active` cue. */
export const caretMark = (label: string, x: number, y: number): string =>
  text(label, { class: 'viz-caret', x, y, 'text-anchor': 'middle' });

/** `+` above an inserted element (the `insert` cue). */
export const insertMark = (x: number, y: number): string =>
  text('+', { class: 'viz-insert-mark', x, y, 'text-anchor': 'middle' });

/** `✕` over a deleted element (the `delete` cue). */
export const deleteMark = (x: number, y: number): string =>
  text('✕', { class: 'viz-delete-mark', x, y, 'text-anchor': 'middle' });

/** `✓` above a found element (the `found` cue). */
export const foundMark = (x: number, y: number): string =>
  text('✓', { class: 'viz-found-mark', x, y, 'text-anchor': 'middle' });

/** `✓` badge on a visited node (the `visited` cue). */
export const visitedBadge = (x: number, y: number): string =>
  text('✓', { class: 'viz-badge', x, y, 'text-anchor': 'middle' });

/** `↔` between two swapped elements (the `swap` cue). */
export const swapMark = (x: number, y: number): string =>
  text('↔', { class: 'viz-swap-mark', x, y, 'text-anchor': 'middle' });

/**
 * Conservative rendered width of a `.viz-null` resting label, in viewBox units.
 *
 * `.viz-null` is 18px `--font-mono`, and inside an SVG that 18 is 18 USER units,
 * not CSS pixels. Every face in the `--font-mono` stack advances at most ~0.61em
 * (SF Mono/Menlo/Liberation Mono ~0.60em, Consolas 0.55em), so 0.6 x 18 = 10.8
 * and 11 units per character rounds up by ~2%.
 *
 * Exists because two renderers computed an empty-state viewBox from an empty
 * STRUCTURE and then drew a label into it: "empty tree" is ~110 units wide
 * inside a 40-unit box, so the resting frame rendered blank for every JS-off
 * reader and every printed page (`npm run audit:frames`, section B).
 *
 * @param label - The resting label the renderer is about to draw.
 * @returns The width the box must reserve for it, in viewBox user units.
 */
export const nullLabelWidth = (label: string): number => label.length * 11;

/**
 * Rendered px size of every `<text>` class the renderers emit, transcribed from
 * `Visualizer.astro`'s stylesheet (`--text-xs` is 0.75rem = 12px fixed).
 *
 * A per-class table rather than one flat advance because the sizes span 12–20px
 * and a label's own size decides whether it fits: a flat 18px advance falsely
 * flags `growth-rates`, whose 12px `.viz-curve-label` sits in the 96 units the
 * chart already reserves for end labels. Unknown classes fall back to the
 * largest real size — over-flagging is the right failure direction for a check.
 *
 * `'viz-null': 18` is the same 18 {@link nullLabelWidth} rounds to 11 units per
 * character, and {@link textSpans} derives that class's advance from this entry,
 * so the floor a renderer reserves and the span this measures cannot disagree.
 */
const FONT_PX: Record<string, number> = {
  'viz-axis-label': 12,
  'viz-badge': 14,
  'viz-caret': 12,
  'viz-cell__index': 12,
  'viz-cell__value': 20,
  'viz-curve-label': 12,
  'viz-delete-mark': 16,
  'viz-found-mark': 18,
  'viz-frame-label': 14,
  'viz-frame-meta': 12,
  'viz-insert-mark': 16,
  'viz-marker': 12,
  'viz-mid-label': 12,
  'viz-node__value': 16,
  'viz-null': 18,
  'viz-swap-mark': 16,
  'viz-weight': 12,
};

/** One drawn `<text>`, resolved to the horizontal band it actually covers. */
export interface TextSpan {
  /** The text drawn. */
  content: string;
  /** Its `class` attribute, verbatim (`''` when it carries none). */
  cls: string;
  /** Left edge in viewBox user units, after `text-anchor` is applied. */
  start: number;
  /** Right edge in viewBox user units. */
  end: number;
}

/**
 * Every `<text>` in an emitted `<svg>` string, as the anchor-aware horizontal
 * span it occupies — the one model of "does this label fit its box?".
 *
 * MEASUREMENT ONLY: nothing in the drawing path calls this. It lives beside
 * {@link nullLabelWidth} because it is the same font model generalized over the
 * classes, and because its two callers must share ONE copy of that arithmetic:
 * `scripts/audit-frames.mjs` (section B, step 0 of every lesson trace) and
 * `tests/unit/renderers/empty-frames.test.ts` (the empty state of every
 * registered renderer). Two copies is how a third renderer came to violate the
 * rule the first two were fixed for — the audit only ever inspects `trace[0]`,
 * and `linked-list-operations` step 0 draws four nodes, not a resting label.
 *
 * A `<text>` with no `x` or no content is skipped: it has no measurable band.
 *
 * @param svg - A complete `<svg>` string from a renderer's `renderStatic`.
 * @returns One span per measurable `<text>`, in document order.
 */
export const textSpans = (svg: string): TextSpan[] => {
  const spans: TextSpan[] = [];
  for (const m of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1] ?? '';
    const content = m[2] ?? '';
    const x = Number(/\bx="([-\d.]+)"/.exec(attrs)?.[1] ?? NaN);
    if (Number.isNaN(x) || content.length === 0) continue;
    const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? 'start';
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    // Monospace advance, ~0.6em of the class's own size, rounded up.
    const width = content.length * Math.ceil((FONT_PX[cls] ?? 18) * 0.6);
    const start =
      anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    spans.push({ content, cls, start, end: start + width });
  }
  return spans;
};

/** Reads a string `label` from a highlight's `meta`, else a fallback. */
export const metaLabel = (h: Highlight, fallback: string): string =>
  typeof h.meta?.['label'] === 'string'
    ? (h.meta['label'] as string)
    : fallback;

/**
 * The two END labels for a `range` highlight, read from `meta`.
 *
 * {@link metaLabel} reads `meta.label` and returns ONE string, but a range has
 * two ends. That is the meta contract: `meta.label` names a single-target
 * marker, `meta.startLabel`/`meta.endLabel` name a range's two ends.
 *
 * Deliberately NO fallback, unlike `metaLabel`. A renderer that invents an end
 * label is inventing vocabulary for a lesson it knows nothing about — which is
 * how five sorting algorithms, `array-operations` and linear search came to
 * print a search window none of them has. Only the LABELS are gated: the range
 * underbar is the non-colour cue for the kind (design §3.2) and every range
 * still draws it.
 *
 * @param h - The `range` highlight the renderer is about to draw.
 * @returns Each end's authored label, or `null` where the algorithm supplied
 *   none — meaning "draw the bar, name nothing".
 */
export const metaRangeLabels = (
  h: Highlight,
): { start: string | null; end: string | null } => ({
  start:
    typeof h.meta?.['startLabel'] === 'string'
      ? (h.meta['startLabel'] as string)
      : null,
  end:
    typeof h.meta?.['endLabel'] === 'string'
      ? (h.meta['endLabel'] as string)
      : null,
});

/** What a renderer's pure draw function returns for one step. */
export interface Canvas {
  /** `viewBox` string (computed from item count so it never overflows). */
  viewBox: string;
  /** Inner SVG markup (structure + marker overlay), WITHOUT `<title>`/`<desc>`. */
  inner: string;
}

/** A renderer's single geometry source: `step` → drawn `Canvas`. */
export type Draw<TState> = (step: Step<TState>) => Canvas;

/**
 * Where a drawing sits inside a frozen box larger than its natural one.
 *
 * Freezing the box does not freeze the drawing's POSITION, so each renderer
 * declares the edge that must not move. Most grow right and down into the
 * reserved space and want the default; the two stack-shaped renderers draw a
 * ground line under their lowest slot, which would slide down on every push
 * under a top anchor; the heap centres each tree level within its own content
 * width, so centring keeps the root still across a level gain.
 */
export interface Anchor {
  /** `left`: origin-aligned (default). `center`: centred horizontally. */
  x: 'left' | 'center';
  /** `top`: origin-aligned (default). `bottom`: base-aligned. */
  y: 'top' | 'bottom';
}

/** The default anchor: the drawing grows right and down into reserved space. */
export const TOP_LEFT: Anchor = { x: 'left', y: 'top' };

/**
 * The `0 0 W H` form every renderer emits. Anything else (a non-zero origin, a
 * negative dimension) means a renderer changed shape without this function
 * being taught about it, and is a build/test failure rather than a silent pass.
 */
const VIEW_BOX = /^0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/;

/**
 * Widens one step's natural canvas to the trace's frozen `extent`, offsetting
 * the drawing by `anchor` so the edge that matters stays put.
 *
 * Applied in exactly two places — `renderStaticSvg` and `createRenderer.render`
 * — so the build-time still and the hydrated drawing cannot disagree. Pure, so
 * the node-only Vitest harness can test it directly.
 *
 * @param canvas - What the renderer's own `draw` produced for this step.
 * @param extent - The whole trace's box; `undefined` means "draw naturally".
 * @param anchor - This renderer's declared anchor (defaults to {@link TOP_LEFT}).
 * @returns A canvas whose viewBox is the extent (never smaller than natural).
 */
export function fitToExtent(
  canvas: Canvas,
  extent: Extent | undefined,
  anchor: Anchor = TOP_LEFT,
): Canvas {
  if (!extent) return canvas;
  const parts = VIEW_BOX.exec(canvas.viewBox);
  if (!parts) {
    throw new Error(
      `fitToExtent: unsupported viewBox "${canvas.viewBox}" (expected "0 0 W H").`,
    );
  }
  const naturalW = Number(parts[1]);
  const naturalH = Number(parts[2]);
  // Clamp, never shrink: a stale extent may only widen the box, so a drawing
  // can never be clipped by a measurement that ran against a different trace.
  const w = Math.max(extent.w, naturalW);
  const h = Math.max(extent.h, naturalH);
  const dx = anchor.x === 'center' ? Math.round((w - naturalW) / 2) : 0;
  const dy = anchor.y === 'bottom' ? Math.round(h - naturalH) : 0;
  return {
    viewBox: `0 0 ${w} ${h}`,
    inner:
      dx === 0 && dy === 0
        ? canvas.inner
        : group(canvas.inner, { transform: `translate(${dx} ${dy})` }),
  };
}

/** Monotonic id seed so each mounted instance gets unique title/desc ids. */
let domInstance = 0;

/** SVG namespace for the scaffold elements the DOM path owns. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds the complete static `<svg>` string for one step (the `renderStatic`
 * path). `<desc>` always mirrors `step.explanation` (design §3.1).
 */
export function renderStaticSvg<TState>(
  draw: Draw<TState>,
  step: Step<TState>,
  opts: RenderOpts,
  anchor: Anchor = TOP_LEFT,
): string {
  const { viewBox, inner } = fitToExtent(draw(step), opts.extent, anchor);
  const idBase = opts.idBase ?? 'viz';
  return svgRoot(
    {
      viewBox,
      title: opts.title ?? '',
      desc: step.explanation,
      titleId: `${idBase}-t`,
      descId: `${idBase}-d`,
    },
    inner,
  );
}

/**
 * Creates a DOM {@link Renderer} that draws every step via `draw`. The `<svg>`
 * scaffold (role=img + title + desc + a drawing group) is created once at
 * `mount`; each `render` replaces the drawing group's `innerHTML` and rewrites
 * `<desc>` — a single atomic redraw that snaps correctly under reduced motion.
 */
export function createRenderer<TState>(
  draw: Draw<TState>,
  anchor: Anchor = TOP_LEFT,
): Renderer<TState> {
  const uid = `r${(domInstance += 1)}`;
  let svg: SVGSVGElement | null = null;
  let content: SVGGElement | null = null;
  let descEl: SVGDescElement | null = null;
  let extent: Extent | undefined;

  return {
    mount(container: HTMLElement, opts: RenderOpts = {}): void {
      extent = opts.extent;
      const el = document.createElementNS(SVG_NS, 'svg');
      el.setAttribute('role', 'img');
      el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      el.setAttribute('width', '100%');
      el.style.maxWidth = '100%';
      el.style.height = 'auto';
      el.setAttribute('aria-labelledby', `${uid}-t ${uid}-d`);

      const titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.setAttribute('id', `${uid}-t`);
      titleEl.textContent = opts.title ?? '';
      descEl = document.createElementNS(SVG_NS, 'desc');
      descEl.setAttribute('id', `${uid}-d`);

      content = document.createElementNS(SVG_NS, 'g');
      content.setAttribute('class', 'viz-content');

      el.append(titleEl, descEl, content);
      container.appendChild(el);
      svg = el;
    },

    setExtent(next: Extent | undefined): void {
      extent = next;
    },

    render(step: Step<TState>): void {
      if (!svg || !content) return;
      const { viewBox, inner } = fitToExtent(draw(step), extent, anchor);
      svg.setAttribute('viewBox', viewBox);
      // Single atomic redraw of the drawing group (SVG-namespaced innerHTML).
      content.innerHTML = inner;
      if (descEl) descEl.textContent = step.explanation;
    },

    destroy(): void {
      svg?.remove();
      svg = null;
      content = null;
      descEl = null;
      extent = undefined;
    },
  };
}
