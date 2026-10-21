/**
 * LessonCard — one curriculum-index item (site spec §8, §9 component inventory).
 * Ported from `LessonCard.astro` (React migration P3); CSS in
 * `src/styles/components/lesson-card.css`.
 *
 * Props:
 * - `slug`             lesson slug; the whole card links to `/learn/{slug}` and
 *                      keys the progress reflect — the completion mark
 *                      (`lesson:{slug}:complete`) and the M8 mastery record
 *                      behind the pips.
 * - `order`            the lesson's global order number (§7 frontmatter).
 * - `title`            lesson title (rendered as the card heading).
 * - `summary`          one-line summary (§8).
 * - `difficulty`       "beginner" | "intermediate" — passed to DifficultyChip.
 * - `estimatedMinutes` reading estimate (§8).
 * - `headingLevel`     "h3" (default) so the card heading nests under the index's
 *                      section h2; overridable if a page's heading order differs.
 *
 * The whole card is a single `<a>` (only non-interactive content inside, so it
 * stays a valid link). Its progress state is hidden by default and revealed only
 * when the index page's progress island resolves a stage from localStorage — so
 * with JS off nothing shows and the card is fully usable (spec §6 local
 * "completed" state, §12 a11y).
 *
 * M8.1 — the done-checkmark becomes the three MASTERY PIPS. The check glyph is
 * unchanged, it is now pip 1's fill, so "checked off" still means what it meant
 * in M7 and the other two pips extend the same row (design in
 * `docs/m8-gamification.md`).
 *
 * // SPEC-GAP (§8): §8's M8 amendment names this swap ("the done-checkmark
 * becomes the first of three mastery pips") but does not say what the card's
 * sr-only STATUS TEXT becomes. It now carries the stage word ("Practiced")
 * rather than the fixed "Completed", because mastery states are the only
 * progress currency the product has. The text stays inside the link as CONTENT:
 * an `aria-label` on the `<a>` would REPLACE the card's accessible name and hide
 * the title and summary from screen-reader users — the whole card is the link,
 * so its content is its name.
 *
 * M7.3 CMP-1: the card said "link" to nobody — hover moved a 1px border and
 * nothing else, there was no pressed state, and the home track cards carried a
 * "→" convention these 15 contradicted. It now COMPOSES `.track-card`
 * (global.css) instead of restating a lookalike recipe, so the elevation model's
 * level 1 → 2 → pressed steps are defined once for both card families and cannot
 * drift again, and it ends with the same explicit "Start lesson →" affordance.
 */
import type { JSX } from 'react';
import { PIPS_KILL_SWITCH } from '../lib/mastery-ui';
import DifficultyChip from './DifficultyChip';
import MasteryPips from './MasteryPips';

/** Props of `LessonCard`. */
export interface LessonCardProps {
  slug: string;
  order: number;
  title: string;
  summary: string;
  difficulty: 'beginner' | 'intermediate';
  estimatedMinutes: number;
  headingLevel?: 'h2' | 'h3';
}

/**
 * One lesson card.
 *
 * @param props - See `LessonCardProps`.
 * @returns The card link and the pips' kill-switch.
 */
export default function LessonCard({
  slug,
  order,
  title,
  summary,
  difficulty,
  estimatedMinutes,
  headingLevel = 'h3',
}: LessonCardProps): JSX.Element {
  const Heading = headingLevel;
  return (
    <>
      <a
        href={`/learn/${slug}/`}
        className="track-card lesson-card"
        data-lesson-card=""
        data-slug={slug}
      >
        <div className="lesson-card__top">
          <span className="lesson-card__order" aria-hidden="true">
            {String(order).padStart(2, '0')}
          </span>
          {/* BADGE THE EXCEPTION (redesign 2026-08). Thirteen of the fifteen
              lessons are `beginner`, so a chip on every card spent a row of
              chrome saying the same word thirteen times and made the two that
              differ no easier to spot. This is the same reasoning that made the
              chips NEUTRAL in the first place (design-tokens-m1.md, Decision:
              "colouring thirteen beginner lessons as loudly as two intermediate
              ones would invert the exception they exist to signal") — carried
              one step further, from "do not shout it" to "do not say it when it
              is the default".

              Spec §19 lists this as needing designer sign-off; it has it, and
              the amendment is recorded in docs/redesign-2026-08/03-amendments.md.

              The LESSON PAGE keeps its chip unconditionally: a reader landing
              there from a search result has no comparison set in front of them,
              so the word is metadata rather than noise. The rule is about the
              grid, not the chip. */}
          {difficulty !== 'beginner' && (
            <DifficultyChip difficulty={difficulty} />
          )}
          {/* The wrapper is always in the DOM and always empty-width until the
              pips appear, so `margin-left: auto` right-aligns the stage from
              first paint and hydration cannot shift the row.
              `killSwitch={false}`: the identical rule is emitted below, OUTSIDE
              the link — a `<style>` belongs nowhere inside phrasing content. */}
          <span className="lesson-card__stage">
            <MasteryPips slug={slug} labelHidden killSwitch={false} />
          </span>
        </div>

        <Heading className="lesson-card__title">{title}</Heading>
        <p className="lesson-card__summary">{summary}</p>

        <div className="lesson-card__foot">
          <p className="lesson-card__meta">{`~${estimatedMinutes} min read`}</p>
          <span className="lesson-card__cta">
            Start lesson <span aria-hidden="true">→</span>
          </span>
        </div>
      </a>
      {/* MasteryPips' kill-switch, hosted here (and suppressed there) because
          this card renders the pips inside its `<a>`. Same shared rule, so the
          two can never disagree; global selector, so one block covers every
          card. The pips are ALSO hidden by their own `[data-stage]` rule, which
          no JS-off page can satisfy — this is the belt-and-braces half every M8
          component ships. */}
      <noscript dangerouslySetInnerHTML={{ __html: PIPS_KILL_SWITCH }} />
    </>
  );
}
