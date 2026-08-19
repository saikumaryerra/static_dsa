/**
 * Plan C — the ledger and the instrument, asserted against the running site.
 *
 * These live here rather than in Vitest because every assertion is a question
 * about the built DOM, and the unit harness is `environment: 'node'` with no
 * DOM. The pure halves have their own files: `tests/unit/instrument-id.test.ts`
 * pins the id derivation (including the collision tiebreak, which no shipped
 * page currently triggers), and `tests/unit/ledger.test.ts` pins the ledger.
 */
import { expect, test, type Page } from '@playwright/test';

/** Every instrument root on the page, in document order, with its `id`. */
async function instrumentIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-viz]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('id') ?? ''));
}

test.describe('stable instrument ids', () => {
  /**
   * The id was `viz-${Math.random()…}` — the last `Math.random()` in `src/`, so
   * no anchor into a run survived a rebuild. Asserting the SHAPE rather than a
   * literal is deliberate: the hash is over `Astro.url.pathname`, which can
   * normalize differently between `astro dev` and the built output, so a pinned
   * value would be a false anchor. What matters is that it is derived, that it
   * names its algorithm, and that a page's instruments never collide.
   */
  test('instrument ids are stable and name their algorithm', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const ids = await instrumentIds(page);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^viz-binary-search-[a-z0-9]+$/);
    expect(ids[1]).toMatch(/^viz-linear-search-[a-z0-9]+$/);
    expect(new Set(ids).size).toBe(2); // collision-free on a two-instrument page
  });

  /**
   * `sorting-basics` is the page that motivated the collision tiebreak: three
   * instruments from one lesson. They differ by algorithm, so the tiebreak must
   * NOT fire here — the common case stays clean, with no `-2` suffix anywhere.
   */
  test('three instruments on one lesson get three clean, distinct ids', async ({
    page,
  }) => {
    await page.goto('/learn/sorting-basics');
    const ids = await instrumentIds(page);

    expect(ids).toEqual([
      expect.stringMatching(/^viz-bubble-sort-[a-z0-9]+$/),
      expect.stringMatching(/^viz-selection-sort-[a-z0-9]+$/),
      expect.stringMatching(/^viz-insertion-sort-[a-z0-9]+$/),
    ]);
    expect(new Set(ids).size).toBe(3);
  });

  /**
   * The eight derived ids (`-explain`, `-err`, `-help`, …) are template
   * literals off the same uid, so they move with it for free. This pins the
   * relationship rather than any one value, because row anchors (`${uid}-row-N`)
   * and `<StepLink>` are built on exactly this contract.
   */
  test('the derived control ids hang off the instrument id', async ({
    page,
  }) => {
    await page.goto('/learn/binary-search');
    const viz = page.locator('[data-viz]').first();
    const uid = await viz.getAttribute('id');

    expect(uid).toBeTruthy();
    await expect(viz.locator('[data-viz-explain]')).toHaveAttribute(
      'id',
      `${uid}-explain`,
    );
  });
});
