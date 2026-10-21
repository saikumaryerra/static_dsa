/**
 * Every React island hydrates without a mismatch, and actually activates
 * (react-migration-plan §2.2, §7, risk R5).
 *
 * A recoverable hydration error is the failure a reader never sees as a crash:
 * React throws the server markup away and re-renders on the client, so the
 * page "works" while the server/client contract is broken. The bootstrap
 * reports each one as a `ldsa:hydration-error` event (`utils/hydration.ts`
 * records them from before the first script runs).
 *
 * "No error" alone would pass vacuously on a page whose islands never
 * activated, so each check is paired with proof of activation: every
 * `[data-island]` container must become a React root, and every Visualizer
 * must reach `data-viz-ready`.
 *
 * Sample (plan §7): all 15 DSA lessons — every page that hosts an instrument —
 * plus `/` and `/about/`, which each render one. The three prose lessons
 * "after marking complete" in the plan's list belong to the ExplainBack island
 * that D-05 R-min' turned into a module, so they are not here.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHydrationErrors,
  watchHydrationErrors,
} from './utils/hydration';

const DSA_LESSONS = [
  'arrays',
  'binary-search',
  'complexity-big-o',
  'dynamic-programming',
  'graph-traversal',
  'graphs',
  'hash-tables',
  'heaps',
  'linked-lists',
  'queues',
  'recursion',
  'sorting-basics',
  'sorting-efficient',
  'stacks',
  'trees-bst',
];

const PAGES = [...DSA_LESSONS.map((slug) => `/learn/${slug}/`), '/', '/about/'];

/**
 * Scrolls every island into view, so `visible`-triggered ones activate.
 *
 * @param page - The page under test.
 */
async function visitEveryIsland(page: Page): Promise<void> {
  const islands = page.locator('[data-island]');
  const count = await islands.count();
  for (let i = 0; i < count; i += 1) {
    await islands.nth(i).scrollIntoViewIfNeeded();
  }
}

for (const path of PAGES) {
  test(`${path}: every island hydrates without a mismatch`, async ({
    page,
  }) => {
    await watchHydrationErrors(page);
    await page.goto(path);
    await visitEveryIsland(page);

    // React marks the container of every root it creates; a container
    // without the mark never activated.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-island]'))
              .filter(
                (el) =>
                  !Object.keys(el).some((key) =>
                    key.startsWith('__reactContainer'),
                  ),
              )
              .map((el) => (el as HTMLElement).dataset['island']),
          ),
        { message: 'islands that never activated', timeout: 15_000 },
      )
      .toEqual([]);

    for (const viz of await page.locator('[data-island="visualizer"]').all()) {
      await expect(viz).toHaveAttribute('data-viz-ready', 'true');
    }
    await expectNoHydrationErrors(page);
  });
}
