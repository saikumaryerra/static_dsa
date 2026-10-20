/**
 * The SSR entry (React migration, D-03 / D-04): everything the prerenderer and
 * the dev middleware (`scripts/vite-plugin-ssg.ts`) call. Bundled by Vite's
 * `ssr` environment into `.build/server/entry-server.js`, which is never
 * deployed; it holds the route table and all 127 compiled lessons.
 *
 * Two-pass render per page: the body renders with `renderToStaticMarkup`
 * inside a `RenderContextProvider` (no hydration markers in static content),
 * recording its head metadata, client modules and islands; `Document` then
 * renders the shell around that body string.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { loadLessons } from './content/lessons';
import { initHighlighter } from './lib/highlight';
import { Document, type PageAssets } from './render/Document';
import { createRenderContext, RenderContextProvider } from './render/context';
import { resolveSiteUrl } from './render/site-url';
import { routes as routeTable, type RouteDef } from './routes';

export type { PageAssets } from './render/Document';
export { NOT_FOUND_PATH, outputFile } from './routes';

/** One rendered page and what the prerenderer needs to know about it. */
export interface RenderedPage {
  /** The whole document, doctype included. */
  html: string;
  /** Island names on the page, in first-registration order. */
  islands: string[];
  /** Source paths each island loads on activation beyond its component. */
  islandAssets: Record<string, string[]>;
  /** Client module names, in first-registration order. */
  modules: string[];
}

let ready: Promise<void> | null = null;

/**
 * Prepare everything a render reads synchronously: the Shiki highlighter
 * (CodeTabs highlights during render) and the lesson collection (validated and
 * cross-checked here, so a bad lesson fails before the first page is written).
 * Idempotent.
 *
 * @returns Resolves when rendering may start.
 */
export function init(): Promise<void> {
  ready ??= Promise.all([initHighlighter(), loadLessons()]).then(() => {});
  return ready;
}

/**
 * Every route the site serves. Call after `init()`.
 *
 * @returns The route table.
 */
export function routes(): RouteDef[] {
  return routeTable();
}

/**
 * The deployment URL for this process's environment (throws on a publishing
 * builder without `SITE_URL`).
 *
 * @returns The deployment URL.
 */
export function siteUrl(): string {
  return resolveSiteUrl(process.env);
}

/**
 * Render one page. Call after `init()`.
 *
 * @param path - A page route's path.
 * @param assets - Where the page's stylesheet and scripts are served from.
 * @returns The document and its asset needs.
 * @throws On an unknown path or a page that recorded no metadata.
 */
export function render(path: string, assets: PageAssets): RenderedPage {
  const route = routeTable().find(
    (candidate) => candidate.kind === 'page' && candidate.path === path,
  );
  if (!route || route.kind !== 'page') {
    throw new Error(`render: no page route at "${path}".`);
  }
  const site = siteUrl();
  const context = createRenderContext(path, site);
  const body = renderToStaticMarkup(
    <RenderContextProvider value={context}>
      {route.element()}
    </RenderContextProvider>,
  );
  if (!context.meta) {
    throw new Error(
      `${path}: the page recorded no metadata — render it inside BaseLayout.`,
    );
  }
  const html = `<!DOCTYPE html>${renderToStaticMarkup(
    <Document
      meta={context.meta}
      pathname={path}
      site={site}
      modules={context.modules}
      hasIslands={context.islands.length > 0}
      assets={assets}
      body={body}
    />,
  )}`;
  return {
    html,
    islands: [...context.islands],
    islandAssets: Object.fromEntries(
      [...context.islandAssets].map(([name, set]) => [name, [...set]]),
    ),
    modules: [...context.modules],
  };
}
