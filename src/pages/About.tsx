/**
 * The about page `/about/` — P1 STUB (React migration, plan §5 P1 step 6): the
 * real head and the page's `<h1>`. The body arrives with the port of
 * `about.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';

/**
 * The about page (stub).
 *
 * @returns The page body.
 */
export default function About(): JSX.Element {
  return (
    <BaseLayout
      title="About · LearnDSA"
      description="What LearnDSA is, who it's for, and how the interactive visualizations work."
      canonicalPath="/about/"
    >
      <h1>About LearnDSA</h1>
    </BaseLayout>
  );
}
