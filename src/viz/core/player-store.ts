/**
 * Player store — the unchanged `Player`, readable by React (React migration
 * plan §5 P2 WS-I step 4).
 *
 * The `Player` (spec §11.1) stays the single owner of the current index, the
 * playing flag, the speed and the self-rescheduling `setTimeout` loop; this
 * class adds no state of its own beyond a cached, immutable SNAPSHOT of those
 * values, which is what `useSyncExternalStore` needs: `getSnapshot` must return
 * the same object until something changed, and a new one when it did.
 *
 * It listens through the two callbacks the Player already offers
 * (`onStep`, `onPlayStateChange`) and adds the one notification the Player
 * cannot give — `setSpeed` fires no callback, so a speed change goes through
 * {@link PlayerStore.setSpeed} here, which is what lets the live-region policy
 * (mute above 1× while playing, A11Y-6) re-evaluate without a second copy of
 * the speed anywhere.
 *
 * DOM-free and React-free: it imports only the Player and the core types, so it
 * stays inside `src/viz/core`'s dependency rule (architecture §8).
 */
import { Player } from './player';
import type { Renderer, Step, Trace } from './types';

/** Everything the island renders from the player, at one moment. */
export interface PlayerSnapshot {
  /** The trace being played — the same object the Player indexes into. */
  readonly trace: Trace<unknown>;
  /** Current step index (0-based). */
  readonly index: number;
  /** The step at {@link index}. */
  readonly step: Step<unknown>;
  /** Steps in the trace. */
  readonly length: number;
  /** Whether auto-play is running. */
  readonly playing: boolean;
  /** The speed multiplier. */
  readonly speed: number;
}

/** Construction options for a {@link PlayerStore}. */
export interface PlayerStoreOptions {
  /** The first trace to play. Must not be empty. */
  trace: Trace<unknown>;
  /** The renderer every step is drawn with. */
  renderer: Renderer<unknown>;
  /**
   * Called synchronously after every draw, BEFORE subscribers hear of it —
   * the island's hook for work that has to run against the freshly drawn
   * canvas or the pre-render DOM (re-measuring the drawing, noting where focus
   * was before the re-render moves anything).
   */
  onDrawn?: (index: number, step: Step<unknown>) => void;
}

/**
 * A `Player` plus a `subscribe`/`getSnapshot` pair for `useSyncExternalStore`.
 */
export class PlayerStore {
  /** The wrapped player. Call its transport methods directly. */
  readonly player: Player<unknown>;
  private trace: Trace<unknown>;
  private snapshot: PlayerSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly onDrawn?: (index: number, step: Step<unknown>) => void;

  constructor(options: PlayerStoreOptions) {
    const first = options.trace[0];
    if (!first) throw new Error('PlayerStore: the trace is empty.');
    this.trace = options.trace;
    this.onDrawn = options.onDrawn;
    this.snapshot = {
      trace: options.trace,
      index: 0,
      step: first,
      length: options.trace.length,
      playing: false,
      speed: 1,
    };
    this.player = new Player<unknown>({
      trace: options.trace,
      renderer: options.renderer,
      onStep: (index, step) => {
        this.onDrawn?.(index, step);
        this.update({
          index,
          step,
          trace: this.trace,
          length: this.trace.length,
        });
      },
      onPlayStateChange: (playing) => this.update({ playing }),
    });
  }

  /**
   * Subscribe to changes (the `useSyncExternalStore` contract).
   *
   * @param listener - Called after every change.
   * @returns The unsubscribe function.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * The current snapshot — the same object until something changes.
   *
   * @returns The snapshot.
   */
  getSnapshot = (): PlayerSnapshot => this.snapshot;

  /**
   * Swaps in a freshly computed trace and resets to step 0 (custom input,
   * "Restore example"). The trace is recorded BEFORE the Player draws its
   * first step, so the snapshot that step produces already names it.
   *
   * @param trace - The new trace. Must not be empty.
   */
  loadTrace(trace: Trace<unknown>): void {
    this.trace = trace;
    this.player.loadTrace(trace);
  }

  /**
   * Sets the auto-play speed (clamped by the Player) and tells subscribers —
   * the one change the Player itself reports to nobody.
   *
   * @param multiplier - The speed multiplier.
   */
  setSpeed(multiplier: number): void {
    this.player.setSpeed(multiplier);
    this.update({ speed: this.player.speed });
  }

  /** Replaces the snapshot with `patch` applied and notifies subscribers. */
  private update(patch: Partial<PlayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
