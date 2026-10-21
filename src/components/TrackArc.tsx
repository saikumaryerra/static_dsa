/**
 * TrackArc — M7.2's per-track counter, drawn (M8.1; spec §8 "the per-track
 * counter is drawn as a ring showing `N of M complete · Practiced n ·
 * Mastered n`", §9; design in `docs/m8-gamification.md`).
 * Ported from `TrackArc.astro` (React migration P3); CSS in
 * `src/styles/components/track-arc.css`.
 *
 * Props:
 * - `track` the track id (`foundations` | `algorithms`). It is also the
 *           `[data-track-progress]` hook `/learn`'s progress island fills, which
 *           is why this component is the SAME surface M7.2 shipped rather than a
 *           second counter beside it: same attribute, same island, same
 *           `src/lib/progress.ts` read — the ring and the two extra counts are
 *           all that is new.
 *
 * WHERE THE NUMBERS COME FROM: the island derives them from the build-injected
 * lesson list (`[data-lessons]`), never by scraping `[data-complete]` off the
 * cards. Nothing guarantees an execution order between two client modules
 * (Astro guaranteed none between a page and a component script), so reading
 * the cards would make the DOM a second source of
 * truth that can race the very function that writes it — and it would count
 * only what this page happens to render.
 *
 * The count line is never shown alone: "Mark as complete" is self-reported with
 * no learning precondition, so the earned Practiced/Mastered counts sit beside
 * it always (`docs/m8-gamification.md` — "the self-reported number is never
 * displayed alone"). Both lines carry no target, no streak and no countdown.
 *
 * WHAT THE RING DRAWS: the mastery states, not the completion marks. The design
 * calls the track ring "their macro rendering" (`docs/m8-gamification.md`, design
 * stance 2), and driving it from the self-reported count instead left a reader
 * who had genuinely practised looking at an empty ring. So it fills by earned
 * PIPS — one third of a lesson's slice per filled pip, exactly the pips the
 * cards below draw — and the two lines name the stages behind them. It stays
 * decoration for that text: it carries no value of its own, and every stage it
 * can show has a word beside it.
 *
 * SSR STATE: both lines ship EMPTY and the block ships `data-track-pending`,
 * because "0 of 9" is a claim about a device the build cannot see. It is hidden
 * with `visibility`, not `display`, so it holds its own height from first paint
 * and hydration shifts nothing (M7.2's layout-neutral-hydration rule). With JS
 * off the `<noscript>` kill-switch drops it from the flow entirely rather than
 * leaving a blank slot beside every track heading.
 *
 * STORAGE BLOCKED: the island swaps the pending attribute for
 * `data-track-unreadable` and writes no text at all. "0 of 9 done on this
 * device" is not the honest floor there — it is a claim about a store this
 * device refused to open, and the acceptance criterion is that the ring is
 * ABSENT rather than broken when storage is blocked. The two attributes are
 * distinct on purpose: `data-track-pending` alone would be indistinguishable
 * from an island that never ran, and proving "degraded, not died" is what the
 * degradation tests hang off.
 *
 * A11Y: the ring is `aria-hidden` decoration, and every number it is derived
 * from is stated as text beside it — colour is therefore never the only signal
 * (§12). It is deliberately not a `role="progressbar"`: that would make screen
 * readers say the same numbers twice and add an `aria-valuenow` free to go
 * stale, which the text twin cannot (the double-encoding M7.1 removed from
 * MarkComplete).
 */
import type { JSX } from 'react';
import { ARC_CIRCUMFERENCE, ARC_RADIUS } from '../lib/mastery-ui';

/** The legacy `<noscript>` kill-switch, verbatim. */
const NOSCRIPT = `<style>
    /* Kill-switch (every M8 component ships one). Without script the block can
       only ever hold its reserved space for a hydration that will never come,
       so drop it from the flow instead. \`!important\` because a kill-switch must
       be unbeatable by any equal-specificity rule in the bundle (QA DEFECT-1). */
    .track-arc {
      display: none !important;
    }
  </style>`;

/**
 * One track's ring and count lines (unpainted).
 *
 * @param props - The track id.
 * @returns The arc and its kill-switch.
 */
export default function TrackArc({ track }: { track: string }): JSX.Element {
  return (
    <>
      <div
        className="track-arc"
        data-track-progress={track}
        data-track-pending="true"
      >
        <svg
          className="track-arc__ring"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="track-arc__groove"
            cx="14"
            cy="14"
            r={ARC_RADIUS}
          ></circle>
          {/* The dash array is baked at BUILD time so the runtime writes exactly
              one attribute — the offset. It starts at a full offset (an empty
              ring), so the honest "nothing known yet" state is what the SVG
              draws even if the module never reaches it. The -90° rotation
              starts the sweep at 12 o'clock; `pathLength` is not used because
              the offset is computed from the same constant in
              `src/lib/mastery-ui.ts`. */}
          <circle
            className="track-arc__fill"
            data-track-ring=""
            cx="14"
            cy="14"
            r={ARC_RADIUS}
            strokeDasharray={ARC_CIRCUMFERENCE}
            strokeDashoffset={ARC_CIRCUMFERENCE}
            transform="rotate(-90 14 14)"
          ></circle>
        </svg>

        <div className="track-arc__text">
          <p className="track-arc__count" data-track-count=""></p>
          <p className="track-arc__mastery" data-track-mastery=""></p>
        </div>
      </div>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
