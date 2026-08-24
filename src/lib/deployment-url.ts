/**
 * deployment-url.ts — the one place a DECLARED URL is built (Plan D stage D3,
 * plan §4.5).
 *
 * ── WHY THIS EXISTS AND `new URL()` DOES NOT DO IT ───────────────────────────
 * `new URL('/learn/x/', 'https://sample.com/learndsa')` returns
 * `https://sample.com/learn/x/`: a root-absolute path REPLACES the base path
 * rather than joining to it, so every sub-path deployment would publish a
 * canonical, an `og:url` and a sitemap `<loc>` pointing at the origin root — a
 * URL that host does not serve. `new URL(site).origin` is the same bug in
 * another costume: it throws the sub-path away by definition. Requirement R3
 * ("any sub-path") therefore needs an explicit join, and this is it.
 *
 * ── AND WHY IT NORMALIZES THE PATH ───────────────────────────────────────────
 * Declared URLs are authored at their own call sites — a `canonicalPath` prop
 * per page, `STATIC_PATHS` in the sitemap, `/learn/${slug}/` in the JSON-LD —
 * and each one is a chance to publish a URL the host would redirect. Two shapes
 * have to be neutralized rather than trusted:
 *
 * - **`index.html`.** `BaseLayout`'s default is `canonicalPath ?? Astro.url
 *   .pathname`, and `src/pages/dev/renderers.astro` ships with NO
 *   `canonicalPath`, so that default is a live code path on a published page.
 *   Whether Astro hands it `/dev/renderers/` or `/dev/renderers/index.html`
 *   depends on build internals this file should not have an opinion about, so it
 *   accepts both and emits one.
 * - **The trailing slash.** `trailingSlash: 'always'` (D1) makes the slashed
 *   form the only URL the site serves; a slashless canonical would name a URL
 *   that 301s on a real host and hard-404s under `astro preview`.
 *
 * An ASSET keeps its extension and gets no slash — `/og-default.png` and
 * `/sitemap.xml` are declared URLs too (`og:image`, robots' `Sitemap:` line),
 * and `/og-default.png/` is not a file anyone serves.
 *
 * Pure and injected, so it is testable in the node harness
 * (`tests/unit/deployment-url.test.ts`) rather than needing a browser.
 */

/**
 * Normalize a site-relative path to the shape the site actually serves.
 *
 * @param path - A root-absolute path, e.g. `/learn/arrays/` or `/index.html`.
 * @returns The same path with any `(/index)?.html` stripped and — for a
 *   directory path, never for a file with an extension — a trailing slash.
 */
function normalizePath(path: string): string {
  const withoutIndex = path.replace(/(?:\/index)?\.html$/i, '');
  const lastSegment = withoutIndex.slice(withoutIndex.lastIndexOf('/') + 1);
  // A dot in the last segment means a file: `/og-default.png`, `/sitemap.xml`,
  // `/fonts/plex-sans.woff2`. Those are served at exactly that name.
  if (lastSegment.includes('.')) return withoutIndex;
  return withoutIndex.endsWith('/') ? withoutIndex : `${withoutIndex}/`;
}

/**
 * Join a deployment URL — which MAY carry a sub-path — with a site-relative path.
 *
 * The single builder for every absolute URL the artifact declares about itself:
 * `<link rel=canonical>`, `og:url`, `og:image`, `twitter:image`, sitemap
 * `<loc>`, robots' `Sitemap:` line, and the JSON-LD `url` fields.
 *
 * @param deployment - The full deployment URL, sub-path included, e.g.
 *   `https://sample.com/learndsa` (usually `Astro.site`). A trailing slash on it
 *   is optional and makes no difference.
 * @param path - A root-absolute site path, e.g. `/`, `/learn/arrays/`,
 *   `/learn/index.html`, `/og-default.png`.
 * @returns The absolute URL, sub-path preserved and path normalized.
 * @throws If `path` is not root-absolute, or carries a query or fragment — a
 *   declared URL has neither, and silently dropping one would publish a
 *   canonical for a page that does not exist. Failing the build is the cheaper
 *   half of that trade.
 */
export function deploymentUrl(deployment: string | URL, path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(
      `deploymentUrl: "${path}" is not root-absolute. Declared URLs are authored as site paths (e.g. "/learn/arrays/") so the deployment's sub-path is the only base in play.`,
    );
  }
  if (/[?#]/.test(path)) {
    throw new Error(
      `deploymentUrl: "${path}" carries a query or fragment. A canonical, og:url or sitemap <loc> names a page, not a state of it.`,
    );
  }
  const base = new URL(deployment); // throws on anything not an absolute URL
  // `''` at the root, `/learndsa` under a sub-path — never a trailing slash, so
  // the normalized path (which always opens with one) supplies the join.
  const basePath = base.pathname.replace(/\/+$/, '');
  return `${base.origin}${basePath}${normalizePath(path)}`;
}
