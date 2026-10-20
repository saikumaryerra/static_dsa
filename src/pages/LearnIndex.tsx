/**
 * The catalogue `/learn/` — P1 STUB (React migration, plan §5 P1 step 6): the
 * real head and the page's `<h1>`. The body arrives with the port of
 * `learn/index.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';

/**
 * The catalogue (stub).
 *
 * @returns The page body.
 */
export default function LearnIndex(): JSX.Element {
  return (
    <BaseLayout
      title="Learn · LearnDSA"
      canonicalPath="/learn/"
      description="Every LearnDSA course: data structures and algorithms, Kubernetes, and system design — interactive lessons you work through at your own pace, free and without an account."
    >
      <h1>Courses</h1>
    </BaseLayout>
  );
}
