/**
 * The route table — the single source of every URL the site serves (React
 * migration, D-13). The prerenderer writes one file per row; the dev
 * middleware serves the same rows; `verify-dist.mjs` then proves every
 * internal link in the build resolves to one of them.
 *
 * URL SHAPE (unchanged, amendment U-1): every page path ends in a slash and is
 * written to `<path>index.html`; the 404 page is the one root-level file,
 * `/404.html`, which Workers serves for unknown URLs (`not_found_handling:
 * "404-page"`). A slashless URL is not a route, so it 404s in dev and preview
 * exactly as it does in production.
 */
import type { ReactElement } from 'react';
import { getLessons } from './content/lessons';
import { COURSE_ORDER, coursePath } from './lib/courses';
import { deploymentUrl } from './lib/deployment-url';
import About from './pages/About';
import CoursePage from './pages/CoursePage';
import DevRenderers from './pages/DevRenderers';
import Glossary from './pages/Glossary';
import Home from './pages/Home';
import LearnIndex from './pages/LearnIndex';
import LessonPage from './pages/LessonPage';
import NotFound from './pages/NotFound';

/** An HTML page. */
export interface PageRoute {
  kind: 'page';
  /** URL path, e.g. `/learn/arrays/` or `/404.html`. */
  path: string;
  /** The page body (rendered inside the render context). */
  element: () => ReactElement;
}

/** A generated text file (sitemap, robots). */
export interface FileRoute {
  kind: 'file';
  /** URL path, e.g. `/sitemap.xml`. */
  path: string;
  /** `Content-Type` for the dev server. */
  contentType: string;
  /** The file's bytes, given the deployment URL. */
  body: (site: string) => string;
}

/** One route. */
export type RouteDef = PageRoute | FileRoute;

/** The 404 page's path: the one page that is a file, not a directory. */
export const NOT_FOUND_PATH = '/404.html';

/**
 * Static, non-lesson routes the sitemap lists. Kept in one place so a new
 * top-level page is a single-line edit here (arch §4.1 trade-off). `/404` and
 * `/dev/renderers/` are deliberately excluded.
 */
const SITEMAP_STATIC_PATHS = [
  '/',
  '/learn/',
  ...COURSE_ORDER.map(coursePath),
  '/glossary/',
  '/about/',
] as const;

/**
 * `sitemap.xml` — hand-rolled (M5 architecture §4.2, spec §14), moved from the
 * retired `src/pages/sitemap.xml.ts` with byte-identical output. Zero
 * dependencies (arch §4.1 rejects `@astrojs/sitemap`). Enumerates the static
 * routes plus every PUBLISHED lesson, in file-name order. Each `<loc>` is
 * absolute, built by `deploymentUrl` from the one configured origin.
 *
 * @param site - The deployment URL.
 * @returns The XML.
 */
function sitemap(site: string): string {
  const lessonPaths = getLessons().map((l) => `/learn/${l.data.slug}/`);
  const urls = [...SITEMAP_STATIC_PATHS, ...lessonPaths]
    .map((path) => `  <url><loc>${deploymentUrl(site, path)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * `robots.txt` (M5 architecture §4.3, spec §14), moved from the retired
 * `src/pages/robots.txt.ts`: allows all crawlers and points them at the
 * sitemap, whose URL is templated from the deployment URL so the origin is
 * defined in exactly one place. `deploymentUrl` keeps `/sitemap.xml`'s
 * extension rather than adding a trailing slash.
 *
 * @param site - The deployment URL.
 * @returns The text.
 */
function robots(site: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${deploymentUrl(site, '/sitemap.xml')}
`;
}

/**
 * Every route, after the lessons have loaded.
 *
 * @returns Pages in output order, then the two text files.
 */
export function routes(): RouteDef[] {
  const page = (path: string, element: () => ReactElement): PageRoute => ({
    kind: 'page',
    path,
    element,
  });
  return [
    page('/', () => <Home />),
    page('/learn/', () => <LearnIndex />),
    ...COURSE_ORDER.map((course) =>
      page(coursePath(course), () => <CoursePage course={course} />),
    ),
    ...getLessons().map((entry) =>
      page(`/learn/${entry.data.slug}/`, () => <LessonPage entry={entry} />),
    ),
    page('/glossary/', () => <Glossary />),
    page('/about/', () => <About />),
    page('/dev/renderers/', () => <DevRenderers />),
    page(NOT_FOUND_PATH, () => <NotFound />),
    {
      kind: 'file',
      path: '/sitemap.xml',
      contentType: 'application/xml',
      body: sitemap,
    },
    {
      kind: 'file',
      path: '/robots.txt',
      contentType: 'text/plain',
      body: robots,
    },
  ];
}

/**
 * The `dist/`-relative file a route is written to.
 *
 * @param path - Route path.
 * @returns e.g. `learn/arrays/index.html`, `404.html`, `sitemap.xml`.
 */
export function outputFile(path: string): string {
  return path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
}
