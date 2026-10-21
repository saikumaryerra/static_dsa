/**
 * Renderer gallery — DEV ONLY visual-regression surface (design §4, architecture §5).
 * Ported from `src/pages/dev/renderers.astro` (React migration P3); CSS in
 * `src/styles/pages/dev-renderers.css`.
 *
 * Every renderer is rendered through the REAL `<Visualizer>` (the production
 * path) with a hand-authored sample that exercises ≥ 1 highlight. Stacked single
 * column so light/dark, narrow/wide diffs are easy to scan.
 *
 * PROD-GATED (`import.meta.env.DEV`): in a production build NONE of the
 * `<Visualizer>` islands render, so NO renderer chunk (and none of the dev
 * fixtures) is referenced by any shipped page — the no-ship guarantee
 * (architecture §5 / design §4). Conditional render is the gate (the design
 * SPEC-GAP explicitly allows "drop the page" when stricter). Not a lesson (lives
 * outside `src/content`).
 */
import type { JSX } from 'react';
import BaseLayout from '../layouts/BaseLayout';
import Visualizer from '../viz/Visualizer';

/** Dev-only: production builds render a stub with no renderer islands. */
const isDev = import.meta.env.DEV;

/** One gallery row: renderer name, the algorithm+renderer ids, and its sample. */
const samples: {
  name: string;
  algorithm: string;
  renderer: string;
  input?: string;
}[] = [
  {
    name: 'Array',
    algorithm: 'binary-search',
    renderer: 'array',
    input: '[1,3,5,7,9,11] target=7',
  },
  {
    name: 'Bars',
    algorithm: 'linear-search',
    renderer: 'bars',
    input: '[8,3,5,9,1,7] target=9',
  },
  { name: 'Linked list', algorithm: 'demo-linkedlist', renderer: 'linkedList' },
  { name: 'Stack', algorithm: 'demo-stack', renderer: 'stack' },
  { name: 'Queue (circular)', algorithm: 'demo-queue', renderer: 'queue' },
  { name: 'Tree (BST)', algorithm: 'demo-tree', renderer: 'tree' },
  { name: 'Heap', algorithm: 'demo-heap', renderer: 'heap' },
  { name: 'Graph', algorithm: 'demo-graph', renderer: 'graph' },
  { name: 'Hash table', algorithm: 'demo-hashtable', renderer: 'hashTable' },
  { name: 'DP table', algorithm: 'demo-table', renderer: 'table' },
  { name: 'Call stack', algorithm: 'demo-callstack', renderer: 'callStack' },
  { name: 'Chart (Big-O)', algorithm: 'demo-chart', renderer: 'chart' },
];

/**
 * The renderer gallery (or its production stub).
 *
 * @returns The page body.
 */
export default function DevRenderers(): JSX.Element {
  return (
    <BaseLayout
      title="Renderer gallery (dev) · LearnDSA"
      description="Dev-only renderer gallery."
      // Emitted to dist but never a real content page — keep crawlers out
      // (mirrors 404).
      noindex
    >
      {/* Plain div, not <main>: BaseLayout already renders the page's
          <main id="main">. */}
      <div className="dev-gallery">
        <header className="dev-gallery__head">
          <h1>Renderer gallery</h1>
          <p className="dev-gallery__note">
            Dev-only. Not shipped to production. Each sample runs through the
            real Visualizer, exercising at least one highlight.
          </p>
        </header>

        {isDev ? (
          samples.map((sample) => (
            <section key={sample.name} className="dev-gallery__row">
              <h2>{`${sample.name} (${sample.renderer})`}</h2>
              <p className="dev-gallery__ids">
                {`algorithm="${sample.algorithm}" renderer="${sample.renderer}"`}
              </p>
              {/* showLedger: a gallery of the CHROME, not a lesson — twelve
                  tables of somebody else's run would bury what is under review. */}
              <Visualizer
                algorithm={sample.algorithm}
                renderer={sample.renderer}
                input={sample.input}
                allowCustomInput={false}
                showMetrics={true}
                showLedger={false}
              />
            </section>
          ))
        ) : (
          <p>This page is available in development only.</p>
        )}
      </div>
    </BaseLayout>
  );
}
