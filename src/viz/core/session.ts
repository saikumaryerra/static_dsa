/**
 * Predict-the-Step session — the pure half of predict mode (M8.2; React
 * migration plan §5 P2 WS-I step 4).
 *
 * `Visualizer.astro` kept this state in a dozen closure variables beside the
 * DOM code that painted it. The React island keeps the PAINTING and hands the
 * STATE to this reducer, so the rules that are product decisions rather than
 * presentation — what counts as a skip, when a pass is credited, that a verdict
 * rides exactly one explanation — are plain functions the unit suite can hold
 * (`tests/unit/viz-session.test.ts`), which nothing inside a `.astro` component
 * ever could be.
 *
 * What it deliberately does NOT own:
 * - **The current step.** The `Player` stays the single owner of the index, the
 *   playing flag and the `setTimeout` loop (spec §11). A session reacts to
 *   steps; it never moves one. Where an action must move the player ("answer →
 *   advance one step") the reducer says so as an EFFECT and the island performs
 *   it, so the reducer stays pure and the Player stays the only clock.
 * - **Storage.** Predict mode is NEVER persisted — there is no storage key for
 *   it, by design (`docs/m8-gamification.md`, spec §6), so "per page visit" is a
 *   property of this code rather than a promise about it. This module touches no
 *   global at all; the one write a session can cause, `recordPass()`, is an
 *   effect the island performs through `src/lib/progress.ts`, which owns the
 *   3-day Mastered gate.
 * - **Any score.** `correct` exists only to compute the ≥80% bar silently. The
 *   activity line reads `answered` and `skipped` and never a ratio — a binding
 *   calm invariant: an accuracy display during a learning act makes beginners
 *   protect a number instead of attempting hard predictions.
 *
 * This module imports only types (architecture §8: core imports nothing from
 * the island, the registry or the DOM).
 */
import type { PredictQuestion } from './types';

/**
 * The design's answer floor for a passing predict session
 * (`docs/m8-gamification.md` M8.2: "≥5 answers at ≥80%"). A lesson whose
 * authored run offers fewer questions than this credits a pass at a complete
 * pass of that run instead — see {@link passFloorFor}.
 */
export const PASS_ANSWERS = 5;

/** How a graded prediction is told: by a glyph and a word, never by colour. */
export type Verdict = 'right' | 'wrong';

/** One predict session, as the island renders it. */
export interface SessionState {
  /**
   * Whether predict mode is on. In memory and NOWHERE else: the toggle has no
   * storage key, so it is per page visit and no preference can be rewritten by
   * a link.
   */
  readonly predictOn: boolean;
  /**
   * Whether predict mode has ever been on during this visit. The question
   * strip is built on first use and then only hidden, never in SSR: the
   * `<noscript>` kill-switch hides `.viz-controls`, not `.viz-frame`, so a
   * server-rendered strip would be the one gamification affordance that
   * survived with JS off.
   */
  readonly stripBuilt: boolean;
  /** Questions answered this session — ACTIVITY, shown. */
  readonly answered: number;
  /** Of those, answered correctly — never shown, never stored. */
  readonly correct: number;
  /** Questions on screen the reader stepped past without answering — shown. */
  readonly skipped: number;
  /** Whether this session has already met the bar, so the write happens once. */
  readonly passRecorded: boolean;
  /** A graded prediction waiting to ride the NEXT explanation. */
  readonly pendingVerdict: Verdict | null;
  /** The verdict prefixed to the explanation now on screen, if any. */
  readonly verdict: Verdict | null;
}

/** What can happen to a session. */
export type SessionAction =
  /** The toggle (or `?review=1`, or teardown) turned the mode on or off. */
  | { type: 'toggle'; on: boolean }
  /** The reader picked choice `choice` of a question whose answer is `correctIndex`. */
  | { type: 'answer'; choice: number; correctIndex: number }
  /**
   * Step forward, by the button or the → key. `questionShown`: a question was
   * on screen at the moment, so stepping past it is an explicit SKIP.
   */
  | { type: 'forward'; questionShown: boolean }
  /** The player drew a step (any step, by any route). */
  | { type: 'stepped' }
  /** The `recordPass()` write could not happen; the next answer may retry. */
  | { type: 'passFailed' };

