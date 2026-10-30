/**
 * MarkComplete — localStorage "done" toggle island (design §6.9, site spec §9).
 * Ported from `MarkComplete.astro` (React migration P2); CSS in
 * `src/styles/components/mark-complete.css`, behaviour in the client module
 * `src/client/modules/mark-complete.ts`.
 *
 * Props:
 * - `slug`    the lesson slug; persistence key is `lesson:{slug}:complete = "1"`
 *             (spec §6 *progress* key — cleared by the reset-progress control).
 * - `lessons` every published lesson, injected as JSON at build time so the
 *             saved-note can say "N of 15 complete" and the milestone below can
 *             filter this lesson's own track out of it. M7.2 rule: NEVER
 *             enumerate localStorage by key prefix — a stale
 *             `lesson:old-slug:complete` left by a rename would inflate the
 *             count (and would hand out a track milestone that was not earned).
 *
 * Mirrors the ThemeToggle pattern: `try/catch` localStorage access and an
 * `apply()` that keeps `aria-pressed` in sync — which in turn drives the icon
 * swap and the filled styling in CSS. The visible label is deliberately
 * CONSTANT (M7.1 CMP-12): a toggle button's state belongs in `aria-pressed`,
 * and renaming it to "Completed" double-encoded that state (assistive tech read
 * "Completed, pressed"). An sr-only rename is not an option either — a hidden
 * name that differs from the visible text fails WCAG 2.5.3 Label in Name.
 * Both icons ship in the static HTML; the script upgrades state on load.
 *
 * M7.2: the button now sits in a wrapper with the note it reveals once the
 * lesson is marked done ("Saved — N of 15 complete" + where that save lives).
 * BOTH are JS-only, so the `<noscript>` kill-switch targets the WRAPPER — the
 * old rule hid only `.mark-complete` and would have orphaned the note. Reads go
 * through `src/lib/progress.ts` (the one progress module); the write stays here
 * because this component is the only writer of the completion key.
 *
 * M8.1 — THE QUIET MILESTONE, the system's only celebration
 * (`docs/m8-gamification.md`). When a click takes a whole TRACK from N-1 to N of
 * N *and every lesson in it has also been Practiced*, the check glyph draws in
 * once and ONE line appears below the button ("Foundations complete — all 9
 * lessons done and practiced, on this device."), replaced by the course line
 * when that same click finishes the curriculum. No modal, no confetti, no sound,
 * no share button — 15 identical fanfares are worth nothing, so this fires at
 * most twice per track and once for the course.
 *
 * WHY THE PRACTICED HALF IS NOT OPTIONAL: `docs/m8-gamification.md` makes it a
 * binding rule that nothing — reviews, milestones, unlocks — gates on Learned
 * alone, because "Mark as complete" is a self-report with no learning
 * precondition. Gated on the completion count by itself, the system's only
 * celebration could be collected by ticking nine checkboxes and reading nothing,
 * which is the review finding this component was rejected for. The mastery
 * states are the currency, so the milestone spends them: the marks say the click
 * finished the track, the Practiced count says retrieval actually happened, and
 * the sentence names both.
 *
 * It adds NO storage key: the line is derived from those two reads on every
 * paint, so un-toggling silently retires it (no shaming copy), and re-earning it
 * legitimately shows it again. Its `role="status"` element ships EMPTY so the
 * first population is announced reliably — and so a JS-off page renders nothing
 * at all, since the existing kill-switch already hides the whole group.
 *
 * The track subset the milestone needs is derived HERE from `lessons` — every
 * `LessonRef` carries its `track` (M7.2) — rather than threaded down as a
 * `trackSlugs` prop: one filter over the list the component already receives
 * keeps the milestone and the count line reading the same curriculum, and adds
 * nothing to `WhatsNext`'s or `LessonLayout`'s API.
 */
import type { JSX } from 'react';
import type { LessonRef } from '../lib/progress';
import { TRACK_COPY, type TrackCopy } from '../lib/tracks';
import { useClientModule } from '../render/context';

/**
 * Kill-switch for the whole group (button, the note it reveals, and M8.1's
 * milestone line). Verbatim from the legacy component.
 */
