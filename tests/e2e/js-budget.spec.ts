/**
 * THE JS BUDGET — spec §4's one hard numeric constraint, measured instead of
 * remembered.
 *
 * §4: "Total JS shipped to any single lesson page ≤ **60 KB gzipped** (excluding
 * the one visualization island's logic, which should still be small)." Until this
 * file existed that number was checked by hand, "per phase", and M8.2/M8.3
 * shipped without the re-measurement — which is how the gamification layer drifted
 * to roughly 1.5–2× the ~5 KB slice `docs/m8-gamification.md` reserved for it with
 * nobody noticing. A budget nothing enforces is a wish.
 *
 * WHAT IS MEASURED, exactly — the same method `docs/m8-gamification.md` names
 * ("build, then `gzip -9` every chunk in a page's static import closure"), done by
 * a machine:
 *
 *   EAGER (the gated figure) = every `<script>` the built HTML carries, plus the
 *   transitive closure of their STATIC imports, each file gzipped at level 9 and
 *   summed. That is what a visitor downloads and executes to render the page.
 *   Inline scripts are gzipped individually, which slightly OVERSTATES them —
 *   over the wire they compress together with the surrounding HTML — and
 *   overstating is the safe direction for a budget.
 *
 *   DEFERRED (reported, not gated) = everything reachable through a DYNAMIC
 *   `import()` from that closure, to a fixpoint. On a lesson page that is the
 *   whole algorithm/renderer registry, and it is an UPPER BOUND that no page ever
 *   pays: the registry's thunks are only invoked for the ids that page's own
 *   `<Visualizer>` tags name, so a lesson loads two or three of those 39 chunks,
 *   on hydration, below the fold. It is also precisely what §4's parenthesis
 *   excludes ("the one visualization island's logic"). Reported because "small"
 *   deserves a number, gated at nothing because gating it would be gating a sum
 *   no reader ever downloads.
 *
 * Gating EAGER at the full 60 KB is therefore stricter than the spec reads — the
 * island's own `Visualizer` script is inside the gate rather than excused by it —
 * and it is the number the report prints, so drift is visible long before it is
 * fatal.
 *
 * WHY THIS LIVES IN PLAYWRIGHT AND NOT IN VITEST: the measurement itself needs no
 * browser, but it does need a `dist/` that matches the source — and this is the
 * only harness in the repo that guarantees one. `playwright.config.ts`'s
 * `webServer` runs `npm run build && npm run preview` locally, and on CI the DoD
 * gate builds before it runs `npm run test:e2e`, where `astro preview` exits 1
 * with "The output directory … does not exist" if it did not. A Vitest test
 * reading `dist/` has no such guarantee: `npm run test` neither builds nor
 * notices, so the first stale run would measure a directory from an unrelated
 * commit and pass. The guards below (an existing `dist/`, a lesson page that
 * really carries module scripts, every referenced chunk present on disk, and the
 * browser cross-check) close what is left.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** The built site. `import.meta.url` is `<repo>/tests/e2e/js-budget.spec.ts`. */
const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

/** Spec §4, in bytes. A hard failure, not a warning. */
const BUDGET_BYTES = 60 * 1024;

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
  /** Path relative to `dist/`, e.g. `learn/binary-search.html`. */
  page: string;
  /** Gzipped bytes of inline `<script>` bodies (JSON-LD excluded). */
  inline: number;
  /** Inline + the gzipped static-import closure of the external scripts. */
  eager: number;
  /** Gzipped bytes reachable only through `import()` — reported, not gated. */
  deferred: number;
  /** Every eagerly-loaded chunk, largest first: `[path relative to dist, bytes]`. */
  chunks: [string, number][];
  /** Absolute paths of the eagerly-loaded chunks, for the browser cross-check. */
  eagerFiles: Set<string>;
  /** Absolute paths of the `import()`-only chunks. */
  deferredFiles: Set<string>;
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

