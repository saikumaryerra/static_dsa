/**
 * TreeRenderer — binary search tree, in-order-rank × depth layout (architecture
 * §4.5, ADR-M3-2; design §2b.4). Dependency-free, O(n), no overlap: `x` = the
 * node's in-order rank, `y` = its depth.
 *
 * TState: { nodes:{id;value;left;right}[]; root }. Id scheme: node `id` is
 * `nodeId(id)` (`"n5"`); a parent→child edge is `edgeId(parent,child)`.
 *
 * Honored highlights: node `active`/`compare`/`found`/`insert`/`visited` (ring +
 * glyph); an edge id carried in any highlight becomes the search-path style
 * (thicker dashed `is-path`). Edges are drawn first (behind the nodes).
 */
import type { Highlight, RendererModule, Step } from '../core/types';
import { edgeId, nodeId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { circle, group, line, text } from '../core/svg';
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

/** A BST node (children referenced by id, or `null`). */
export interface TreeNode {
  id: number;
  value: number;
  left: number | null;
  right: number | null;
}

/** State TreeRenderer draws. */
export interface TreeState {
  nodes: TreeNode[];
  root: number | null;
}

// --- Geometry (design §2.5) ---
const PAD = 10;
const TOP = 26;
const XSTEP = 64;
const YSTEP = 68;
const R = 20;
/**
 * Floor for the drawn box — three rank slots wide, one node row tall.
 *
 * The frame is fluid, so its rendered height is `containerWidth × vbHeight /
 * vbWidth`: a box narrower than it is tall does not draw a small picture, it
 * draws a TALL one. The natural empty-tree box (40×66) resolved to ~1,300 CSS
 * pixels of blank frame at desktop width, and a one-node tree (60×86) to ~1,200
 * — both of them a step 0, which is precisely the frame that ships to the
 * build-time still, to JS-off readers and to print. The floor makes the resting
 * frame landscape, so it is close in height to the populated frames that follow
 * it, and it gives the empty label a box to sit inside.
 */
const MIN_W = PAD * 2 + XSTEP * 3;
const MIN_H = PAD * 2 + TOP + R * 2;
const idIndex = (id: string): number => Number(id.slice(1));

interface Pos {
  x: number;
  y: number;
}

/** In-order rank (x) and depth (y) for every reachable node. */
function layout(state: TreeState): Map<number, Pos> {
  const byId = new Map<number, TreeNode>();
  for (const node of state.nodes) byId.set(node.id, node);
  const pos = new Map<number, Pos>();
  const seen = new Set<number>();
  let rank = 0;
  const visit = (id: number | null, depth: number): void => {
    if (id === null) return;
    // Cycle guard: a malformed BST with a back-edge must not stack-overflow the
    // build. Each id is laid out at most once.
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    visit(node.left, depth + 1);
    pos.set(id, {
      x: PAD + R + rank * XSTEP,
      y: PAD + TOP + R + depth * YSTEP,
    });
    rank += 1;
    visit(node.right, depth + 1);
  };
  visit(state.root, 0);
  return pos;
}

function draw(step: Step<TreeState>): Canvas {
  const state = step.state;
  const pos = layout(state);
  const byId = new Map<number, TreeNode>();
  for (const node of state.nodes) byId.set(node.id, node);
  const classes = applyHighlights(step.highlights);

  let maxX = PAD;
  let maxY = PAD + TOP;
  for (const p of pos.values()) {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  // Edges first (behind nodes).
  let structure = '';
  for (const node of state.nodes) {
    const parent = pos.get(node.id);
    if (!parent) continue;
    for (const child of [node.left, node.right]) {
      if (child === null) continue;
      const childPos = pos.get(child);
      if (!childPos) continue;
      const eid = edgeId(node.id, child);
      const onPath = classes.has(eid);
      structure += line({
        class: ['viz-edge', onPath ? 'is-path' : undefined]
          .filter(Boolean)
          .join(' '),
        x1: parent.x,
        y1: parent.y,
        x2: childPos.x,
        y2: childPos.y,
      });
    }
  }

  // Nodes.
  for (const node of state.nodes) {
    const p = pos.get(node.id);
    if (!p) continue;
    const cls = classes.get(nodeId(node.id));
    structure += group(
      circle({ class: 'viz-node__circle', cx: p.x, cy: p.y, r: R }) +
        text(node.value, {
          class: 'viz-node__value',
          x: p.x,
          y: p.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }),
      {
        id: nodeId(node.id),
        class: ['viz-node', cls].filter(Boolean).join(' '),
      },
    );
  }
  // The resting frame. Keyed on "nothing was laid out" rather than on
  // `root === null`, so a state whose root points at a missing node still says
  // so instead of drawing a silent void. `x: PAD` puts the label's left edge on
  // the same rule as the leftmost node's circle, INSIDE the floored box above —
  // the old `PAD + 40` sat outside the 40-unit-wide box this step computed, so
  // the frame rendered literally blank.
  if (pos.size === 0) {
    structure += text('empty tree', {
      class: 'viz-null',
      x: PAD,
      y: PAD + TOP + R,
      'dominant-baseline': 'central',
    });
  }

  // Markers.
  let markers = '';
  const markAt = (
    h: Highlight,
    glyph: (x: number, y: number) => string,
  ): void => {
    for (const id of h.ids) {
      const p = pos.get(idIndex(id));
      if (p) markers += glyph(p.x, p.y - R - 8);
    }
  };
  for (const h of step.highlights ?? []) {
    if (h.kind === 'found') markAt(h, foundMark);
    else if (h.kind === 'insert') markAt(h, insertMark);
    else if (h.kind === 'visited') {
      for (const id of h.ids) {
        const p = pos.get(idIndex(id));
        if (p) markers += visitedBadge(p.x + R - 2, p.y - R + 4);
      }
    } else if (h.kind === 'active' || h.kind === 'pointer') {
      for (const id of h.ids) {
        const p = pos.get(idIndex(id));
        if (p) markers += caretMark(metaLabel(h, 'curr'), p.x, p.y - R - 8);
      }
    } else if (h.kind === 'compare' && h.ids.length >= 2) {
      const a = pos.get(idIndex(h.ids[0]!));
      const b = pos.get(idIndex(h.ids[1]!));
      if (a && b)
        markers += line({
          class: 'viz-tie',
          x1: a.x,
          y1: a.y - R,
          x2: b.x,
          y2: b.y - R,
        });
    }
  }

  return {
    viewBox:
      `0 0 ${Math.max(maxX + R + PAD, MIN_W)}` +
      ` ${Math.max(maxY + R + PAD, MIN_H)}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered BST renderer. */
export const treeRenderer: RendererModule<TreeState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
};
