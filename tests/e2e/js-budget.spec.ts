/**
 * THE JS BUDGET — the rewrite's one hard numeric constraint, measured instead
 * of remembered.
 *
 * The budget is **120 KB gzipped per page** (CLAUDE.md, the rewrite's
 * hard-constraint table, raised from spec §4's 60 KB), gated on two figures
 * (react-migration decision D-06). Before this file existed the old number was
 * checked by hand, "per phase", and M8.2/M8.3 shipped without the
 * re-measurement — which is how the gamification layer drifted to roughly 1.5–2×
 * the ~5 KB slice `docs/m8-gamification.md` reserved for it with nobody
 * noticing. A budget nothing enforces is a wish.
 *
 * WHAT IS MEASURED, exactly — the method `docs/m8-gamification.md` names
 * ("build, then `gzip -9` every chunk in a page's static import closure"), done
 * by a machine:
 *
 *   EAGER (gated) = every `<script>` the built HTML carries, plus the transitive
 *   closure of their STATIC imports, each file gzipped at level 9 and summed.
 *   That is what a visitor downloads and executes to render the page. Inline
 *   scripts are gzipped individually, which slightly OVERSTATES them — over the
 *   wire they compress together with the surrounding HTML — and overstating is
 *   the safe direction for a budget. This figure is read from the HTML alone, and
 *   must agree with the prerenderer's own list (below).
 *
 *   FULL (gated) = EAGER + every chunk any island on the page loads when it
 *   activates: React, the island component and its static imports, and the
 *   algorithm/renderer chunks the page's own visualizers name. React is no
 *   longer in the eager closure — the island bootstrap loads it on activation
 *   (D-06) — so without this figure lazy loading would move ~66 KB of React into
 *   an ungated bucket and 120 KB would stop meaning anything. The per-page lists
 *   come from `.build/page-manifest.json`, which the prerenderer writes beside
 *   the `dist/` it built (plan §2.1); the browser cross-check below proves they
 *   are complete.
 *
 *   DEFERRED (reported, not gated) = everything reachable through a DYNAMIC
 *   `import()` from the eager closure, to a fixpoint: the whole island and
 *   algorithm/renderer registry, an UPPER BOUND no page ever pays (a page loads
 *   only the islands it hosts and the two or three viz chunks its visualizers
 *   name). Reported because "small" deserves a number.
 *
 * WHY THIS LIVES IN PLAYWRIGHT AND NOT IN VITEST: the measurement itself needs no
 * browser, but it does need a `dist/` that matches the source — and this is the
 * only harness in the repo that guarantees one. `playwright.config.ts`'s
 * `webServer` runs `npm run build && npm run preview` locally, and on CI the DoD
 * gate builds before it runs `npm run test:e2e`, where the preview server refuses
 * to start without the directory. A Vitest test reading `dist/` has no such
 * guarantee: `npm run test` neither builds nor notices, so the first stale run
 * would measure a directory from an unrelated commit and pass. The guards below
 * (an existing `dist/` and page manifest, a lesson page that really carries
 * module scripts, every referenced chunk present on disk, the manifest agreeing
 * with the HTML, and the browser cross-check) close what is left.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
// The built site under test: `<repo>/dist`, or `PW_DIST` (see utils/dist.ts),
// and its `.build/` sibling, where the prerenderer writes the page manifest.
import { BUILD_META, DIST } from './utils/dist';

/**
 * The rewrite's budget (CLAUDE.md hard constraints; D-06), in bytes, for EAGER
 * and FULL alike. A hard failure, not a warning.
 */
const BUDGET_BYTES = 120 * 1024;

/** The prerenderer's per-page chunk lists (plan §2.1). */
const PAGE_MANIFEST = join(BUILD_META, 'page-manifest.json');

/**
 * One page's entry in `.build/page-manifest.json`. Paths are relative to
 * `dist/`, e.g. `assets/islands-HASH.js`.
 */
interface ManifestPage {
  /** The page's module scripts and the island bootstrap, with static imports. */
  eager: string[];
  /** Island name → chunks it loads on activation that are not already eager. */
  islands: Record<string, string[]>;
  /** Algorithm/renderer chunks the page's visualizers load on activation. */
  viz: string[];
}

