/**
 * Guards the dev gallery (/dev/renderers): every demo fixture must render through
 * its paired renderer's `renderStatic` without error, with a valid shell. This is
 * the automated stand-in for the manual gallery scan — if a fixture's TState ever
 * drifts from its renderer, this fails.
 */
import { describe, expect, it } from 'vitest';
import type { Algorithm, RendererModule } from '../../../src/viz/core/types';
import * as demos from '../../../src/viz/algorithms/demos';
import { binarySearch } from '../../../src/viz/algorithms/binary-search';
import { linearSearch } from '../../../src/viz/algorithms/linear-search';
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

const pairs: Pair[] = [
  {
    name: 'array',
    algo: binarySearch as Algorithm<unknown, unknown>,
    renderer: arrayRenderer,
    input: '[1,3,5,7,9,11] target=7',
  },
  {
    name: 'bars',
    algo: linearSearch as Algorithm<unknown, unknown>,
    renderer: barsRenderer,
    input: '[8,3,5,9,1,7] target=9',
  },
  {
    name: 'stack',
    algo: demos.demoStack as Algorithm<unknown, unknown>,
    renderer: stackRenderer,
  },
  {
    name: 'callStack',
    algo: demos.demoCallStack as Algorithm<unknown, unknown>,
    renderer: callStackRenderer,
  },
  {
    name: 'queue',
    algo: demos.demoQueue as Algorithm<unknown, unknown>,
    renderer: queueRenderer,
  },
  {
    name: 'linkedList',
    algo: demos.demoLinkedList as Algorithm<unknown, unknown>,
    renderer: linkedListRenderer,
  },
  {
    name: 'chart',
    algo: demos.demoChart as Algorithm<unknown, unknown>,
    renderer: chartRenderer,
  },
  {
    name: 'tree',
    algo: demos.demoTree as Algorithm<unknown, unknown>,
    renderer: treeRenderer,
  },
  {
    name: 'heap',
    algo: demos.demoHeap as Algorithm<unknown, unknown>,
    renderer: heapRenderer,
  },
  {
    name: 'graph',
    algo: demos.demoGraph as Algorithm<unknown, unknown>,
    renderer: graphRenderer,
  },
  {
    name: 'hashTable',
    algo: demos.demoHashTable as Algorithm<unknown, unknown>,
    renderer: hashTableRenderer,
  },
  {
    name: 'table',
    algo: demos.demoTable as Algorithm<unknown, unknown>,
    renderer: tableRenderer,
  },
];

describe('dev gallery fixtures render through their renderer', () => {
  for (const { name, algo, renderer, input } of pairs) {
    it(`${name}: every step renders a valid shell with a mirrored <desc>`, () => {
      const parsed = input ? algo.parseInput(input) : algo.defaultInput();
      expect(parsed).not.toHaveProperty('error');
      const trace = algo.run(parsed as never);
      expect(trace.length).toBeGreaterThan(0);
      for (const step of trace) {
        const svg = renderer.renderStatic(step, {
          title: algo.label,
          idBase: name,
        });
        expect(svg).toContain('role="img"');
        expect(svg).toMatch(/viewBox="0 0 \d/);
        expect(svg).toContain(`<title id="${name}-t">${algo.label}</title>`);
        expect(svg).toContain(`<desc id="${name}-d">`);
      }
    });
  }
});
