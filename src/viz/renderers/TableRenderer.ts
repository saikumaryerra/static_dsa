/**
 * TableRenderer — SVG renderer for a 1-D dynamic-programming table (M6 design §1).
 *
 * A DP table (`dp[0..n]`) is visually a 1-D array that fills in, so this is a
 * near-sibling of {@link ArrayRenderer}: it forks the same rectangular-cell
 * primitive, the same `CELL/GAP/PAD/TOP` geometry (m3 §2.5), the same `cellId(i)`
 * id scheme, and the same `.viz-cell*`/`.viz-tie`/marker CSS. It introduces no new
 * token, colour, highlight kind, or id function (2-D grid DP is deferred — see the
 * design §1.1 SPEC-GAP; a future `tableCellId(r,c)` is reserved, not built).
 *
 * TState: {@link TableState} — `table:(number|null)[]` (`null` = a cell not yet
 * computed) plus optional `n` (the target index, informational). The renderer is
 * driven purely by `step.highlights`; `n` is not read here.
 *
 * Honored highlights (via `core/highlight`), each with its mandatory non-color
 * marker so no `--hl-*` fill ever appears without a colour-independent cue
 * (design §3.2 QA gate):
 *   - `active`  — the cell being computed now (`dp[i]`): named caret + ring + lift.
 *   - `compare` — a dependency being read/recomputed now: amber ring + a dashed
 *     tie-line from the dependency up to the active cell.
 *   - `visited` — a dependency already computed and REUSED (the cache hit): a `✓`
 *     badge + a dashed tie-line to the active cell.
 *   - `insert`  — a cell just filled this step: `+` caret.
 *   - `found`   — the final answer cell `dp[n]`: `✓` glyph.
 * Plus `is-eliminated` (dim) for not-yet-reached cells, drawn with a centered `·`.
 *
 * Dependency edges are expressed through `highlights` only: the renderer draws a
 * tie-line from every `compare`/`visited` id to the single `active` id, so
 * `dp[i] = dp[i-1] + dp[i-2]` reads as "these two feed this one" without any extra
 * edge field on the state (design §1.4 data-shape note).
 *
 * Build path: uses the shared `createRenderer`/`renderStaticSvg` atomic-redraw
 * plumbing (like QueueRenderer), so the build-time still is exactly `trace[0]` and
 * reduced motion is inherited from the token layer — no `matchMedia` here.
 */
import type { Extent, RendererModule, Step } from '../core/types';
import { cellId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, line, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  foundMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  visitedBadge,
  type Canvas,
} from './shared';

/**
 * State TableRenderer draws: the 1-D DP table (a `null` slot is a cell not yet
 * computed) plus the optional target index `n` (informational; the renderer is
 * driven by highlights, not by `n`).
 */
export interface TableState {
  table: (number | null)[];
  n?: number;
}

// --- SVG geometry (viewBox units; m3 §2.5 — forked from ArrayRenderer verbatim) ---
const CELL = 54;
const GAP = 8;
const PAD = 10;
const TOP = 26; // marker band above the cells (carets / tie-lines / + / ✓)
const CELL_Y = PAD + TOP; // top edge of a boxed cell
const INDEX_Y = CELL_Y + CELL + 16; // index number under each cell
const CARET_Y = 16; // caret label / + / ✓ in the top band
const TIE_Y = CARET_Y + 6; // where dependency tie-lines converge on the active cell
const HEIGHT = INDEX_Y + 12;

const cellX = (i: number): number => PAD + i * (CELL + GAP);
const cellCenterX = (i: number): number => cellX(i) + CELL / 2;
const widthOf = (n: number): number =>
  PAD * 2 + Math.max(n, 1) * (CELL + GAP) - GAP;

/**
 * The natural box for one step. Extracted from `draw` (which now calls it) so a
 * caller can reduce a trace to its extent without building any markup.
 */
const measure = (step: Step<TableState>): Extent => ({
  w: widthOf(step.state.table.length),
  h: HEIGHT,
});

/** Index behind a `cellId` string (`"i3"` → 3). */
const idIndex = (id: string): number => Number(id.slice(1));

/**
 * Pure draw: one `Step<TableState>` → a `Canvas` (viewBox + inner markup). Shared
 * by the client DOM path and the build-time still through `shared.ts`.
 */
function draw(step: Step<TableState>): Canvas {
  const { table } = step.state;
  const classes = applyHighlights(step.highlights);
  const highlights = step.highlights ?? [];

  // The single active cell every dependency tie-line converges on (if any).
  const activeId = highlights
    .filter((h) => h.kind === 'active')
    .flatMap((h) => h.ids)[0];
  const activeCx =
    activeId !== undefined ? cellCenterX(idIndex(activeId)) : null;

  // --- Cell row (fork of the ArrayRenderer boxed-cell primitive) ---
  let structure = '';
  table.forEach((value, i) => {
    const cx = cellCenterX(i);
    const hlClass = classes.get(cellId(i));
    const empty = value === null;
    // An un-highlighted empty cell is dimmed (not yet computed); a highlighted
    // cell (e.g. the active dp[i] before it is filled) keeps full opacity.
    const cls = [
      'viz-cell',
      hlClass,
      empty && !hlClass ? 'is-eliminated' : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: cellX(i),
        y: CELL_Y,
        width: CELL,
        height: CELL,
        rx: 6,
      }) +
        text(empty ? '·' : (value as number), {
          class: empty ? 'viz-null' : 'viz-cell__value',
          x: cx,
          y: CELL_Y + CELL / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }) +
        text(i, {
          class: 'viz-cell__index',
          x: cx,
          y: INDEX_Y,
          'text-anchor': 'middle',
        }),
      { id: cellId(i), class: cls },
    );
  });

  // --- Marker overlay (the non-color layer; rebuilt each step) ---
  let markers = '';
  for (const h of highlights) {
    if (h.kind === 'active') {
      for (const id of h.ids) {
        markers += caretMark(
          metaLabel(h, 'dp[i]'),
          cellCenterX(idIndex(id)),
          CARET_Y,
        );
      }
    } else if (h.kind === 'insert') {
      for (const id of h.ids)
        markers += insertMark(cellCenterX(idIndex(id)), CARET_Y);
    } else if (h.kind === 'found') {
      for (const id of h.ids)
        markers += foundMark(cellCenterX(idIndex(id)), CARET_Y);
    } else if (h.kind === 'visited') {
      // Cache hit: a ✓ badge, plus a dependency tie-line to the active cell.
      for (const id of h.ids) {
        const cx = cellCenterX(idIndex(id));
        markers += visitedBadge(cx, CARET_Y);
        if (activeCx !== null && cx !== activeCx) {
          markers += line({
            class: 'viz-tie',
            x1: cx,
            y1: CELL_Y,
            x2: activeCx,
            y2: TIE_Y,
          });
        }
      }
    } else if (h.kind === 'compare') {
      // Dependency being read now: the amber ring comes from the is-compare rect;
      // the dashed tie-line to the active cell is the paired non-color cue.
      for (const id of h.ids) {
        const cx = cellCenterX(idIndex(id));
        if (activeCx !== null && cx !== activeCx) {
          markers += line({
            class: 'viz-tie',
            x1: cx,
            y1: CELL_Y,
            x2: activeCx,
            y2: TIE_Y,
          });
        }
      }
    }
  }

  const box = measure(step);
  return {
    viewBox: `0 0 ${box.w} ${box.h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered 1-D DP table renderer (`renderer="table"`). */
export const tableRenderer: RendererModule<TableState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
  measure,
};
