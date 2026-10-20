/**
 * Visualizer — the server half of the interactive DSA visualization island
 * (site spec §11.3, design §2; React migration plan §5 P2 WS-I step 2).
 *
 * Props:
 * - `algorithm`        registry AlgorithmId (validated at BUILD time — unknown → build fails).
 * - `renderer`         registry RendererId (validated at BUILD time).
 * - `input`            optional initial input, e.g. "[1,3,5,7,9,11] target=7";
 *                      else the algorithm's defaultInput().
 * - `allowCustomInput` show the custom-input form (default true).
 * - `showMetrics`      show the metrics pills (default true). The ledger's cost
 *                      column inherits this: "no counters on this demo" must not
 *                      be defeated by the table underneath the drawing.
 * - `showLedger`       render the trace as a table under the drawing (default
 *                      true). /about and the dev gallery pass false — both are
 *                      chrome demonstrations rather than lessons.
 * - `inputLabel`/`inputPlaceholder`  label + placeholder for the FIRST field
 *                      (default "Array"). Non-array lessons override the label
 *                      (e.g. graph "Edges", recursion "n"); the placeholder is
 *                      the AUTHORED `input` whenever there is one, so the prop
 *                      is consulted only by a viz without an `input` (CMP-14).
 * - `targetLabel`/`targetPlaceholder`  label + placeholder for the SECOND field
 *                      (default "Target"; same authored-input-wins rule).
 * - `showTarget`       render the second field (default true). Lessons whose input
 *                      is a single value (e.g. recursion) hide it. LABELS ONLY —
 *                      the client still composes the same raw string parseInput
 *                      already accepts, so per-algorithm contracts are unchanged.
 *
 * Architecture (M3 §1, TD-1/TD-2): this component runs only at BUILD time. It
 * reads the SAME registry modules the client loads, runs the algorithm once,
 * and fails the build on anything a reader must never meet — an unknown id, a
 * rejected authored input, an empty trace, an out-of-contract prediction. It
 * then renders the `<section class="viz">` container through `<Island>`, whose
 * children are `VisualizerIsland` rendered in isolation from serialized props:
 * the DOM-free `renderStatic(step0)` still, the controls, the key and the
 * ledger, all of which the browser hydrates once the section scrolls near the
 * viewport (`src/client/island-registry.ts`). The `<noscript>` kill-switch that
 * follows the section hides the controls and reveals the "enable JS" note.
 *
 * WHY THE REGISTRY IS PRELOADED. The Astro frontmatter `await`ed the lazy
 * thunks in the middle of a render; a React render is synchronous. So this
 * module resolves every algorithm and renderer once, at module evaluation (the
 * top-level `await` below), and the render reads them synchronously through
 * `loadedAlgorithm`/`loadedRenderer`. The build is a single SSR bundle, so the
 * cost is paid once per build, not per page.
 */
import type { JSX } from 'react';
import { Island } from '../render/Island';
import { useRenderContext } from '../render/context';
import { claimInstrumentId } from './core/instrument-id';
import {
  inputHelpText,
  probeListCap,
  splitAuthoredInput,
} from './core/input-hint';
import {
  algorithms,
  loadedAlgorithm,
  loadedRenderer,
  preloadVizRegistry,
  renderers,
} from './registry';
import VisualizerIsland, {
  authoredRun,
  type VisualizerIslandProps,
} from './VisualizerIsland';

await preloadVizRegistry();

/** Props of {@link Visualizer} — the legacy component's, unchanged. */
export interface VisualizerProps {
  algorithm: string;
  renderer: string;
  input?: string;
  allowCustomInput?: boolean;
  showMetrics?: boolean;
  showLedger?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  targetLabel?: string;
  targetPlaceholder?: string;
  showTarget?: boolean;
}

/**
 * The legacy `<noscript>` block, verbatim. Kill-switch (mirrors ThemeToggle):
 * JS off → hide interactive controls, reveal the static-preview note.
 */
