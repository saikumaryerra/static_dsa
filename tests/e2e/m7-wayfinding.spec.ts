/**
 * M7.2 — wayfinding that survives a 7,000px lesson (docs/m7-ux-overhaul.md
 * "Phase M7.2" → Wayfinding; audit IA-*, RSP-*).
 *
 * Three behaviours, each of which failed silently before M7.2 and each of which
 * is invisible to a static source review:
 *
 * 1. **Scroll-spy v2.** v1 asked an IntersectionObserver for "the first heading
 *    inside a narrow band", so for the ~90% of scroll positions where no heading
 *    sits in that band, NO entry was current. The contract now is "the last
 *    heading whose top passed the band", i.e. EXACTLY ONE current entry at every
 *    scroll position — which is why the assertions below deliberately sample
 *    mid-section, not just at a heading.
 * 2. **The sticky mini-ToC** below 1024px: reachable mid-page, operable by
 *    keyboard, and — because its panel is absolutely positioned — opening it
 *    must not shift the article under the reader's finger.
 * 3. **"Builds on:"** prerequisite chips: server-rendered (so they work with JS
 *    off) and pointing at lessons that really exist.
 *
 * `aria-current` is not serialized into aria snapshots, so `baseline-aria.spec.ts`
 * is structurally blind to all of (1) — this file is the only guard.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  scrollToBottom,
  scrollToInstant,
  waitForAnchorScroll,
} from './utils/scroll';

const LESSON = '/learn/binary-search';
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

/**
 * Waits until the lesson's LAYOUT has stopped moving, then returns to the top.
 *
 * Load-bearing for every offset this file measures: each visualizer mounts from
 * an IntersectionObserver and replaces a static still with a live SVG, which
 * changes the document height and therefore every heading's document-space top.
 * The spy itself copes (a ResizeObserver re-measures), but a test that captured
 * offsets BEFORE hydration would compare the spy's fresh verdict against stale
 * numbers — and only sometimes, depending on how fast the chunks arrive, which
 * is the definition of a flaky test.
 *
 * @param page - A loaded lesson page.
 */
async function settleLesson(page: Page): Promise<void> {
  const roots = page.locator('[data-viz]');
  const count = await roots.count();
  for (let i = 0; i < count; i += 1) {
    const root = roots.nth(i);
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
  }
  await scrollToInstant(page, 0);
}

/** Document-space top of each h2 that has a ToC entry, in document order. */
async function headingTops(page: Page): Promise<{ id: string; top: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'))
      .map((link) => (link.dataset['tocLink'] ?? '').slice(1))
      .filter((id, index, all) => id && all.indexOf(id) === index)
      .map((id) => {
        const el = document.getElementById(id)!;
        return { id, top: el.getBoundingClientRect().top + window.scrollY };
      }),
  );
}

/**
 * The "you are reading here" line the spy compares against, in CSS pixels.
 *
 * Read from the page rather than hardcoded, because it IS the heading's
 * `scroll-margin-top` (that is the single source of truth the spy uses so the
 * highlight and in-page jumps can never disagree), and it differs per
 * breakpoint: header height plus the mini-ToC bar below 1024px.
 *
 * @param page - The lesson page.
 * @param id - Any heading id the ToC links to.
 */
async function bandOffset(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (heading) =>
      parseFloat(
        getComputedStyle(document.getElementById(heading)!).scrollMarginTop,
      ) || 0,
    id,
  );
}

/**
 * Scrolls to a point that is UNAMBIGUOUSLY inside section `i`.
 *
 * Sampling the midpoint between two headings is not good enough: the band is
 * ~90–110px deep, so on a section barely taller than twice that, the midpoint
 * plus the band already reaches the NEXT heading — the assertion then depends on
 * the exact rendered height of the section, which changes with viewport, fonts
 * and hydration. Positioning the band line 60px below the heading instead is
 * stable for any section taller than that.
 *
 * @returns `false` when the section is too short to sample (caller skips it).
 */
