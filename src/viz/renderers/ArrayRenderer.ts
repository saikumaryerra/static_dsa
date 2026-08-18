/**
 * ArrayRenderer — SVG renderer for an array, a search window, and a bars variant
 * (site spec §11.5, architecture §4.1). Dumb by contract: draws exactly the
 * `Step` it is handed and runs no algorithm logic.
 *
 * TState: {@link ArrayWindowState} — an array plus optional search/sort extras.
 * Id scheme: the cell at index `n` is the group `cellId(n)` (`"i3"`). Algorithms
 * name highlight targets with `cellId` from `core/ids` so the two layers agree
 * without sharing structure.
 *
 * Honored highlights (via `core/highlight`): `range` (live window, lo/hi
 * bracket), `active` (probe, named caret — default "mid"), `found` (✓), plus the
 * general `compare` (tie-line), `swap` (↔), `insert` (+), `delete` (✕), `pointer`
 * (named caret) so Search + Sorting + plain-array lessons all reuse this family.
 *
 * Two exports: {@link arrayRenderer} (boxed cells) and {@link barsRenderer}
 * (value-scaled bars, `renderer="bars"`) — same ids/geometry/highlights.
 *
 * DOM path keeps M2's persistent cells (stable ids) so CSS tweens colour between
 * steps; only the marker overlay is rebuilt each step. `renderStatic` reuses the
 * SAME class + marker logic through `core/svg`, so still == hydrated step 0.
 * Reduced motion is inherited from the token layer — no `matchMedia` here.
 */
import type {
  Extent,
  Renderer,
  RendererModule,
  RenderOpts,
  Step,
} from '../core/types';
import { cellId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { esc, group, line, svgRoot, text } from '../core/svg';

/** SVG namespace for `createElementNS` (client DOM path). */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * State ArrayRenderer draws: the array plus optional search/sort extras. All
 * extras are optional so the renderer also draws a plain array. The renderer is
 * driven purely by `step.highlights`; these fields are informational for
 * algorithms that also want to carry a window.
 */
export interface ArrayWindowState {
  array: number[];
  lo?: number;
  hi?: number;
  mid?: number | null;
  foundIndex?: number | null;
  comparing?: number[];
  swapping?: number[];
}

/** Draw variant: boxed cells or value-scaled bars. */
type Variant = 'cells' | 'bars';

// --- SVG geometry (viewBox units; the frame scales it responsively) ---
const CELL = 54;
const GAP = 8;
const PAD_X = 10;
const CELL_Y = 30; // top of a boxed cell (leaves a 26u marker band above)
const CELL_H = 54;
const BASELINE = CELL_Y + CELL_H; // bar/box bottom edge (84)
const BAR_MAX_H = CELL_H; // tallest bar = a full cell height
const BRACKET_Y = BASELINE + 6; // range underbar
const INDEX_Y = BASELINE + 22; // index number under each cell
const MARKER_Y = BASELINE + 38; // lo / hi labels
const CARET_Y = 16; // top band: mid caret / ✓ / +, ✕
const HEIGHT = MARKER_Y + 10;

const cellX = (i: number): number => PAD_X + i * (CELL + GAP);
const cellCenterX = (i: number): number => cellX(i) + CELL / 2;
const viewWidth = (n: number): number =>
  Math.max(PAD_X * 2 + Math.max(n, 1) * (CELL + GAP) - GAP, 1);
const viewBoxOf = (n: number): string => `0 0 ${viewWidth(n)} ${HEIGHT}`;

/**
 * The natural box for one step — the same two numbers `viewBoxOf` renders, read
 * from the same `viewWidth`/`HEIGHT` source so the two cannot drift. Geometry
 * only: a caller reduces this over a trace to freeze one box for the whole run.
 */
const measure = (step: Step<ArrayWindowState>): Extent => ({
  w: viewWidth(step.state.array.length),
  h: HEIGHT,
});

/** Index behind a `cellId` string (`"i3"` → 3). */
const idIndex = (id: string): number => Number(id.slice(1));

/** Bar height + top for a value under the current scale (bars variant). */
function barMetrics(value: number, maxVal: number): { y: number; h: number } {
  const h = Math.max(6, Math.round((Math.max(value, 0) / maxVal) * BAR_MAX_H));
  return { y: BASELINE - h, h };
}

/** Max magnitude for the bars scale (≥ 1 so we never divide by zero). */
const scaleMax = (array: number[]): number =>
  Math.max(1, ...array.map((v) => Math.max(v, 0)));

/**
 * Per-index CSS class list (M2 semantics, generalized). Base state comes from
 * `applyHighlights` (precedence-correct); `is-eliminated` keeps M2's rule: a
 * non-found, non-active cell is dimmed when it is outside an existing range, or
 * — when no range remains — always (the collapsed-window "not found" state).
 */
function cellClasses(step: Step<ArrayWindowState>, n: number): string[] {
  const highlights = step.highlights ?? [];
  const base = applyHighlights(highlights);
  const rangeIds = new Set<string>();
  for (const h of highlights) {
    if (h.kind === 'range') for (const id of h.ids) rangeIds.add(id);
  }
  const hasRange = rangeIds.size > 0;

  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = cellId(i);
    const cls = base.get(id);
    const isFound = cls === 'is-found';
    const isActive = cls === 'is-active';
    const inRange = rangeIds.has(id);
    const eliminated = !isFound && !isActive && (hasRange ? !inRange : true);
    out.push(
      ['viz-cell', cls, eliminated ? 'is-eliminated' : undefined]
        .filter(Boolean)
        .join(' '),
    );
  }
  return out;
}

