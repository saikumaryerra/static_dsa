# React migration — spec amendments

Every stack-specific clause of `docs/site-spec.md` the rewrite onto React changed (plan conflict
C-3), with what changed, why, and which test moved with it. The product did not move: the same three
courses and 127 lessons, the same URLs, the same eight `localStorage` keys, the same mastery loop and
calm invariants, the same trace-then-render pipeline, the same WCAG 2.1 AA bar, and every surface
still works with JavaScript off.

The sign-off is the user's hard-constraint table of 2026-10-20 (`CLAUDE.md`, "Hard-constraint
decisions for the rewrite"), which kept most constraints, **dropped** the blanket dependency ban and
the portable artifact, and **raised** the JS budget to ~120 KB gz. The reasoning and the rejected
alternatives are in `react-migration-decisions.md` (cited as D-xx); the executable plan is
`react-migration-plan.md`.

---

## R-1 · §1 Overview — rendered by React, deployed at one origin

**Was** "prerendered to static HTML/CSS/JS and deployable to any static host (GitHub Pages, Netlify,
Vercel, Cloudflare Pages)", built by Astro.

**Now** prerendered by React at build time and deployed at the **root of one origin** on a static
host — Cloudflare Workers static assets today.

**Why.** The framework changed by the user's decision; the deployment model changed because
portability was dropped (R-6). Nothing about "static, no backend" moved.

## R-2 · §4 Tech stack and §0 rule 4 — React on Vite; dependencies are justified, not banned

**Was** Astro `output: 'static'`, "plain TypeScript + the DOM" islands, and "no dependencies beyond
§4 without a `// SPEC-GAP:`".

**Now** React 19 rendered by an in-repo static-site generator on Vite (`scripts/vite-plugin-ssg.ts`:
client build, SSR build, prerender of every route with `renderToStaticMarkup`). Only the three
instruments — the Visualizer, Trace Trials, the Final Run — hydrate, as isolated React islands
activated lazily by a small bootstrap (`src/client/islands.ts`); every other client behaviour is a
framework-free module (`src/client/modules/`). MDX goes through `@mdx-js/rollup` with Astro's exact
remark/rehype chain, so lesson output is byte-comparable. There is no blanket dependency ban: each
dependency is justified where it is used (D-18), and a visualization library the renderers do not
need is still out.

**Why.** D-02 (React with an in-repo generator rather than a meta-framework), D-04 (two-pass render),
D-05 R-min′ (islands only for instruments — React loads only on the 15 DSA lessons, `/` and
`/about/`), D-07 (MDX pipeline parity).

**Tests.** New: `tests/unit/mdx-pipeline.test.ts`, `content-loader.test.ts`, `island-ssr.test.ts`,
`viz-session.test.ts`; `tests/e2e/hydration.spec.ts` (every page with an island: each island
activates and none reports `ldsa:hydration-error`).

## R-3 · §4 Hard constraints — the JS budget is 120 KB gz, EAGER and FULL

**Was** ≤ 60 KB gzipped per lesson page, measured over the eager closure, with lazily imported
chunks "reported, not gated".

**Now** ≤ 120 KB gzipped on **every** page, on two gated figures: EAGER (the scripts the HTML loads
plus their static imports) and FULL (EAGER plus every chunk the page's islands load on activation —
React, the island, its algorithm and renderer chunks — read from `.build/page-manifest.json`, which
the prerenderer writes).

**Why.** The user raised the budget. FULL exists because React now loads on activation (D-06):
under the old metric it would have moved into the ungated bucket and the number would have stopped
meaning anything. Measured at the P3 build: worst FULL 100.0 KB (`/learn/sorting-basics/`), worst
EAGER ~12 KB; the spec prints the current table on every run.

**Tests.** `tests/e2e/js-budget.spec.ts` — EAGER ≤ 120 KB **and** FULL ≤ 120 KB; EAGER derived from
the HTML must name the same chunks as the manifest; the browser cross-check loads `/assets/` (was
`/_astro/`), activates every island on three pages, and requires every fetched chunk to be in FULL
and every EAGER chunk to be fetched.

## R-4 · §6/§7 Content model — a framework-free loader with `zod`

**Was** an Astro content collection (`src/content.config.ts`, `getCollection`, `render`), and course
pages as three thin `.astro` files beside `[slug].astro`.

