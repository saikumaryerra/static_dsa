/**
 * PracticeCheck — a Practice answer wrapped in one-tap SELF-grading
 * (site spec §7 body-section 7 "Practice / check yourself", §9; M8.1, designed
 * in `docs/m8-gamification.md`). Ported from `PracticeCheck.astro` (React
 * migration P1 markup, P2 behaviour and CSS): the behaviour is the client module
 * `src/client/modules/practice-check.ts`, the CSS
 * `src/styles/components/practice-check.css`.
 *
 * Props:
 * - `slug`  the lesson that owns the storage record; pass `frontmatter.slug`
 *           from the MDX so a lesson rename can never leave a literal behind.
 * - `index` the question's number as the reader sees it — **1-based**, matching
 *           the "**1. …**" prose above it and the disclosure label below it. It
 *           is explicit precisely because it decides which stored self-grade the
 *           question owns: reordering questions is then an author-visible act
 *           rather than a silent re-keying of saved state. The script converts
 *           it once to the store's 0-based `checks[]` position.
 * - `total` how many questions this lesson's Practice section has. It is the
 *           denominator for both the tally and the Practiced bar, and `checks[]`
 *           alone cannot supply it.
 *
 * WHAT IT ADDS AROUND `Collapsible` (which is untouched — still a native
 * `<details>`, still keyboard-operable and fully readable with JS off):
 * - a retrieval prompt ABOVE the disclosure. It does not replace the `summary`,
 *   which keeps M7.1/CNT-8's per-question-unique "Show answer to question N"
 *   (that uniqueness was a WCAG 2.4.6 fix, so the label is derived from `index`
 *   here rather than left to authors to retype).
 * - inside the opened answer, two real buttons — "I had it" / "Not yet" — plus a
 *   quiet tally. The retrieval benefit comes from ATTEMPTING before revealing
 *   and then judging honestly whether you had it (Roediger & Karpicke;
 *   judgments of learning, Koriat), which is why the grade is self-reported and
 *   nothing here is ever machine-graded.
 *
 * "Not yet" costs nothing — in BEHAVIOUR and in WORDING. It stores an explicit
 * `0`, which earns nothing and takes nothing away: no stage is derived from a
 * `0`, and there is no state below "nothing recorded" for it to fall to. And
 * the tally beside it counts questions ANSWERED rather than questions passed, so
 * an honest "Not yet" moves that line forward instead of answering the reader
 * with a zero — the loss frame the design killed XP and streaks to avoid. No
 * score, no percentage, no ratio; mastery states are the only currency (see the
 * killed list in the design doc). Nor can a later "Not yet" undo a pass already
 * earned: `practicedAt` is stamped once by the store and never cleared, so a
 * regrade changes what this visit claims and no stage the reader reached.
 *
 * A11Y:
 * - Real `<button>`s at the shared 44px `.btn-secondary` target size, in a
 *   labelled `role="group"` so the pair reads as one question's answer.
 * - The chosen grade is carried by `aria-pressed` with a CONSTANT visible label
 *   (M7.1 CMP-12: renaming the label AND toggling pressed double-encodes the
 *   state), and never by colour alone — the pressed button fills its glyph's
 *   ring with a dot, which survives forced-colours mode and colour blindness.
 * - Exactly ONE polite live region per lesson (rendered by question 1, and
 *   OUTSIDE the `<details>` — a live region inside a closed disclosure is not
 *   rendered, and updates to a non-rendered region are not announced). It ships
 *   EMPTY so nothing is announced on load, and carries only the tally: the
 *   `aria-pressed` flip already announces the grade, and M7.1/CMP-4 showed a
 *   second announcement for one action reads as a stutter. It is rewritten only
 *   when the words actually CHANGE, so a click that moves the tally nowhere is
 *   not announced twice.
 *
 * JS-OFF: the buttons and the tally disappear via this component's own
 * `<noscript>` kill-switch (`Collapsible` has none of its own), leaving exactly
 * M7's read-the-answer flow plus the static prompt line.
 */
import type { JSX, ReactNode } from 'react';
import { useClientModule, useRenderContext } from '../render/context';
import Collapsible from './Collapsible';

