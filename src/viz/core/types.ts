/**
 * Viz core type contracts (site spec §11.2, architecture §2).
 *
 * These are the ONLY shapes shared across the three trace-then-render layers
 * (algorithm → trace → player → renderer). This module imports nothing and is
 * imported by everything else in `src/viz` — it is the root of the dependency
 * graph, so it must stay free of any algorithm-, renderer-, or DOM-specific
 * knowledge (architecture §8 dependency direction).
 */

/**
 * A stable renderer-element id, e.g. array cell `"i3"` or graph node `"n5"`.
 * Deliberately a plain string so an algorithm can name a highlight target
 * without importing the renderer's structure (architecture §2.1). The renderer
 * owns the id scheme; the algorithm reconstructs the same strings.
 */
export type ElementId = string;

/**
 * One thing a renderer should emphasize at a given step. `kind` maps to a
 * `--hl-*` design token (plus a required non-color pairing, design §3.4); `ids`
 * name the elements to mark; `meta` carries optional per-highlight extras
 * (e.g. a pointer label) that a renderer may read.
 */
export interface Highlight {
  kind:
    | 'compare'
    | 'swap'
    | 'active'
    | 'visited'
    | 'frontier'
    | 'found'
    | 'insert'
    | 'delete'
    | 'pointer'
    | 'range';
  ids: ElementId[];
  meta?: Record<string, unknown>;
}

/**
 * A single animation step. `state` is a FULL deep-copied snapshot of the
 * structure at this point (never a shared reference — see `snapshot()`), so
 * stepping backward is just re-rendering an earlier `Step`.
 */
export interface Step<TState = unknown> {
  /** Full deep-copied snapshot of the structure at this step. */
  state: TState;
  /** What to emphasize at this step; renderer maps each to a token + marker. */
  highlights?: Highlight[];
  /** One human-readable line; also fed verbatim to the `aria-live` region. */
  explanation: string;
  /** Cumulative-to-here counters, e.g. `{ comparisons: 3 }`. */
  metrics?: Record<string, number>;
}

/** An ordered, precomputed list of steps — the whole animation. */
export type Trace<TState = unknown> = Step<TState>[];

/**
 * An instrumented algorithm: a pure function that turns typed input into a
 * `Trace`, plus the helpers the Visualizer island needs to seed and validate
 * custom input. `run` must never touch the DOM, timers, or drawing.
 */
export interface Algorithm<TInput, TState> {
  /** Registry id, e.g. `'binary-search'`. */
  id: string;
  /** Runs the algorithm and emits every meaningful state change as a `Step`. */
  run(input: TInput): Trace<TState>;
  /** A sensible starting input for the lesson's default view. */
  defaultInput(): TInput;
  /**
   * Parses the custom-input box. Returns typed input on success or a
   * `{ error }` object with a friendly message on failure — never throws.
   */
  parseInput(raw: string): TInput | { error: string };
}

/**
 * A renderer for one data-structure family. Dumb by contract: it draws exactly
 * the `Step` it is handed and runs no algorithm logic (site spec §11.5).
 * `render` is idempotent — the same step in yields the same SVG out.
 */
export interface Renderer<TState> {
  /** Creates the SVG scaffold inside `container`. Call once before `render`. */
  mount(container: HTMLElement): void;
  /** Draws exactly `step`; idempotent. */
  render(step: Step<TState>): void;
  /** Tears down DOM/listeners created by `mount`. */
  destroy(): void;
}
