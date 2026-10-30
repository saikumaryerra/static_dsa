/**
 * The Visualizer island — the step-through instrument, hydrated (site spec
 * §11.3, design §2; React migration plan §5 P2 WS-I steps 3–5, D-04/D-05).
 *
 * `Visualizer.tsx` is the server wrapper: it runs every build-time check and
 * renders the `<section class="viz">` container through `<Island>`. This file
 * is what goes INSIDE that section — rendered once on the server (isolated, no
 * context, from the serialized props below) and hydrated in the browser by
 * `src/client/islands.ts` once the section scrolls near the viewport.
 *
 * WHO OWNS WHAT, which is the whole design of the port:
 *
 * - **The `Player` owns playback** — the current index, the playing flag, the
 *   speed and the self-rescheduling `setTimeout` loop (spec §11; the calm
 *   invariant forbids `setInterval`). It is unchanged; `core/player-store.ts`
 *   only lets React read it through `useSyncExternalStore`.
 * - **The renderer owns the canvas.** The still is server markup in a
 *   `dangerouslySetInnerHTML` that never changes after the first render, so
 *   React never writes into `.viz-canvas` again; the renderer is mounted into
 *   it from an effect and drives it imperatively (`mount`/`setExtent`/`render`/
 *   `destroy`), exactly as before. The RSP-2 measurement — the canvas's own
 *   `tabindex`/`role`/name and `--viz-natural-w` — stays imperative on that
 *   element too, because it has to read layout straight after the renderer
 *   draws.
 * - **React owns every other region** — the transport's bound state and
 *   names, the slider and counter, the speed select, the explanation live
 *   region, the metric pills, the custom-input form and its error, the ledger's
 *   current row and tab stop, and Predict mode's strip, note and session line.
 *   Those used to be ~1,650 lines of hand-synchronised DOM writes; here they are
 *   a function of (player snapshot, predict session, ledger, input error).
 * - **Predict's rules are `core/session.ts`**, a pure reducer with its own unit
 *   tests: skip counting, the `min(5, authored)` pass floor, `recordPass` once,
 *   nothing persisted, the ledger hidden while on.
 *
 * Everything below still reads the SAME precomputed trace the Player indexes
 * into: predict consumes it, the ledger transcribes it, a custom run replaces
 * it — nothing forks the trace-then-render pipeline (spec §11.3).
 *
 * M7.2 (Player v2), all on that pipeline:
 * - runtime bound state as `aria-disabled` instead of `disabled` (A11Y-1), so a
 *   focused button never dies under the keyboard user and the island's ←/→
 *   shortcuts keep working. The REAL `disabled` attribute survives in SSR only,
 *   where it still has to block a pre-hydration submit;
 * - lifecycle states that are told apart: loading (the bar still dimmed by the
 *   SSR `disabled` recipe, plus a "…" counter and `aria-busy` — set by the
 *   island bootstrap ONLY, so a JS-off page is never "busy";
 *   `src/client/viz-prepare.ts`) versus failed (`data-viz-failed` hides the
 *   controls, and the message says what the reader can still do);
 * - an aria-live policy for autoplay above 1× (A11Y-6, spec §10's M7 exception);
 * - custom-input recovery: helper text disclosing the real per-algorithm cap,
 *   and a "Restore example" control that puts the authored run back (CMP-14);
 * - RSP-2's mobile legibility floor: the canvas scrolls rather than shrinking
 *   the drawing below readable, and becomes a keyboard-reachable scroll region
 *   for exactly as long as it actually overflows.
 *
 * HYDRATION RULES (plan §2.2, D-11): nothing here reads `window`, `document`,
 * `location` or `localStorage` during render — only in effects and handlers.
 * The first client render reproduces the server render exactly (no player yet,
 * every control `disabled`); the player arrives from the mount effect. The one
 * node the bootstrap writes before hydration — the counter's "…" — carries
 * `suppressHydrationWarning`.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { VIZ_RUN_EVENT, type VizRunDetail } from '../lib/enrichment-store';
import { PROGRESS_CHANGED_EVENT } from '../lib/progress-events';
import { errorField, type ErrorField } from './core/error-field';
import { traceExtent } from './core/extent';
import { composeCustomInput, splitAuthoredInput } from './core/input-hint';
import {
  buildLedger,
  withoutCost,
  type Ledger as LedgerData,
} from './core/ledger';
import { collectLegend, type LegendEntry } from './core/legend';
import { normalizeSpeed, SPEED_OPTIONS } from './core/player';
import { PlayerStore, type PlayerSnapshot } from './core/player-store';
import {
  activityLine,
  askable,
  INITIAL_SESSION,
  ledgerHidden,
  passFloorFor,
  reduceSession,
  type SessionAction,
  type SessionConfig,
  type SessionState,
  type Verdict,
} from './core/session';
import type {
  Algorithm,
  Extent,
  PredictQuestion,
  Renderer,
  RendererModule,
  Step,
  Trace,
} from './core/types';
import Ledger from './Ledger';
import { loadedAlgorithm, loadedRenderer } from './registry';

/** The props the server serializes and the browser hydrates with. */
export interface VisualizerIslandProps {
  /** The instrument's id base (`claimInstrumentId`); every inner id derives from it. */
  uid: string;
  /** Registry algorithm id. */
  algorithm: string;
  /** Registry renderer id. */
  renderer: string;
  /** The authored input string, or `''` for the algorithm's `defaultInput()`. */
  input: string;
  /** Render the custom-input disclosure. */
  allowCustomInput: boolean;
  /** Render the metric pills (and keep the ledger's cost column). */
  showMetrics: boolean;
  /** Render the run as a table under the drawing. */
  showLedger: boolean;
  /** Label of the first custom-input field ("Array", "Edges", "n"). */
  inputLabel: string;
  /** Its placeholder, derived from the authored input at build time. */
  arrayPlaceholder: string;
  /** Label of the second field ("Target", "Index", "Start node"). */
  targetLabel: string;
  /** Its placeholder, derived from the authored input at build time. */
  targetHint: string;
  /** Render the second field. */
  showTarget: boolean;
  /** Format + real-cap helper text measured at build time, or `null`. */
  helpText: string | null;
  /** Whether the build proved this run asks at least one prediction. */
  showPredict: boolean;
  /**
   * Predictable steps in the AUTHORED run, counted by the build — the input to
   * the session's pass floor. `0` where there is no lesson to credit.
   */
  authoredItems: number;
  /** The lesson a passed predict session credits, or `''` for none. */
  lessonSlug: string;
  /** The island's own root (`<section class="viz">`), handed in by the bootstrap. */
  container?: HTMLElement;
}

