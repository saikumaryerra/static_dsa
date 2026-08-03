import { describe, expect, it } from 'vitest';
import { linearSearch } from '../../src/viz/algorithms/linear-search';
import { arrayRenderer } from '../../src/viz/renderers/ArrayRenderer';
import type { Highlight } from '../../src/viz/core/types';

/** Collects every highlight of a given kind across a whole trace. */
function highlightsOfKind(
  trace: ReturnType<typeof linearSearch.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

describe('linearSearch.run', () => {
  it('ends in a `found` highlight on the first matching index', () => {
    const trace = linearSearch.run({ array: [8, 3, 5, 9, 1], target: 5 });
    const last = trace[trace.length - 1]!;
    expect(last.state.foundIndex).toBe(2);
    expect(last.highlights).toContainEqual({ kind: 'found', ids: ['i2'] });
    expect(last.explanation).toMatch(/Found 5 at index 2/);
  });

  it('scans unsorted input (no sorted precondition, unlike binary search)', () => {
    const trace = linearSearch.run({ array: [9, 1, 5, 3], target: 3 });
    expect(trace[trace.length - 1]!.state.foundIndex).toBe(3);
  });

  it('ends "not in the array" with no found cue for an absent target', () => {
    const trace = linearSearch.run({ array: [8, 3, 5], target: 4 });
    const last = trace[trace.length - 1]!;
    expect(last.explanation).toMatch(/not in the array/);
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
    expect(last.highlights ?? []).toHaveLength(0);
  });

  it('states the comparison count in both final explanations (A11Y-2)', () => {
    const hit = linearSearch.run({ array: [8, 3, 5, 9, 1], target: 5 });
    const lastHit = hit[hit.length - 1]!;
    // The metrics pill and the aria-live explanation must agree.
    expect(lastHit.explanation).toContain(
      `after ${lastHit.metrics!['comparisons']} comparisons`,
    );
    // The not-found branch states it too, in the singular after one probe.
    const miss = linearSearch.run({ array: [8], target: 4 });
    expect(miss[miss.length - 1]!.explanation).toContain('after 1 comparison.');
  });

  it('marks the current probe active with a "curr" caret label', () => {
    const trace = linearSearch.run({ array: [8, 3], target: 3 });
    const probe = trace[1]!; // first probe (index 0, value 8, not a match)
    const active = (probe.highlights ?? []).find((h) => h.kind === 'active');
    expect(active?.meta).toEqual({ label: 'curr' });
  });

  it('deep-copies snapshots (mutating a later step leaves earlier steps intact)', () => {
    const trace = linearSearch.run({ array: [8, 3, 5], target: 5 });
    trace[trace.length - 1]!.state.array[0] = 999;
    expect(trace[0]!.state.array[0]).toBe(8);
  });
});

describe('linearSearch reused by ArrayRenderer.renderStatic (the seam)', () => {
  it('renders the found step through the array renderer with the shared id + ✓ marker', () => {
    const trace = linearSearch.run({ array: [8, 3, 5], target: 5 });
    const found = trace[trace.length - 1]!;
    const svg = arrayRenderer.renderStatic(found, {
      title: linearSearch.label,
      idBase: 'ls',
    });
    // Same cellId contract the algorithm targeted.
    expect(svg).toContain('id="i2"');
    expect(svg).toContain('is-found');
    // Non-color marker present whenever a highlight is (design §3.2 gate).
    expect(svg).toContain('viz-found-mark');
    // <desc> mirrors the step explanation; <title> is the algorithm label.
    expect(svg).toContain('Found 5 at index 2');
    expect(svg).toContain('Linear search through an array');
  });
});

describe('linearSearch.parseInput', () => {
  it('parses a valid string', () => {
    expect(linearSearch.parseInput('[4,1,7,2] target=7')).toEqual({
      array: [4, 1, 7, 2],
      target: 7,
    });
  });

  it('accepts an unsorted array (no sorted-precondition rejection)', () => {
    expect(linearSearch.parseInput('[9,1,5] target=5')).toEqual({
      array: [9, 1, 5],
      target: 5,
    });
  });

  it('rejects arrays longer than 30', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}] target=5`;
    expect(linearSearch.parseInput(raw)).toEqual({
      error: 'Keep the array to 30 numbers or fewer.',
    });
  });
});
