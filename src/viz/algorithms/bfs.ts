/**
 * Breadth-First Search — instrumented algorithm (site spec §5 L14, §11.4).
 * Explores a graph level by level from a start node, using a QUEUE (FIFO) as the
 * frontier: dequeue a node, visit it, and enqueue its undiscovered neighbors.
 *
 * TState matches GraphRenderer's `GraphState` ({ nodes:{id}[]; edges:{from;to}[] })
 * and stays constant across steps — only the highlights move. Ids are
 * `nodeId(id)` and `edgeId(from,to)`. Highlights: `visited` (nodes already
 * processed), `frontier` (nodes waiting in the queue), `active` (the node being
 * processed, and the edge a node was discovered across). The queue's contents are
 * narrated in each step's explanation (the frontier-as-queue panel is
 * lesson-level, not a renderer change). Imports only core types + `snapshot` +
 * the pure `nodeId`/`edgeId` helpers (never a renderer — architecture §3).
 */
import type { Algorithm, Highlight, Step, Trace } from '../core/types';
import { snapshot } from '../core/snapshot';
import { edgeId, nodeId } from '../core/ids';

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
 * Runs BFS from `input.start`, emitting a `Step` per dequeue/visit and per
 * discovery. Each step deep-copies its state via `snapshot()` (site spec §11.4).
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

  /** Resolves the stored edge id for an undiscovered-neighbor edge (either way). */
  const storedEdge = (a: number, b: number): string | null => {
    for (const e of edges) {
      if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) {
        return edgeId(e.from, e.to);
      }
    }
    return null;
  };

  const done: Record<number, boolean> = {};
  const inQueue: Record<number, boolean> = {};
  const queue: number[] = [];
  const order: number[] = [];

  const frontierIds = (): string[] => queue.map((id) => nodeId(id));

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

  queue.push(input.start);
  inQueue[input.start] = true;
  push(
    `Start BFS at node ${input.start}. Enqueue it — the queue (frontier) is [${input.start}].`,
    [{ kind: 'frontier', ids: frontierIds() }],
  );

  while (queue.length > 0) {
    const node = queue.shift()!;
    inQueue[node] = false;
    done[node] = true;
    order.push(node);
    metrics.visited += 1;
    const visitedExceptCurrent = input.nodeIds
      .filter((id) => done[id] && id !== node)
      .map((id) => nodeId(id));
    push(
      `Dequeue node ${node} and visit it. Queue is now [${queue.join(', ') || '∅'}].`,
      [
        { kind: 'active', ids: [nodeId(node)] },
        { kind: 'visited', ids: visitedExceptCurrent },
        { kind: 'frontier', ids: frontierIds() },
      ],
    );

    for (const nb of adj.get(node) ?? []) {
      if (done[nb] || inQueue[nb]) continue;
      queue.push(nb);
      inQueue[nb] = true;
      const edge = storedEdge(node, nb);
      push(
        `Node ${nb} is undiscovered — enqueue it. Queue is now [${queue.join(', ')}].`,
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
    `BFS complete. The queue is empty. Visit order: ${order.join(' → ')}. ${visitedCount()}.`,
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

/** The registered Breadth-First Search algorithm. */
export const bfs: Algorithm<TraversalInput, TraversalState> = {
  id: 'bfs',
  label: 'Breadth-first search (queue frontier)',
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
};
