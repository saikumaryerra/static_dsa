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
 * The speed multipliers the transport offers, in menu order. Lives here rather
 * than in the island because the Player owns what a speed MEANS; the `<select>`
 * and the `pref:viz-speed` reader both render/validate against this one list.
 */
export const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3] as const;

/**
 * Normalizes a stored/serialized speed to one of {@link SPEED_OPTIONS}.
 *
 * Deliberately exact rather than nearest-neighbour: the value round-trips
 * through a `<select>` that can only display an option it owns, so a value that
 * is not on the list (hand-edited storage, a removed option from an older build)
 * is discarded in favour of the caller's default instead of silently becoming a
 * different speed.
 *
 * @param raw - The persisted string, or `null` when nothing is stored.
 * @returns The matching multiplier, or `null` when `raw` is not a valid option.
 */
export function normalizeSpeed(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return SPEED_OPTIONS.find((option) => option === value) ?? null;
}

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
  /** Backing field for the public {@link speed} getter. */
  private currentSpeed = 1;
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
   * The current speed multiplier. Exposed so the island can apply the M7.2
   * aria-live policy (mute the explanation only while autoplaying FASTER than
   * 1×, spec §10) without keeping a second copy of this state in sync.
   */
  get speed(): number {
    return this.currentSpeed;
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
      this.timer = setTimeout(tick, BASE_DELAY / this.currentSpeed);
    };
    this.timer = setTimeout(tick, BASE_DELAY / this.currentSpeed);
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

  /**
   * Advances one step and pauses any auto-play.
   *
   * A step that cannot move is a no-op in EVERY respect, playback included: the
   * clamp is checked before the pause, so a caller that steps at a bound cannot
   * stop a run through a control the UI is simultaneously marking unavailable.
   * Guarding here rather than in each caller means the button, the ←/→ shortcut
   * and every future caller inherit it (M7.2 review; A11Y-1 made the bound
   * buttons `aria-disabled`, which does not block activation by itself).
   */
  stepForward(): void {
    if (this.index >= this.trace.length - 1) return;
    this.pause();
    this.index += 1;
    this.draw();
  }

  /** Retreats one step; at step 0 it does nothing at all — see {@link stepForward}. */
  stepBackward(): void {
    if (this.index <= 0) return;
    this.pause();
    this.index -= 1;
    this.draw();
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
    this.currentSpeed = Math.max(MIN_SPEED, Math.min(multiplier, MAX_SPEED));
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
