/**
 * HeapRenderer — binary heap as a tree + its backing array, side by side
 * (architecture §4.6, design §2b.5). The shared-index link IS the lesson: a
 * highlight on index `k` marks BOTH the tree node and the array cell, joined by
 * a thin dashed tether.
 *
 * TState: { heap:number[]; size; comparing?; swapping? }. Layout by direct index
 * math (no traversal): node `i` sits at depth `floor(log2(i+1))`, spread within
 * its level. Id scheme: index `i` is BOTH `nodeId(i)` (tree) and `cellId(i)`
 * (array); the renderer expands a highlight on either id to both views.
 *
 * Honored highlights: `compare` (tie-line + tether, both views), `swap` (↔, both
 * views), `active`. Reads `state.comparing`/`state.swapping` as a convenience so
 * heap algorithms need not emit two id schemes.
 */
import type { RendererModule, Step } from '../core/types';
import { cellId, nodeId } from '../core/ids';
import { HIGHLIGHTS, type HighlightKind } from '../core/highlight';
import { circle, group, line, rect, text } from '../core/svg';
import {
  createRenderer,
  renderStaticSvg,
  swapMark,
  type Canvas,
} from './shared';

/** State HeapRenderer draws. */
export interface HeapState {
  heap: number[];
  size: number;
  comparing?: number[];
  swapping?: number[];
}

// --- Geometry (design §2b.5) ---
const PAD = 10;
const TOP = 26;
const R = 18;
const YSTEP = 62;
const LEAF_GAP = 60; // horizontal room per bottom-level node
const CELL = 46;
const CELL_GAP = 6;

const depthOf = (i: number): number => Math.floor(Math.log2(i + 1));
const idIndex = (id: string): number => Number(id.slice(1));

function draw(step: Step<HeapState>): Canvas {
  const { heap } = step.state;
  const size = Math.min(step.state.size, heap.length);
  const items = heap.slice(0, size);
  const n = items.length;

  const maxDepth = n > 0 ? depthOf(n - 1) : 0;
  const bottomCount = 2 ** maxDepth;
  const treeWidth = Math.max(bottomCount * LEAF_GAP, LEAF_GAP);
  const arrayWidth = Math.max(n, 1) * (CELL + CELL_GAP) - CELL_GAP;
  const contentWidth = Math.max(treeWidth, arrayWidth);
  const width = PAD * 2 + contentWidth;

  // Tree node centers by index (spread within level).
  const treeCx = (i: number): number => {
    const d = depthOf(i);
    const levelCount = 2 ** d;
    const posInLevel = i - (2 ** d - 1);
    return PAD + ((posInLevel + 0.5) * treeWidth) / levelCount;
  };
  const treeCy = (i: number): number => PAD + TOP + R + depthOf(i) * YSTEP;

  const arrayTop = PAD + TOP + (maxDepth + 1) * YSTEP + 16;
  const arrayX0 = PAD + (contentWidth - arrayWidth) / 2;
  const cellX = (i: number): number => arrayX0 + i * (CELL + CELL_GAP);

  // Which kind marks each index (compare / swap / active) → both views. Store the
  // Highlight KIND; the css-class and tether token are sourced from the single
  // canonical `HIGHLIGHTS` table so this renderer never re-derives colour math.
  type MarkKind = Extract<HighlightKind, 'compare' | 'swap' | 'active'>;
  const kindByIndex = new Map<number, MarkKind>();
  const mark = (i: number, k: MarkKind): void => {
    if (i >= 0 && i < n) kindByIndex.set(i, k);
  };
  for (const i of step.state.comparing ?? []) mark(i, 'compare');
  for (const i of step.state.swapping ?? []) mark(i, 'swap');
  for (const h of step.highlights ?? []) {
    const k: MarkKind =
      h.kind === 'swap' ? 'swap' : h.kind === 'active' ? 'active' : 'compare';
    for (const id of h.ids) mark(idIndex(id), k);
  }
  const classOf = (i: number): string | undefined => {
    const k = kindByIndex.get(i);
    return k ? HIGHLIGHTS[k].cssClass : undefined;
  };

  let structure = '';
  // Edges (parent → child) behind nodes.
  for (let i = 1; i < n; i += 1) {
    const parent = (i - 1) >> 1;
    structure += line({
      class: 'viz-edge',
      x1: treeCx(parent),
      y1: treeCy(parent),
      x2: treeCx(i),
      y2: treeCy(i),
    });
  }
  // Tree nodes.
  for (let i = 0; i < n; i += 1) {
    const cls = classOf(i);
    structure += group(
      circle({
        class: 'viz-node__circle',
        cx: treeCx(i),
        cy: treeCy(i),
        r: R,
      }) +
        text(items[i]!, {
          class: 'viz-node__value',
          x: treeCx(i),
          y: treeCy(i),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }),
      { id: nodeId(i), class: ['viz-node', cls].filter(Boolean).join(' ') },
    );
  }
  // Divider between the two bands.
  structure += line({
    class: 'viz-divider',
    x1: PAD,
    x2: width - PAD,
    y1: arrayTop - 12,
    y2: arrayTop - 12,
  });
  // Backing-array cells.
  for (let i = 0; i < n; i += 1) {
    const cls = classOf(i);
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: cellX(i),
        y: arrayTop,
        width: CELL,
        height: CELL,
        rx: 6,
      }) +
        text(items[i]!, {
          class: 'viz-cell__value',
          x: cellX(i) + CELL / 2,
          y: arrayTop + CELL / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }) +
        text(i, {
          class: 'viz-cell__index',
          x: cellX(i) + CELL / 2,
          y: arrayTop + CELL + 14,
          'text-anchor': 'middle',
        }),
      { id: cellId(i), class: ['viz-cell', cls].filter(Boolean).join(' ') },
    );
  }
  if (n === 0) {
    structure += text('empty heap', {
      class: 'viz-null',
      x: width / 2,
      y: PAD + TOP + R,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
  }

  // Markers: tether tree↔array per marked index; ↔ for swapped pair. The tether
  // colour comes from the canonical `HIGHLIGHTS[kind].token` — one source of truth.
  let markers = '';
  for (const [i, k] of kindByIndex) {
    markers += line({
      class: 'viz-tether',
      stroke: `var(${HIGHLIGHTS[k].token})`,
      x1: treeCx(i),
      y1: treeCy(i) + R,
      x2: cellX(i) + CELL / 2,
      y2: arrayTop,
    });
  }
  const swapIdx = [...kindByIndex.entries()]
    .filter(([, k]) => k === 'swap')
    .map(([i]) => i);
  if (swapIdx.length >= 2) {
    const [a, b] = swapIdx;
    markers += swapMark(
      (treeCx(a!) + treeCx(b!)) / 2,
      Math.min(treeCy(a!), treeCy(b!)) - R - 2,
    );
    markers += swapMark((cellX(a!) + cellX(b!)) / 2 + CELL / 2, arrayTop - 6);
  }
  const cmpIdx = [...kindByIndex.entries()]
    .filter(([, k]) => k === 'compare')
    .map(([i]) => i);
  if (cmpIdx.length >= 2) {
    const [a, b] = cmpIdx;
    markers += line({
      class: 'viz-tie',
      x1: treeCx(a!),
      y1: treeCy(a!) - R,
      x2: treeCx(b!),
      y2: treeCy(b!) - R,
    });
  }

  const height = arrayTop + CELL + 24;
  return {
    viewBox: `0 0 ${width} ${height}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered heap renderer. */
export const heapRenderer: RendererModule<HeapState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
};
