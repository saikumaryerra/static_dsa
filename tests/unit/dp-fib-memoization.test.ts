import { describe, expect, it } from 'vitest';
import { dpFibMemoization } from '../../src/viz/algorithms/dp-fib-memoization';
import type { DpFibInput } from '../../src/viz/algorithms/dp-fib-tabulation';

describe('dpFibMemoization.run', () => {
  it('computes the correct final table for n = 6 (fib(6) = 8, dp[0] = 0)', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    const final = trace[trace.length - 1]!;
    expect(final.state.table).toEqual([0, 1, 1, 2, 3, 5, 8]);
    expect(final.state.table[0]).toBe(0);
    expect(final.explanation).toMatch(/dp\[6\] = 8/);
    expect(final.highlights).toEqual([{ kind: 'found', ids: ['i6'] }]);
  });

  it('emits at least one `visited` cache-hit highlight (the memoization payoff)', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    const cacheHits = trace.filter(
      (s) =>
        (s.highlights ?? []).some((h) => h.kind === 'visited') &&
        /reusing the cached value/.test(s.explanation),
    );
    // fib(6) top-down reuses fib(4), fib(3), fib(2), fib(1) from the cache.
    expect(cacheHits.length).toBeGreaterThanOrEqual(1);
    expect(
      trace[trace.length - 1]!.metrics?.['cacheHits'],
    ).toBeGreaterThanOrEqual(1);
  });

  it('shows dp[n] active first while its dependencies are still empty', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    // First non-intro step is the descent into dp[6]; deps still null (dimmed).
    const firstActive = trace.find((s) =>
      (s.highlights ?? []).some((h) => h.kind === 'active'),
    )!;
    expect(firstActive.highlights?.[0]).toEqual({
      kind: 'active',
      ids: ['i6'],
      meta: { label: 'dp[6]' },
    });
    expect(firstActive.state.table[5]).toBeNull();
    expect(firstActive.state.table[4]).toBeNull();
  });

  it('states the call and cache-hit counts in the final explanation (A11Y-2)', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    const last = trace[trace.length - 1]!;
    // The metrics pills and the aria-live explanation must agree — the cache-hit
    // count is the lesson's whole point, so it must reach screen readers too.
    expect(last.explanation).toContain(
      `${last.metrics!['calls']} calls, ${last.metrics!['cacheHits']} cache hits`,
    );
    // Singular forms for the smallest run (one call, no reuse yet).
    const small = dpFibMemoization.run({ n: 1 });
    expect(small[small.length - 1]!.explanation).toContain(
      '1 call, 0 cache hits.',
    );
  });

  it('writes both base cases via insert', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    const baseInserts = trace.filter((s) => /Base case/.test(s.explanation));
    expect(baseInserts.length).toBe(2); // dp[0] and dp[1]
    for (const s of baseInserts) {
      expect(s.highlights?.[0]?.kind).toBe('insert');
    }
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = dpFibMemoization.run({ n: 6 });
    trace[trace.length - 1]!.state.table[0] = 999;
    expect(trace[0]!.state.table.every((v) => v === null)).toBe(true);
  });
});

describe('dpFibMemoization.parseInput', () => {
  it('parses a bare number', () => {
    expect(dpFibMemoization.parseInput('6')).toEqual({
      n: 6,
    } satisfies DpFibInput);
  });

  it('rejects non-numeric input', () => {
    expect(dpFibMemoization.parseInput('abc')).toEqual({
      error: 'Type a whole number for n, e.g. 6',
    });
  });

  it('rejects negative n', () => {
    expect(dpFibMemoization.parseInput('-1')).toEqual({
      error: 'n must be 0 or greater — Fibonacci is undefined below 0.',
    });
  });

  it('rejects n over the cap', () => {
    expect(dpFibMemoization.parseInput('99')).toEqual({
      error: 'Keep n at 30 or less so the table stays readable.',
    });
  });
});
