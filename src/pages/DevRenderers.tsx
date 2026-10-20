/**
 * The renderer gallery `/dev/renderers/` — P1 STUB (React migration, plan §5
 * P1 step 6): the real head (`noindex`; canonical defaults to the page's own
 * path, as the legacy page passed none) and the page's `<h1>`. The dev-only
 * gallery arrives with the port of `dev/renderers.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';

/**
 * The renderer gallery (stub).
 *
 * @returns The page body.
 */
export default function DevRenderers(): JSX.Element {
  return (
    <BaseLayout
      title="Renderer gallery (dev) · LearnDSA"
      description="Dev-only renderer gallery."
      noindex
    >
      <h1>Renderer gallery</h1>
    </BaseLayout>
  );
}