/** Something the island must do because of an action. */
export type SessionEffect =
  /** Predicting and watching are incompatible: stop any run. */
  | { type: 'pause' }
  /** Move the player one step (an answer advances; a skip steps on). */
  | { type: 'stepForward' }
  /** The session met the bar: credit the lesson through `recordPass()`. */
  | { type: 'recordPass' };

/** What a session needs to know about the instrument it runs on. */
export interface SessionConfig {
  /** Answers a passing session needs here — see {@link passFloorFor}. */
  readonly passFloor: number;
  /**
   * The lesson a pass credits, or `''` where there is none (/about, the dev
   * gallery): the practice still works there and nothing is ever written.
   */
  readonly lessonSlug: string;
}

/** A reducer step: the next state and the effects it asks for, in order. */
export interface SessionResult {
  readonly state: SessionState;
  readonly effects: readonly SessionEffect[];
}

/** A fresh session: mode off, nothing counted. */
export const INITIAL_SESSION: SessionState = {
  predictOn: false,
  stripBuilt: false,
  answered: 0,
  correct: 0,
  skipped: 0,
  passRecorded: false,
  pendingVerdict: null,
  verdict: null,
};

/**
 * The answers a passing session needs HERE: the design's five, or a complete
 * pass of a shorter authored run. Never more than five, and never more than
 * this lesson's own run can ask.
 *
 * THE FLOOR IS THE DESIGN'S FIVE, OR A COMPLETE PASS OF A SHORTER AUTHORED RUN.
 * "≥5 answers" was written without measuring what the shipped traces can offer:
 * binary search's authored run is four steps, so it holds exactly three
 * predictable ones — and `/learn`'s review card deep-links that lesson with
 * `?review=1`, which turns this mode on. A bar that one pass of the lesson's own
 * run cannot reach is worse than a lower one, and three correct predictions out
 * of three IS a complete, accurate pass of that run. The count comes from the
 * BUILD's scan of the AUTHORED trace, so a one-question custom input cannot
 * cheapen the bar: only the lesson's own run defines "complete".
 *
 * @param authoredItems - Predictable steps in the authored run, counted at
 *   build time; `0` (or anything falsy) when unknown, which falls back to the
 *   full design bar.
 * @returns The answer floor.
 */
export function passFloorFor(authoredItems: number): number {
  return Math.min(PASS_ANSWERS, authoredItems || PASS_ANSWERS);
}

/**
 * A predictor's question, if it is one the strip may render.
 *
 * The 2–4 choice contract the build enforces for the authored run is re-checked
 * at runtime because a custom input reaches states the build never saw: a
 * one-button "prediction" — the shape the design's floor guard exists to
 * prevent on BFS's near-path graph — is treated as no question rather than
 * rendered.
 *
 * @param question - What `predictStep` returned.
 * @returns The question, or `null` when there is nothing to ask.
 */
export function askable(
  question: PredictQuestion | null | undefined,
): PredictQuestion | null {
  if (!question || !Array.isArray(question.choices)) return null;
  const size = question.choices.length;
  return size >= 2 &&
    size <= 4 &&
    question.correctIndex >= 0 &&
    question.correctIndex < size
    ? question
    : null;
}

/**
 * Whether a session has just met the bar: ≥80% correct across at least
 * `passFloor` answers, on a page that has a lesson to credit, not yet written.
 * Computed in integers — the ratio is never formatted, let alone displayed.
 *
 * @param state - The session after an answer.
 * @param config - The instrument's floor and lesson.
 * @returns `true` when `recordPass()` should be called now.
 */
