/**
 * Course expansion — the gate's own end-to-end requirements
 * (`docs/courses/SPEC.md` §8, "End-to-end tests if the stack has them").
 *
 * The rest of this suite was written when the site had one course and fifteen
 * lessons, and it was repointed rather than extended: `/learn/` assertions
 * followed the cards to `/learn/dsa/`, per-lesson walks were scoped or given a
 * bigger budget. Repointing keeps the OLD claims true. Nothing in it asserts
 * that the two NEW courses work, which is what this file is for.
 *
 * Five things, and each one is a §8 checklist row rather than a hunch:
 *
 * 1. **Three widths, horizontal overflow.** 375 / 768 / 1280 are named in §8.
 *    The new lessons brought two prose artifacts the old ones never had — wide
 *    markdown tables and inline SVG figures — and both are exactly the shape
 *    that escapes a 375px viewport. Each one is wrapped in its own scroll
 *    container (`.table-scroll`, `.figure__frame`) precisely so the PAGE does
 *    not scroll; this asserts the outcome rather than the mechanism.
 * 2. **Console errors.** §8 says "no new console or runtime errors". A prose
 *    lesson ships almost no JS, so an error here means the shared chrome broke
 *    on a page shape it had not met.
 * 3. **Catalogue → course → module → lesson, by following real links.** Not by
 *    navigating to known URLs: the claim is that a reader can GET there. The
 *    module hop is a same-page fragment (`#track-…`) which must actually
 *    resolve to a heading, since a fragment that hits nothing fails silently.
 * 4. **Diagrams render.** Eleven `Figure`-based drawings across eleven lessons.
 *    A `<figure>` whose `<svg role="img">` carries a real accessible name, drawn
 *    with more than a couple of shapes — an empty frame with a caption would
 *    otherwise pass every other check in this suite.
 * 5. **axe, on the page shapes that are new.** The two course indexes and one
 *    lesson per course, both themes. `a11y.spec.ts` scans home only, and the
 *    per-lesson axe scans elsewhere are all on `dsa` lessons.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: walk all 112 lessons. Three specs
 * already iterate the whole curriculum and they are the reason the suite's
 * timeouts had to be raised; a fourth full walk would buy nothing this file
 * does not get from a sample plus `validate:content`, which reads every lesson
 * on every run and is a build gate. §8 asks for "a sample of lessons" and that
 * is what this takes.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolveFrom } from './utils/urls';

/** The three widths §8 names. Height is arbitrary; only the width is asserted on. */
const WIDTHS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

/** The two new courses, with the module and lesson each deep-link test walks to. */
const COURSES = [
  {
    id: 'kubernetes',
    path: '/learn/kubernetes/',
    heading: 'Kubernetes',
    /** First module and first lesson, i.e. the path a reader actually takes. */
    module: 'k8s-foundations',
    lesson: '/learn/k8s-what-kubernetes-is/',
    /** A lesson carrying both new prose artifacts — a wide table and a figure. */
    heavyLesson: '/learn/k8s-services/',
  },
  {
    id: 'system-design',
    path: '/learn/system-design/',
    heading: 'System Design',
    module: 'sd-foundations',
    lesson: '/learn/sd-design-workflow/',
    heavyLesson: '/learn/sd-comparison-table/',
  },
] as const;

/**
 * Every lesson that renders a `Figure`, and the diagram it renders.
 *
 * Hardcoded rather than derived, on purpose: derivation would read the same
 * source the page was built from, so a diagram that stopped rendering would
 * disappear from the expectation at the same moment it disappeared from the
 * page. A list is the only version of this assertion that can fail.
 */
const DIAGRAM_LESSONS = [
  '/learn/k8s-what-kubernetes-is/',
  '/learn/k8s-services/',
  '/learn/k8s-rolling-updates/',
  '/learn/sd-netflix-architecture/',
  '/learn/sd-netflix-video-delivery/',
  '/learn/sd-spotify-architecture/',
  '/learn/sd-spotify-recommendations/',
  '/learn/sd-youtube-upload-pipeline/',
  '/learn/sd-youtube-playback/',
  '/learn/sd-youtube-recommendations/',
  '/learn/sd-comparison-table/',
] as const;

/**
 * Collects console errors and page errors for the life of one page.
 *
 * Both channels matter and they are different: `console` catches a logged
 * error, `pageerror` catches an uncaught exception that never reached the
 * console. Returns a getter rather than the array so a caller cannot read it
 * before the navigation it is meant to cover has happened.
 */