const NOSCRIPT = `<style>
    /* Kill-switch (mirrors ThemeToggle): JS off → hide interactive controls,
       reveal the static-preview note. !important beats the bundled stylesheet. */
    [data-viz] .viz-controls {
      display: none !important;
    }
    [data-viz] .viz-nojs-note {
      display: flex !important;
    }
  </style>`;

/**
 * Renderer ids whose module file is not `<Pascal id>Renderer.ts`. `bars` is the
 * array renderer's second export.
 */
const RENDERER_FILE_EXCEPTIONS: Readonly<Record<string, string>> = {
  bars: 'ArrayRenderer',
};

/**
 * The source modules an instrument's island loads on activation beyond its
 * own component — its algorithm and renderer chunks — for the JS budget's page
 * manifest (`.build/page-manifest.json`, D-06).
 *
 * Derived from the registry's file convention rather than listed a second time
 * beside it: `algorithms/<id>.ts` (the dev-only `demo-*` fixtures share
 * `algorithms/demos.ts`) and `renderers/<Pascal id>Renderer.ts`. A path this
 * gets wrong is not silent — the prerenderer fails the build when a listed
 * source is not in the client manifest.
 *
 * @param algorithm - Registry algorithm id.
 * @param renderer - Registry renderer id.
 * @returns Repository-relative source paths.
 */
function vizSources(algorithm: string, renderer: string): string[] {
  const algoFile = algorithm.startsWith('demo-') ? 'demos' : algorithm;
  const rendererFile =
    RENDERER_FILE_EXCEPTIONS[renderer] ??
    `${renderer[0]!.toUpperCase()}${renderer.slice(1)}Renderer`;
  return [
    `src/viz/algorithms/${algoFile}.ts`,
    `src/viz/renderers/${rendererFile}.ts`,
  ];
}

/**
 * One instrument: the island container and its `<noscript>` kill-switch.
 *
 * @param props - See {@link VisualizerProps}.
 * @returns The section and the kill-switch.
 * @throws At build time on an unknown id, a rejected authored input, an empty
 *   trace, or an out-of-contract prediction question.
 */
