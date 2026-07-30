/**
 * sitemap.xml — hand-rolled Astro static endpoint (M5 architecture §4.2, spec §14).
 *
 * Prerendered to `dist/sitemap.xml`. Zero dependencies (arch §4.1 rejects
 * `@astrojs/sitemap`): total control of inclusion and no new package. Enumerates
 * the four static routes plus every PUBLISHED lesson, excluding `/404` and any
 * unpublished lesson. Each `<loc>` is absolute, derived from `Astro.site` so the
 * placeholder-domain swap propagates from one config value.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Static, non-lesson routes to list. Kept in one place so a new top-level page is
 * a single-line edit here (arch §4.1 trade-off). `/404` is deliberately excluded.
 */
const STATIC_PATHS = ['/', '/learn', '/glossary', '/about'] as const;

export const GET: APIRoute = async ({ site }) => {
  // `site` comes from astro.config.mjs and is guaranteed set at build time.
  const toLoc = (path: string) => new URL(path, site).href;

  const published = await getCollection(
    'lessons',
    ({ data }) => data.published,
  );
  const lessonPaths = published.map((l) => `/learn/${l.data.slug}`);

  const urls = [...STATIC_PATHS, ...lessonPaths]
    .map((path) => `  <url><loc>${toLoc(path)}</loc></url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
