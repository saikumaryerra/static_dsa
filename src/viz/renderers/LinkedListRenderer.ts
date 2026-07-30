/**
 * LinkedListRenderer — horizontal singly/doubly linked list (architecture §4.2,
 * design §2b.1).
 *
 * TState: { nodes:{value}[]; kind:'singly'|'doubly'; pointers?:{name;index}[] }.
 * Id scheme: node at index `i` is `nodeId(i)` (`"n1"`). `next` arrows connect
 * adjacent nodes; a terminal `⌀` marks null. Named pointers render as captioned
 * carets beneath their node (or the `⌀` when their index is null).
 *
 * Honored highlights: `pointer` (named caret), `insert` (+), `delete` (✕ +
 * strikethrough), `active`, `compare` (tie-line), `visited` (✓ badge).
 */
import type { RendererModule, Step } from '../core/types';
import { nodeId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, line, polygon, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  deleteMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  visitedBadge,
  type Canvas,
} from './shared';

/** A named pointer into the list (e.g. `head`, `p`). */
export interface ListPointer {
  name: string;
  index: number | null;
}

/** State LinkedListRenderer draws. */
export interface LinkedListState {
  nodes: { value: number }[];
  kind: 'singly' | 'doubly';
  pointers?: ListPointer[];
}

// --- Geometry (design §2b.1) ---
const PAD = 10;
const TOP = 26;
const NODE_W = 54;
const NODE_H = 40;
const PITCH = 88; // node-to-node center pitch
const idIndex = (id: string): number => Number(id.slice(1));

const nodeX = (i: number): number => PAD + i * PITCH;
const NODE_Y = PAD + TOP;
const MID_Y = NODE_Y + NODE_H / 2;
const CAPTION_Y = NODE_Y + NODE_H + 18;
const HEIGHT = CAPTION_Y + 14;
const widthOf = (n: number): number => PAD * 2 + Math.max(n, 1) * PITCH;

/** Right-pointing arrowhead triangle ending at (x, y). */
const arrowRight = (x: number, y: number): string =>
  polygon({
    class: 'viz-arrow',
    points: `${x},${y} ${x - 8},${y - 4} ${x - 8},${y + 4}`,
  });

function draw(step: Step<LinkedListState>): Canvas {
  const { nodes, kind, pointers = [] } = step.state;
  const n = nodes.length;
  const classes = applyHighlights(step.highlights);

  let structure = '';

  // Edges first (behind nodes): next arrows between adjacent nodes.
  for (let i = 0; i < n; i += 1) {
    const from = nodeX(i) + NODE_W;
    const to = i < n - 1 ? nodeX(i + 1) : nodeX(i) + NODE_W + 24;
    structure += line({
      class: 'viz-edge',
      x1: from,
      x2: to,
      y1: MID_Y,
      y2: MID_Y,
    });
    structure += arrowRight(to, MID_Y);
    if (kind === 'doubly' && i < n - 1) {
      structure += line({
        class: 'viz-edge',
        x1: nodeX(i + 1),
        x2: from,
        y1: MID_Y + 8,
        y2: MID_Y + 8,
      });
      structure += polygon({
        class: 'viz-arrow',
        points: `${from},${MID_Y + 8} ${from + 8},${MID_Y + 4} ${from + 8},${MID_Y + 12}`,
      });
    }
  }
  // Terminal null glyph.
  structure += text('⌀', {
    class: 'viz-null',
    x: nodeX(Math.max(n - 1, 0)) + NODE_W + 30,
    y: MID_Y,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });

  // Nodes.
  nodes.forEach((node, i) => {
    const cls = classes.get(nodeId(i));
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: nodeX(i),
        y: NODE_Y,
        width: NODE_W,
        height: NODE_H,
        rx: 6,
      }) +
        text(node.value, {
          class: 'viz-cell__value',
          x: nodeX(i) + NODE_W / 2,
          y: MID_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }),
      { id: nodeId(i), class: ['viz-cell', cls].filter(Boolean).join(' ') },
    );
  });
  if (n === 0) {
    structure += text('empty list ⌀', {
      class: 'viz-null',
      x: PAD + 40,
      y: MID_Y,
      'dominant-baseline': 'central',
    });
  }

  // Markers: state pointers + highlight markers.
  let markers = '';
  for (const p of pointers) {
    const cx =
      p.index === null
        ? nodeX(Math.max(n - 1, 0)) + NODE_W + 30
        : nodeX(p.index) + NODE_W / 2;
    markers +=
      text('▲', {
        class: 'viz-caret',
        x: cx,
        y: NODE_Y + NODE_H + 6,
        'text-anchor': 'middle',
      }) + caretMark(p.name, cx, CAPTION_Y);
  }
  for (const h of step.highlights ?? []) {
    if (h.kind === 'compare' && h.ids.length >= 2) {
      const a = nodeX(idIndex(h.ids[0]!)) + NODE_W / 2;
      const b = nodeX(idIndex(h.ids[1]!)) + NODE_W / 2;
      markers += line({
        class: 'viz-tie',
        x1: a,
        x2: b,
        y1: TOP - 4,
        y2: TOP - 4,
      });
      continue;
    }
    for (const id of h.ids) {
      const i = idIndex(id);
      const cx = nodeX(i) + NODE_W / 2;
      if (h.kind === 'insert') {
        markers += insertMark(cx, NODE_Y - 6);
      } else if (h.kind === 'delete') {
        markers +=
          deleteMark(cx, NODE_Y - 6) +
          line({
            class: 'viz-strike',
            x1: nodeX(i) + 8,
            x2: nodeX(i) + NODE_W - 8,
            y1: MID_Y,
            y2: MID_Y,
          });
      } else if (h.kind === 'visited') {
        markers += visitedBadge(nodeX(i) + NODE_W - 4, NODE_Y + 2);
      } else if (h.kind === 'pointer' || h.kind === 'active') {
        markers +=
          text('▲', {
            class: 'viz-caret',
            x: cx,
            y: NODE_Y + NODE_H + 6,
            'text-anchor': 'middle',
          }) + caretMark(metaLabel(h, 'p'), cx, CAPTION_Y);
      }
    }
  }

  return {
    viewBox: `0 0 ${widthOf(n)} ${HEIGHT}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered linked-list renderer. */
export const linkedListRenderer: RendererModule<LinkedListState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
};
