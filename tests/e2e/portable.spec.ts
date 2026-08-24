/**
 * ONE ARTIFACT, ANY SUB-PATH — requirement R3, served rather than argued.
 *
 * `scripts/portablize.mjs` rewrites every internal URL in `dist/` to a
 * document-relative one so the same build works at `learndsa.dev`,
 * `sample.com/learndsa`, or a staging host, with no rebuild (Plan D §4.2). The
 * build asserts its own output and `tests/unit/portablize.test.ts` pins the
 * arithmetic, but neither of those is the claim. The claim is "a reader can use
 * the site from under a sub-path", and the only way to check it is to serve the
 * artifact from one and walk it.
 *
 * WHAT SERVES IT. `tests/e2e/fixtures/static-server.mjs`, mounted by
 * `playwright.config.ts` at a two-segment prefix on its own port — a
 * deliberately dumb host: no extension guessing, no redirect from `/x` to `/x/`,
 * nothing outside the prefix. Anything that works here works on `python -m
 * http.server`, an S3 website endpoint, or a folder inside somebody else's
 * domain, which is the requirement in its rawest form.
 *
 * WHY EVERY NAVIGATION HERE IS RELATIVE. `page.goto('/learn/…')` would drop the
 * sub-path and test the wrong thing; `goto('learn/…')` resolves against the
 * project's `baseURL`, which carries the prefix. This file never spells the
 * prefix out — it asserts only that there IS one — so the artifact cannot pass
 * by hardcoding whatever the fixture happens to use.
 *
 * THE ROOT HALF OF THE SAME PROOF IS THE REST OF THE SUITE: every other spec
 * runs against `astro preview` at `/`, over this same portablized `dist/`.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  daysAgo,
  masteryKey,
  seedComplete,
  seedStorage,
} from './utils/mastery';

/** A lesson: the deepest page shape (depth 2) and the one that hydrates most. */
const LESSON = 'learn/binary-search/';

/**
 * Records every response the browser could not load, and every uncaught script
 * error, for the life of a page.
 *
 * The sharpest instrument in this file. A stylesheet, font or chunk requested at
 * the wrong path does not throw and does not usually change the DOM — it 404s
 * quietly and the page renders unstyled or inert. Watching the network is what
 * turns that into a failure with a URL in it.
 */
