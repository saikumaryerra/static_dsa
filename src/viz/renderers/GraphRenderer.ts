/**
 * GraphRenderer — node-link diagram, deterministic circle layout (architecture
 * §4.7, ADR-M3-3; design §2b.6). No force simulation: node `i` sits at
 * `angle = i/n·2π` on a circle (radius scales with `n` so nodes never collide),
 * reproducible for tests at ≤ 15 nodes. Optional per-node `pos` is honored.
 *
 * TState: { nodes:{id;label?;pos?}[]; edges:{from;to;weight?;directed?}[] }.
 * Id scheme: node `id` is `nodeId(id)`; an edge is `edgeId(from,to)`. Directed
 * edges get a hand-drawn arrowhead; weighted edges a midpoint label pill.
 *
 * Honored highlights (the CVD-critical trio, design §2b.6): `visited` (violet +
 * ✓ badge), `frontier` (teal DASHED RING — the shape carries it), `active` (blue
 * + lift + caret); an edge id in any highlight becomes `is-path`.
 */
import type { Extent, RendererModule, Step } from '../core/types';
import { edgeId, nodeId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { circle, group, line, polygon, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  metaLabel,
  renderStaticSvg,
  visitedBadge,
  type Canvas,
} from './shared';

/** A graph node; `pos` overrides the default circle placement. */
export interface GraphNode {
  id: number;
  label?: string;
  pos?: { x: number; y: number };
}

/** A graph edge; `directed` adds an arrowhead, `weight` a midpoint label. */
export interface GraphEdge {
  from: number;
  to: number;
  weight?: number;
  directed?: boolean;
}

/** State GraphRenderer draws. */
export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- Geometry ---
const PAD = 10;
const R = 20; // node radius
const idIndex = (id: string): number => Number(id.slice(1));

interface Pt {
  x: number;
  y: number;
}

/**
 * Node placement AND the box it needs, in one pass. The two are inseparable —
 * the ring radius sets the default square, and an authored `pos` can push past
 * it — so `measure` and `draw` share this single source rather than each
 * re-deriving the arithmetic (`draw` destructures `posById` from the same call).
 */
function geometry(state: GraphState): {
  posById: Map<number, Pt>;
  box: Extent;
} {
  const { nodes } = state;
  const n = nodes.length;
  const ring = Math.max(70, n * 13);
  const center = ring + R + 24 + PAD;

  const posById = new Map<number, Pt>();
  nodes.forEach((node, i) => {
    if (node.pos) {
      posById.set(node.id, node.pos);
    } else {
      const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      posById.set(node.id, {
        x: center + ring * Math.cos(a),
        y: center + ring * Math.sin(a),
      });
    }
  });

  let w = 2 * center;
  let h = 2 * center;
  for (const p of posById.values()) {
    w = Math.max(w, p.x + R + PAD);
    h = Math.max(h, p.y + R + PAD);
  }
  return { posById, box: { w, h } };
}

/**
 * The natural box for one step. Geometry only — no markup built — so a caller
 * can reduce a whole trace to its extent cheaply.
 */
const measure = (step: Step<GraphState>): Extent => geometry(step.state).box;

function draw(step: Step<GraphState>): Canvas {
  const { nodes, edges } = step.state;
  const n = nodes.length;
  const { posById, box } = geometry(step.state);

  const classes = applyHighlights(step.highlights);

  // Edges first (behind nodes).
  let structure = '';
  for (const edge of edges) {
    const a = posById.get(edge.from);
    const b = posById.get(edge.to);
    if (!a || !b) continue;
    const onPath = classes.has(edgeId(edge.from, edge.to));
    const cls = ['viz-edge', onPath ? 'is-path' : undefined]
      .filter(Boolean)
      .join(' ');
    // Trim the segment to the circle boundaries.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * R;
    const sy = a.y + uy * R;
    const ex = b.x - ux * R;
    const ey = b.y - uy * R;
    structure += line({ class: cls, x1: sx, y1: sy, x2: ex, y2: ey });
    if (edge.directed) {
      structure += polygon({
        class: ['viz-arrow', onPath ? 'is-path' : undefined]
          .filter(Boolean)
          .join(' '),
        points: `${ex},${ey} ${ex - ux * 10 - uy * 5},${ey - uy * 10 + ux * 5} ${ex - ux * 10 + uy * 5},${ey - uy * 10 - ux * 5}`,
      });
    }
    if (edge.weight !== undefined) {
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      structure +=
        rect({
          class: 'viz-weight-pill',
          x: mx - 11,
          y: my - 9,
          width: 22,
          height: 18,
          rx: 4,
        }) +
        text(edge.weight, {
          class: 'viz-weight',
          x: mx,
          y: my,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
    }
  }

  // Nodes.
  for (const node of nodes) {
    const p = posById.get(node.id);
    if (!p) continue;
    const cls = classes.get(nodeId(node.id));
    structure += group(
      circle({ class: 'viz-node__circle', cx: p.x, cy: p.y, r: R }) +
        text(node.label ?? node.id, {
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
  if (n === 0) {
    structure += text('empty graph', {
      class: 'viz-null',
      x: PAD + 40,
      y: PAD + 40,
    });
  }

  // Markers.
  let markers = '';
  for (const h of step.highlights ?? []) {
    for (const id of h.ids) {
      const p = posById.get(idIndex(id));
      if (!p) continue;
      if (h.kind === 'visited') {
        markers += visitedBadge(p.x + R - 2, p.y - R + 4);
      } else if (h.kind === 'frontier') {
        // Explicit dashed ring — the non-color cue for the frontier (design §2b.6).
        markers += circle({
          cx: p.x,
          cy: p.y,
          r: R + 4,
          fill: 'none',
          stroke: 'var(--hl-frontier)',
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
        });
      } else if (h.kind === 'active' || h.kind === 'pointer') {
        markers += caretMark(metaLabel(h, 'at'), p.x, p.y - R - 8);
      }
    }
  }

  return {
    viewBox: `0 0 ${box.w} ${box.h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered graph renderer. */
export const graphRenderer: RendererModule<GraphState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
  measure,
};
