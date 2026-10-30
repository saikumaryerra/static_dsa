/**
 * The Final Run card, hydrated (M8.3; React migration plan §5 P2 WS-I step 7).
 *
 * `FinalRun.tsx` is the server wrapper: it computes the answer at BUILD time
 * from the lesson's pinned run and renders the `<div class="final-run">`
 * container through `<Island>`. This is what goes inside it — rendered once on
 * the server from serialized props, then hydrated when the card scrolls near
 * the viewport.
 *
 * NO FIRST-TRY BONUS AND NO ATTEMPT COUNT — killed in the design's ethics
 * review, so this is a rule and not a simplification: loss-framing the errorful
 * first attempt destroys the testing-effect value it decorates (Kornell &
 * Metcalfe), and beginners respond by peeking before committing. Nothing here
 * counts attempts, in storage or in memory; a miss shows the real number
 * immediately (hypercorrection — a surprising correction right after a
 * confident error is when it sticks), the escape hatch is visible from the
 * start, and clearing it reads identically however many tries it took.
 *
 * A cleared Final Run is the third Practiced path, so it calls `recordPass()`
 * in `src/lib/progress.ts` — the single promotion path, which owns the 3-day
 * Mastered gate. A re-visit re-asks the question instead of showing the
 * answer: on a review visit, getting it again IS the re-pass the ladder needs.
 */
import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { useDeviceValue, useLive } from '../client/use-device-value';
import { isFinalRunCleared, markFinalRunCleared } from '../lib/challenges';
import { recordPass } from '../lib/progress';
import { PROGRESS_CHANGED_EVENT } from '../lib/progress-events';

/** The props the server serializes and the browser hydrates with. */
export interface FinalRunIslandProps {
  /** The lesson that owns the storage record. */
  slug: string;
  /**
   * The answer, computed at build from the same run the player walks through.
   * It is in the page because the check happens on the reader's device and
   * there is no server. Nothing is hidden from a reader determined to look,
   * and nothing needs to be: peeking only costs them the prediction.
   */
  answer: number;
  /** "14 comparisons" — composed at build through the trial cards' vocabulary. */
  answerText: string;
  /** How the algorithm is named in the question. */
  label: string;
  /** The pinned input the question is about. */
  input: string;
  /** The counter's plural noun ("comparisons"). */
  noun: string;
  /** Where "Watch it happen" points — the instrument, resolved at build. */
  target: string;
  /** Ids minted by the wrapper (islands render without context). */
  promptId: string;
  inputId: string;
  statusId: string;
  /** Client only: the card's own root, handed in by the bootstrap. */
  container?: HTMLElement;
}

/**
 * One Final Run card's contents.
 *
 * @param props - See {@link FinalRunIslandProps}.
 * @returns The card's children.
 */
