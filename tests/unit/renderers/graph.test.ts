import { describe, expect, it } from 'vitest';
import {
  graphRenderer,
  type GraphState,
} from '../../../src/viz/renderers/GraphRenderer';
import type { Step } from '../../../src/viz/core/types';
import { expectShell } from './_shared';

const nodes = [0, 1, 2, 3, 4, 5].map((id) => ({ id }));
const edges = [
  { from: 0, to: 1, directed: true, weight: 4 },
  { from: 0, to: 2, directed: true, weight: 2 },
  { from: 1, to: 3, directed: true },
  { from: 2, to: 3, directed: true },
];

describe('graphRenderer.renderStatic', () => {
  it('places nodes, styles visited/frontier/path, and draws weighted arrows', () => {
    const step: Step<GraphState> = {
      state: { nodes, edges },
      explanation:
        'At node 0 (visited). Neighbors 1 and 2 added to the frontier.',
      highlights: [
        { kind: 'visited', ids: ['n0'] },
        { kind: 'frontier', ids: ['n1', 'n2'] },
        { kind: 'active', ids: ['e0_1'] }, // traversed edge
      ],
    };
    const opts = { title: 'Graph traversal', idBase: 'g' };
    const svg = graphRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']) {
      expect(svg).toContain(`id="${id}"`);
    }
    // CVD-critical trio: visited (✓ badge), frontier (dashed ring), path edge.
    expect(svg).toContain('is-visited');
    expect(svg).toContain('viz-badge'); // ✓ badge (gate)
    expect(svg).toContain('is-frontier');
    expect(svg).toContain('stroke-dasharray'); // dashed frontier ring (shape cue)
    expect(svg).toContain('is-path'); // traversed edge
    // Directed + weighted affordances.
    expect(svg).toContain('viz-arrow');
    expect(svg).toContain('viz-weight');
  });

  it('honors an explicit per-node position', () => {
    const step: Step<GraphState> = {
      state: {
        nodes: [
          { id: 0, pos: { x: 40, y: 40 } },
          { id: 1, pos: { x: 120, y: 40 } },
        ],
        edges: [{ from: 0, to: 1 }],
      },
      explanation: 'Two fixed nodes.',
      highlights: [{ kind: 'active', ids: ['n0'] }],
    };
    const svg = graphRenderer.renderStatic(step, { title: 'G', idBase: 'g' });
    expect(svg).toContain('cx="40"');
    expect(svg).toContain('cx="120"');
  });
});
