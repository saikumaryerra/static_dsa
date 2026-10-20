/**
 * LessonLayout — P1 STUB (React migration, plan §5 P1 step 6): the lesson's
 * `<h1>` and its MDX body inside `.lesson-body`, which is all `proseHash` reads.
 * Breadcrumb, ToC, chips, mastery pips, Mark complete, What's next and prev/next
 * arrive with the port of `LessonLayout.astro` (WS-C, P2).
 */
import type { JSX } from 'react';
import type { LessonEntry } from '../content/lessons';
import { courseJsonLd } from '../lib/structured-data';
import { useRenderContext } from '../render/context';
import BaseLayout from './BaseLayout';

/**
 * One lesson page (stub).
 *
 * @param props - The lesson.
 * @returns The page body.
 */
export default function LessonLayout({
  entry,
}: {
  entry: LessonEntry;
}): JSX.Element {
  const { site } = useRenderContext();
  const { title, summary, slug } = entry.data;
  const { Content } = entry;
  return (
    <BaseLayout
      title={`${title} · LearnDSA`}
      description={summary}
      canonicalPath={`/learn/${slug}/`}
      ogType="article"
      jsonLd={courseJsonLd(entry, site)}
      wide
    >
      <h1>{title}</h1>
      <div className="lesson-body">
        <Content />
      </div>
    </BaseLayout>
  );
}
