import { describe, expect, it } from 'vitest';
import { bfs } from '../../src/viz/algorithms/bfs';
import type { Highlight } from '../../src/viz/core/types';

function kinds(
  trace: ReturnType<typeof bfs.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((s) =>
    (s.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('bfs.run', () => {
  it('visits nodes in breadth-first order from the start', () => {
    const trace = bfs.run(bfs.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.explanation).toMatch(/Visit order: 0 → 1 → 2 → 3 → 4 → 5/);
    expect(last.metrics?.['visited']).toBe(6);
  });

  it('visits every node exactly once', () => {
    const trace = bfs.run(bfs.defaultInput());
    const visitedSteps = trace.filter((s) =>
      /Dequeue node/.test(s.explanation),
    );
    expect(visitedSteps).toHaveLength(6);
  });

  it('states the visited count in the final explanation (A11Y-2)', () => {
    const trace = bfs.run(bfs.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['visited']} nodes visited`,
    );
    // On a disconnected graph the count is the REACHED set, not every vertex.
    const partial = bfs.run({
      nodeIds: [0, 1, 2],
      edges: [{ from: 1, to: 2 }],
      start: 0,
    });
    expect(partial[partial.length - 1]!.explanation).toContain(
      '1 node visited',
    );
  });

  it('emits frontier, active, and visited highlights', () => {
    const trace = bfs.run(bfs.defaultInput());
    expect(kinds(trace, 'frontier').length).toBeGreaterThan(0);
    expect(kinds(trace, 'active').length).toBeGreaterThan(0);
    expect(kinds(trace, 'visited').length).toBeGreaterThan(0);
  });

  it('respects a custom start node', () => {
    const input = bfs.defaultInput();
    const trace = bfs.run({ ...input, start: 3 });
    // From node 3 the immediate neighbors are 1, 2, 4.
    expect(trace[0]!.explanation).toMatch(/Start BFS at node 3/);
    expect(trace[trace.length - 1]!.metrics?.['visited']).toBe(6);
  });

  it('keeps the graph state constant across steps', () => {
    const trace = bfs.run(bfs.defaultInput());
    for (const step of trace) {
      expect(step.state.nodes).toHaveLength(6);
      expect(step.state.edges).toHaveLength(6);
    }
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = bfs.run(bfs.defaultInput());
    trace[trace.length - 1]!.state.nodes.push({ id: 99 });
    expect(trace[0]!.state.nodes).toHaveLength(6);
  });

  it('final step marks only the reached set on a disconnected graph (B2)', () => {
    // Graph 0-1, 2-3 with start 0: only {0,1} are reachable; the terminal step
    // must NOT falsely mark 2 and 3 visited.
    const trace = bfs.run({
      nodeIds: [0, 1, 2, 3],
      edges: [
        { from: 0, to: 1 },
        { from: 2, to: 3 },
      ],
      start: 0,
    });
    const last = trace[trace.length - 1]!;
    const visited = (last.highlights ?? []).filter((h) => h.kind === 'visited');
    const visitedIds = new Set(visited.flatMap((h) => h.ids));
    expect(visitedIds).toEqual(new Set(['n0', 'n1']));
    expect(visitedIds.has('n2')).toBe(false);
    expect(visitedIds.has('n3')).toBe(false);
  });
});

describe('bfs.parseInput', () => {
  it('parses an edge list with a start node', () => {
    expect(bfs.parseInput('0-1,0-2,1-3 target=0')).toEqual({
      nodeIds: [0, 1, 2, 3],
      edges: [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        { from: 1, to: 3 },
      ],
      start: 0,
    });
  });

  it('defaults the start to the smallest vertex when none is given', () => {
    const result = bfs.parseInput('2-3,3-4');
    expect(result).not.toHaveProperty('error');
    expect((result as { start: number }).start).toBe(2);
  });

  it('rejects an empty edge list', () => {
    expect(bfs.parseInput('  target=0')).toEqual({
      error:
        'Type an undirected edge list, e.g. 0-1,0-2,1-3 with a start node.',
    });
  });

  it('rejects a malformed edge', () => {
    expect(bfs.parseInput('0>1 target=0')).toEqual({
      error: 'Bad edge "0>1". Use A-B, e.g. 0-1.',
    });
  });

  it('rejects a start node outside the graph', () => {
    expect(bfs.parseInput('0-1,1-2 target=9')).toEqual({
      error: "Start node 9 is not one of the graph's vertices.",
    });
  });

  it('rejects more than 15 vertices', () => {
    const raw = Array.from({ length: 15 }, (_, i) => `${i}-${i + 1}`).join(',');
    expect(bfs.parseInput(raw)).toEqual({
      error: 'Keep it to 15 vertices or fewer.',
    });
  });
});

describe('bfs.predictStep (M8.2)', () => {
  it('asks the FIFO question and grades it against the node actually dequeued', () => {
    const input = bfs.defaultInput();
    const trace = bfs.run(input);
    let asked = 0;
    for (let i = 0; i < trace.length; i += 1) {
      const q = bfs.predictStep!(trace, i, input);
      if (!q) continue;
      asked += 1;
      expect(q.prompt).toBe('Which node comes off the queue next?');
      // §11.2 caps choices at 4; two is the floor for a real prediction.
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.choices.length).toBeLessThanOrEqual(4);
      const dequeued = /^Dequeue node (\d+)/.exec(trace[i + 1]!.explanation);
      expect(dequeued).not.toBeNull();
      expect(q.choices[q.correctIndex]).toBe(`Node ${dequeued![1]}`);
    }
    expect(asked).toBeGreaterThan(0);
  });

  it('never renders a one-button question, even where the frontier holds one node', () => {
    // The shipped graph is nearly a path: at step 0 the queue is just [0], so
    // the choices must be widened past the frontier (M8.2's floor guard).
    const input = bfs.defaultInput();
    const trace = bfs.run(input);
    const frontier = (trace[0]!.highlights ?? []).filter(
      (h) => h.kind === 'frontier',
    );
    expect(frontier.flatMap((h) => h.ids)).toEqual(['n0']);

    const q = bfs.predictStep!(trace, 0, input)!;
    expect(q.choices.length).toBeGreaterThanOrEqual(2);
    expect(q.choices[q.correctIndex]).toBe('Node 0');
  });

  it('returns null on a discovery step (the same node is still being processed)', () => {
    const input = bfs.defaultInput();
    const trace = bfs.run(input);
    const i = trace.findIndex((s) => /^Dequeue node 0/.test(s.explanation));
    expect(trace[i + 1]!.explanation).toMatch(/is undiscovered — enqueue it/);
    expect(bfs.predictStep!(trace, i, input)).toBeNull();
  });

  it('returns null when the next step is the terminal summary, and on the last step', () => {
    const input = bfs.defaultInput();
    const trace = bfs.run(input);
    expect(bfs.predictStep!(trace, trace.length - 2, input)).toBeNull();
    expect(bfs.predictStep!(trace, trace.length - 1, input)).toBeNull();
  });

  it('asks nothing at all when the graph offers no alternative to choose', () => {
    // One vertex: the only "prediction" available would be a single button.
    const input = { nodeIds: [0], edges: [], start: 0 };
    const trace = bfs.run(input);
    for (let i = 0; i < trace.length; i += 1) {
      expect(bfs.predictStep!(trace, i, input)).toBeNull();
    }
  });
});
