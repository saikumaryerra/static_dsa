/**
 * The relative-URL pass, case by case (Plan D stage D2, requirement R3).
 *
 * `scripts/portablize.mjs` is what makes one built artifact deployable under
 * `sample.com/learndsa` as well as at a root domain: after `astro build` it
 * rewrites every root-absolute internal URL in `dist/` to a document-relative
 * one. The build asserts its own output ("no root-absolute URL survives"), but
 * that assertion only says the pass touched everything — it cannot say the pass
 * produced the RIGHT path, and a prefix that is one level off resolves to a URL
 * that is merely wrong rather than obviously absent.
 *
 * So the arithmetic is pinned here, at every depth the site has, with the exact
 * links the plan named as its test cases (§4.2): the wordmark's `href="/"`, and
 * the three URLs that carry a query or a fragment. The fragment cases are the
 * ones worth writing down — `/learn/#track-arrays` must become
 * `../learn/#track-arrays` and never `../learn#track-arrays/`, because the
 * second form breaks scroll-spy and the review deep-link in a way that is cheap
 * to specify here and miserable to diagnose in a browser.
 *
 * Pure functions, which is why they can live in Vitest at all: the harness is
 * `environment: 'node'` with no DOM, so the script exports its core and guards
 * its CLI entry point. The half that needs a real build and a real server —
 * "the artifact actually works when served under a sub-path" — is
 * `tests/e2e/portable.spec.ts`, and the half that guards against the pass being
 * skipped entirely is `tests/e2e/url-shape.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { parseDeployment } from '../../scripts/rehost.mjs';
import {
  basePathOf,
  canonicalHrefs,
  declaredBasePath,
  NOT_A_PAGE,
  pageUrlOf,
  prefixRootAbsolute,
  prefixFor,
  relativizeCss,
  relativizeHtml,
  relativizeSrcset,
  relativizeUrlValue,
  rootAbsoluteAttributeUrls,
  rootAbsoluteCssUrls,
  runtimeAbsoluteLiterals,
  siteRootHrefs,
  runtimeRootBases,
} from '../../scripts/portablize.mjs';

/** The three depths this site has, and the prefix each one needs. */
const HOME = '/';
const SECTION = '/about/';
const LESSON = '/learn/binary-search/';

describe('pageUrlOf', () => {
  it('derives the served URL from the built file path', () => {
    expect(pageUrlOf('index.html')).toBe(HOME);
    expect(pageUrlOf('about/index.html')).toBe(SECTION);
    expect(pageUrlOf('learn/binary-search/index.html')).toBe(LESSON);
    // `/dev/renderers/` ships (conditionally rendered, inert) and is a page like
    // any other, so it is covered by the same arithmetic rather than special-cased.
    expect(pageUrlOf('dev/renderers/index.html')).toBe('/dev/renderers/');
  });

  /**
   * A loose `.html` means `build.format` moved back to `'file'`, and the depth
   * rule for `about.html` is not the depth rule for `about/index.html`. Failing
   * is the only honest answer: a guess here would emit links that are wrong by
   * exactly one level on every page.
   */
  it('refuses a file that is not a directory-format page', () => {
    expect(() => pageUrlOf('about.html')).toThrow(/directory-format/);
  });
});

describe('prefixFor', () => {
  it('counts one `../` per path segment, and `./` at the root', () => {
    expect(prefixFor(HOME)).toBe('./');
    expect(prefixFor(SECTION)).toBe('../');
    expect(prefixFor(LESSON)).toBe('../../');
    expect(prefixFor('/dev/renderers/')).toBe('../../');
  });
});