const NOSCRIPT = `<style>
    /* Kill-switch for the whole group (button, the note it reveals, and M8.1's
       milestone line): none of them can work without JS, and the M8 rule is
       that no gamification affordance may appear on a JS-off page at all.
       \`!important\` because a kill-switch must be unbeatable by any
       equal-specificity rule in the bundle (QA DEFECT-1). */
    .mark-complete-group {
      display: none !important;
    }
  </style>`;

/** Props of `MarkComplete`. */
export interface MarkCompleteProps {
  slug: string;
  lessons: LessonRef[];
}

/**
 * The completion toggle, its saved-note and the Quiet Milestone line.
 *
 * @param props - See `MarkCompleteProps`.
 * @returns The group and its `<noscript>` kill-switch.
 */
export default function MarkComplete({
  slug,
  lessons,
}: MarkCompleteProps): JSX.Element {
  useClientModule('mark-complete');

  // The milestone's track subset, from the injected curriculum. A slug missing
  // from that list (a malformed payload) leaves the subset empty, which is the
  // honest outcome: no track can then be "all complete", so no line is offered.
  const track = lessons.find((lesson) => lesson.slug === slug)?.track ?? null;
  const trackLessons =
    track === null ? [] : lessons.filter((lesson) => lesson.track === track);

  // `LessonRef.track` is a plain string (the progress module keeps it loose so
  // any caller can inject a list), so the copy lookup is written to tolerate an
  // id the site has no name for: it yields no track line rather than
  // "undefined complete". `src/lib/tracks.ts` stays the one place a track is
  // named.
  const trackName = (TRACK_COPY as Record<string, TrackCopy | undefined>)[
    track ?? ''
  ]?.short;

  // Both sentences are composed at BUILD time, so their numbers are the
  // curriculum the build shipped — the browser only decides WHICH one is true.
  // `undefined` omits the attribute entirely, and the script then offers no
  // line. "done and practiced" is the honest description of what the script
  // actually checks: the completion marks AND the earned Practiced state for
  // every lesson named in the count.
  const trackLine =
    trackName !== undefined && trackLessons.length > 0
      ? `${trackName} complete — all ${trackLessons.length} lessons done and practiced, on this device.`
      : undefined;
  const courseLine =
    lessons.length > 0
      ? `Course complete — all ${lessons.length} lessons done and practiced, on this device.`
      : undefined;

  return (
    <>
      <div
        className="mark-complete-group"
        data-mark-complete-group=""
        data-lessons={JSON.stringify(lessons)}
        data-track-line={trackLine}
        data-course-line={courseLine}
      >
        <button
          type="button"
          className="btn-secondary mark-complete"
          data-mark-complete=""
          data-slug={slug}
          aria-pressed="false"
        >
          <svg
            className="mark-complete__icon mark-complete__icon--incomplete"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9"></circle>
          </svg>
          <svg
            className="mark-complete__icon mark-complete__icon--complete"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9"></circle>
            <path className="mark-complete__check" d="M8 12l3 3 5-6"></path>
          </svg>
          <span className="mark-complete__label">Mark as complete</span>
        </button>

        {/* The Quiet Milestone. Ships EMPTY and stays in the DOM: a live region
            has to be in the accessibility tree BEFORE its first population for
            its announcement to fire reliably, and an empty block box costs no
            space until the line arrives. Empty also means a JS-off page renders
            nothing here even before the kill-switch below applies. It must stay
            truly empty — a whitespace text node would match `:not(:empty)` (a
            permanent gap under every un-milestoned button) and give the script
            a non-empty `textContent`. */}
        <p
          className="mark-complete__milestone"
          role="status"
          data-milestone=""
        ></p>

        {/* Revealed by the script once a read-back confirms the save.
            Deliberately NOT a live region: `aria-pressed` already announces the
            state change, and M7.1 CMP-4 showed a second announcement on the
            same action reads as a stutter. The note is supplementary, visible
            confirmation. */}
        <p className="mark-complete__note" data-mark-complete-note="" hidden>
          <span
            className="mark-complete__count"
            data-mark-complete-count=""
          ></span>
          <span className="mark-complete__privacy">
            Saved only in this browser — no account needed.
          </span>
        </p>
      </div>
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
