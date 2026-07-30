/**
 * QA-authored independent gate (design §3.2): "no renderer may render a `--hl-*`
 * fill/stroke without its paired non-color marker." Rather than trust each
 * renderer's own `is-*`/class assertions, this drives every dev fixture (and the
 * two shipping search algorithms) through its renderer's `renderStatic` and, for
 * EVERY highlight kind that actually appears in a step, asserts the LITERAL
 * non-color marker (the ✓/↔/+/✕ glyph, named caret label, dashed tie-line, range
 * bar, or dashed frontier ring) is present in the emitted SVG. If a future change
 * drops a marker while keeping the colour class, this fails.
 */
import { describe, expect, it } from 'vitest';
import type {
  Algorithm,
  Highlight,
  RendererModule,
  Step,
} from '../../../src/viz/core/types';
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
    name: 'bars',
    algo: A(linearSearch),
    renderer: barsRenderer,
    input: '[8,3,5,9,1,7] target=9',
  },
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
];

/**
 * For a highlight `kind` appearing in `svg`, returns a description + a predicate
 * proving its REQUIRED non-color marker (design §1 table) is present. `active` is
 * covered by a caret (structural) OR the array mid-label OR the chart emphasis
 * dash+label — all non-color — so it accepts any of those.
 */
function markerPresent(
  kind: Highlight['kind'],
  svg: string,
  label?: string,
): boolean {
  switch (kind) {
    case 'found':
      return svg.includes('✓'); // ✓ glyph
    case 'visited':
      return svg.includes('✓'); // ✓ badge
    case 'swap':
      return svg.includes('↔'); // ↔ arrow
    case 'insert':
      return svg.includes('>+<'); // + caret text node
    case 'delete':
      return svg.includes('>✕<'); // ✕ glyph text node
    case 'compare':
      return svg.includes('viz-tie'); // dashed tie-line
    case 'range':
      return svg.includes('viz-range-bar'); // underbar bracket
    case 'frontier':
      return svg.includes('stroke-dasharray'); // dashed ring
    case 'pointer':
      // named caret + its label text (design §1: label caret/arrow).
      return (
        svg.includes('viz-caret') && (label ? svg.includes(`>${label}<`) : true)
      );
    case 'active':
      // structural non-color cue: a caret, the array mid caret, or chart emphasis.
      return (
        svg.includes('viz-caret') ||
        svg.includes('viz-mid-label') ||
        svg.includes('is-emph') ||
        svg.includes('is-path')
      );
    default:
      return false;
  }
}

const strLabel = (h: Highlight): string | undefined =>
  typeof h.meta?.['label'] === 'string'
    ? (h.meta['label'] as string)
    : undefined;

describe('design §3.2 gate: every highlighted kind ships its non-color marker', () => {
  for (const { name, algo, renderer, input } of pairs) {
    it(`${name}: each step's highlight kinds all have a paired marker`, () => {
      const parsed = input ? algo.parseInput(input) : algo.defaultInput();
      expect(parsed).not.toHaveProperty('error');
      const trace = algo.run(parsed as never);
      expect(trace.length).toBeGreaterThan(0);
      for (const step of trace as Step<unknown>[]) {
        const svg = renderer.renderStatic(step, {
          title: algo.label,
          idBase: name,
        });
        for (const h of step.highlights ?? []) {
          expect(
            markerPresent(h.kind, svg, strLabel(h)),
            `${name}: kind="${h.kind}" (label=${strLabel(h) ?? '—'}) rendered a colour class but NO paired non-color marker in step: "${step.explanation}"`,
          ).toBe(true);
        }
      }
    });
  }
});
