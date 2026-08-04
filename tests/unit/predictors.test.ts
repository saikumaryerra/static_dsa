import { describe, expect, it } from 'vitest';
import {
  predictAdjacentSwap,
  predictNextVisit,
} from '../../src/viz/algorithms/predictors';
import type { Highlight, Step } from '../../src/viz/core/types';

/**
 * A minimal synthetic step. Both shared rules read only `highlights` and
 * `metrics` — never `state` — so the state slot can be `null` here, which is
 * also what lets the helpers be typed `Trace<unknown>`.
 */
function step(
  highlights: Highlight[],
  metrics?: Record<string, number>,
): Step<null> {
  return { state: null, explanation: '', highlights, metrics };
}

/** A compare step carrying the cumulative swap count so far. */
const compareStep = (swaps: number): Step<null> =>
  step([{ kind: 'compare', ids: ['i0', 'i1'] }], { comparisons: 1, swaps });

describe('predictAdjacentSwap', () => {
  it('returns null on the last step — there is no successor to grade against', () => {
    const trace = [compareStep(0)];
    expect(predictAdjacentSwap(trace, 0)).toBeNull();
  });

  it('returns null on a step that is not a compare', () => {
    const trace = [
      step([{ kind: 'swap', ids: ['i0', 'i1'] }], { swaps: 1 }),
      compareStep(1),
    ];
    expect(predictAdjacentSwap(trace, 0)).toBeNull();
  });

  it('grades "Swap" when the next step increments the swaps metric', () => {
    const trace = [
      compareStep(2),
      step([{ kind: 'swap', ids: ['i0', 'i1'] }], { swaps: 3 }),
    ];
    const q = predictAdjacentSwap(trace, 0)!;
    expect(q.choices[q.correctIndex]).toBe('Swap');
  });

  it('grades "No swap" when the swaps metric holds steady', () => {
    const trace = [
      compareStep(2),
      step([{ kind: 'found', ids: ['i1'] }], { swaps: 2 }),
    ];
    const q = predictAdjacentSwap(trace, 0)!;
    expect(q.choices[q.correctIndex]).toBe('No swap');
  });

  it("returns null when the algorithm has no swaps metric (merge sort's shape)", () => {
    const trace = [
      step([{ kind: 'compare', ids: ['i0', 'i1'] }], { comparisons: 1 }),
      step([{ kind: 'found', ids: ['i1'] }], { comparisons: 1 }),
    ];
    expect(predictAdjacentSwap(trace, 0)).toBeNull();
  });

  it('offers exactly two neutral choices with a valid correctIndex', () => {
    const trace = [compareStep(0), compareStep(0)];
    const q = predictAdjacentSwap(trace, 0)!;
    expect(q.choices).toEqual(['Swap', 'No swap']);
    expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q.correctIndex).toBeLessThan(q.choices.length);
  });

  it('hands out a fresh choices array per call (a caller cannot corrupt the next question)', () => {
    const trace = [compareStep(0), compareStep(0)];
    const first = predictAdjacentSwap(trace, 0)!;
    first.choices[0] = 'mutated';
    expect(predictAdjacentSwap(trace, 0)!.choices[0]).toBe('Swap');
  });
});

/** The prompt each traversal passes in; the helper must pass it through verbatim. */
const PROMPT = 'Which node comes off the queue next?';

/** A visit step: one `active` naming the visited node, plus the marked sets. */
function visitStep(
  active: number,
  visited: number[],
  frontier: number[],
): Step<null> {
  return step([
    { kind: 'active', ids: [`n${active}`] },
    { kind: 'visited', ids: visited.map((n) => `n${n}`) },
    { kind: 'frontier', ids: frontier.map((n) => `n${n}`) },
  ]);
}