describe('relativizeUrlValue', () => {
  /** Plan §4.2's first named case: the wordmark, from the two extreme depths. */
  it('rewrites the wordmark `href="/"` to exactly the prefix', () => {
    expect(relativizeUrlValue('/', prefixFor(HOME))).toBe('./');
    expect(relativizeUrlValue('/', prefixFor(SECTION))).toBe('../');
    expect(relativizeUrlValue('/', prefixFor(LESSON))).toBe('../../');
  });

  it('rewrites a plain page URL at every depth', () => {
    expect(relativizeUrlValue('/glossary/', prefixFor(HOME))).toBe(
      './glossary/',
    );
    expect(relativizeUrlValue('/glossary/', prefixFor(SECTION))).toBe(
      '../glossary/',
    );
    expect(relativizeUrlValue('/learn/arrays/', prefixFor(LESSON))).toBe(
      '../../learn/arrays/',
    );
  });

  /**
   * THE FRAGMENT CASES. The trailing slash belongs to the PATH and stays in
   * front of the delimiter; nothing after `?` or `#` may move.
   */
  it('moves the path and leaves the fragment untouched (track anchors)', () => {
    expect(relativizeUrlValue('/learn/#track-arrays', prefixFor(HOME))).toBe(
      './learn/#track-arrays',
    );
    expect(relativizeUrlValue('/learn/#track-arrays', prefixFor(SECTION))).toBe(
      '../learn/#track-arrays',
    );
    expect(relativizeUrlValue('/learn/#track-arrays', prefixFor(LESSON))).toBe(
      '../../learn/#track-arrays',
    );
  });

  it('moves the path and leaves the fragment untouched (glossary terms)', () => {
    expect(
      relativizeUrlValue('/glossary/#binary-search', prefixFor(HOME)),
    ).toBe('./glossary/#binary-search');
    expect(
      relativizeUrlValue('/glossary/#binary-search', prefixFor(LESSON)),
    ).toBe('../../glossary/#binary-search');
  });

  it('keeps a query and a fragment together, in order (the review deep link)', () => {
    const review = '/learn/binary-search/?review=1#practice';
    expect(relativizeUrlValue(review, prefixFor(HOME))).toBe(
      './learn/binary-search/?review=1#practice',
    );
    expect(relativizeUrlValue(review, prefixFor(SECTION))).toBe(
      '../learn/binary-search/?review=1#practice',
    );
    expect(relativizeUrlValue(review, prefixFor(LESSON))).toBe(
      '../../learn/binary-search/?review=1#practice',
    );
  });

  it('rewrites an asset URL by the same rule as a page URL', () => {
    expect(
      relativizeUrlValue('/fonts/plex-sans.woff2', prefixFor(LESSON)),
    ).toBe('../../fonts/plex-sans.woff2');
    expect(
      relativizeUrlValue('/_astro/BaseLayout.D6lMGJdh.css', prefixFor(SECTION)),
    ).toBe('../_astro/BaseLayout.D6lMGJdh.css');
  });

  /**
   * Everything that must NOT move, each for its own reason: a
   * protocol-relative URL and an absolute one already name their origin; a
   * `mailto:`/`data:` URL has no path to relativize; a bare fragment is this
   * site's ToC, scroll-spy and `<StepLink>` and would be destroyed by a prefix;
   * and an already-relative value is the pass running twice.
   */
  it.each([
    ['//cdn.example.com/a.js'],
    ['https://static-dsa.pages.dev/learn/'],
    ['http://example.com/'],
    ['mailto:hello@example.com'],
    ['data:image/svg+xml,%3Csvg/%3E'],
    ['#practice'],
    ['#viz-binary-search-ko1ecn-row-4'],
    ['./learn/'],
    ['../../glossary/'],
    ['learn/arrays/'],
    [''],
  ])('leaves %s alone', (value) => {
    expect(relativizeUrlValue(value, prefixFor(LESSON))).toBeNull();
  });
});

describe('relativizeSrcset', () => {
  it('rewrites every candidate and keeps its descriptor', () => {
    expect(
      relativizeSrcset('/og-default.png 1x, /og-2x.png 2x', prefixFor(SECTION)),
    ).toBe('../og-default.png 1x, ../og-2x.png 2x');
  });

  it('reports no change when nothing in the set is root-absolute', () => {
    expect(
      relativizeSrcset('./a.png 1x, https://cdn/b.png 2x', prefixFor(HOME)),
    ).toBeNull();
  });
});

