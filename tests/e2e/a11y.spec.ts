import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Spec §12 / M1 acceptance: axe on home with zero critical violations.
// Both themes are scanned — the token contrast tables claim AA in each.
for (const theme of ['light', 'dark'] as const) {
  test(`home (${theme} theme) has no critical axe violations`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.goto('/');

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      (violation) => violation.impact === 'critical',
    );

    expect(
      critical.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  });
}
