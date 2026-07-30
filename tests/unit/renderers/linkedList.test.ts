import { describe, expect, it } from 'vitest';
import {
  linkedListRenderer,
  type LinkedListState,
} from '../../../src/viz/renderers/LinkedListRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

describe('linkedListRenderer.renderStatic', () => {
  it('draws nodes, a null terminal, a named pointer, and an insert +', () => {
    const step: Step<LinkedListState> = {
      state: {
        nodes: [{ value: 12 }, { value: 34 }, { value: 56 }],
        kind: 'singly',
        pointers: [{ name: 'head', index: 0 }],
      },
      explanation: 'List: 12 → 34 → 56 → null. Inserting 40 after node 1.',
      highlights: [
        { kind: 'pointer', ids: ['n1'], meta: { label: 'p' } },
        { kind: 'insert', ids: ['n2'] },
      ],
    };
    const opts = { title: 'Linked list', idBase: 'l' };
    const svg = linkedListRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['n0', 'n1', 'n2']) expect(svg).toContain(`id="${id}"`);
    expect(svg).toContain('is-pointer');
    expect(svg).toContain('is-insert');
    expect(svg).toContain('viz-caret'); // named pointer caret
    expect(svg).toContain('viz-insert-mark'); // + marker (gate)
    expect(svg).toContain('⌀'); // null terminal
    expect(svg).toContain('viz-arrow'); // next arrowhead
  });

  it('draws a dashed tie-line for a compare highlight', () => {
    const step: Step<LinkedListState> = {
      state: {
        nodes: [{ value: 12 }, { value: 34 }],
        kind: 'doubly',
      },
      explanation: 'Comparing node 0 and node 1.',
      highlights: [{ kind: 'compare', ids: ['n0', 'n1'] }],
    };
    const svg = linkedListRenderer.renderStatic(step, {
      title: 'Linked list',
      idBase: 'l',
    });
    expect(svg).toContain('is-compare');
    expect(svg).toContain('viz-tie');
  });
});
