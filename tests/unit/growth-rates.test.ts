import { describe, expect, it } from 'vitest';
import {
  growthRates,
  type GrowthRatesInput,
} from '../../src/viz/algorithms/growth-rates';

describe('growthRates.run', () => {
  it('emits one step per value of n from 1 to maxN', () => {
    const trace = growthRates.run({ maxN: 16 });
    expect(trace).toHaveLength(16);
    expect(trace[0]!.state.n).toBe(1);
    expect(trace[trace.length - 1]!.state.n).toBe(16);
  });

  it('draws all five growth functions on every step', () => {
    const trace = growthRates.run(growthRates.defaultInput());
    for (const step of trace) {
      expect(step.state.functions).toEqual(['1', 'logn', 'n', 'nlogn', 'n2']);
      expect(step.state.maxN).toBe(16);
    }
  });

  it('emphasizes the O(n²) curve (c-n2) on every step', () => {
    const trace = growthRates.run({ maxN: 8 });
    for (const step of trace) {
      expect(step.highlights).toContainEqual({
        kind: 'active',
        ids: ['c-n2'],
      });
    }
  });

  it('reports n and n² as metrics; the quadratic count grows fastest', () => {
    const trace = growthRates.run({ maxN: 10 });
    const last = trace[trace.length - 1]!;
    expect(last.metrics?.['n']).toBe(10);
    expect(last.metrics?.['n²']).toBe(100);
  });

  it('reports n as a strictly increasing metric', () => {
    const trace = growthRates.run({ maxN: 12 });
    let previous = 0;
    for (const step of trace) {
      const n = step.metrics?.['n'] ?? 0;
      expect(n).toBeGreaterThan(previous);
      previous = n;
    }
  });

  it('clamps a maxN above the cap so the trace never explodes', () => {
    const trace = growthRates.run({ maxN: 1000 });
    expect(trace).toHaveLength(40); // MAX_MAX_N
    expect(trace[trace.length - 1]!.state.maxN).toBe(40);
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = growthRates.run({ maxN: 5 });
    const firstNBefore = trace[0]!.state.n;
    trace[trace.length - 1]!.state.functions.push('n2');
    trace[trace.length - 1]!.state.n = 999;
    expect(trace[0]!.state.n).toBe(firstNBefore);
    expect(trace[0]!.state.functions).toHaveLength(5);
  });
});

describe('growthRates.parseInput', () => {
  it('parses a bare number into a maxN', () => {
    expect(growthRates.parseInput('24')).toEqual({
      maxN: 24,
    } satisfies GrowthRatesInput);
  });

  it("ignores the generic form's trailing target= field", () => {
    expect(growthRates.parseInput('20 target=')).toEqual({ maxN: 20 });
  });

  it('rejects input with no number, with a friendly message', () => {
    const result = growthRates.parseInput('abc');
    expect(result).toHaveProperty('error');
  });

  it('rejects a maxN below the minimum', () => {
    expect(growthRates.parseInput('1')).toHaveProperty('error');
  });

  it('rejects a maxN above the cap', () => {
    expect(growthRates.parseInput('100')).toHaveProperty('error');
  });
});