/** One boxed-cell / bar as an SVG string (renderStatic path). */
function cellMarkup(
  i: number,
  value: number,
  cls: string,
  variant: Variant,
  maxVal: number,
): string {
  const { y, h } =
    variant === 'bars' ? barMetrics(value, maxVal) : { y: CELL_Y, h: CELL_H };
  const rect = `<rect class="viz-cell__rect" x="${cellX(i)}" y="${y}" width="${CELL}" height="${h}" rx="6"/>`;
  const valueY = variant === 'bars' ? y - 6 : CELL_Y + CELL_H / 2;
  const valueBaseline = variant === 'bars' ? 'auto' : 'central';
  const valueText = text(value, {
    class: 'viz-cell__value',
    x: cellCenterX(i),
    y: valueY,
    'text-anchor': 'middle',
    'dominant-baseline': valueBaseline,
  });
  const indexText = text(i, {
    class: 'viz-cell__index',
    x: cellCenterX(i),
    y: INDEX_Y,
    'text-anchor': 'middle',
  });
  return `<g id="${esc(cellId(i))}" class="${esc(cls)}">${rect}${valueText}${indexText}</g>`;
}

/** All cells for a step as one `<g class="viz-cells">` string. */
function cellsMarkup(step: Step<ArrayWindowState>, variant: Variant): string {
  const { array } = step.state;
  const classes = cellClasses(step, array.length);
  const maxVal = scaleMax(array);
  const cells = array
    .map((v, i) => cellMarkup(i, v, classes[i]!, variant, maxVal))
    .join('');
  return group(cells, { class: 'viz-cells' });
}

/**
 * Marker overlay (the non-color layer, design §2.4). Every highlight kind draws
 * its required marker so no `--hl-*` colour ever appears without a paired,
 * colour-independent cue (design §3.2 QA gate).
 */
