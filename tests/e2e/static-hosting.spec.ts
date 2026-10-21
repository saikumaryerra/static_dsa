/**
 * The built site behaves like a plain static site at its one origin
 * (react-migration-plan §7, decisions D-01 and D-13).
 *
 * This is the root-deployment half of what `portable.spec.ts` used to prove
 * under a sub-path. Portability is retired (D-01), but the reader-facing
 * guarantees it also covered are not: a lesson URL works when typed, pasted or
 * reloaded; the browser's own history moves between lessons; an unknown address
 * gets the 404 page WITH a 404 status; and every asset a lesson needs is really
 * served. Navigation is ordinary multi-page document navigation (no client
 * router), so each of these is a property of the files in `dist/` and of how
 * the host serves them — which is why they are asserted against
 * `npm run preview` (`scripts/serve-dist.mjs`), the dumbest static host that
 * still matches Workers' `not_found_handling: "404-page"`.
 *
 * One deliberate difference from production: Workers' `html_handling` redirects
 * a slashless page URL to its slashed form, while the preview server answers it
 * with a 404. The 404 is asserted here on purpose — it is what keeps a
 * slashless internal link from hiding behind a redirect (amendment U-1; the
 * link-level check is `url-shape.spec.ts`).
 */
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search/';

/** Three lessons in curriculum order, for the history walk. */
const WALK = ['/learn/arrays/', '/learn/linked-lists/', '/learn/stacks/'];

/** The page's one `<h1>`, as text. */
const h1 = (page: Page): Promise<string> =>
  page.locator('h1').first().innerText();

test('a deep link loads directly, and reloading it serves the same page', async ({
  page,
}) => {
  const first = await page.goto(LESSON);
  expect(first?.status(), 'deep link status').toBe(200);
  const title = await h1(page);
  expect(title.length, 'the lesson renders its heading').toBeGreaterThan(0);

  const again = await page.reload();
  expect(again?.status(), 'reload status').toBe(200);
  expect(new URL(page.url()).pathname, 'reload keeps the URL').toBe(LESSON);
  expect(await h1(page), 'reload serves the same document').toBe(title);
});

test('back and forward move between lessons as ordinary documents', async ({
  page,
}) => {
  // Seven full document loads of long lessons; measured at ~19 s on a loaded
  // 4-core machine, which is too close to the 30 s default to be anything but
  // a future flake.
  test.setTimeout(60_000);
  const titles: string[] = [];
  for (const path of WALK) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(200);
    titles.push(await h1(page));
  }
  // Three distinct documents, or the walk proves nothing.
  expect(new Set(titles).size).toBe(WALK.length);

  await page.goBack();
  expect(new URL(page.url()).pathname).toBe(WALK[1]);
  expect(await h1(page)).toBe(titles[1]);

  await page.goBack();
  expect(new URL(page.url()).pathname).toBe(WALK[0]);
  expect(await h1(page)).toBe(titles[0]);

  await page.goForward();
  expect(new URL(page.url()).pathname).toBe(WALK[1]);
  expect(await h1(page)).toBe(titles[1]);

  await page.goForward();
  expect(new URL(page.url()).pathname).toBe(WALK[2]);
  expect(await h1(page)).toBe(titles[2]);
});

test('an unknown URL serves the 404 document with a 404 status', async ({
  page,
  request,
}) => {
  // Two depths: the host's fallback must not depend on where the dead link
  // pointed, and the 404 document's root-absolute assets must load from both.
  for (const path of ['/no-such-page/', '/learn/no-such-lesson/']) {
    const raw = await request.get(path);
    expect(raw.status(), `${path} status`).toBe(404);
    expect(raw.headers()['content-type'], `${path} content type`).toContain(
      'text/html',
    );

    const response = await page.goto(path);
    expect(response?.status(), `${path} navigated status`).toBe(404);
    // The real 404 page, not an empty body or a lesson: its own heading, and
    // the noindex that keeps a dead address out of search results.
    await expect(page.locator('h1')).toHaveText('Page not found');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
    // Its stylesheet resolved from this depth: an unstyled 404 page would
    // still pass the two checks above.
    const sheets = await page.evaluate(
      () =>
        Array.from(document.styleSheets).filter((sheet) => {
          try {
            return sheet.cssRules.length > 0;
          } catch {
            return false;
          }
        }).length,
    );
    expect(sheets, `${path} loaded a non-empty stylesheet`).toBeGreaterThan(0);
  }
});

test('a slashless page URL is a 404, not a redirect, under the preview server', async ({
  request,
}) => {
  const response = await request.get(LESSON.replace(/\/$/, ''), {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  // …while the slashed form of the same page is served.
  expect((await request.get(LESSON)).status()).toBe(200);
});

test('every stylesheet, script, font and icon a lesson requests is served', async ({
  page,
  request,
}) => {
  /** Every asset response the page receives, as `[pathname, status, type]`. */
  const seen: [string, number, string][] = [];
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (['stylesheet', 'script', 'font', 'image'].includes(type)) {
      seen.push([new URL(response.url()).pathname, response.status(), type]);
    }
  });
  await page.goto(LESSON);
  // Bring every island on screen so the chunks loaded on activation (React,
  // the island components, the algorithm and renderer chunks) are requested
  // too, then let the network settle.
  const islands = page.locator('[data-island]');
  for (let i = 0; i < (await islands.count()); i += 1) {
    await islands.nth(i).scrollIntoViewIfNeeded();
  }
  for (const viz of await page.locator('[data-island="visualizer"]').all()) {
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
  }
  await page.waitForLoadState('networkidle');

  // Icons are not fetched by a headless page load, so each declared one is
  // requested directly — a missing favicon is invisible to the event above.
  const icons = await page
    .locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLLinkElement).href).pathname),
    );
  expect(icons.length, 'declared icons').toBeGreaterThan(0);
  for (const icon of icons) {
    seen.push([icon, (await request.get(icon)).status(), 'icon']);
  }

  const failed = seen.filter(([, status]) => status !== 200);
  expect(failed, 'asset requests that were not 200').toEqual([]);
  // Non-vacuous: the lesson really requested each kind.
  for (const type of ['stylesheet', 'script', 'font', 'icon']) {
    expect(
      seen.some(([, , kind]) => kind === type),
      `no ${type} request was seen`,
    ).toBe(true);
  }
});
