import { describe, expect, it } from 'vitest';
import {
  tableRenderer,
  type TableState,
} from '../../../src/viz/renderers/TableRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

const OPTS = { title: 'Fibonacci by tabulation (bottom-up)', idBase: 't' };

describe('tableRenderer.renderStatic', () => {
  it('draws cells with stable ids, an active dp[i], and tie-lines to compare deps', () => {
    const step: Step<TableState> = {
      state: { table: [0, 1, 1, null, null], n: 4 },
      explanation:
        'dp[3] = dp[2] + dp[1] = 1 + 1 = 2. Both neighbours are already in the table.',
      highlights: [
        { kind: 'active', ids: ['i3'], meta: { label: 'dp[3]' } },
        { kind: 'compare', ids: ['i2'] },
        { kind: 'compare', ids: ['i1'] },
      ],
    };
    const svg = tableRenderer.renderStatic(step, OPTS);
    expectShell(svg, { ...OPTS, desc: step.explanation });
    for (const id of ['i0', 'i1', 'i2', 'i3', 'i4']) {
      expect(svg).toContain(`id="${id}"`);
    }
    expect(svg).toContain('is-active');
    expect(svg).toContain('is-compare');
    // The named caret from meta.label (non-color active cue).
    expect(svg).toContain('>dp[3]<');
    // A compare highlight MUST ship its dependency tie-line (design §3.2 gate).
    expect(svg).toContain('viz-tie');
    // The un-reached cell (i4) is dimmed and shows the centered `·` placeholder.
    expect(svg).toContain('is-eliminated');
    expect(svg).toContain('viz-null');
    expect(svg).toContain('·');
  });

  it('draws a cache hit as a ✓ badge with a tie-line to the active cell', () => {
    const step: Step<TableState> = {
      state: { table: [0, 1, 1, 2, null], n: 4 },
      explanation:
        'dp[2] is already computed (1) — reusing it, not recomputing.',
      highlights: [
        { kind: 'active', ids: ['i4'], meta: { label: 'dp[4]' } },
        { kind: 'visited', ids: ['i2'] },
      ],
    };
    const svg = tableRenderer.renderStatic(step, OPTS);
    expect(svg).toContain('is-visited');
    expect(svg).toContain('viz-badge'); // ✓ badge
    expect(svg).toContain('✓');
    expect(svg).toContain('viz-tie'); // dependency edge to the active cell
  });

  it('draws the final answer cell with a ✓ glyph', () => {
    const step: Step<TableState> = {
      state: { table: [0, 1, 1, 2, 3, 5, 8], n: 6 },
      explanation: 'Done: dp[6] = 8 is the answer.',
      highlights: [{ kind: 'found', ids: ['i6'] }],
    };
    const svg = tableRenderer.renderStatic(step, OPTS);
    expect(svg).toContain('is-found');
    expect(svg).toContain('viz-found-mark');
    expect(svg).toContain('✓');
  });

  it('has a fluid viewBox computed from the table length', () => {
    const step: Step<TableState> = {
      state: { table: [0, 1], n: 1 },
      explanation: 'Base cases: dp[0] = 0 and dp[1] = 1.',
      highlights: [
        { kind: 'insert', ids: ['i0'] },
        { kind: 'insert', ids: ['i1'] },
      ],
    };
    const svg = tableRenderer.renderStatic(step, OPTS);
    // 2 cells → width = 10*2 + 2*(54+8) - 8 = 136; height = 106 + 12 = 118.
    expect(svg).toContain('viewBox="0 0 136 118"');
    expect(svg).toContain('>+<'); // insert `+` caret
  });
});
