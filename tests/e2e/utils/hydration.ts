/**
 * Hydration-error detection for the React islands (react-migration-plan §2.2,
 * §7, risk R5).
 *
 * Every island is activated with `hydrateRoot(…, { onRecoverableError })`, and
 * that handler dispatches `new CustomEvent('ldsa:hydration-error', { detail: {
 * island } })` on `document`. A recoverable hydration error is exactly the
 * failure a reader never sees as a crash — React silently throws the server
 * markup away and re-renders on the client, so the page "works" while the
 * server/client contract is broken (and the island's first paint flickers). An
 * assertion is the only way it surfaces.
 *
 * The listener has to exist BEFORE any island activates, and an island can
 * activate as soon as the bootstrap module runs, so it is installed with
 * `addInitScript` (which runs ahead of every document's own scripts, on every
 * navigation of the page) rather than with `page.evaluate` after `goto`.
 *
 * DRAFT (migration P1): nothing calls this yet; `tests/e2e/hydration.spec.ts`
 * adopts it when the islands land (P2–P3). On the legacy Astro build no event
 * is ever dispatched, so a check written with it passes vacuously there —
 * which is why it must be paired with an assertion that the island activated.
 */
import { expect, type Page } from '@playwright/test';

/** The event the island bootstrap dispatches on `document` (plan §2.2). */
export const HYDRATION_ERROR_EVENT = 'ldsa:hydration-error';

/** The global the init script records into; namespaced to avoid collisions. */
const SINK = '__ldsaHydrationErrors';

/**
 * Starts recording hydration errors on every document `page` loads from now
 * on. Call before the first `goto`.
 *
 * @param page - The page under test.
 */
export async function watchHydrationErrors(page: Page): Promise<void> {
  await page.addInitScript(
    ({ event, sink }) => {
      const record: string[] = [];
      Object.defineProperty(window, sink, { value: record });
      document.addEventListener(event, (e) => {
        const island = (e as CustomEvent<{ island?: unknown }>).detail?.island;
        record.push(typeof island === 'string' ? island : '(unnamed island)');
      });
    },
    { event: HYDRATION_ERROR_EVENT, sink: SINK },
  );
}

/**
 * The islands that reported a hydration error on the current document, in
 * order. Throws when {@link watchHydrationErrors} was not called first: an
 * empty list from a page nobody was watching would be a false green.
 *
 * @param page - The page under test.
 * @returns The `detail.island` name of every error, in dispatch order.
 */
export async function hydrationErrors(page: Page): Promise<string[]> {
  return page.evaluate((sink) => {
    const record = (window as unknown as Record<string, unknown>)[sink];
    if (!Array.isArray(record)) {
      throw new Error('watchHydrationErrors(page) was not called before goto');
    }
    return record.map(String);
  }, SINK);
}

/**
 * Asserts that no island on the current document reported a hydration error.
 *
 * @param page - The page under test.
 */
export async function expectNoHydrationErrors(page: Page): Promise<void> {
  expect(await hydrationErrors(page), 'islands that failed to hydrate').toEqual(
    [],
  );
}