describe('relativizeHtml', () => {
  it('rewrites href, src and action, and reports what it moved', () => {
    const { html, counts } = relativizeHtml(
      '<a href="/learn/">L</a><img src="/og-default.png"><form action="/search/"></form>',
      SECTION,
    );
    expect(html).toBe(
      '<a href="../learn/">L</a><img src="../og-default.png"><form action="../search/"></form>',
    );
    expect(counts).toMatchObject({ href: 1, src: 1, action: 1, srcset: 0 });
  });

  /**
   * THE CORRUPTION THIS PASS MUST NOT CAUSE. A minified island that assigns
   * `link.href="/learn/"` is raw script text, not markup: rewriting it would
   * change program behaviour rather than a link. The site's own islands assign
   * hrefs — they build them from `siteRoot()` now rather than from a
   * root-absolute literal, but a string in a script body is still none of this
   * pass's business. The opening tag's own `src` is markup and must still move.
   */
  it('never rewrites inside a <script> or <style> body', () => {
    const { html } = relativizeHtml(
      '<script src="/_astro/a.js">link.href="/learn/";</script>' +
        '<style>a{background:url(/fonts/x.woff2)}</style>',
      LESSON,
    );
    expect(html).toContain('<script src="../../_astro/a.js">');
    expect(html).toContain('link.href="/learn/";');
    expect(html).toContain('url(/fonts/x.woff2)');
  });

  it('leaves a single-quoted attribute single-quoted', () => {
    const { html } = relativizeHtml("<a href='/about/'>A</a>", HOME);
    expect(html).toBe("<a href='./about/'>A</a>");
  });

  /**
   * `data-*` and namespaced attributes belong to whatever reads them. The pass
   * and its assertion share one regex, so an attribute out of scope for the
   * rewrite is also out of scope for the check — they cannot disagree.
   */
  it('ignores attributes that merely end in a URL attribute name', () => {
    const source = '<div data-href="/learn/" data-src="/x.png"></div>';
    expect(relativizeHtml(source, LESSON).html).toBe(source);
    expect(rootAbsoluteAttributeUrls(source)).toEqual([]);
  });

  it('is idempotent — a second pass finds nothing left to move', () => {
    const source = '<a href="/learn/#track-arrays">L</a><a href="/">Home</a>';
    const once = relativizeHtml(source, LESSON).html;
    expect(relativizeHtml(once, LESSON).html).toBe(once);
  });
});

describe('rootAbsoluteAttributeUrls', () => {
  it('finds what the pass would have moved, and nothing else', () => {
    expect(
      rootAbsoluteAttributeUrls(
        '<a href="/learn/">L</a><a href="#x">F</a><a href="https://e.com/">E</a><a href="//cdn/">C</a>',
      ),
    ).toEqual(['/learn/']);
  });

  it('reads srcset candidate by candidate', () => {
    expect(
      rootAbsoluteAttributeUrls('<img srcset="./a.png 1x, /b.png 2x">'),
    ).toEqual(['/b.png']);
  });
});

describe('relativizeCss', () => {
  /**
   * A CONSTANT rewrite, because every built stylesheet sits directly under
   * `dist/_astro/` — an assumption the script verifies against the files on disk
   * before applying this, rather than trusting it.
   */
  it('rewrites url(/fonts/…) to url(../fonts/…), quoted or bare', () => {
    expect(relativizeCss('src:url(/fonts/plex-sans.woff2)').css).toBe(
      'src:url(../fonts/plex-sans.woff2)',
    );
    expect(relativizeCss('src:url("/fonts/plex-mono.woff2")').css).toBe(
      'src:url("../fonts/plex-mono.woff2")',
    );
    expect(relativizeCss("src:url('/fonts/plex-mono.woff2')").css).toBe(
      "src:url('../fonts/plex-mono.woff2')",
    );
  });

  it('counts every url it moved', () => {
    expect(relativizeCss('a{b:url(/a.png)}c{d:url(/b.png)}').changed).toBe(2);
  });

  it('leaves data:, protocol-relative and already-relative url() alone', () => {
    const source =
      'a{b:url(data:image/svg+xml,%3Csvg/%3E);c:url(//cdn/x.png);d:url(../fonts/x.woff2)}';
    expect(relativizeCss(source).css).toBe(source);
    expect(rootAbsoluteCssUrls(source)).toEqual([]);
  });
});

