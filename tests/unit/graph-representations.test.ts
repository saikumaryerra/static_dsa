import { describe, expect, it } from 'vitest';
import {
  graphRepresentations,
  type GraphRepresentationsInput,
} from '../../src/viz/algorithms/graph-representations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof graphRepresentations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('graphRepresentations.run', () => {
  it('reveals every vertex then every edge, ending with the full graph', () => {
    const input = graphRepresentations.defaultInput();
    const trace = graphRepresentations.run(input);
    const last = trace[trace.length - 1]!;
    expect(last.state.nodes.map((n) => n.id)).toEqual([0, 1, 2, 3]);
    expect(last.state.edges).toEqual(input.edges);
  });

  it('marks each vertex active as it is added and grows the node set', () => {
    const trace = graphRepresentations.run(graphRepresentations.defaultInput());
    // Step 1 adds vertex 0.
    expect(trace[1]!.state.nodes.map((n) => n.id)).toEqual([0]);
    expect(highlightsOfKind(trace, 'active')).toContainEqual({
      kind: 'active',
      ids: ['n0'],
    });
  });

  it('highlights each edge and its endpoints as it appears', () => {
    const trace = graphRepresentations.run(graphRepresentations.defaultInput());
    const active = highlightsOfKind(trace, 'active');
    // The first edge 0 -> 1 lights its edge id and both endpoints.
    expect(active).toContainEqual({ kind: 'active', ids: ['e0_1'] });
    expect(active).toContainEqual({ kind: 'active', ids: ['n0', 'n1'] });
  });

  it('preserves directed and weighted flags in the state', () => {
    const trace = graphRepresentations.run(graphRepresentations.defaultInput());
    const last = trace[trace.length - 1]!;
    for (const edge of last.state.edges) {
      expect(edge.directed).toBe(true);
      expect(typeof edge.weight).toBe('number');
    }
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = graphRepresentations.run(graphRepresentations.defaultInput());
    trace[trace.length - 1]!.state.edges.push({ from: 9, to: 9 });
    expect(trace[1]!.state.edges).toEqual([]);
  });
});

describe('graphRepresentations.parseInput', () => {
  it('parses a directed weighted edge list and infers the vertices', () => {
    expect(graphRepresentations.parseInput('0>1:4, 0>2:1, 2>1:2')).toEqual({
      nodeIds: [0, 1, 2],
      edges: [
        { from: 0, to: 1, weight: 4, directed: true },
        { from: 0, to: 2, weight: 1, directed: true },
        { from: 2, to: 1, weight: 2, directed: true },
      ],
    } satisfies GraphRepresentationsInput);
  });

  it('parses an undirected unweighted edge with no weight field', () => {
    expect(graphRepresentations.parseInput('0-1')).toEqual({
      nodeIds: [0, 1],
      edges: [{ from: 0, to: 1, directed: false }],
    } satisfies GraphRepresentationsInput);
  });

  it('strips the client-composed trailing "target=" tail (B1 regression)', () => {
    // The Visualizer client always composes `${edges} target=${target}`; with an
    // empty target field the raw string ends in ` target=`. It must not corrupt
    // the last edge token — parseInput has to succeed and ignore the tail.
    expect(graphRepresentations.parseInput('0-1,1-2 target=')).toEqual({
      nodeIds: [0, 1, 2],
      edges: [
        { from: 0, to: 1, directed: false },
        { from: 1, to: 2, directed: false },
      ],
    } satisfies GraphRepresentationsInput);
  });

  it('parses a normal directed edge list with a trailing target tail', () => {
    expect(graphRepresentations.parseInput('0>1:4, 2>3 target=9')).toEqual({
      nodeIds: [0, 1, 2, 3],
      edges: [
        { from: 0, to: 1, weight: 4, directed: true },
        { from: 2, to: 3, directed: true },
      ],
    } satisfies GraphRepresentationsInput);
  });

  it('rejects an empty edge list', () => {
    expect(graphRepresentations.parseInput('')).toEqual({
      error: 'Type an edge list, e.g. 0>1:4, 0>2:1, 2>1:2',
    });
  });

  it('rejects a malformed edge token', () => {
    expect(graphRepresentations.parseInput('0~1')).toEqual({
      error:
        'Bad edge "0~1". Use A-B (undirected) or A>B (directed), e.g. 0>1:4',
    });
  });

  it('rejects more than 15 vertices (the node cap)', () => {
    const raw = '0-1,2-3,4-5,6-7,8-9,10-11,12-13,14-15';
    expect(graphRepresentations.parseInput(raw)).toEqual({
      error: 'Keep it to 15 vertices or fewer.',
    });
  });
});
