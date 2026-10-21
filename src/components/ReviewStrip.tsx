/**
 * ReviewStrip — the ready-to-review queue under `/learn`'s page head (spec §8
 * "M8.2 adds: a ready-to-review strip directly under the page head — at most two
 * cards, zero DOM when empty, never any 'overdue'/countdown vocabulary"; design
 * in `docs/m8-gamification.md`). Ported from `ReviewStrip.astro` (React
 * migration P3): the client module `src/client/modules/review-strip.ts` builds
 * it; the CSS is `src/styles/components/review-strip.css`.
 *
 * No props: the lessons it schedules over are the ones `/learn` already injects
 * for its progress island (`[data-lessons]` on the page head), so the strip
 * reads the same build-time list every other surface on the page does and there
 * is no second list to fall out of step. Placement follows from the same
 * attribute — the strip is inserted immediately after that element.
 *
 * THIS IS THE ONLY SURFACE IN THE PRODUCT THAT EVER PROMPTS THE READER. Every
 * other progress display is passive. That is why the design caps it at two
 * cards, why the copy is an invitation rather than an obligation, and why it
 * carries no count of days waited, no lateness, no countdown, no badge, no
 * `role="alert"` and no announcement: it is quiet furniture that happens to be
 * clickable. All of its words live in `REVIEW_COPY` (`src/lib/progress.ts`) so
 * the vocabulary ban is a unit test rather than a review habit.
 *
 * WHY IT RENDERS NOTHING SERVER-SIDE, NOT EVEN A SHELL: "empty ⇒ zero DOM" is a
 * tested calm invariant, not a preference. A reader with nothing due must not
 * meet an empty state, an "all caught up" badge, or a hidden container that
 * quietly tells them a queue exists — nothing here shames absence, and the
 * cheapest way to guarantee that is to have no markup to hide. Due-ness is a
 * question about `localStorage` anyway, which only the client can answer, so the
 * island below BUILDS the strip when there is something to offer and otherwise
 * leaves the page exactly as it shipped. The strip is structurally invisible
 * until a first `practicedAt` exists, which is what makes week one pure learning.
 *
 * WHY THE STYLES WERE `is:global` (and are namespaced still): Astro scoped a
 * component's CSS by stamping `data-astro-cid-*` onto the elements in ITS
 * TEMPLATE, and this component deliberately has none, so a scoped rule would
 * have matched nothing it draws. Every selector is therefore namespaced under
 * `.review-strip`, and
 * the card composes the shared `.track-card` recipe (global.css) rather than
 * restating a lookalike, so the elevation ladder and its hover/pressed steps
 * stay defined once for both card families. Nothing
 * here declares `border-color`, `background-color` or `box-shadow`: this block
 * is unlayered and would beat `@layer components`' state rules from the resting
 * state — the trap `LessonCard` documents.
 *
 * M8.3 — THE NOTE REPLAY. Where the reader left an Explain-it-back note on a due
 * lesson, the card is followed by their own sentence: "You wrote last time: …".
 * That replay IS the mechanic (elaborative interrogation pays off when you meet
 * your earlier explanation again and can check whether you still agree), and it
 * costs the queue nothing — the note is read from the same `progress:v1:{slug}`
 * record the schedule is already derived from, so no card, no key and no request
 * is added. A lesson with no note is offered in exactly the words it was before.
 *
 * The quote sits OUTSIDE the `<a>`, in the card's list item. A 280-character
 * sentence inside the link would become part of its accessible name, which is
 * how a "Binary Search — quick check" link turns into a paragraph a screen-reader
 * user has to sit through before they can decide to follow it.
 *
 * A11Y: a real `<section>` named by a real `<h2>`, so the strip is a landmark a
 * screen-reader user can skip past, sitting at the same heading level as the
 * track sections it precedes. The cards are ordinary links — the whole card is
 * the `<a>`, and its visible text is its accessible name (never an `aria-label`,
 * which would replace it). The arrow is `aria-hidden` decoration and no state is
 * carried by colour.
 */
import type { JSX } from 'react';
import { useClientModule } from '../render/context';

/** The legacy `<noscript>` kill-switch, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch, as every M8 component ships one. Belt-and-braces here: the
       strip only ever exists because the island created it, so a JS-off page
       cannot show one. The rule is what makes that structural fact
       unbreakable if the strip is ever server-rendered — and \`!important\`
       because a kill-switch must be unbeatable by any equal-specificity rule in
       the bundle (QA DEFECT-1). */
    .review-strip {
      display: none !important;
    }
  </style>`;

/**
 * The review strip's server half: its kill-switch, and the module that builds
 * the strip when something is due.
 *
 * @returns The `<noscript>` block.
 */
export default function ReviewStrip(): JSX.Element {
  useClientModule('review-strip');
  return <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />;
}
