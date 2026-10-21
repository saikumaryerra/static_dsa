/**
 * WhatsNext — the end-of-lesson close-the-loop section (M7.2; spec §8 "LessonLayout").
 * Ported from `WhatsNext.astro` (React migration P2); CSS in
 * `src/styles/components/whats-next.css`.
 *
 * Props:
 * - `slug`      the lesson being read (MarkComplete's persistence key).
 * - `lessons`   every published lesson, forwarded to MarkComplete for its
 *               "N of 15 complete" line and for M8.1's track milestone, which
 *               filters its own track out of this list rather than taking a
 *               second `trackSlugs` prop (injected at build, never enumerated
 *               from localStorage).
 * - `prev` /
 *   `next`      adjacent lessons in GLOBAL order, or null at a boundary.
 *
 * Replaces the old floating "Mark as complete" button plus a separate prev/next
 * block: finishing a lesson and choosing what to read next are one moment, so
 * they get one titled section. Everything here is server-rendered — the next
 * lesson is already a build-time prop — and the only JS-dependent part
 * (MarkComplete) hides itself behind its own `<noscript>` kill-switch, so with
 * JS off this section still shows the heading and the whole navigation.
 *
 * M8.1 adds no surface of its own here: the Quiet Milestone line lives INSIDE
 * MarkComplete's group, so that same kill-switch covers it and this section
 * keeps exactly one JS-dependent block to reason about.
 */
import type { JSX } from 'react';
import type { CourseId } from '../lib/courses';
import type { LessonRef } from '../lib/progress';
import MarkComplete from './MarkComplete';
import PrevNext, { type Adjacent } from './PrevNext';

/** Props of `WhatsNext`. */
export interface WhatsNextProps {
  slug: string;
  lessons: LessonRef[];
  prev: Adjacent | null;
  next: Adjacent | null;
  /** Forwarded to `PrevNext` for the end-of-course card. */
  course: CourseId;
}

/**
 * The end-of-lesson section.
 *
 * @param props - See `WhatsNextProps`.
 * @returns The titled section.
 */
export default function WhatsNext({
  slug,
  lessons,
  prev,
  next,
  course,
}: WhatsNextProps): JSX.Element {
  return (
    <section className="whats-next" aria-labelledby="whats-next">
      <h2 id="whats-next" className="whats-next__heading">
        {"What's next"}
      </h2>
      <MarkComplete slug={slug} lessons={lessons} />
      <div className="whats-next__nav">
        <PrevNext prev={prev} next={next} course={course} />
      </div>
    </section>
  );
}
