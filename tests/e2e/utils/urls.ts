/**
 * Reading a link the way a browser reads it — D2's one shared helper.
 *
 * `scripts/portablize.mjs` (Plan D §4.2) rewrites every internal URL in `dist/`
 * to a document-relative one so the artifact works under a sub-path as well as
 * at a root domain. The consequence for this suite is that an `href` attribute
 * is no longer the path it points at: the curriculum card that read
 * `/learn/arrays/` now reads `./learn/arrays/` on the home page and
 * `../../learn/arrays/` on a lesson, and the same destination therefore has as
 * many spellings as the site has depths.
 *
 * Asserting the new spellings would be the wrong repair — it would pin the
 * artifact's *encoding* in a dozen specs and re-break all of them the next time
 * the encoding moves. What each of those tests actually means is "this link goes
 * to that page", so that is what these two helpers say, by resolving the href
 * against the document that carries it. A prefix one level off changes the
 * resolved path and still fails, which is the property worth keeping.
 *
 * `dist/404.html` keeps root-absolute links by design (plan §4.4) — resolution
 * is a no-op on those, so the same helper reads them unchanged. The links client
 * JS builds go the other way: they are ABSOLUTE, resolved at runtime against the
 * deployment root (`siteRoot` in `src/lib/progress.ts`), which is one more
 * spelling of the same destination and one more reason to compare resolved
 * paths rather than attribute text.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The path a link points at, resolved against the page that carries it.
 *
 * @param pageUrl - The URL of the document the link lives in (`page.url()`).
 * @param href - The raw attribute value, relative or absolute.
 * @returns Path, query and fragment — everything below the origin, so a test
 * never has to know which host or port served the page.
 */
export function resolveFrom(pageUrl: string, href: string): string {
  const url = new URL(href, pageUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * An auto-retrying assertion about where a link goes.
 *
 * `expect.poll` rather than a single `getAttribute`, deliberately: some of these
 * hrefs are written by an island after hydration (the resume CTA), and a
 * one-shot read would race the script that fills them — the exact retry
 * `toHaveAttribute` used to provide before D2 made the raw attribute the wrong
 * thing to compare.
 *
 * @param page - The page under test.
 * @param link - The anchor.
 * @returns A poll matcher — `.toBe('/learn/arrays/')`, `.toMatch(/…/)`.
 */
export function linkTarget(page: Page, link: Locator) {
  return expect.poll(
    async () => {
      const href = await link.getAttribute('href');
      return href === null ? null : resolveFrom(page.url(), href);
    },
    { message: 'the page this link resolves to' },
  );
}
