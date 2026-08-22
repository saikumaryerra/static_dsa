/**
 * The nav's "where am I" rule — D1's landmine, made a test instead of a hope.
 *
 * `trailingSlash: 'always'` (astro.config.mjs) moved every published URL, and
 * `NAV_ITEMS` moved with it: the hrefs are now `/learn/`, `/glossary/`,
 * `/about/`, because `SiteFooter` renders them verbatim and the slashless form
 * is a 404 under `astro preview`. That single edit breaks BOTH comparisons in
 * the old matching rule at once — `'/learn' === '/learn/'` is false, and the
 * descendant probe becomes `startsWith('/learn//')`, which no path satisfies.
 *
 * The second failure is the dangerous one: it is SILENT. Nothing 404s, no
 * console error appears, no visual regression is obvious at a glance — the
 * header just quietly stops saying where you are, which is the M7.1 IA-9 defect
 * returning by the back door. `navCurrent` answers it by normalizing both
 * sides, and these cases pin that.
 *
 * Pure-function tests, which is only possible because D1 lifted the rule out of
 * `SiteHeader.astro`'s frontmatter into `src/lib/nav.ts`: the Vitest harness is
 * `environment: 'node'` with no DOM, and `.astro` frontmatter is not importable.
 * The rendered half (that the header really marks the item, and that the footer
 * never claims one) stays in `tests/e2e/baseline-aria.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, navCurrent } from '../../src/lib/nav';

/** The shipped href for "Learn", as `SiteHeader`/`SiteFooter` render it. */
const LEARN = '/learn/';
/** The shipped href for "Glossary". */
const GLOSSARY = '/glossary/';

describe('NAV_ITEMS', () => {
  it('lists the three top-level destinations in display order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Learn',
      'Glossary',
      'About',
    ]);
  });

  /**
   * The href IS the shipped URL, because `SiteFooter` prints it with no
   * processing at all. A slashless entry here would ship two dead links per
   * page (header + footer) under `trailingSlash: 'always'` — the one failure
   * this whole file exists to make impossible to reintroduce quietly.
   */
  it('ships root-absolute, slash-terminated hrefs', () => {
    for (const { href, label } of NAV_ITEMS) {
      expect(href.startsWith('/'), `${label} href is root-absolute`).toBe(true);
      expect(
        href.endsWith('/'),
        `${label} href carries the shipped slash`,
      ).toBe(true);
    }
  });
});

describe('navCurrent', () => {
  it('marks the exact page "page"', () => {
    expect(navCurrent('/learn/', LEARN)).toBe('page');
    expect(navCurrent('/glossary/', GLOSSARY)).toBe('page');
  });

  it('marks a descendant "true", never "page"', () => {
    // A lesson is IN the Learn set but is not the Learn page. `aria-current`
    // reserves "page" for the exact URL (M7.1 IA-9).
    expect(navCurrent('/learn/binary-search/', LEARN)).toBe('true');
  });

  it('leaves unrelated destinations unmarked', () => {
    expect(navCurrent('/about/', LEARN)).toBeUndefined();
    expect(navCurrent('/', LEARN)).toBeUndefined();
    expect(navCurrent('/glossary/', LEARN)).toBeUndefined();
  });

  /**
   * THE D1 LANDMINE, both halves. If only the pathname were normalized (what
   * `SiteHeader` did before D1), the first of these would return `undefined`
   * instead of `'page'` and the second would return `undefined` instead of
   * `'true'` — because the href side would still be carrying its slash.
   */
  it('matches a slashless pathname against a slashed href', () => {
    expect(navCurrent('/learn', LEARN)).toBe('page');
    expect(navCurrent('/learn/binary-search', LEARN)).toBe('true');
  });

  /**
   * `/glossary/index.html` is not hypothetical: a directory build really does
   * serve it (200), and a reader who lands on that URL — from a file listing, a
   * copied path, a static host that exposes it — must still get a header that
   * says where they are. `/learn.html` is the retired `format: 'file'` shape,
   * kept working so the rule is not silently coupled to one build format.
   */
  it('normalizes the .html shapes a static host also serves', () => {
    expect(navCurrent('/glossary/index.html', GLOSSARY)).toBe('page');
    expect(navCurrent('/learn/index.html', LEARN)).toBe('page');
    expect(navCurrent('/learn.html', LEARN)).toBe('page');
    expect(navCurrent('/learn/binary-search.html', LEARN)).toBe('true');
  });

  /**
   * The descendant test is a PATH-SEGMENT test, not a string prefix. Were it
   * the latter, a future `/learning-path/` route would light up "Learn" from a
   * page that has nothing to do with it.
   */
  it('does not treat a longer sibling segment as a descendant', () => {
    expect(navCurrent('/learning/', LEARN)).toBeUndefined();
    expect(navCurrent('/learn-more/', LEARN)).toBeUndefined();
    expect(navCurrent('/aboutus/', '/about/')).toBeUndefined();
  });

  it('tolerates duplicated trailing slashes rather than failing to match', () => {
    expect(navCurrent('/learn//', LEARN)).toBe('page');
  });

  /**
   * The whole-nav property, which no single-item case can express: on any given
   * page AT MOST ONE item is ever marked. Two marked items would be an
   * `aria-current` contradiction — a screen reader announcing two "current"
   * destinations in one list.
   */
  it('never marks two destinations at once', () => {
    const paths = [
      '/',
      '/learn/',
      '/learn/binary-search/',
      '/glossary/',
      '/about/',
      '/404',
    ];
    for (const path of paths) {
      const marked = NAV_ITEMS.filter(
        (item) => navCurrent(path, item.href) !== undefined,
      );
      expect(
        marked.length,
        `${path} marks ${marked.length} nav items`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('marks nothing on the home page — the wordmark is the home link', () => {
    for (const item of NAV_ITEMS) {
      expect(navCurrent('/', item.href), item.label).toBeUndefined();
    }
  });
});