/** Measures one built HTML file. */
function measurePage(html: string): PageBudget {
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
    gzipped(readFileSync(path)),
  ]);
  chunks.sort((a, b) => b[1] - a[1]);
  let deferred = 0;
  for (const path of deferredFiles) deferred += gzipped(readFileSync(path));

  return {
    page: relative(DIST, html),
    inline,
    eager: chunks.reduce((sum, [, bytes]) => sum + bytes, inline),
    deferred,
    chunks,
    eagerFiles: reached,
    deferredFiles,
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
 */
function measureAll(): PageBudget[] {
  // Reset per call: the list is module state, and a second measurement must not
  // inherit the first one's findings (or report them twice).
  missing.length = 0;
  expect(
    existsSync(DIST),
    `No dist/ at ${DIST}. The JS budget can only be measured against a build — run \`npm run build\` (the DoD gate and playwright.config.ts's webServer both do).`,
  ).toBe(true);
  const pages = walk(DIST)
    .filter((file) => file.endsWith('.html'))
    .sort()
    .map(measurePage);
  expect(pages.length, 'dist/ holds no HTML at all').toBeGreaterThan(0);
  return pages;
}

test.describe('the JS budget (spec §4)', () => {
  test('no page ships more than 60 KB gzipped of eager JavaScript', async () => {
    const pages = measureAll();
    const worst = [...pages].sort((a, b) => b.eager - a.eager);
    const heaviest = worst[0];
    expect(heaviest, 'no page was measured').toBeDefined();

    // THE REPORT. `process.stdout.write` rather than `console` (eslint bans every
    // console method repo-wide, §18) — Playwright captures it per test, so the
    // list reporter prints these lines on every run, and the annotation carries
    // the same figures into the HTML report the CI workflow uploads on failure.
    const lines = [
      `JS budget (spec §4: ≤ ${kb(BUDGET_BYTES)} gz per page) — eager = inline scripts + the static import closure, gzip -9`,
      ...worst.map(
        (page) =>
          `  ${page.page.padEnd(32)} ${kb(page.eager).padStart(8)}  (${Math.round((page.eager / BUDGET_BYTES) * 100)}% of budget, ${page.chunks.length} chunks + ${kb(page.inline)} inline)   deferred ${kb(page.deferred)}`,
      ),
      `  worst page: ${heaviest?.page ?? '—'}`,
      ...(heaviest?.chunks ?? []).map(
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
        `${page.page} ships ${kb(page.eager)} gz of eager JS, over spec §4's ${kb(BUDGET_BYTES)} budget. The per-chunk breakdown is in this test's output.`,
      ).toBeLessThanOrEqual(BUDGET_BYTES);
    }
  });

  test('the measurement is reading a real build, not an empty directory', async () => {
    const pages = measureAll();
    const lessons = pages.filter((page) => page.page.startsWith('learn/'));
    // 15 lessons (spec §17). Asserted as a floor rather than a count so adding a
    // lesson is not a test edit — but a parser that matched nothing, or a build
    // that emitted no lesson, cannot pass.
    expect(lessons.length, 'lesson pages measured').toBeGreaterThanOrEqual(15);
    for (const lesson of lessons) {
      // Every lesson hydrates islands (MarkComplete, PracticeCheck, the
      // Visualizer), so a lesson measuring zero external chunks means the script
      // tags were not found — the failure mode that would make this whole file
      // report a comfortable, meaningless number.
      expect(
        lesson.chunks.length,
        `${lesson.page} resolved no external module scripts`,
      ).toBeGreaterThan(0);
      expect(lesson.inline, `${lesson.page} inline scripts`).toBeGreaterThan(0);
    }
  });

  test("the browser's own load list agrees with this measurement", async ({
    page,
  }) => {
    // The cross-check that keeps the parser honest, in both directions: nothing
    // the page really pulls may be outside the two closures walked above, and
    // nothing charged as EAGER may go unfetched. Both are deterministic at
    // `load` — every static import of an executed module script is fetched by
    // then, and nothing can appear without something having imported it. (A
    // fetched chunk landing in the DEFERRED set is fine and expected: the
    // visualizer hydrates and pulls its algorithm and renderer.)
    const measured = measureAll().find(
      (candidate) => candidate.page === 'learn/binary-search.html',
    );
    expect(measured, 'learn/binary-search.html was not measured').toBeDefined();

    await page.goto('/learn/binary-search');
    const fetched = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.startsWith('/_astro/') && path.endsWith('.js')),
    );

    const eager = new Set(
      [...(measured?.eagerFiles ?? [])].map(
        (file) => `/${relative(DIST, file)}`,
      ),
    );
    const deferred = new Set(
      [...(measured?.deferredFiles ?? [])].map(
        (file) => `/${relative(DIST, file)}`,
      ),
    );
    for (const path of fetched) {
      expect(
        eager.has(path) || deferred.has(path),
        `${path} was loaded by the page but is in neither closure — the budget under-counts by at least that chunk`,
      ).toBe(true);
    }
    // …and nothing counted as eager went unfetched, which would mean the closure
    // is charging the page for code it never loads.
    for (const path of eager) {
      expect(
        fetched,
        `${path} was counted as eager but never fetched`,
      ).toContain(path);
    }
  });
});
