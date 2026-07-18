/**
 * ArrayRenderer — dumb SVG renderer for an array with a search window
 * (site spec §11.5, architecture §6). It draws exactly the `Step` it is handed
 * and runs no algorithm logic. Imports only core types (architecture §8).
 *
 * Id scheme (the contract algorithms rely on): the cell at index `n` is the
 * group `i${n}`. Algorithms name highlight targets with the exported
 * {@link cellId} helper so the two layers agree on ids without sharing
 * structure. Consumes highlight kinds: `range` (the lo..hi window), `active`
 * (the mid cell being read), `found` (the hit).
 *
 * Motion: the renderer only sets target classes/attributes; color/position
 * tween via CSS `transition` on the cell (see Visualizer's scoped styles).
 * `tokens.css` already collapses `--duration-*` under `prefers-reduced-motion`,
 * so the cell snaps automatically — the renderer needs no `matchMedia` branch.
 */
import type { Renderer, Step } from '../core/types';

/** SVG namespace for `createElementNS`. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * State shape ArrayRenderer draws: the array plus an optional search window
 * (`lo`/`hi` bounds, the `mid` probe, and the `foundIndex`). All window fields
 * are optional so the renderer can also draw a plain array if reused later.
 */
export interface ArrayWindowState {
  array: number[];
  lo?: number;
  hi?: number;
  mid?: number | null;
  foundIndex?: number | null;
}

/** Stable renderer id for the array cell at index `i` (the algorithm↔renderer contract). */
export const cellId = (i: number): string => `i${i}`;

// --- SVG geometry (viewBox units; the frame scales it responsively) ---
const CELL = 54;
const GAP = 8;
const PAD_X = 10;
const TOP = 26; // reserved band above cells for the "mid" caret / ✓ marker
const CELL_Y = TOP + 4;
const CELL_H = 54;
const BRACKET_Y = CELL_Y + CELL_H + 6; // range underbar
const INDEX_Y = CELL_Y + CELL_H + 22; // index number under each cell
const MARKER_Y = INDEX_Y + 18; // lo / hi labels
const HEIGHT = MARKER_Y + 10;

const cellX = (i: number): number => PAD_X + i * (CELL + GAP);
const cellCenterX = (i: number): number => cellX(i) + CELL / 2;

/** Module-level counter so each instance's `<title>`/`<desc>` ids are unique. */
let instanceCounter = 0;

/**
 * Renders an array + search window to responsive SVG. Cell groups persist
 * across renders (stable ids) so CSS animates color changes; only the marker
 * overlay (lo/hi/mid labels, range bar, ✓) is rebuilt each step.
 */
export class ArrayRenderer implements Renderer<ArrayWindowState> {
  private svg: SVGSVGElement | null = null;
  private cellsGroup: SVGGElement | null = null;
  private markersGroup: SVGGElement | null = null;
  private descEl: SVGDescElement | null = null;
  /** Length of the array the persistent cell groups were built for. */
  private builtLength = -1;
  private readonly uid = `ar${(instanceCounter += 1)}`;

  /** Creates the responsive `<svg>` scaffold inside `container`. */
  mount(container: HTMLElement): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('aria-labelledby', `${this.uid}-t ${this.uid}-d`);

    const titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.setAttribute('id', `${this.uid}-t`);
    titleEl.textContent = 'Binary search on a sorted array';
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

  /** Draws exactly `step` (idempotent). */
  render(step: Step<ArrayWindowState>): void {
    if (!this.svg || !this.cellsGroup || !this.markersGroup) return;
    const { array } = step.state;

    // (Re)build persistent cell groups only when the array length changed.
    if (this.builtLength !== array.length) {
      this.buildCells(array);
      this.builtLength = array.length;
    } else {
      this.updateCellValues(array);
    }

    this.applyHighlights(step);
    this.drawMarkers(step.state);

    // Root <desc> mirrors the step explanation so AT users get the meaning.
    if (this.descEl) this.descEl.textContent = step.explanation;
  }

  /** Removes the SVG and clears cached references. */
  destroy(): void {
    this.svg?.remove();
    this.svg = null;
    this.cellsGroup = null;
    this.markersGroup = null;
    this.descEl = null;
    this.builtLength = -1;
  }

