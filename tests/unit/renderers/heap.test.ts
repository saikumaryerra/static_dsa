import { describe, expect, it } from 'vitest';
import {
  heapRenderer,
  type HeapState,
} from '../../../src/viz/renderers/HeapRenderer';
import type { Step } from '../../../src/viz/core/types';
import { nullLabelWidth } from '../../../src/viz/renderers/shared';
import { expectShell } from './_shared';

describe('heapRenderer.renderStatic', () => {
  it('marks index k in BOTH the tree node and the array cell, with a tether', () => {
    const step: Step<HeapState> = {
      state: { heap: [3, 7, 6, 4, 5], size: 5, comparing: [0, 1] },
      explanation: 'Comparing index 0 (3) with index 1 (7); 7 is larger.',
      highlights: [{ kind: 'compare', ids: ['i0', 'i1'] }],
    };
    const opts = { title: 'Max-heap', idBase: 'h' };
    const svg = heapRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    // Both views exist for every index.
    for (const id of ['n0', 'n1', 'n2', 'i0', 'i1', 'i2']) {
      expect(svg).toContain(`id="${id}"`);
    }
    // The shared-index highlight lands on both the node and the cell.
    expect((svg.match(/is-compare/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('viz-tie'); // compare tie-line (gate)
    expect(svg).toContain('viz-tether'); // tree↔array shared-index link
  });

  it('draws ↔ in both bands for a swap', () => {
    const step: Step<HeapState> = {
      state: { heap: [7, 3, 6, 4, 5], size: 5, swapping: [0, 1] },
      explanation: 'Swapping index 0 and index 1 to restore the max-heap.',
      highlights: [{ kind: 'swap', ids: ['i0', 'i1'] }],
    };
    const svg = heapRenderer.renderStatic(step, { title: 'Heap', idBase: 'h' });
    expect((svg.match(/is-swap/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((svg.match(/viz-swap-mark/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('draws its resting label INSIDE its own viewBox', () => {
    // `heap-operations` step 0. The 80-unit box clipped the centred ~110-unit
    // label to "mpty hea" on the still.
    const step: Step<HeapState> = {
      state: { heap: [], size: 0 },
      explanation: 'Ready. The heap is empty.',
    };
    const svg = heapRenderer.renderStatic(step, { title: 'Heap', idBase: 'h' });
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(box).not.toBeNull();
    expect(svg).toContain('empty heap');
    expect(svg).toContain('text-anchor="middle"');
    expect(Number(box![1])).toBeGreaterThanOrEqual(
      nullLabelWidth('empty heap'),
    );
  });
});