export function meetsBar(state: SessionState, config: SessionConfig): boolean {
  return (
    !state.passRecorded &&
    config.lessonSlug !== '' &&
    state.answered >= config.passFloor &&
    state.correct * 5 >= state.answered * 4
  );
}

/**
 * The session line: how much the reader DID, never how well — or `null` while
 * there is nothing to report, so a fresh session opens with no zeros staring
 * back. "7 answered · 2 skipped" is a binding calm invariant: no ratio, no
 * percentage, no score.
 *
 * @param state - The session.
 * @returns The line, or `null` to hide it.
 */
export function activityLine(state: SessionState): string | null {
  if (state.answered + state.skipped === 0) return null;
  return `${state.answered} answered · ${state.skipped} skipped`;
}

/**
 * Whether the run table is hidden. THE LEDGER IS PREDICT MODE'S ANSWER KEY:
 * every predictor grades against `trace[i + 1]` and the table renders that row,
 * so predicting hides it outright — hidden, not blanked, because a blanked row
 * still leaks the answer through the row count, and styling a leak is not
 * hiding it (Plan C §4; spec §19.1 for why this is not the killed cost
 * withholding).
 *
 * @param state - The session.
 * @returns `true` while predicting.
 */
export function ledgerHidden(state: SessionState): boolean {
  return state.predictOn;
}

/**
 * The session reducer. Pure: no DOM, no storage, no player — see the module
 * comment for what it leaves to the island.
 *
 * @param state - The current session.
 * @param action - What happened.
 * @param config - The instrument's floor and lesson.
 * @returns The next session and the effects the island must perform, in order.
 */
export function reduceSession(
  state: SessionState,
  action: SessionAction,
  config: SessionConfig,
): SessionResult {
  switch (action.type) {
    case 'toggle': {
      if (state.predictOn === action.on) return { state, effects: [] };
      if (!action.on)
        return { state: { ...state, predictOn: false }, effects: [] };
      // A fresh session each time it is switched on. Nothing is carried over
      // and nothing was written down, which is what "infinitely retriable"
      // means in practice.
      return {
        state: {
          ...state,
          predictOn: true,
          stripBuilt: true,
          answered: 0,
          correct: 0,
          skipped: 0,
          passRecorded: false,
        },
        effects: [{ type: 'pause' }],
      };
    }
    case 'answer': {
      if (!state.predictOn) return { state, effects: [] };
      const right = action.choice === action.correctIndex;
      // The verdict does not get its own panel: it is prefixed to the NEXT
      // step's authored explanation, so a correct and an incorrect answer both
      // land on the same immediate, elaborated feedback.
      const answered: SessionState = {
        ...state,
        answered: state.answered + 1,
        correct: state.correct + (right ? 1 : 0),
        pendingVerdict: right ? 'right' : 'wrong',
      };
      const effects: SessionEffect[] = [{ type: 'stepForward' }];
      if (meetsBar(answered, config)) {
        effects.push({ type: 'recordPass' });
        return { state: { ...answered, passRecorded: true }, effects };
      }
      return { state: answered, effects };
    }
    case 'forward': {
      // Skipping is a first-class option (autonomy is the design's stated
      // reason) and is counted as a SKIP — never as a wrong answer.
      const skipped =
        state.predictOn && action.questionShown
          ? { ...state, skipped: state.skipped + 1 }
          : state;
      return { state: skipped, effects: [{ type: 'stepForward' }] };
    }
    case 'stepped': {
      // One explanation carries a verdict, and only the one written right
      // after the answer: the next step's sentence is plain again.
      if (state.pendingVerdict === null && state.verdict === null) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          verdict: state.pendingVerdict,
          pendingVerdict: null,
        },
        effects: [],
      };
    }
    case 'passFailed':
      // Nothing on screen ever claimed this was saved, and the bar can be met
      // again in the same session — so the only repair needed is to let the
      // next answer try the write again.
      return { state: { ...state, passRecorded: false }, effects: [] };
  }
}
