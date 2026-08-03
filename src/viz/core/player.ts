/**
 * Player — algorithm-agnostic playback controller (site spec §11.1, architecture §3).
 *
 * A pure controller over a precomputed `Trace`. It knows nothing about arrays,
 * binary search, or SVG — only "a trace, a renderer, and a current index."
 * Play/pause/step/scrub all just move the index and ask the renderer to draw
 * the step at that index; backward stepping is trivial because the whole trace
 * is precomputed. This is what lets M3 reuse the Player unchanged for every
 * future structure. It imports only `./types` (architecture §8).
 */
import type { Renderer, Step, Trace } from './types';

/** Construction options for a {@link Player}. */
export interface PlayerOptions<TState> {
  /** The precomputed trace to play. */
  trace: Trace<TState>;
  /** The renderer that draws each step's SVG. */
  renderer: Renderer<TState>;
  /** Called after every draw so the island can sync aria-live / slider / metrics. */
  onStep?: (index: number, step: Step<TState>) => void;
  /** Called whenever playback starts or stops. */
  onPlayStateChange?: (playing: boolean) => void;
}

/** Base delay (ms) between auto-play steps at 1× speed. Divided by the speed multiplier. */
const BASE_DELAY = 900;
/** Speed multiplier bounds (site spec §10 "0.5×–3×"). */
const MIN_SPEED = 0.5;
const MAX_SPEED = 3;

/**
 * Drives a {@link Renderer} across a precomputed {@link Trace}. Generic over the
 * state type so it is fully decoupled from any concrete algorithm/renderer.
 */
export class Player<TState> {
  private trace: Trace<TState>;
  private readonly renderer: Renderer<TState>;
  private readonly onStep?: (index: number, step: Step<TState>) => void;
  private readonly onPlayStateChange?: (playing: boolean) => void;

  private index = 0;
  private playing = false;
  private speed = 1;
  /** Timer handle for the self-rescheduling auto-play loop; `null` when paused. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PlayerOptions<TState>) {
    this.trace = options.trace;
    this.renderer = options.renderer;
    this.onStep = options.onStep;
    this.onPlayStateChange = options.onPlayStateChange;
  }

  /** Current step index (0-based). */
  get currentIndex(): number {
    return this.index;
  }

  /** Total number of steps in the loaded trace. */
  get length(): number {
    return this.trace.length;
  }

  /** Whether auto-play is currently running. */
  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Draws the step at the current index and notifies the `onStep` listener.
   * The ONLY place that touches the renderer — every public method funnels here.
   */
  private draw(): void {
    const step = this.trace[this.index];
    if (!step) return;
    this.renderer.render(step);
    this.onStep?.(this.index, step);
  }

  /** Sets the playing flag and notifies the listener only on an actual change. */
  private setPlaying(next: boolean): void {
    if (this.playing === next) return;
    this.playing = next;
    this.onPlayStateChange?.(next);
  }

  /**
   * Starts auto-advancing one step per tick. Uses a self-rescheduling
   * `setTimeout` (not `setInterval`) so a slow render can't cause overlapping
   * ticks or drift. Steps are discrete; the visual tween between states is CSS's
   * job (architecture §3), so no `requestAnimationFrame` is involved.
   *
   * Called at the last step it REPLAYS: seek to 0, then play. Living here rather
   * than in the island means the play button, the Space shortcut, and every
   * other caller replay identically (M7.1 VIZ-4). No-op if already playing, or
   * if the trace has no step to advance to.
   */
  play(): void {
    if (this.playing) return;
    const last = this.trace.length - 1;
    if (this.index >= last) {
      if (last <= 0) return; // single-step trace: nothing to play
      this.seek(0);
    }
    this.setPlaying(true);
    const tick = (): void => {
      // Advance one step; auto-pause at the end of the trace.
      if (this.index >= this.trace.length - 1) {
        this.pause();
        return;
      }
      this.index += 1;
      this.draw();
      if (this.index >= this.trace.length - 1) {
        this.pause();
        return;
      }
      this.timer = setTimeout(tick, BASE_DELAY / this.speed);
    };
    this.timer = setTimeout(tick, BASE_DELAY / this.speed);
  }

  /** Stops auto-play, clearing the pending tick. Safe to call when paused. */
  pause(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setPlaying(false);
  }

  /** Toggles between {@link play} and {@link pause}. */
  toggle(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Advances one step (clamped at the last step) and pauses any auto-play. */
  stepForward(): void {
    this.pause();
    if (this.index < this.trace.length - 1) {
      this.index += 1;
      this.draw();
    }
  }

  /** Retreats one step (clamped at step 0) and pauses any auto-play. */
  stepBackward(): void {
    this.pause();
    if (this.index > 0) {
      this.index -= 1;
      this.draw();
    }
  }

  /** Returns to step 0 and pauses. */
  reset(): void {
    this.pause();
    this.index = 0;
    this.draw();
  }

  /**
   * Jumps to an arbitrary step (scrub slider). The target is clamped into
   * `[0, length-1]`. Pauses any auto-play — scrubbing while playing is treated
   * as pause + seek (design §4).
   */
  seek(index: number): void {
    this.pause();
    const last = this.trace.length - 1;
    this.index = Math.max(0, Math.min(index, last));
    this.draw();
  }

  /** Clamps and sets the auto-play speed multiplier (0.5×–3×). */
  setSpeed(multiplier: number): void {
    this.speed = Math.max(MIN_SPEED, Math.min(multiplier, MAX_SPEED));
  }

  /**
   * Swaps in a freshly computed trace (custom-input recompute) and resets to
   * step 0. Pauses first so no tick from the old trace survives the swap.
   */
  loadTrace(trace: Trace<TState>): void {
    this.pause();
    this.trace = trace;
    this.index = 0;
    this.draw();
  }
}