export default function Visualizer({
  algorithm,
  renderer,
  input,
  allowCustomInput = true,
  showMetrics = true,
  showLedger = true,
  // Defaults keep every array/search/sort lesson (incl. binary-search) unchanged.
  inputLabel = 'Array',
  // No literal placeholder defaults (M7.2 CMP-14): with an authored `input` the
  // placeholders are DERIVED from it below, so these two only cover the viz
  // that has no authored input to derive from.
  inputPlaceholder,
  targetLabel = 'Target',
  targetPlaceholder,
  showTarget = true,
}: VisualizerProps): JSX.Element {
  const context = useRenderContext();

  // Unique id base so multiple visualizers on one page don't collide — DERIVED,
  // not random (Plan C §5): nothing could point INTO a run and still resolve
  // after a rebuild while it churned. The derivation, the per-render collision
  // tiebreak and the reasons for both live in `core/instrument-id.ts`; the
  // render context is that module's per-page key.
  const uid = claimInstrumentId(
    context.instrumentScope,
    context.pathname,
    algorithm,
    renderer,
  );

  // --- Build-time checks (architecture §1). Unknown ids or malformed authored
  // input FAIL THE BUILD here, which is a better DX than M2's runtime fallback.
  if (!(algorithm in algorithms) || !(renderer in renderers)) {
    throw new Error(
      `Unknown viz: algorithm="${algorithm}" renderer="${renderer}"`,
    );
  }
  const algo = loadedAlgorithm(algorithm);
  const rmod = loadedRenderer(renderer);
  const run = authoredRun(algo, rmod, algorithm, uid, input ?? '');
  const { trace } = run;
  const label = algo.label;

  // --- Predict-the-Step (M8.2) ---
  // `predictStep` is OPTIONAL on the Algorithm contract (spec §11.2), so the
  // toggle exists only where this lesson's algorithm ships one AND the authored
  // run really has something to ask about — a mode control that can never ask a
  // question is worse than no control at all. Both facts are settled HERE, from
  // the same trace the Player will index into.
  //
  // The scan doubles as the contract's enforcement point. A question with fewer
  // than 2 or more than 4 choices, or a `correctIndex` outside them, fails the
  // BUILD rather than rendering a one-button "prediction" (the design's floor
  // guard for BFS's near-path graph) or a strip whose answer cannot be picked.
  let predictQuestions = 0;
  if (algo.predictStep) {
    for (let i = 0; i < trace.length; i += 1) {
      const question = algo.predictStep(trace, i, run.input);
      if (!question) continue;
      const size = question.choices.length;
      if (
        size < 2 ||
        size > 4 ||
        !Number.isInteger(question.correctIndex) ||
        question.correctIndex < 0 ||
        question.correctIndex >= size
      ) {
        throw new Error(
          `predictStep("${algorithm}") returned an out-of-contract question at step ${i}: choices must number 2–4 with correctIndex inside them (spec §11.2). Got ${size} choices, correctIndex ${question.correctIndex}.`,
        );
      }
      predictQuestions += 1;
    }
  }
  const showPredict = predictQuestions > 0;

  // The lesson a passed predict session credits, resolved at BUILD time from
  // the page URL — `/learn/{slug}` and nothing else. This island also renders
  // on /about and in the dev gallery, where there is no lesson to credit and
  // the attribute is simply absent; `recordPass` is then never called, which is
  // the honest outcome (the prediction practice still works).
  const routePath = context.pathname
    .replace(/(?:\/index)?\.html$/, '')
    .replace(/\/$/, '');
  const lessonSlug = /^\/learn\/([^/]+)$/.exec(routePath)?.[1] ?? '';
  const credits = showPredict && lessonSlug !== '';

  // CMP-14: derive both placeholders from the authored input, split on the
  // same `target=` separator the submit handler composes. The DERIVED value
  // wins over the prop: a hand-written placeholder that disagrees with the
  // drawing is the exact defect this exists to remove. The props survive for a
  // viz with no `input`, with the old literals behind them as the last resort.
  const authored = splitAuthoredInput(input ?? '');
  const arrayPlaceholder =
    authored.input || inputPlaceholder || '[1,3,5,7,9,11]';
  const targetHint = authored.target || targetPlaceholder || '7';

  // Helper text (INP-*): format + the REAL cap, measured against this
  // algorithm's own parseInput — a literal "up to 30" would be wrong on six
  // lessons. `null` simply drops the sentence.
  const itemCap = probeListCap(input ?? '', (raw) => algo.parseInput(raw));
  const helpText = inputHelpText({ example: arrayPlaceholder, cap: itemCap });

  const islandProps: VisualizerIslandProps = {
    uid,
    algorithm,
    renderer,
    input: input ?? '',
    allowCustomInput,
    showMetrics,
    showLedger,
    inputLabel,
    arrayPlaceholder,
    targetLabel,
    targetHint,
    showTarget,
    helpText,
    showPredict,
    // The design's bar is "≥5 answers at ≥80%", but this run is the item bank
    // the reader is actually offered, so the island credits a pass at
    // `min(5, this number)` (`core/session.ts`). The AUTHORED count, so a
    // short custom input cannot lower the bar.
    authoredItems: credits ? predictQuestions : 0,
    lessonSlug: credits ? lessonSlug : '',
  };

  return (
    <>
      <Island
        name="visualizer"
        as="section"
        component={VisualizerIsland}
        props={islandProps}
        assets={vizSources(algorithm, renderer)}
        rootProps={{
          className: 'viz',
          id: uid,
          'aria-label': `${label} visualization`,
          'data-viz': '',
          'data-algorithm': algorithm,
          'data-renderer': renderer,
          'data-input': input ?? '',
          'data-extent': `${run.extent.w} ${run.extent.h}`,
          'data-label': label,
          'data-show-metrics': showMetrics ? 'true' : 'false',
          'data-target-label': showTarget ? targetLabel : '',
          ...(credits
            ? {
                'data-slug': lessonSlug,
                'data-predict-items': String(predictQuestions),
              }
            : {}),
        }}
      />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
    </>
  );
}
