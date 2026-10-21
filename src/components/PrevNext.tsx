/**
 * PrevNext — end-of-lesson pagination (design §6.3, site spec §8, §9).
 * Ported from `PrevNext.astro` (React migration P2); CSS in
 * `src/styles/components/prev-next.css`.
 *
 * Props:
 * - `prev` / `next` — `{ slug, title, trackLabel? }`, or `null` at the ends of
 *   the curriculum (lesson 01 has no prev, the last lesson no next).
 *
 * M7.2 rebalances the pair instead of showing two equal cards: continuing is
 * the action people take, so **Next is the card** (title + "Start lesson →")
 * and **Prev is a text link** below it. The two-equal-cards layout made the
 * end of a lesson a fork with no recommended branch.
 *
 * `next === null` is NOT a dead end (§3): the last lesson still gets a card,
 * pointing back to its COURSE page — which lists every lesson in the course and
 * shows how much of it is done, so it is a better landing than the catalogue.
 * Handling it here rather than in `WhatsNext` keeps every card in this file, so
 * the treatment cannot drift.
 *
 * `trackLabel` is set by `LessonPage` (legacy `[slug].astro`) only when that neighbour sits in a
 * different track (M7.1 IA-5): the overline then names the track being entered,
 * so the one crossing in the linear path is explicit instead of silent — spec §8
 * requires prev/next to "name the track when it changes".
 */
import type { JSX } from 'react';
import { COURSE_COPY, coursePath, type CourseId } from '../lib/courses';

/** An adjacent lesson. */
export interface Adjacent {
  slug: string;
  title: string;
  /** Human track name — present ONLY when this neighbour crosses tracks. */
  trackLabel?: string;
}

/** Props of `PrevNext`. */
export interface PrevNextProps {
  prev: Adjacent | null;
  next: Adjacent | null;
  /**
   * The course this lesson belongs to. Only the `next === null` card uses it,
   * but it is required rather than optional: an absent course would silently
   * send the last reader of every course back to the catalogue.
   */
  course: CourseId;
}

/**
 * End-of-lesson pagination.
 *
 * @param props - See `PrevNextProps`.
 * @returns The lesson navigation.
 */
export default function PrevNext({
  prev,
  next,
  course,
}: PrevNextProps): JSX.Element {
  const courseTitle = COURSE_COPY[course].title;

  // Same-track neighbours keep the plain wording; no visual noise on the pairs
  // that don't change track. Prev renders "<overline> · <title>" (the middot is
  // aria-hidden, so the link is announced "Previous Recursion") — appending the
  // title with a second colon would read "Previous track: Foundations: Graphs".
  const prevOverline = prev?.trackLabel
    ? `Previous track: ${prev.trackLabel}`
    : 'Previous';
  const nextOverline = next?.trackLabel
    ? `Next track: ${next.trackLabel}`
    : 'Next';

  return (
    <nav aria-label="Lesson navigation" className="prevnext">
      {next ? (
        <a href={`/learn/${next.slug}/`} className="track-card prevnext__next">
          <span className="prevnext__overline">{nextOverline}</span>
          <span className="prevnext__title">{next.title}</span>
          <span className="prevnext__cta">
            Start lesson <span aria-hidden="true">→</span>
          </span>
        </a>
      ) : (
        <a href={coursePath(course)} className="track-card prevnext__next">
          <span className="prevnext__overline">Last lesson</span>
          <span className="prevnext__title">{`That's all of ${courseTitle}`}</span>
          <span className="prevnext__cta">
            Back to the course <span aria-hidden="true">→</span>
          </span>
        </a>
      )}
      {prev && (
        <a href={`/learn/${prev.slug}/`} className="prevnext__prev">
          <span aria-hidden="true">←</span> {prevOverline}{' '}
          <span aria-hidden="true">·</span> {prev.title}
        </a>
      )}
    </nav>
  );
}
