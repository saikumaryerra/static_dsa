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