async function scrollIntoSection(
  page: Page,
  tops: { id: string; top: number }[],
  i: number,
  band: number,
): Promise<boolean> {
  const from = tops[i]!;
  const next = tops[i + 1];
  const line = from.top + 60; // where the band must land: inside section i
  if (next && next.top <= line + 1) return false; // section too short to sample
  const scrollY = Math.round(line - band);
  if (scrollY < 0) return false; // section i starts above the first band line
  await scrollToInstant(page, scrollY);
  return true;
}

/** Every currently-marked entry in one ToC variant, as heading ids. */
async function currentIds(
  page: Page,
  variant: 'rail' | 'inline',
): Promise<string[]> {
  return page
    .locator(`.toc--${variant} [data-toc-link][aria-current]`)
    .evaluateAll((els) =>
      els.map((el) => (el.getAttribute('data-toc-link') ?? '').slice(1)),
    );
}

/**
 * Asserts that `id` — and ONLY `id` — is the current entry.
 *
 * Polled, and as ONE list comparison, for two reasons. The spy repaints inside a
 * `requestAnimationFrame`, so a value read immediately after a scroll can still
 * be the previous section (that race is exactly what made an earlier version of
 * this file fail under parallel load, and a flaky test is worse than none).
 * And comparing the whole list at once covers both halves of the contract in a
 * single assertion: never zero entries (the v1 bug), never two (a spy that
 * forgot to clear the previous one), always this one.
 */
async function expectCurrent(
  page: Page,
  variant: 'rail' | 'inline',
  id: string,
  message?: string,
): Promise<void> {
  await expect.poll(() => currentIds(page, variant), { message }).toEqual([id]);
}

test.describe('scroll-spy v2', () => {
  test('exactly one rail entry is current at every scroll position, including mid-section', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(LESSON);
    await settleLesson(page);

    const tops = await headingTops(page);
    expect(tops.length).toBeGreaterThanOrEqual(7); // the 7 lesson sections

    // Above the first heading: the first entry stays current rather than none.
    await scrollToInstant(page, 0);
    await expectCurrent(page, 'rail', tops[0]!.id, 'above the first heading');

    // MID-SECTION, section by section — the positions v1 left blank. A section
    // too short to hold the band is skipped rather than guessed at.
    const band = await bandOffset(page, tops[0]!.id);
    let sampled = 0;
    for (let i = 0; i < tops.length; i += 1) {
      if (!(await scrollIntoSection(page, tops, i, band))) continue;
      sampled += 1;
      await expectCurrent(
        page,
        'rail',
        tops[i]!.id,
        `reading inside #${tops[i]!.id}`,
      );
    }
    // Non-vacuous: if a layout change ever made every section unsamplable, the
    // loop above would assert nothing at all and still pass.
    expect(sampled).toBeGreaterThanOrEqual(5);

    // The very bottom of the page: still exactly one entry, and it is one of the
    // last sections rather than a reset to the top. Deliberately not pinned to
    // the FINAL section: under "last heading whose top passed the band", a final
    // section that begins within the last viewport-height can never cross the
    // band, so demanding it would be asserting a rule the design does not claim.
    // What the design does claim — never zero, never two — is what is checked.
    await scrollToBottom(page);
    const lastTwo = tops.slice(-2).map((h) => h.id);
    await expect
      .poll(
        async () => {
          const ids = await currentIds(page, 'rail');
          return ids.length === 1 && lastTwo.includes(ids[0]!);
        },
        {
          message: `at the bottom, one of ${lastTwo.join(' / ')} must be current`,
        },
      )
      .toBe(true);
  });

  test('an in-page jump ends with that section current, after the smooth scroll settles', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(LESSON);
    await settleLesson(page);

    // The spy reads live scroll positions, so it must resolve correctly all the
    // way through MOT-1's animation and settle on the jumped-to section — the
    // exact interaction M7.1 flagged as needing verification.
    const target = page.locator('.toc--rail [data-toc-link]').nth(3);
    const hash = (await target.getAttribute('data-toc-link'))!;
    await target.click();
    await expectCurrent(page, 'rail', hash.slice(1), 'after an in-page jump');
    // The heading really is where the reader was sent, once the animation ends.
    await waitForAnchorScroll(page);
    await expect(page.locator(hash)).toBeInViewport();
  });

  test('the mobile bar names the section it is currently in', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(LESSON);
    await settleLesson(page);

    const tops = await headingTops(page);
    const band = await bandOffset(page, tops[0]!.id);
    // Just inside a section, not on its heading: the bar has to name the
    // section a reader is READING, not only the one they last jumped to.
    const third = tops[2]!;
    expect(await scrollIntoSection(page, tops, 2, band)).toBe(true);

    await expectCurrent(
      page,
      'inline',
      third.id,
      `reading inside #${third.id}`,
    );
    // The collapsed bar's right-hand label mirrors the current entry, so the
    // reader knows where they are without opening anything.
    const linkText = await page
      .locator(`.toc--inline [data-toc-link="#${third.id}"]`)
      .textContent();
    await expect(page.locator('[data-toc-current]')).toHaveText(
      linkText!.trim(),
    );
  });
});

