/**
 * The one invariant that keeps `measure` honest: for every renderer and every
 * fixture, the box `measure(step)` reports MUST be the box `draw(step)` emits.
 *
 * `measure` exists as a second entry point purely for speed (247ms → 0.44ms on
 * the 901-step n=30 sort, Plan A §3), so the only way it can hurt is by
 * disagreeing with the drawing. This drives the same algorithm×renderer pairs
 * `marker-gate.test.ts` uses, so a new renderer is covered the moment it is
 * registered there — plus one extra pair, because marker-gate drives `bars`
 * with linear search while the lessons draw linear search with `array`: here
 * `bars` gets a sort (the run its lessons actually use, and the only one whose
 * values change mid-trace) and linear search is measured against `array` too.
 */
import { describe, expect, it } from 'vitest';
import type {
  Algorithm,
  RendererModule,
  Step,
} from '../../../src/viz/core/types';
import * as demos from '../../../src/viz/algorithms/demos';
import { binarySearch } from '../../../src/viz/algorithms/binary-search';
import { linearSearch } from '../../../src/viz/algorithms/linear-search';
import { bubbleSort } from '../../../src/viz/algorithms/bubble-sort';
import {
  arrayRenderer,
  barsRenderer,
} from '../../../src/viz/renderers/ArrayRenderer';
import { stackRenderer } from '../../../src/viz/renderers/StackRenderer';
import { callStackRenderer } from '../../../src/viz/renderers/CallStackRenderer';
import { queueRenderer } from '../../../src/viz/renderers/QueueRenderer';
import { linkedListRenderer } from '../../../src/viz/renderers/LinkedListRenderer';
import { chartRenderer } from '../../../src/viz/renderers/ChartRenderer';
import { treeRenderer } from '../../../src/viz/renderers/TreeRenderer';
import { heapRenderer } from '../../../src/viz/renderers/HeapRenderer';
import { graphRenderer } from '../../../src/viz/renderers/GraphRenderer';
import { hashTableRenderer } from '../../../src/viz/renderers/HashTableRenderer';
import { tableRenderer } from '../../../src/viz/renderers/TableRenderer';

type Pair = {
  name: string;
  algo: Algorithm<unknown, unknown>;
  renderer: RendererModule<unknown>;
  input?: string;
};

const A = <T>(x: T): Algorithm<unknown, unknown> =>
  x as unknown as Algorithm<unknown, unknown>;

const pairs: Pair[] = [
  {
    name: 'array',
    algo: A(binarySearch),
    renderer: arrayRenderer,
    input: '[1,3,5,7,9,11] target=7',
  },
  {
    name: 'array/linear',
    algo: A(linearSearch),
    renderer: arrayRenderer,
    input: '[8,3,5,9,1,7] target=9',
  },
  { name: 'bars', algo: A(bubbleSort), renderer: barsRenderer },
  { name: 'stack', algo: A(demos.demoStack), renderer: stackRenderer },
  {
    name: 'callStack',
    algo: A(demos.demoCallStack),
    renderer: callStackRenderer,
  },
  { name: 'queue', algo: A(demos.demoQueue), renderer: queueRenderer },
  {
    name: 'linkedList',
    algo: A(demos.demoLinkedList),
    renderer: linkedListRenderer,
  },
  { name: 'chart', algo: A(demos.demoChart), renderer: chartRenderer },
  { name: 'tree', algo: A(demos.demoTree), renderer: treeRenderer },
  { name: 'heap', algo: A(demos.demoHeap), renderer: heapRenderer },
  { name: 'graph', algo: A(demos.demoGraph), renderer: graphRenderer },
  {
    name: 'hashTable',
    algo: A(demos.demoHashTable),
    renderer: hashTableRenderer,
  },
  { name: 'table', algo: A(demos.demoTable), renderer: tableRenderer },
];

describe('RendererModule.measure agrees with the drawing', () => {
  for (const { name, algo, renderer, input } of pairs) {
    it(`${name}: measure(step) is the viewBox draw(step) emits, every step`, () => {
      const parsed = input ? algo.parseInput(input) : algo.defaultInput();
      expect(parsed).not.toHaveProperty('error');
      const trace = algo.run(parsed as never) as Step<unknown>[];
      expect(trace.length).toBeGreaterThan(0);
      for (const step of trace) {
        const svg = renderer.renderStatic(step, { title: '', idBase: 'm' });
        const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
        expect(m, `no parseable viewBox for ${name}`).not.toBeNull();
        expect(renderer.measure(step)).toEqual({
          w: Number(m![1]),
          h: Number(m![2]),
        });
      }
    });
  }
});
