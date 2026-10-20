/**
 * The glossary `/glossary/` — P1 STUB (React migration, plan §5 P1 step 6):
 * the real head and the page's `<h1>`. The `lessonSlug` integrity guard
 * already runs in `checkCollection()`; the body and the anchor-collision guard
 * arrive with the port of `glossary.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';

/**
 * The glossary (stub).
 *
 * @returns The page body.
 */
export default function Glossary(): JSX.Element {
  return (
    <BaseLayout
      title="Glossary · LearnDSA"
      description="A–Z reference of the data-structure and algorithm terms used across LearnDSA, each linked to the lesson that introduces it."
      canonicalPath="/glossary/"
    >
      <h1>Glossary</h1>
    </BaseLayout>
  );
}