function watchLoads(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failures.push(`failed ${request.url()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

/** The path segments in front of the site root, e.g. `/deployments/learndsa`. */
function prefixOf(url: string, sitePath: string): string {
  const { pathname } = new URL(url);
  expect(
    pathname.endsWith(sitePath),
    `${pathname} ends with the site path ${sitePath}`,
  ).toBe(true);
  return pathname.slice(0, pathname.length - sitePath.length);
}

test.describe('the artifact under a sub-path (Plan D R3)', () => {
  test('a lesson page loads its CSS, fonts and chunks, and hydrates', async ({
    page,
  }) => {
    const failures = watchLoads(page);
    await page.goto(LESSON);

    // The premise of every assertion below: this really is a sub-path.
    const prefix = prefixOf(page.url(), `/${LESSON}`);
    expect(prefix.length, 'the fixture serves from a sub-path').toBeGreaterThan(
      1,
    );

    // CSS. `--header-h` is a token every sticky offset on the site derives from,
    // so a stylesheet that 404'd leaves it empty — a cheaper and stricter signal
    // than any painted colour.
    const headerHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--header-h')
        .trim(),
    );
    expect(headerHeight, 'the token stylesheet loaded').not.toBe('');

    // Hydration. The island's chunks are reached through relative `src` and
    // relative inter-chunk imports; `data-viz-ready` only appears once the
    // renderer has mounted, so it cannot be true if any of them missed.
    const viz = page.locator('[data-viz]').first();
    await viz.scrollIntoViewIfNeeded();
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });

    // Fonts and chunks, from the browser's own load list — and every one of them
    // fetched from UNDER the prefix. A root-absolute survivor would show up here
    // as a URL missing the prefix, before it ever showed up as a 404.
    const loaded = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname),
    );
    const fonts = loaded.filter((path) => path.endsWith('.woff2'));
    const chunks = loaded.filter((path) => path.endsWith('.js'));
    const styles = loaded.filter((path) => path.endsWith('.css'));
    expect(fonts.length, 'self-hosted fonts fetched').toBeGreaterThan(0);
    expect(chunks.length, 'island chunks fetched').toBeGreaterThan(0);
    expect(styles.length, 'stylesheets fetched').toBeGreaterThan(0);
    expect(
      [...fonts, ...chunks, ...styles].filter(
        (path) => !path.startsWith(`${prefix}/`),
      ),
      'assets fetched from outside the sub-path — a root-absolute URL survived the pass',
    ).toEqual([]);

    expect(failures, 'requests the browser could not load').toEqual([]);
  });

  test('the wordmark, the nav and a lesson link all land inside the sub-path', async ({
    page,
  }) => {
    const failures = watchLoads(page);
    await page.goto(LESSON);
    const prefix = prefixOf(page.url(), `/${LESSON}`);

    // Depth 2 → depth 1. `../../glossary/` is the case a one-level-off prefix
    // gets wrong while still producing a URL that looks plausible.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Glossary' })
      .click();
    await expect(page).toHaveURL(`${prefix}/glossary/`);
    await expect(page.locator('h1')).toBeVisible();

    // Depth 1 → the site root, through the wordmark's `href="/"` — the single
    // value that becomes `./` at the root and `../../` on a lesson.
    await page.getByRole('link', { name: 'LearnDSA' }).first().click();
    await expect(page).toHaveURL(`${prefix}/`);

    // …and back down into a lesson from the home curriculum, which is how a
    // reader actually arrives.
    await page.locator('.curriculum .track__lesson').first().click();
    await expect(page).toHaveURL(new RegExp(`^.*${prefix}/learn/[a-z0-9-]+/$`));
    await expect(page.locator('h1')).toBeVisible();

    expect(failures, 'requests the browser could not load').toEqual([]);
  });

  test('a fragment link stays a fragment link', async ({ page }) => {
    await page.goto(LESSON);
    const prefix = prefixOf(page.url(), `/${LESSON}`);

    // The pass splits query and fragment off before rewriting the path. If it
    // ever reattached them in the wrong order this is where it shows: the ToC,
    // scroll-spy and `<StepLink>` are all fragment links, and a mangled one
    // navigates away instead of scrolling.
    //
    // The "On this page" bar is a native `<details>` at every width (M7.2), so
    // its links are display:none until it is opened — the same blind spot spec
    // §18 records for axe.
    await page.locator('[data-toc-inline] summary').click();
    const link = page.locator('[data-toc-link]').first();
    const fragment = (await link.getAttribute('href')) ?? '';
    expect(fragment, 'a ToC link is a bare fragment').toMatch(/^#[a-z0-9-]+$/);
    await link.click();
    await expect(page).toHaveURL(`${prefix}/${LESSON}${fragment}`);
    await expect(page.locator(fragment)).toBeVisible();
  });

  /**
   * THE DOCUMENTED DEGRADED STATE (plan §4.4), asserted so it stays a decision.
   *
   * A 404 document is served at the URL the reader typed, so relative links on
   * it would resolve against an arbitrary path. `dist/404.html` therefore keeps
   * root-absolute links — which under a sub-path point at the ORIGIN root, not
   * at the deployment. That is the accepted trade, and stage D3's `rehost` stamp
   * is what closes it for a manual deploy.
   */
  test('an unknown URL serves the site 404, whose links are root-absolute by design', async ({
    page,
  }) => {
    const response = await page.goto('learn/no-such-lesson/');
    expect(response?.status(), 'the fixture serves dist/404.html').toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');

    const hrefs = await page
      .locator('main a')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? ''),
      );
    expect(hrefs.length, 'the 404 offers a way out').toBeGreaterThan(0);
    expect(
      hrefs.filter((href) => !href.startsWith('/')),
      'a relativized link on the 404 — it would resolve against the dead URL',
    ).toEqual([]);
  });
});

/**
 * THE WALK, AND THE SWEEP — the two halves this file needs to be a proof.
 *
 * The block above checks the artifact one property at a time, each test entering
 * at the page it cares about. That leaves two things unchecked, and they are the
 * two a regression would actually surface as.
 *
 * THE WALK. A reader does not arrive at a lesson; they land on the home page,
 * cross to `/learn/`, pick a lesson, and use it. Three of those four documents
 * sit at a different depth, so the walk is the only place a prefix that is right
 * at one depth and wrong at another has nowhere to hide — and "the island
 * hydrated" is not "the island works", so the visualizer is STEPPED here rather
 * than merely observed.
 *
 * THE SWEEP. Everything else in this file follows the links it names. A future
 * `href="/learn/x"` would be introduced somewhere nobody named, so the sweep
 * names none of them: it reads every URL-bearing attribute in the live DOM,
 * AFTER hydration, and requires each one to resolve under the prefix. That is
 * the assertion that keeps the site portable by construction rather than by
 * whoever remembered to add a test.
 */
test.describe('the artifact under a sub-path — the reader’s walk', () => {
  test('home → /learn/ → a lesson: styled, fonted, hydrated, and operable', async ({
    page,
  }) => {
    // One watcher for the WHOLE journey, not one per page. A stylesheet that
    // 404s only on the second navigation is exactly the shape of a depth bug.
    const failures = watchLoads(page);

    // `'./'` and not `'/'`: a root-absolute goto would drop the sub-path and
    // quietly test the wrong deployment.
    await page.goto('./');
    const prefix = prefixOf(page.url(), '/');
    expect(prefix.length, 'the fixture serves from a sub-path').toBeGreaterThan(
      1,
    );

    // CSS APPLIED, not merely fetched. `html { font-family: var(--font-sans) }`
    // lives in the built stylesheet, so a 404'd one leaves the UA serif here —
    // a computed value that cannot be faked by the markup alone.
    const bodyFont = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    expect(bodyFont, 'the site stylesheet applied to the home page').toContain(
      'IBM Plex Sans',
    );

    // FONTS, from the font loader rather than the network log: `document.fonts`
    // only reports `loaded` once the file arrived AND parsed as a font, so a
    // 404 body served with a 200 (the classic sub-path failure on hosts that
    // rewrite everything to index.html) still fails here.
    const faces = await page.evaluate(async () => {
      // Awaited INSIDE the page and discarded: `document.fonts.ready` resolves
      // to the FontFaceSet itself, which is not serializable across the bridge.
      await document.fonts.ready;
      return [...document.fonts].map((face) => `${face.family} ${face.status}`);
    });
    expect(
      faces.filter((face) => face.startsWith('IBM Plex')),
      'the self-hosted Plex subsets loaded',
    ).toContain('IBM Plex Sans loaded');

    // Depth 0 → depth 1, through the nav rather than a typed URL.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Learn' })
      .click();
    await expect(page).toHaveURL(`${prefix}/learn/`);

    // Depth 1 → depth 2. The card IS the anchor (`<a data-lesson-card>`), and
    // its href is written by the build, so this is the ordinary reader path.
    await page.locator('[data-lesson-card][data-slug="binary-search"]').click();
    await expect(page).toHaveURL(`${prefix}/learn/binary-search/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // THE ISLAND, USED. Hydration proves the chunks arrived; stepping proves the
    // trace, the renderer and the transport all came with them. The totals are
    // read rather than spelled — this test is about URLs, not about how many
    // steps binary search takes.
    const viz = page.locator('#viz-binary-search [data-viz]');
    await viz.scrollIntoViewIfNeeded();
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
    const counter = page.locator('#viz-binary-search [data-viz-counter]');
    const explain = page.locator('#viz-binary-search [data-viz-explain]');
    await expect(counter).toHaveText(/^1 \/ \d+$/);
    const firstStep = (await explain.textContent()) ?? '';
    await page.locator('#viz-binary-search [data-viz-forward]').click();
    await expect(counter).toHaveText(/^2 \/ \d+$/);
    await expect(explain).not.toHaveText(firstStep);
    await page.locator('#viz-binary-search [data-viz-back]').click();
    await expect(counter).toHaveText(/^1 \/ \d+$/);

    // A FRAGMENT LINK LANDS ON ITS ELEMENT. The URL half is asserted above; what
    // matters to a reader is that the browser scrolled to the right box, which
    // only holds if the href stayed a bare `#id` (a relativized `../x/#id` would
    // reload the page and land at the top).
    await page.locator('[data-toc-inline] summary').click();
    const tocLink = page.locator('[data-toc-link]').nth(2);
    const fragment = (await tocLink.getAttribute('href')) ?? '';
    expect(fragment, 'a ToC link is a bare fragment').toMatch(/^#[a-z0-9-]+$/);
    await tocLink.click();
    await expect(page).toHaveURL(`${prefix}/learn/binary-search/${fragment}`);
    // `scroll-behavior: smooth` is live on this site, so the rect is polled to
    // its resting value rather than read once mid-animation.
    await expect
      .poll(
        async () =>
          page.locator(fragment).evaluate((element) => {
            const { top } = element.getBoundingClientRect();
            return top >= -2 && top < window.innerHeight;
          }),
        { message: 'the fragment target came to rest inside the viewport' },
      )
      .toBe(true);

    expect(failures, 'requests the browser could not load').toEqual([]);
  });
});