test.describe('sticky mini-ToC (below 1024px)', () => {
  test.use({ viewport: MOBILE });

  test('stays reachable mid-page and opens without shifting the article', async ({
    page,
  }) => {
    await page.goto(LESSON);

    const details = page.locator('[data-toc-inline]');
    const summary = details.locator('summary');
    const panel = details.locator('.toc__panel');

    // Deep into the lesson — the whole point of the bar is that it is still
    // there after 3,000px of prose.
    await scrollToInstant(page, 3000);
    await expect(summary).toBeInViewport();

    // It sits directly under the site header (top: var(--header-h)), not under
    // whatever the article has scrolled to.
    const headerBottom = await page
      .getByRole('banner')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const barTop = await summary.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(Math.abs(barTop - headerBottom)).toBeLessThanOrEqual(2);

    // Opening it must not move the article: the panel is absolutely positioned
    // precisely so the paragraph under the reader's finger stays put.
    const article = page.locator('.lesson__article');
    const before = (await article.boundingBox())!;
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await summary.click();
    await expect(panel).toBeVisible();
    const after = (await article.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    // The panel overlays the article rather than pushing it, and its links work:
    // choosing one closes the bar (a panel left open would cover the target).
    const link = panel.locator('[data-toc-link]').nth(1);
    const id = (await link.getAttribute('data-toc-link'))!.slice(1);
    await link.click();
    await expect(details).toHaveJSProperty('open', false);
    await expect(page.locator(`#${id}`)).toBeInViewport();
  });

  test('a jumped-to heading lands clear of BOTH the header and the bar', async ({
    page,
  }) => {
    await page.goto(LESSON);
    // Hydrated first: a visualizer that mounts DURING the smooth scroll changes
    // the document height under the animation, and this assertion is about
    // where the heading comes to rest.
    await settleLesson(page);

    const summary = page.locator('[data-toc-inline] summary');
    await scrollToInstant(page, 2500);
    await summary.click();
    const link = page
      .locator('.toc--inline .toc__panel [data-toc-link]')
      .nth(2);
    const id = (await link.getAttribute('data-toc-link'))!.slice(1);
    await link.click();
    await waitForAnchorScroll(page);

    // scroll-margin-top must clear the header AND the sticky bar; clearing only
    // the header parks the heading underneath the bar, which is what the old
    // hardcoded offset did.
    const barBottom = await summary.evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );
    const headingTop = await page
      .locator(`#${id}`)
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(headingTop).toBeGreaterThanOrEqual(barBottom - 1);
  });

  test('is fully keyboard operable, and Escape returns focus to the bar', async ({
    page,
  }) => {
    await page.goto(LESSON);
    await scrollToInstant(page, 2000);

    const details = page.locator('[data-toc-inline]');
    const summary = details.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();

    // Native <details>: Enter toggles. No JS is needed to open it, which is why
    // the panel still works with script disabled.
    await page.keyboard.press('Enter');
    await expect(details).toHaveJSProperty('open', true);
    await page.keyboard.press('Tab');
    await expect(
      details.locator('.toc__panel [data-toc-link]').first(),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(details).toHaveJSProperty('open', false);
    await expect(summary).toBeFocused();
  });
});

test('the rail is hidden on mobile and the bar is hidden on desktop — never both', async ({
  page,
}) => {
  // Two ToCs in the DOM means two copies of every link; only one may be exposed
  // at a time or the tab order carries the section list twice.
  await page.setViewportSize(MOBILE);
  await page.goto(LESSON);
  await expect(page.locator('.toc--inline')).toBeVisible();
  await expect(page.locator('.toc--rail')).toBeHidden();

  await page.setViewportSize(DESKTOP);
  await expect(page.locator('.toc--rail')).toBeVisible();
  await expect(page.locator('.toc--inline')).toBeHidden();
});

test('reduced motion turns the smooth scroll off and collapses the durations', async ({
  page,
}) => {
  // MOT-1's smooth scrolling and every transition on the page are opt-in for
  // readers who have not asked for less motion. The spy still has to resolve
  // (it reads live scroll positions either way), so this checks the CSS side:
  // the animation itself is what must disappear, not the behaviour it animates.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(DESKTOP);
  await page.goto(LESSON);

  const motion = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      scrollBehavior: root.scrollBehavior,
      // The three duration tokens every component reads; hardcoding a duration
      // anywhere would survive this check, which is why they are read here.
      durations: [
        root.getPropertyValue('--duration-fast').trim(),
        root.getPropertyValue('--duration-base').trim(),
        root.getPropertyValue('--duration-slow').trim(),
      ],
    };
  });
  expect(motion.scrollBehavior).toBe('auto');
  // Compared as TIME, not as text: the build's CSS minifier drops the leading
  // zero (`0.01ms` → `.01ms`), and what matters is that the value is effectively
  // instant however it is spelled.
  expect(motion.durations).toHaveLength(3);
  for (const duration of motion.durations) {
    const ms = duration.endsWith('ms')
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1000;
    expect(
      ms,
      `--duration ${duration} must collapse under reduced motion`,
    ).toBeLessThanOrEqual(1);
  }

  // …and an in-page jump still lands where it should, instantly.
  const target = page.locator('.toc--rail [data-toc-link]').nth(2);
  const hash = (await target.getAttribute('data-toc-link'))!;
  await target.click();
  await expect(page.locator(hash)).toBeInViewport();
  await expectCurrent(
    page,
    'rail',
    hash.slice(1),
    'after a reduced-motion jump',
  );
});

