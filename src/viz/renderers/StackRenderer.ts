/**
 * StackRenderer — vertical LIFO stack (architecture §4.3, design §2b.2).
 *
 * TState: { items: number[]; top?: number }. Index 0 is the BOTTOM; the last
 * item is the top. Id scheme: slot at index `i` is `slotId(i)` (`"s2"`).
 *
 * Honored highlights (via `core/highlight`): `insert` = push (+ caret), `delete`
 * = pop (✕), `active`/`pointer` = the top-of-stack ("top" caret + ▶). Every kind
 * carries its non-color marker (design §3.2).
 *
 * Reduced motion inherited from the token layer. Single atomic redraw per step
 * via the shared DOM helper.
 */
import type { Extent, RendererModule, Step } from '../core/types';
import { slotId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, line, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  deleteMark,
  foundMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  type Anchor,
  type Canvas,
} from './shared';

/** State StackRenderer draws. */
export interface StackState {
  items: number[];
  top?: number;
}

// --- Geometry (design §2.5) ---
const PAD = 10;
const TOP = 26; // marker band above the top slot
const SLOT_W = 96;
const SLOT_H = 54;
const GAP = 4;
const LEFT = 52; // gutter for the "top" caret + ▶
const idIndex = (id: string): number => Number(id.slice(1));

const slotX = PAD + LEFT;
const slotYTop = (i: number, n: number): number =>
  PAD + TOP + (n - 1 - i) * (SLOT_H + GAP);
const width = PAD + LEFT + SLOT_W + PAD;
const heightOf = (n: number): number =>
  PAD + TOP + Math.max(n, 1) * SLOT_H + Math.max(n - 1, 0) * GAP + 14;

/**
 * The natural box for one step. Extracted from `draw` (which now calls it) so a
 * caller can reduce a trace to its extent without building any markup.
 */
const measure = (step: Step<StackState>): Extent => ({
  w: width,
  h: heightOf(step.state.items.length),
});

/**
 * Bottom-anchored: a physical stack sits on the ground, and `draw` puts that
 * ground line under slot 0. Under a top anchor a frozen box would slide the
 * ground down on every push.
 */
const ANCHOR: Anchor = { x: 'left', y: 'bottom' };

function draw(step: Step<StackState>): Canvas {
  const { items } = step.state;
  const n = items.length;
  const classes = applyHighlights(step.highlights);
  const cx = slotX + SLOT_W / 2;

  let structure = '';
  items.forEach((value, i) => {
    const y = slotYTop(i, n);
    const cls = classes.get(slotId(i));
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: slotX,
        y,
        width: SLOT_W,
        height: SLOT_H,
        rx: 6,
      }) +
        text(value, {
          class: 'viz-cell__value',
          x: cx,
          y: y + SLOT_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }) +
        text(i, {
          class: 'viz-cell__index',
          x: slotX + SLOT_W + 8,
          y: y + SLOT_H / 2,
          'dominant-baseline': 'central',
        }),
      { id: slotId(i), class: ['viz-cell', cls].filter(Boolean).join(' ') },
    );
  });

  // Base line under the bottom slot (a physical stack sits on the ground).
  const baseY = slotYTop(0, n) + SLOT_H + 2;
  structure += line({
    class: 'viz-divider',
    x1: slotX - 4,
    x2: slotX + SLOT_W + 4,
    y1: baseY,
    y2: baseY,
  });
  if (n === 0) {
    structure += text('empty', {
      class: 'viz-null',
      x: cx,
      y: PAD + TOP + SLOT_H / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
  }

  // Markers.
  let markers = '';
  for (const h of step.highlights ?? []) {
    for (const id of h.ids) {
      const i = idIndex(id);
      // Authoring contract: highlight ids must reference an element present in
      // this step's state; out-of-range ids (e.g. a pop's target after removal)
      // are skipped defensively so a marker never renders off-canvas.
      if (i < 0 || i >= n) continue;
      const y = slotYTop(i, n);
      const yMid = y + SLOT_H / 2;
      if (h.kind === 'pointer' || h.kind === 'active') {
        markers +=
          caretMark(metaLabel(h, 'top'), slotX - 26, yMid + 4) +
          text('▶', {
            class: 'viz-caret',
            x: slotX - 10,
            y: yMid,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          });
      } else if (h.kind === 'insert') {
        markers += insertMark(cx, y - 6);
      } else if (h.kind === 'delete') {
        markers += deleteMark(cx, y - 6);
      } else if (h.kind === 'found') {
        markers += foundMark(cx, y - 6);
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

/** Registered stack renderer. */
export const stackRenderer: RendererModule<StackState> = {
  create: () => createRenderer(draw, ANCHOR),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts, ANCHOR),
  measure,
};
