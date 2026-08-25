/**
 * THE PUBLISHED URL SHAPE — D1's invariant, measured against the running site.
 *
 * `docs/superpowers/plans/2026-08-21-plan-d-portable-artifact.md` §5.1/§5.2 moved
 * two build constants: `build.format` from `'file'` to `'directory'` (R2 — plain
 * static servers such as `python -m http.server` and an S3 website endpoint 404
 * on `/about`, and serve `/about/` natively) and `trailingSlash: 'always'`. Every
 * one of the site's 21 pages moved with them: `/about` → `/about/`.
 *
 * THE DEFECT THIS FILE EXISTS TO CLOSE (probe finding §10.2): after the flip the
 * site SERVED `/learn/binary-search/` while every declared URL — `<link
 * rel="canonical">`, `og:url`, all 19 sitemap `<loc>`s — still NAMED
 * `/learn/binary-search`. A page self-canonicalizing at a URL its own host
 * redirects away from is the exact failure §5.2 exists to prevent, and it is
 * invisible from a green test run: nothing 404s for a reader, the site simply
 * tells every crawler that its real address is somewhere else.
 *
 * WHY IT IS ASSERTED HERE AND NOT IN VITEST. The claim is about the artifact and
 * the server together — "the URL this document names is the URL it was fetched
 * from" — and only Playwright's harness guarantees a `dist/` that matches the
 * source (`playwright.config.ts`'s `webServer` runs `npm run build && npm run
 * preview`; on CI the DoD gate builds first and `astro preview` exits 1 if it
 * did not). A Vitest test reading `dist/` could pass against a stale build.
 *
 * WHAT MAKES IT SELF-MAINTAINING. The page list is walked out of `dist/` rather
 * than typed, so a page added tomorrow is covered the day it is added, and a page
 * that stops building cannot quietly stop being checked. The one hand-written
 * number is the nonvacuity floor on the link sweep, which is a FLOOR precisely so
 * that adding links is not a test edit while a sweep that stops matching still
 * fails.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

/** The built site. `import.meta.url` is `<repo>/tests/e2e/url-shape.spec.ts`. */
const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

/**
 * `dist/404.html` is deliberately outside every check below.
 *
 * Measured under `build.format: 'directory'`: it stays at `dist/404.html` and
 * does NOT become `dist/404/index.html` (probe §10.5), because it is not a page
 * with an address — it is the document a host serves *instead of* whatever was
 * asked for. Its `canonicalPath` is `"/"` on purpose (`src/pages/404.astro`):
 * "the canonical URL of this content" is the home page, not the dead URL that
 * happened to summon it. Asserting canonical == served path there would be
 * asserting the opposite of the design.
 */
const NOT_A_PAGE = '404.html';

/** Every built page document, as absolute paths, sorted for stable reporting. */
function builtPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === 'index.html') out.push(path);
    }
  };
  walk(DIST);
  return out.sort();
}

/**
 * The URL a built document is served at. Under directory format this is pure
 * arithmetic on the path — `dist/learn/binary-search/index.html` is reachable at
 * `/learn/binary-search/` and nowhere else — which is what makes it a fair
 * independent witness to compare the canonical against.
 */
function servedPathOf(file: string): string {
  const rel = relative(DIST, file).split(sep).join('/');
  return `/${rel.slice(0, -'index.html'.length)}`;
}

/** The `href` of a document's `<link rel="canonical">`, or `undefined`. */
function canonicalOf(html: string): string | undefined {
  const tag = html.match(/<link\b[^>]*\brel="canonical"[^>]*>/i)?.[0];
  return tag?.match(/\bhref="([^"]*)"/)?.[1];
}

/** The `content` of a document's `og:url` meta, or `undefined`. */
function ogUrlOf(html: string): string | undefined {
  const tag = html.match(/<meta\b[^>]*\bproperty="og:url"[^>]*>/i)?.[0];
  return tag?.match(/\bcontent="([^"]*)"/)?.[1];
}

/**
 * Fetch without following redirects. A 301 has to surface AS a 301: a followed
 * redirect ends in a 200 and would hide precisely the mismatch under test.
 */
function getExact(request: APIRequestContext, path: string) {
  return request.get(path, { maxRedirects: 0 });
}