**Now** `src/content/schema.ts` (a field-for-field `zod` copy of the collection schema) and
`src/content/lessons.ts` (loads every lesson, runs the cross-lesson guards — duplicate slug,
unknown or unpublished prerequisite, lesson/course slug collision, missing `## Practice` — and fails
naming the file and the field). Course pages are rows in `src/routes.tsx`. Lesson files, their
frontmatter and their URLs did not change (D-08, D-09).

**Tests.** `tests/unit/content-loader.test.ts` (each guard); `tests/unit/structured-data.test.ts`
retyped from `CollectionEntry` to `LessonEntry`; `tests/unit/reading-time.test.ts`'s fixture spells
the codemod's extensionless imports.

## R-5 · §8 Page layouts and §9 Component inventory — React components; islands versus modules

**Was** "Astro layouts/pages" and "Astro components unless they need interactivity, in which case a
TS island"; `BaseLayout` owned the `<head>`; the prose pass lived in `astro.config.mjs`.

**Now** server-rendered React components. The inventory's "Type" column says which behaviour each
component has: three **React islands** (`Visualizer`, `Challenge`, `FinalRun`), and **modules** for
`ThemeToggle`, `CodeTabs`, `MarkComplete`, `PracticeCheck`, `ReviewStrip` and the progress painters.
The `<head>` is rendered by `src/render/Document.tsx`; the prose pass is
`src/mdx/rehype-lesson-prose.ts`, moved verbatim. Each former scoped `<style>` block is a plain CSS
file under `src/styles/{layouts,components,pages}/`, rewritten where un-scoping changed the cascade
(`css-scope-audit.md`, D-10). The DOM contract every test selects on is unchanged.

**Tests.** `tests/unit/tokens-contrast.test.ts` scans `src/**/*.css` (plus the `<style>` blocks left
in `.tsx`, the noscript kill-switches) and requires at least the 37 stylesheets the legacy tree
carried, so an empty scan fails; the chip rules come from `difficulty-chip.css`.
`tests/unit/palette-states.test.ts` reads `pages/glossary.css`. `tests/e2e/utils/mastery.ts`
(`trackIntervals`) ignores Vite dev frames instead of `astro dev` ones; "no repeating timer at all"
is unchanged. `scripts/migration/scope-audit.mjs` and `style-parity.mjs` proved the converted CSS
computes the same styles as the scoped originals.

## R-6 · §14 The build contract — one origin, root-absolute URLs (replaces U-2)

**Was** U-2 (`docs/redesign-2026-08/03-amendments.md`): one portable artifact at any origin and any
sub-path, made so by `scripts/portablize.mjs` rewriting every internal URL to a document-relative
one; `dist/404.html` the one root-absolute exception, prefixed with the base path;
`[data-site-root]` as the anchor client-built links resolved against; `SITE_URL` the full deployment
URL, sub-path included; `npm run rehost <url>` to stamp a built `dist/` for hosts with no build
step; three accepted limitations (sub-path `robots.txt`, shared `localStorage`, competing mirrors).

**Now** the site deploys at the **root of one origin**. Every internal URL is **root-absolute**, in
server markup and client code alike (`lessonHref()`/`reviewHref()` return literals);
`scripts/verify-dist.mjs` fails the build if any internal `href`/`src` does not resolve to a file in
`dist/`. `SITE_URL` is the **origin alone** — a value with a path fails the build — and the
`PUBLISHING_BUILDERS` guard (`CF_PAGES`, `WORKERS_CI`, `NETLIFY`, `VERCEL`) moved verbatim to
`src/render/site-url.ts`. Retired: `scripts/portablize.mjs`, `scripts/rehost.mjs`, `npm run rehost`,
`siteRoot()`, the `[data-site-root]` anchor, the `portable` Playwright project and its :4322 server.
U-1 (every page URL carries a trailing slash) is unchanged. `wrangler.jsonc` is unchanged; the
`public/_headers` immutable rule moved from `/_astro/*` to `/assets/*`.

**Why.** The user dropped portability (D-01). It also re-imported a failure class the pass existed
to police — URLs assembled at runtime inside chunks — for a deployment shape the site does not use.

**Tests.**

