/**
 * PracticeCheck — a Practice answer wrapped in one-tap SELF-grading (site spec
 * §7 body-section 7, §9; M8.1, designed in `docs/m8-gamification.md`).
 *
 * P1 PORT OF THE MARKUP ONLY (React migration plan §5 P1 step 7): the server
 * markup below is the legacy component's, element for element; the behaviour
 * (`src/client/modules/practice-check.ts`) and the CSS
 * (`src/styles/components/practice-check.css`) arrive in P2 with WS-C, which
 * then owns this file and carries over the rest of `PracticeCheck.astro`'s
 * design notes (retrieval practice, "Not yet" costs nothing, the a11y
 * contract).
 *
 * Props:
 * - `slug`  the lesson that owns the storage record; pass `frontmatter.slug`.
 * - `index` the question's number as the reader sees it — **1-based**. It
 *           decides which stored self-grade the question owns.
 * - `total` how many questions this lesson's Practice section has.
 *
 * JS-OFF: the buttons and the tally disappear via this component's own
 * `<noscript>` kill-switch (`Collapsible` has none of its own), leaving the
 * read-the-answer disclosure plus the static prompt line.
 */
import type { JSX, ReactNode } from 'react';
import { useRenderContext } from '../render/context';
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
                by the module on load, so a click that lands before it runs
                cannot silently do nothing. */}
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

            {/* Revealed only once the store reports a grade actually on disk;
                the tally is `aria-hidden` because the live region announces
                the same string. */}
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