/** One URL-bearing attribute value, as the browser resolved it. */
interface UrlRef {
  attribute: string;
  value: string;
  where: string;
  resolved: string;
}

/**
 * Every same-origin URL the live DOM points at, resolved against the document.
 *
 * Reads the DOM rather than the file, on purpose: this is the only instrument in
 * the suite that can see a URL an island wrote after hydration. Cross-origin
 * values are skipped — canonical, `og:url` and the JSON-LD `url` are DECLARED
 * URLs, absolute by protocol requirement and stage D3's surface, not this one's.
 *
 * @param page - A page already navigated and hydrated.
 * @returns One entry per attribute value (per candidate, for `srcset`).
 */
async function siteUrls(page: Page): Promise<UrlRef[]> {
  return page.evaluate(() => {
    const attributes = ['href', 'src', 'srcset', 'action'];
    const found: UrlRef[] = [];
    for (const element of document.querySelectorAll(
      '[href], [src], [srcset], [action]',
    )) {
      for (const attribute of attributes) {
        const raw = element.getAttribute(attribute);
        if (raw === null) continue;
        // A srcset is a comma-separated list of "url descriptor" pairs; only the
        // url half is a URL.
        const candidates =
          attribute === 'srcset'
            ? raw.split(',').map((entry) => entry.trim().split(/\s+/)[0] ?? '')
            : [raw];
        for (const value of candidates) {
          if (value === '') continue;
          let url: URL;
          try {
            url = new URL(value, document.baseURI);
          } catch {
            continue; // not a URL the browser would fetch (`mailto:`, junk)
          }
          if (url.origin !== window.location.origin) continue;
          const id = element.id === '' ? '' : `#${element.id}`;
          found.push({
            attribute,
            value,
            where: `<${element.tagName.toLowerCase()}${id}>`,
            resolved: `${url.pathname}${url.search}${url.hash}`,
          });
        }
      }
    }
    return found;
  }) as Promise<UrlRef[]>;
}

