/**
 * M7.2 — CodeTabs language memory and copy failure (docs/m7-ux-overhaul.md
 * "Phase M7.2" → `pref:code-lang` + CMP-9).
 *
 * The site ships 21 CodeTabs groups across 15 lessons, every one of them
 * defaulting to Python. A reader who works in JavaScript re-picked it 21 times.
 * M7.2 stores the choice in the §6 preference key `pref:code-lang` and syncs
 * sibling groups through a CustomEvent, with two constraints that are easy to
 * break and invisible in review: restoring a preference must never STEAL FOCUS
 * (which would drag a reader down to the first code block on every load), and
 * the sync must not move focus out of the group the reader is using.
 *
 * CMP-9 is the other half: a blocked clipboard used to report failure only
 * through the sr-only status node, so a sighted reader saw an unchanged "Copy"
 * button and assumed success.
 */
import { expect, test, type Page } from '@playwright/test';

const LESSON = '/learn/binary-search';
const OTHER_LESSON = '/learn/arrays';

/** The tab for one language inside the nth CodeTabs group on the page. */
function tab(page: Page, group: number, lang: string) {
  return page
    .locator('[data-codetabs]')
    .nth(group)
    .locator(`[data-lang="${lang}"]`);
}

/** The visible (non-hidden) panel of the nth group. */
function shownPanel(page: Page, group: number) {
  return page
    .locator('[data-codetabs]')
    .nth(group)
    .locator('[role="tabpanel"]:not([hidden])');
}

test('choosing a language switches every group on the page, without moving focus', async ({
  page,
}) => {
  await page.goto(LESSON);

  // The lesson ships two groups (binary search + the linear-search contrast),
  // both defaulting to the first tab.
  const groups = page.locator('[data-codetabs]');
  await expect(groups).toHaveCount(2);
  await expect(tab(page, 0, 'python')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 1, 'python')).toHaveAttribute('aria-selected', 'true');

  await tab(page, 0, 'javascript').click();

  // The group that was clicked switches…
  await expect(tab(page, 0, 'javascript')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tab(page, 0, 'python')).toHaveAttribute(
    'aria-selected',
    'false',
  );
  // …and so does its sibling, so one lesson never shows Python in one block and
  // Java in the next.
  await expect(tab(page, 1, 'javascript')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The panel that is actually showing in the sibling is the one that tab
  // labels — asserted structurally rather than by code text, which differs per
  // group (this lesson's second group is the linear-search contrast).
  await expect(shownPanel(page, 1)).toHaveAttribute(
    'aria-labelledby',
    (await tab(page, 1, 'javascript').getAttribute('id'))!,
  );

  // Focus stays where the reader put it: the sync must not yank them into the
  // other group.
  await expect(tab(page, 0, 'javascript')).toBeFocused();

  // Roving tabindex is rewritten in both groups, so Tab still lands on the
  // SELECTED tab rather than on a tab nobody chose.
  expect(
    await tab(page, 1, 'javascript').evaluate((el: HTMLElement) => el.tabIndex),
  ).toBe(0);
  expect(
    await tab(page, 1, 'python').evaluate((el: HTMLElement) => el.tabIndex),
  ).toBe(-1);

  expect(
    await page.evaluate(() => localStorage.getItem('pref:code-lang')),
  ).toBe('javascript');
});

test('the choice survives a reload and follows the reader to the next lesson', async ({
  page,
}) => {
  await page.goto(LESSON);
  await tab(page, 0, 'java').click();

  await page.reload();
  for (const group of [0, 1]) {
    await expect(tab(page, group, 'java')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }

  // A FRESH navigation to another lesson: the choice follows the reader across
  // the 21 groups of the curriculum, which is the whole reason it is stored.
  await page.goto(OTHER_LESSON);
  await expect(tab(page, 0, 'java')).toHaveAttribute('aria-selected', 'true');

  // Restoring must NOT steal focus, and must not scroll: the reader has just
  // arrived at the top of a lesson, and `select()` with focus would drag them
  // down to the first code block every single time. Asserted after a fresh
  // navigation rather than a reload, because a reload legitimately restores the
  // previous scroll position and would mask the bug either way.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'BODY',
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('arrow keys select and persist, like a click', async ({ page }) => {
  await page.goto(LESSON);

  const python = tab(page, 0, 'python');
  await python.focus();
  await page.keyboard.press('ArrowRight');

  // Automatic activation: the tab under focus becomes the selected one, and
  // that IS a language choice, so it persists exactly like a click.
  await expect(tab(page, 0, 'javascript')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tab(page, 0, 'javascript')).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem('pref:code-lang')),
  ).toBe('javascript');

  // …and wraps at the end, so the roving tab order is a loop.
  await page.keyboard.press('End');
  await expect(tab(page, 0, 'java')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 0, 'python')).toHaveAttribute('aria-selected', 'true');
});

test('a stored language no group offers leaves the default standing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('pref:code-lang', 'rust');
  });
  await page.goto(LESSON);

  // Nothing to restore is not an error: the server-rendered first tab stays
  // selected, and the tabs remain fully operable.
  await expect(tab(page, 0, 'python')).toHaveAttribute('aria-selected', 'true');
  await expect(shownPanel(page, 0)).toBeVisible();
});

test('a blocked clipboard says so where it can be SEEN (CMP-9)', async ({
  page,
}) => {
  // Simulates an insecure context / denied permission / embedded webview, all of
  // which reject (or throw) here. Installed before page scripts so the button's
  // own handler is the one that has to cope.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('clipboard blocked')),
      },
    });
  });
  await page.goto(LESSON);

  const copy = page.locator('.codetabs__copy').first();
  const label = copy.locator('.codetabs__copy-label');
  await expect(label).toHaveText('Copy');

  await copy.click();

  // Visible label, not only the sr-only status — and the warning glyph, so the
  // failure is never colour-only (WCAG 1.4.1).
  await expect(label).toHaveText('Copy failed');
  await expect(copy).toHaveAttribute('data-copy-failed', '');
  await expect(copy.locator('.codetabs__copy-icon--failed')).toBeVisible();
  await expect(copy.locator('.codetabs__copy-icon--copy')).toBeHidden();
  await expect(page.locator('[data-copy-status]').first()).toContainText(
    'Copy failed',
  );

  // The failure branch self-clears on the same timeout the success path uses,
  // so a stale "Copy failed" can never sit under a later success.
  await expect(label).toHaveText('Copy', { timeout: 5_000 });
  await expect(copy).not.toHaveAttribute('data-copy-failed');
});

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('every language is readable and no dead control is exposed', async ({
    page,
  }) => {
    await page.goto(LESSON);

    // The kill-switch reveals all panels with their language headings, because
    // without script there is no way to switch between them.
    await expect(page.locator('[role="tablist"]').first()).toBeHidden();
    await expect(page.locator('.codetabs__copy').first()).toBeHidden();
    const panels = page
      .locator('[data-codetabs]')
      .first()
      .locator('[role="tabpanel"]');
    await expect(panels).toHaveCount(3);
    for (const panel of await panels.all()) {
      await expect(panel).toBeVisible();
    }
    await expect(page.locator('.codetabs__lang').first()).toBeVisible();
  });
});
