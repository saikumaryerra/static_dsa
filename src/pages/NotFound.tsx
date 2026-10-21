/**
 * 404 — friendly not-found page (spec §8; M5 architecture §2.4). Ported from
 * `src/pages/404.astro` (React migration P3); CSS in
 * `src/styles/pages/not-found.css`.
 *
 * Prerendered to `dist/404.html` (static output). Marked `noindex` (BaseLayout's
 * `noindex`) so crawlers never index the error page; its canonical points at "/" (the
 * page has no meaningful URL of its own). One <h1>, routes to /learn and home.
 * The lesson index is the primary action (M7.1 IA-8) because nearly every
 * guessable deep URL that lands here is a mistyped lesson slug.
 *
 * M7.3 VD-7 adds the brand moment below the actions — see the demo block. The
 * left-edge alignment stays: centring this page was CONSIDERED AND REJECTED
 * (design-tokens-m1.md's documented left-aligned measure), so the SVG is the
 * only change here.
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';
import {
  loadedAlgorithm,
  loadedRenderer,
  preloadVizRegistry,
} from '../viz/registry';

/**
 * ── "Target not found" (M7.3 VD-7) ────────────────────────────────────────────
 *
 * The page was a grey number floating in whitespace. It now ends on the site's
 * own visual language: a real binary search for 404 in a sorted list of HTTP
 * status codes — which does not contain it — rendered at its FINAL step, where
 * the search window has collapsed to nothing and every cell is ruled out.
 *
 * Built exactly like the hero demo and the lesson still (architecture §1): this
 * module runs at build time, so it awaits the same registry the instruments
 * use, runs the real algorithm, and asks the real renderer for a DOM-free SVG
 * string.
 * Zero client JS; works with JS off; nothing about the drawing is hand-authored.
 */
const NOT_FOUND_INPUT = '[200,301,400,403,410,500] target=404';

// Module-level `await`, as the instruments do: the server bundle resolves the
// registry before any page renders, and a module that cannot load fails the
// build here.
await preloadVizRegistry();

const searchAlgorithm = loadedAlgorithm('binary-search');
const arrayRenderer = loadedRenderer('array');
const searchInput = searchAlgorithm.parseInput(NOT_FOUND_INPUT);
if (searchInput && typeof searchInput === 'object' && 'error' in searchInput) {
  throw new Error(
    `404 demo input rejected: ${(searchInput as { error: string }).error}`,
  );
}
const searchTrace = searchAlgorithm.run(searchInput);
const lastStep = searchTrace[searchTrace.length - 1];
if (!lastStep) throw new Error('404 demo: the search produced no steps.');

/**
 * The joke only works while 404 is genuinely absent: a present target makes the
 * final step a `found` frame with a ✓ on it, which would contradict every word
 * on this page. Assert the collapsed-window shape (no highlights left) rather
 * than trust the literal above — editing the array is then a build failure, not
 * a silent contradiction. The class list guards the local `<style>` the same way
 * the hero's does: these are the renderer's classes, restated here because the
 * visualizer's global stylesheet only ships on pages that mount the island.
 */
if ((lastStep.highlights ?? []).length > 0) {
  throw new Error(
    `404 demo: the final step still highlights something — ${NOT_FOUND_INPUT} must search for a target the array does not contain.`,
  );
}
const notFoundStill = arrayRenderer.renderStatic(lastStep, {
  title: searchAlgorithm.label,
  idBase: 'nf-demo',
});
const missingClasses = [
  'viz-cell__rect',
  'viz-cell__value',
  'viz-cell__index',
  'is-eliminated',
].filter((cls) => !notFoundStill.includes(cls));
if (missingClasses.length > 0) {
  throw new Error(
    `404 demo still no longer emits: ${missingClasses.join(', ')}. The renderer's class contract changed — update this page's styles with it.`,
  );
}

/**
 * The not-found page.
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
      <section className="notfound">
        <p className="notfound__code" aria-hidden="true">
          404
        </p>
        <h1>Page not found</h1>
        <p className="notfound__body">
          {"The page you're looking for doesn't exist or may have moved."}
        </p>
        <div className="notfound__actions">
          <a href="/learn/" className="btn-primary">
            Browse the lessons
          </a>
          <a href="/" className="font-medium text-brand hover:underline">
            Back to home
          </a>
        </div>

        {/* Below the actions, so M7.1's CTA emphasis is untouched: the reader
            meets the error, the explanation and the primary button before the
            flourish. The canvas is aria-hidden because the caption states the
            algorithm, the input and the step's own explanation verbatim —
            exposing the SVG's identical <desc> too would just announce it
            twice. */}
        <figure className="notfound__demo">
          <div
            className="notfound__canvas"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: notFoundStill }}
          />
          <figcaption className="notfound__caption">
            <b>Binary search for 404</b> in a sorted list of HTTP status codes.
            <span className="notfound__step">{lastStep.explanation}</span>
          </figcaption>
        </figure>
      </section>
    </BaseLayout>
  );
}
