/**
 * Depth-First Search — instrumented algorithm (site spec §5 L14, §11.4). Explores
 * a graph by going as deep as possible before backtracking, using a STACK (LIFO)
 * as the frontier: pop a node, visit it, and push its undiscovered neighbors.
 *
 * TState matches GraphRenderer's `GraphState` ({ nodes:{id}[]; edges:{from;to}[] })
 * and stays constant across steps — only the highlights move. Ids are
 * `nodeId(id)` and `edgeId(from,to)`. Highlights: `visited` (nodes already
 * processed), `frontier` (nodes waiting on the stack), `active` (the node being
 * processed, and the edge a node was discovered across). The stack's contents are
 * narrated in each step's explanation (the frontier-as-stack panel is
 * lesson-level, not a renderer change). Neighbors are pushed in descending order
 * so the smallest is popped first, giving a stable ascending DFS. Imports only
 * core types + `snapshot` + the pure `nodeId`/`edgeId` helpers (never a renderer).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { edgeId, nodeId } from '../core/ids';
import { predictNextVisit } from './predictors';

/** Hard cap on vertex count (site spec §11.4: graph nodes ≤ 15). */
const MAX_NODES = 15;
/** Sanity cap on edges — keeps the node-link diagram legible. */
const MAX_EDGES = 30;

/** An undirected edge between two vertex ids. */
export interface TraversalEdge {
  from: number;
  to: number;
}

/** Typed input: the vertices, the (undirected) edges, and the start vertex. */
export interface TraversalInput {
  nodeIds: number[];
  edges: TraversalEdge[];
  start: number;
}

/** Snapshot state GraphRenderer draws (constant graph; highlights vary). */
export interface TraversalState {
  nodes: { id: number }[];
  edges: { from: number; to: number }[];
}

/** Builds a sorted undirected adjacency map so traversal order is deterministic. */
function buildAdjacency(
  nodeIds: number[],
  edges: TraversalEdge[],
): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const { from, to } of edges) {
    adj.get(from)?.push(to);
    adj.get(to)?.push(from);
  }
  for (const list of adj.values()) list.sort((a, b) => a - b);
  return adj;
}

/**
 * Runs DFS from `input.start` with an explicit stack, emitting a `Step` per
 * pop/visit and per discovery. Each step deep-copies its state via `snapshot()`
 * (site spec §11.4). A node may be pushed more than once; a `done` guard on pop
 * skips any already-visited entry.
 */