/** The authored run: everything the instrument shows before anyone touches it. */
export interface AuthoredRun {
  /** The parsed authored input (or `defaultInput()`). */
  input: unknown;
  /** Its trace. */
  trace: Trace<unknown>;
  /** The frozen drawing box for that whole trace (Plan A §3). */
  extent: Extent;
  /** `renderStatic(trace[0])` inside that box — the still. */
  still: string;
  /** The highlight kinds the trace really uses (auto-legend, M7.2). */
  legend: LegendEntry[];
}

/**
 * What the strip says on a step the predictor declines to ask about — a
 * dequeue is not next, the trace has ended. Plain and final: no nudge, no
 * "try again", nothing that reads as the product asking for something. The
 * review queue is the only surface in this product that ever prompts.
 */
const PREDICT_IDLE = 'No prediction at this step.';

/**
 * SPEC-GAP: §6 (amended for M7.2) permits the PREFERENCE key `pref:viz-speed`
 * but says nothing about its shape or its scope. Stored as the plain
 * multiplier string and shared by every visualizer on the page: playback speed
 * is a property of the reader, not of one island, and a per-island key would
 * multiply storage writes by the number of visualizers on a lesson. It is a
 * preference, so the reset-progress control must never clear it.
 */
const SPEED_KEY = 'pref:viz-speed';

/**
 * Same-page sync channel for that one preference, mirroring CodeTabs'
 * `codetabs:lang`: N islands share ONE speed, so the island the reader touched
 * has to tell its siblings. Without it a lesson with two visualizers keeps the
 * second one running at the old rate behind a `<select>` still showing 1×,
 * which contradicts the key's own "a property of the reader" rationale above.
 */
const SPEED_EVENT = 'viz:speed';