function watchErrors(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    seen.push(`pageerror: ${error.message}`);
  });
  return () => seen;
}

/**
 * Whether the DOCUMENT scrolls horizontally at the current viewport.
 *
 * `scrollWidth > clientWidth` on the scrolling element, with a 1px tolerance
 * for sub-pixel layout rounding — a real overflow is tens of pixels wide, never
 * one. Deliberately measured on the document and not on descendants: a wide
 * table INSIDE `.table-scroll` is supposed to overflow its own container. What
 * must never happen is the page itself moving sideways.
 */
async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

/**
 * The widest element that sticks out past the viewport, for a readable failure.
 *
 * Only called when the check above has already failed, so the cost of walking
 * the whole tree is paid once, in the run that is going red anyway.
 */
async function widestOverflowingElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    let worst = '';
    let worstBy = 0;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const box = el.getBoundingClientRect();
      const by = Math.round(box.right - limit);
      if (by > worstBy) {
        worstBy = by;
        const cls =
          typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        worst = `${el.tagName.toLowerCase()}${cls} overflows by ${by}px`;
      }
    }
    return worst || 'no single element measured wider than the viewport';
  });
}

test.describe('the catalogue reaches both new courses', () => {
  test('every course card links to a course page that names itself', async ({
    page,
  }) => {
    await page.goto('/learn/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Courses');

    for (const course of COURSES) {
      const link = page.getByRole('link', { name: new RegExp(course.heading) });
      await expect(link.first()).toBeVisible();
      const href = await link.first().getAttribute('href');
      expect(
        resolveFrom(page.url(), href ?? ''),
        `the ${course.id} card must point at ${course.path}`,
      ).toBe(course.path);
    }
  });

  test('the dsa course is still reachable and still lists its lessons', async ({
    page,
  }) => {
    // §8's first checklist row: "the existing algorithm catalogue still works".
    // The catalogue moved out from under it, so the link is the claim.
    await page.goto('/learn/');
    await page
      .getByRole('link', { name: /Algorithms|Data Structures/ })
      .first()
      .click();
    await page.waitForURL(/\/learn\/dsa\/$/);
    await expect(
      page.getByRole('link', { name: /Binary Search/ }).first(),
    ).toBeVisible();
  });
});

for (const course of COURSES) {
  test.describe(`${course.id}`, () => {
    test('catalogue → course → module → lesson, following links only', async ({
      page,
    }) => {
      const errors = watchErrors(page);

      await page.goto('/learn/');
      await page
        .getByRole('link', { name: new RegExp(course.heading) })
        .first()
        .click();
      await page.waitForURL(new RegExp(`${course.path}$`));

      // The course page names itself and carries its modules as <h2>s.
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        course.heading,
      );
      const modules = page.locator('.course__section');
      expect(await modules.count()).toBeGreaterThan(3);

      // The module hop is a same-page fragment. A fragment that resolves to
      // nothing scrolls nowhere and reports no error, so assert the target
      // element exists before trusting the link.
      const moduleHeading = page.locator(`#track-${course.module}`);
      await expect(moduleHeading).toBeVisible();

      // …and the breadcrumb on a lesson points back at that exact fragment,
      // which is the only thing that makes the module a real destination.
      const firstLesson = page
        .locator(`.course__section`)
        .first()
        .getByRole('link')
        .first();
      await firstLesson.click();
      await page.waitForURL(/\/learn\/[a-z0-9-]+\/$/);

      const crumb = page.getByRole('link', { name: course.heading }).first();
      const crumbHref = await crumb.getAttribute('href');
      expect(resolveFrom(page.url(), crumbHref ?? '')).toBe(
        `${course.path}#track-${course.module}`,
      );

      // Back to the course page, and the fragment still resolves there.
      await crumb.click();
      await page.waitForURL(
        new RegExp(`${course.path}#track-${course.module}$`),
      );
      await expect(page.locator(`#track-${course.module}`)).toBeVisible();

      expect(errors(), 'no console or page errors on the whole walk').toEqual(
        [],
      );
    });

    test('a deep link straight to a lesson works without the walk', async ({
      page,
    }) => {
      // The URLs are published: search engines and the sitemap point at them
      // directly, so they must not depend on having come from the course page.
      const errors = watchErrors(page);
      await page.goto(course.lesson);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('link', { name: course.heading }).first(),
      ).toBeVisible();
      expect(errors()).toEqual([]);
    });

    for (const size of WIDTHS) {
      test(`no horizontal overflow at ${size.width}px (${size.name})`, async ({
        page,
      }) => {
        const errors = watchErrors(page);
        await page.setViewportSize({ width: size.width, height: size.height });

        // The course index, and the lesson carrying the artifacts most likely
        // to escape a narrow viewport.
        for (const path of [course.path, course.heavyLesson, course.lesson]) {
          await page.goto(path);
          // Figures and tables settle with the stylesheet, not with JS; waiting
          // on the load event is enough and keeps this cheap at three widths.
          await page.waitForLoadState('load');
          const overflow = await documentOverflow(page);
          if (overflow > 1) {
            const worst = await widestOverflowingElement(page);
            expect(
              overflow,
              `${path} scrolls sideways by ${overflow}px at ${size.width}px — ${worst}`,
            ).toBeLessThanOrEqual(1);
          }
          expect(overflow).toBeLessThanOrEqual(1);
        }

        expect(errors(), `console clean at ${size.width}px`).toEqual([]);
      });
    }
  });
}

