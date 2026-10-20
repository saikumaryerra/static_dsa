/**
 * A lesson page `/learn/{slug}/` — P1 STUB (React migration, plan §5 P1 step
 * 6). The cross-collection guards `[slug].astro` ran in `getStaticPaths` now
 * run once in `checkCollection()`; prev/next, prerequisites, reading time and
 * the injected lesson list arrive with the port of `[slug].astro` (WS-C, P2).
 */
import type { JSX } from 'react';
import type { LessonEntry } from '../content/lessons';
import LessonLayout from '../layouts/LessonLayout';

/**
 * One lesson page (stub).
 *
 * @param props - The lesson.
 * @returns The page body.
 */
export default function LessonPage({
  entry,
}: {
  entry: LessonEntry;
}): JSX.Element {
  return <LessonLayout entry={entry} />;
}
