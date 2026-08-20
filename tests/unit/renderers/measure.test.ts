/**
 * The one invariant that keeps `measure` honest: for every instrument and every
 * step, the box `measure(step)` reports MUST be the box `draw(step)` emits.
 *
 * `measure` exists as a second entry point purely for speed (247ms → 0.44ms on
 * the 901-step n=30 sort, Plan A §3), so the only way it can hurt is by
 * disagreeing with the drawing. That makes this file the entire safety case for
 * the second entry point existing at all.
 *
 * It is therefore driven by the LESSON instruments — the same 21 triples
 * `scripts/audit-frames.mjs` measures, transcribed from
 * `src/content/lessons/*.mdx` — and NOT by the `demos.*` fixtures alone. An
 * earlier version drove `tree`, `heap`, `hashTable` and `array` with demo
 * fixtures that hold a SINGLE box for the whole trace, so replacing those three
 * renderers' `measure` with a step-ignoring constant still passed all 849
 * tests: the assertion was a tautology on exactly the renderers that grow most.
 * The `boxes.size > 1` check below is the guard on the guard — a fixture that
 * stops varying fails here instead of silently going slack again.
 *
 * It is also load-bearing, not belt-and-braces. Where a renderer builds its
 * viewBox BY CALLING its own `measure` (ArrayRenderer, through `viewBoxFor` —
 * the "one source, no drift" rule the contract asks for), a constant `measure`
 * makes the drawing constant too, and the equality assertion holds. Mutating
 * `ArrayRenderer.measure` to `() => ({ w: 384, h: HEIGHT })` is caught ONLY by
 * the size check; the tree and heap mutants, whose `draw` re-derives the box
 * from the same layout helper, are caught by the equality. Both halves are
 * needed, and neither alone covers all twelve renderers.
 */
import { describe, expect, it } from 'vitest';
import type {
  Algorithm,
  RendererModule,
  Step,
} from '../../../src/viz/core/types';
import {
  algorithms,
  renderers,
  type AlgorithmId,
  type RendererId,
} from '../../../src/viz/registry';

/**
 * Every `<Visualizer>` instrument this site ships, as (algorithm, renderer,
 * authored input) triples. **Keep in sync with `INSTRUMENTS` in
 * `scripts/audit-frames.mjs`** — the rows are byte-identical to that table on
 * purpose, so the runs this test pins are the runs the audit measures and the
 * runs readers actually see. All 12 registered renderer ids are covered.
 */
const LESSON_INSTRUMENTS: [AlgorithmId, RendererId, string][] = [
  // arrays.mdx
  ['array-operations', 'array', '[10,20,30,40,50] target=2'],
  // binary-search.mdx — note BOTH searches draw with the `array` renderer.
  ['binary-search', 'array', '[1,3,5,7,9,11] target=7'],
  ['linear-search', 'array', '[8,3,5,9,1,7] target=9'],
  // complexity-big-o.mdx
  ['growth-rates', 'chart', '16'],
  // linked-lists.mdx
  ['linked-list-operations', 'linkedList', '[12,34,56,78] target=1'],
  // stacks.mdx
  ['stack-operations', 'stack', '[12,34,56]'],
  // queues.mdx
  ['queue-operations', 'queue', '[10,20,30]'],
  // hash-tables.mdx
  ['hash-table-operations', 'hashTable', '[11,24,6,15,20] cap=5 target=6'],
  // trees-bst.mdx
  ['bst-operations', 'tree', '[50,30,70,20,40,60] target=40'],
  // heaps.mdx
  ['heap-operations', 'heap', '[5,9,3,12,8,15]'],
  // graphs.mdx
  ['graph-representations', 'graph', '0>1:4, 0>2:1, 2>1:2, 1>3:5, 2>3:8'],
  // graph-traversal.mdx
  ['bfs', 'graph', '0-1,0-2,1-3,2-3,3-4,4-5 target=0'],
  ['dfs', 'graph', '0-1,0-2,1-3,2-3,3-4,4-5 target=0'],
  // recursion.mdx
  ['recursion-callstack', 'callStack', '4'],
  // sorting-basics.mdx
  ['bubble-sort', 'bars', '[5,2,9,1,7,3]'],
  ['selection-sort', 'bars', '[5,2,9,1,7,3]'],
  ['insertion-sort', 'bars', '[5,2,9,1,7,3]'],
  // sorting-efficient.mdx
  ['merge-sort', 'bars', '[5,2,9,1,7,3]'],
  ['quick-sort', 'bars', '[5,2,9,1,7,3]'],
  // dynamic-programming.mdx
  ['dp-fib-tabulation', 'table', '6'],
  ['dp-fib-memoization', 'table', '6'],
];

/**
 * The instruments `npm run audit:frames` reports under "A. VARYING extent" —
 * the ones whose box actually changes mid-run, and therefore the only ones that
 * can catch a `measure` that ignores its step.
 *
 * Each is asserted to emit MORE THAN ONE distinct box below. Only varying rows
 * are pinned: a constant instrument that starts varying after a geometry change
 * only adds discriminating power, so failing the suite for it would be noise.
 */
