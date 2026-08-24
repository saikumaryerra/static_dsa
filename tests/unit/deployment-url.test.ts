/**
 * The declared-URL join, case by case (Plan D stage D3, plan §4.5).
 *
 * `src/lib/deployment-url.ts` is what lets ONE artifact declare correct
 * canonicals under `sample.com/learndsa` as well as at a root domain. Two defect
 * classes converge on it, and both are pinned below:
 *
 * 1. **Base loss.** `new URL(path, base)` drops the deployment's sub-path when
 *    `path` is root-absolute, and `new URL(base).origin` drops it by definition.
 *    The first test states that as an executable contrast rather than a comment,
 *    so "why not just use new URL" has an answer that runs.
 * 2. **A canonical that names a URL the site does not serve.** Every call site
 *    that authors a declared path is a chance to publish one, so each of the
 *    plan's three bullets — the sitemap's `STATIC_PATHS`, `LessonLayout`'s
 *    `/learn/<slug>/`, and `BaseLayout`'s `canonicalPath ?? Astro.url.pathname`
 *    default — gets a case here.
 *
 * The `index.html` cases are the sharp ones: `src/pages/dev/renderers.astro`
 * renders `<BaseLayout>` with NO `canonicalPath`, so that default is live on a
 * published page. Both shapes Astro could hand it are covered, because which one
 * it hands over is a build internal and this function should not care.
 */
import { describe, expect, it } from 'vitest';
import { deploymentUrl } from '../../src/lib/deployment-url';

/** The three deployment shapes R1/R3 promise to support. */
const ROOT = 'https://learndsa.dev';
const SUBPATH = 'https://sample.com/learndsa';
/** The e2e sub-path fixture's shape: a port and two path segments. */
const NESTED = 'http://localhost:4322/deployments/learndsa';

describe('deploymentUrl — the sub-path (requirement R3)', () => {
  /**
   * The reason this module exists at all. `new URL` is not merely inconvenient
   * here, it is wrong: it publishes a canonical the sub-path host does not serve.
   */
  it('keeps the sub-path that new URL() and .origin both discard', () => {
    expect(new URL('/learn/arrays/', SUBPATH).href).toBe(
      'https://sample.com/learn/arrays/',
    );
    expect(new URL(SUBPATH).origin).toBe('https://sample.com');

    expect(deploymentUrl(SUBPATH, '/learn/arrays/')).toBe(
      'https://sample.com/learndsa/learn/arrays/',
    );
  });

  it('joins at every deployment shape', () => {
    expect(deploymentUrl(ROOT, '/learn/arrays/')).toBe(
      'https://learndsa.dev/learn/arrays/',
    );
    expect(deploymentUrl(NESTED, '/learn/arrays/')).toBe(
      'http://localhost:4322/deployments/learndsa/learn/arrays/',
    );
  });

  it('treats a trailing slash on the deployment URL as noise', () => {
    expect(deploymentUrl(`${SUBPATH}/`, '/glossary/')).toBe(
      deploymentUrl(SUBPATH, '/glossary/'),
    );
    expect(deploymentUrl(`${ROOT}/`, '/')).toBe('https://learndsa.dev/');
  });

  it('renders the site root itself, with its slash', () => {
    expect(deploymentUrl(ROOT, '/')).toBe('https://learndsa.dev/');
    expect(deploymentUrl(SUBPATH, '/')).toBe('https://sample.com/learndsa/');
  });

  it('accepts a URL instance (Astro.site is one)', () => {
    expect(deploymentUrl(new URL(SUBPATH), '/about/')).toBe(
      'https://sample.com/learndsa/about/',
    );
  });
});

describe('deploymentUrl — path normalization (D1, trailingSlash: always)', () => {
  /**
   * `BaseLayout`'s default canonical is `Astro.url.pathname`, and under
   * `build.format: 'directory'` that is the shape most likely to arrive carrying
   * `index.html`. Leaking it would publish `…/dev/renderers/index.html` as the
   * page's own name for itself.
   */
  it.each([
    ['/index.html', 'https://sample.com/learndsa/'],
    ['/learn/index.html', 'https://sample.com/learndsa/learn/'],
    ['/dev/renderers/index.html', 'https://sample.com/learndsa/dev/renderers/'],
    ['/dev/renderers/', 'https://sample.com/learndsa/dev/renderers/'],
    // `format: 'file'`'s shape, still normalized: this function is not the place
    // to discover that someone changed the build format.
    ['/about.html', 'https://sample.com/learndsa/about/'],
  ])('strips %s to a directory URL', (path, expected) => {
    expect(deploymentUrl(SUBPATH, path)).toBe(expected);
  });

  /**
   * `sitemap.xml.ts`'s `STATIC_PATHS` and `LessonLayout`'s `canonicalPath`
   * already carry the slash; the normalization is what keeps a future one that
   * forgets it from publishing a `<loc>` the site answers with a redirect.
   */
  it('adds the trailing slash a page path is missing', () => {
    expect(deploymentUrl(ROOT, '/learn')).toBe('https://learndsa.dev/learn/');
    expect(deploymentUrl(ROOT, '/learn/binary-search')).toBe(
      'https://learndsa.dev/learn/binary-search/',
    );
  });

  it('leaves the already-correct page paths untouched', () => {
    for (const path of ['/', '/learn/', '/glossary/', '/about/']) {
      expect(deploymentUrl(ROOT, path)).toBe(`https://learndsa.dev${path}`);
    }
  });

  /**
   * Assets are declared URLs too — `og:image`, `twitter:image` and robots'
   * `Sitemap:` line — and a slash appended to one names a path no host serves.
   */
  it.each([
    ['/og-default.png'],
    ['/sitemap.xml'],
    ['/fonts/plex-sans.woff2'],
    ['/favicon.svg'],
  ])('keeps %s a file, with no trailing slash', (path) => {
    expect(deploymentUrl(SUBPATH, path)).toBe(
      `https://sample.com/learndsa${path}`,
    );
  });
});

describe('deploymentUrl — the guards', () => {
  /**
   * A relative path would join to the wrong place silently; a query or fragment
   * means the caller is describing a STATE of a page, which a canonical, an
   * `og:url` and a `<loc>` all deliberately cannot name. Both fail the build
   * instead, in `pageUrlOf`'s fail-loud style.
   */
  it.each([['learn/arrays/'], ['./learn/'], ['../about/'], ['']])(
    'rejects the non-root-absolute path %s',
    (path) => {
      expect(() => deploymentUrl(ROOT, path)).toThrow(/root-absolute/);
    },
  );

  it.each([['/learn/arrays/?review=1'], ['/glossary/#array']])(
    'rejects %s — a declared URL names a page, not a state',
    (path) => {
      expect(() => deploymentUrl(ROOT, path)).toThrow(/query or fragment/);
    },
  );

  it('rejects a deployment value that is not an absolute URL', () => {
    expect(() => deploymentUrl('sample.com/learndsa', '/')).toThrow();
  });
});
