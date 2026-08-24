/**
 * The origin stamp, case by case (Plan D stage D3, plan §4.3).
 *
 * `scripts/rehost.mjs` re-points a built artifact at the URL it will be served
 * at, for hosts with no build step. Its whole safety argument is that it edits
 * ONE thing — the sentinel origin — and that everything else in `dist/` either
 * carries no origin at all (navigational URLs, made relative by `portablize`)
 * or is a declared URL that must be stamped. The pure halves of that argument
 * are pinned here; the end-to-end half ("build, stamp, and the canonical says
 * what the host serves") is the verification run recorded in the D3 report.
 *
 * The sentinel-literal test is the one that would otherwise rot silently: the
 * value is produced in `astro.config.mjs` and consumed here, and if the two ever
 * disagree this script finds nothing to stamp on a perfectly normal build and
 * says so in a message about rebuilding — the least useful possible diagnosis.
 *
 * The 404's base-path prefixing is NOT tested here any more: `prefixRootAbsolute`
 * moved to `scripts/portablize.mjs`, beside the carve-out that explains why that
 * page is exempt, because both stamping paths call it now. Its cases live in
 * `tests/unit/portablize.test.ts`, one of them asserting that the build-time and
 * stamp-time paths produce the same document.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  countSentinels,
  declaredUrlsInPage,
  parseDeployment,
  SENTINEL,
  stampSentinel,
  stampState,
} from '../../scripts/rehost.mjs';

const SUBPATH = 'https://sample.com/learndsa';

describe('the sentinel', () => {
  it('is the literal astro.config.mjs bakes into an unstamped build', () => {
    const config = readFileSync('astro.config.mjs', 'utf8');
    expect(config).toContain(`const SENTINEL = '${SENTINEL}';`);
  });

  it('is a reserved, unresolvable domain (RFC 2606)', () => {
    expect(new URL(SENTINEL).hostname.endsWith('.invalid')).toBe(true);
  });
});

describe('parseDeployment', () => {
  it('splits a sub-path deployment into prefix, origin and base path', () => {
    expect(parseDeployment(SUBPATH)).toEqual({
      deployment: 'https://sample.com/learndsa',
      origin: 'https://sample.com',
      basePath: '/learndsa',
    });
  });

  it('gives a root deployment an EMPTY base path, not "/"', () => {
    // `''` is what makes the 404 link prefixing a no-op at the root rather than
    // a rewrite of `/about/` to `//about/` — a protocol-relative URL, i.e. a
    // request to another host entirely.
    expect(parseDeployment('https://learndsa.dev')).toEqual({
      deployment: 'https://learndsa.dev',
      origin: 'https://learndsa.dev',
      basePath: '',
    });
  });

  it('treats a trailing slash as noise', () => {
    expect(parseDeployment(`${SUBPATH}/`)).toEqual(parseDeployment(SUBPATH));
    expect(parseDeployment('https://learndsa.dev/')).toEqual(
      parseDeployment('https://learndsa.dev'),
    );
  });

  it('keeps a nested sub-path and a port', () => {
    expect(
      parseDeployment('http://localhost:4322/deployments/learndsa'),
    ).toEqual({
      deployment: 'http://localhost:4322/deployments/learndsa',
      origin: 'http://localhost:4322',
      basePath: '/deployments/learndsa',
    });
  });

  it.each([
    ['sample.com/learndsa', /absolute URL/],
    ['/learndsa', /absolute URL/],
    ['ftp://sample.com/', /http\(s\)/],
    ['https://sample.com/learndsa?v=2', /query or fragment/],
    ['https://sample.com/learndsa#top', /query or fragment/],
  ])('rejects %s', (raw, message) => {
    expect(() => parseDeployment(raw)).toThrow(message);
  });
});

describe('stampSentinel', () => {
  it('swaps the origin and leaves the path exactly as built', () => {
    const html = [
      `<link rel="canonical" href="${SENTINEL}/learn/arrays/">`,
      `<meta property="og:image" content="${SENTINEL}/og-default.png">`,
    ].join('\n');

    const { text, changed } = stampSentinel(html, SUBPATH);

    expect(changed).toBe(2);
    // The path is NOT re-joined here: `deploymentUrl` normalized it at build
    // time, so the trailing slash on a page and its absence on an asset both
    // survive a stamp untouched.
    expect(text).toContain('href="https://sample.com/learndsa/learn/arrays/"');
    expect(text).toContain(
      'content="https://sample.com/learndsa/og-default.png"',
    );
    expect(countSentinels(text)).toBe(0);
  });

  it('cannot reach a navigational URL, because none carries an origin', () => {
    // After `portablize`, every internal link is document-relative. There is no
    // origin in it for a sentinel replace to match — which is the whole reason a
    // whole-file replace is surgical rather than reckless.
    const page = '<a href="../glossary/#array">array</a><script src="./x.js">';
    expect(stampSentinel(page, SUBPATH)).toEqual({ text: page, changed: 0 });
  });

  it('counts what is left, so the refusal and the assertion agree', () => {
    expect(countSentinels(`${SENTINEL}/ and ${SENTINEL}/about/`)).toBe(2);
    expect(countSentinels('nothing here')).toBe(0);
  });
});

describe('stampState — the guard that survives a half-run', () => {
  /**
   * WHY A THREE-WAY ANSWER AND NOT A TOTAL. The refusal exists because the 404's
   * base-path prefixing is incremental: run it twice and `/about/` becomes
   * `/learndsa/learndsa/about/`. "Zero sentinels anywhere" catches the finished
   * artifact and misses the one that matters — a stamp interrupted between two
   * writes, where the files already written carry no sentinel while the rest
   * still do. A total reads that as "sentinels remain, carry on", re-prefixes
   * the written half, and exits 0; the post-conditions cannot see it either,
   * because they read declared URLs and those are correct in both halves.
   */
  const file = (
    name: string,
    sentinels: number,
  ): { name: string; sentinels: number } => ({
    name,
    sentinels,
  });

  it('is unstamped only when EVERY file the stamp touches still carries one', () => {
    // The real shape of a sentinel build, measured: 5 in index.html, 4 in every
    // other page, 19 in sitemap.xml, 1 in robots.txt.
    expect(
      stampState([
        file('index.html', 5),
        file('about/index.html', 4),
        file('404.html', 4),
        file('sitemap.xml', 19),
        file('robots.txt', 1),
      ]),
    ).toBe('unstamped');
  });

  it('is stamped when none does — built with SITE_URL set, or rehosted before', () => {
    expect(
      stampState([
        file('index.html', 0),
        file('404.html', 0),
        file('sitemap.xml', 0),
      ]),
    ).toBe('stamped');
  });

  /**
   * THE CORRUPTION CASE, spelled out as the operator meets it: the write loop
   * reached `404.html` and died before `sitemap.xml`. Re-running would prefix
   * that page's links a second time and report success.
   */
  it('is partial when some are written and some are not', () => {
    expect(
      stampState([
        file('index.html', 0),
        file('404.html', 0),
        file('sitemap.xml', 19),
        file('robots.txt', 1),
      ]),
    ).toBe('partial');
    // …and the other way round, since which files a dying run reached is not
    // something this can assume.
    expect(stampState([file('index.html', 5), file('robots.txt', 0)])).toBe(
      'partial',
    );
  });

  it('calls an empty artifact stamped — nothing to stamp is nothing to do', () => {
    expect(stampState([])).toBe('stamped');
  });
});

