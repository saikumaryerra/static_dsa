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