function markersMarkup(step: Step<ArrayWindowState>): string {
  const highlights = step.highlights ?? [];
  let out = '';

  // range → underbar bracket + lo/hi labels across the window span.
  const rangeIds = highlights
    .filter((h) => h.kind === 'range')
    .flatMap((h) => h.ids)
    .map(idIndex);
  if (rangeIds.length > 0) {
    const lo = Math.min(...rangeIds);
    const hi = Math.max(...rangeIds);
    out += line({
      class: 'viz-range-bar',
      x1: cellX(lo),
      x2: cellX(hi) + CELL,
      y1: BRACKET_Y,
      y2: BRACKET_Y,
    });
    out += text('lo', {
      class: 'viz-marker',
      x: cellCenterX(lo),
      y: MARKER_Y,
      'text-anchor': 'middle',
    });
    if (hi !== lo) {
      out += text('hi', {
        class: 'viz-marker',
        x: cellCenterX(hi),
        y: MARKER_Y,
        'text-anchor': 'middle',
      });
    }
  }

  for (const h of highlights) {
    if (h.kind === 'active' || h.kind === 'pointer') {
      // Named caret above each cell (default "mid" keeps M2's binary-search cue).
      const label =
        typeof h.meta?.['label'] === 'string'
          ? (h.meta['label'] as string)
          : h.kind === 'active'
            ? 'mid'
            : 'p';
      const cls = h.kind === 'active' ? 'viz-mid-label' : 'viz-caret';
      for (const id of h.ids) {
        out += text(label, {
          class: cls,
          x: cellCenterX(idIndex(id)),
          y: CARET_Y,
          'text-anchor': 'middle',
        });
      }
    } else if (h.kind === 'found') {
      for (const id of h.ids) {
        out += text('✓', {
          class: 'viz-found-mark',
          x: cellCenterX(idIndex(id)),
          y: CARET_Y,
          'text-anchor': 'middle',
        });
      }
    } else if (h.kind === 'insert') {
      for (const id of h.ids) {
        out += text('+', {
          class: 'viz-insert-mark',
          x: cellCenterX(idIndex(id)),
          y: CARET_Y,
          'text-anchor': 'middle',
        });
      }
    } else if (h.kind === 'delete') {
      for (const id of h.ids) {
        const i = idIndex(id);
        out += text('✕', {
          class: 'viz-delete-mark',
          x: cellCenterX(i),
          y: CARET_Y,
          'text-anchor': 'middle',
        });
        out += line({
          class: 'viz-strike',
          x1: cellX(i) + 8,
          x2: cellX(i) + CELL - 8,
          y1: CELL_Y + CELL_H / 2,
          y2: CELL_Y + CELL_H / 2,
        });
      }
    } else if (h.kind === 'compare' && h.ids.length >= 2) {
      // Dashed tie-line joining the two compared cells (their top band).
      const a = idIndex(h.ids[0]!);
      const b = idIndex(h.ids[1]!);
      out += line({
        class: 'viz-tie',
        x1: cellCenterX(a),
        x2: cellCenterX(b),
        y1: CARET_Y + 4,
        y2: CARET_Y + 4,
      });
    } else if (h.kind === 'swap' && h.ids.length >= 2) {
      const a = idIndex(h.ids[0]!);
      const b = idIndex(h.ids[1]!);
      out += text('↔', {
        class: 'viz-swap-mark',
        x: (cellCenterX(a) + cellCenterX(b)) / 2,
        y: CARET_Y,
        'text-anchor': 'middle',
      });
    }
  }
  return out;
}

/** Full still for a step + variant (shared by both `renderStatic` exports). */
function renderArrayStatic(
  step: Step<ArrayWindowState>,
  opts: RenderOpts,
  variant: Variant,
): string {
  const n = step.state.array.length;
  const idBase = opts.idBase ?? 'viz';
  return svgRoot(
    {
      viewBox: viewBoxOf(n),
      title: opts.title ?? '',
      desc: step.explanation,
      titleId: `${idBase}-t`,
      descId: `${idBase}-d`,
    },
    cellsMarkup(step, variant) +
      group(markersMarkup(step), { class: 'viz-markers' }),
  );
}

/** Monotonic seed so each mounted instance gets unique title/desc ids. */
let domInstance = 0;

/**
 * DOM renderer. Cells persist across steps (stable ids → CSS colour tween); the
 * marker overlay is rebuilt each step from the same pure `markersMarkup`.
 */
class ArrayDomRenderer implements Renderer<ArrayWindowState> {
  private svg: SVGSVGElement | null = null;
  private cellsGroup: SVGGElement | null = null;
  private markersGroup: SVGGElement | null = null;
  private descEl: SVGDescElement | null = null;
  private builtLength = -1;
  private readonly uid = `ar${(domInstance += 1)}`;
  constructor(private readonly variant: Variant) {}

