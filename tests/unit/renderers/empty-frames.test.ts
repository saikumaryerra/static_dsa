/**
 * The resting-frame rule (Plan A §4), asserted as a RULE over every registered
 * renderer: *a renderer that draws a resting label must size its viewBox to
 * contain it.*
 *
 * This file replaces the two per-renderer assertions that shipped with the
 * original fix (`tree.test.ts`, `heap.test.ts`). Those pinned the two renderers
 * a measurement had already found, so they could not fail for a third — and a
 * third was violating the rule the whole time: `LinkedListRenderer` drew
 * "empty list ⌀" `start`-anchored at x=50, spanning 50→182 in a 108-unit box.
 *
 * It survived because the instrument that scoped the fix, `npm run audit:frames`,
 * inspects `trace[0]` of each LESSON instrument, and `linked-list-operations`
 * step 0 draws four nodes and no resting label at all. A renderer whose lesson
 * never rests empty was never asked the question. So the table below is keyed on
 * the REGISTRY rather than on the lessons, and the coverage guard at the bottom
 * fails if a renderer id is ever added without an empty state beside it.
 *
 * The span model is `textSpans` from `renderers/shared.ts` — the same function
 * the audit script judges section B with, imported rather than re-implemented,
 * so "fits" cannot come to mean two different things. It is HORIZONTAL only:
 * every clipped resting frame measured on this project overflowed sideways, and
 * a vertical model would need per-face baseline metrics that no string carries.
 */
import { describe, expect, it } from 'vitest';
import type { RendererModule, Step } from '../../../src/viz/core/types';
import { renderers, type RendererId } from '../../../src/viz/registry';
import { nullLabelWidth, textSpans } from '../../../src/viz/renderers/shared';
import type { ArrayWindowState } from '../../../src/viz/renderers/ArrayRenderer';
import type { CallStackState } from '../../../src/viz/renderers/CallStackRenderer';
import type { ChartState } from '../../../src/viz/renderers/ChartRenderer';
import type { GraphState } from '../../../src/viz/renderers/GraphRenderer';
import type { HashTableState } from '../../../src/viz/renderers/HashTableRenderer';
import type { HeapState } from '../../../src/viz/renderers/HeapRenderer';
import type { LinkedListState } from '../../../src/viz/renderers/LinkedListRenderer';
import type { QueueState } from '../../../src/viz/renderers/QueueRenderer';
import type { StackState } from '../../../src/viz/renderers/StackRenderer';
import type { TableState } from '../../../src/viz/renderers/TableRenderer';
import type { TreeState } from '../../../src/viz/renderers/TreeRenderer';

/** One registered renderer, with the genuinely-empty state it must draw. */
interface EmptyFrame {
  /** The registry id — the coverage guard checks these against `renderers`. */
  id: RendererId;
  /**
   * The emptiest state this renderer's contract admits: no items, no nodes, no
   * buckets. Each is `satisfies`-checked against the renderer's own exported
   * state interface, so a shape change breaks the build instead of silently
   * drawing something that is not empty and passing vacuously.
   */
  state: unknown;
  /**
   * The resting label this renderer draws when empty, or `null` for one that
   * draws none. Both halves are asserted: a named label must be PRESENT (the
   * test is otherwise vacuous the moment a state shape drifts), and a `null`
   * entry must emit no `.viz-null` text at all — so adding a resting label to
   * one of those six renderers fails here until this table is told about it.
   */
  label: string | null;
}

