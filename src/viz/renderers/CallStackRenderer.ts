/**
 * CallStackRenderer — vertical stack of function-call frames (architecture §4.8,
 * design §2b.7). Top card = the current (innermost) call.
 *
 * TState: { frames: { label; args?; returnValue? }[] }. frames[0] is the bottom
 * (outermost) call; the last frame is the current top. Id scheme: frame at depth
 * `i` is `frameId(i)` (`"f1"`).
 *
 * Honored highlights: `insert` = call (+), `delete` = return (✕), `active`/`pointer`
 * = the current frame ("curr" caret + ▶). Each carries its non-color marker.
 */
import type { RendererModule, Step } from '../core/types';
import { frameId } from '../core/ids';
import { applyHighlights } from '../core/highlight';
import { group, rect, text } from '../core/svg';
import {
  caretMark,
  createRenderer,
  deleteMark,
  insertMark,
  metaLabel,
  renderStaticSvg,
  type Canvas,
} from './shared';

/** One call frame. */
export interface CallFrame {
  label: string;
  args?: string;
  returnValue?: string | null;
}

/** State CallStackRenderer draws. */
export interface CallStackState {
  frames: CallFrame[];
}

// --- Geometry (design §2b.7) ---
const PAD = 10;
const TOP = 26;
const CARD_W = 260;
const CARD_H = 52;
const GAP = 6;
const LEFT = 52;
const idIndex = (id: string): number => Number(id.slice(1));

const cardX = PAD + LEFT;
const cardY = (i: number, n: number): number =>
  PAD + TOP + (n - 1 - i) * (CARD_H + GAP);
const width = PAD + LEFT + CARD_W + PAD;
const heightOf = (n: number): number =>
  PAD + TOP + Math.max(n, 1) * CARD_H + Math.max(n - 1, 0) * GAP + PAD;

function draw(step: Step<CallStackState>): Canvas {
  const { frames } = step.state;
  const n = frames.length;
  const classes = applyHighlights(step.highlights);

  let structure = '';
  frames.forEach((frame, i) => {
    const y = cardY(i, n);
    const cls = classes.get(frameId(i));
    const ret =
      frame.returnValue === undefined || frame.returnValue === null
        ? '—'
        : frame.returnValue;
    structure += group(
      rect({
        class: 'viz-cell__rect',
        x: cardX,
        y,
        width: CARD_W,
        height: CARD_H,
        rx: 6,
      }) +
        text(frame.label, {
          class: 'viz-frame-label',
          x: cardX + 12,
          y: y + 21,
        }) +
        (frame.args
          ? text(`args: ${frame.args}`, {
              class: 'viz-frame-meta',
              x: cardX + CARD_W - 12,
              y: y + 21,
              'text-anchor': 'end',
            })
          : '') +
        text(`↩ returns: ${ret}`, {
          class: 'viz-frame-meta',
          x: cardX + 12,
          y: y + 40,
        }),
      { id: frameId(i), class: ['viz-cell', cls].filter(Boolean).join(' ') },
    );
  });

  if (n === 0) {
    structure += text('call stack empty', {
      class: 'viz-null',
      x: cardX + CARD_W / 2,
      y: PAD + TOP + CARD_H / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
  }

  let markers = '';
  for (const h of step.highlights ?? []) {
    for (const id of h.ids) {
      const i = idIndex(id);
      // Authoring contract: highlight ids must reference a frame present in this
      // step's state; out-of-range ids (e.g. a return's target after unwinding)
      // are skipped defensively so a marker never renders off-canvas.
      if (i < 0 || i >= n) continue;
      const y = cardY(i, n);
      const yMid = y + CARD_H / 2;
      const cx = cardX + CARD_W / 2;
      if (h.kind === 'pointer' || h.kind === 'active') {
        markers +=
          caretMark(metaLabel(h, 'curr'), cardX - 26, yMid + 4) +
          text('▶', {
            class: 'viz-caret',
            x: cardX - 10,
            y: yMid,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          });
      } else if (h.kind === 'insert') {
        markers += insertMark(cx, y - 6);
      } else if (h.kind === 'delete') {
        markers += deleteMark(cx, y - 6);
      }
    }
  }

  return {
    viewBox: `0 0 ${width} ${heightOf(n)}`,
    inner:
      group(structure, { class: 'viz-cells' }) +
      group(markers, { class: 'viz-markers' }),
  };
}

/** Registered call-stack renderer. */
export const callStackRenderer: RendererModule<CallStackState> = {
  create: () => createRenderer(draw),
  renderStatic: (step, opts) => renderStaticSvg(draw, step, opts),
};