describe('runtimeAbsoluteLiterals', () => {
  /**
   * A LINK A CHUNK BUILDS, which no HTML pass can reach — so the build fails on
   * it instead, with no exceptions. These two shapes are the ones the site
   * really used to ship (the resume CTA and a review card); they are written
   * against `siteRoot()` now, and this is the detector that keeps them that way.
   * Normalizing `${…}` to `${}` is what makes the failure message readable
   * across builds, since the bundler renames minified variables every time.
   */
  it('normalizes interpolations so the reported shape survives minification', () => {
    expect(runtimeAbsoluteLiterals('a=`/learn/${o.slug}/`')).toEqual([
      '/learn/${}/',
    ]);
    expect(
      runtimeAbsoluteLiterals('a=`/learn/${e}/?review=1#practice`'),
    ).toEqual(['/learn/${}/?review=1#practice']);
  });

  /**
   * The site-root anchor's own resolution, which is what replaced those two
   * literals: a relative base and a relative path make a relative URL, so
   * nothing in a chunk needs to be root-absolute at all.
   */
  it('sees nothing in a link built against the site root', () => {
    expect(
      runtimeAbsoluteLiterals('a=new URL(`learn/${o.slug}/`,r).href'),
    ).toEqual([]);
  });

  it('ignores a bare separator, which is not a URL', () => {
    expect(runtimeAbsoluteLiterals("parts.join('/')")).toEqual([]);
  });

  it('sees an asset reference a chunk must never contain', () => {
    expect(runtimeAbsoluteLiterals('import("/_astro/x.js")')).toEqual([
      '/_astro/x.js',
    ]);
  });
});

/**
 * THE OTHER END OF THE SAME RULE. Client JS may not contain a root-absolute
 * link, which leaves it needing something on the page that points at the
 * deployment root — `SiteHeader`'s wordmark, carrying `data-site-root`, whose
 * href this pass rewrites per depth. The build asserts one per page with exactly
 * the depth's prefix; this pins what "found it" means.
 */
describe('siteRootHrefs', () => {
  it('reads the anchor whatever order its attributes come in', () => {
    expect(
      siteRootHrefs('<a href="../../" data-site-root class="x">LearnDSA</a>'),
    ).toEqual(['../../']);
    expect(siteRootHrefs("<a data-site-root href='./'>LearnDSA</a>")).toEqual([
      './',
    ]);
  });

  it('reports every anchor, so the build can insist on exactly one', () => {
    expect(
      siteRootHrefs(
        '<a data-site-root href="./">a</a><a data-site-root href="../">b</a>',
      ),
    ).toEqual(['./', '../']);
  });

  /**
   * A near-miss must not count as the anchor: a page whose real one went missing
   * has to fail the build, not be waved through by an attribute that merely
   * starts the same way — and a non-anchor carries no href for JS to resolve.
   */
  it('ignores a longer attribute name and a non-anchor element', () => {
    expect(siteRootHrefs('<a href="./" data-site-rooted>a</a>')).toEqual([]);
    expect(siteRootHrefs('<div data-site-root>not a link</div>')).toEqual([]);
  });

  it('finds none in a page that lost it', () => {
    expect(siteRootHrefs('<a href="./">LearnDSA</a>')).toEqual([]);
  });
});

describe('runtimeRootBases', () => {
  /**
   * THE DEFECT A LITERAL SCAN CANNOT SEE, and the one the plan's §3 measurement
   * missed: Vite's preload helper shipped `function(dep){return"/"+dep}`, so no
   * chunk CONTAINED a root-absolute URL while every one of them BUILT one. Under
   * a sub-path each lazily imported chunk's modulepreload 404'd at the origin
   * root — and the island still hydrated, because the `import()` beside it was
   * relative. Nothing visible, six failed requests a page.
   */
  it('catches a root-absolute base assembled at runtime, minified either way', () => {
    expect(runtimeRootBases('t=function(e){return`/`+e}')).toEqual([
      'return`/`+',
    ]);
    expect(runtimeRootBases('const f = (dep) => { return "/" + dep }')).toEqual(
      ['return "/" +'],
    );
  });

  it('accepts the relative form Vite emits under renderBuiltUrl', () => {
    expect(
      runtimeRootBases('t=function(e,t){return new URL(e,t).href}'),
    ).toEqual([]);
  });
});

