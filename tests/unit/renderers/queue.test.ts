import { describe, expect, it } from 'vitest';
import {
  queueRenderer,
  type QueueState,
} from '../../../src/viz/renderers/QueueRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('queueRenderer.renderStatic', () => {
  it('draws all capacity slots, dims empties, and marks front/rear', () => {
    const step: Step<QueueState> = {
      state: {
        slots: [null, 34, 56, 78, null, null],
        head: 1,
        tail: 3,
        size: 3,
        circular: true,
      },
      explanation:
        'Queue capacity 6, 3 items, front at index 1, rear at index 3.',
      highlights: [
        { kind: 'pointer', ids: ['s1'], meta: { label: 'front' } },
        { kind: 'pointer', ids: ['s3'], meta: { label: 'rear' } },
      ],
    };
    const opts = { title: 'Circular queue', idBase: 'q' };
    const svg = queueRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['s0', 's1', 's2', 's3', 's4', 's5']) {
      expect(svg).toContain(`id="${id}"`);
    }
    expect(svg).toContain('is-pointer');
    // Non-color cues: front/rear carets + dimmed empty slots.
    expect(svg).toContain('viz-caret');
    expect(svg).toContain('>front<');
    expect(svg).toContain('>rear<');
    expect(svg).toContain('is-eliminated'); // empty slots
    expect(svg).toContain('viz-null'); // · glyph
  });

  it('draws a wrap arc when the occupied run wraps past the end', () => {
    const step: Step<QueueState> = {
      state: {
        slots: [90, null, null, null, 34, 56],
        head: 4,
        tail: 0,
        size: 3,
        circular: true,
      },
      explanation: 'Enqueuing 90 at index 0 — the rear wraps around.',
      highlights: [{ kind: 'insert', ids: ['s0'] }],
    };
    const svg = queueRenderer.renderStatic(step, {
      title: 'Queue',
      idBase: 'q',
    });
    expect(svg).toContain('is-insert');
    expect(svg).toContain('viz-insert-mark');
    expect(svg).toContain('↩ wraps');
  });
});
