import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * M1 gap coverage — added by QA during independent M1 validation.
 *
 * Fills the acceptance-relevant gaps the base suite (smoke/a11y) does not cover:
 * - No-JS degradation (site spec §4: prose readable, toggle hidden, CSS
 *   prefers-color-scheme fallback themes the page).
 * - System-preference resolution and live matchMedia follow/unsubscribe
 *   (designer handoff, "Theme toggle spec").
 * - prefers-reduced-motion collapsing the duration tokens (§12/§13).
 * - Icon-shows-the-action behavior (moon in light, sun in dark).
 * - Full keyboard tab path (designer a11y checklist #2).
 * - Full-severity axe scan in both themes as the closest in-toolchain proxy
 *   for the "Lighthouse a11y >= 100 on home" acceptance gate (critical-only
 *   filtering, as in a11y.spec.ts, would let serious/moderate failures
 *   through — Lighthouse 100 tolerates none).
 */

const DARK_BG = 'rgb(11, 18, 32)'; // --bg dark: #0B1220 (designer handoff)
// M7.3 VD-3 inverted the light elevation model: the page canvas is now a tinted
// #F8FAFC and #FFFFFF moved to --surface (cards, the viz frame), so a resting
// card finally separates from the page. Was #FFFFFF through M7.2.
const LIGHT_BG = 'rgb(248, 250, 252)'; // --bg light: #F8FAFC

/** Computed background of <html>, which global.css paints with var(--bg). */
function htmlBackground(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
}

test.describe('no-JS degradation (spec §4)', () => {
  test.use({ javaScriptEnabled: false });

  test('prose renders, toggle is hidden, html carries no data-theme', async ({
    page,
  }) => {
    await page.goto('/');
    // Settle the just-started preview server before asserting prose visibility:
    // under full parallelism a cold-start goto can resolve before the document is
    // parsed, racing the paragraph check (T1 flake). Wait for parse to complete.
    await page.waitForLoadState('domcontentloaded');

    // All prose content must be fully readable without JS.
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('LearnDSA teaches the core')).toBeVisible();
    await expect(page.locator('.track-card')).toHaveCount(2);

    // The inline pre-paint script never ran: no data-theme attribute, so the
    // CSS `:root:not([data-theme])` fallback is in charge…
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');

    // …and the <noscript> rule hides the toggle, which would be a dead control.
    await expect(page.locator('.theme-toggle')).toBeHidden();
  });

  test('OS dark preference is honored via the CSS media fallback', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await htmlBackground(page)).toBe(DARK_BG);
  });

  test('OS light preference is honored via the CSS media fallback', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await htmlBackground(page)).toBe(LIGHT_BG);
  });
});

test.describe('theme resolution with no stored choice (system default)', () => {
  test('dark OS preference resolves to data-theme="dark" without writing a key', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // "System" is represented by the ABSENCE of a key — resolution must not write one.
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('follows OS scheme changes live while no localStorage key exists', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Designer spec: while no key exists, the island subscribes to matchMedia
    // changes and updates data-theme live.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Live-following is not a "choice": still no stored key.
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('first click from a system-dark baseline switches to light and persists', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    // The toggle must flip the RESOLVED theme (system dark), not a default.
    await page.locator('[data-theme-toggle]').click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
      'light',
    );
  });

  test('stops following the OS after an explicit choice (unsubscribe)', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');

    // Explicit choice: light OS -> click -> dark, key written.
    await page.locator('[data-theme-toggle]').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // If the island failed to unsubscribe, this OS round-trip would fire the
    // change handler, which resolves from the OS alone and would overwrite the
    // explicit dark choice with light.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });

    // Round-trip through the page so any change handlers have already run.
    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-color-scheme: dark)').matches,
      ),
    ).toBe(false);
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
      'dark',
    );
  });
});

test('toggle icon shows the action: moon in light mode, sun in dark mode', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
  });
  await page.goto('/');

  const moon = page.locator('.theme-toggle__icon--moon');
  const sun = page.locator('.theme-toggle__icon--sun');

  // Light mode: the visible icon advertises "switch to dark" (moon).
  await expect(moon).toBeVisible();
  await expect(sun).toBeHidden();

  await page.locator('[data-theme-toggle]').click();

  // Dark mode: sun ("switch to light").
  await expect(sun).toBeVisible();
  await expect(moon).toBeHidden();
});

test('prefers-reduced-motion collapses all duration tokens to near-zero', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const durations = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return ['--duration-fast', '--duration-base', '--duration-slow'].map(
      (token) => styles.getPropertyValue(token).trim(),
    );
  });

  for (const value of durations) {
    // Designer spec: 0.01ms (not 0, so transitionend still fires). The minifier
    // may emit ".01ms" — compare numerically.
    expect(value.endsWith('ms')).toBe(true);
    expect(parseFloat(value)).toBeGreaterThan(0);
    expect(parseFloat(value)).toBeLessThanOrEqual(0.01);
  }
});

test('keyboard tab path: skip link → logo → nav links → toggle → hero CTA', async ({
  page,
}) => {
  await page.goto('/');
  const banner = page.getByRole('banner');

  // Designer a11y checklist #2: tab order matches visual order.
  const stops = [
    page.locator('.skip-link'),
    banner.getByRole('link', { name: 'LearnDSA', exact: true }),
    banner.getByRole('link', { name: 'Learn', exact: true }),
    banner.getByRole('link', { name: 'Glossary', exact: true }),
    banner.getByRole('link', { name: 'About', exact: true }),
    page.locator('[data-theme-toggle]'),
    page.getByRole('link', { name: 'Start learning', exact: true }),
  ];

  for (const stop of stops) {
    await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
  }
});

// M1 acceptance says "Lighthouse a11y >= 100 on home". Lighthouse is not in the
// toolchain; a full axe scan with ZERO violations at ANY severity is the
// closest available proxy (a11y.spec.ts only gates on critical).
for (const theme of ['light', 'dark'] as const) {
  test(`full axe scan reports zero violations of any severity (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto('/');

    const results = await new AxeBuilder({ page }).analyze();

    expect(
      results.violations.map(
        (violation) =>
          `[${violation.impact}] ${violation.id}: ${violation.help}`,
      ),
    ).toEqual([]);
  });
}
