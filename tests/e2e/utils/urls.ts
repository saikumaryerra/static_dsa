/**
 * Reading a link the way a browser reads it — D2's one shared helper.
 *
 * Specs assert where a link GOES, not how its `href` is spelled. The helper was
 * born when the portable artifact (Plan D) rewrote every internal URL to a
 * document-relative one, so the same destination had as many spellings as the
 * site had depths. Portability is retired (react-migration D-01) and every
 * internal link is root-absolute again — `url-shape.spec.ts` pins that — but
 * the helpers stay, because "this link goes to that page" is still what each
 * of those tests means: resolving the href against the document that carries it
 * is a no-op on a root-absolute link, and still fails on a relative one that
 * points one level off.
 *
 * Links client JS builds (`lessonHref`/`reviewHref` in `src/lib/progress.ts`)
 * are root-absolute literals too, so one comparison covers server-rendered and
 * client-written links alike.
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
 * one-shot read would race the script that fills them.
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
