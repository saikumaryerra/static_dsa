/**
 * The Trace Trial card, hydrated (M8.3; React migration plan §5 P2 WS-I step 7).
 *
 * `Challenge.tsx` is the server wrapper: it runs the build guard and renders
 * the `<div class="challenge">` container through `<Island>`. This is what
 * goes inside it — rendered once on the server from serialized props, then
 * hydrated when the main thread is idle.
 *
 * HOW IT IS CLEARED, AND WHY IT ADDS NO INPUT OF ITS OWN: the reader crafts an
 * input in the visualization's custom-input box. The Visualizer island
 * dispatches a bubbling `viz:run` CustomEvent `{ algorithmId, input,
 * finalStep }` on a successful run (spec §11.3, M8 amendment) and this card
 * grades THAT step. It never re-runs the algorithm the reader just ran —
 * trials consume the precomputed trace, they do not fork the pipeline. The one
 * exception is a `duel` rule's rival, which is a run the island never made: the
 * card loads the registry itself and runs only the rival.
 *
 * A RUN MADE BEFORE THIS CARD ACTIVATED STILL COUNTS. The legacy card listened
 * from page load; an idle-activated island does not exist yet when a fast
 * reader submits. So the registry entry's `prepare` starts listening at page
 * load and buffers what it hears (`src/client/island-registry.ts`), and this
 * component drains that buffer on activation through the {@link VizRunChannel}
 * it is handed.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 * - **Time anything.** No clock, no countdown, no "fastest" (2.2.1, and
 *   beginner anxiety — timed challenges are on the design's killed list).
 * - **Keep score.** No attempt count, no clear-rate, no "n of N collected"; the
 *   status line reports what a run DID, in the algorithm's own units, and a run
 *   that does not clear the trial costs nothing at all.
 * - **Earn mastery.** Clearing writes `ld:challenges:v1` and stops there. The
 *   three Practiced paths are the practice checks, a predict session and a
 *   cleared Final Run; a trial is enrichment, not a promotion.
 * - **Ration the hint.** It is always present, in a native `<details>`.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  evaluateRules,
  factsFrom,
  metricsOf,
  metricsSentence,
  rivalIds,
  runFinalStep,
} from '../lib/challenges';
import type { AlgorithmLoader, ChallengeRule } from '../lib/challenges';
import {
  isChallengeCleared,
  markChallengeCleared,
  type VizRunDetail,
} from '../lib/enrichment-store';
import { useDeviceValue } from '../client/use-device-value';

/**
 * The runs a card hears: those heard before it activated, then every later
 * one. `listen` replays the buffer to `handler` first and returns the
 * unsubscribe.
 */
export interface VizRunChannel {
  listen(handler: (detail: VizRunDetail) => void): () => void;
}

/** The props the server serializes and the browser hydrates with. */
export interface ChallengeIslandProps {
  /** `{lessonSlug}/{challenge-slug}` — the storage id. */
  id: string;
  /** Only a run of THIS algorithm can clear it. */
  algorithm: string;
  /** The trial's rules, from `src/lib/challenges.ts`. */
  rules: readonly ChallengeRule[];
  title: string;
  prompt: string;
  hint: string;
  /** A pinned array as copyable code, or `null`. */
  pinnedText: string | null;
  /** The title's id — minted by the wrapper; the container is labelled by it. */
  titleId: string;
  /** Client only: the run hand-off from the registry's `prepare`. */
  runs?: VizRunChannel;
  /** Client only: the card's own root, handed in by the bootstrap. */
  container?: HTMLElement;
}

/**
 * The registry, fetched only when a `duel` rule actually needs a rival run. A
 * trial without one never downloads it — and on a lesson page the chunk is
 * already there, because the visualizer above imported it.
 */
const loadAlgorithm: AlgorithmLoader = (id) =>
  import('../viz/registry').then((registry) => registry.loadAlgorithm(id));

/**
 * Whether a `viz:run` payload carries every field grading reads. It crosses an
 * event boundary this card does not own, so a malformed detail is ignored
 * rather than thrown on.
 */
function isRunDetail(detail: unknown): detail is VizRunDetail {
  const d = detail as Partial<VizRunDetail> | null;
  return (
    !!d &&
    typeof d.algorithmId === 'string' &&
    typeof d.input === 'string' &&
    !!d.finalStep
  );
}

/**
 * One Trace Trial card's contents.
 *
 * @param props - See {@link ChallengeIslandProps}.
 * @returns The card's children.
 */
