/**
 * Graph Representations — instrumented demo for the Graphs lesson (site spec §5
 * L9, §11.4). Builds a small graph by revealing it one piece at a time:
 *   1. NODES — add each vertex, in ascending id order.
 *   2. EDGES — add each connection, noting whether it is directed and/or
 *      weighted, and highlighting the edge plus its endpoints as it appears.
 *
 * TState matches GraphRenderer's `GraphState` ({ nodes:{id;label?}[];
 * edges:{from;to;weight?;directed?}[] }). `active` on a node id lifts it (a
 * freshly added vertex), `active` on an edge id draws its path, `visited` marks
 * vertices already placed. The adjacency-list vs adjacency-matrix comparison is
 * LESSON-LEVEL (static tables in the MDX), not part of this renderer state.
 * Imports only core types + `snapshot` + the pure `nodeId`/`edgeId` helpers
 * (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { edgeId, nodeId } from '../core/ids';

/** Hard cap on vertex count (site spec §11.4: graph nodes ≤ 15). */
const MAX_NODES = 15;
/** Sanity cap on edges — keeps the node-link diagram legible. */
const MAX_EDGES = 30;

/** A graph vertex (mirrors GraphRenderer's `GraphNode`). */
export interface GraphReprNode {
  id: number;
}

/** A graph edge (mirrors GraphRenderer's `GraphEdge`). */
export interface GraphReprEdge {
  from: number;
  to: number;
  weight?: number;
  directed?: boolean;
}

/** Typed input: the vertex ids (ascending) and the edges to reveal. */
export interface GraphRepresentationsInput {
  nodeIds: number[];
  edges: GraphReprEdge[];
}

/** Snapshot state GraphRenderer draws. */
export interface GraphRepresentationsState {
  nodes: GraphReprNode[];
  edges: GraphReprEdge[];
}

/**
 * Runs the reveal-the-graph demo, emitting one `Step` per added vertex and edge.
 * Each step deep-copies its state via `snapshot()` (site spec §11.4).
 */
function run(
  input: GraphRepresentationsInput,
): Trace<GraphRepresentationsState> {
  const nodes: GraphReprNode[] = [];
  const edges: GraphReprEdge[] = [];
  const trace: Trace<GraphRepresentationsState> = [];

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ nodes, edges }),
      explanation,
      highlights,
    } satisfies Step<GraphRepresentationsState>);
  };

  push(
    'Build the graph one piece at a time: first the vertices (nodes), then the edges (the connections between them).',
    [],
  );

  // --- 1. Reveal the vertices ---
  for (const id of input.nodeIds) {
    const already = nodes.map((n) => nodeId(n.id));
    nodes.push({ id });
    push(`Add vertex ${id}.`, [
      { kind: 'active', ids: [nodeId(id)] },
      ...(already.length ? [{ kind: 'visited' as const, ids: already }] : []),
    ]);
  }

  const allNodes = nodes.map((n) => nodeId(n.id));

  // --- 2. Reveal the edges ---
  for (const edge of input.edges) {
    edges.push(edge);
    const arrow = edge.directed
      ? `${edge.from} → ${edge.to}`
      : `${edge.from} — ${edge.to}`;
    const kindText = edge.directed ? 'directed' : 'undirected';
    const weightText =
      edge.weight !== undefined ? ` with weight ${edge.weight}` : '';
    push(`Add a ${kindText} edge ${arrow}${weightText}.`, [
      { kind: 'active', ids: [edgeId(edge.from, edge.to)] },
      { kind: 'active', ids: [nodeId(edge.from), nodeId(edge.to)] },
      { kind: 'visited', ids: allNodes },
    ]);
  }

  const directedCount = edges.filter((e) => e.directed).length;
  const weightedCount = edges.filter((e) => e.weight !== undefined).length;
  const summary =
    directedCount === edges.length
      ? 'every edge is directed'
      : directedCount === 0
        ? 'every edge is undirected'
        : `${directedCount} of ${edges.length} edges are directed`;
  push(
    `The graph is complete: ${nodes.length} vertices and ${edges.length} edges (${summary}${
      weightedCount > 0 ? ', all weighted' : ''
    }).`,
    [{ kind: 'visited', ids: allNodes }],
  );

  return trace;
}

/**
 * Parses the custom-input box, an edge list like `"0>1:4, 0>2:1, 2>1:2"`. Each
 * token is `A-B` (undirected) or `A>B` (directed), with an optional `:weight`.
 * Vertices are inferred from the edges. Returns `{ error }` (never throws) and
 * enforces the node/edge caps.
 */
function parseInput(
  raw: string,
): GraphRepresentationsInput | { error: string } {
  const text = raw.trim();
  if (text.length === 0) {
    return { error: 'Type an edge list, e.g. 0>1:4, 0>2:1, 2>1:2' };
  }

  const tokens = text
    .split(',')
    .map((t) => t.replace(/\s+/g, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return { error: 'Add at least one edge, e.g. 0>1:4' };
  }

  const edges: GraphReprEdge[] = [];
  const nodeSet = new Set<number>();
  for (const tok of tokens) {
    // A-B (undirected) or A>B (directed), optional :weight.
    const m = tok.match(/^(\d+)(-|>)(\d+)(?::(\d+))?$/);
    if (!m) {
      return {
        error: `Bad edge "${tok}". Use A-B (undirected) or A>B (directed), e.g. 0>1:4`,
      };
    }
    const from = Number(m[1]);
    const to = Number(m[3]);
    const directed = m[2] === '>';
    const weight = m[4] !== undefined ? Number(m[4]) : undefined;
    edges.push({
      from,
      to,
      ...(weight !== undefined ? { weight } : {}),
      directed,
    });
    nodeSet.add(from);
    nodeSet.add(to);
  }

  if (nodeSet.size > MAX_NODES) {
    return { error: 'Keep it to 15 vertices or fewer.' };
  }
  if (edges.length > MAX_EDGES) {
    return { error: 'Keep it to 30 edges or fewer.' };
  }

  const nodeIds = [...nodeSet].sort((a, b) => a - b);
  return { nodeIds, edges };
}

/** The registered Graph Representations demo. */
export const graphRepresentations: Algorithm<
  GraphRepresentationsInput,
  GraphRepresentationsState
> = {
  id: 'graph-representations',
  label: 'Build a graph: vertices, edges, directed and weighted',
  run,
  defaultInput: () => ({
    nodeIds: [0, 1, 2, 3],
    edges: [
      { from: 0, to: 1, weight: 4, directed: true },
      { from: 0, to: 2, weight: 1, directed: true },
      { from: 2, to: 1, weight: 2, directed: true },
      { from: 1, to: 3, weight: 5, directed: true },
      { from: 2, to: 3, weight: 8, directed: true },
    ],
  }),
  parseInput,
};
