/**
 * M7.3 "Raise the brand" — the DOM half (docs/m7-ux-overhaul.md, Phase M7.3).
 *
 * Six things that only exist in a rendered page, and that no unit test or aria
 * snapshot can see:
 *
 *  - **The hero demo panel (IA-1 / VD-2).** The h1 promises motion and the first
 *    proof of it used to be two navigations deep. The panel has to be a real
 *    `renderStatic()` frame of the binary-search trace — the standing rule is
 *    "never hand-mock the product" — so the assertions below are written against
 *    the RENDERER's contract (the `cellId()` id vocabulary from
 *    `src/viz/core/ids.ts`, its class names, its `<title>`), not against the
 *    picture. Hand-authored markup can pass a screenshot; it cannot pass this.
 *  - **Lesson-card affordance (CMP-1).** The card said "link" to nobody: hover
 *    moved a 1px border, there was no pressed state, and the home track cards
 *    carried a "→" convention these 15 contradicted.
 *  - **The five-state recipe (CMP-8).** Declared once in `global.css`; asserted
 *    here both structurally (every control family owns an `:active` rule) and
 *    live (the primary CTA really does paint three different fills).
 *  - **The warning callout keyline (CMP-11).** Severity used to run backwards —
 *    the one variant that exists to stop a reader making a mistake had the
 *    weakest accent of the three.
 *  - **The elevation inversion itself (VD-3).** It was declared globally in
 *    `global.css` and then applied surface by surface, which is exactly the kind
 *    of rollout that half-lands: the assertions below read the level-1 recipe
 *    (`--surface`-or-tint fill + 1px keyline + a RESTING `--shadow-1`) off the
 *    four panels that took it, and check that prose inline code went the other
 *    way — down to the level -1 well, not up.
 *  - **`theme-color` (THM-1).** The one M7.3 surface that is not in the page at
 *    all: the browser's own chrome. The inversion moved light `--bg` off white,
 *    and three separate literals have to move with it — tokens.css, BaseLayout's
 *    media-scoped metas, and ThemeToggle's override meta. Only the third is
 *    reachable by clicking, and it is the one that was left behind.
 *
 * Plus two guards for the collapsible animation, which is a progressive
 * enhancement on a native `<details>` — and an enhancement that breaks the base
 * behaviour is a regression, not an enhancement: it must still open with JS
 * disabled (spec §4), and it must not skip its own subtree while it expands, or
 * the answer it just disclosed is missing from the tab order and the
 * accessibility tree at the moment a reader reaches for it.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  computed,
  luminance,
  parseHex,
  parseRgb,
  tokenColour,
  tokenStyle,
} from './utils/color';

const LESSON = '/learn/binary-search';
/** ≥1024px, where the hero is two columns and the lesson rail exists. */
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Bounding box of a locator, failing loudly instead of returning null. */
async function box(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no bounding box (not rendered?)');
  return rect;
}

/** Layout-only height, readable even for a box the UA is not painting. */
function rectHeight(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height);
}

// ---------------------------------------------------------------------------
// Hero demo panel (IA-1 / VD-2)
// ---------------------------------------------------------------------------