const AUDIT_VARYING: ReadonlySet<AlgorithmId> = new Set<AlgorithmId>([
  'array-operations',
  'linked-list-operations',
  'stack-operations',
  'hash-table-operations',
  'bst-operations',
  'heap-operations',
  'recursion-callstack',
]);

/**
 * The dev-gallery fixtures (`/dev/renderers`, prod-gated but registered), each
 * against the renderer it exercises. Kept ALONGSIDE the lesson table, not
 * instead of it: they are a second, differently shaped input per renderer, and
 * a `measure`/`draw` disagreement on the gallery is still a real defect. They
 * simply cannot be the guard, because four of them hold one box for the whole
 * trace. There is no `demo-array`, so `array`/`bars` have lesson coverage only.
 */
const DEMO_FIXTURES: [AlgorithmId, RendererId][] = [
  ['demo-stack', 'stack'],
  ['demo-callstack', 'callStack'],
  ['demo-queue', 'queue'],
  ['demo-linkedlist', 'linkedList'],
  ['demo-chart', 'chart'],
  ['demo-tree', 'tree'],
  ['demo-heap', 'heap'],
  ['demo-graph', 'graph'],
  ['demo-hashtable', 'hashTable'],
  ['demo-table', 'table'],
];

/** Pulls `0 0 W H` out of an emitted `<svg>` string. */
const viewBoxOf = (svg: string, label: string): { w: number; h: number } => {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  expect(m, `no parseable viewBox for ${label}`).not.toBeNull();
  return { w: Number(m![1]), h: Number(m![2]) };
};

/**
 * Runs one instrument and asserts the invariant on every step.
 *
 * No `extent` is passed: `measure` reports the NATURAL box, which is what
 * `renderStatic` draws when the caller has not frozen one (the anchored-offset
 * half of the contract is `tests/unit/renderers/anchor.test.ts`'s job).
 *
 * @returns The set of distinct `WxH` boxes the drawing emitted across the run,
 * so the caller can prove the fixture varies.
 */
async function checkInstrument(
  algoId: AlgorithmId,
  rendererId: RendererId,
  input?: string,
): Promise<Set<string>> {
  const label = `${algoId} @ ${rendererId}`;
  // The registry's values are concrete per-id thunks, so indexing with a union
  // id yields a union of `Algorithm<TIn, TState>` / `RendererModule<TState>`
  // whose methods have no common parameter type. Widening both to `unknown`
  // here is the same erasure `anchor.test.ts` does with its `A()` helper, and
  // it is safe because the two only ever meet through this one `Step`.
  const algo = (await algorithms[algoId]()) as Algorithm<unknown, unknown>;
  const renderer = (await renderers[rendererId]()) as RendererModule<unknown>;

  const parsed = input ? algo.parseInput(input) : algo.defaultInput();
  // `parseInput` never throws — it returns `{ error }` — so a typo in the table
  // would otherwise run an empty trace and pass vacuously.
  expect(parsed, `${label}: authored input rejected`).not.toHaveProperty(
    'error',
  );

  const trace: Step<unknown>[] = algo.run(parsed);
  expect(trace.length, `${label}: empty trace`).toBeGreaterThan(0);

  const boxes = new Set<string>();
  for (const step of trace) {
    const box = viewBoxOf(
      renderer.renderStatic(step, { title: '', idBase: 'm' }),
      label,
    );
    boxes.add(`${box.w}x${box.h}`);
    expect(renderer.measure(step), label).toEqual(box);
  }
  return boxes;
}

describe('measure agrees with the drawing, on the runs the lessons ship', () => {
  for (const [algoId, rendererId, input] of LESSON_INSTRUMENTS) {
    const varies = AUDIT_VARYING.has(algoId);
    it(`${algoId} @ ${rendererId}: measure(step) is the viewBox draw(step) emits${
      varies ? ', across a box that grows' : ''
    }`, async () => {
      const boxes = await checkInstrument(algoId, rendererId, input);
      if (varies) {
        // The audit reports this instrument as varying. Prove the fixture still
        // exercises that, or the assertion above pins nothing on this renderer.
        expect(
          boxes.size,
          `${algoId}'s authored run no longer changes box — re-run \`npm run audit:frames\` and update AUDIT_VARYING`,
        ).toBeGreaterThan(1);
      }
    });
  }

  it('AUDIT_VARYING names only instruments the table actually drives', () => {
    // A typo here would silently drop an instrument's `boxes.size > 1` check,
    // which is precisely the slackening this file exists to prevent.
    const listed = new Set(LESSON_INSTRUMENTS.map(([algoId]) => algoId));
    expect([...AUDIT_VARYING].filter((id) => !listed.has(id))).toEqual([]);
  });
});

describe('measure agrees with the drawing, on the /dev/renderers fixtures', () => {
  for (const [algoId, rendererId] of DEMO_FIXTURES) {
    it(`${algoId} @ ${rendererId}: measure(step) is the viewBox draw(step) emits`, async () => {
      await checkInstrument(algoId, rendererId);
    });
  }
});
