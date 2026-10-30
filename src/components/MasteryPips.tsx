/**
 * MasteryPips — the one progress currency, drawn: Learned → Practiced →
 * Mastered (M8.1; spec §8 "the done-checkmark becomes the first of three
 * mastery pips", §9; design in `docs/m8-gamification.md`). Ported from
 * `MasteryPips.astro` (React migration P2); CSS in
 * `src/styles/components/mastery-pips.css`.
 *
 * Props:
 * - `slug`        the lesson whose stage this instance shows; it rides on the
 *                 `data-mastery-pips` hook itself. The component reads nothing —
 *                 the slug is here for the HOST island, which resolves the stage
 *                 through `src/lib/progress.ts` and calls `paintPips()`
 *                 (`src/lib/mastery-ui.ts`).
 * - `labelHidden` keep the stage word for screen readers only (`sr-only`).
 *                 `LessonCard` sets it: its top row is a dense chip row, and the
 *                 word still reaches assistive tech through the link's content.
 *                 Default false — the lesson header shows the word.
 * - `killSwitch`  whether this instance emits the `<noscript>` block. Default
 *                 true; a host that renders pips INSIDE an `<a>` (`LessonCard`)
 *                 sets it false and emits the identical rule outside the link,
 *                 because `<style>` is metadata content and has no business
 *                 inside phrasing content. The rule is global (`.mastery-pips`),
 *                 so one block anywhere on the page kills every instance.
 * - `gateNote`    whether this instance carries the 3-day gate's one-line
 *                 explanation (shown only at Practiced — see below). Defaults to
 *                 `!labelHidden`, so the instance that shows the stage WORD
 *                 explains the next stage and the dense card chip row does not:
 *                 a sentence repeated on fifteen cards is noise, and the card
 *                 already sits on the page whose legend explains all three
 *                 stages.
 *
 * THE 3-DAY GATE EXPLAINS ITSELF (`docs/m8-gamification.md`: the gate "always
 * explains itself in one line"). Mastered is earned by re-meeting the Practiced
 * bar at least `MASTERY_GATE_DAYS` days later. A reader who is never told that
 * meets a third pip they cannot fill and no reason why, which reads as
 * manufactured scarcity rather than as the spacing effect it is. So the line
 * renders exactly where the reader can see they are at Practiced and not yet
 * Mastered, from the SAME constant the store enforces the gate with, and it is
 * an explanation and not a lockout: it names no date of its own and it never
 * counts down (a ticking "ready in 2 days" is on the killed list).
 *
 * NO STATE OF ITS OWN, BY DESIGN. The pips ship with no `data-stage`, and the
 * component's CSS shows them only when that attribute is present, so:
 * - with JS off nothing renders (plus the `<noscript>` kill-switch above, which
 *   every M8 component ships), and the page is exactly what M7 shipped;
 * - with storage blocked the host resolves `none` and the pips stay absent —
 *   absent, never broken, and never a wrong stage;
 * - a reset repaints through the same one function, so no stale row survives it.
 * Painting from the host island (rather than a script here) is also what keeps
 * `/learn` honest: ONE function there sets the card attribute AND the track
 * ring from one read, instead of two scripts racing over the same keys (Astro
 * guaranteed no execution order between a page script and a component script,
 * and two client modules are no better).
 *
 * A11Y: the pips are `aria-hidden` decoration and the label is the whole
 * accessible signal, so a stage is never carried by colour (§12). It is never
 * carried by colour VISUALLY either: a filled pip differs from an empty one in
 * shape — pip 1 gains the check glyph `LessonCard` already used (the M7 mental
 * model survives the change), pips 2 and 3 gain a solid dot inside their ring —
 * which survives forced-colours mode and every form of colour blindness.
 * Deliberately NOT a live region and never `aria-label`led: it is a derived
 * display, and the acts that change it (MarkComplete's `aria-pressed`,
 * PracticeCheck's tally) already announce themselves.
 */
