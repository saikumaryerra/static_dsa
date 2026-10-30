/**
 * The per-page render context (React migration, D-04).
 *
 * Every page renders in two passes (`src/entry-server.tsx`): the body first,
 * with `renderToStaticMarkup` inside a `RenderContextProvider`, and then the
 * `Document` around it. Components use the first pass to RECORD what the
 * document needs — the page's head metadata (`usePageMeta`), the client
 * modules its behaviour lives in (`useClientModule`), the islands it hosts —
 * and to draw per-page state that Astro kept build-wide: the `uid()` counter
 * that mints ids like `pc-ask-N` (D-11: per page, so a page's ids no longer
 * depend on which pages Astro happened to render first) and the
 * instrument-id scope `claimInstrumentId` keys on (it took `Astro.request`).
 *
 * Mutating the context during render is safe here and only here: a static
 * render is one synchronous pass with no retries, and islands render in
 * isolation (`src/render/Island.tsx`) without this context at all.
 */
import { createContext, useContext } from 'react';

/** Head metadata for one page — what `BaseLayout.astro` took as props. */
export interface PageMeta {
  /** Full document title, e.g. `Glossary · LearnDSA`. */
  title: string;
  /** Meta description, also used for Open Graph and Twitter. */
  description: string;
  /** Path the canonical/OG URL names (default: the page's own path). */
  canonicalPath?: string;
  /** Open Graph type: `website` (default) or `article` (lessons). */
  ogType?: 'website' | 'article';
  /** Site-relative OG image path (default `/og-default.png`). */
  ogImage?: string;
  /** An inline-safe JSON-LD string (`src/lib/structured-data.ts`). */
  jsonLd?: string;
  /** `<meta name="robots" content="noindex">` (404, dev gallery). */
  noindex?: boolean;
}

/** What one page's render records and draws on. */
export interface RenderContext {
  /** The page's URL path, e.g. `/learn/arrays/` or `/404.html`. */
  readonly pathname: string;
  /** The deployment URL declared URLs are built from (`site-url.ts`). */
  readonly site: string;
  /** Head metadata, set exactly once by the page's layout. */
  meta: PageMeta | null;
  /** Client module names, in first-registration order. */
  readonly modules: string[];
  /** Island names on the page, in first-registration order. */
  readonly islands: string[];
  /**
   * Source paths (repository-relative) of chunks an island on this page loads
   * on activation beyond its own component, e.g. the Visualizer's algorithm and
   * renderer modules. Read by the prerenderer for `.build/page-manifest.json`.
   */
  readonly islandAssets: Map<string, Set<string>>;
  /** Scope object for `claimInstrumentId` — one per page. */
  readonly instrumentScope: object;
  /** Next per-page id number (1, 2, 3, …). */
  uid(): number;
}

/**
 * A fresh context for one page.
 *
 * @param pathname - The page's URL path.
 * @param site - The deployment URL.
 * @returns The context.
 */
export function createRenderContext(
  pathname: string,
  site: string,
): RenderContext {
  let counter = 0;
  return {
    pathname,
    site,
    meta: null,
    modules: [],
    islands: [],
    islandAssets: new Map(),
    instrumentScope: {},
    uid: () => {
      counter += 1;
      return counter;
    },
  };
}

const Context = createContext<RenderContext | null>(null);

/** Provides the page's context to the body render. */
export const RenderContextProvider = Context.Provider;

/**
 * The current page's render context.
 *
 * @returns The context.
 * @throws Outside a page render — e.g. inside an island, which renders
 *   without context by design (D-04).
 */
export function useRenderContext(): RenderContext {
  const context = useContext(Context);
  if (!context) {
    throw new Error(
      'useRenderContext() outside a page render. Islands render without context: pass what they need as props.',
    );
  }
  return context;
}

/**
 * Record the page's head metadata. Called once, by the layout.
 *
 * @param meta - The metadata.
 * @throws When a page records metadata twice (two layouts nested).
 */
export function usePageMeta(meta: PageMeta): void {
  const context = useRenderContext();
  if (context.meta) {
    throw new Error(
      `${context.pathname}: page metadata recorded twice ("${context.meta.title}", then "${meta.title}").`,
    );
  }
  context.meta = meta;
}

/**
 * Ask for a client module's `<script type="module">` on this page. Modules
 * load in first-registration order — the order Astro emitted component scripts
 * in — so document-level listeners keep their legacy registration order.
 *
 * @param name - Module name: `src/client/modules/<name>.ts`.
 */
export function useClientModule(name: string): void {
  const context = useRenderContext();
  if (!context.modules.includes(name)) context.modules.push(name);
}