describe('canonicalHrefs', () => {
  /**
   * The artifact's own statement of where it is deployed, and the value the
   * 404's base path is read out of. A LIST rather than one value, for the same
   * reason `siteRootHrefs` is one: two canonicals disagreeing about where a page
   * lives must fail, not be resolved by document order.
   */
  it('reads the href whatever order and quoting the tag uses', () => {
    expect(
      canonicalHrefs('<link rel="canonical" href="https://sample.com/x/">'),
    ).toEqual(['https://sample.com/x/']);
    expect(
      canonicalHrefs("<link href='https://sample.com/x/' rel='canonical'>"),
    ).toEqual(['https://sample.com/x/']);
  });

  it('reports every canonical, so a caller can insist on exactly one', () => {
    expect(
      canonicalHrefs(
        '<link rel="canonical" href="https://a.test/"><link rel="canonical" href="https://b.test/">',
      ),
    ).toEqual(['https://a.test/', 'https://b.test/']);
  });

  it('ignores another rel, a data attribute, and a tag with no href', () => {
    expect(
      canonicalHrefs('<link rel="alternate" href="https://a.test/">'),
    ).toEqual([]);
    expect(
      canonicalHrefs('<link rel="canonical" data-href="https://a.test/">'),
    ).toEqual([]);
    expect(canonicalHrefs('<p>no metadata at all</p>')).toEqual([]);
  });
});

describe('basePathOf', () => {
  /**
   * `''` and not `'/'` at a root deployment: the empty string is what makes
   * `prefixRootAbsolute` a no-op there instead of rewriting `/about/` to
   * `//about/`, which is a request to another host entirely.
   */
  it('is the deployment path with no trailing slash', () => {
    expect(basePathOf('https://learndsa.dev')).toBe('');
    expect(basePathOf('https://learndsa.dev/')).toBe('');
    expect(basePathOf('https://sample.com/learndsa')).toBe('/learndsa');
    expect(basePathOf('https://sample.com/learndsa/')).toBe('/learndsa');
    expect(basePathOf('http://localhost:4322/deployments/learndsa')).toBe(
      '/deployments/learndsa',
    );
  });

  /**
   * THE TWO PATHS MUST AGREE. The build reads the base path off its own
   * canonical; `npm run rehost` takes it from the command line. If those two
   * derivations ever diverged, a 404 would get one base path at build time and a
   * different one from the stamp — which is why they are the same function.
   */
  it('is the derivation `parseDeployment` uses', () => {
    for (const url of [
      'https://learndsa.dev',
      'https://sample.com/learndsa',
      'http://localhost:4322/deployments/learndsa',
    ]) {
      expect(parseDeployment(url).basePath).toBe(basePathOf(url));
    }
  });
});

describe('declaredBasePath', () => {
  const canonical = (url: string): string =>
    `<!doctype html><link rel="canonical" href="${url}"><title>x</title>`;

  it('reads a sub-path deployment out of the home page', () => {
    expect(declaredBasePath(canonical('https://sample.com/learndsa/'))).toBe(
      '/learndsa',
    );
  });

  /**
   * The unstamped sentinel lives at an origin root, so a sentinel build asks for
   * no prefix at all — and `npm run rehost` is what supplies one later.
   */
  it('gives a root deployment, and the sentinel, an empty base path', () => {
    expect(declaredBasePath(canonical('https://learndsa.dev/'))).toBe('');
    expect(declaredBasePath(canonical('https://learndsa.invalid/'))).toBe('');
  });

  /**
   * IT MUST NEVER GUESS `''`. A silent root default on a sub-path build is
   * precisely the defect this reads for: a 404 that is unstyled and whose every
   * escape link leaves the deployment, with nothing said about it.
   */
  it.each([
    ['a page with no canonical', '<p>hello</p>'],
    [
      'two canonicals that disagree',
      canonical('https://a.test/') + canonical('https://b.test/x/'),
    ],
    ['a canonical that is not absolute', canonical('/learndsa/')],
  ])('refuses %s', (_case, html) => {
    expect(() => declaredBasePath(html)).toThrow();
  });
});