describe('predictNextVisit', () => {
  it('returns null on the last step', () => {
    const trace = [visitStep(0, [], [1])];
    expect(predictNextVisit(trace, 0, [0, 1], PROMPT)).toBeNull();
  });

  it('returns null when the next step has no active highlight (the terminal step)', () => {
    const trace = [
      visitStep(0, [], [1]),
      step([{ kind: 'visited', ids: ['n0', 'n1'] }]),
    ];
    expect(predictNextVisit(trace, 0, [0, 1], PROMPT)).toBeNull();
  });

  it('returns null when the next step leads with an EDGE id, not a node', () => {
    // Defensive: `n*` and `e*_*` share no prefix, so an edge can never be read
    // as the next visited node.
    const trace = [
      visitStep(0, [], [1]),
      step([
        { kind: 'active', ids: ['e0_1'] },
        { kind: 'frontier', ids: ['n1'] },
      ]),
    ];
    expect(predictNextVisit(trace, 0, [0, 1], PROMPT)).toBeNull();
  });

  it('reads the FIRST active id, ignoring the trailing edge a discovery step carries', () => {
    const trace = [
      visitStep(0, [], [1, 2]),
      step([
        { kind: 'active', ids: ['n1'] },
        { kind: 'frontier', ids: ['n2'] },
        { kind: 'active', ids: ['e0_1'] },
      ]),
    ];
    const q = predictNextVisit(trace, 0, [0, 1, 2], PROMPT)!;
    expect(q.choices[q.correctIndex]).toBe('Node 1');
  });

  it('returns null while the same node stays active (a discovery, not a visit)', () => {
    const trace = [visitStep(0, [], [1]), visitStep(0, [], [1, 2])];
    expect(predictNextVisit(trace, 0, [0, 1, 2], PROMPT)).toBeNull();
  });

  it("returns null when the next visited node is not in this step's frontier", () => {
    const trace = [visitStep(0, [], [1]), visitStep(2, [0], [1])];
    expect(predictNextVisit(trace, 0, [0, 1, 2], PROMPT)).toBeNull();
  });

  it('never renders a one-button question: a single-node frontier still gets decoys', () => {
    const trace = [
      step([{ kind: 'frontier', ids: ['n0'] }]),
      visitStep(0, [], []),
    ];
    const q = predictNextVisit(trace, 0, [0, 1, 2], PROMPT)!;
    expect(q.choices.length).toBeGreaterThanOrEqual(2);
    expect(q.choices.length).toBeLessThanOrEqual(4);
    expect(q.choices[q.correctIndex]).toBe('Node 0');
  });

  it('returns null when the graph offers nothing to choose between (the floor guard)', () => {
    const trace = [
      step([{ kind: 'frontier', ids: ['n0'] }]),
      visitStep(0, [], []),
    ];
    expect(predictNextVisit(trace, 0, [0], PROMPT)).toBeNull();
  });

  it('prefers other frontier nodes as decoys — they are the real distractors', () => {
    const trace = [visitStep(0, [], [1, 2]), visitStep(1, [0], [2])];
    const q = predictNextVisit(trace, 0, [0, 1, 2, 3, 4, 5], PROMPT)!;
    expect(q.choices).toEqual(['Node 1', 'Node 2', 'Node 3']);
    expect(q.correctIndex).toBe(0);
  });

  it('sorts already-marked nodes last: an unvisited node outranks a ticked one', () => {
    // Frontier holds only the answer, so decoys come from the rest of the graph:
    // node 4 (unmarked) must be preferred over nodes 0/1 (visited) and 3 (active).
    const trace = [visitStep(3, [0, 1], [2]), visitStep(2, [0, 1, 3], [])];
    const q = predictNextVisit(trace, 0, [0, 1, 2, 3, 4], PROMPT)!;
    expect(q.choices).toContain('Node 4');
    expect(q.choices[q.correctIndex]).toBe('Node 2');
  });

  it("orders choices by node number so the answer's position never leaks it", () => {
    const trace = [visitStep(0, [], [3, 1]), visitStep(3, [0], [1])];
    const q = predictNextVisit(trace, 0, [0, 1, 2, 3], PROMPT)!;
    expect(q.choices).toEqual([...q.choices].sort());
    expect(q.choices[q.correctIndex]).toBe('Node 3');
  });

  it("passes the caller's prompt through verbatim and stays pure across calls", () => {
    const trace = [visitStep(0, [], [1, 2]), visitStep(1, [0], [2])];
    const nodeIds = [0, 1, 2, 3];
    const first = predictNextVisit(trace, 0, nodeIds, PROMPT)!;
    const second = predictNextVisit(trace, 0, nodeIds, PROMPT)!;
    expect(first.prompt).toBe(PROMPT);
    expect(second).toEqual(first);
    expect(second.choices).not.toBe(first.choices);
  });
});
