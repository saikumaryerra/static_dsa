/**
 * M7.2 — glossary wayfinding (docs/m7-ux-overhaul.md "Phase M7.2" → Wayfinding).
 *
 * The glossary is ~12,000px of definition list. Three M7.2 changes make that
 * navigable, and all three are geometry or text-presence claims that only a real
 * browser can settle:
 *
 * 1. The A–Z strip is now sticky at EVERY breakpoint, as a single scrollable
 *    row. The old static bar sat at the top of the page, so after any scroll the
 *    jump nav was gone — it stopped existing exactly where it earns its keep.
 * 2. Per-term `id`s: lesson prose hard-links `/glossary#{term}`, so a term
 *    anchor has to land its `<dt>` clear of BOTH the header and that sticky
 *    strip. Clearing only the header parks the definition underneath the strip,
 *    which is what the old hardcoded ≥768px offset did (measured ~26px under).
 * 3. Aliases render as "Also called: …" — text that is not in the DOM can never
 *    be matched by find-in-page, which is the glossary's whole job on a page
 *    that ships no JS.
 *
 * `m5-glossary-about-seo.spec.ts` keeps the M5 letter-section coverage and the
 * axe gate; this file covers only what M7.2 added.
 */
import { expect, test, type Page } from '@playwright/test';
import { scrollToInstant, waitForAnchorScroll } from './utils/scroll';

const GLOSSARY = '/glossary';
/** A term deep in the page, so a jump to it is a real scroll. */
const DEEP_TERM = { anchor: 'quick-sort', text: 'Quick sort' };

const BREAKPOINTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

/** The sticky A–Z strip. */
const jumpBar = (page: Page) =>
  page.getByRole('navigation', { name: 'Jump to letter' });

test.describe('sticky A–Z strip', () => {
  for (const bp of BREAKPOINTS) {
    test(`stays pinned under the header and usable mid-page (${bp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(GLOSSARY);

      const bar = jumpBar(page);
      await expect(bar).toBeVisible();

      // 4,000px down the page — where the old static bar had long since gone.
      await scrollToInstant(page, 4000);
      await expect(bar).toBeInViewport();

      const headerBottom = await page
        .getByRole('banner')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const box = (await bar.boundingBox())!;
      expect(Math.abs(box.y - headerBottom)).toBeLessThanOrEqual(2);

      // The strip's REAL height must be the height CSS believes it has. Every
      // scroll-margin-top on this page derives from `--jump-bar-h`, and CSS
      // cannot measure a wrapped bar, so any drift between the two parks the
      // anchor landings back under the strip — the exact bug the old hardcoded
      // 7.75rem offset caused (~26px under, measured 1280×900).
      //
      // Asserted against the token, not against a fixed number: the shape is
      // deliberately per-breakpoint (one scrollable row below 768px, a wrapped
      // two-row bar above it — glossary.astro documents why), so a single
      // pixel budget could only ever be right at one width, while THIS holds at
      // every width and still fails the moment the two disagree.
      const declared = await page.evaluate(() => {
        const host = document.querySelector('.glossary');
        if (!host) throw new Error('no --jump-bar-h host on the page');
        // A probe resolves the calc() in its real inherited context; reading the
        // custom property back gives an unresolved token stream, not pixels.
        const probe = document.createElement('div');
        probe.style.height = 'var(--jump-bar-h)';
        host.append(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      });
      expect(declared).toBeGreaterThan(0);
      expect(Math.abs(box.height - declared)).toBeLessThanOrEqual(1);

      // Still operable from here: the chips are real links and a click jumps.
      const chip = page.locator('a.glossary__chip[href="#letter-s"]');
      await chip.click();
      await waitForAnchorScroll(page);
      await expect(page.locator('#letter-s-h')).toBeInViewport();
    });
  }

  test('a letter is reachable and activatable by keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(GLOSSARY);
    await scrollToInstant(page, 3000);

    const chip = page.locator('a.glossary__chip[href="#letter-h"]');
    await chip.focus();
    await expect(chip).toBeFocused();
    // The strip is a horizontal scroll container; focusing a chip must bring it
    // into view rather than leaving focus on something clipped off-screen.
    await expect(chip).toBeInViewport();
    await page.keyboard.press('Enter');
    await waitForAnchorScroll(page);
    await expect(page.locator('#letter-h-h')).toBeInViewport();
  });
});

test.describe('per-term anchors', () => {
  for (const bp of BREAKPOINTS) {
    test(`a /glossary#term deep link lands the term clear of header AND strip (${bp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      // The journey a lesson's prose link produces: a fresh load with a fragment.
      await page.goto(`${GLOSSARY}#${DEEP_TERM.anchor}`);
      await waitForAnchorScroll(page);

      const term = page.locator(`#${DEEP_TERM.anchor} .glossary__term`);
      await expect(term).toBeVisible();
      await expect(term).toHaveText(DEEP_TERM.text);
      // A <dt>, not a heading: the page keeps definition-list semantics.
      expect(await term.evaluate((el) => el.tagName)).toBe('DT');

      const headerBottom = await page
        .getByRole('banner')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const barBottom = (await jumpBar(page).boundingBox())!;
      const top = await term.evaluate((el) => el.getBoundingClientRect().top);

      expect(top).toBeGreaterThanOrEqual(headerBottom - 1);
      expect(
        top,
        'the term must clear the sticky A–Z strip too',
      ).toBeGreaterThanOrEqual(barBottom.y + barBottom.height - 1);
      // …and it is not pushed absurdly far down the viewport either.
      expect(top).toBeLessThan(bp.height / 2);
    });
  }

  test('every term is individually addressable', async ({ page }) => {
    await page.goto(GLOSSARY);

    // Ids are what the lessons link to, so each entry needs exactly one and no
    // two may collide (the build throws on a collision; this proves the shipped
    // page really carries them).
    const ids = await page
      .locator('.glossary__entry')
      .evaluateAll((els) => els.map((el) => el.id));
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(ids.filter((id) => !id)).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

test('aliases render as findable "Also called:" text', async ({ page }) => {
  await page.goto(GLOSSARY);

  const aliases = page.locator('.glossary__aliases');
  // Non-vacuous: many terms carry synonyms, and this is what makes a
  // find-in-page for "quicksort" or "ring buffer" hit on a JS-free page.
  expect(await aliases.count()).toBeGreaterThanOrEqual(10);
  for (const line of await aliases.allTextContents()) {
    expect(line.trim()).toMatch(/^Also called: \S/);
  }

  // Spot-check a specific synonym a reader would plausibly search for, in the
  // entry that owns it.
  await expect(page.locator('#quick-sort')).toContainText('Also called:');
  await expect(page.locator('#quick-sort')).toContainText('quicksort');
});

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the strip, the term anchors and the aliases all still work', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${GLOSSARY}#${DEEP_TERM.anchor}`);

    // Everything here is CSS + native anchors: no script is involved in any of
    // it, which is why the glossary is the page that must never need JS.
    await expect(jumpBar(page)).toBeVisible();
    await expect(
      page.locator(`#${DEEP_TERM.anchor} .glossary__term`),
    ).toHaveText(DEEP_TERM.text);
    expect(
      await page.locator('.glossary__aliases').count(),
    ).toBeGreaterThanOrEqual(10);

    // Sticky positioning is CSS, so the strip is still pinned after a scroll.
    await scrollToInstant(page, 4000);
    await expect(jumpBar(page)).toBeInViewport();
  });
});
