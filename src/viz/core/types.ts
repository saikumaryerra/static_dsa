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
 * The drawing box for a WHOLE trace, in viewBox user units: the per-step
 * maximum of every box the renderer would compute for that trace.
 *
 * Exists because renderers size their viewBox from the CURRENT step, so a
 * structure that grows mid-trace (a tree gaining a level, a stack gaining a
 * slot) resized the canvas while the reader stepped — up to 1,049px on heaps,
 * moving the transport row under their thumb. Freezing one box per trace is the
 * fix; `Extent` is how that box travels from the caller to the renderer.
 */
export interface Extent {
  /** viewBox width in user units. */
  w: number;
  /** viewBox height in user units. */
  h: number;
}

/**
 * One Predict-the-Step question (M8.2), derived from the trace the Player
 * already holds — never from a second run of the algorithm.
 *
 * The literal shape spec §11.2 writes inline for `predictStep`'s return, named
 * here so the predictors and their caller share one definition instead of two
 * copies that can drift.
 */
export interface PredictQuestion {
  /** The question asked above the buttons, e.g. `"What does the search do next?"`. */
  prompt: string;
  /** 2–4 button labels in display order (§11.2 caps choices at 4). */
  choices: string[];
  /** Index into {@link choices} of the answer the next step proves. */
  correctIndex: number;
}

/**
 * One value column of a ledger — the table that transcribes a whole trace
 * (Plan C §1). The contract lives here, at the root of the dependency graph,
 * because {@link Algorithm.ledger} needs the shape; the BEHAVIOUR is
 * `core/ledger.ts`.
 */
export interface LedgerColumn<TState> {
  /** Column heading, e.g. `"mid"`. Written like the state field it reads. */
  label: string;
  /**
   * Reads this column's value out of ONE step.
   *
   * PROVENANCE RULE 1: it reads `step.state` — the data model — and nothing
   * else. Deriving a value from `step.highlights` would make the table a second
   * narration channel, able to disagree with the sentence the author wrote.
   *
   * `null` means "no value at this step" and renders as an absent mark, never
   * as a fabricated zero.
   */
  from(step: Step<TState>): string | number | null;
  /**
   * Right-align and set in tabular numerals. Defaults to whether the value is
   * a number, so a column that is numeric only some of the time can say so
   * once instead of flickering alignment down the table.
   */
  numeric?: boolean;
}

/**
 * What an algorithm declares about its own ledger: which values are worth a
 * column, and which `metrics` key is its cost. Both are optional overall — an
 * algorithm that declares nothing still gets a table, built from its metrics
 * (see `core/ledger.ts`'s generic fallback).
 */
export interface LedgerSpec<TState> {
  /** Value columns, in display order, before the "what happened" column. */
  columns: LedgerColumn<TState>[];
  /** The `step.metrics` key that is this algorithm's cost, e.g. `"comparisons"`. */
  costKey?: string;
}

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
  /**
   * OPTIONAL (M8.2, spec §11.2): the Predict-the-Step question for step `i`,
   * graded against `trace[i + 1]`. Additive — an algorithm without it simply
   * offers no predict mode, and every existing algorithm compiles unchanged.
   *
   * Must be PURE: it reads the precomputed trace the Player already holds (no
   * DOM, no timers, no storage, no re-running `run`), which is how predict mode
   * consumes the trace-then-render pipeline instead of forking it.
   *
   * Returns `null` for any step with nothing worth predicting — including the
   * last step, which has no successor to grade against.
   */
  predictStep?(
    trace: Trace<TState>,
    i: number,
    input: TInput,
  ): PredictQuestion | null;
  /**
   * OPTIONAL (Plan C §1): the value columns this algorithm's ledger shows, and
   * its cost key. Additive — an algorithm without it gets the generic table
   * built from `metrics`, and every existing algorithm compiles unchanged.
   */
  ledger?: LedgerSpec<TState>;
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
  /**
   * The frozen box for the whole trace (see {@link Extent}). OPTIONAL: with it
   * omitted a renderer draws its natural per-step box, which is what the unit
   * tests and the dev gallery want. It can only ever WIDEN the drawing — a
   * stale or undersized extent is clamped, never allowed to clip.
   */
  extent?: Extent;
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
  /**
   * Replaces the extent used by every subsequent `render`.
   *
   * Required rather than optional, and separate from `mount`, because `mount`
   * runs exactly ONCE per island (`Visualizer.astro`) while `Player.loadTrace`
   * re-traces on every custom run. An extent that could only arrive at mount
   * would be frozen at the authored run's size, so the custom run — the case
   * that varies most — would draw against a stale box.
   */
  setExtent(extent: Extent | undefined): void;
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
  /**
   * The NATURAL drawing box for `step` — geometry only, no markup built.
   *
   * Callers reduce this over a whole trace to get its {@link Extent}. It exists
   * as its own entry point because reading the box back out of `renderStatic`'s
   * emitted string costs 247ms for bubble sort at the permitted n = 30 (901
   * steps) on a fast desktop, and that reduction runs synchronously in the
   * custom-input submit handler; the geometry-only form costs 0.44ms.
   *
   * MUST agree with `draw`: each renderer computes its viewBox by calling its
   * own `measure`, so there is one source and no drift.
   * `tests/unit/renderers/measure.test.ts` asserts the agreement.
   */
  measure(step: Step<TState>): Extent;
}
