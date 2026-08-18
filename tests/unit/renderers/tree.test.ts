import { describe, expect, it } from 'vitest';
import {
  treeRenderer,
  type TreeState,
} from '../../../src/viz/renderers/TreeRenderer';
import type { Step } from '../../../src/viz/core/types';
import { nullLabelWidth } from '../../../src/viz/renderers/shared';
import { expectShell } from './_shared';

const bst = [
  { id: 0, value: 50, left: 1, right: 2 },
  { id: 1, value: 30, left: 3, right: 4 },
  { id: 2, value: 70, left: 5, right: null },
  { id: 3, value: 20, left: null, right: null },
  { id: 4, value: 40, left: null, right: null },
  { id: 5, value: 60, left: null, right: null },
];

describe('treeRenderer.renderStatic', () => {
  it('lays out every node, styles the found node + path edge, and badges visited', () => {
    const step: Step<TreeState> = {
      state: { nodes: bst, root: 0 },
      explanation: 'Node 40 equals the target. Found 40.',
      highlights: [
        { kind: 'found', ids: ['n4'] },
        { kind: 'visited', ids: ['n0', 'n1'] },
        { kind: 'active', ids: ['e1_4'] }, // path edge
      ],
    };
    const opts = { title: 'Binary search tree', idBase: 't' };
    const svg = treeRenderer.renderStatic(step, opts);
    expectShell(svg, { ...opts, desc: step.explanation });
    for (const id of ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']) {
      expect(svg).toContain(`id="${id}"`);
    }
    expect(svg).toContain('is-found');
    expect(svg).toContain('viz-found-mark'); // ✓ (gate)
    expect(svg).toContain('is-visited');
    expect(svg).toContain('viz-badge'); // ✓ badge (gate)
    expect(svg).toContain('is-path'); // search-path edge styling
  });

  it('draws a compare tie-line between two nodes', () => {
    const step: Step<TreeState> = {
      state: { nodes: bst, root: 0 },
      explanation: 'Visiting node 50; comparing with node 30.',
      highlights: [{ kind: 'compare', ids: ['n0', 'n1'] }],
    };
    const svg = treeRenderer.renderStatic(step, { title: 'BST', idBase: 't' });
    expect(svg).toContain('is-compare');
    expect(svg).toContain('viz-tie');
  });

  it('draws its resting label INSIDE its own viewBox', () => {
    // The empty tree is `bst-operations` step 0, so this frame is what every
    // JS-off reader and every printed page gets. Its natural box used to be
    // 40 units wide with the label drawn `start`-anchored at x = 50 — entirely
    // outside it, so the still rendered blank.
    const step: Step<TreeState> = {
      state: { nodes: [], root: null },
      explanation: 'Ready. The tree is empty.',
    };
    const svg = treeRenderer.renderStatic(step, { title: 'BST', idBase: 't' });
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(box).not.toBeNull();
    expect(svg).toContain('empty tree');
    // Centred, so it fits iff the box is at least as wide as the label.
    expect(svg).toContain('text-anchor="middle"');
    expect(Number(box![1])).toBeGreaterThanOrEqual(
      nullLabelWidth('empty tree'),
    );
  });
});
