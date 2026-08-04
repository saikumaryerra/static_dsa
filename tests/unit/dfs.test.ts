import { describe, expect, it } from 'vitest';
import { dfs } from '../../src/viz/algorithms/dfs';
import type { Highlight } from '../../src/viz/core/types';

function kinds(
  trace: ReturnType<typeof dfs.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((s) =>
    (s.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('dfs.run', () => {
  it('visits nodes in depth-first order from the start', () => {
    const trace = dfs.run(dfs.defaultInput());
    const last = trace[trace.length - 1]!;
    // Deepens down 0→1→3, backtracks to 2, then 4→5 (smallest-neighbor-first).
    expect(last.explanation).toMatch(/Visit order: 0 → 1 → 3 → 2 → 4 → 5/);
    expect(last.metrics?.['visited']).toBe(6);
  });

  it('visits every node exactly once despite duplicate stack pushes', () => {
    const trace = dfs.run(dfs.defaultInput());
    const visitedSteps = trace.filter((s) => /Pop node/.test(s.explanation));
    expect(visitedSteps).toHaveLength(6);
  });

  it('states the visited count in the final explanation (A11Y-2)', () => {
    const trace = dfs.run(dfs.defaultInput());
    const last = trace[trace.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['visited']} nodes visited`,
    );
    // On a disconnected graph the count is the REACHED set, not every vertex.
    const partial = dfs.run({
      nodeIds: [0, 1, 2],
      edges: [{ from: 1, to: 2 }],
      start: 0,
    });
    expect(partial[partial.length - 1]!.explanation).toContain(
      '1 node visited',
    );
  });

  it('emits frontier, active, and visited highlights', () => {
    const trace = dfs.run(dfs.defaultInput());
    expect(kinds(trace, 'frontier').length).toBeGreaterThan(0);
    expect(kinds(trace, 'active').length).toBeGreaterThan(0);
    expect(kinds(trace, 'visited').length).toBeGreaterThan(0);
  });

  it('respects a custom start node', () => {
    const input = dfs.defaultInput();
    const trace = dfs.run({ ...input, start: 5 });
    expect(trace[0]!.explanation).toMatch(/Start DFS at node 5/);
    expect(trace[trace.length - 1]!.metrics?.['visited']).toBe(6);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = dfs.run(dfs.defaultInput());
    trace[trace.length - 1]!.state.edges.push({ from: 9, to: 9 });
    expect(trace[0]!.state.edges).toHaveLength(6);
  });

  it('final step marks only the reached set on a disconnected graph (B2)', () => {
    // Graph 0-1, 2-3 with start 0: only {0,1} are reachable; the terminal step
    // must NOT falsely mark 2 and 3 visited.
    const trace = dfs.run({
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

describe('dfs.parseInput', () => {
  it('parses an edge list with a start node', () => {
    expect(dfs.parseInput('0-1,1-2 target=1')).toEqual({
      nodeIds: [0, 1, 2],
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
      start: 1,
    });
  });

  it('rejects an empty edge list', () => {
    expect(dfs.parseInput('  target=0')).toEqual({
      error:
        'Type an undirected edge list, e.g. 0-1,0-2,1-3 with a start node.',
    });
  });

  it('rejects a malformed edge', () => {
    expect(dfs.parseInput('1..2 target=1')).toEqual({
      error: 'Bad edge "1..2". Use A-B, e.g. 0-1.',
    });
  });

  it('rejects a start node outside the graph', () => {
    expect(dfs.parseInput('0-1 target=7')).toEqual({
      error: "Start node 7 is not one of the graph's vertices.",
    });
  });
});

describe('dfs.predictStep (M8.2)', () => {
  it('asks the LIFO question and grades it against the node actually popped', () => {
    const input = dfs.defaultInput();
    const trace = dfs.run(input);
    let asked = 0;
    for (let i = 0; i < trace.length; i += 1) {
      const q = dfs.predictStep!(trace, i, input);
      if (!q) continue;
      asked += 1;
      expect(q.prompt).toBe('Which node comes off the stack next?');
      // §11.2 caps choices at 4; two is the floor for a real prediction.
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.choices.length).toBeLessThanOrEqual(4);
      const popped = /^Pop node (\d+)/.exec(trace[i + 1]!.explanation);
      expect(popped).not.toBeNull();
      expect(q.choices[q.correctIndex]).toBe(`Node ${popped![1]}`);
    }
    expect(asked).toBeGreaterThan(0);
  });

  it('keeps the node BFS would have taken on the ballot as a decoy', () => {
    // After visiting 0 the stack holds [2, 1]: LIFO answers 1, while the node
    // discovered first — 2, the FIFO answer — must stay a visible option, since
    // choosing between them IS the lesson.
    const input = dfs.defaultInput();
    const trace = dfs.run(input);
    const i = trace.findIndex((s) => /^Pop node 1\b/.test(s.explanation)) - 1;
    const q = dfs.predictStep!(trace, i, input)!;
    expect(q.choices[q.correctIndex]).toBe('Node 1');
    expect(q.choices).toContain('Node 2');
  });

  it('never renders a one-button question, even where the frontier holds one node', () => {
    // The shipped graph is nearly a path: at step 0 the stack is just [0], so
    // the choices must be widened past the frontier (M8.2's floor guard).
    const input = dfs.defaultInput();
    const trace = dfs.run(input);
    const frontier = (trace[0]!.highlights ?? []).filter(
      (h) => h.kind === 'frontier',
    );
    expect(frontier.flatMap((h) => h.ids)).toEqual(['n0']);

    const q = dfs.predictStep!(trace, 0, input)!;
    expect(q.choices.length).toBeGreaterThanOrEqual(2);
    expect(q.choices[q.correctIndex]).toBe('Node 0');
  });

  it('returns null on a discovery step (the same node is still being processed)', () => {
    const input = dfs.defaultInput();
    const trace = dfs.run(input);
    const i = trace.findIndex((s) => /^Pop node 0/.test(s.explanation));
    expect(trace[i + 1]!.explanation).toMatch(/is undiscovered — push it/);
    expect(dfs.predictStep!(trace, i, input)).toBeNull();
  });

  it('returns null when the next step is the terminal summary, and on the last step', () => {
    const input = dfs.defaultInput();
    const trace = dfs.run(input);
    expect(dfs.predictStep!(trace, trace.length - 2, input)).toBeNull();
    expect(dfs.predictStep!(trace, trace.length - 1, input)).toBeNull();
  });

  it('asks nothing at all when the graph offers no alternative to choose', () => {
    // One vertex: the only "prediction" available would be a single button.
    const input = { nodeIds: [0], edges: [], start: 0 };
    const trace = dfs.run(input);
    for (let i = 0; i < trace.length; i += 1) {
      expect(dfs.predictStep!(trace, i, input)).toBeNull();
    }
  });
});
