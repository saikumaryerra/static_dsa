import { describe, expect, it } from 'vitest';
import {
  recursionCallStack,
  type RecursionInput,
} from '../../src/viz/algorithms/recursion-callstack';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof recursionCallStack.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('recursionCallStack.run', () => {
  it('grows the stack to depth n, then unwinds to empty', () => {
    const trace = recursionCallStack.run({ n: 4 });
    const depths = trace.map((s) => s.state.frames.length);
    expect(Math.max(...depths)).toBe(4); // factorial(4) → 4 nested calls
    expect(trace[0]!.state.frames).toHaveLength(0); // starts empty
    expect(trace[trace.length - 1]!.state.frames).toHaveLength(0); // ends empty
  });

  it('reaches the base case and returns the correct factorial', () => {
    const trace = recursionCallStack.run({ n: 4 });
    const last = trace[trace.length - 1]!;
    expect(last.explanation).toMatch(/factorial\(4\) = 24/);
    // A base-case step exists where the top frame returns 1.
    expect(trace.some((s) => /base case/.test(s.explanation))).toBe(true);
  });

  it('emits a call (insert) and a return (delete) for every frame', () => {
    const trace = recursionCallStack.run({ n: 3 });
    // 3 calls → 3 inserts and 3 deletes.
    expect(highlightsOfKind(trace, 'insert')).toHaveLength(3);
    expect(highlightsOfKind(trace, 'delete')).toHaveLength(3);
  });

  it('records call count and max depth in metrics', () => {
    const last = recursionCallStack.run({ n: 5 });
    const metrics = last[last.length - 1]!.metrics;
    expect(metrics?.['calls']).toBe(5);
    expect(metrics?.['maxDepth']).toBe(5);
  });

  it('states the call count and max depth in the final explanation (A11Y-2)', () => {
    const trace = recursionCallStack.run({ n: 4 });
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree.
    expect(last.explanation).toContain(
      `${last.metrics!['calls']} calls, max depth ${last.metrics!['maxDepth']}`,
    );
    // Depth is a level, not a count, so only "call" is pluralized.
    const single = recursionCallStack.run({ n: 1 });
    expect(single[single.length - 1]!.explanation).toContain(
      '1 call, max depth 1.',
    );
  });

  it('handles the n = 1 base case with a single frame', () => {
    const trace = recursionCallStack.run({ n: 1 });
    expect(Math.max(...trace.map((s) => s.state.frames.length))).toBe(1);
    expect(trace[trace.length - 1]!.explanation).toMatch(/factorial\(1\) = 1/);
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = recursionCallStack.run({ n: 4 });
    const deepest = trace.reduce((a, b) =>
      b.state.frames.length > a.state.frames.length ? b : a,
    );
    deepest.state.frames.push({ label: 'x' });
    expect(
      Math.max(...trace.map((s) => s.state.frames.length)),
    ).toBeGreaterThan(4); // only the mutated copy grew
    // The original max (excluding the mutated one) is still 4.
    const maxes = trace.map((s) => s.state.frames.length).sort((a, b) => b - a);
    expect(maxes[1]).toBe(4);
  });
});

describe('recursionCallStack.parseInput', () => {
  it('parses a bare number', () => {
    expect(recursionCallStack.parseInput('5')).toEqual({
      n: 5,
    } satisfies RecursionInput);
  });

  it('ignores the generic form target suffix', () => {
    expect(recursionCallStack.parseInput('6 target=')).toEqual({ n: 6 });
  });

  it('rejects non-numeric input', () => {
    expect(recursionCallStack.parseInput('abc')).toEqual({
      error: 'Type a whole number for n, e.g. 5',
    });
  });

  it('rejects negative n', () => {
    expect(recursionCallStack.parseInput('-2')).toEqual({
      error: 'n must be 0 or greater — factorial is undefined below 0.',
    });
  });

  it('rejects n over the cap', () => {
    expect(recursionCallStack.parseInput('11')).toEqual({
      error: 'Keep n at 10 or less so the stack stays readable.',
    });
  });
});
