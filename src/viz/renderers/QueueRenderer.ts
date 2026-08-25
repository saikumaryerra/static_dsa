/**
 * QueueRenderer — fixed-capacity FIFO queue, linear-with-wrap (architecture §4.4,
 * design §2b.3). SPEC-GAP (architecture §4.4): a circular queue is drawn as a
 * linear row of fixed slots plus a wrap arc + front/rear carets, not a literal
 * ring — readable, trig-free, and deterministic for tests.
 *
 * TState: { slots:(number|null)[]; head; tail; size; circular }. All `capacity`
 * slots are always drawn (empty = dimmed `·`) so the ring buffer's fixed size is
 * visible. Id scheme: slot at index `i` is `slotId(i)`.
 *
 * Honored highlights: `insert` = enqueue at tail (+), `delete` = dequeue at head
 * (✕), `pointer` = front/rear (named carets), `active`, `range` = occupied run
 * (band; dimmed empties are the paired non-color cue).
 */
import type { Extent, RendererModule, Step } from '../core/types';
import { slotId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, path, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  deleteMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  type Canvas,
} from './shared';

/** State QueueRenderer draws. */
export interface QueueState {
  slots: (number | null)[];
  head: number;
  tail: number;
  size: number;
  circular: boolean;
}

// --- Geometry (design §2.5) ---
const PAD = 10;
const TOP = 26; // front/rear caret band
const SLOT = 54;
const GAP = 6;
const idIndex = (id: string): number => Number(id.slice(1));

const slotX = (i: number): number => PAD + i * (SLOT + GAP);
const CELL_Y = PAD + TOP;
const INDEX_Y = CELL_Y + SLOT + 16;
const ARC_Y = INDEX_Y + 12;
const widthOf = (cap: number): number =>
  PAD * 2 + Math.max(cap, 1) * (SLOT + GAP) - GAP;
const HEIGHT = ARC_Y + 26;

/**
 * The natural box for one step. Extracted from `draw` (which now calls it) so a
 * caller can reduce a trace to its extent without building any markup. A queue's
 * capacity is fixed for a run, so this is constant across a trace — measured,
 * not assumed (`npm run audit:frames`).
 */
const measure = (step: Step<QueueState>): Extent => ({
  w: widthOf(step.state.slots.length),
  h: HEIGHT,
});

function draw(step: Step<QueueState>): Canvas {
  const { slots, circular, head, size } = step.state;
  const cap = slots.length;
  const classes = applyHighlights(step.highlights);

  let structure = '';
  slots.forEach((value, i) => {
    const x = slotX(i);
    const cx = x + SLOT / 2;
    const hlClass = classes.get(slotId(i));
    const empty = value === null;
    const cls = [
      'viz-cell',
      hlClass,
      empty && !hlClass ? 'is-eliminated' : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x,
        y: CELL_Y,
        width: SLOT,
        height: SLOT,
        rx: 6,
      }) +
        text(empty ? '·' : (value as number), {
          class: empty ? 'viz-null' : 'viz-cell__value',
          x: cx,
          y: CELL_Y + SLOT / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }) +
        text(i, {
          class: 'viz-cell__index',
          x: cx,
          y: INDEX_Y,
          'text-anchor': 'middle',
        }),
      { id: slotId(i), class: cls },
    );
  });

  // Wrap arc: the occupied run physically wraps past the end (rear before front).
  const wrapped = circular && size > 0 && head + size > cap;
  if (wrapped && cap > 0) {
    const x1 = slotX(cap - 1) + SLOT / 2;
    const x0 = slotX(0) + SLOT / 2;
    structure += path({
      class: 'viz-edge',
      'stroke-dasharray': '4 3',
      d: `M ${x1} ${ARC_Y} C ${x1 + 40} ${ARC_Y + 22}, ${x0 - 40} ${ARC_Y + 22}, ${x0} ${ARC_Y}`,
    });
    structure += text('↩ wraps', {
      class: 'viz-caret',
      x: (x0 + x1) / 2,
      y: ARC_Y + 24,
      'text-anchor': 'middle',
    });
  }

  // Markers.
  let markers = '';
  for (const h of step.highlights ?? []) {
    for (const id of h.ids) {
      const i = idIndex(id);
      const cx = slotX(i) + SLOT / 2;
      if (h.kind === 'pointer' || h.kind === 'active') {
        markers +=
          caretMark(metaLabel(h, 'front'), cx, TOP - 6) +
          text('▼', {
            class: 'viz-caret',
            x: cx,
            y: CELL_Y - 3,
            'text-anchor': 'middle',
          });
      } else if (h.kind === 'insert') {
        markers +=
          insertMark(cx, CELL_Y - 4) +
          text('▼', {
            class: 'viz-insert-mark',
            x: cx,
            y: CELL_Y - 16,
            'text-anchor': 'middle',
          });
      } else if (h.kind === 'delete') {
        markers += deleteMark(cx, CELL_Y - 4);
      }
    }
  }

  const box = measure(step);
  return {
    viewBox: `0 0 ${box.w} ${box.h}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered queue renderer. */
export const queueRenderer: RendererModule<QueueState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
  measure,
};
