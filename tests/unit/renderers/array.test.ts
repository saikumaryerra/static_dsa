import { describe, expect, it } from 'vitest';
import {
  arrayRenderer,
  barsRenderer,
  type ArrayWindowState,
} from '../../../src/viz/renderers/ArrayRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

const OPTS = { title: 'Binary search on a sorted array', idBase: 'a' };

describe('arrayRenderer.renderStatic', () => {
  it('draws cells with stable ids, the range window, and the mid caret', () => {
    const step: Step<ArrayWindowState> = {
      state: { array: [1, 3, 5, 7] },
      explanation: 'Search window is indices 0–3; middle index 1 holds 3.',
      highlights: [
        // The end labels are the ALGORITHM's, not the renderer's: an unlabelled
        // range draws its underbar and names nothing (marker-vocabulary.test.ts).
        {
          kind: 'range',
          ids: ['i0', 'i1', 'i2', 'i3'],
          meta: { startLabel: 'lo', endLabel: 'hi' },
        },
        { kind: 'active', ids: ['i1'] },
      ],
    };
    const svg = arrayRenderer.renderStatic(step, OPTS);
    expectShell(svg, { ...OPTS, desc: step.explanation });
    for (const id of ['i0', 'i1', 'i2', 'i3']) {
      expect(svg).toContain(`id="${id}"`);
    }
    expect(svg).toContain('is-active');
    expect(svg).toContain('is-range');
    // Non-color markers present whenever a highlight is (design §3.2 gate).
    expect(svg).toContain('viz-range-bar');
    expect(svg).toContain('viz-mid-label');
    expect(svg).toContain('>lo<');
    expect(svg).toContain('>hi<');
  });

  it('draws the found cell with a ✓ glyph', () => {
    const step: Step<ArrayWindowState> = {
      state: { array: [1, 3, 5, 7] },
      explanation: 'Found 5 at index 2.',
      highlights: [{ kind: 'found', ids: ['i2'] }],
    };
    const svg = arrayRenderer.renderStatic(step, OPTS);
    expect(svg).toContain('is-found');
    expect(svg).toContain('viz-found-mark');
  });
});

describe('barsRenderer.renderStatic', () => {
  it('shares the array id scheme and draws value-scaled rects', () => {
    const step: Step<ArrayWindowState> = {
      state: { array: [8, 3, 5] },
      explanation: 'Index 0 holds 8, which is not 5.',
      highlights: [{ kind: 'active', ids: ['i0'], meta: { label: 'curr' } }],
    };
    const svg = barsRenderer.renderStatic(step, {
      title: 'Linear search through an array',
      idBase: 'b',
    });
    expectShell(svg, {
      title: 'Linear search through an array',
      idBase: 'b',
      desc: step.explanation,
    });
    expect(svg).toContain('id="i0"');
    expect(svg).toContain('is-active');
    expect(svg).toContain('>curr<'); // named caret from meta.label
  });
});
