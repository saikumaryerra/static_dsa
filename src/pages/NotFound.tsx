/**
 * The 404 page `/404.html` — P1 STUB (React migration, plan §5 P1 step 6): the
 * real head — `noindex`, and a canonical at "/" (the error page is never a
 * page of its own) — and the page's `<h1>`. The body, with its build-time
 * `renderStatic` demo, arrives with the port of `404.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';

/**
 * The 404 page (stub).
 *
 * @returns The page body.
 */
export default function NotFound(): JSX.Element {
  return (
    <BaseLayout
      title="Page not found · LearnDSA"
      description="This page doesn't exist. Head back to the home page or browse the lessons."
      canonicalPath="/"
      noindex
    >
      <h1>Page not found</h1>
    </BaseLayout>
  );
}
