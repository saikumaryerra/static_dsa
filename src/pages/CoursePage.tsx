/**
 * A course page `/learn/{course}/` — P1 STUB (React migration, plan §5 P1
 * step 6): the real head and the course title as `<h1>`. One component serves
 * all three courses (the route table passes the id); the body arrives with the
 * port of `CourseIndex.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';
import { COURSE_COPY, coursePath, type CourseId } from '../lib/courses';

/**
 * One course page (stub).
 *
 * @param props - The course id.
 * @returns The page body.
 */
export default function CoursePage({
  course,
}: {
  course: CourseId;
}): JSX.Element {
  const copy = COURSE_COPY[course];
  return (
    <BaseLayout
      title={`${copy.title} · LearnDSA`}
      canonicalPath={coursePath(course)}
      description={copy.description}
    >
      <h1>{copy.title}</h1>
    </BaseLayout>
  );
}