test.describe('diagrams', () => {
  for (const path of DIAGRAM_LESSONS) {
    test(`${path} renders a real figure`, async ({ page }) => {
      await page.goto(path);

      const figure = page.locator('figure.figure').first();
      await expect(figure).toBeVisible();

      const svg = figure.locator('svg[role="img"]').first();
      await expect(svg).toBeVisible();

      // An accessible name, from the <title> the component wires up. An SVG
      // with role="img" and no name is a `serious` axe failure and, worse, a
      // drawing a screen reader cannot describe at all.
      const labelledBy = await svg.getAttribute('aria-labelledby');
      expect(labelledBy, 'the svg must be labelled').toBeTruthy();
      const title = page.locator(`#${labelledBy}`);
      await expect(title).toHaveCount(1);
      expect((await title.textContent())?.trim().length ?? 0).toBeGreaterThan(
        8,
      );

      // A described-by target too: the long description is what carries the
      // drawing's content to a reader who cannot see it.
      const describedBy = await svg.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const desc = page.locator(`#${describedBy}`);
      await expect(desc).toHaveCount(1);
      expect((await desc.textContent())?.trim().length ?? 0).toBeGreaterThan(
        40,
      );

      // Actually drawn. A figure that lost its shapes still has a frame, a
      // caption and both labels, and would pass every assertion above.
      const shapes = await svg
        .locator('rect, line, polygon, path, text')
        .count();
      expect(shapes, 'the diagram must contain shapes').toBeGreaterThan(10);

      // The drawing scrolls inside its own frame; the page does not.
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await documentOverflow(page)).toBeLessThanOrEqual(1);

      // And the frame is reachable by keyboard, since a scrollable region that
      // only a mouse can pan is a WCAG 2.1.1 failure.
      await expect(figure.locator('.figure__frame')).toHaveAttribute(
        'tabindex',
        '0',
      );
    });
  }
});

test.describe('accessibility of the new page shapes', () => {
  // The course index is a page shape that did not exist before; the lesson is
  // the prose-only shape, which no other axe scan in this suite covers.
  const TARGETS = [
    ...COURSES.map((course) => ({
      name: `${course.id} course index`,
      path: course.path,
    })),
    ...COURSES.map((course) => ({
      name: `${course.id} lesson`,
      path: course.heavyLesson,
    })),
  ];

  for (const target of TARGETS) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${target.name} (${theme}) has no serious or critical axe violations`, async ({
        page,
      }) => {
        await page.addInitScript((value) => {
          localStorage.setItem('theme', value);
        }, theme);
        await page.goto(target.path);

        // axe cannot see inside a closed <details> — the content is
        // `display: none`, so every node in it is excluded from the scan and
        // the run comes back green about markup it never looked at (spec §18;
        // doing this for the ledger found a real `serious` failure on its first
        // run). Every lesson here ends in three <PracticeCheck> disclosures,
        // which is where the new courses put a third of their markup.
        const opened = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('details'));
          all.forEach((el) => el.setAttribute('open', ''));
          return all.length;
        });
        // If this ever reads 0 on a lesson the assertion above is scanning less
        // than it claims to, and silently.
        if (target.name.endsWith('lesson')) {
          expect(
            opened,
            'a lesson must carry disclosures to open',
          ).toBeGreaterThan(0);
        }

        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter(
          (violation) =>
            violation.impact === 'critical' || violation.impact === 'serious',
        );

        expect(
          bad.map(
            (violation) =>
              `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`,
          ),
        ).toEqual([]);
      });
    }
  }
});
