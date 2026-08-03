import { describe, expect, it } from 'vitest';
import {
  bstOperations,
  type BstOperationsInput,
  type TreeNode,
} from '../../src/viz/algorithms/bst-operations';
import type { Highlight } from '../../src/viz/core/types';

function highlightsOfKind(
  trace: ReturnType<typeof bstOperations.run>,
  kind: Highlight['kind'],
): Highlight[] {
  return trace.flatMap((step) =>
    (step.highlights ?? []).filter((h) => h.kind === kind),
  );
}

/** Verifies the BST ordering invariant with value bounds. */
function isValidBST(nodes: TreeNode[], root: number | null): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const check = (id: number | null, lo: number, hi: number): boolean => {
    if (id === null) return true;
    const node = byId.get(id);
    if (!node) return false;
    if (node.value <= lo || node.value >= hi) return false;
    return (
      check(node.left, lo, node.value) && check(node.right, node.value, hi)
    );
  };
  return check(root, -Infinity, Infinity);
}

describe('bstOperations.run', () => {
  it('builds a valid BST from the insertion sequence', () => {
    const trace = bstOperations.run(bstOperations.defaultInput());
    const last = trace[trace.length - 1]!;
    expect(last.state.nodes).toHaveLength(6);
    expect(last.state.root).toBe(0);
    expect(isValidBST(last.state.nodes, last.state.root)).toBe(true);
    // 50 root; 30 and 70 its children; 40 is 30's right child (search target).
    const byId = new Map(last.state.nodes.map((n) => [n.id, n]));
    expect(byId.get(0)).toMatchObject({ value: 50, left: 1, right: 2 });
    expect(byId.get(1)).toMatchObject({ value: 30, left: 3, right: 4 });
    expect(byId.get(4)).toMatchObject({ value: 40, left: null, right: null });
  });

  it('inserts one node per value with an `insert` marker, root first', () => {
    const trace = bstOperations.run(bstOperations.defaultInput());
    expect(highlightsOfKind(trace, 'insert')).toHaveLength(6);
    expect(highlightsOfKind(trace, 'insert')[0]).toEqual({
      kind: 'insert',
      ids: ['n0'],
    });
  });

  it('search for a present value ends with a `found` path to that node', () => {
    const trace = bstOperations.run(bstOperations.defaultInput());
    const found = highlightsOfKind(trace, 'found');
    expect(found).toContainEqual({ kind: 'found', ids: ['n4'] }); // value 40
    expect(trace[trace.length - 1]!.explanation).toContain('Found 40');
    // The descent visited the root before reaching the target.
    expect(highlightsOfKind(trace, 'visited')).toContainEqual(
      expect.objectContaining({
        kind: 'visited',
        ids: expect.arrayContaining(['n0']),
      }),
    );
  });

  it('search for an absent value ends not-found with no `found` highlight', () => {
    const trace = bstOperations.run({
      values: [50, 30, 70, 20, 40, 60],
      searchTarget: 45,
    });
    expect(highlightsOfKind(trace, 'found')).toHaveLength(0);
    expect(trace[trace.length - 1]!.explanation).toContain('not in the tree');
  });

  it('states the comparison total in both final explanations (A11Y-2)', () => {
    const hit = bstOperations.run(bstOperations.defaultInput());
    const lastHit = hit[hit.length - 1]!;
    // "in total" because building the tree compares too — the pill counts both.
    expect(lastHit.explanation).toContain(
      `${lastHit.metrics!['comparisons']} comparisons in total`,
    );
    const miss = bstOperations.run({ values: [50], searchTarget: 45 });
    expect(miss[miss.length - 1]!.explanation).toContain(
      '1 comparison in total.',
    );
  });

  it('handles a single-node tree', () => {
    const trace = bstOperations.run({ values: [42], searchTarget: 42 });
    const last = trace[trace.length - 1]!;
    expect(last.state.nodes).toHaveLength(1);
    expect(last.state.root).toBe(0);
    expect(highlightsOfKind(trace, 'found')).toContainEqual({
      kind: 'found',
      ids: ['n0'],
    });
  });

  it('deep-copies snapshots: mutating a later step leaves earlier steps intact', () => {
    const trace = bstOperations.run(bstOperations.defaultInput());
    const rootValueBefore = trace[1]!.state.nodes[0]!.value;
    trace[trace.length - 1]!.state.nodes[0]!.value = 999;
    expect(trace[1]!.state.nodes[0]!.value).toBe(rootValueBefore);
  });
});

describe('bstOperations.parseInput', () => {
  it('parses an insertion sequence and a search target', () => {
    expect(bstOperations.parseInput('[50,30,70,20,40,60] target=40')).toEqual({
      values: [50, 30, 70, 20, 40, 60],
      searchTarget: 40,
    } satisfies BstOperationsInput);
  });

  it('defaults the search target to the last inserted value', () => {
    expect(bstOperations.parseInput('[50,30,70]')).toEqual({
      values: [50, 30, 70],
      searchTarget: 70,
    } satisfies BstOperationsInput);
  });

  it('rejects duplicate values', () => {
    expect(bstOperations.parseInput('[50,50]')).toEqual({
      error: 'Use distinct values — a BST assumes no duplicates.',
    });
  });

  it('rejects a string with no array', () => {
    expect(bstOperations.parseInput('nope')).toEqual({
      error: 'Type an insertion sequence, e.g. [50,30,70,20,40]',
    });
  });

  it('rejects an empty sequence', () => {
    expect(bstOperations.parseInput('[]')).toEqual({
      error: 'Add at least one value, e.g. [50,30,70,20,40]',
    });
  });

  it('rejects more than 30 values (the node cap)', () => {
    const raw = `[${Array.from({ length: 31 }, (_, i) => i).join(',')}]`;
    expect(bstOperations.parseInput(raw)).toEqual({
      error: 'Keep it to 30 values or fewer.',
    });
  });
});
