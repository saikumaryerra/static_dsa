/**
 * The island registry — P1 STUB (React migration plan §5 P1). Empty until WS-I
 * adds the three rows (`visualizer`, `challenge`, `final-run`) in P2 and takes
 * ownership of this file; the bootstrap (`src/client/islands.ts`) ignores a
 * container whose name has no row.
 *
 * Each row's `load` must import its component with a dynamic `import()` of
 * `<Pascal>Island.tsx` (e.g. `src/viz/VisualizerIsland.tsx` for `visualizer`):
 * the prerenderer finds an island's chunk by that file name when it writes
 * `.build/page-manifest.json` for the JS budget.
 */
import type { IslandEntry } from './islands';

/** Island rows by `data-island` name. */
export const islandRegistry: Record<string, IslandEntry> = {};