export default function FinalRunIsland({
  slug,
  answer,
  answerText,
  label,
  input,
  noun,
  target,
  promptId,
  inputId,
  statusId,
  container,
}: FinalRunIslandProps): JSX.Element {
  /**
   * Hydrated: every control ships `disabled` (the Visualizer's A3 pattern) so
   * a submit that lands before the script would not reload the page — this
   * form has no action.
   */
  const live = useLive();
  /** The one line the reader is told; written only from a click or a submit. */
  const [said, setSaid] = useState('');
  /** The anchor into the visualization, offered once there is a reason to. */
  const [watch, setWatch] = useState(false);
  /** Cleared during this visit. */
  const [clearedNow, setClearedNow] = useState(false);
  /**
   * Whether this device had already cleared the card when the page loaded —
   * read once, after hydration. The persistent line reveals for that case
   * only: a returning reader meets no announcement, and no answer given away,
   * so a review visit still gets to predict it.
   */
  const [readStoredOnce] = useState(() => {
    let stored: boolean | undefined;
    return (): boolean => (stored ??= isFinalRunCleared(slug));
  });
  const clearedLine = useDeviceValue(readStoredOnce, false);
  const field = useRef<HTMLInputElement>(null);

  /**
   * Has this card put the answer on screen since the page loaded?
   *
   * THE EARNING RULE, in full. Clearing is free, unlimited and identical
   * however many tries it took — the card says "cleared" either way, stores
   * the same `ld:finalrun:v1` record either way, and says the same sentence
   * either way. What this flag gates is the one thing that is not free:
   * `recordPass()`, which mints **Practiced**. Practiced (with Mastered) is an
   * EARNED count, shown beside the self-reported Learned one precisely because
   * it is evidence of retrieval, and it also seeds the spaced review queue. A
   * miss hands the reader the real number (hypercorrection — that is the
   * point) and "Show the answer" hands it over with no miss at all, so typing
   * that number back is transcription, not retrieval: the card clears, and the
   * product declines to claim on the reader's behalf something it just told
   * them.
   *
   * NOT a first-try bonus and NOT an attempt count — both killed
   * (`docs/m8-gamification.md`), and this is neither. Nothing is added for
   * being early, nothing is deducted for missing, no attempt is counted here
   * or in storage, and the reader is never told, scored or shown a difference.
   *
   * And it costs them nothing they cannot recover: the flag is in memory for
   * this page VISIT only (never `sessionStorage`, which spec §6 forbids, and
   * never a stored key), a cleared card deliberately withholds the answer on a
   * later visit so the question can be predicted again, and the other two
   * Practiced paths are untouched.
   */
  const shown = useRef(false);

  // Marks the card cleared on its root (`data-cleared`). Never reversed — no
  // stage goes down.
  useEffect(() => {
    if (clearedLine || clearedNow) {
      container?.setAttribute('data-cleared', 'true');
    }
  }, [clearedLine, clearedNow, container]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const raw = (field.current?.value ?? '').trim();
    const guess = Number(raw);
    if (raw.length === 0 || !Number.isInteger(guess)) {
      // Not a miss and not a mark against anyone: there is simply nothing to
      // check yet.
      setSaid('Type a whole number to check it.');
      return;
    }
    if (guess !== answer) {
      // Hypercorrection: the real number arrives immediately, beside the
      // invitation to watch it happen. What handing the number over ends is
      // the RETRIEVAL claim for this visit, and only that (see `shown`).
      shown.current = true;
      setSaid(`Not quite — the answer is ${answerText}.`);
      setWatch(true);
      return;
    }
    // Cleared. `recordPass` is the ONE promotion path, so this component
    // decides nothing about mastery; calling it again on a second correct
    // answer in the same visit is a no-op. `!shown` is the earning rule above.
    const saved = markFinalRunCleared(slug);
    if (slug && !shown.current) {
      recordPass(slug);
      // The stage this may have just changed is painted by other modules (the
      // lesson header's pips), so say so and let each re-read storage itself.
      document.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT));
    }
    setClearedNow(true);
    // The storage write is allowed to fail (private mode): the result still
    // stands for this visit, and only the "saved" half of the sentence is
    // withheld rather than claiming a save that did not happen.
    setSaid(
      saved
        ? `That's it — ${answerText}. Saved on this device only.`
        : `That's it — ${answerText}.`,
    );
    setWatch(true);
  };

  const onReveal = (): void => {
    // The escape reveals and nothing more: it does not clear the Final Run,
    // because the reader has not predicted anything — and it costs nothing,
    // because this system has no penalty to charge. It does put the answer on
    // screen, so the retrieval claim for this visit goes with it.
    shown.current = true;
    setSaid(`The answer is ${answerText}.`);
    setWatch(true);
  };

  return (
    <>
      <p className="final-run__kicker">Final run</p>

      <p className="final-run__prompt" id={promptId}>
        <b>{label}</b> on <code>{input}</code>
        {` — how many ${noun}?`}
      </p>

      <p className="final-run__lead">Work it out before you run it.</p>

      <form
        className="final-run__form"
        data-final-run-form=""
        noValidate
        onSubmit={onSubmit}
      >
        <div className="final-run__field">
          <label htmlFor={inputId}>Your prediction</label>
          <input
            type="text"
            id={inputId}
            inputMode="numeric"
            data-final-run-input=""
            aria-describedby={statusId}
            spellCheck="false"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={!live}
            ref={field}
          />
        </div>
        <button
          type="submit"
          className="btn-secondary"
          data-final-run-check=""
          disabled={!live}
        >
          Check
        </button>
        {/* The escape, visible from the start and never rationed: a reader who
            does not want to guess must not have to guess wrong to move on. */}
        <button
          type="button"
          className="btn-secondary"
          data-final-run-reveal=""
          disabled={!live}
          onClick={onReveal}
        >
          Show the answer
        </button>
      </form>

      {/* Ships with no words and is written only after the reader acts, so
          nothing is announced on load; an unchanged string is never rewritten
          (CMP-4). `is-said` carries the line's top margin. */}
      <p
        className={said ? 'final-run__status is-said' : 'final-run__status'}
        id={statusId}
        role="status"
        data-final-run-status=""
      >
        {said}
      </p>

      {/* Revealed beside a miss or a reveal. Revealing hidden content
          announces nothing, which keeps the announcement to the one sentence
          that changed. */}
      <p className="final-run__watch" data-final-run-watch="" hidden={!watch}>
        <a href={target}>Watch it happen</a>
      </p>

      {/* The hypercorrection framing, and ONLY that. Do not add "There is no
          attempt count here.": announcing that nothing is counted makes
          counting the subject (and the calm-invariant test catches it). */}
      <p className="final-run__note">
        A miss is the useful part — the real number sticks harder after a guess
        than after a peek.
      </p>

      {/* The persistent state, revealed for a lesson already cleared on this
          device — deliberately WITHOUT the answer, so a review visit still
          gets to predict it. */}
      <p
        className="final-run__cleared"
        data-final-run-cleared=""
        hidden={!clearedLine}
      >
        Cleared on this device.
      </p>
    </>
  );
}