test.describe('the published URL shape (Plan D §5.1/§5.2)', () => {
  /**
   * THE INVARIANT. For every page: the URL the document declares as its own and
   * the URL the document was fetched from are the same URL.
   *
   * Compared on the PATHNAME only, deliberately. The origin in a canonical comes
   * from `astro.config.mjs`'s `site` (a deploy-time input — `SITE_URL`, or the
   * sentinel `https://learndsa.invalid` when it is unset), while the test fetches
   * `localhost:4321`; asserting on the
   * full URL would fail for a reason that has nothing to do with URL shape. The
   * path is the part D1 moved and the part a redirect would change.
   */
  test('every page names the URL it is served at', async ({ request }) => {
    const pages = builtPages();
    // A walk that matched nothing would pass every assertion below it.
    expect(pages.length, 'built pages found in dist/').toBeGreaterThanOrEqual(
      20,
    );

    const mismatches: string[] = [];
    for (const file of pages) {
      const served = servedPathOf(file);
      const response = await getExact(request, served);
      expect(
        response.status(),
        `${served} is served directly, without a redirect hop`,
      ).toBe(200);

      const html = await response.text();
      const canonical = canonicalOf(html);
      expect(canonical, `${served} declares a canonical`).toBeTruthy();

      const declared = new URL(canonical!).pathname;
      if (declared !== served) {
        mismatches.push(`${served} canonicalizes to ${declared}`);
      }

      // og:url and the canonical are one value in `BaseLayout.astro` today; this
      // keeps them one value. Two machine-readable declarations of "this page"
      // that disagree is the same defect wearing a different tag name.
      expect(ogUrlOf(html), `${served} og:url matches its canonical`).toBe(
        canonical,
      );
    }
    expect(
      mismatches,
      'pages whose canonical points somewhere other than where they are served',
    ).toEqual([]);
  });

  /**
   * The sitemap half of the same defect. Every `<loc>` is a promise to a crawler
   * that the URL is fetchable; under `trailingSlash: 'always'` a slashless one is
   * a promise the site cannot keep — a 301 on a real host and a hard 404 under
   * `astro preview`.
   */
  test('every sitemap <loc> is a URL the site actually serves', async ({
    request,
  }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1]!)
      .map((loc) => new URL(loc).pathname);
    // 4 static routes + 15 lessons. A sitemap that emitted nothing would
    // otherwise satisfy every `for` below by never entering it.
    expect(locs.length, 'sitemap entries').toBe(19);

    for (const path of locs) {
      expect(
        path.endsWith('/'),
        `<loc> ${path} carries the shipped slash`,
      ).toBe(true);
      expect(
        (await getExact(request, path)).status(),
        `<loc> ${path} is served directly`,
      ).toBe(200);
    }
  });

  /**
   * The sweep that would have caught the largest gap in D1's own review: 41
   * hand-authored links in lesson MDX — 40 into the glossary (`](/glossary/#…)`)
   * plus one lesson-to-lesson — invisible to a survey
   * of `.astro` files and to every test that navigates by a path constant. It is
   * a CLASS check over the built output, so it covers prose, components, and any
   * href a future page invents — the thing reviewer vigilance across 30-odd call
   * sites cannot do.
   *
   * D2 MOVED THE GROUND UNDER IT, AND THAT IS WHY IT IS WRITTEN THIS WAY.
   * `scripts/portablize.mjs` now rewrites every internal URL to a
   * document-relative one, so the old form of this sweep — which read
   * `href="/…"` out of the HTML — would have found NOTHING and passed forever.
   * A shape test that silently stops matching is worse than one that fails.
   *
   * So the invariant is asserted after RESOLUTION instead: every internal link
   * is resolved against the URL of the page that carries it, and the result must
   * be a URL this build actually serves. That is strictly stronger than the
   * old check, because a relative link has a second way to be wrong — a prefix
   * one level off resolves to `/learn/glossary/`, which ends in a slash and is a
   * 404. Only "resolves to a file that exists" catches that.
   *
   * The rule that sorts the two kinds: an internal URL whose final segment has
   * no extension addresses a PAGE, and every page address ends in `/` and has an
   * `index.html`. Assets (`/og-default.png`, `/fonts/plex-sans.woff2`,
   * `/_astro/*.js`) are files and must exist as files.
   */
  test('every internal link resolves to something this build serves', async () => {
    const pages = builtPages();
    // The 404 document's own links count too — it is exempt from being relative
    // (see the carve-out test below), never from pointing somewhere real.
    const files = [...pages, join(DIST, NOT_A_PAGE)];
    const resolvedPages = new Set<string>();
    const dead: string[] = [];

    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      const where = relative(DIST, file);
      // `dist/404.html` is served at whatever URL was typed; its links are
      // root-absolute by design, so any base resolves them identically.
      const base = where === NOT_A_PAGE ? '/' : servedPathOf(file);
      for (const match of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
        const value = match[1]!;
        // External, protocol-relative, non-navigational, or a bare fragment —
        // the last one is this site's ToC, scroll-spy and <StepLink>.
        if (value === '' || value.startsWith('#')) continue;
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;

        const resolved = new URL(value, `https://resolve.test${base}`);
        const path = resolved.pathname;
        const last = path.slice(path.lastIndexOf('/') + 1);
        if (last.includes('.')) {
          // An asset: the file itself must be on disk.
          if (!existsSync(join(DIST, path.slice(1)))) {
            dead.push(`${value} → ${path}  (in ${where})`);
          }
          continue;
        }
        resolvedPages.add(path);
        // A page: the slash is the published shape (D1), and there must be a
        // document behind it. `!path.endsWith('/')` is kept as its own clause
        // so the failure message still names the original defect class.
        if (
          !path.endsWith('/') ||
          !existsSync(join(DIST, path, 'index.html'))
        ) {
          dead.push(`${value} → ${path}  (in ${where})`);
        }
      }
    }

    // Nonvacuity: the header, the footer and the curriculum alone are ~18
    // distinct page URLs. A regex that stopped matching would report zero
    // offenders and pass, which is exactly how a shape test rots.
    expect(
      resolvedPages.size,
      'distinct internal page URLs reached from the built HTML',
    ).toBeGreaterThanOrEqual(15);

    // No allowlist, deliberately — not even for `/404`. Under `trailingSlash:
    // 'always'` there is no internal page URL that may legitimately omit the
    // slash: measured, even `/404` does not reach this site's own 404 document
    // (the preview server answers the slashless form with Astro's built-in error
    // page before it ever looks for a file). An exception here would be a hole
    // large enough for a real dead link to hide in.
    expect(
      dead,
      'internal links that resolve to nothing this build serves — a missing trailing slash (a 404 under `astro preview`), or a relative prefix one level off',
    ).toEqual([]);
  });

  /**
   * THE PIPELINE GUARD (Plan D §4.2/§4.4). `scripts/portablize.mjs` asserts its
   * own output, but that assertion lives inside the very step someone can drop:
   * `npm run build` is `astro check && astro build && node
   * scripts/portablize.mjs`, and an artifact built without the third command is
   * indistinguishable from a portable one to the sweep above — root-absolute
   * hrefs resolve to slash-terminated paths that exist, so every assertion there
   * still passes. This test is what notices.
   *
   * Its second half is the carve-out, exercised rather than merely excused: a
   * 404 document is served AT THE URL THE READER TYPED, so a relative link on it
   * resolves against an arbitrary path (`../glossary/` from `/learn/typo/deep`
   * is nonsense). `dist/404.html` therefore KEEPS root-absolute links, and a
   * pass that "helpfully" relativized them would break the one page whose links
   * cannot be relative.
   */
  test('the relative pass ran, and the 404 kept its root-absolute links', async () => {
    const rootAbsolute = (file: string): string[] =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /\b(?:href|src)="(\/[^"/][^"]*)"/g,
        ),
      ]
        .map((match) => match[1]!)
        .filter((url) => !url.startsWith('//'));

    const leftBehind: string[] = [];
    for (const file of builtPages()) {
      for (const url of rootAbsolute(file)) {
        leftBehind.push(`${url}  (in ${relative(DIST, file)})`);
      }
    }
    expect(
      leftBehind,
      'root-absolute internal URLs in a built page — under a sub-path deployment every one of them points at the origin root. Did `npm run build` run `node scripts/portablize.mjs`?',
    ).toEqual([]);

    // …and the exception really is exceptional. The nav alone gives the 404 four
    // internal links; a floor rather than a count, so the page's content can
    // change without editing this test, while a 404 that lost them (or was
    // relativized) fails.
    const notAPage = join(DIST, NOT_A_PAGE);
    expect(
      rootAbsolute(notAPage).length,
      '404.html keeps root-absolute links (plan §4.4)',
    ).toBeGreaterThanOrEqual(4);
    const relativized = [
      ...readFileSync(notAPage, 'utf8').matchAll(
        /\b(?:href|src)="(\.{1,2}\/[^"]*)"/g,
      ),
    ].map((match) => match[1]!);
    expect(
      relativized,
      'document-relative links on 404.html — they resolve against the URL the reader typed, not against the document',
    ).toEqual([]);
  });

  /**
   * WHY the three tests above are strict rather than tidy, pinned as a fact
   * instead of left in a comment: Astro does not redirect the slashless form, it
   * refuses it. Measured (probe §10.3): `/about` → 404, `/about/` → 200. So a
   * single missed link fails loudly in this suite instead of costing a redirect
   * hop nobody notices — and if a future Astro version starts 301-ing instead,
   * this test says so out loud rather than letting the suite quietly relax.
   */
  test('the slashless form is not served', async ({ request }) => {
    for (const path of ['/about', '/glossary', '/learn', '/learn/arrays']) {
      const status = (await getExact(request, path)).status();
      expect(status, `${path} (no slash) must not be served as-is`).not.toBe(
        200,
      );
      expect(
        (await getExact(request, `${path}/`)).status(),
        `${path}/ is the shipped URL`,
      ).toBe(200);
    }
  });
});
