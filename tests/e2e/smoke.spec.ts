import { expect, test } from '@playwright/test';

test('home renders: single visible h1, landmarks, and no console errors', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('/');

  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toBeVisible();

  // Semantic landmarks per spec §12.
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();

  // M1 acceptance: home renders with no console errors.
  expect(consoleErrors).toEqual([]);
});

test('skip link is the first tab stop and targets #main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute('href', '#main');
});

test('theme toggle flips data-theme, updates its label, and persists across reload', async ({
  page,
}) => {
  await page.goto('/');
  const html = page.locator('html');

  // The inline head script always resolves to an explicit theme.
  const initial = await html.getAttribute('data-theme');
  expect(initial === 'light' || initial === 'dark').toBe(true);
  const flipped = initial === 'dark' ? 'light' : 'dark';

  const toggle = page.locator('[data-theme-toggle]');
  await toggle.click();

  await expect(html).toHaveAttribute('data-theme', flipped);
  // aria-label describes the *next* action, matching the visible icon.
  await expect(toggle).toHaveAttribute(
    'aria-label',
    flipped === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );

  // Choice persists under the designer-mandated localStorage key…
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
    flipped,
  );

  // …and survives a reload (re-applied pre-paint by the inline script).
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', flipped);
});
