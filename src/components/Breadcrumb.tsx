/**
 * Breadcrumb — static context nav (design §6.1, site spec §9). Ported from
 * `Breadcrumb.astro` (React migration P2); CSS in
 * `src/styles/components/breadcrumb.css`.
 *
 * Props:
 * - `course` the lesson's `CourseId`; rendered as the short label
 *   `src/lib/courses.ts` owns, linking to that course's page.
 * - `track` the lesson's `Track`; the fragment the course link lands on.
 * - `title` the current lesson title (last crumb; plain text, `aria-current`).
 *
 * Inline `Learn / Course / Lesson`, muted, wraps (never truncates) for long/i18n
 * titles. Every crumb but the last is a link (M7.1 IA-6).
 *
 * The middle crumb names the COURSE, not the track (course expansion, decision
 * D-05): `/learn/` is the catalogue of courses now, so the course is the page's
 * real parent, and three courses each own a module called "Foundations" — the
 * track label alone would no longer say where you are. It still lands the reader
 * on their own module, because the href carries `#track-{track}`, the anchor the
 * course page puts on every module heading.
 */
import type { JSX } from 'react';
import { courseLabel, coursePath, type CourseId } from '../lib/courses';
import type { Track } from '../lib/tracks';

/** Props of `Breadcrumb`. */
export interface BreadcrumbProps {
  course: CourseId;
  track: Track;
  title: string;
}

/**
 * The lesson breadcrumb.
 *
 * @param props - See `BreadcrumbProps`.
 * @returns The breadcrumb `<nav>`.
 */
export default function Breadcrumb({
  course,
  track,
  title,
}: BreadcrumbProps): JSX.Element {
  const label = courseLabel(course);
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        <li>
          <a href="/learn/">Learn</a>
        </li>
        <li aria-hidden="true" className="sep">
          /
        </li>
        <li>
          <a href={`${coursePath(course)}#track-${track}`}>{label}</a>
        </li>
        <li aria-hidden="true" className="sep">
          /
        </li>
        <li>
          <span aria-current="page">{title}</span>
        </li>
      </ol>
    </nav>
  );
}