  /** Builds fresh persistent cell groups (rect + value + index) with stable ids. */
  private buildCells(array: number[]): void {
    const group = this.cellsGroup!;
    group.replaceChildren();
    const width = PAD_X * 2 + Math.max(array.length, 1) * (CELL + GAP) - GAP;
    this.svg!.setAttribute('viewBox', `0 0 ${Math.max(width, 1)} ${HEIGHT}`);

    array.forEach((value, i) => {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('id', cellId(i));
      cell.setAttribute('class', 'viz-cell');

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'viz-cell__rect');
      rect.setAttribute('x', String(cellX(i)));
      rect.setAttribute('y', String(CELL_Y));
      rect.setAttribute('width', String(CELL));
      rect.setAttribute('height', String(CELL_H));
      rect.setAttribute('rx', '6');

      const valueText = document.createElementNS(SVG_NS, 'text');
      valueText.setAttribute('class', 'viz-cell__value');
      valueText.setAttribute('x', String(cellCenterX(i)));
      valueText.setAttribute('y', String(CELL_Y + CELL_H / 2));
      valueText.setAttribute('text-anchor', 'middle');
      valueText.setAttribute('dominant-baseline', 'central');
      valueText.textContent = String(value);

      const indexText = document.createElementNS(SVG_NS, 'text');
      indexText.setAttribute('class', 'viz-cell__index');
      indexText.setAttribute('x', String(cellCenterX(i)));
      indexText.setAttribute('y', String(INDEX_Y));
      indexText.setAttribute('text-anchor', 'middle');
      indexText.textContent = String(i);

      cell.append(rect, valueText, indexText);
      group.appendChild(cell);
    });
  }

  /** Updates cell value text in place (same length, e.g. re-render of same trace). */
  private updateCellValues(array: number[]): void {
    const group = this.cellsGroup!;
    array.forEach((value, i) => {
      const valueText = group.querySelector(
        `#${CSS.escape(cellId(i))} .viz-cell__value`,
      );
      if (valueText) valueText.textContent = String(value);
    });
  }

  /** Toggles per-cell state classes from the step's highlights + window. */
  private applyHighlights(step: Step<ArrayWindowState>): void {
    const group = this.cellsGroup!;
    const highlights = step.highlights ?? [];
    const rangeIds = new Set<string>();
    const activeIds = new Set<string>();
    const foundIds = new Set<string>();
    let hasRange = false;
    for (const h of highlights) {
      if (h.kind === 'range') {
        hasRange = true;
        h.ids.forEach((id) => rangeIds.add(id));
      } else if (h.kind === 'active') {
        h.ids.forEach((id) => activeIds.add(id));
      } else if (h.kind === 'found') {
        h.ids.forEach((id) => foundIds.add(id));
      }
    }

    for (let i = 0; i < this.builtLength; i += 1) {
      const id = cellId(i);
      const cell = group.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
      if (!cell) continue;
      const inRange = rangeIds.has(id);
      const isActive = activeIds.has(id);
      const isFound = foundIds.has(id);
      // Eliminated = discarded from the search: outside an existing range, or
      // (when no range remains) every non-answer cell. Dimming is a non-color
      // cue so the window reads without relying on hue (design §3.4).
      const eliminated = !isFound && (hasRange ? !inRange : true);

      cell.classList.toggle('is-range', inRange && !isActive && !isFound);
      cell.classList.toggle('is-active', isActive && !isFound);
      cell.classList.toggle('is-found', isFound);
      cell.classList.toggle('is-eliminated', eliminated && !isActive);
    }
  }

  /** Rebuilds the marker overlay: lo/hi/mid labels, range underbar, ✓ on found. */
  private drawMarkers(state: ArrayWindowState): void {
    const group = this.markersGroup!;
    group.replaceChildren();
    const { lo, hi, mid, foundIndex } = state;
    const last = this.builtLength - 1;
    const within = (i: number | null | undefined): i is number =>
      typeof i === 'number' && i >= 0 && i <= last;

    // Range underbar bracket spanning lo..hi (drawn only for a non-empty window).
    if (within(lo) && within(hi) && lo <= hi) {
      const bar = document.createElementNS(SVG_NS, 'line');
      bar.setAttribute('class', 'viz-range-bar');
      bar.setAttribute('x1', String(cellX(lo)));
      bar.setAttribute('x2', String(cellX(hi) + CELL));
      bar.setAttribute('y1', String(BRACKET_Y));
      bar.setAttribute('y2', String(BRACKET_Y));
      group.appendChild(bar);

      group.appendChild(this.label('lo', cellCenterX(lo), MARKER_Y));
      // Avoid stacking "lo"/"hi" on the same cell when the window is one wide.
      if (hi !== lo) {
        group.appendChild(this.label('hi', cellCenterX(hi), MARKER_Y));
      }
    }

    // "mid" caret above the probe cell (the non-color pairing for `active`).
    if (within(mid)) {
      group.appendChild(
        this.label('mid', cellCenterX(mid), 16, 'viz-mid-label'),
      );
    }

    // ✓ glyph above the found cell (the non-color pairing for `found`).
    if (within(foundIndex)) {
      const check = this.label(
        '✓',
        cellCenterX(foundIndex),
        16,
        'viz-found-mark',
      );
      group.appendChild(check);
    }
  }

  /** Creates a small centered `<text>` marker. */
  private label(
    text: string,
    x: number,
    y: number,
    className = 'viz-marker',
  ): SVGTextElement {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', className);
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('text-anchor', 'middle');
    el.textContent = text;
    return el;
  }
}
