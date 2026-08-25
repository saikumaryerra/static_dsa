/**
 * `fitToExtent` — the pure post-processor that widens one step's natural canvas
 * to the whole trace's frozen box (Plan A §3). Pure `Canvas → Canvas`, which is
 * why it is testable here at all: the Vitest harness is `environment: 'node'`
 * with no DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  fitToExtent,
  TOP_LEFT,
  type Anchor,
} from '../../src/viz/renderers/shared';

const canvas = (viewBox: string, inner = '<rect/>') => ({ viewBox, inner });

describe('fitToExtent', () => {
  it('returns the canvas untouched when there is no extent', () => {
    const c = canvas('0 0 40 66');
    expect(fitToExtent(c, undefined)).toEqual(c);
  });

  it('widens the viewBox to the extent and leaves a top-left drawing in place', () => {
    const out = fitToExtent(canvas('0 0 40 66'), { w: 380, h: 222 }, TOP_LEFT);
    expect(out.viewBox).toBe('0 0 380 222');
    expect(out.inner).toBe('<rect/>');
  });

  it('CLAMPS rather than shrinks: a stale extent never clips the drawing', () => {
    const out = fitToExtent(
      canvas('0 0 500 300'),
      { w: 380, h: 222 },
      TOP_LEFT,
    );
    expect(out.viewBox).toBe('0 0 500 300');
  });

  it('offsets a bottom-anchored drawing so its base stays put', () => {
    const anchor: Anchor = { x: 'left', y: 'bottom' };
    const out = fitToExtent(canvas('0 0 168 104'), { w: 168, h: 220 }, anchor);
    expect(out.viewBox).toBe('0 0 168 220');
    expect(out.inner).toBe('<g transform="translate(0 116)"><rect/></g>');
  });

  it('centres a centre-x drawing so its middle stays put', () => {
    const anchor: Anchor = { x: 'center', y: 'top' };
    const out = fitToExtent(canvas('0 0 80 184'), { w: 326, h: 184 }, anchor);
    expect(out.viewBox).toBe('0 0 326 184');
    expect(out.inner).toBe('<g transform="translate(123 0)"><rect/></g>');
  });

  it('clamps per AXIS: a wider-but-shorter extent never lifts a bottom anchor', () => {
    // The uncovered case: the extent wins on w (300 > 100) while the natural
    // box wins on h (200 > 120), so the two axes take different branches of the
    // clamp at once. `dy` must come from the CLAMPED height, not from
    // `extent.h` — deriving it from the extent gives `translate(100 -80)`,
    // which lifts a bottom-anchored drawing clean out of its own box.
    const out = fitToExtent(
      canvas('0 0 100 200'),
      { w: 300, h: 120 },
      { x: 'center', y: 'bottom' },
    );
    expect(out.viewBox).toBe('0 0 300 200');
    expect(out.inner).toBe('<g transform="translate(100 0)"><rect/></g>');
  });

  it('adds no wrapper when the offset is zero', () => {
    const out = fitToExtent(
      canvas('0 0 168 220'),
      { w: 168, h: 220 },
      { x: 'left', y: 'bottom' },
    );
    expect(out.inner).toBe('<rect/>');
  });

  it('throws loudly on a viewBox it cannot reason about', () => {
    expect(() => fitToExtent(canvas('-10 0 40 66'), { w: 80, h: 80 })).toThrow(
      /unsupported viewBox/,
    );
  });
});
