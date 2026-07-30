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
  /**
   * Human label for this algorithm, e.g. `"Binary search on a sorted array"`.
   * Used as the SVG `<title>` and to compose the section `aria-label`
   * (architecture §1). The only metadata M3 adds to `Algorithm`.
   */
  label: string;
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
 * Options common to the build-time still and the live mount (architecture §2).
 */
export interface RenderOpts {
  /** SVG `<title>` text — the per-algorithm label (defaults handled by caller). */
  title?: string;
  /**
   * Unique-per-instance seed for the `<title>`/`<desc>` element ids, so multiple
   * visualizers on one page (e.g. the dev gallery) never collide on `aria-labelledby`.
   * `renderStatic` defaults it when omitted (unit tests don't need uniqueness).
   */
  idBase?: string;
}

/**
 * A renderer for one data-structure family. Dumb by contract: it draws exactly
 * the `Step` it is handed and runs no algorithm logic (site spec §11.5).
 * `render` is idempotent — the same step in yields the same SVG out.
 */
export interface Renderer<TState> {
  /**
   * Creates the SVG scaffold inside `container`. Call once before `render`.
   * `opts.title` sets the per-algorithm `<title>` (architecture §2 TD-1).
   */
  mount(container: HTMLElement, opts?: RenderOpts): void;
  /** Draws exactly `step`; idempotent. */
  render(step: Step<TState>): void;
  /** Tears down DOM/listeners created by `mount`. */
  destroy(): void;
}

/**
 * The registry-facing export shape for every renderer (architecture §2). Bundles
 * the client DOM path (`create`) with the build/still/test path (`renderStatic`):
 * both consume the same `core/svg` + `core/ids` + `core/highlight`, so the still
 * is exactly `trace[0]` by construction and both paths share one geometry source.
 */
export interface RendererModule<TState> {
  /** Client path: constructs a fresh DOM {@link Renderer}. */
  create(): Renderer<TState>;
  /**
   * Build/still/test path: renders `step` to a complete, DOM-free `<svg>` string.
   * Called at build time by the Visualizer frontmatter (zero client JS) and by
   * the renderer unit tests (Node, no jsdom).
   */
  renderStatic(step: Step<TState>, opts: RenderOpts): string;
}
