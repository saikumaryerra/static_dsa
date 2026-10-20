/**
 * The island registry (React migration, D-05 R-min'): one row per hydrated
 * instrument — `visualizer`, `challenge`, `final-run` — and nothing else. Every
 * other client behaviour is a framework-free module (`src/client/modules/`).
 *
 * Each row's `load` imports its component with a dynamic `import()` of
 * `<Pascal>Island.tsx`: the prerenderer finds an island's chunk by that file
 * name when it writes `.build/page-manifest.json` for the JS budget. This file
 * is part of the EAGER bootstrap on every page that hosts an island, so it
 * imports only what must run before activation: the Visualizer's
 * pre-activation states and the `viz:run` event name (a string — the rest of
 * that module is tree-shaken away).
 */
import type { ComponentType } from 'react';
import type { VizRunChannel } from '../components/ChallengeIsland';
import { VIZ_RUN_EVENT, type VizRunDetail } from '../lib/enrichment-store';
import type { IslandEntry } from './islands';
import { failViz, prepareViz } from './viz-prepare';

/**
 * What an island module's default export is typed as by the bootstrap. Each
 * component takes its own props interface; the props it is handed are the ones
 * its server wrapper serialized from that same interface, so the widening is a
 * statement about the wire, checked where the props are built.
 */
type AnyIsland = ComponentType<Record<string, unknown>>;

/**
 * One Trace Trial card's runs, heard from page load (plan §2.3 / D-06).
 *
 * The legacy card listened for `viz:run` from the moment the page loaded; an
 * idle-activated island does not exist yet when a fast reader submits a run,
 * so `prepare` opens this channel at page load and buffers what it hears, and
 * the island drains the buffer on activation — a run made before activation
 * still clears a trial.
 *
 * @returns The channel.
 */
function openRunChannel(): VizRunChannel {
  const buffered: VizRunDetail[] = [];
  let handler: ((detail: VizRunDetail) => void) | null = null;
  document.addEventListener(VIZ_RUN_EVENT, (event) => {
    const detail = (event as CustomEvent<VizRunDetail>).detail;
    if (handler) handler(detail);
    else buffered.push(detail);
  });
  return {
    listen(next) {
      handler = next;
      for (const detail of buffered.splice(0)) next(detail);
      return () => {
        if (handler === next) handler = null;
      };
    },
  };
}

/** Each challenge card's run channel, opened by its `prepare`. */
const runChannels = new WeakMap<HTMLElement, VizRunChannel>();

/** Island rows by `data-island` name. */
export const islandRegistry: Record<string, IslandEntry> = {
  visualizer: {
    // The legacy island mounted on first intersection (+200px), so a lesson's
    // later instruments cost nothing until the reader nears them.
    trigger: 'visible',
    prepare: prepareViz,
    async load(container, props) {
      // Now it really is loading: the chunks are about to be fetched.
      container.setAttribute('aria-busy', 'true');
      const algorithm = String(props['algorithm'] ?? '');
      const renderer = String(props['renderer'] ?? '');
      const input = String(props['input'] ?? '');
      const [island] = await Promise.all([
        import('../viz/VisualizerIsland'),
        // The registry resolves the two chunks this instrument names — only
        // those two, each its own chunk — in parallel with the island's own.
        import('../viz/registry').then(async (registry) => {
          const [algo] = await Promise.all([
            registry.loadAlgorithm(algorithm),
            registry.loadRenderer(renderer),
          ]);
          // The build proved the authored input parses; a stale or edited
          // `data-props` that no longer does is a failed island, not a throw
          // inside React.
          const parsed: unknown = input ? algo.parseInput(input) : null;
          if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            throw new Error(`Authored input rejected: ${input}`);
          }
        }),
      ]);
      return { component: island.default as unknown as AnyIsland, props };
    },
    fail: failViz,
  },
  challenge: {
    // Idle, not visible: the card must hear runs made from an instrument far
    // above it, so it activates soon after load wherever it is — and its
    // `prepare` buffers anything that happens before then.
    trigger: 'idle',
    prepare(container) {
      runChannels.set(container, openRunChannel());
    },
    async load(container, props) {
      const island = await import('../components/ChallengeIsland');
      return {
        component: island.default as unknown as AnyIsland,
        props: { ...props, runs: runChannels.get(container) },
      };
    },
  },
  'final-run': {
    trigger: 'visible',
    async load(_container, props) {
      const island = await import('../components/FinalRunIsland');
      return { component: island.default as unknown as AnyIsland, props };
    },
  },
};
