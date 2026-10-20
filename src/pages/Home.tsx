/**
 * Home page `/` — P1 STUB (React migration, plan §5 P1 step 6): the real head
 * (title, description, canonical, `WebSite` JSON-LD) and the page's `<h1>`.
 * The body arrives with the port of `index.astro` (WS-C, P3).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';
import { webSiteJsonLd } from '../lib/structured-data';
import { useRenderContext } from '../render/context';

/**
 * The home page (stub).
 *
 * @returns The page body.
 */
export default function Home(): JSX.Element {
  const { site } = useRenderContext();
  return (
    <BaseLayout
      title="LearnDSA — algorithms, Kubernetes and system design, one step at a time"
      description="Free, interactive engineering courses. Step through algorithms on your own input, then learn the systems they run inside: Kubernetes from fundamentals to production, and system design from principles to real architectures."
      canonicalPath="/"
      jsonLd={webSiteJsonLd(site)}
      wide
    >
      <h1>See how the machine actually works</h1>
    </BaseLayout>
  );
}