test.describe('the artifact under a sub-path — nothing escapes it', () => {
  /**
   * Storage seeded so the ISLANDS' links exist to be swept.
   *
   * Both surfaces that build a URL in client JS are conditional on progress: the
   * resume line stays hidden until something is complete, and a review card
   * appears only for a lesson practised long enough ago. Sweeping a fresh
   * profile would therefore walk straight past the two links no HTML pass can
   * rewrite — the sweep would pass while seeing neither of them, which is how a
   * sub-path deployment shipped them broken in the first place.
   */
  test.beforeEach(async ({ page }) => {
    await seedComplete(page, ['complexity-big-o', 'arrays']);
    await seedStorage(page, {
      [masteryKey('arrays')]: JSON.stringify({
        practicedAt: daysAgo(40),
        masteredAt: null,
        checks: [],
      }),
      [masteryKey('binary-search')]: JSON.stringify({
        practicedAt: daysAgo(12),
        masteredAt: null,
        checks: [],
      }),
    });
  });

  /**
   * The three pages, each with the signal that says ITS islands have run.
   *
   * A sweep that reads the DOM before hydration is a sweep of the server's
   * output, which the build already asserts — so each page names something only
   * a script can produce. The resume line unhides once something is complete;
   * a lesson has no resume line, so it uses the visualizer's own ready flag.
   */
  const PAGES = [
    ['the home page', './', '[data-resume-link]'],
    ['the curriculum index', 'learn/', '[data-resume-link]'],
    ['a lesson', LESSON, '[data-viz][data-viz-ready="true"]'],
  ] as const;

  for (const [name, path, hydrated] of PAGES) {
    test(`${name} points at nothing above the sub-path`, async ({ page }) => {
      await page.goto(path);
      const prefix = prefixOf(page.url(), path === './' ? '/' : `/${path}`);

      // Give the islands their chance to write hrefs before the sweep reads
      // them: the review strip inserts its cards, and the resume line unhides.
      await expect(page.locator(hydrated).first()).toBeVisible({
        timeout: 15_000,
      });

      const refs = await siteUrls(page);
      // Non-vacuity. A sweep that found nothing would pass loudest of all.
      expect(refs.length, 'the sweep saw a populated document').toBeGreaterThan(
        20,
      );

      // NO EXCEPTIONS, and that is the change D2's repair bought: the sweep used
      // to carve out the two links client JS built as `/learn/…` — the resume
      // CTA and the review cards, the only links a returning reader clicks
      // first. They resolve against the site-root anchor now, so every URL in
      // the live DOM, server-rendered or written after hydration, has to land
      // inside the deployment.
      expect(
        refs
          .filter((ref) => !ref.resolved.startsWith(`${prefix}/`))
          .map((ref) => `${ref.where} ${ref.attribute}="${ref.value}"`),
        'a URL that leaves the sub-path. Either it is root-absolute in source and the pass missed it, or a script built it — resolve it against `siteRoot()` (src/lib/progress.ts).',
      ).toEqual([]);
    });
  }

  /**
   * THE RETURNING READER, WHICH IS THE WHOLE POINT OF THE REPAIR.
   *
   * The sweep above proves these two hrefs resolve inside the prefix; these two
   * tests prove they WORK, by clicking them against a fixture that 404s anything
   * outside the sub-path. Both links exist only for someone with stored
   * progress, which is exactly why they survived the first pass of this file
   * unfixed: a fresh profile never sees either one.
   *
   * One click per test, each ending on the page it opened. Written that way
   * deliberately — `watchLoads` counts an ABORTED request as a failure, and
   * navigating away from a page whose islands are still fetching chunks aborts
   * them, so a two-click walk would fail on its own housekeeping rather than on
   * anything about URLs.
   */
  test('a review card opens the lesson inside the deployment, review mode intact', async ({
    page,
  }) => {
    const failures = watchLoads(page);
    await page.goto('learn/');
    const prefix = prefixOf(page.url(), '/learn/');

    // The card the island inserts from `progress:v1:arrays` (practised 40 days
    // ago), followed like a reader follows it. `?review=1#practice` has to
    // survive the trip: the query turns Predict on for one visit, and the
    // fragment is what puts Practice on screen.
    const card = page.locator('[data-review-card="arrays"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    // `/learn/` hosts no instrument, so once its islands have run the network is
    // genuinely quiet; clicking mid-fetch would abort a chunk request.
    await page.waitForLoadState('networkidle');
    await card.click();

    await expect(page).toHaveURL(`${prefix}/learn/arrays/?review=1#practice`);
    await expect(page.locator('#practice')).toBeVisible();
    expect(failures, 'requests the browser could not load').toEqual([]);
  });

  test('the resume CTA opens the next lesson inside the deployment', async ({
    page,
  }) => {
    const failures = watchLoads(page);
    await page.goto('./');
    const prefix = prefixOf(page.url(), '/');

    const resume = page.locator('[data-resume-link]');
    await expect(resume).toBeVisible({ timeout: 15_000 });
    // The home hero is a live instrument that mounts LAZILY, so its renderer
    // chunks start arriving AFTER the network first goes quiet — measured:
    // waiting on idle alone left an aborted chunk request in about half of the
    // runs. `data-viz-ready` is the signal that they landed and ran, and it is
    // the same one the tests above use.
    await expect(
      page.locator('[data-viz][data-viz-ready="true"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await resume.click();

    // Two lessons are seeded complete, so the CTA points at the third — a slug
    // this test never spells, since where it goes is the site's business and
    // landing inside the deployment is this file's.
    await expect(page).toHaveURL(new RegExp(`^.*${prefix}/learn/[a-z0-9-]+/$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(failures, 'requests the browser could not load').toEqual([]);
  });
});
