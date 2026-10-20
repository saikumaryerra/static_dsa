/**
 * DRAFT replacement for `m7-player-v2.spec.ts` › "a renderer that cannot load
 * says so, and hides the controls it cannot drive" (react-migration-plan §7).
 *
 * NOT COLLECTED: Playwright only runs `*.spec.ts`/`*.test.ts`, and this file is
 * `*.draft.ts` on purpose. WS-I moves the test body into `m7-player-v2.spec.ts`
 * in P2, replacing the legacy test, when the Visualizer island lands; until
 * then it would fail (the legacy build has no `/assets/` chunks to abort).
 *
 * WHY IT CHANGES. The legacy test forced the failure by rewriting the root's
 * `data-renderer` to an unknown id and re-dispatching `astro:page-load` — a
 * simulated View-Transitions swap. The React build has neither Astro's
 * lifecycle event nor a re-init path, so the simulation has nothing to drive.
 * This version is stronger: the renderer chunk REALLY fails to load (the
 * network request is aborted before the page asks for it), which is the
 * failure a reader on a flaky connection actually meets. The four assertions
 * are the legacy test's, unchanged.
 */
import { expect, test } from '@playwright/test';

const LESSON = '/learn/binary-search/';
// The lesson hosts two array visualizers; scope to the binary-search one, as
// every other binary-search spec does.
const VIZ = '#viz-binary-search';

test('a renderer that cannot load says so, and hides the controls it cannot drive', async ({
  page,
}) => {
  // Abort the array renderer's chunk before navigation, so the very first
  // activation of the island meets a real load failure. The glob matches the
  // fingerprinted file name Vite emits (`assets/ArrayRenderer-<hash>.js`).
  await page.route('**/assets/ArrayRenderer-*.js', (route) => route.abort());
  await page.goto(LESSON);

  const viz = page.locator(`${VIZ} [data-viz]`);
  // The island activates when visible (plan §2.2), so bring it on screen.
  await viz.scrollIntoViewIfNeeded();

  // The failed state is a terminal one, so it must be visibly different from
  // "loading" — the audit's complaint was that a dead viz looked like a slow
  // one forever.
  await expect(viz).toHaveAttribute('data-viz-failed', 'true', {
    timeout: 15_000,
  });
  await expect(viz).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator(`${VIZ} .viz-unavailable`)).toContainText(
    'could not load',
  );
  // Controls that cannot work are hidden, not left dimmed and clickable.
  await expect(page.locator(`${VIZ} .viz-controls`)).toBeHidden();
});
