import { describe, expect, it } from 'vitest';
import {
  hashTableRenderer,
  type HashTableState,
} from '../../../src/viz/renderers/HashTableRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('hashTableRenderer.renderStatic', () => {
  it('draws every bucket, a collision chain, and a probed-bucket caret', () => {
    const step: Step<HashTableState> = {
      state: {
        buckets: [[], [{ key: 5 }, { key: 9 }], [{ key: 6 }], []],
        capacity: 4,
      },
      explanation: 'Hash 9 % 4 = 1, so probe bucket 1 (a collision chain).',
      highlights: [{ kind: 'active', ids: ['s1'], meta: { label: 'h' } }],
    };
    const opts = { title: 'Hash table', idBase: 'ht' };
    const svg = hashTableRenderer.renderStatic(step, opts);

    // Shell: role=img, numeric viewBox, <title> = label, <desc> = explanation.
    expectShell(svg, { ...opts, desc: step.explanation });

    // Every bucket slot is drawn with its stable id (array-of-slots).
    for (const id of ['s0', 's1', 's2', 's3']) {
      expect(svg).toContain(`id="${id}"`);
    }
    // The collision chain's entries carry their own composite ids.
    expect(svg).toContain('id="h1_0"');
    expect(svg).toContain('id="h1_1"');
    expect(svg).toContain('id="h2_0"');
    // A chain of length > 1 means arrows are present (LinkedList language).
    expect(svg).toContain('viz-arrow');
    expect(svg).toContain('⌀'); // null terminals

    // Active bucket: colour class AND its paired non-color marker (§3.2 gate).
    expect(svg).toContain('is-active');
    expect(svg).toContain('viz-caret');
    expect(svg).toContain('>h<'); // named probe caret label
  });

  it('draws a dashed tie-line for an in-chain compare and a + for an insert', () => {
    const compareStep: Step<HashTableState> = {
      state: {
        buckets: [[], [{ key: 5 }, { key: 9 }], [], []],
        capacity: 4,
      },
      explanation: "Walking bucket 1's chain: comparing keys 5 and 9.",
      highlights: [{ kind: 'compare', ids: ['h1_0', 'h1_1'] }],
    };
    const compareSvg = hashTableRenderer.renderStatic(compareStep, {
      title: 'Hash table',
      idBase: 'ht',
    });
    expect(compareSvg).toContain('is-compare');
    expect(compareSvg).toContain('viz-tie'); // dashed tie-line marker (gate)

    const insertStep: Step<HashTableState> = {
      state: {
        buckets: [[], [{ key: 5 }, { key: 9 }], [], [{ key: 7 }]],
        capacity: 4,
      },
      explanation: 'Inserting key 7 into empty bucket 3 — no collision.',
      highlights: [{ kind: 'insert', ids: ['h3_0'] }],
    };
    const insertSvg = hashTableRenderer.renderStatic(insertStep, {
      title: 'Hash table',
      idBase: 'ht',
    });
    expect(insertSvg).toContain('is-insert');
    expect(insertSvg).toContain('viz-insert-mark'); // + marker (gate)
  });

  it('draws a found ✓ when a key matches', () => {
    const step: Step<HashTableState> = {
      state: { buckets: [[], [{ key: 5 }, { key: 9 }], [], []], capacity: 4 },
      explanation: 'Key 9 matches the second entry in bucket 1. Found 9.',
      highlights: [{ kind: 'found', ids: ['h1_1'] }],
    };
    const svg = hashTableRenderer.renderStatic(step, {
      title: 'Hash table',
      idBase: 'ht',
    });
    expect(svg).toContain('is-found');
    expect(svg).toContain('✓'); // found glyph (gate)
  });
});
