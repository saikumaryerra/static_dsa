import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player } from '../../src/viz/core/player';
import type { Renderer, Step, Trace } from '../../src/viz/core/types';

/** A fake renderer that records the `state` of every step it is asked to draw. */
function fakeRenderer(): Renderer<number> & { drawn: number[] } {
  const drawn: number[] = [];
  return {
    drawn,
    mount() {},
    render(step: Step<number>) {
      drawn.push(step.state);
    },
    destroy() {},
  };
}

/** A trace whose i-th step carries state `i` (so renderer captures are indices). */
function numberTrace(length: number): Trace<number> {
  return Array.from({ length }, (_, i) => ({
    state: i,
    explanation: `step ${i}`,
  }));
}

describe('Player', () => {
  it('renders step 0 on reset and reports length/index', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(4), renderer });
    player.reset();
    expect(player.length).toBe(4);
    expect(player.currentIndex).toBe(0);
    expect(renderer.drawn).toEqual([0]);
  });

  it('stepForward advances and clamps at the last step', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(3), renderer });
    player.reset();
    player.stepForward();
    player.stepForward();
    player.stepForward(); // clamp: already at last
    expect(player.currentIndex).toBe(2);
    expect(renderer.drawn).toEqual([0, 1, 2]);
  });

  it('stepBackward retreats and clamps at step 0', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(3), renderer });
    player.seek(2);
    player.stepBackward();
    player.stepBackward();
    player.stepBackward(); // clamp: already at start
    expect(player.currentIndex).toBe(0);
  });

  it('seek clamps out-of-range targets into bounds', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(5), renderer });
    player.seek(99);
    expect(player.currentIndex).toBe(4);
    player.seek(-3);
    expect(player.currentIndex).toBe(0);
  });

  it('reset returns to index 0', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(5), renderer });
    player.seek(3);
    player.reset();
    expect(player.currentIndex).toBe(0);
  });

  it('loadTrace swaps the trace and resets to step 0', () => {
    const renderer = fakeRenderer();
    const player = new Player({ trace: numberTrace(3), renderer });
    player.seek(2);
    player.loadTrace(numberTrace(6));
    expect(player.length).toBe(6);
    expect(player.currentIndex).toBe(0);
    expect(renderer.drawn.at(-1)).toBe(0);
  });

  it('fires onStep and onPlayStateChange callbacks', () => {
    const renderer = fakeRenderer();
    const onStep = vi.fn();
    const onPlayStateChange = vi.fn();
    const player = new Player({
      trace: numberTrace(3),
      renderer,
      onStep,
      onPlayStateChange,
    });
    player.reset();
    expect(onStep).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ state: 0 }),
    );
    player.stepForward();
    expect(onStep).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ state: 1 }),
    );
  });

  describe('auto-play (fake timers)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('advances one step per tick and auto-pauses at the end', () => {
      const renderer = fakeRenderer();
      const onPlayStateChange = vi.fn();
      const player = new Player({
        trace: numberTrace(3),
        renderer,
        onPlayStateChange,
      });
      player.reset();
      player.play();
      expect(player.isPlaying).toBe(true);

      vi.advanceTimersByTime(10_000); // far past the whole trace

      expect(player.currentIndex).toBe(2);
      expect(player.isPlaying).toBe(false); // auto-paused at the last step
      expect(onPlayStateChange).toHaveBeenLastCalledWith(false);
    });

    it('setSpeed clamps high multipliers to 3× (delay = 900/3 = 300ms)', () => {
      const renderer = fakeRenderer();
      const player = new Player({ trace: numberTrace(5), renderer });
      player.reset();
      player.setSpeed(99); // clamps to 3
      player.play();
      vi.advanceTimersByTime(300);
      expect(player.currentIndex).toBe(1);
    });

    it('setSpeed clamps low multipliers to 0.5× (delay = 900/0.5 = 1800ms)', () => {
      const renderer = fakeRenderer();
      const player = new Player({ trace: numberTrace(5), renderer });
      player.reset();
      player.setSpeed(0.01); // clamps to 0.5
      player.play();
      vi.advanceTimersByTime(300);
      expect(player.currentIndex).toBe(0); // not yet — needs 1800ms
      vi.advanceTimersByTime(1500);
      expect(player.currentIndex).toBe(1);
    });

    it('pause stops further ticks', () => {
      const renderer = fakeRenderer();
      const player = new Player({ trace: numberTrace(5), renderer });
      player.reset();
      player.play();
      player.pause();
      const indexAtPause = player.currentIndex;
      vi.advanceTimersByTime(10_000);
      expect(player.currentIndex).toBe(indexAtPause);
      expect(player.isPlaying).toBe(false);
    });
  });
});