describe('the 404 carve-out', () => {
  /**
   * Named as a constant rather than typed at the call site: a 404 is served AT
   * THE URL THE READER TYPED, so relative links on it resolve against an
   * arbitrary path (plan §4.4). The e2e suite asserts the document really does
   * keep its root-absolute links; this only pins which file is exempt.
   */
  it('names exactly one document', () => {
    expect(NOT_A_PAGE).toBe('404.html');
  });

  /**
   * `404.html` alone keeps root-absolute links, and under a sub-path the base
   * path is what keeps them inside the deployment — on GitHub Pages, where
   * `404.html` answers every unmatched path under the repo, it is the difference
   * between a usable 404 and one that leaves the site.
   *
   * These cases moved here from `rehost.test.ts` with the function itself: BOTH
   * stamping paths call it now (the build when `SITE_URL` already carries the
   * sub-path, `npm run rehost` when a sentinel artifact is re-pointed later),
   * and it belongs beside the carve-out that explains why the page is exempt.
   */
  it('prefixes every root-absolute link, and only those', () => {
    const html = [
      '<a data-site-root href="/">LearnDSA</a>',
      '<a href="/learn/arrays/">Arrays</a>',
      '<link rel="stylesheet" href="/_astro/BaseLayout.css">',
      '<link rel="canonical" href="https://learndsa.invalid/">',
      '<a href="#practice">skip</a>',
      '<a href="https://example.com/">out</a>',
      '<img src="/og-default.png" srcset="/og-default.png 1x" alt="">',
    ].join('\n');

    const { html: out, changed } = prefixRootAbsolute(html, '/learndsa');

    expect(changed).toBe(5);
    expect(out).toContain('<a data-site-root href="/learndsa/">');
    expect(out).toContain('href="/learndsa/learn/arrays/"');
    expect(out).toContain('href="/learndsa/_astro/BaseLayout.css"');
    expect(out).toContain('srcset="/learndsa/og-default.png 1x"');
    // Untouched: an absolute URL, a bare fragment, an off-site link.
    expect(out).toContain('href="https://learndsa.invalid/"');
    expect(out).toContain('href="#practice"');
    expect(out).toContain('href="https://example.com/"');
  });

  it('leaves an inline script body alone', () => {
    // The 404 ships the pre-paint theme script. A bare regex over the document
    // would walk into it; the shared attribute walker does not.
    const html = `<script>var a = {href:"/learn/"};</script><a href="/learn/">x</a>`;
    const { html: out } = prefixRootAbsolute(html, '/learndsa');
    expect(out).toContain('var a = {href:"/learn/"}');
    expect(out).toContain('<a href="/learndsa/learn/">');
  });

  it('is a no-op at a root deployment', () => {
    const html = '<a href="/about/">About</a>';
    expect(prefixRootAbsolute(html, '')).toEqual({ html, changed: 0 });
  });

  /**
   * ONE ARTIFACT FROM EITHER PATH — the defect this pins closed. The build-time
   * path used to skip the prefix altogether while `rehost` refused to supply it
   * afterwards, so a sub-path deployment built by a host WITH a build step
   * shipped a 404 that was unstyled and whose every escape link left the
   * deployment. Same document, same deployment URL, same bytes, whichever path
   * applied it.
   */
  it('gives the same 404 whether the build or the stamp applies it', () => {
    const deployment = 'https://user.github.io/learndsa';
    const html =
      '<a data-site-root href="/">LearnDSA</a><a href="/learn/">Learn</a><link rel="stylesheet" href="/_astro/x.css">';

    const atBuild = prefixRootAbsolute(
      html,
      declaredBasePath(`<link rel="canonical" href="${deployment}/">`),
    );
    const atStamp = prefixRootAbsolute(
      html,
      parseDeployment(deployment).basePath,
    );

    expect(atBuild).toEqual(atStamp);
    expect(atBuild.changed).toBe(3);
    expect(atBuild.html).toContain('href="/learndsa/learn/"');
  });
});