function run(input: TraversalInput): Trace<TraversalState> {
  const nodes = input.nodeIds.map((id) => ({ id }));
  const edges = input.edges.map((e) => ({ from: e.from, to: e.to }));
  const adj = buildAdjacency(input.nodeIds, input.edges);
  const trace: Trace<TraversalState> = [];
  const metrics = { visited: 0 };

  /**
   * The visited metric in words, e.g. `"6 nodes visited"`. The final step states
   * it so the metrics pill's payoff also reaches the `aria-live` explanation and
   * the SVG `<desc>` (A11Y-2) — it is the count that differs on a disconnected
   * graph, where the traversal never reaches every vertex.
   */
  const visitedCount = (): string =>
    `${metrics.visited} node${metrics.visited === 1 ? '' : 's'} visited`;

  const storedEdge = (a: number, b: number): string | null => {
    for (const e of edges) {
      if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) {
        return edgeId(e.from, e.to);
      }
    }
    return null;
  };

  const done: Record<number, boolean> = {};
  const stack: number[] = [];
  const order: number[] = [];

  /** Distinct undiscovered node numbers still on the stack (the live frontier). */
  const frontierNodes = (): number[] => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const id of stack) {
      if (done[id] || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };

  /** The frontier as `nodeId` highlight targets (the caret/ring layer). */
  const frontierIds = (): string[] => frontierNodes().map((id) => nodeId(id));

  /**
   * The frontier for NARRATION — the same deduped set the caret shows, so the
   * explanation never lists a node twice when it sits on the stack more than once
   * (the raw `stack` can hold duplicate pending pushes; the caret dedupes them).
   */
  const frontierText = (): string => {
    const nodes = frontierNodes();
    return nodes.length > 0 ? nodes.join(', ') : '∅';
  };

  const push = (explanation: string, highlights: Highlight[]): void => {
    trace.push({
      state: snapshot({ nodes, edges }),
      explanation,
      // Drop empty-id highlights (e.g. no visited nodes yet) so a colour class is
      // never emitted without a target — keeps the non-color marker rule honest.
      highlights: highlights.filter((h) => h.ids.length > 0),
      metrics: { ...metrics },
    } satisfies Step<TraversalState>);
  };

  stack.push(input.start);
  push(
    `Start DFS at node ${input.start}. Push it — the stack (frontier) is [${input.start}].`,
    [{ kind: 'frontier', ids: frontierIds() }],
  );

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (done[node]) continue; // stale duplicate: already visited via another edge
    done[node] = true;
    order.push(node);
    metrics.visited += 1;
    const visitedExceptCurrent = input.nodeIds
      .filter((id) => done[id] && id !== node)
      .map((id) => nodeId(id));
    push(
      `Pop node ${node} and visit it. The frontier is now [${frontierText()}].`,
      [
        { kind: 'active', ids: [nodeId(node)] },
        { kind: 'visited', ids: visitedExceptCurrent },
        { kind: 'frontier', ids: frontierIds() },
      ],
    );

    // Push undiscovered neighbors in DESCENDING order → smallest ends on top.
    const neighbors = [...(adj.get(node) ?? [])].reverse();
    for (const nb of neighbors) {
      if (done[nb]) continue;
      stack.push(nb);
      const edge = storedEdge(node, nb);
      push(
        `Node ${nb} is undiscovered — push it. The frontier is now [${frontierText()}].`,
        [
          { kind: 'active', ids: [nodeId(node)] },
          { kind: 'visited', ids: visitedExceptCurrent },
          { kind: 'frontier', ids: frontierIds() },
          ...(edge ? [{ kind: 'active' as const, ids: [edge] }] : []),
        ],
      );
    }
  }

  push(
    `DFS complete. The stack is empty. Visit order: ${order.join(' → ')}. ${visitedCount()}.`,
    [
      // Only the REACHED set is visited — on a disconnected graph, unreached
      // vertices must not get a false ✓ (site spec §11 non-color markers).
      { kind: 'visited', ids: order.map((id) => nodeId(id)) },
    ],
  );
  return trace;
}

/**
 * Parses the custom-input box: an undirected edge list in the "array" field like
 * `"0-1,0-2,1-3,2-3"` and a start vertex in the "target" field. Vertices are
 * inferred from the edges. Returns `{ error }` (never throws) and enforces the
 * node/edge caps.
 */
function parseInput(raw: string): TraversalInput | { error: string } {
  const targetMatch = raw.match(/target\s*=\s*(-?\d+)/i);
  const edgePart = raw.replace(/target\s*=.*/i, '').trim();

  const tokens = edgePart
    .split(',')
    .map((t) => t.replace(/\s+/g, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return {
      error:
        'Type an undirected edge list, e.g. 0-1,0-2,1-3 with a start node.',
    };
  }

  const edges: TraversalEdge[] = [];
  const nodeSet = new Set<number>();
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)-(\d+)$/);
    if (!m) {
      return { error: `Bad edge "${tok}". Use A-B, e.g. 0-1.` };
    }
    const from = Number(m[1]);
    const to = Number(m[2]);
    edges.push({ from, to });
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
  const start = targetMatch ? Number(targetMatch[1]) : nodeIds[0]!;
  if (!nodeSet.has(start)) {
    return { error: `Start node ${start} is not one of the graph's vertices.` };
  }

  return { nodeIds, edges, start };
}

/** The registered Depth-First Search algorithm. */
export const dfs: Algorithm<TraversalInput, TraversalState> = {
  id: 'dfs',
  label: 'Depth-first search (stack frontier)',
  run,
  defaultInput: () => ({
    nodeIds: [0, 1, 2, 3, 4, 5],
    edges: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
    ],
    start: 0,
  }),
  parseInput,
  // M8.2: predicting the next pop IS the LIFO rule — the stack's top, the most
  // recently pushed node, not the one that has waited longest.
  predictStep: (trace, i, input) =>
    predictNextVisit(
      trace,
      i,
      input.nodeIds,
      'Which node comes off the stack next?',
    ),
};