| Test | Was | Now |
|---|---|---|
| `tests/unit/portablize.test.ts` | the relative-URL pass, chunk-literal detection, site-root anchor | **deleted** with the pass; the guarantee it backed is `url-shape.spec.ts`'s root-absolute + resolves check and `verify-dist.mjs` |
| `tests/unit/rehost.test.ts` | stamping `dist/`; the four `PUBLISHING_BUILDERS` pinned | **replaced** by `tests/unit/site-url.test.ts`: the same four builders pinned, the sentinel default, **plus** a sub-path `SITE_URL` rejected |
| `tests/e2e/portable.spec.ts` | the artifact works under `/deployments/learndsa/` | **deleted**; its root-deployment half (deep link, reload, assets from depth 2, 404 body and status, back/forward) moved to the new `tests/e2e/static-hosting.spec.ts` |
| `url-shape.spec.ts` "the relative pass ran, and the 404 kept its root-absolute links" | every page's internal URLs document-relative except `404.html` | **inverted**: "every internal URL is root-absolute, 404 included, and resolves" — no `./`, `../` or bare relative path in any built document, and every one resolves to a file `dist/` serves, assets included |
| `tests/unit/progress.test.ts` `reviewHref`/`lessonHref` | joined onto a root, two sub-path cases | root-absolute literals; slash before `?`/`#`; sub-path cases retired |

## R-7 · §11.3 The `Visualizer` — a server half and a React island

**Was** `src/viz/Visualizer.astro`, an Astro component with a 1,650-line client script.

**Now** `src/viz/Visualizer.tsx` (server: validates ids at build time, runs the authored input,
renders the instrument, its static still and its ledger) and `src/viz/VisualizerIsland.tsx` (the
island, hydrated when it nears the viewport). The renderers stay imperative behind a ref; the Player,
the algorithms, the renderers and `viz/core` are unchanged, and the predict-mode session rules moved
into a pure reducer (`src/viz/core/session.ts`). The MDX props are unchanged.

**Tests.** `tests/e2e/m7-player-v2.spec.ts` "a renderer that cannot load says so…" forced the
failure through `astro:page-load` with a bogus renderer id; it now aborts the real
`**/assets/ArrayRenderer-*.js` request with `page.route` and keeps the same four assertions (a real
load failure instead of a simulated swap). `tests/unit/viz-session.test.ts` pins the session
reducer.

## R-8 · §16 Directory structure

**Was** the Astro tree: `astro.config.mjs`, `src/content.config.ts`, `.astro` layouts, pages and
components, `src/viz/Visualizer.astro`.

**Now** the React tree as built: `vite.config.ts`, `src/entry-server.tsx`, `src/routes.tsx`,
`src/content/{lessons,schema}.ts`, `src/mdx/`, `src/render/`, `.tsx` layouts, pages and components,
`src/client/{islands,island-registry}.ts` and `modules/`, and `src/styles/site.css` with one file
per former style block. The Astro tree is in the history at `51a70cf`.

## R-9 · §18 Definition of Done — the same six gates, new commands

**Was** `npm run build` = `astro check && astro build && node scripts/portablize.mjs`; the JS budget
line said 60 KB gz eager.

**Now** `npm run build` = `tsc --noEmit -p tsconfig.json && vite build && node
scripts/verify-dist.mjs`; the budget line says 120 KB gz EAGER and FULL; two checklist items name
the hydration and static-hosting specs. The six gates (build, lint, format:check, test, test:e2e,
validate:content) and their CI order are unchanged (`.github/workflows/ci.yml`).

**Tests.** `tests/e2e/nojs-orphan-sections.spec.ts`'s curriculum walk now derives its timeout from
the lesson count (`30_000 + lessons × 2_000`, the rule `f0a2b47` set for the other two walks) — it
exceeded the 30 s default at 127 lessons on both builds. D-12's `.astro-code` → `shiki` rename moves
the five e2e selectors in `m4-lessons`, `m6-dynamic-programming`, `plan-c-ledger` and
`m7-print-hcm` in step with the source; the assertions are unchanged.

---

## Not amended, and why

- **The pixel and aria baselines.** `baseline-aria.spec.ts` must pass unchanged; the 14 pixel
  captures are compared first and re-seeded only after a reviewed diff (plan §5 P4, §12 decision 4).
- **The markdown-fence dark-theme defect** (plan §1): reproduced for parity, fixed after the
  migration with its own visual review.
- **§17's milestone ladder and §19's history** describe what was built and decided at the time, on
  Astro; they are records, not instructions, and stay as written.