const EMPTY_FRAMES: EmptyFrame[] = [
  // Both ArrayRenderer exports: same geometry, two draw variants.
  { id: 'array', state: { array: [] } satisfies ArrayWindowState, label: null },
  { id: 'bars', state: { array: [] } satisfies ArrayWindowState, label: null },
  { id: 'stack', state: { items: [] } satisfies StackState, label: 'empty' },
  {
    id: 'callStack',
    state: { frames: [] } satisfies CallStackState,
    label: 'call stack empty',
  },
  {
    // A capacity-0 queue: the renderer keys its box on capacity, so this is the
    // emptiest box it can produce.
    id: 'queue',
    state: {
      slots: [],
      head: 0,
      tail: 0,
      size: 0,
      circular: true,
    } satisfies QueueState,
    label: null,
  },
  {
    id: 'linkedList',
    state: { nodes: [], kind: 'singly' } satisfies LinkedListState,
    label: 'empty list ⌀',
  },
  {
    // The chart plots a fixed frame and scales curves into it, so "empty" is an
    // empty function list; it falls back to O(1) and draws its axes.
    id: 'chart',
    state: { n: 0, maxN: 16, functions: [] } satisfies ChartState,
    label: null,
  },
  {
    id: 'tree',
    state: { nodes: [], root: null } satisfies TreeState,
    label: 'empty tree',
  },
  {
    id: 'heap',
    state: { heap: [], size: 0 } satisfies HeapState,
    label: 'empty heap',
  },
  {
    id: 'graph',
    state: { nodes: [], edges: [] } satisfies GraphState,
    label: 'empty graph',
  },
  {
    id: 'hashTable',
    state: { buckets: [], capacity: 0 } satisfies HashTableState,
    label: null,
  },
  { id: 'table', state: { table: [] } satisfies TableState, label: null },
];

/** Pulls `0 0 W H` out of an emitted `<svg>` string. */
const viewBoxOf = (svg: string, label: string): { w: number; h: number } => {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  expect(m, `no parseable viewBox for ${label}`).not.toBeNull();
  return { w: Number(m![1]), h: Number(m![2]) };
};

/**
 * Renders one renderer's empty state with NO extent, so the box under test is
 * the renderer's own — the point of the rule. A frozen extent could only widen
 * it, which would hide exactly the defect this file exists to catch.
 */
async function restingFrame(entry: EmptyFrame): Promise<string> {
  const renderer = (await renderers[entry.id]()) as RendererModule<unknown>;
  const step: Step<unknown> = {
    state: entry.state,
    explanation: 'Ready. Nothing here yet.',
  };
  return renderer.renderStatic(step, { title: '', idBase: 'e' });
}

describe('every renderer draws its resting frame inside its own viewBox', () => {
  for (const entry of EMPTY_FRAMES) {
    it(`${entry.id}: every label in the empty state fits the box it emits`, async () => {
      const svg = await restingFrame(entry);
      const box = viewBoxOf(svg, entry.id);

      for (const span of textSpans(svg)) {
        expect(
          span.start,
          `${entry.id}: [${span.cls}] "${span.content}" starts ${Math.round(
            -span.start,
          )} units left of the box`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          span.end,
          `${entry.id}: [${span.cls}] "${span.content}" ends ${Math.round(
            span.end - box.w,
          )} units past the ${box.w}-unit box`,
        ).toBeLessThanOrEqual(box.w);
      }
    });

    it(`${entry.id}: ${
      entry.label === null
        ? 'draws no resting label'
        : `rests on "${entry.label}"`
    }`, async () => {
      const svg = await restingFrame(entry);
      const nulls = textSpans(svg).filter((s) => s.cls === 'viz-null');
      if (entry.label === null) {
        expect(
          nulls.map((s) => s.content),
          `${entry.id} grew a resting label — add it to EMPTY_FRAMES so the fit assertion above covers it`,
        ).toEqual([]);
      } else {
        // Not `toContain(label)` on the raw markup: that would also pass on a
        // label smuggled through <desc>, which mirrors the explanation.
        expect(
          nulls.map((s) => s.content),
          `${entry.id}'s empty state no longer draws its resting label — the fit assertion above is vacuous until this is fixed`,
        ).toContain(entry.label);
      }
    });
  }

  it('covers every registered renderer id', () => {
    // The guard on the guard, and the reason this file is table-driven at all:
    // the previous form of this assertion lived in two per-renderer suites, so
    // a third renderer could break the rule without any test being able to see
    // it. A new renderer id must arrive here with its empty state.
    expect([...EMPTY_FRAMES.map((e) => e.id)].sort()).toEqual(
      Object.keys(renderers).sort(),
    );
  });

  it('measures a resting label the same way the renderers reserve room for it', () => {
    // `nullLabelWidth` is what a renderer floors its box by; `textSpans` is what
    // this file and `npm run audit:frames` judge the result with. If the two
    // ever disagree, a renderer can reserve exactly enough room and still be
    // reported as clipped (or the reverse), so they are pinned to each other.
    const label = 'empty tree';
    const span = textSpans(
      `<text class="viz-null" x="0">${label}</text>`,
    )[0] as { start: number; end: number };
    expect(span.end - span.start).toBe(nullLabelWidth(label));
  });
});
