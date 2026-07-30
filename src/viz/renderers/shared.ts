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
import type { Highlight, Renderer, RenderOpts, Step } from '../core/types';
import { svgRoot, text } from '../core/svg';

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
export function createRenderer<TState>(draw: Draw<TState>): Renderer<TState> {
  const uid = `r${(domInstance += 1)}`;
  let svg: SVGSVGElement | null = null;
  let content: SVGGElement | null = null;
  let descEl: SVGDescElement | null = null;

  return {
    mount(container: HTMLElement, opts: RenderOpts = {}): void {
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

    render(step: Step<TState>): void {
      if (!svg || !content) return;
      const { viewBox, inner } = draw(step);
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
    },
  };
}