import type { JSX } from 'react';
import { PIPS_KILL_SWITCH } from '../lib/mastery-ui';
import { MASTERY_GATE_DAYS } from '../lib/progress';

/** Props of `MasteryPips`. */
export interface MasteryPipsProps {
  slug: string;
  labelHidden?: boolean;
  killSwitch?: boolean;
  gateNote?: boolean;
}

/** One unearned-or-earned pip whose fill is a solid inner dot (pips 2 and 3). */
function DotPip(): JSX.Element {
  return (
    <svg
      className="mastery-pips__pip"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9"></circle>
      <circle
        className="mastery-pips__fill"
        cx="12"
        cy="12"
        r="5"
        fill="currentColor"
        stroke="none"
      ></circle>
    </svg>
  );
}

/**
 * The three mastery pips for one lesson (unpainted: a client module paints
 * them).
 *
 * @param props - See `MasteryPipsProps`.
 * @returns The pips and, by default, their `<noscript>` kill-switch.
 */
export default function MasteryPips({
  slug,
  labelHidden = false,
  killSwitch = true,
  gateNote = !labelHidden,
}: MasteryPipsProps): JSX.Element {
  // Composed at BUILD time from the store's own constant, so the sentence and
  // the rule it describes can never disagree: `masteryGateOpen()` compares
  // against this same number, and changing the gate rewrites this copy with it.
  const gateLine = `Mastery needs a return visit at least ${MASTERY_GATE_DAYS} days after your first pass — that's how memory consolidates.`;
  return (
    <>
      {/* The slug rides ON the hook attribute rather than in a `data-slug` of
          its own: `LessonCard` already carries `data-slug` for the same lesson,
          and a second element answering that selector would break every
          existing `[data-slug="…"]` query — including the /learn e2e suite's. */}
      <span className="mastery-pips" data-mastery-pips={slug}>
        {/* Pips and word on one line; the gate note (below) gets the next one.
            The grouping is what puts it there: the root is a COLUMN, so a
            sentence long enough to wrap cannot end up sitting beside the stage
            word in a host row that is sizing itself to its content. */}
        <span className="mastery-pips__stage">
          {/* Exactly three children: the fill rules select them by position. */}
          <span className="mastery-pips__row" aria-hidden="true">
            <svg
              className="mastery-pips__pip"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9"></circle>
              {/* Pip 1's fill IS the check LessonCard showed before M8 (same
                  24-unit path), so "checked off" still means what it meant in M7. */}
              <path className="mastery-pips__fill" d="M8 12l3 3 5-6"></path>
            </svg>
            <DotPip />
            <DotPip />
          </span>

          {/* Ships EMPTY: the stage is unknowable at build time, and a word
              rendered here would be a claim about a device the build cannot see. */}
          <span
            className={
              labelHidden
                ? 'mastery-pips__label sr-only'
                : 'mastery-pips__label'
            }
            data-mastery-label=""
          ></span>
        </span>

        {/* Static copy, rendered at build and revealed by CSS at exactly one
            stage — no script, no clock, no date arithmetic, and therefore
            nothing that can tick. A `<span>` and not a `<p>`: this component's
            root is phrasing content wherever it is used (`LessonCard` renders it
            inside an `<a>`), so nothing here may be flow-only. Not a live region:
            it explains a state the reader is already in, and the act that got
            them there announced itself. */}
        {gateNote && (
          <span className="mastery-pips__gate" data-mastery-gate="">
            {gateLine}
          </span>
        )}
      </span>

      {/* With JS off there is no stage to show — the pips are painted from
          localStorage by a client module — so the page falls back to exactly
          what M7 rendered. Belt and braces on top of the `[data-stage]` rule,
          which already hides them: a kill-switch must not depend on the very
          script it exists to cover. */}
      {killSwitch && (
        <noscript dangerouslySetInnerHTML={{ __html: PIPS_KILL_SWITCH }} />
      )}
    </>
  );
}
