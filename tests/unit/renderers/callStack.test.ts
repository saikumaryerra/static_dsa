import { describe, expect, it } from 'vitest';
import {
  callStackRenderer,
  type CallStackState,
} from '../../../src/viz/renderers/CallStackRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('callStackRenderer.renderStatic', () => {
  it('draws frame cards with labels, a current caret, and a call +', () => {
    const step: Step<CallStackState> = {
      state: {
        frames: [
          { label: 'fib(3)', args: 'n=3', returnValue: null },
          { label: 'fib(2)', args: 'n=2', returnValue: null },
        ],
      },
      explanation: 'Calling fib(2), args n=2. Stack depth 2.',
      highlights: [
        { kind: 'insert', ids: ['f1'] },
        { kind: 'pointer', ids: ['f1'], meta: { label: 'curr' } },
      ],
    };
    const opts = { title: 'Call stack: fib(3)', idBase: 'c' };
    const svg = callStackRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['f0', 'f1']) expect(svg).toContain(`id="${id}"`);
    expect(svg).toContain('fib(3)');
    expect(svg).toContain('fib(2)');
    expect(svg).toContain('is-insert');
    expect(svg).toContain('viz-insert-mark'); // + marker (gate)
  });

  it('draws a ✕ for a returning frame', () => {
    const step: Step<CallStackState> = {
      state: { frames: [{ label: 'fib(3)', args: 'n=3', returnValue: '2' }] },
      explanation: 'fib(2) returns 1; unwinding.',
      highlights: [{ kind: 'delete', ids: ['f0'] }],
    };
    const svg = callStackRenderer.renderStatic(step, {
      title: 'Call stack',
      idBase: 'c',
    });
    expect(svg).toContain('is-delete');
    expect(svg).toContain('viz-delete-mark');
  });
});