export default function ChallengeIsland({
  id,
  algorithm,
  rules,
  title,
  prompt,
  hint,
  pinnedText,
  titleId,
  runs,
  container,
}: ChallengeIslandProps): JSX.Element {
  /** The one status line; written only after a run the READER triggered. */
  const [said, setSaid] = useState('');
  /** Cleared during this visit. */
  const [clearedNow, setClearedNow] = useState(false);
  /**
   * Whether this device had already cleared the trial when the page loaded —
   * read once, after hydration (`useDeviceValue`), and never again: clearing
   * it during this visit writes the status line, not this one.
   */
  const [readStoredOnce] = useState(() => {
    let stored: boolean | undefined;
    return (): boolean => (stored ??= isChallengeCleared(id));
  });
  const clearedLine = useDeviceValue(readStoredOnce, false);
  const cleared = clearedLine || clearedNow;
  /** Once true, this card ignores every later run: nothing ever un-clears. */
  const done = useRef(false);

  // Marks the card cleared on its root (`data-cleared`, which the stylesheet
  // and the mastery surfaces read). Never reversed — no trial decays.
  useEffect(() => {
    if (cleared) container?.setAttribute('data-cleared', 'true');
  }, [cleared, container]);

  useEffect(() => {
    // Already cleared on this device: the server-rendered line is revealed
    // (above) rather than a line written, so a returning reader hears no
    // announcement — and every run, buffered ones included, is ignored.
    done.current ||= readStoredOnce();

    /**
     * Grades one finished run. Rival runs (duel rules) are resolved first,
     * because they are the only facts the island cannot supply.
     */
    const grade = async (detail: VizRunDetail): Promise<void> => {
      const rivals: Record<string, Record<string, number>> = {};
      for (const rival of rivalIds(rules)) {
        try {
          rivals[rival] = metricsOf(
            await runFinalStep(rival, detail.input, loadAlgorithm),
          );
        } catch {
          // A rival chunk that will not load, or an input its parser rejects:
          // the duel cannot be judged, so the trial stays open. Failing closed
          // is the honest outcome — nothing is claimed either way.
          return;
        }
      }
      const facts = factsFrom(detail, rivals);
      const sentence = metricsSentence(facts.metrics);
      if (!evaluateRules(rules, facts)) {
        // ACTIVITY, never a verdict about the reader: "not yet" is a state of
        // the puzzle, not a mark against the person. No attempt is counted.
        setSaid(
          sentence
            ? `Not yet — that run made ${sentence}.`
            : 'Not yet — that run did not meet it.',
        );
        return;
      }
      // Cleared. The storage write is allowed to fail (private mode): the
      // card still shows the result for this visit, and only the "saved" half
      // of the sentence is withheld.
      const saved = markChallengeCleared(id);
      done.current = true;
      setClearedNow(true);
      setSaid(
        saved
          ? `Cleared — that run made ${sentence}. Saved on this device only.`
          : `Cleared — that run made ${sentence}.`,
      );
    };

    if (!runs || rules.length === 0) return;
    return runs.listen((detail) => {
      // A cleared trial ignores every later run, and only a run of this
      // card's algorithm can clear it.
      if (!isRunDetail(detail) || done.current) return;
      if (detail.algorithmId !== algorithm) return;
      void grade(detail);
    });
  }, [id, algorithm, rules, runs, readStoredOnce]);

  return (
    <>
      <p className="challenge__kicker">Trace trial</p>
      <p className="challenge__title" id={titleId}>
        {title}
      </p>
      <p className="challenge__prompt">{prompt}</p>

      {/* A pinned array is rendered as copyable code: the trial asks the
          reader to vary something else about the run, so they must be able to
          paste the array back exactly. */}
      {pinnedText && (
        <p className="challenge__pinned">
          Keep this array: <code>{pinnedText}</code>
        </p>
      )}

      {/* Native `<details>`, so the hint is keyboard-operable and needs no
          script of its own. Not `Collapsible`: that component's keyline is
          drawn for prose sections, and inside a card it reads as a divider
          that means nothing. */}
      <details className="challenge__hint">
        <summary>{`Hint for ${title}`}</summary>
        <p>{hint}</p>
      </details>

      <p className="challenge__how">
        Craft an input in <b>Try your own input</b> on the visualization, then
        press Run.
      </p>

      {/* Ships with no words and is written only after a run the READER
          triggered, so nothing is announced on load. It stays in the DOM from
          the start because a live region has to exist before its first
          population for the announcement to fire reliably. An unchanged string
          is never rewritten (React writes nothing), because re-announcing a
          sentence already heard reads as a stutter (M7.1 CMP-4). `is-said`
          carries the line's top margin, so it cannot depend on a whitespace
          text node. */}
      <p
        className={said ? 'challenge__run is-said' : 'challenge__run'}
        role="status"
        data-challenge-run=""
      >
        {said}
      </p>

      {/* The persistent state, server-rendered and revealed for a trial
          already cleared on this device. Static text rather than a scripted
          write: revealing hidden content announces nothing. */}
      <p
        className="challenge__cleared"
        data-challenge-cleared=""
        hidden={!clearedLine}
      >
        Cleared on this device.
      </p>
    </>
  );
}
