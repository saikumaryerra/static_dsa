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
  Highlight,
  Renderer,
  RendererModule,
  RenderOpts,
  Step,
} from '../core/types';
import {
  parseViewBox,
  readViewBox,
  svgRoot,
  text,
  unionViewBox,
} from '../core/svg';

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

/** Reads a string `label` from a highlight's `meta`, else a fallback. */
export const metaLabel = (h: Highlight, fallback: string): string =>
  typeof h.meta?.['label'] === 'string'
    ? (h.meta['label'] as string)
    : fallback;

/** What a renderer's pure draw function returns for one step. */
export interface Canvas {
  /** `viewBox` string (computed from item count so it never overflows). */
  viewBox: string;
  /** Inner SVG markup (structure + marker overlay), WITHOUT `<title>`/`<desc>`. */
  inner: string;
}

/** A renderer's single geometry source: `step` → drawn `Canvas`. */
export type Draw<TState> = (step: Step<TState>) => Canvas;

// --- The frame-height policy (see `RenderOpts.fixedViewBox`) ---

/**
 * The box a frame should actually use: the caller's pinned one when it is a
 * usable `viewBox`, else the one this step drew for itself. A malformed
 * override falls back rather than blanking the drawing — sizing is a hint from
 * outside the renderer, and a hint must never be able to erase the picture.
 */
function resolveViewBox(drawn: string, opts: RenderOpts): string {
  const fixed = opts.fixedViewBox;
  return fixed !== undefined && parseViewBox(fixed) !== null ? fixed : drawn;
}

/**
 * Measures a whole trace and returns the ONE box that fits every step of it —
 * what `RenderOpts.fixedViewBox` wants, and the reason the canvas can stop
 * resizing mid-run (a fluid `<svg>`'s rendered height is
 * `containerWidth × vbHeight / vbWidth`, so a per-step box IS a per-step
 * height).
 *
 * Works on ANY `RendererModule`, including ones with bespoke plumbing, because
 * it measures through `renderStatic` — the single surface they all share —
 * rather than through a geometry hook each renderer would have to remember to
 * implement. The cost is one still per step, thrown away; that is nothing in
 * build-time frontmatter, and on the client it is paid once per run (never per
 * step), so it stays off the stepping path entirely.
 *
 * @param module - The renderer that will draw the trace.
 * @param trace - Every step that must fit.
 * @returns The unioned `viewBox`, or `null` for an empty/unmeasurable trace —
 *   in which case the caller simply omits `fixedViewBox` and per-step sizing
 *   applies, exactly as before.
 */
export function fitViewBox<TState>(
  module: RendererModule<TState>,
  trace: readonly Step<TState>[],
): string | null {
  const boxes: string[] = [];
  for (const step of trace) {
    const box = readViewBox(module.renderStatic(step, {}));
    if (box !== null) boxes.push(box);
  }
  return unionViewBox(boxes);
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
): string {
  const { viewBox, inner } = draw(step);
  const idBase = opts.idBase ?? 'viz';
  return svgRoot(
    {
      viewBox: resolveViewBox(viewBox, opts),
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
 *
 * `mount`'s opts are kept for the lifetime of the instance so a pinned
 * `fixedViewBox` applies to every later `render` too — a frame that is fixed
 * only on the first step is not fixed.
 */
export function createRenderer<TState>(draw: Draw<TState>): Renderer<TState> {
  const uid = `r${(domInstance += 1)}`;
  let svg: SVGSVGElement | null = null;
  let content: SVGGElement | null = null;
  let descEl: SVGDescElement | null = null;
  /** The pinned frame from `mount`, if any (see `RenderOpts.fixedViewBox`). */
  let mountOpts: RenderOpts = {};

  return {
    mount(container: HTMLElement, opts: RenderOpts = {}): void {
      mountOpts = opts;
      const el = document.createElementNS(SVG_NS, 'svg');
      el.setAttribute('role', 'img');
      el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      el.setAttribute('width', '100%');
      el.style.maxWidth = '100%';
      el.style.height = 'auto';
      el.setAttribute('aria-labelledby', `${uid}-t ${uid}-d`);
      // Size the frame BEFORE the first `render`, so a pinned canvas is already
      // at its final height when it replaces the build-time still — otherwise
      // hydration itself would be one of the jumps this option exists to stop.
      if (opts.fixedViewBox !== undefined && parseViewBox(opts.fixedViewBox)) {
        el.setAttribute('viewBox', opts.fixedViewBox);
      }

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

    render(step: Step<TState>): void {
      if (!svg || !content) return;
      const { viewBox, inner } = draw(step);
      svg.setAttribute('viewBox', resolveViewBox(viewBox, mountOpts));
      // Single atomic redraw of the drawing group (SVG-namespaced innerHTML).
      content.innerHTML = inner;
      if (descEl) descEl.textContent = step.explanation;
    },

    destroy(): void {
      svg?.remove();
      svg = null;
      content = null;
      descEl = null;
      mountOpts = {};
    },
  };
}
