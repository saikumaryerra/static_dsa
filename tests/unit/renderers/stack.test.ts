import { describe, expect, it } from 'vitest';
import {
  stackRenderer,
  type StackState,
} from '../../../src/viz/renderers/StackRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('stackRenderer.renderStatic', () => {
  it('draws slots bottom-up with a top pointer caret and a push +', () => {
    const step: Step<StackState> = {
      state: { items: [12, 34, 56] },
      explanation: 'Pushing 56; top is now 56.',
      highlights: [
        { kind: 'insert', ids: ['s2'] },
        { kind: 'pointer', ids: ['s2'], meta: { label: 'top' } },
      ],
    };
    const opts = { title: 'Stack: push and pop', idBase: 's' };
    const svg = stackRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['s0', 's1', 's2']) expect(svg).toContain(`id="${id}"`);
    // insert precedence wins the fill; its + marker must be present (gate).
    expect(svg).toContain('is-insert');
    expect(svg).toContain('viz-insert-mark');
  });

  it('draws a named top caret for a pointer highlight', () => {
    const step: Step<StackState> = {
      state: { items: [12, 34] },
      explanation: 'Stack of 2, top is 34.',
      highlights: [{ kind: 'pointer', ids: ['s1'], meta: { label: 'top' } }],
    };
    const svg = stackRenderer.renderStatic(step, {
      title: 'Stack',
      idBase: 's',
    });
    expect(svg).toContain('is-pointer');
    expect(svg).toContain('viz-caret');
    expect(svg).toContain('>top<');
  });
});