  mount(container: HTMLElement, opts: RenderOpts = {}): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('aria-labelledby', `${this.uid}-t ${this.uid}-d`);

    const titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.setAttribute('id', `${this.uid}-t`);
    titleEl.textContent = opts.title ?? '';
    const descEl = document.createElementNS(SVG_NS, 'desc');
    descEl.setAttribute('id', `${this.uid}-d`);

    const cellsGroup = document.createElementNS(SVG_NS, 'g');
    cellsGroup.setAttribute('class', 'viz-cells');
    const markersGroup = document.createElementNS(SVG_NS, 'g');
    markersGroup.setAttribute('class', 'viz-markers');

    svg.append(titleEl, descEl, cellsGroup, markersGroup);
    container.appendChild(svg);

    this.svg = svg;
    this.descEl = descEl;
    this.cellsGroup = cellsGroup;
    this.markersGroup = markersGroup;
  }

  /**
   * Deliberately inert for now, and it takes no argument so nothing reads as
   * stored-but-ignored: this family draws its own viewBox instead of going
   * through `fitToExtent`, so honouring an extent means moving where that box is
   * written. That plumbing lands with the extent lifecycle (Plan A task 4); the
   * member exists here because the contract requires it of every renderer.
   */
  setExtent(): void {}

  render(step: Step<ArrayWindowState>): void {
    if (!this.svg || !this.cellsGroup || !this.markersGroup) return;
    const { array } = step.state;

    if (this.builtLength !== array.length) {
      this.buildCells(array);
      this.builtLength = array.length;
    } else {
      this.updateCells(array);
    }

    const classes = cellClasses(step, array.length);
    for (let i = 0; i < array.length; i += 1) {
      const cell = this.cellsGroup.querySelector<SVGGElement>(
        `#${CSS.escape(cellId(i))}`,
      );
      if (cell) cell.setAttribute('class', classes[i]!);
    }

    this.markersGroup.innerHTML = markersMarkup(step);
    if (this.descEl) this.descEl.textContent = step.explanation;
  }

  destroy(): void {
    this.svg?.remove();
    this.svg = null;
    this.cellsGroup = null;
    this.markersGroup = null;
    this.descEl = null;
    this.builtLength = -1;
  }

  private buildCells(array: number[]): void {
    const groupEl = this.cellsGroup!;
    groupEl.replaceChildren();
    this.svg!.setAttribute('viewBox', viewBoxOf(array.length));
    // Reuse the pure string builder for one geometry source, then adopt nodes.
    groupEl.innerHTML = array
      .map((v, i) =>
        cellMarkup(i, v, 'viz-cell', this.variant, scaleMax(array)),
      )
      .join('');
  }

  private updateCells(array: number[]): void {
    const groupEl = this.cellsGroup!;
    const maxVal = scaleMax(array);
    array.forEach((value, i) => {
      const cell = groupEl.querySelector(`#${CSS.escape(cellId(i))}`);
      if (!cell) return;
      const valueText = cell.querySelector('.viz-cell__value');
      if (valueText) valueText.textContent = String(value);
      if (this.variant === 'bars') {
        const rect = cell.querySelector('.viz-cell__rect');
        const { y, h } = barMetrics(value, maxVal);
        rect?.setAttribute('y', String(y));
        rect?.setAttribute('height', String(h));
        valueText?.setAttribute('y', String(y - 6));
      }
    });
  }
}

/** Boxed-cell array renderer (`renderer="array"`). */
export const arrayRenderer: RendererModule<ArrayWindowState> = {
  create: () => new ArrayDomRenderer('cells'),
  renderStatic: (step: Step<ArrayWindowState>, opts: RenderOpts) =>
    renderArrayStatic(step, opts, 'cells'),
  measure,
};

/** Value-scaled bars renderer (`renderer="bars"`); same ids/geometry (§4.1). */
export const barsRenderer: RendererModule<ArrayWindowState> = {
  create: () => new ArrayDomRenderer('bars'),
  renderStatic: (step: Step<ArrayWindowState>, opts: RenderOpts) =>
    renderArrayStatic(step, opts, 'bars'),
  measure,
};