/** `<script …>…</script>`, attributes and body captured separately. */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * A static `import`/`export … from "…"` specifier.
 *
 * Deliberately loose about what precedes the keyword (minified output runs
 * statements together) and deliberately strict about what it accepts as a path:
 * {@link resolveSpecifier} discards anything that is not a `.js` file this build
 * actually emitted, and records the ones that look like chunks but are missing.
 */
const STATIC_IMPORT =
  /(?:^|[^\w$.])(?:import|export)\s*(?:[\s\S]{0,200}?\bfrom\s*)?["'`]([^"'`\n]+)["'`]/g;

/** A dynamic `import("…")` — Rolldown emits these with backticks. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g;

/** One built page's JS, in gzipped bytes. */
interface PageBudget {
  /** Path relative to `dist/`, e.g. `learn/binary-search/index.html`. */
  page: string;
  /** Gzipped bytes of inline `<script>` bodies (JSON-LD excluded). */
  inline: number;
  /** Inline + the gzipped static-import closure of the external scripts. */
  eager: number;
  /** Gzipped bytes reachable only through `import()` — reported, not gated. */
  deferred: number;
  /** Eager + every chunk the page's islands load on activation (D-06). */
  full: number;
  /** Chunks FULL adds to EAGER, as `[path relative to dist, bytes]`. */
  activation: [string, number][];
  /** Every eagerly-loaded chunk, largest first: `[path relative to dist, bytes]`. */
  chunks: [string, number][];
  /** Absolute paths of the eagerly-loaded chunks, for the browser cross-check. */
  eagerFiles: Set<string>;
  /** Absolute paths of the `import()`-only chunks. */
  deferredFiles: Set<string>;
  /** Absolute paths of every chunk in FULL, for the browser cross-check. */
  fullFiles: Set<string>;
  /** The manifest's EAGER list, as absolute paths, for the agreement check. */
  manifestEager: Set<string>;
}

/** Every file under `dir`, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    out.push(...(statSync(path).isDirectory() ? walk(path) : [path]));
  }
  return out;
}

/** Gzip level 9 — the same setting the design doc's by-hand method used. */
const gzipped = (body: Buffer | string): number =>
  gzipSync(body, { level: 9 }).length;

/**
 * Gzipped size of one built file, computed once per worker: the same shared
 * chunks (`progress`, React, the runtime) recur on most of the 136 pages, and
 * gzip -9 of each, every time, is what made one measurement cost ~30 s.
 */
const gzipCache = new Map<string, number>();
function gzippedFile(path: string): number {
  let bytes = gzipCache.get(path);
  if (bytes === undefined) {
    bytes = gzipped(readFileSync(path));
    gzipCache.set(path, bytes);
  }
  return bytes;
}

/** Chunk paths that were referenced but do not exist; asserted empty. */
const missing: string[] = [];

/**
 * Resolves one import specifier to a file in `dist/`, or `null`.
 *
 * Returns `null` for anything that is not a `.js` path (bare package names
 * cannot appear in a built bundle, but a string literal that merely looks like a
 * specifier can). A specifier that DOES name a `.js` file and resolves to
 * nothing is recorded rather than skipped: silently ignoring it is exactly how a
 * measurement starts reading zero.
 */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (!specifier.endsWith('.js')) return null;
  let path: string | null = null;
  if (specifier.startsWith('/')) path = join(DIST, specifier);
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    path = resolve(dirname(fromFile), specifier);
  }
  if (path === null) return null;
  if (!existsSync(path)) {
    missing.push(`${specifier} referenced by ${relative(DIST, fromFile)}`);
    return null;
  }
  return path;
}

/**
 * Transitive closure over STATIC imports.
 *
 * @param entries - Absolute paths to start from.
 * @returns `reached` (every file in the closure) and `dynamic` (the `import()`
 * specifiers seen along the way, unresolved into a closure of their own).
 */
function staticClosure(entries: string[]): {
  reached: Set<string>;
  dynamic: Set<string>;
} {
  const reached = new Set<string>();
  const dynamic = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const path = queue.pop();
    if (path === undefined || reached.has(path)) continue;
    reached.add(path);
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const next = resolveSpecifier(match[1] ?? '', path);
      if (next !== null) queue.push(next);
    }
    for (const match of source.matchAll(DYNAMIC_IMPORT)) {
      const next = resolveSpecifier(match[1] ?? '', path);
      if (next !== null) dynamic.add(next);
    }
  }
  return { reached, dynamic };
}

/**
 * Measures one built HTML file.
 *
 * @param html - Absolute path of the page.
 * @param manifest - The prerenderer's page manifest, keyed by path within `dist/`.
 */
function measurePage(
  html: string,
  manifest: Record<string, ManifestPage>,
): PageBudget {
  const source = readFileSync(html, 'utf8');
  let inline = 0;
  const entries: string[] = [];
  for (const tag of source.matchAll(SCRIPT_TAG)) {
    const attrs = tag[1] ?? '';
    const body = tag[2] ?? '';
    // Structured data is not code (spec §13's JSON-LD), so it is not JS.
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) {
      const path = resolveSpecifier(src[1] ?? '', html);
      if (path !== null) entries.push(path);
    } else if (body.trim().length > 0) {
      inline += gzipped(body);
    }
  }

  const { reached, dynamic } = staticClosure(entries);

  // Everything only an `import()` can reach, to a fixpoint — a lazily loaded
  // chunk may itself `import()` another.
  const deferredFiles = new Set<string>();
  let frontier = [...dynamic];
  while (frontier.length > 0) {
    const next = staticClosure(frontier);
    frontier = [];
    for (const path of next.reached) {
      if (!reached.has(path)) deferredFiles.add(path);
    }
    for (const path of next.dynamic) {
      if (!reached.has(path) && !deferredFiles.has(path)) frontier.push(path);
    }
  }

  const chunks: [string, number][] = [...reached].map((path) => [
    relative(DIST, path),
    gzippedFile(path),
  ]);
  chunks.sort((a, b) => b[1] - a[1]);
  let deferred = 0;
  for (const path of deferredFiles) deferred += gzippedFile(path);

  // FULL: the eager closure plus whatever the manifest says the page's islands
  // pull in on activation. A page missing from the manifest is a failure, not a
  // zero — the manifest is how React is charged to the page at all.
  const page = relative(DIST, html);
  const entry = manifest[page];
  expect(entry, `${page} has no entry in ${PAGE_MANIFEST}`).toBeDefined();
  const toFile = (rel: string): string => {
    const path = join(DIST, rel);
    if (!existsSync(path))
      missing.push(`${rel} listed for ${page} in the page manifest`);
    return path;
  };
  const activationFiles = new Set<string>();
  for (const rel of [
    ...Object.values(entry?.islands ?? {}).flat(),
    ...(entry?.viz ?? []),
  ]) {
    const path = toFile(rel);
    if (!reached.has(path) && existsSync(path)) activationFiles.add(path);
  }
  const activation: [string, number][] = [...activationFiles].map((path) => [
    relative(DIST, path),
    gzippedFile(path),
  ]);
  activation.sort((a, b) => b[1] - a[1]);
  const eager = chunks.reduce((sum, [, bytes]) => sum + bytes, inline);

  return {
    page,
    inline,
    eager,
    deferred,
    full: activation.reduce((sum, [, bytes]) => sum + bytes, eager),
    activation,
    chunks,
    eagerFiles: reached,
    deferredFiles,
    fullFiles: new Set([...reached, ...activationFiles]),
    manifestEager: new Set((entry?.eager ?? []).map(toFile)),
  };
}

/** `16923` → `16.5 KB`. */
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Measures every built page, or fails with the command that fixes it.
 *
 * A missing `dist/` is a HARD failure and never a skip: a budget guard that
 * quietly passes when it cannot measure is worse than none, because the green
 * tick then means "nobody looked".
 *
 * @param only - Measure just this page (path within `dist/`), for the
 *   per-page browser cross-check.
 */
function measureAll(only?: string): PageBudget[] {
  // Reset per call: the list is module state, and a second measurement must not
  // inherit the first one's findings (or report them twice).
  missing.length = 0;
  expect(
    existsSync(DIST),
    `No dist/ at ${DIST}. The JS budget can only be measured against a build — run \`npm run build\` (the DoD gate and playwright.config.ts's webServer both do).`,
  ).toBe(true);
  expect(
    existsSync(PAGE_MANIFEST),
    `No page manifest at ${PAGE_MANIFEST}. The prerenderer writes it beside the dist/ it builds; a dist/ without one is not this build's.`,
  ).toBe(true);
  const manifest = (
    JSON.parse(readFileSync(PAGE_MANIFEST, 'utf8')) as {
      pages: Record<string, ManifestPage>;
    }
  ).pages;
  const pages = walk(DIST)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => only === undefined || relative(DIST, file) === only)
    .sort()
    .map((html) => measurePage(html, manifest));
  expect(pages.length, 'dist/ holds no HTML at all').toBeGreaterThan(0);
  return pages;
}