/**
 * Kill-switch (mirrors MarkComplete): the grade buttons, the tally and the
 * live region are all JS-only, so with JS off the question falls back to
 * exactly M7's read-the-answer disclosure. Verbatim from the legacy component.
 */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors MarkComplete): the grade buttons, the tally and the
       live region are all JS-only, so with JS off the question falls back to
       exactly M7's read-the-answer disclosure. The prompt line above it is
       static copy that needs no script, so it deliberately stays.
       \`!important\` because a kill-switch must be unbeatable by any
       equal-specificity rule in the bundle (QA DEFECT-1). */
    .practice-check__footer,
    .practice-check__status {
      display: none !important;
    }
  </style>`;

/** The grade glyph: a ring, filled with a dot when pressed. */
function Glyph(): JSX.Element {
  return (
    <svg
      className="practice-check__glyph"
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
        className="practice-check__dot"
        cx="12"
        cy="12"
        r="4.5"
        fill="currentColor"
        stroke="none"
      ></circle>
    </svg>
  );
}

/**
 * One self-graded Practice question.
 *
 * @param props - Slug, 1-based index, total, and the answer.
 * @returns The check and its `<noscript>` kill-switch.
 * @throws At build time on an index or total that would mis-persist.
 */
export default function PracticeCheck({
  slug,
  index,
  total,
  children,
}: {
  slug: string;
  index: number;
  total: number;
  children?: ReactNode;
}): JSX.Element {
  const { uid } = useRenderContext();
  useClientModule('practice-check');
  // Fail the BUILD on an authoring slip rather than mis-persisting at runtime:
  // a stray index writes a check the Practiced predicate will never see again,
  // and a wrong denominator moves the bar for the whole lesson.
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(
      `PracticeCheck: index must be a whole number >= 1 (got ${index} in "${slug}").`,
    );
  }
  if (!Number.isInteger(total) || total < index) {
    throw new Error(
      `PracticeCheck: total must be a whole number >= index (got total ${total} for index ${index} in "${slug}").`,
    );
  }
  const askId = `pc-ask-${uid()}`;

  return (
    <>
      <div
        className="practice-check"
        data-practice-check=""
        data-slug={slug}
        data-index={index}
        data-total={total}
      >
        <p className="practice-check__prompt">
          Answer it in your head or on paper first.
        </p>

        <Collapsible summary={`Show answer to question ${index}`}>
          {children}

          <div className="practice-check__footer" data-practice-footer="">
            <p className="practice-check__ask" id={askId}>
              {`How did question ${index} go?`}
            </p>

            {/* Both buttons ship the real `disabled` attribute and are enabled
                by the module on load (the Visualizer's A3 pattern), so a click
                that lands before it runs cannot silently do nothing. */}
            <div
              className="practice-check__actions"
              role="group"
              aria-labelledby={askId}
            >
              <button
                type="button"
                className="btn-secondary practice-check__btn"
                data-practice-grade="had"
                aria-pressed="false"
                disabled
              >
                <Glyph />
                <span>I had it</span>
              </button>

              <button
                type="button"
                className="btn-secondary practice-check__btn"
                data-practice-grade="not"
                aria-pressed="false"
                disabled
              >
                <Glyph />
                <span>Not yet</span>
              </button>
            </div>

            {/* Revealed only once the store reports a grade actually on disk
                (MarkComplete's read-back rule): with storage blocked the
                buttons still respond for this visit, and claiming a save that
                did not happen would be a lie. The tally is `aria-hidden`
                because the live region below announces the same string; the
                device-scope sentence is NOT, so it is readable in every mode. */}
            <p className="practice-check__saved" data-practice-saved="" hidden>
              <span
                className="practice-check__tally"
                data-practice-tally=""
                aria-hidden="true"
              ></span>
              <span className="practice-check__scope">
                Saved on this device only.
              </span>
            </p>
          </div>
        </Collapsible>

        {/* One polite live region per lesson, rendered by the first question
            and shipped empty, OUTSIDE the <details> (a live region inside a
            closed disclosure is not rendered, so it would not announce). */}
        {index === 1 && (
          <p
            className="sr-only practice-check__status"
            role="status"
            data-practice-status=""
          />
        )}
      </div>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
