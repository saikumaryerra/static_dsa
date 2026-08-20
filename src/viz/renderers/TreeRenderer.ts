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
import type { Extent, Highlight, RendererModule, Step } from '../core/types';
import { edgeId, nodeId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { circle, group, line, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  foundMark,
  insertMark,
  metaLabel,
  nullLabelWidth,
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
/** The resting label an empty tree draws. `boxOf` sizes the box around it. */
const EMPTY_LABEL = 'empty tree';
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

/**
 * The box a laid-out tree needs: the furthest node centre plus one radius and
 * the pad, floored by the resting label when there is one. Takes the layout
 * rather than the state so `draw` and `measure` share one formula without
 * laying the tree out twice inside `draw`.
 *
 * @param pos - The laid-out node centres from {@link layout}.
 * @param drawsEmptyLabel - Whether `draw` will emit {@link EMPTY_LABEL} for this
 *   step. Passed rather than inferred from `pos.size` so the floor applies on
 *   EXACTLY the steps that draw the label: a malformed tree whose root names a
 *   missing node also lays out empty but draws nothing, and reserving label
 *   room there would be a band of blank canvas with no label in it.
 */
function boxOf(pos: Map<number, Pos>, drawsEmptyLabel: boolean): Extent {
  let maxX = PAD;
  let maxY = PAD + TOP;
  for (const p of pos.values()) {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // The resting frame must contain its own label (Plan A §4): an empty tree's
  // node-derived box is 40 units wide and "empty tree" is ~110, so the label was
  // drawn entirely outside it and the still read as blank.
  const labelW = drawsEmptyLabel ? nullLabelWidth(EMPTY_LABEL) + PAD * 2 : 0;
  return { w: Math.max(maxX + R + PAD, labelW), h: maxY + R + PAD };
}

/**
 * The natural box for one step. Extracted from `draw` (which now calls the same
 * `boxOf`) so a caller can reduce a trace to its extent without building any
 * markup — the BST is the renderer that grows most, 66 → 222 units across its
 * lesson run (`npm run audit:frames`).
 */
const measure = (step: Step<TreeState>): Extent =>
  boxOf(layout(step.state), step.state.root === null);

function draw(step: Step<TreeState>): Canvas {
  const state = step.state;
  const pos = layout(state);
  const byId = new Map<number, TreeNode>();
  for (const node of state.nodes) byId.set(node.id, node);
  const classes = applyHighlights(step.highlights);

  const box = boxOf(pos, state.root === null);

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
  if (state.root === null) {
    // Centred in the box `boxOf` widened for it, so the two cannot disagree.
    structure += text(EMPTY_LABEL, {
      class: 'viz-null',
      x: box.w / 2,
      y: PAD + TOP + R,
      'text-anchor': 'middle',
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
    viewBox: `0 0 ${box.w} ${box.h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered BST renderer. */
export const treeRenderer: RendererModule<TreeState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
  measure,
};
