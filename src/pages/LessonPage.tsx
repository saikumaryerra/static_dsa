/**
 * Lesson page — renders one published lesson (architecture §1.2), ported from
 * `src/pages/learn/[slug].astro` (React migration P2).
 *
 * The route table (`src/routes.tsx`) builds a page per PUBLISHED lesson,
 * routing off frontmatter `data.slug`. The build-time guards `[slug].astro`
 * ran in `getStaticPaths` — duplicate slugs, (M7.2) `prerequisites` that name
 * an unknown or unpublished lesson, and (course expansion, decision D-05) a
 * lesson slug that would collide with a course page's URL — run once for the
 * whole collection in `checkCollection()` (`src/content/lessons.ts`), before
 * the first page renders, so none of them can be dodged. Prev/next derive from
 * `order` **within the lesson's own course**. Reading time is computed from the
 * raw MDX body prose.
 */
import type { JSX } from 'react';
import { getLessons, type LessonEntry } from '../content/lessons';
import LessonLayout from '../layouts/LessonLayout';
import { COURSE_ORDER } from '../lib/courses';
import type { LessonRef } from '../lib/progress';
import { readingTimeMinutes } from '../lib/reading-time';
import { trackLabel } from '../lib/tracks';

/**
 * One lesson page.
 *
 * @param props - The lesson.
 * @returns The page body.
 */
export default function LessonPage({
  entry,
}: {
  entry: LessonEntry;
}): JSX.Element {
  const lessons = getLessons();
  const { Content, headings } = entry;

  // Prev/next: neighbours by `order` across every track OF THIS COURSE (M7.1
  // IA-5). Spec §8: "Prev/next follow global lesson order, naming the track
  // when it changes — never dead-ending at a track boundary (§3 'no dead
  // ends')". A course page numbers its lessons 01–NN as one linear path, so the
  // old per-track filter left the last Foundations lesson with no Next card at
  // all.
  //
  // Course expansion (decision D-04): the chain stops at the COURSE boundary,
  // not the track boundary. Finishing Dynamic Programming does not lead into
  // Kubernetes — that is a different subject, not the next step — and `order`
  // is per-course, so a global sort would interleave three unrelated sequences.
  // Copy before sorting: `lessons` is shared by every page.
  const inCourse = lessons.filter((l) => l.data.course === entry.data.course);
  const ordered = [...inCourse].sort((a, b) => a.data.order - b.data.order);
  const position = ordered.findIndex((l) => l.data.slug === entry.data.slug);
  const toAdjacent = (l: LessonEntry | undefined) =>
    l
      ? {
          slug: l.data.slug,
          title: l.data.title,
          // Only a neighbour in a DIFFERENT track carries a label, so a
          // crossing (in `dsa`: 09 Graphs -> 10 Recursion) announces itself
          // while every other pair stays visually unchanged. The label rides
          // inside the adjacent object, which LessonLayout forwards to
          // PrevNext untouched.
          ...(l.data.track === entry.data.track
            ? {}
            : { trackLabel: trackLabel(l.data.track) }),
        }
      : null;
  const prev = toAdjacent(ordered[position - 1]);
  const next = toAdjacent(ordered[position + 1]);

  // "Builds on:" chips (M7.2). Every slug here is guaranteed to resolve —
  // `checkCollection()` fails the build otherwise — so the lookup is safe.
  // Sorted by curriculum order rather than the authoring order, so the row
  // always reads earliest-first regardless of how the frontmatter array was
  // typed. Looked up across the WHOLE catalogue, not just this course: a
  // prerequisite is allowed to point at another course, and the guard already
  // proved every slug resolves.
  const bySlug = new Map(lessons.map((l) => [l.data.slug, l]));
  const courseRank = (l: LessonEntry) => COURSE_ORDER.indexOf(l.data.course);
  const prerequisites = entry.data.prerequisites
    .map((s) => {
      const lesson = bySlug.get(s);
      if (!lesson) {
        // Unreachable after `checkCollection()`; stated rather than asserted
        // with `!` so a guard regression fails loudly at this lesson.
        throw new Error(
          `${entry.data.slug}: prerequisite "${s}" is not a published lesson.`,
        );
      }
      return lesson;
    })
    .sort(
      (a, b) => courseRank(a) - courseRank(b) || a.data.order - b.data.order,
    )
    .map((l) => ({ slug: l.data.slug, title: l.data.title }));

  // The curriculum, injected into the page for the progress module (spec §6):
  // the completion count is computed from THIS list, never by enumerating
  // localStorage keys, so a renamed lesson's stale key can't inflate it.
  //
  // `ordered`, NOT `lessons` — this course's lessons, not the catalogue's. What
  // reads the list is `MarkComplete`, whose milestone sentence is "Course
  // complete — all N lessons done and practiced", and the course expansion
  // briefly made N the whole catalogue: a reader finishing all fifteen
  // algorithm lessons would have been told they had 112 to go, and every lesson
  // page carried 27 KB of a list it never used. The catalogue-wide list belongs
  // on `/learn/`, which injects it there for the cross-course resume CTA.
  //
  // `track` is load-bearing here, not decoration: M8.1's Quiet Milestone
  // filters this same list down to the lesson's own track inside
  // `MarkComplete` (one build-time `filter`, which is why no `trackSlugs` prop
  // is threaded through the layout). Dropping the field would silently retire
  // the milestone.
  const lessonRefs: LessonRef[] = ordered.map((l) => ({
    slug: l.data.slug,
    title: l.data.title,
    order: l.data.order,
    track: l.data.track,
    course: l.data.course,
  }));

  const readingMinutes = readingTimeMinutes(entry.body);

  return (
    <LessonLayout
      entry={entry}
      title={entry.data.title}
      summary={entry.data.summary}
      difficulty={entry.data.difficulty}
      track={entry.data.track}
      course={entry.data.course}
      estimatedMinutes={entry.data.estimatedMinutes}
      readingMinutes={readingMinutes}
      slug={entry.data.slug}
      headings={headings}
      prerequisites={prerequisites}
      lessons={lessonRefs}
      prev={prev}
      next={next}
    >
      <Content />
    </LessonLayout>
  );
}