test.describe('hero demo panel', () => {
  test.use({ viewport: DESKTOP });

  test('sits beside the copy column at >=1024px', async ({ page }) => {
    await page.goto('/');

    const hero = await box(page.locator('.hero'));
    const panel = await box(page.locator('.hero-demo'));
    const cta = await box(page.getByRole('link', { name: 'Start learning' }));

    // Right column: the panel starts past the hero's midpoint...
    expect(panel.x).toBeGreaterThan(hero.x + hero.width / 2);
    // ...clear of the copy, which is what "two columns" means...
    expect(cta.x + cta.width).toBeLessThanOrEqual(panel.x);
    // ...and BESIDE it rather than under it (the mobile arrangement, asserted
    // separately below, would satisfy the two rules above just as well).
    expect(panel.y).toBeLessThan(cta.y + cta.height);
  });

  test('is the real renderer output, not a hand-drawn mock', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.locator('.hero-demo');
    const svg = panel.locator('svg');

    // The renderer's own accessible scaffold (src/viz/core/svg.ts): role=img
    // named by a <title>/<desc> pair whose ids come from the `idBase` the home
    // page passes.
    await expect(svg).toHaveAttribute('role', 'img');
    await expect(svg).toHaveAttribute(
      'aria-labelledby',
      'hero-demo-t hero-demo-d',
    );

    // The stable id vocabulary (`cellId(i)` → "i3"). Asserting the exact
    // sequence also pins that the cells are the renderer's, in its order.
    const ids = await panel
      .locator('.viz-cell')
      .evaluateAll((cells) => cells.map((cell) => cell.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(ids.map((_, index) => `i${index}`));

    // Mid-run, and provably so: a narrowed window (some cells eliminated), one
    // probed cell, and the range bar + "mid" label the ArrayRenderer draws as
    // the non-colour layer. Step 0 has none of this; the final frame has no
    // active probe.
    await expect(panel.locator('.viz-cell.is-active')).toHaveCount(1);
    await expect(panel.locator('.viz-cell.is-eliminated')).not.toHaveCount(0);
    await expect(panel.locator('.viz-range-bar')).toHaveCount(1);
    await expect(panel.locator('.viz-mid-label')).toHaveCount(1);

    // Same drawing as the lesson it links to. The panel derives its input from
    // `defaultInput()` and the lesson authors the same array on purpose — a
    // panel that promised a run and then showed a different one would be the
    // exact drift "never hand-mock the product" exists to prevent.
    const heroValues = await panel
      .locator('.viz-cell__value')
      .allTextContents();
    const heroTitle = await svg.locator('title').textContent();

    await page.goto(LESSON);
    const lessonViz = page.locator('#viz-binary-search');
    expect(
      await lessonViz.locator('.viz-cell__value').allTextContents(),
    ).toEqual(heroValues);
    expect(await lessonViz.locator('svg title').first().textContent()).toBe(
      heroTitle,
    );
  });

  test('links to a URL that actually resolves', async ({ page, request }) => {
    await page.goto('/');
    const panel = page.locator('.hero-demo');

    const href = (await panel.getAttribute('href')) ?? '';
    const [path, fragment] = href.split('#');
    expect(path).toBeTruthy();
    expect(fragment).toBeTruthy();

    // A real request against the BUILT site: `build.format: 'file'` emits
    // `learn/binary-search.html`, so a link that works in `astro dev` can still
    // 404 in production. Only an HTTP check catches that.
    const response = await request.get(path!);
    expect(response.status()).toBe(200);

    // …and the fragment resolves to something, not just the page.
    await panel.click();
    await expect(page).toHaveURL(new RegExp(`#${fragment}$`));
    await expect(page.locator(`#${fragment}`)).toBeVisible();
  });

  test('the primary CTA paints three distinct states (CMP-8)', async ({
    page,
  }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Start learning' });
    const fill = () => computed(cta, 'backgroundColor');

    const resting = await fill();
    await cta.hover();
    await expect.poll(fill).not.toBe(resting);

    const hovered = await fill();
    await page.mouse.down();
    // :active is a FILL change by design (never a transform — a button that
    // jumps under the finger fights 2.3.3), so the fill is the only channel
    // that can carry it.
    await expect.poll(fill).not.toBe(hovered);

    // Release away from the link: mousing up outside never activates it, so the
    // test cannot navigate on its way out.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });
});

test.describe('hero demo panel, below 1024px', () => {
  test.use({ viewport: MOBILE });

  test('stacks under the CTA row instead of shrinking beside it', async ({
    page,
  }) => {
    await page.goto('/');

    const panel = await box(page.locator('.hero-demo'));
    const cta = await box(page.getByRole('link', { name: 'Start learning' }));

    expect(panel.y).toBeGreaterThanOrEqual(cta.y + cta.height);
    // Same column, not indented into a second one (1px of tolerance for the
    // sub-pixel rounding a fluid grid can produce).
    expect(Math.abs(panel.x - cta.x)).toBeLessThanOrEqual(1);
  });
});

test.describe('hero demo panel, JavaScript disabled', () => {
  test.use({ viewport: DESKTOP, javaScriptEnabled: false });

  test('is drawn anyway, because it is build-time SVG', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('.hero-demo');

    await expect(panel).toBeVisible();
    await expect(panel.locator('svg')).toBeVisible();
    await expect(panel.locator('.viz-cell')).not.toHaveCount(0);
    // Values, not just boxes: an SVG that lost its text would still "render".
    const values = await panel.locator('.viz-cell__value').allTextContents();
    expect(values.every((value) => value.trim().length > 0)).toBe(true);

    // And it is NOT an island: the home page mounts no visualizer at all, so the
    // panel costs the page zero client JS whether or not JS is available.
    await expect(page.locator('[data-viz]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Elevation & affordance (CMP-1 / CMP-8 / VD-3)
// ---------------------------------------------------------------------------

test.describe('lesson cards', () => {
  test.use({ viewport: DESKTOP });

  test('state the "Start lesson" affordance on every card', async ({
    page,
  }) => {
    await page.goto('/learn');
    const cards = page.locator('[data-lesson-card]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const cues = await cards.locator('.lesson-card__cta').allTextContents();
    expect(cues).toHaveLength(count);
    for (const cue of cues) {
      expect(cue.replace(/\s+/g, ' ').trim()).toBe('Start lesson →');
    }
  });

  test('rest at elevation 1 and rise on hover', async ({ page }) => {
    await page.goto('/learn');
    const card = page.locator('[data-lesson-card]').first();
    const title = card.locator('.lesson-card__title');

    // VD-3's whole point: the card is separable from the page BEFORE anyone
    // points at it. Pre-M7.3 the shadow only existed on hover.
    const restingShadow = await computed(card, 'boxShadow');
    expect(restingShadow).not.toBe('none');
    const restingBorder = await computed(card, 'borderTopColor');
    const restingTitle = await computed(title, 'color');

    await card.hover();

    await expect
      .poll(() => computed(card, 'boxShadow'))
      .not.toBe(restingShadow);
    await expect
      .poll(() => computed(card, 'borderTopColor'))
      .not.toBe(restingBorder);
    // The title picks up the brand, so the thing under the pointer reads as the
    // link it is — and it is the BRAND, not some one-off colour.
    await expect
      .poll(() => computed(title, 'color'))
      .toBe(await tokenColour(page, '--brand'));
    expect(await computed(title, 'color')).not.toBe(restingTitle);
  });
});

test('every control family declares a pressed state (CMP-8)', async ({
  page,
}) => {
  // A lesson page carries BOTH stylesheets: the shared chrome (global.css) and
  // the visualizer's `is:global` block, which is where the transport lives.
  await page.goto(LESSON);

  const selectors = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        const selector = (rule as CSSStyleRule).selectorText;
        if (selector) found.push(selector);
        // @layer / @media / @supports wrappers nest the rules that matter.
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) walk(nested);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A cross-origin sheet would throw here; the site loads none.
      }
    }
    return found;
  });

  const pressed = selectors.filter((selector) => selector.includes(':active'));
  expect(pressed.length).toBeGreaterThan(0);
  // `.skip-link` is deliberately absent from this list: it is visible only while
  // focused and is activated with Enter, which paints no `:active` at all, so a
  // rule there could never run (documented exemption in global.css).
  for (const family of [
    '.nav-link',
    '.btn-primary',
    '.btn-secondary',
    '.track-card',
    '.viz-btn',
  ]) {
    expect(
      pressed.filter((selector) => selector.includes(family)),
      `${family} declares no :active rule`,
    ).not.toHaveLength(0);
  }
});

test('the warning callout keyline outranks note and tip (CMP-11)', async ({
  page,
}) => {
  // The one lesson that ships both variants, so the comparison is same-page and
  // same-theme.
  await page.goto('/learn/dynamic-programming');
  const warning = page.locator('.callout--warning').first();
  const tip = page.locator('.callout--tip').first();
  await expect(warning).toBeVisible();
  await expect(tip).toBeVisible();

  const attention = await tokenColour(page, '--accent-warn');
  const warningKeyline = await computed(warning, 'borderLeftColor');

  expect(warningKeyline).not.toBe(await computed(tip, 'borderLeftColor'));
  expect(warningKeyline).toBe(attention);
  // Not the grey it used to be — the encoding ran backwards before M7.3.
  expect(warningKeyline).not.toBe(await tokenColour(page, '--border-strong'));
  // The head travels with the keyline.
  expect(await computed(warning.locator('.callout__head'), 'color')).toBe(
    attention,
  );

  // …and colour is still not the only signal (WCAG 1.4.1): the triangle glyph
  // and the bold word both survive. (`--accent-warn` and `--hl-compare` carry
  // the same amber today, so no DOM assertion can tell them apart; the rule
  // that chrome never reads an `--hl-*` token is a source-level one.)
  await expect(warning.locator('.callout__label')).toHaveText('Warning');
  await expect(warning.locator('.callout__head svg')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// The elevation inversion (VD-3) — surface by surface
// ---------------------------------------------------------------------------

/**
 * Asserts global.css's level-1 recipe on one panel: the documented fill, a 1px
 * keyline, and a shadow that is there AT REST.
 *
 * "At rest" is the whole of VD-3. Before the inversion a light card was 1.07:1
 * against the page and grew a shadow only under the pointer, so nothing on the
 * page was findable before you pointed at it — which is why every assertion here
 * runs on an untouched page and why the shadow is compared to the `--shadow-1`
 * token rather than merely to `none`: a hover-strength `--shadow-2` at rest is
 * also wrong, and `not.toBe('none')` would wave it through.
 *
 * The keyline is read off the TOP edge on purpose: the callout paints its left
 * edge 4px in the variant accent, and that variant keyline is asserted by the
 * CMP-11 test above rather than here.
 *
 * @param page - The page the panel is on (used to resolve tokens in its theme).
 * @param panel - The panel to measure.
 * @param fill - The token the panel's fill must resolve to.
 */
async function expectLevelOne(
  page: Page,
  panel: Locator,
  fill: string,
): Promise<void> {
  await expect(panel).toBeVisible();
  expect(await computed(panel, 'backgroundColor')).toBe(
    await tokenColour(page, fill),
  );
  expect(await computed(panel, 'boxShadow')).toBe(
    await tokenStyle(page, 'box-shadow', '--shadow-1'),
  );
  // A fill this close to its backdrop cannot draw its own edge, so the keyline
  // is not optional decoration here: in light, --surface is 1.05:1 against --bg
  // and --brand-soft 1.07:1 (1.28:1 / 1.29:1 dark).
  expect(parseFloat(await computed(panel, 'borderTopWidth'))).toBeGreaterThan(
    0,
  );
  expect(await computed(panel, 'borderTopColor')).toBe(
    await tokenColour(page, '--border'),
  );
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`elevation, ${theme} theme`, () => {
    // Both themes, because the two halves of level 1 trade places between them:
    // in light the fill does almost nothing (--surface is white on a #F8FAFC
    // canvas) and --shadow-1 carries the separation, while in dark a shadow tops
    // out at 1.12:1 against the canvas and the fill and keyline carry it. A
    // one-theme test would pass on a build where the other theme lost its half.
    test.use({ viewport: DESKTOP, colorScheme: theme });

    test('the lesson callout and complexity table rest at level 1', async ({
      page,
    }) => {
      await page.goto(LESSON);
      await expectLevelOne(page, page.locator('.callout').first(), '--surface');
      await expectLevelOne(
        page,
        page.locator('.complexity-table'),
        '--surface',
      );
    });

    test('the hero panel and the 404 panel rest at level 1', async ({
      page,
    }) => {
      await page.goto('/');
      // Both are `--brand-soft` rather than `--surface`: they are the phase's
      // two brand moments, and the tint is the thing that says so.
      await expectLevelOne(page, page.locator('.hero-demo'), '--brand-soft');

      await page.goto('/404');
      await expectLevelOne(
        page,
        page.locator('.notfound__demo'),
        '--brand-soft',
      );
    });

    test('prose inline code sinks BELOW the card instead of floating above it', async ({
      page,
    }) => {
      await page.goto(LESSON);
      const code = page.locator('.lesson-body p code').first();
      await expect(code).toBeVisible();

      const fill = await computed(code, 'backgroundColor');
      // The regression this catches is not "a wrong hex": post-inversion
      // `--surface` IS the card fill, so a `token` span left on it disappears
      // into the callout or table cell around it, leaving only its keyline.
      expect(fill).toBe(await tokenColour(page, '--surface-sunken'));
      expect(fill).not.toBe(await tokenColour(page, '--surface'));
      expect(fill).not.toBe(await tokenColour(page, '--surface-raised'));
      // Direction, computed rather than asserted from the hex: a well is DARKER
      // than the card it is cut into, in both themes (--surface-sunken is a
      // shade lighter than the CANVAS in dark, which is why this compares
      // against the card).
      expect(luminance(parseRgb(fill))).toBeLessThan(
        luminance(parseRgb(await tokenColour(page, '--surface'))),
      );
      // …and a well takes no elevation shadow. Level -1 is a fill move only.
      expect(await computed(code, 'boxShadow')).toBe('none');
    });
  });
}

// ---------------------------------------------------------------------------
// Collapsible expand (CMP-13) — the enhancement must not break the base
// ---------------------------------------------------------------------------

test.describe('collapsible answers, JavaScript disabled', () => {
  test.use({ viewport: DESKTOP, javaScriptEnabled: false });

  test('a <details> still opens and its content is readable', async ({
    page,
  }) => {
    await page.goto(LESSON);

    const details = page
      .locator('details.collapsible')
      .filter({
        has: page.locator('summary', { hasText: 'Show answer to question 1' }),
      })
      .first();
    const content = details.locator('.collapsible__content');

    // Closed: `::details-content` is `content-visibility: hidden` (UA) plus the
    // animation's `block-size: 0`, so the answer contributes NOTHING to layout
    // and paints nowhere.
    //
    // Assert that, not the child's own rect: inside a `content-visibility:
    // hidden` container Chromium still reports a non-zero
    // getBoundingClientRect() for the skipped child (measured 119px) while
    // painting nothing — so a `rectHeight(content) === 0` check tests a browser
    // implementation detail rather than the requirement, and fails on a build
    // that is behaving perfectly. What matters to a reader is that the box did
    // not grow and the text is not on screen.
    expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(
      false,
    );
    const summaryHeight = await rectHeight(details.locator('summary'));
    const closedHeight = await rectHeight(details);
    // The whole element is still just its summary — the answer adds no height.
    expect(closedHeight).toBeLessThanOrEqual(summaryHeight + 1);
    // …the UA is skipping the subtree entirely (so it is neither painted nor
    // exposed to assistive tech)…
    expect(
      await details.evaluate(
        (el) => getComputedStyle(el, '::details-content').contentVisibility,
      ),
    ).toBe('hidden');
    // …and the slot it would occupy is collapsed and clipped, so even the
    // skipped child's reported rect falls outside the painted box.
    expect(
      await details.evaluate((el) => {
        const style = getComputedStyle(el, '::details-content');
        return { blockSize: style.blockSize, overflowY: style.overflowY };
      }),
    ).toEqual({ blockSize: '0px', overflowY: 'clip' });

    await details.locator('summary').click();

    expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(
      true,
    );
    // The answer is laid out AND the box it lives in really grew: an animation
    // whose open endpoint was wrong would leave the details at summary height
    // with the text overflowing a clipped, zero-height slot.
    await expect.poll(() => rectHeight(content)).toBeGreaterThan(0);
    await expect.poll(() => rectHeight(details)).toBeGreaterThan(closedHeight);
    await expect(content).toBeVisible();
    await expect(content).toContainText('About 10');
  });
});

test.describe('collapsible answers, keyboard', () => {
  test.use({ viewport: DESKTOP });

  /** The Practice disclosure this file uses, closed by default. */
  function practiceAnswer(page: Page): Locator {
    return page
      .locator('details.collapsible')
      .filter({
        has: page.locator('summary', { hasText: 'Show answer to question 1' }),
      })
      .first();
  }

  test('the subtree stops being skipped the instant it is disclosed', async ({
    page,
  }) => {
    await page.goto(LESSON);

    // The claim the Tab test below makes behaviourally, measured with no race
    // in it: the read happens in the SAME task as the mutation, so the expand
    // has had no frame to finish in.
    //
    // A `content-visibility` transition with `allow-discrete` holds the OLD
    // value for half its duration, so listing that property on the OPENING rule
    // keeps the subtree SKIPPED for the first frames of the expand — and a
    // skipped subtree is in neither the render tree nor the accessibility tree.
    // It belongs on the closing rule only, where it keeps the panel rendered
    // while it collapses; that is the directional split Collapsible.astro
    // documents, and the same defect the ToC's inline panel had. Reproduced
    // both ways in Chromium before this was written: with the property on the
    // opening rule this reads `hidden`, without it `visible`.
    const contentVisibility = await practiceAnswer(page).evaluate(
      (el: HTMLDetailsElement) => {
        el.open = true;
        return getComputedStyle(el, '::details-content').contentVisibility;
      },
    );
    expect(contentVisibility).toBe('visible');
  });

  test('Tab reaches the answer on the press right after it is disclosed', async ({
    page,
  }) => {
    await page.goto(LESSON);
    const details = practiceAnswer(page);

    // Not one `<Collapsible>` body in the 15 lesson files contains a focusable
    // element — they are all prose — so this test PUTS one there. That is
    // deliberate rather than convenient: what is under test is whether the
    // expand animation skips its own subtree, and "skipped" is only observable
    // from outside through something the tab order can land on. Prepended, so
    // the first Tab after the summary must reach it. (If an answer ever grows a
    // real link, point this test at that instead and delete the probe.)
    await details.locator('.collapsible__content').evaluate((el) => {
      const probe = document.createElement('a');
      probe.href = '#';
      probe.id = 'collapsible-focus-probe';
      probe.textContent = 'focus probe';
      el.prepend(probe);
    });

    const summary = details.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();

    // Native <details>: Enter toggles, no JS involved — the same keyboard path
    // the ToC test asserts on its inline panel.
    await page.keyboard.press('Enter');
    await expect(details).toHaveJSProperty('open', true);

    await page.keyboard.press('Tab');
    await expect(page.locator('#collapsible-focus-probe')).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// THM-1 — the browser chrome the inversion could leave behind
// ---------------------------------------------------------------------------

/**
 * The `theme-color` the browser is ACTUALLY honouring, and how it was chosen.
 *
 * The HTML spec takes the FIRST `theme-color` meta whose media matches, which is
 * the whole reason ThemeToggle inserts an un-scoped meta ahead of BaseLayout's
 * two media-scoped ones instead of editing them: an explicit choice has to
 * outrank the OS preference. Reading only `[content]` off the first meta in the
 * document, or only off the un-scoped one, would each test a different page than
 * the one the browser paints.
 *
 * @param page - The page to inspect.
 * @returns The winning meta's content and its `media` attribute (null when the
 *   un-scoped override meta won).
 */
async function effectiveThemeColour(
  page: Page,
): Promise<{ content: string; media: string | null }> {
  return page.evaluate(() => {
    const metas = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]',
      ),
    );
    const winner = metas.find((meta) => {
      const media = meta.getAttribute('media');
      return media === null || matchMedia(media).matches;
    });
    if (!winner)
      throw new Error('no theme-color meta matches the current media');
    return { content: winner.content, media: winner.getAttribute('media') };
  });
}

/**
 * The claim THM-1 exists to make: browser chrome is painted the same colour as
 * the page canvas, so the two do not meet in a visible seam.
 *
 * Compared as parsed channels, not as strings — the meta is authored in hex and
 * `getComputedStyle` always answers in `rgb()`, so a string comparison would be
 * red on a correct build.
 *
 * @param page - A loaded page.
 */
async function expectChromeMatchesCanvas(page: Page): Promise<void> {
  const meta = await effectiveThemeColour(page);
  const canvas = await computed(page.locator('html'), 'backgroundColor');
  expect(
    parseHex(meta.content),
    `theme-color ${meta.content} (media=${meta.media}) vs canvas ${canvas}`,
  ).toEqual(parseRgb(canvas));
}

test.describe('theme-color follows the canvas', () => {
  test.use({ viewport: DESKTOP });

  for (const scheme of ['light', 'dark'] as const) {
    test(`with no stored choice, on an OS-${scheme} device`, async ({
      browser,
    }) => {
      // A fresh context per colour scheme, with no `theme` key: this is the
      // media-scoped path, the one that also works with JS disabled.
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/');

      const meta = await effectiveThemeColour(page);
      expect(meta.media).toContain(scheme);
      await expectChromeMatchesCanvas(page);

      await context.close();
    });
  }

  test('after an explicit choice, in both directions', async ({ page }) => {
    // The override path, and the one nothing covered: the toggle writes its own
    // literal, so it is a THIRD copy of `--bg` that the elevation inversion had
    // to move (#FFFFFF → #F8FAFC). The page is driven through the actual button
    // rather than through localStorage, because the meta is written by the
    // click handler — seeding storage and reloading would take the media-scoped
    // path instead and never execute the line under test.
    await page.goto('/');
    const toggle = page.getByRole('button', {
      name: /^Switch to (dark|light) theme$/,
    });

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await effectiveThemeColour(page)).media).toBeNull();
    await expectChromeMatchesCanvas(page);

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // The direction that was actually wrong in the shipped build: an explicit
    // LIGHT choice wrote #FFFFFF while the canvas had moved to #F8FAFC.
    expect((await effectiveThemeColour(page)).media).toBeNull();
    await expectChromeMatchesCanvas(page);
  });

  test('an explicit choice outranks the OS preference', async ({ browser }) => {
    // The mechanism, stated separately: on an OS-dark device a reader who picks
    // light must get the LIGHT chrome, which only happens if the un-scoped meta
    // is inserted AHEAD of the media-scoped pair. Insert it after them and this
    // is the test that fails — every assertion above would still pass.
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/');

    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const meta = await effectiveThemeColour(page);
    expect(meta.media).toBeNull();
    await expectChromeMatchesCanvas(page);

    await context.close();
  });
});