test.describe('"Builds on:" prerequisites', () => {
  test('renders chips that link to real lessons', async ({ page, request }) => {
    await page.goto(LESSON);

    const row = page.locator('.lesson__prereqs');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Builds on:');

    const links = row.locator('a');
    // binary-search declares two prerequisites, listed earliest-first by
    // curriculum order rather than the order they were typed in frontmatter.
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText('Complexity & Big-O');
    await expect(links.nth(1)).toHaveText('Arrays');

    for (const href of await links.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href')),
    )) {
      expect(href).toMatch(/^\/learn\/[a-z-]+$/);
      // A chip pointing at a 404 would be worse than no chip: the build guard
      // in [slug].astro exists to prevent it, and this proves it holds in the
      // shipped output.
      expect((await request.get(href!)).status()).toBe(200);
    }
  });

  test('a lesson with no prerequisites shows no empty row', async ({
    page,
  }) => {
    await page.goto('/learn/complexity-big-o');
    await expect(page.locator('.lesson__prereqs')).toHaveCount(0);
  });

  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('the chips are still there — they are server-rendered', async ({
      page,
    }) => {
      // Mobile, so the mini-ToC assertion below is made where that ToC is the
      // one on duty (the rail takes over at 1024px).
      await page.setViewportSize(MOBILE);
      await page.goto(LESSON);
      const row = page.locator('.lesson__prereqs');
      await expect(row).toBeVisible();
      await expect(row.locator('a')).toHaveCount(2);

      // The mini-ToC is a native <details>: it opens, lists every section and
      // navigates with no script at all.
      const details = page.locator('[data-toc-inline]');
      await expect(details.locator('summary')).toBeVisible();
      await details.locator('summary').click();
      await expect(details).toHaveJSProperty('open', true);
      const links = details.locator('.toc__panel [data-toc-link]');
      expect(await links.count()).toBeGreaterThanOrEqual(7);
      await expect(links.first()).toHaveAttribute('href', /^#/);
    });
  });
});