describe('declaredUrlsInPage — what the post-conditions read', () => {
  const page = [
    `<link rel="canonical" href="${SUBPATH}/">`,
    `<meta property="og:url" content="${SUBPATH}/">`,
    `<meta property="og:image" content="${SUBPATH}/og-default.png">`,
    `<meta name="twitter:image" content="${SUBPATH}/og-default.png">`,
    '<meta property="og:type" content="website">',
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Course","url":"${SUBPATH}/learn/arrays/","provider":{"@type":"Organization","url":"${SUBPATH}/"}}</script>`,
    '<a href="../glossary/">glossary</a>',
  ].join('\n');

  it('finds every declared position and nothing else', () => {
    const found = declaredUrlsInPage(page);
    expect(found.map((entry) => entry.what)).toEqual([
      'canonical',
      'og:url',
      'og:image',
      'twitter:image',
      'json-ld url',
      'json-ld url',
    ]);
  });

  /**
   * The reason the JSON-LD is walked by KEY NAME rather than swept for
   * `https?://`: `@context` is a vocabulary identifier, not a URL this
   * deployment publishes, and an "exactly one origin" assertion that counted it
   * could never pass.
   */
  it('does not mistake the schema.org @context for a declared URL', () => {
    expect(
      declaredUrlsInPage(page).some((entry) =>
        entry.url.includes('schema.org'),
      ),
    ).toBe(false);
  });

  it('reaches a url nested inside the JSON-LD, not just the top level', () => {
    expect(declaredUrlsInPage(page).map((entry) => entry.url)).toContain(
      `${SUBPATH}/learn/arrays/`,
    );
    expect(
      declaredUrlsInPage(page).filter((entry) => entry.url === `${SUBPATH}/`),
    ).toHaveLength(3); // canonical, og:url, provider.url
  });

  it('reports nothing for a page with no metadata, so the sweep cannot pass vacuously', () => {
    expect(declaredUrlsInPage('<p>hello</p>')).toEqual([]);
  });
});