/** Narrow a parseInput result to its error branch. */
function isParseError(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

/**
 * Reads the persisted playback speed, clamped to the `<select>`'s own options.
 * Storage-safe: private mode / disabled storage throws on access, and a
 * preference is never worth breaking the player over, so it degrades to `null`
 * (= keep the 1× default).
 */
function readStoredSpeed(): number | null {
  try {
    return normalizeSpeed(localStorage.getItem(SPEED_KEY));
  } catch {
    return null;
  }
}

/** Persists the playback speed. Silently gives up when storage is unavailable. */
function storeSpeed(value: string): void {
  try {
    localStorage.setItem(SPEED_KEY, value);
  } catch {
    // Preference-only: a failed write must never surface to the reader.
  }
}

/**
 * Runs the authored input and derives everything the instrument shows from
 * that one trace. Pure, and the SAME function on both sides: the server
 * wrapper calls it to fail the build on a bad authored run, the island calls
 * it once (in a `useState` initializer) to render the identical still — so
 * server and client output agree by construction.
 *
 * @param algo - The resolved algorithm.
 * @param rmod - The resolved renderer module.
 * @param algorithmId - Its registry id, for the error message.
 * @param uid - The instrument's id base (seeds the still's title/desc ids).
 * @param rawInput - The authored input, or `''`.
 * @returns The authored run.
 * @throws When the authored input is rejected or the trace is empty.
 */
export function authoredRun(
  algo: Algorithm<unknown, unknown>,
  rmod: RendererModule<unknown>,
  algorithmId: string,
  uid: string,
  rawInput: string,
): AuthoredRun {
  const input = rawInput ? algo.parseInput(rawInput) : algo.defaultInput();
  if (isParseError(input)) {
    throw new Error(`Authored <Visualizer> input rejected: ${input.error}`);
  }
  const trace = algo.run(input);
  const step0 = trace[0];
  if (!step0) {
    throw new Error(`Algorithm "${algorithmId}" produced an empty trace.`);
  }
  // One box for the whole trace (Plan A §3). Renderers size their viewBox from
  // the CURRENT step, so a growing structure resized the canvas mid-trace and
  // moved the transport row under the reader's thumb. The still is emitted
  // with the SAME extent the live renderer mounts with, or the JS-off frame
  // would keep step 0's small box and the drawing would jump once, at
  // hydration.
  const extent = traceExtent(rmod.measure, trace);
  return {
    input,
    trace,
    extent,
    still: rmod.renderStatic(step0, { title: algo.label, idBase: uid, extent }),
    // Auto-legend (M7.2): scanning the real trace for the highlight kinds it
    // actually emits produces a legend that cannot drift from the drawing.
    legend: collectLegend(trace),
  };
}

/**
 * Transcribes a trace into the table, applying the same two rules on every
 * path: `buildLedger`'s 200-row cap, and `showMetrics` on the cost column —
 * "no counters on this demo" must not be defeated by the table underneath the
 * drawing.
 *
 * @param algo - The algorithm (its optional `ledger` spec).
 * @param trace - The trace.
 * @param showMetrics - Whether this instrument shows counters.
 * @returns The ledger.
 */
function ledgerFor(
  algo: Algorithm<unknown, unknown>,
  trace: Trace<unknown>,
  showMetrics: boolean,
): LedgerData {
  const full = buildLedger(trace, algo.ledger);
  return showMetrics ? full : withoutCost(full);
}

/**
 * The metric pills for one step: "Comparisons 3". Same label + `<b>` value
 * shape on the server and in the browser, so hydration is layout-neutral (an
 * empty `.viz-metrics` once grew ~36px at hydration and shifted in-flight
 * smooth scrolls, MOT-1) and the counts are readable with JS off.
 *
 * @param step - The step.
 * @returns One `{ label, value }` per metric, in the trace's key order.
 */
function metricPills(step: Step<unknown>): { label: string; value: string }[] {
  return Object.entries(step.metrics ?? {}).map(([key, value]) => ({
    label: `${key[0]!.toUpperCase()}${key.slice(1)} `,
    value: String(value),
  }));
}

/**
 * RSP-2: gives the drawing a legibility floor and keeps the resulting scroll
 * container operable. The floor itself is CSS (`min-width` from
 * `--viz-natural-w`); this reads the mounted SVG's `viewBox`, which under the
 * frozen extent (Plan A) holds ONE value for a whole run and changes only when
 * a new trace brings a new box — mount, a custom run, or "Restore example".
 * Having read the box, this reconciles the canvas's two competing tabindex
 * needs against reality:
 *
 * - not overflowing → `tabindex="-1"`: a click target for the Space/←/→
 *   shortcuts, invisible to assistive tech and absent from the tab order;
 * - overflowing → a real scroll region, so `tabindex="0"` + `role="group"` +
 *   a name, because a scrollable box no one can reach with a keyboard is a
 *   2.1.1 failure — a worse trade than the reflow it was fixing.
 *
 * Imperative on purpose: the canvas belongs to the renderer, and the verdict
 * needs layout read straight after the property is written.
 *
 * @param canvas - The `.viz-canvas` element.
 * @param title - The algorithm label, for the scroll region's name.
 * @returns The `viewBox` this pass measured against.
 */
function measureCanvas(canvas: HTMLElement, title: string): string | null {
  const svg = canvas.querySelector('svg');
  let viewBox: string | null = null;
  if (svg instanceof SVGSVGElement) {
    viewBox = svg.getAttribute('viewBox');
    const natural = svg.viewBox.baseVal.width;
    if (natural > 0) {
      canvas.style.setProperty('--viz-natural-w', `${Math.round(natural)}px`);
    }
  }
  // 1px of slack: sub-pixel layout rounding otherwise reports a permanent
  // overflow on boxes that visually fit exactly.
  const overflows = canvas.scrollWidth - canvas.clientWidth > 1;
  canvas.setAttribute('tabindex', overflows ? '0' : '-1');
  if (overflows) {
    canvas.setAttribute('role', 'group');
    canvas.setAttribute('aria-label', `${title}, scrollable diagram`);
  } else {
    canvas.removeAttribute('role');
    canvas.removeAttribute('aria-label');
  }
  return viewBox;
}

/** Escapes text for an HTML text node. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The explanation region's contents as ONE HTML string: the step's authored
 * sentence, prefixed — right after a graded prediction — by the verdict. The
 * verdict is carried by a glyph AND a word, never by colour (§12), and the
 * glyph is `aria-hidden`, so the announcement reads "Correct — <the step's own
 * explanation>". "Not quite", not "Wrong": a first miss is the point of
 * predicting. Only escaped authored text and fixed markup go in.
 *
 * @param explanation - The step's explanation.
 * @param verdict - The verdict riding it, if any.
 * @returns The region's inner HTML.
 */
function explanationHtml(explanation: string, verdict: Verdict | null): string {
  if (!verdict) return escapeText(explanation);
  const right = verdict === 'right';
  return `<span class="viz-verdict" data-verdict="${verdict}"><span class="viz-verdict__glyph" aria-hidden="true">${right ? '✓' : '✗'}</span>${right ? 'Correct' : 'Not quite'}</span>${escapeText(` — ${explanation}`)}`;
}

/** Subscribe-to-nothing, for the render before a player exists. */
const NO_SUBSCRIPTION = (): (() => void) => () => {};
/** The snapshot before a player exists: none. */
const NO_SNAPSHOT = (): null => null;

/**
 * The player's snapshot, or `null` until the mount effect has created one (the
 * server render and the hydration render both see `null`).
 *
 * @param store - The store, once created.
 * @returns The current snapshot.
 */
function usePlayerSnapshot(store: PlayerStore | null): PlayerSnapshot | null {
  return useSyncExternalStore<PlayerSnapshot | null>(
    store ? store.subscribe : NO_SUBSCRIPTION,
    store ? store.getSnapshot : NO_SNAPSHOT,
    NO_SNAPSHOT,
  );
}

/** A custom-input error and the field it is about. */
interface InputError {
  message: string;
  field: ErrorField;
}

/**
 * The instrument: figure, controls, key, ledger, no-JS note.
 *
 * @param props - See {@link VisualizerIslandProps}.
 * @returns The section's children.
 */
export default function VisualizerIsland(
  props: VisualizerIslandProps,
): JSX.Element {
  const {
    uid,
    input: rawInput,
    allowCustomInput,
    showMetrics,
    showLedger,
    inputLabel,
    arrayPlaceholder,
    targetLabel,
    targetHint,
    showTarget,
    helpText,
    showPredict,
    container,
  } = props;
  const algo = loadedAlgorithm(props.algorithm);
  const rmod = loadedRenderer(props.renderer);
  const title = algo.label;

  // The authored run, computed once — on the server and again, identically,
  // on the client — and never recomputed: a custom run replaces the TRACE the
  // player holds, while the still, the legend and the authored ledger stay
  // what the build drew.
  const [authored] = useState(() =>
    authoredRun(algo, rmod, props.algorithm, uid, rawInput),
  );

  const explainId = `${uid}-explain`;
  const predictNoteId = `${uid}-predict-note`;
  const errId = `${uid}-err`;
  const helpId = `${uid}-help`;
  const stepId = `${uid}-step`;
  const speedId = `${uid}-speed`;
  const arrayId = `${uid}-array`;
  const targetId = `${uid}-target`;
  const promptId = `${explainId}-predict`;

  // ---- State -----------------------------------------------------------
  /** The player, once the mount effect has created it. */
  const [store, setStore] = useState<PlayerStore | null>(null);
  const snapshot = usePlayerSnapshot(store);
  /**
   * The PARSED input of the run being played — what `predictStep` needs beside
   * the trace and the index (M8.2). A custom run replaces it.
   */
  const [runInput, setRunInput] = useState<unknown>(authored.input);
  /** The table: the authored run's, then each custom run's (Plan C §3). */
  const [ledger, setLedger] = useState<LedgerData | null>(() =>
    showLedger ? ledgerFor(algo, authored.trace, showMetrics) : null,
  );
  const [session, setSession] = useState<SessionState>(INITIAL_SESSION);
  const [inputError, setInputError] = useState<InputError | null>(null);

  // ---- Refs: the elements handlers reach, and state handlers read ------
  const canvasRef = useRef<HTMLDivElement>(null);
  const fwdRef = useRef<HTMLButtonElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const arrayRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer<unknown> | null>(null);
  const storeRef = useRef<PlayerStore | null>(null);
  /** The session as of the last dispatch — handlers read it synchronously. */
  const sessionRef = useRef<SessionState>(INITIAL_SESSION);
  const runInputRef = useRef<unknown>(authored.input);
  /** The `viewBox` the last canvas measurement ran against (RSP-2). */
  const measuredRef = useRef<string | null>(null);
  /** Whether focus was on a predict choice just before the last draw. */
  const choiceFocusRef = useRef(false);
  /** The ledger index the mark is on, or `null` before the first mark. */
  const markedRef = useRef<number | null>(null);

  const predictFn = algo.predictStep ? algo.predictStep.bind(algo) : null;
  const sessionConfig: SessionConfig = {
    passFloor: passFloorFor(props.authoredItems),
    lessonSlug: props.lessonSlug,
  };

  // ---- Derived presentation ---------------------------------------------
  const ready = snapshot !== null;
  const index = snapshot?.index ?? 0;
  // Before the player exists the slider shows what the server rendered —
  // "Step 1 of 1" on a 0..0 range — and the counter a dash pair.
  const length = snapshot?.length ?? 1;
  const playing = snapshot?.playing ?? false;
  const step = snapshot?.step ?? authored.trace[0]!;
  const atStart = index <= 0;
  const atEnd = index >= length - 1;
  const predictOn = session.predictOn;
  // M8.2: predict mode is the second reason play can be unavailable.
  const playBound = length < 2 || predictOn;
  const question: PredictQuestion | null =
    snapshot && predictOn && predictFn
      ? askable(predictFn(snapshot.trace, index, runInput))
      : null;
  // A11Y-6 (spec §10's M7 exception): above 1× the trace advances every
  // ~300ms or faster, so a polite live region either floods the reader or
  // drops most of it. Muted for exactly that case — and polite again on the
  // final step, so the one announcement that matters (where the run ended)
  // still lands, once.
  const liveMuted = playing && (snapshot?.speed ?? 1) > 1 && index < length - 1;
  const progress = length > 1 ? (index / (length - 1)) * 100 : 0;
  const activity = activityLine(session);
  const pills = showMetrics ? metricPills(step) : [];
  // The SECOND field's rendered label; empty when that field isn't rendered.
  // errorField reads it so error attribution follows the actual UI.
  const errorFieldLabel = showTarget ? targetLabel : '';

  // ---- Session dispatch ---------------------------------------------------

  /**
   * Applies one session action and performs the effects it asks for. The
   * session ref is updated BEFORE the effects run, so a step an effect causes
   * (which re-enters through `onDrawn`) sees the new state.
   */
  const dispatchSession = (action: SessionAction): void => {
    const result = reduceSession(sessionRef.current, action, sessionConfig);
    if (result.state !== sessionRef.current) {
      sessionRef.current = result.state;
      setSession(result.state);
    }
    for (const effect of result.effects) {
      if (effect.type === 'pause') storeRef.current?.player.pause();
      else if (effect.type === 'stepForward') {
        storeRef.current?.player.stepForward();
      } else recordSessionPass();
    }
  };

  /**
   * The predict path onto the mastery ladder, once the session has met its
   * bar (`core/session.ts` decides when). Written through `recordPass`, which
   * owns the 3-day Mastered gate, so predict re-implements no promotion rule.
   *
   * The store is imported on demand so its bytes are not in the bundle of
   * every page that merely SHOWS a visualization (/about ships one and has no
   * lesson to credit). On a lesson page the chunk is already loaded by the
   * page's own modules, so this resolves from the module registry — which is
   * also why a failed import is treated as "not saved yet", not an error.
   */
  const recordSessionPass = (): void => {
    const slug = props.lessonSlug;
    void import('../lib/progress')
      .then((store) => {
        store.recordPass(slug);
        // Tell the surfaces that render mastery to re-read, INSIDE the async
        // callback: this write happens after a dynamic import resolves, so no
        // click-time listener can observe it, and without this the one visit
        // that earned Practiced is the one visit that never shows it.
        // `FinalRun` dispatches the same event for the same reason.
        document.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT));
      })
      .catch(() => dispatchSession({ type: 'passFailed' }));
  };

  /** The question at the player's CURRENT index, read live (handlers). */
  const questionNow = (): PredictQuestion | null => {
    const live = storeRef.current;
    if (!live || !predictFn || !sessionRef.current.predictOn) return null;
    return askable(
      predictFn(
        live.getSnapshot().trace,
        live.player.currentIndex,
        runInputRef.current,
      ),
    );
  };

  /**
   * Turns predict mode on or off — through the reducer, the single writer of
   * every piece of predict state, so the toggle, the review deep link and
   * teardown cannot disagree. Everything it changes on screen (the toggle's
   * `aria-pressed`, the note, the strip, the hidden ledger, the transport's
   * `aria-disabled` + `aria-describedby`) is derived from the session below.
   */
  const setPredict = (on: boolean): void => {
    if (!showPredict || !predictFn) return;
    dispatchSession({ type: 'toggle', on });
  };

  // ---- Transport ------------------------------------------------------
  // Bound-state guards (A11Y-1): a bound button stays focusable and focused,
  // so its handler is what has to decline. EVERY route to the transport goes
  // through these — the click handlers and the Space/←/→ shortcuts alike —
  // because the `.viz-keys` hint advertises the keys as equivalent to the
  // buttons, and a key that acted while the button it mirrors reads
  // "unavailable" would make the bound state a lie. They read the player
  // live, never the last render, because autoplay moves it between renders.

  const togglePlay = (): void => {
    const player = storeRef.current?.player;
    if (!player || player.length < 2 || sessionRef.current.predictOn) return;
    player.toggle();
  };
  const stepBack = (): void => {
    const player = storeRef.current?.player;
    if (!player || player.currentIndex <= 0) return;
    player.stepBackward();
  };
  /**
   * Step forward, counting an on-screen question the reader chose not to
   * answer as an explicit SKIP — never as a wrong answer. Both routes to the
   * control (the button and the → key) come through here.
   */
  const stepForwardCounted = (): void => {
    const player = storeRef.current?.player;
    if (!player || player.currentIndex >= player.length - 1) return;
    dispatchSession({ type: 'forward', questionShown: questionNow() !== null });
  };
  const resetToStart = (): void => {
    const player = storeRef.current?.player;
    if (!player || player.currentIndex <= 0) return;
    player.reset();
  };

  /**
   * Grades one prediction and moves on. The verdict rides the NEXT step's
   * authored explanation (one write into the atomic live region), so a right
   * and a wrong answer get the same immediate, elaborated feedback.
   */
  const answer = (choice: number): void => {
    const asked = questionNow();
    const player = storeRef.current?.player;
    if (!asked || !player) return;
    const before = player.currentIndex;
    dispatchSession({
      type: 'answer',
      choice,
      correctIndex: asked.correctIndex,
    });
    // A predictor is contracted to return `null` on the last step, so the step
    // above always lands and the verdict has already ridden it. If a custom run
    // ever proves otherwise, say it anyway rather than swallow it.
    if (player.currentIndex === before) dispatchSession({ type: 'stepped' });
  };

  // ---- Custom input ---------------------------------------------------

  /** Shows a friendly custom-input error without disturbing the current trace. */
  const showError = (message: string): void => {
    // Blame the field the message is about; when the target field isn't
    // rendered, every error is the first field's by construction.
    const field: ErrorField =
      errorField(message, errorFieldLabel) === 'target' && targetRef.current
        ? 'target'
        : 'input';
    // Committed BEFORE focus moves: focusing re-announces the field together
    // with this message via aria-describedby, so the reader still gets it if
    // the polite live-region update is dropped (A11Y-8) — which only works if
    // the message is already in the DOM when focus lands.
    flushSync(() => setInputError({ message, field }));
    (field === 'target' ? targetRef.current : arrayRef.current)?.focus();
  };

  /**
   * Swaps in a new trace together with its OWN frozen box. Every caller that
   * replaces the trace comes through here — the custom run and "Restore
   * example" alike — because `mount` runs exactly once, so `setExtent` is the
   * only channel that can update the box afterwards.
   *
   * Order matters: the extent is in place BEFORE the redraw `loadTrace`
   * triggers, and the canvas is re-measured after it. THE LEDGER REBUILDS HERE
   * for the same reason the extent does (Plan C §3): a table that did not
   * follow the trace would be the OLD run's numbers printed beside the NEW
   * run's drawing. Committed synchronously, so whatever hears the `viz:run`
   * that follows a custom run meets a settled island.
   *
   * KNOWN TRADE, recorded because this is where it first becomes reachable:
   * both `traceExtent` and the `fitToExtent` inside the redraw throw rather
   * than draw a box they cannot justify, and `Player.draw` does not guard
   * `renderer.render`. A throw raised here — from the reader's own input, the
   * only runtime-only exposure, since every authored run is measured and drawn
   * at build time — propagates out of the submit handler. Loud-on-impossible-
   * geometry is deliberate; making the failure legible belongs to `Player`.
   */
  const applyTrace = (next: Trace<unknown>, parsed: unknown): void => {
    const live = storeRef.current;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!live || !renderer || !canvas) return;
    renderer.setExtent(traceExtent(rmod.measure, next));
    flushSync(() => {
      runInputRef.current = parsed;
      setRunInput(parsed);
      setInputError(null);
      live.loadTrace(next);
      if (showLedger) setLedger(ledgerFor(algo, next, showMetrics));
    });
    measuredRef.current = measureCanvas(canvas, title);
  };

  /**
   * Announces a finished custom run to the page (`viz:run`; spec §11.3's M8
   * amendment, contract in `src/lib/challenges.ts`).
   *
   * CONSUMES, NEVER RECOMPUTES: `finalStep` is the last element of the trace
   * the player is already indexing into. Fired ONLY from the custom-input
   * submit path — a trial has to be earned by crafting an input, not by
   * loading the page, and "Restore example" replays the AUTHORED run, which the
   * challenge build guard already proves clears nothing.
   *
   * @param raw - The exact string this run's `parseInput` accepted.
   * @param trace - The run's trace.
   */
  const announceRun = (raw: string, trace: Trace<unknown>): void => {
    const finalStep = trace[trace.length - 1];
    if (!finalStep) return;
    // Bubbling per the contract even though it is dispatched on `document`.
    document.dispatchEvent(
      new CustomEvent<VizRunDetail>(VIZ_RUN_EVENT, {
        bubbles: true,
        detail: { algorithmId: props.algorithm, input: raw, finalStep },
      }),
    );
  };

  /** Custom-input flow (§5.4): recompute on valid, keep the trace on invalid. */
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!storeRef.current) return;
    // The two fields, joined into the one string parseInput takes, gated on
    // this instrument's own authored input so a graph or DP field is
    // untouched (composeCustomInput).
    const raw = composeCustomInput(
      arrayRef.current?.value ?? '',
      targetRef.current?.value ?? '',
      splitAuthoredInput(rawInput).input,
    );
    const parsed = algo.parseInput(raw);
    if (isParseError(parsed)) {
      showError(parsed.error);
      return;
    }
    const trace = algo.run(parsed);
    applyTrace(trace, parsed);
    // The reader crafted a run and it succeeded: tell the page (M8.3). Last,
    // so anything listening sees a settled island.
    announceRun(raw, trace);
  };

  /**
   * Recovery (CMP-14): re-run the AUTHORED example and put its real values
   * back in the fields, so a broken experiment is one click from the lesson's
   * own picture.
   */
  const onRestore = (): void => {
    if (!storeRef.current) return;
    const parsed = algo.parseInput(rawInput);
    if (isParseError(parsed)) return;
    const fields = splitAuthoredInput(rawInput);
    if (arrayRef.current) arrayRef.current.value = fields.input;
    if (targetRef.current) targetRef.current.value = fields.target;
    applyTrace(algo.run(parsed), parsed);
  };

  // ---- Ledger -----------------------------------------------------------

  /**
   * A row's seek button. Declined while predicting — the same decline the
   * slider makes, on the same condition. The table is `hidden` then, so no
   * reader can reach this; the guard is what still holds if that regresses.
   */
  const onSeek = (target: number): void => {
    if (sessionRef.current.predictOn) return;
    storeRef.current?.player.seek(target);
  };

  /** ArrowUp/ArrowDown/Home/End between rows; ←/→ belong to the well, a 2-D scroller. */
  const onSeekKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    from: number,
  ): void => {
    const rows = ledger?.rows.length ?? 0;
    if (sessionRef.current.predictOn || rows === 0) return;
    const next =
      event.key === 'ArrowDown'
        ? from + 1
        : event.key === 'ArrowUp'
          ? from - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? rows - 1
              : null;
    if (next === null) return;
    // Swallowed at a bound too: the well must not scroll as a consolation for
    // a move that didn't happen.
    event.preventDefault();
    if (next < 0 || next >= rows) return;
    storeRef.current?.player.seek(next);
    // The well keeps the new row in view (the layout effect below), so focus
    // must not scroll anything a second time.
    wellRef.current
      ?.querySelector('tbody')
      ?.rows.item(next)
      ?.querySelector<HTMLButtonElement>('[data-ledger-seek]')
      ?.focus({ preventScroll: true });
  };

  // ---- Effects --------------------------------------------------------

  /**
   * The latest handlers, for the listeners bound once below (document,
   * window, the island root) and for the player's draw hook.
   */
  const latest = useRef({
    togglePlay,
    stepBack,
    stepForwardCounted,
    dispatchSession,
    setPredict,
  });
  useLayoutEffect(() => {
    latest.current = {
      togglePlay,
      stepBack,
      stepForwardCounted,
      dispatchSession,
      setPredict,
    };
  });

  // Mount (architecture §5.3): the renderer replaces the still in place, the
  // player is created over the authored trace, and the island goes live. Runs
  // once; its cleanup is the teardown contract (TD-4) — everything it starts
  // stops with the island.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = rmod.create();
    canvas.replaceChildren();
    renderer.mount(canvas, { title, extent: authored.extent });
    rendererRef.current = renderer;
    const created = new PlayerStore({
      trace: authored.trace,
      renderer,
      onDrawn: () => {
        // Where focus is BEFORE the re-render this step causes: a question
        // with fewer choices can pull the focused button out from under a
        // keyboard user, and the layout effect below puts them back.
        choiceFocusRef.current =
          choicesRef.current?.contains(document.activeElement) ?? false;
        // The renderer has just redrawn: if that widened the drawing, the
        // RSP-2 floor and the scroll-region state are recomputed for it — a
        // string compare unless the geometry really changed.
        const svg = canvas.querySelector('svg');
        if (
          svg instanceof SVGSVGElement &&
          svg.getAttribute('viewBox') !== measuredRef.current
        ) {
          measuredRef.current = measureCanvas(canvas, title);
        }
        latest.current.dispatchSession({ type: 'stepped' });
      },
    });
    storeRef.current = created;
    created.player.reset();
    measuredRef.current = measureCanvas(canvas, title);
    // Restore the reader's speed preference (§6 `pref:viz-speed`), only when
    // it names an option this build still offers.
    const stored = readStoredSpeed();
    if (stored !== null) created.setSpeed(stored);
    // The review queue's deep link (M8.2): `?review=1` opens predict mode for
    // THIS page visit and nothing else. It cannot rewrite a preference because
    // there is none to rewrite — the toggle is never persisted.
    if (new URLSearchParams(location.search).get('review') === '1') {
      latest.current.setPredict(true);
    }
    setStore(created);
    return () => {
      created.player.pause(); // clears any pending auto-play tick
      renderer.destroy();
      storeRef.current = null;
      rendererRef.current = null;
      container?.removeAttribute('data-viz-ready');
      container?.removeAttribute('aria-busy');
      container?.removeAttribute('data-viz-loading');
      container?.removeAttribute('data-viz-failed');
    };
    // Runs once: the authored run, the renderer module, the label and the
    // container are fixed for an island's lifetime.
  }, [authored, rmod, title, container]);

  // Live: the loading state ends AFTER the commit that enabled the controls,
  // so `data-viz-ready` never names an instrument whose buttons are still
  // `disabled`.
  useLayoutEffect(() => {
    if (!ready || !container) return;
    container.removeAttribute('data-viz-loading');
    container.removeAttribute('aria-busy');
    container.setAttribute('data-viz-ready', 'true');
  }, [ready, container]);

  // Convenience keys inside the viz (design §3.3): Space = toggle, ←/→ = step.
  // On the island root, which React does not render (it is the container).
  useEffect(() => {
    if (!ready || !container) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.key === ' ' || event.key === 'Spacebar') {
        if (tag === 'BUTTON') return; // let the button's native click fire
        event.preventDefault();
        latest.current.togglePlay();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // While the canvas is a real scroll region (RSP-2), ←/→ belong to the
        // scroll container: stealing them would leave its content unreachable
        // by keyboard (2.1.1). The ledger's well is the same case by
        // construction — it scrolls in BOTH axes. Everywhere else they step,
        // through the SAME availability gate as the buttons they mirror; the
        // key is still swallowed at a bound, so the page never scrolls
        // sideways as a consolation for a step that didn't happen.
        const canvas = canvasRef.current;
        if (canvas && canvas.tabIndex === 0 && canvas.contains(target)) return;
        if (wellRef.current?.contains(target)) return;
        event.preventDefault();
        if (event.key === 'ArrowLeft') latest.current.stepBack();
        else latest.current.stepForwardCounted();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [ready, container]);

  // Sibling speed sync (SPEED_EVENT): another island on this page changed the
  // one shared preference.
  useEffect(() => {
    if (!store) return;
    const onSpeed = (event: Event): void => {
      // Normalized, not trusted: the detail decides what a `<select>` shows,
      // and only an option this build offers can be displayed.
      const speed = normalizeSpeed((event as CustomEvent<string>).detail);
      // Re-entrancy guard: the island that dispatched already holds it.
      if (speed === null || store.getSnapshot().speed === speed) return;
      store.setSpeed(speed);
    };
    document.addEventListener(SPEED_EVENT, onSpeed);
    return () => document.removeEventListener(SPEED_EVENT, onSpeed);
  }, [store]);

  // RSP-2: the overflow verdict depends on the box width, so re-measure when
  // the viewport changes — one rAF-coalesced pass per burst.
  useEffect(() => {
    if (!store) return;
    let frame: number | null = null;
    const onResize = (): void => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const canvas = canvasRef.current;
        if (canvas) measuredRef.current = measureCanvas(canvas, title);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [store, title]);

  // Keep the current ledger row in view WITHOUT yanking the page: scroll the
  // WELL, and only when the row is outside it. `scrollIntoView` would walk
  // every scrollable ancestor and move the reader away from the drawing the
  // row describes.
  //
  // IT ONLY SCROLLS WHEN THE MARK MOVES. A reader can arrive here from a
  // `<StepLink>`, which scrolls the well to the row it names and THEN brings
  // the instrument into view — which is what mounts the island. A first mark
  // that revealed would scroll that reader straight back to row 1.
  useLayoutEffect(() => {
    if (!ready) return;
    const moved = markedRef.current !== null && markedRef.current !== index;
    markedRef.current = index;
    const well = wellRef.current;
    if (!moved || !well) return;
    const row = well.querySelector('tbody')?.rows.item(index);
    if (!row) return;
    const rowBox = row.getBoundingClientRect();
    const wellBox = well.getBoundingClientRect();
    // The column headers are STICKY at the top of the well, so the first
    // ~35px of it is not somewhere a row can be seen.
    const usableTop =
      wellBox.top +
      (well.querySelector('thead th')?.getBoundingClientRect().height ?? 0);
    if (rowBox.top < usableTop || rowBox.bottom > wellBox.bottom) {
      well.scrollTop +=
        rowBox.top - wellBox.top - (wellBox.height - rowBox.height) / 2;
    }
  }, [ready, index, ledger]);

  // Predict focus retention: the choice buttons are reconciled in place (keyed
  // by position), so a keyboard user's focus survives the redraw that follows
  // their own answer. Only a question with FEWER choices can pull the focused
  // button out from under them; land on the first choice of the new question,
  // or — when this step has none — on the control that carries them onward.
  useLayoutEffect(() => {
    if (!choiceFocusRef.current) return;
    choiceFocusRef.current = false;
    const box = choicesRef.current;
    if (box?.contains(document.activeElement)) return;
    const fallback =
      box?.querySelector<HTMLButtonElement>('button') ?? fwdRef.current;
    fallback?.focus();
  });

  // ---- Render -----------------------------------------------------------

  /** `aria-disabled` once live (A11Y-1); absent in SSR, where `disabled` rules. */
  const bound = (isBound: boolean): 'true' | 'false' | undefined =>
    ready ? (isBound ? 'true' : 'false') : undefined;
  const playLabel = playing
    ? 'Pause'
    : ready && atEnd
      ? 'Replay from start'
      : 'Play';

  const verdict = session.verdict;

  return (
    <>
      <figure className="viz-frame">
        {/* Build-time static still (renderStatic step 0); upgraded in place on
            hydrate. tabindex="-1" is the click-then-Space focus target (the
            pointerdown handler focuses it, so the island's shortcuts work after
            a click on the drawing). It is NOT keyboard-reachable at -1;
            `measureCanvas` promotes it to tabindex="0" + role="group" + a name
            for exactly as long as the drawing actually overflows its box
            (RSP-2), and owns those three attributes from then on. */}
        <div
          className="viz-canvas"
          data-viz-canvas=""
          tabIndex={-1}
          ref={canvasRef}
          dangerouslySetInnerHTML={{ __html: authored.still }}
          onPointerDown={
            ready
              ? () => canvasRef.current?.focus({ preventScroll: true })
              : undefined
          }
        />

        {/* Predict-the-Step's question strip, immediately ABOVE the
            explanation — built on first use and then only hidden, never in
            SSR (see `SessionState.stripBuilt`). */}
        {session.stripBuilt && (
          <div
            className="viz-predict"
            data-viz-predict-strip=""
            data-idle={question ? undefined : ''}
            hidden={!predictOn}
          >
            <p className="viz-predict__prompt" id={promptId}>
              {question ? question.prompt : PREDICT_IDLE}
            </p>
            {/* A labelled group, so the choices are announced as one
                question's answers and the label follows the question. */}
            <div
              className="viz-predict__choices"
              role="group"
              aria-labelledby={promptId}
              hidden={!question}
              ref={choicesRef}
            >
              {question?.choices.map((choice, i) => (
                <button
                  type="button"
                  className="btn-secondary viz-predict__choice"
                  data-choice={i}
                  key={i}
                  onClick={() => answer(i)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <p
              className="viz-pill viz-predict__activity"
              hidden={activity === null}
            >
              {activity ?? ''}
            </p>
          </div>
        )}

        <p
          className="viz-explain"
          id={explainId}
          aria-live={liveMuted ? 'off' : 'polite'}
          aria-atomic="true"
          data-viz-explain=""
          // One write, not two: the region is `aria-atomic`, so the verdict of
          // a graded prediction rides the step's own explanation as ONE
          // change — and every change REPLACES the region's children in a
          // single mutation, exactly the legacy `textContent =` /
          // `replaceChildren` write (React would otherwise edit a lone text
          // node in place, a different mutation than assistive tech and the
          // live-region tests have always seen). See `explanationHtml`.
          dangerouslySetInnerHTML={{
            __html: explanationHtml(step.explanation, verdict),
          }}
        />
      </figure>

      <div className="viz-controls" data-viz-controls="">
        {/* One row from 640px up — transport | scrubber (flex) | speed — and
            two rows below it (transport, then scrubber + speed). DOM order IS
            the visual order at every width, so the tab order never disagrees
            with the layout. `title` mirrors each aria-label so the icons are
            hoverable-discoverable too. */}
        <div className="viz-control-bar">
          <div className="viz-transport">
            <button
              type="button"
              className="viz-btn"
              data-viz-reset=""
              aria-label="Reset to start"
              title="Reset to start"
              disabled={!ready}
              aria-disabled={bound(atStart)}
              onClick={resetToStart}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12a8 8 0 1 0 2.3-5.6"></path>
                <path d="M4 4v4h4"></path>
              </svg>
            </button>
            {/* Single chevrons, echoing the ←/→ keys that do the same thing.
                NOT the skip-to-end media glyphs they replace (they promised a
                jump to the end, which is the slider's job). */}
            <button
              type="button"
              className="viz-btn"
              data-viz-back=""
              aria-label="Step back"
              title="Step back"
              disabled={!ready}
              aria-disabled={bound(atStart)}
              onClick={stepBack}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7"></path>
              </svg>
            </button>
            {/* No aria-pressed (VIZ-9 / A11Y-7): the accessible name already
                carries the state (Play / Pause / Replay from start), and a
                toggle that both renames itself and reports pressed
                double-encodes it. At the end it REPLAYS (Player.play seeks to
                0 first), so it stays available there. `data-playing` drives
                the CSS glyph swap. */}
            <button
              type="button"
              className="viz-btn viz-btn--play"
              data-viz-play=""
              data-playing={playing ? '' : undefined}
              aria-label={playLabel}
              title={playLabel}
              disabled={!ready}
              aria-disabled={bound(playBound)}
              aria-describedby={predictOn ? predictNoteId : undefined}
              onClick={togglePlay}
            >
              <svg
                className="viz-play__play"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z"></path>
              </svg>
              <svg
                className="viz-play__pause"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 5h4v14H6z"></path>
                <path d="M14 5h4v14h-4z"></path>
              </svg>
            </button>
            <button
              type="button"
              className="viz-btn"
              data-viz-forward=""
              aria-label="Step forward"
              title="Step forward"
              disabled={!ready}
              aria-disabled={bound(atEnd)}
              onClick={stepForwardCounted}
              ref={fwdRef}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5l7 7-7 7"></path>
              </svg>
            </button>

            {/* Predict-the-Step (M8.2), rendered only where the build proved
                this algorithm's predictor really asks something about this
                run. A MODE, not transport: constant label + `aria-pressed`
                (M7.1 CMP-12). Last in the row, so the four icons keep the order
                readers already know. */}
            {showPredict && predictFn && (
              <button
                type="button"
                className="viz-btn viz-predict-toggle"
                data-viz-predict=""
                aria-pressed={predictOn ? 'true' : 'false'}
                title="Predict each step before it happens"
                disabled={!ready}
                onClick={() => setPredict(!sessionRef.current.predictOn)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9"></circle>
                  <circle
                    className="viz-predict-toggle__dot"
                    cx="12"
                    cy="12"
                    r="4.5"
                    fill="currentColor"
                    stroke="none"
                  ></circle>
                </svg>
                <span>Predict</span>
              </button>
            )}
          </div>

          <div className="viz-scrub">
            <label htmlFor={stepId} className="viz-scrub__label">
              Step
            </label>
            {/* `aria-disabled` while predicting, with the note as the stated
                reason — never `disabled`, which would drop a focused control's
                focus on `<body>`. The handler declines and the controlled value
                puts the thumb back where the trace actually is. VD-4: one
                custom property drives the track's elapsed fill. */}
            <input
              type="range"
              id={stepId}
              className="viz-slider"
              min="0"
              max={String(Math.max(length - 1, 0))}
              step="1"
              value={String(index)}
              disabled={!ready}
              data-viz-slider=""
              aria-valuetext={`Step ${index + 1} of ${length}`}
              aria-disabled={
                session.stripBuilt ? (predictOn ? 'true' : 'false') : undefined
              }
              aria-describedby={predictOn ? predictNoteId : undefined}
              style={
                ready
                  ? ({
                      '--viz-progress': `${progress.toFixed(2)}%`,
                    } as CSSProperties)
                  : undefined
              }
              onChange={(event) => {
                if (sessionRef.current.predictOn) return;
                storeRef.current?.player.seek(Number(event.target.value));
              }}
            />
            {/* The bootstrap writes "…" here before activation (the loading
                state); the server rendered a dash pair — hence the one
                suppressed hydration warning. */}
            <span
              className="viz-counter"
              data-viz-counter=""
              aria-hidden="true"
              suppressHydrationWarning
            >
              {ready ? `${index + 1} / ${length}` : '– / –'}
            </span>
          </div>

          <div className="viz-speed">
            <label htmlFor={speedId} className="viz-speed__label">
              Speed
            </label>
            <select
              id={speedId}
              className="viz-select"
              data-viz-speed=""
              disabled={!ready}
              value={String(snapshot?.speed ?? 1)}
              onChange={(event) => {
                const value = event.target.value;
                storeRef.current?.setSpeed(Number(value));
                storeSpeed(value);
                // One preference, N islands: tell the siblings.
                document.dispatchEvent(
                  new CustomEvent(SPEED_EVENT, { detail: value }),
                );
              }}
            >
              {SPEED_OPTIONS.map((option) => (
                <option value={String(option)} key={option}>
                  {`${option}×`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* The STATED REASON behind everything predict makes unavailable,
            named by `aria-describedby` on the two transport controls while it
            is on. It also carries the reason the RUN TABLE is gone (Plan C §4):
            a table that vanished with no explanation reads as a bug. */}
        {showPredict && (
          <p
            className="viz-predict-note"
            id={predictNoteId}
            data-viz-predict-note=""
            hidden={!predictOn}
          >
            Auto-play and scrubbing are off while Predict is on, and the run
            table is hidden — it would give the next step away. Step forward
            moves on without answering.
          </p>
        )}

        {/* Discoverability: inside `.viz-controls`, so the noscript
            kill-switch hides it with every other JS-only affordance. */}
        <p className="viz-keys">
          <kbd>Space</kbd> play/pause
          <span className="viz-keys__dot" aria-hidden="true">
            ·
          </span>
          <kbd>←</kbd>/<kbd>→</kbd> step
        </p>

        {/* The custom-input form is a DISCLOSURE (redesign 2026-08): on a
            phone the form was 300 of the controls' 550px, and in a bench's
            pinned stage column the whole instrument has to fit one viewport. */}
        {allowCustomInput && (
          <details className="viz-custom-open">
            <summary>
              <svg
                className="viz-custom-open__chevron"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6"></path>
              </svg>
              {/* NAMED, because a lesson can host three instruments and three
                  identical summaries are three indistinguishable controls in a
                  screen reader's list (CNT-8). */}
              <span>{`Run it on your own input — ${title}`}</span>
            </summary>
            <form
              className="viz-custom"
              data-viz-form=""
              noValidate
              onSubmit={onSubmit}
            >
              <div className="viz-custom__fields">
                <div className="viz-field">
                  <label htmlFor={arrayId}>{inputLabel}</label>
                  {/* INP-1: code-shaped literals, so autocorrect, leading
                      capitals and spell squiggles are noise. SPACE-SEPARATED
                      describedby: format first, then what went wrong. */}
                  <input
                    type="text"
                    id={arrayId}
                    data-viz-array=""
                    placeholder={arrayPlaceholder}
                    aria-describedby={helpText ? `${helpId} ${errId}` : errId}
                    aria-invalid={
                      inputError?.field === 'input' ? 'true' : undefined
                    }
                    spellCheck="false"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={!ready}
                    ref={arrayRef}
                  />
                </div>
                {showTarget && (
                  <div className="viz-field viz-field--target">
                    <label htmlFor={targetId}>{targetLabel}</label>
                    <input
                      type="text"
                      id={targetId}
                      data-viz-target=""
                      inputMode="numeric"
                      placeholder={targetHint}
                      aria-describedby={errId}
                      aria-invalid={
                        inputError?.field === 'target' ? 'true' : undefined
                      }
                      spellCheck="false"
                      autoCapitalize="none"
                      autoCorrect="off"
                      disabled={!ready}
                      ref={targetRef}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-secondary"
                  data-viz-run=""
                  disabled={!ready}
                >
                  Run
                </button>
                {/* Recovery (CMP-14): only offered when there IS an authored
                    input; a viz seeded from defaultInput() has no string to
                    restore and the control would lie about what it does. */}
                {rawInput && (
                  <button
                    type="button"
                    className="btn-secondary"
                    data-viz-restore=""
                    disabled={!ready}
                    onClick={onRestore}
                  >
                    Restore example
                  </button>
                )}
              </div>
              {/* Persistent format + cap disclosure (INP-*). Muted, not an
                  error: the same text before and after a mistake. */}
              {helpText && (
                <p className="viz-custom__help" id={helpId}>
                  {helpText}
                </p>
              )}
              {/* role="status" (implicit aria-live="polite"): this error is
                  the direct result of the reader's own submit, so it queues
                  behind whatever the AT is saying (A11Y-8). The text is blanked
                  when hidden: a hidden node that aria-describedby names
                  DIRECTLY still contributes to the description (accname
                  §4.3.2 step 2A). */}
              <p
                className="viz-error"
                id={errId}
                role="status"
                data-viz-error=""
                hidden={inputError === null}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3 2 20h20z"></path>
                  <path d="M12 10v4"></path>
                  <path d="M12 17h.01"></path>
                </svg>
                <span data-viz-error-text="">{inputError?.message ?? ''}</span>
              </p>
            </form>
          </details>
        )}
      </div>

      {/* THE KEY — the legend and the counters — BELOW the transport
          (redesign 2026-08): in a bench's pinned stage column 88px of key above
          the transport pushed Play below the fold at 1440x900. OUTSIDE
          `.viz-controls`, deliberately: the legend explains the colours of the
          STILL as much as of the live drawing, so it survives the JS-off
          kill-switch. */}
      <div className="viz-key">
        {/* Auto-legend: one pill per highlight kind this trace really uses.
            The swatch repeats the renderer's own token + tint, the glyph is
            the character the renderer draws, and the word is the plain-
            language name — colour is never the only signal. */}
        {authored.legend.length > 0 && (
          <ul
            className="viz-legend"
            role="list"
            aria-label="What the highlights mean"
            data-viz-legend=""
          >
            {authored.legend.map((item) => (
              <li className="viz-pill viz-legend__item" key={item.kind}>
                <span
                  className="viz-legend__swatch"
                  data-kind={item.kind}
                  style={
                    { '--legend-hl': `var(${item.token})` } as CSSProperties
                  }
                  aria-hidden="true"
                ></span>
                {item.glyph && (
                  <span className="viz-legend__glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                )}
                <span>{item.word}</span>
              </li>
            ))}
          </ul>
        )}
        {/* A11Y-2: exposed, not aria-hidden — the pills are a SIBLING of the
            aria-live explanation, so screen-reader users can read the counts
            on demand without the live region re-announcing them every step. */}
        {showMetrics && (
          <div className="viz-metrics" data-viz-metrics="">
            {pills.map((pill) => (
              <span className="viz-pill" key={pill.label}>
                {pill.label}
                <b>{pill.value}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* The ledger closes the instrument, and DOM order IS the visual order:
          drawing, sentence, transport, key, the run. OUTSIDE `.viz-controls`
          on purpose — with JavaScript off this table IS the lesson. */}
      {ledger && (
        <Ledger
          ledger={ledger}
          uid={uid}
          label={title}
          current={ready ? index : null}
          hidden={ledgerHidden(session)}
          onSeek={onSeek}
          onSeekKey={onSeekKey}
          wellRef={wellRef}
        />
      )}

      <p className="viz-nojs-note">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 16v-4"></path>
          <path d="M12 8h.01"></path>
        </svg>
        <span>
          Enable JavaScript to play, step, and run this on your own input.
        </span>
      </p>
    </>
  );
}
