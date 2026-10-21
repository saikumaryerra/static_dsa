/**
 * Course page — `/learn/{course}/` (course expansion, decision D-05), ported
 * from `src/pages/learn/{dsa,kubernetes,system-design}.astro` (React
 * migration P3): one component for the three routes `src/routes.tsx` lists.
 *
 * A few lines of page and one shared component. Course pages share
 * `/learn/{…}/` with the lessons, so `checkCollection()` fails the build if a
 * lesson ever takes a course's slug, and the two cannot collide silently.
 */
import type { JSX } from 'react';
import CourseIndex from '../components/CourseIndex';
import { getLessons } from '../content/lessons';
import BaseLayout from '../layouts/BaseLayout';
import { COURSE_COPY, coursePath, type CourseId } from '../lib/courses';

/**
 * One course page.
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
      <CourseIndex course={course} lessons={getLessons()} />
    </BaseLayout>
  );
}