/**
 * Scrolls every island on the page into view, then waits until each one has
 * really activated: React marks the container of every root it creates, and a
 * visualizer is only done loading its algorithm and renderer chunks once it is
 * `data-viz-ready`. (The same activation proof `hydration.spec.ts` uses.)
 */
async function activateEveryIsland(page: Page): Promise<number> {
  const islands = page.locator('[data-island]');
  const count = await islands.count();
  for (let i = 0; i < count; i += 1) {
    await islands.nth(i).scrollIntoViewIfNeeded();
  }
  // Then the rest of the page, top to bottom, so anything activated by
  // visibility that is not itself an island container is reached too.
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-island]'))
            .filter(
              (el) =>
                !Object.keys(el).some((key) =>
                  key.startsWith('__reactContainer'),
                ),
            )
            .map((el) => (el as HTMLElement).dataset['island']),
        ),
      { message: 'islands that never activated', timeout: 15_000 },
    )
    .toEqual([]);
  for (const viz of await page.locator('[data-island="visualizer"]').all()) {
    await expect(viz).toHaveAttribute('data-viz-ready', 'true', {
      timeout: 15_000,
    });
  }
  return count;
}

test.describe('the JS budget (120 KB gz, D-06)', () => {
  test('no page ships more than 120 KB gzipped, eager or fully activated', async () => {
    const pages = measureAll();
    const worst = [...pages].sort(
      (a, b) => b.full - a.full || b.eager - a.eager,
    );
    const heaviest = worst[0];
    expect(heaviest, 'no page was measured').toBeDefined();

    // THE REPORT. `process.stdout.write` rather than `console` (eslint bans every
    // console method repo-wide, §18) — Playwright captures it per test, so the
    // list reporter prints these lines on every run, and the annotation carries
    // the same figures into the HTML report the CI workflow uploads on failure.
    const pct = (bytes: number): string =>
      `${Math.round((bytes / BUDGET_BYTES) * 100)}%`;
    const lines = [
      `JS budget (≤ ${kb(BUDGET_BYTES)} gz per page, EAGER and FULL) — eager = inline scripts + the static import closure; full = eager + every chunk the page's islands load on activation; gzip -9`,
      ...worst.map(
        (page) =>
          `  ${page.page.padEnd(40)} full ${kb(page.full).padStart(8)} (${pct(page.full)})   eager ${kb(page.eager).padStart(8)} (${pct(page.eager)}, ${page.chunks.length} chunks + ${kb(page.inline)} inline)   deferred ${kb(page.deferred)}`,
      ),
      `  worst page: ${heaviest?.page ?? '—'}`,
      '    eager:',
      ...(heaviest?.chunks ?? []).map(
        ([name, bytes]) => `    ${kb(bytes).padStart(8)}  ${name}`,
      ),
      '    on activation:',
      ...(heaviest?.activation ?? []).map(
        ([name, bytes]) => `    ${kb(bytes).padStart(8)}  ${name}`,
      ),
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
    test.info().annotations.push({
      type: 'js-budget',
      description: lines.join('\n'),
    });

    // Every chunk name that appeared anywhere resolved to a real file. A typo in
    // the parser (or a bundler that changed how it writes specifiers) shows up
    // here as an unresolved chunk rather than as a suspiciously small total.
    expect(missing, 'referenced chunks that are not in dist/').toEqual([]);

    for (const page of pages) {
      expect(
        page.eager,
        `${page.page} ships ${kb(page.eager)} gz of eager JS, over the ${kb(BUDGET_BYTES)} budget. The per-chunk breakdown is in this test's output.`,
      ).toBeLessThanOrEqual(BUDGET_BYTES);
      expect(
        page.full,
        `${page.page} loads ${kb(page.full)} gz of JS once every island on it has activated, over the ${kb(BUDGET_BYTES)} budget (D-06). The per-chunk breakdown is in this test's output.`,
      ).toBeLessThanOrEqual(BUDGET_BYTES);
    }
  });

  test('the measurement is reading a real build, not an empty directory', async () => {
    const pages = measureAll();
    // `learn/index.html` is the CATALOGUE page and `learn/<course>/index.html`
    // are the course pages, not lessons; the curriculum's lesson list is what
    // separates them. Asserted as a floor rather than a count so adding a lesson
    // is not a test edit — but a parser that matched nothing, or a build that
    // emitted no lesson, cannot pass.
    const lessons = pages.filter(
      (page) =>
        /^learn\/[a-z0-9-]+\/index\.html$/.test(page.page) &&
        !/^learn\/(dsa|kubernetes|system-design)\//.test(page.page),
    );
    expect(lessons.length, 'lesson pages measured').toBeGreaterThanOrEqual(127);
    for (const lesson of lessons) {
      // Every lesson runs modules (MarkComplete, PracticeCheck, the ToC), so a
      // lesson measuring zero external chunks means the script tags were not
      // found — the failure mode that would make this whole file report a
      // comfortable, meaningless number. The inline pre-paint theme script is
      // on every page.
      expect(
        lesson.chunks.length,
        `${lesson.page} resolved no external module scripts`,
      ).toBeGreaterThan(0);
      expect(lesson.inline, `${lesson.page} inline scripts`).toBeGreaterThan(0);
    }
    for (const page of pages) {
      // Two independent derivations of EAGER — this file's walk of the HTML and
      // the bundler's own import graph, as the prerenderer recorded it — must
      // name the same chunks. Disagreement means one of them is wrong about
      // what a reader downloads, and FULL is built on the manifest.
      const relativeSet = (files: Set<string>): string[] =>
        [...files].map((file) => relative(DIST, file)).sort();
      expect(
        relativeSet(page.eagerFiles),
        `${page.page}: eager chunks from the HTML vs .build/page-manifest.json`,
      ).toEqual(relativeSet(page.manifestEager));
    }
    // At least one page really is charged for React through the manifest:
    // otherwise FULL would equal EAGER everywhere and gate nothing new.
    expect(
      pages.some((page) => page.activation.length > 0),
      'no page has any activation chunk — the page manifest lists no islands',
    ).toBe(true);
  });

  // The cross-check that keeps the manifest honest: on a page with every kind
  // of island (the flagship lesson), on a page with a visualizer of its own
  // (home) and on a prose lesson with none.
  for (const path of ['/learn/binary-search/', '/', '/learn/k8s-services/']) {
    test(`the browser's own load list agrees with this measurement: ${path}`, async ({
      page,
    }) => {
      // Nothing the page really pulls — after loading, scrolling through and
      // activating every island — may be outside the chunks FULL charges it
      // for, and nothing charged as EAGER may go unfetched. (A chunk the page
      // never fetched staying in FULL is the safe direction: an island a reader
      // does not reach is still budgeted.)
      const file = path === '/' ? 'index.html' : `${path.slice(1)}index.html`;
      const [measured] = measureAll(file);
      expect(measured, `${file} was not measured`).toBeDefined();

      await page.goto(path);
      const islands = await activateEveryIsland(page);
      if (path === '/learn/k8s-services/') {
        expect(islands, 'a prose lesson hosts no island (D-05 R-min′)').toBe(0);
      } else {
        expect(islands, `${path} hosts at least one island`).toBeGreaterThan(0);
      }

      const fetched = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((entry) => new URL(entry.name).pathname)
          .filter((p) => p.startsWith('/assets/') && p.endsWith('.js')),
      );
      expect(
        fetched.length,
        'module chunks fetched from /assets/',
      ).toBeGreaterThan(0);

      const asUrls = (files: Set<string>): Set<string> =>
        new Set([...files].map((f) => `/${relative(DIST, f)}`));
      const full = asUrls(measured?.fullFiles ?? new Set());
      for (const fetchedPath of fetched) {
        expect(
          full.has(fetchedPath),
          `${fetchedPath} was loaded by the page but is not in its FULL set — the budget under-counts by at least that chunk`,
        ).toBe(true);
      }
      // …and nothing counted as eager went unfetched, which would mean the
      // closure is charging the page for code it never loads.
      for (const eagerPath of asUrls(measured?.eagerFiles ?? new Set())) {
        expect(
          fetched,
          `${eagerPath} was counted as eager but never fetched`,
        ).toContain(eagerPath);
      }
    });
  }
});
