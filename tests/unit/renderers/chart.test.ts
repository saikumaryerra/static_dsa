import { describe, expect, it } from 'vitest';
import {
  chartRenderer,
  type ChartState,
} from '../../../src/viz/renderers/ChartRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('chartRenderer.renderStatic', () => {
  it('draws five curves with distinct dasharrays + direct end labels (CVD)', () => {
    const step: Step<ChartState> = {
      state: { n: 20, maxN: 30, functions: ['1', 'logn', 'n', 'nlogn', 'n2'] },
      explanation:
        'At n=20: O(n²) reaches 400 operations, O(n log n) 86, O(n) 20, O(log n) 4, O(1) 1.',
      highlights: [{ kind: 'active', ids: ['c-n2'] }],
    };
    const opts = { title: 'Big-O growth rates', idBase: 'g' };
    const svg = chartRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['c-1', 'c-logn', 'c-n', 'c-nlogn', 'c-n2']) {
      expect(svg).toContain(`id="${id}"`);
    }
    // The emphasized curve and its non-color pairing (dash + label).
    expect(svg).toContain('is-emph');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('viz-curve-label');
    expect(svg).toContain('O(n²)');
    expect(svg).toContain('O(log n)');
    // Axes present.
    expect(svg).toContain('viz-axis');
  });
});
