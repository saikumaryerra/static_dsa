# React migration plan — LearnDSA (Astro 7 → React 19 static site)

The executable plan for rewriting the site onto React while keeping the product identical. It is
written for an implementer at medium effort: every phase names the files it touches, who owns them,
the commands that prove it is done and the e2e specs that must be green. Reasoning and rejected
alternatives live in [`react-migration-decisions.md`](./react-migration-decisions.md) (cited as
D-xx, conflicts as C-x); the baseline facts live in
[`react-migration-inventory.json`](./react-migration-inventory.json) (re-generate or compare with
`node scripts/migration/inventory.mjs`).

**Ground rules (from `CLAUDE.md`, binding on every phase).** Branch `feat/react-migration` only;
Conventional Commits; **no co-author trailer** (C-5); no push, deploy or merge (C-4). Do not edit
lesson prose or frontmatter (D-08). Do not run `npm run fonts` (D-16). Only the orchestrator runs
the full e2e suite, the CSS audits and baseline regeneration, and only when no agent is running
(CLAUDE.md: a red e2e run under load is not evidence). Do not add a dependency that is not in D-18
without recording it there with its justification.

---

## 1. Baseline (measured 2026-10-20 on the branch base `51a70cf`)

| Fact | Value | Source |
|---|---|---|
| Toolchain | Astro 7.1.1 · Vite 8.1.5 (Rolldown) · Tailwind 4.3.3 via `@tailwindcss/vite` · TS 6.0.3 strict · Vitest 4 · Playwright 1.61.1 · Node 24 (engines ≥ 22.12) · `@mdx-js/mdx` 3.1.1 · Shiki 4.3.1 · zod 4.4.3 | `node_modules/*/package.json` |
| Lessons | 127 `.mdx` files, all published: dsa 15, kubernetes 67, system-design 45 | inventory `summary` |
| Built pages | 136 HTML: home 1, catalogue 1, course 3, lesson 127, glossary 1, about 1, dev 1, 404 1 | inventory `routes` |
| MDX surface | 11 components + 11 diagrams imported (356 import lines); 381 `{frontmatter.slug}`, 15 `{frontmatter.complexity}`; 42 `slot="stage"`; 21 `export const` blocks (the code-tab arrays); 56 GFM tables; fences: text 131, bash 112, yaml 99, json 6, http 4, sql 4 | inventory `mdx` |
| Storage keys | exactly spec §6's 8: `theme`, `pref:viz-speed`, `pref:code-lang`, `lesson:{slug}:complete`, `progress:v1:{slug}`, `ld:challenges:v1`, `ld:finalrun:v1`, `ld:days:v1`; 28 call sites | inventory `storageKeys`, `storageCallSites` |
| Browser APIs | `document` 20 files, `window` 10, `localStorage` 9, … ; `sessionStorage`/`indexedDB`/cookies/network: **0** | inventory `browserApis` |
| Source | 52 `.astro` files (30 scoped `<style>` blocks, 5 `is:global`, 17 bundled client `<script>`s + the inline pre-paint script), `src/viz/Visualizer.astro` 4,047 lines (1,650-line client script) | `grep` |
| CSS | 8 files 85.0 KB raw / 17.8 KB gz + per-page inline blocks (≤ 18.3 KB raw) | baseline `dist/_astro` |
| JS (eager closure, gz -9, `js-budget.spec.ts` method) | binary-search 21.1 KB · sorting-basics 20.4 · `/` 13.3 · `/about/` 9.9 · k8s-services 8.5 · `/learn/` 7.2 · `/learn/dsa/` 5.6 · glossary 1.3 · 404 0.7; viz chunks a binary-search reader loads ≈ 7.2 KB deferred | baseline `dist/` |
| Fonts | `plex-sans.woff2` 60,020 B, `plex-mono.woff2` 17,684 B | inventory `assets.fonts` |
| Gates on the legacy build | build ✔ (393 s), lint ✔, format:check ✔, vitest ✔ 65 files / 1,126 tests, `validate:content -- --strict` ✔ (127 lessons, 5 accepted notes) | orchestrator run |
| e2e baseline | **Not yet a usable reference.** The run that finished during planning (1.3 h, load average 12–20 on 4 cores, other workloads on the machine): 446 passed, 43 failed, 14 skipped. The failures sampled are 30 s timeouts inside axe `analyze()` and navigation walks, i.e. load, not violations. The orchestrator re-runs on a quiet machine (and, for anything still red, a `git archive 51a70cf` control run) and records the clean result here before P2 — every later phase compares against that, not against this run | `scratchpad/baseline/e2e.log` |

**Known pre-existing issues to keep separate from migration results:**

- The under-load e2e baseline above (43 failures, sampled ones all timeouts) — per the memory note
  *e2e-flake-control-run*, a failure is attributed to the migration only after a quiet re-run and,
  if needed, a `git archive 51a70cf` control run.
- **Markdown code fences never get the dark theme** (found while planning). Shiki writes its
  classes to the hast property `class`, the rehype prose pass writes `className: ['md-code']`, and
  the latter wins when MDX turns the tree into JSX — so every fence in the built site is
  `<pre class="md-code" style="background-color:#fff;…">` without `astro-code`, and
  `global.css`'s dark wiring (`[data-theme='dark'] .astro-code …`) never reaches any of the 356
  markdown fences — 355 of them in the 112 prose lessons (CodeTabs' `<pre>` is unaffected). The migration **reproduces this
  exactly** (parity first; the planning experiment E4 confirms React output matches it) and the
  fix is a separate, post-migration change with its own visual review — do not "tidy" the
  class/className interplay during the port.

## 2. Target architecture

**One paragraph.** React 19.3 renders every page to static HTML at build time through a small
in-repo static-site generator on Vite 8: `vite build` builds the client assets, builds an SSR bundle
containing the route table and all 127 MDX lessons (compiled by `@mdx-js/rollup` with Astro's exact
remark/rehype chain), then prerenders the 136 pages with `renderToStaticMarkup` into `dist/` in the
directory layout the site already serves. Navigation stays plain multi-page navigation (no client
router). Only *instruments* hydrate — the Visualizer (with its ledger and predict mode), Trace
Trials, Final Run and Explain-it-back — each as an isolated React island whose container is its own
root element, activated lazily by a ~1 KB bootstrap that loads React only when an island activates.
Every other client behaviour stays a framework-free TypeScript module over server-rendered markup.
Pure TypeScript (`src/viz/{core,algorithms,renderers}`, `src/lib/*`) is untouched; the renderers
stay imperative behind a ref. Output is static files for Cloudflare Workers static assets with the
committed `wrangler.jsonc` unchanged.

```
src/content/lessons/*.mdx ─@mdx-js/rollup (gfm, smartypants, shiki, prose pass, heading ids)─┐
src/routes.tsx ─ pages/*.tsx ─ layouts/*.tsx ─ components/*.tsx ─────────────────────────────┤
                                                                         vite build (ssr) ─┤→ .build/server/entry-server.js
src/client/islands.ts + modules/*.ts + styles/site.css ─ vite build (client) → dist/assets/ │
                                                                                            ↓
                         prerender: for each route → <Document> + renderToStaticMarkup(page)
                         islands: <Island> = container + renderToString(component, props)
                         → dist/<route>/index.html, dist/404.html, sitemap.xml, robots.txt
                         → .build/page-manifest.json (per-page chunk lists for the JS budget)
                         → scripts/verify-dist.mjs (links resolve, one h1, no remnants)
```

### 2.1 Build and dev pipeline

| Command | Runs | Notes |
|---|---|---|
| `npm run dev` | `vite` | `scripts/vite-plugin-ssg.ts` serves every route through `server.ssrLoadModule('/src/entry-server.tsx')`; slashless URLs 404 as in production |
| `npm run build` | `tsc --noEmit -p tsconfig.json && vite build && node scripts/verify-dist.mjs` | `vite build` = client env → ssr env → prerender (`builder.buildApp`) |
| `npm run preview` | `node scripts/serve-dist.mjs` | static server; port `PW_PORT` (4321), dir `PW_DIST` (`dist`); no redirects, 404 → `dist/404.html` |
| `npm run render -- <url> [out.html]` | `node scripts/render-route.mjs` | one route through the dev SSR, for parity diffs without a full build |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.json` | the type gate (was `astro check`) |

Shape of `vite.config.ts` (names are binding; confirm option spellings against the installed Vite
8 docs while implementing):

```ts
export default defineConfig({
  plugins: [{ enforce: 'pre', ...mdx(mdxOptions) }, react({ include: /\.(tsx|mdx)$/ }), tailwindcss(), ssg()],
  build: { outDir: OUT_DIST, assetsDir: 'assets', manifest: true, emptyOutDir: true },
  environments: {
    client: { build: { rollupOptions: { input: {
      islands: 'src/client/islands.ts',
      site: 'src/styles/site.css',
      ...moduleEntries(),            // one entry per src/client/modules/*.ts
    } } } },
    ssr: { build: { outDir: OUT_BUILD + '/server', rollupOptions: { input: 'src/entry-server.tsx' } } },
  },
  builder: {
    async buildApp(builder) {        // `vite build` = client → ssr → prerender, one command
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
      await prerender({ outDist: OUT_DIST, outBuild: OUT_BUILD });   // from scripts/vite-plugin-ssg.ts
    },
  },
});
```

Islands are not client entries: the registry's dynamic `import()`s make each island component (and
`react-dom/client`) its own chunk. MDX is imported only by the SSR entry, never by client code.
In dev, `ssg()`'s `configureServer` hook renders through `server.ssrLoadModule` (or the
environment runner) and points scripts at `/src/client/…` and the stylesheet at
`/src/styles/site.css`.

`vite build` writes Vite's manifest to `dist/.vite/manifest.json`; the prerenderer reads it, moves it
to `.build/client-manifest.json`, and writes `.build/page-manifest.json`:

```json
{ "pages": { "learn/binary-search/index.html": {
    "eager":   ["assets/islands-HASH.js", "assets/practice-check-HASH.js", "…"],
    "islands": { "visualizer": ["assets/VisualizerIsland-HASH.js", "assets/client-HASH.js", "…"],
                 "challenge": ["…"], "final-run": ["…"] },
    "viz":     ["assets/binary-search-HASH.js", "assets/linear-search-HASH.js", "assets/ArrayRenderer-HASH.js"] } } }
```

`.build/` and `.migration/` are gitignored and ignored by ESLint and Prettier. **Output location
is configurable** so two implementers can build at once without clobbering each other:
`LDSA_OUT=/tmp/ws-i npm run build` writes `/tmp/ws-i/dist` and `/tmp/ws-i/.build`; the rule
everywhere (prerender, `verify-dist.mjs`, `js-budget.spec.ts`) is that build metadata lives in the
`.build/` **sibling** of the `dist/` being read. Unset, both are at the repository root.

### 2.2 Rendering model (D-04)

- `src/entry-server.tsx` exports `init(): Promise<void>` (Shiki highlighter for python, javascript,
  java, bash, http, json, sql, text, yaml; `preloadVizRegistry()`), `routes(): RouteDef[]`, and
  `render(path, assets): RenderedPage` (`{ html, islands: string[], modules: string[] }`).
- Two-pass render per page: the page body renders with `renderToStaticMarkup` inside a
  `RenderContextProvider`; components record into the context (`usePageMeta()`, `useClientModule(name)`,
  island registrations, the per-page `uid()` counter, the instrument-id scope). `Document`
  (`src/render/Document.tsx`) then renders `<html>`, the `<head>` from the recorded `PageMeta`, and
  injects the body string. Module scripts are emitted as `<script type="module" src>` in `<head>`
  **in first-registration order** — the order Astro 7 emitted them in the body (each at its
  component's first use), so document-level listeners keep their legacy registration order. The
  island bootstrap follows the modules. (Script placement is excluded from the parity hashes; the
  JS-budget and hydration specs gate script loading.)
- `<Island name as rootProps props>` (`src/render/Island.tsx`): renders the container element
  `as` with `rootProps` plus `data-island=name` and `data-props=JSON.stringify(props)` (only when
  the island needs props not already on the root), and as its children the **isolated**
  `renderToString(createElement(Component, props))`. Islands receive no React context.
- Client: `src/client/islands.ts` scans `[data-island]`, looks up `src/client/island-registry.ts`,
  runs each entry's `prepare(container)` (pre-activation DOM states), waits for its trigger
  (`visible` with `rootMargin: '200px'`, `idle`, or `event`), then
  `Promise.all([import('react-dom/client'), entry.load(container, props)])` and
  `hydrateRoot(container, <C {...props} container={container} />, { onRecoverableError })`
  (`createRoot` for client-only islands). `onRecoverableError` dispatches
  `new CustomEvent('ldsa:hydration-error', { detail: { island } })` on `document`.
- **Never** read `window`/`document`/`localStorage`/`location` during render; read them in effects.
  The prerender runs in plain Node, so a violation is a build failure, not a review comment.

### 2.3 Client behaviour: islands versus modules (D-05, R-min′ — decided)

| Behaviour (legacy file) | Target | Files | Trigger |
|---|---|---|---|
| Visualizer + Ledger + predict (`Visualizer.astro`, `Ledger.astro`) | island `visualizer` | `src/viz/Visualizer.tsx` (server wrapper), `src/viz/VisualizerIsland.tsx`, `src/viz/Ledger.tsx`, `src/viz/core/player-store.ts`, `src/viz/core/session.ts` | visible |
| Trace Trials (`Challenge.astro`) | island `challenge` | `src/components/Challenge.tsx`, `src/components/ChallengeIsland.tsx` | idle — and its `prepare` subscribes to `viz:run` at page load and replays the buffered runs on activation (the legacy card listened from page load; a run made before activation must still clear a trial) |
| Final Run (`FinalRun.astro`) | island `final-run` | `src/components/FinalRun.tsx`, `src/components/FinalRunIsland.tsx` | visible |
| Explain-it-back (`ExplainBack.astro`) | module (D-05 R-min′) | `src/components/ExplainBack.tsx` (SSR `<template>`, legacy markup), `src/client/modules/explain-back.ts` (legacy script verbatim) | `<script type="module">` on lessons with `explainPrompt` |
| PracticeCheck, MarkComplete, CodeTabs, ThemeToggle, StepLink, ReviewStrip, ToC scroll-spy, lesson stage pips, learning-days recorder, home/learn/course painters, glossary filter | modules | `src/client/modules/<name>.ts`, one entry each | `<script type="module">` on pages that render the component |

Interop contracts that do not change: the `viz:run` CustomEvent (`VIZ_RUN_EVENT`), `viz:speed`,
`codetabs:lang`, `PROGRESS_CHANGED_EVENT`, `PROGRESS_RESET_EVENT`, `onRestore` (bfcache), and the
`data-*` hooks every module and test selects on. A module may drive an island only through the DOM
(e.g. StepLink clicks the ledger row's seek button) or through those events.

### 2.4 Content pipeline (D-07, D-08, D-09)

| Concern | Implementation | Proof |
|---|---|---|
| Discovery | `import.meta.glob('./lessons/*.mdx', { eager: true })` in `src/content/lessons.ts`; asserts module count = file count | `content-loader.test.ts`; inventory lessons table |
| Frontmatter | `remark-frontmatter` + `remark-mdx-frontmatter` → `export const frontmatter`; validated by `src/content/schema.ts` (zod 4, field-for-field copy of `src/content.config.ts`); error names file + field | unit test with a broken fixture |
| Cross-lesson guards | duplicate slug, unknown/unpublished prerequisite, lesson-vs-course slug collision, missing `## Practice` heading, glossary `lessonSlug` integrity — all in `checkCollection()` (pure) | `content-loader.test.ts` |
| Raw body | `src/mdx/remark-lesson-body.ts` → `export const body` (reading time, Practice guard) | `reading-time.test.ts` unchanged |
| Markdown | `remark-gfm@4.0.1`, `remark-smartypants@3.0.2`, defaults, Astro's order | `mdx-pipeline.test.ts`; `proseHash` ×127 |
| Code | `src/mdx/rehype-shiki-astro.ts` (vendored transform, `shiki@4.3.1`, dual theme, `astro-code` class until P5). Copy Astro's language branch exactly: a Shiki *special* language (`isSpecialLang`: `text`, `plaintext`, `txt`, `plain`, `ansi`) keeps its authored name in `data-language` — the planning experiment E4 drifted to `plaintext` on 131 `text` fences without it. Keep Shiki writing `properties.class` and the prose pass writing `properties.className`: the built fence is `class="md-code"` only (see §1, pre-existing dark-theme defect) | `mdx-pipeline.test.ts`; `markers.mdCode`, `proseHash` |
| Prose pass | `src/mdx/rehype-lesson-prose.ts` (moved verbatim: `div.table-scroll[tabindex=0]`, `pre.md-code[tabindex=0]`) | `markers.tableScroll`, `markers.mdCode` |
| Heading ids / ToC | `src/mdx/rehype-heading-ids.ts` (vendored github-slugger logic) → ids + `export const headings` | `headings`, `proseHash` |
| Components | MDX imports resolve `X.astro` → `X.tsx` via the temporary resolver; codemod at P5 | build fails on a missing component |
| Slots | `Bench` partitions children by `slot` prop and strips it | `island-ssr.test.ts` (slot case); `bodyHash` |
| Internal links | authored root-absolute with trailing slash (unchanged); `verify-dist.mjs` fails the build on any unresolved link; `validate:content` still checks lesson links | `internalLinks`; url-shape spec |
| Safety | MDX is compiled, never `eval`ed at runtime; no runtime content fetch | — |

### 2.5 URL model (D-01, D-13)

Root-absolute internal URLs with a trailing slash on every page path; directory output; `/404.html`
at the root; declared URLs from `SITE_URL` (origin only — a path fails the build) or the
`https://learndsa.invalid` sentinel; `PUBLISHING_BUILDERS` guard moved verbatim to
`src/render/site-url.ts`. Query strings and fragments are untouched (`?review=1#practice` still
deep-links into predict mode). `wrangler.jsonc` unchanged; `public/_headers` rule `/_astro/*` →
`/assets/*`. Deep links, refresh and back/forward are ordinary document navigation.

### 2.6 CSS (D-10)

`src/styles/site.css` = `@import './global.css';` then one `@import` per converted block, in this
order: layout files, component files (alphabetical), page files. Directory and naming:
`src/styles/layouts/lesson.css`; `src/styles/components/<kebab-name>.css` (e.g. `bench.css`,
`visualizer.css`, `ledger.css`); `src/styles/pages/<name>.css` (`home.css`, `learn-index.css`,
`course.css`, `glossary.css`, `about.css`, `not-found.css`, `dev-renderers.css`). WS-P creates
**every** file empty in P1 with its `@import` so later workstreams only fill files they own. Each
converted block: copy the CSS verbatim, then apply the fix list from
`docs/migrations/css-scope-audit.md` for that file; never add `!important` to win a cascade the
scoped version won by specificity — rewrite the selector instead.

---

## 3. Migration matrix

| # | Subsystem (legacy) | Target | Verified by |
|---|---|---|---|
| 1 | `astro build` + `portablize.mjs` | `vite build` + `vite-plugin-ssg.ts` prerender + `verify-dist.mjs` | build gate; inventory route set |
| 2 | `astro check` | `tsc --noEmit` | build gate |
| 3 | Content collection (`content.config.ts`, `getCollection`, `render`) | `src/content/{schema,lessons}.ts` | `content-loader.test.ts`; inventory `lessons` |
| 4 | Astro MDX (gfm, smartypants, Shiki, prose pass, heading ids, `frontmatter`) | `src/mdx/*` + `@mdx-js/rollup` | `mdx-pipeline.test.ts`; `proseHash` ×127 |
| 5 | Routes (`pages/**`, `[slug]` `getStaticPaths`, course pages, sitemap/robots endpoints) | `src/routes.tsx`, `src/pages/*.tsx`, prerender | inventory routes, `sitemapPaths`, `robotsTxt`; `url-shape.spec.ts` |
| 6 | `BaseLayout` / `LessonLayout` | `src/render/Document.tsx`, `src/layouts/*.tsx` | `mainHash`; `baseline-aria.spec.ts` |
| 7 | Head/SEO (canonical, OG, Twitter, JSON-LD, `deploymentUrl`, SITE_URL guard) | `Document` + `src/render/site-url.ts` | inventory `title`/`canonicalPath`/`description`/`robots`/`jsonLdTypes`; `m5-glossary-about-seo`; `site-url.test.ts` |
| 8 | Static components (Callout, Collapsible, Bench, Band, ComplexityTable, Breadcrumb, PrevNext, WhatsNext, DifficultyChip, LessonCard, CourseCard, CourseIndex, TrackArc, MasteryPips, SiteHeader, SiteFooter, TableOfContents) | SSR-only `.tsx` | `mainHash`; their specs |
| 9 | Diagrams (`Figure` + 11) | SSR-only `.tsx`, zero JS | `mainHash`; `courses.spec.ts` "renders a real figure"; `nojs-orphan-sections` |
| 10 | Visualizer + Ledger + Player wiring + predict | island `visualizer` | `binary-search*`, `m7-player-v2`, `viz-focus-retention`, `plan-a-frames`, `plan-c-ledger`, `m8-predict`, `m6-dynamic-programming`, hydration check, budget |
| 11 | Algorithms, renderers, `viz/core` | unchanged pure TS | unit suite unchanged |
| 12 | Challenge, FinalRun (islands); ExplainBack (module, D-05 R-min′) | islands / module | `m8-trials-final-run`, `m8-explain-note` |
| 13 | PracticeCheck, MarkComplete, ReviewStrip, painters, learning days, stage pips | modules | `m8-practice-check`, `m8-milestone`, `m8-mastery-ladder`, `m8-review-queue`, `m8-learning-days`, `m8-calm-invariants`, `m8-decisions`, `m8-degraded`, `m7-progress` |
| 14 | CodeTabs (Astro `<Code>`) | SSR (shared highlighter) + module | `m7-codetabs` |
| 15 | Theme (pre-paint inline + toggle) | verbatim inline script in `Document` + module | `m1-gaps`, `m7-brand`, `theme.test.ts` |
| 16 | ToC scroll-spy + inline ToC | SSR + module | `m7-wayfinding` |
| 17 | Glossary filter | SSR + module | `m7-glossary` |
| 18 | StepLink | SSR (`instrumentIdFor`) + module | `plan-c-ledger` |
| 19 | Persistence (`progress.ts`, `enrichment-store.ts`, `learning-days.ts`, `theme.ts`) | unchanged except `siteRoot()` removal | `progress.test.ts` etc.; inventory `storageKeys` |
| 20 | CSS (tokens, global, 30 scoped + 5 global blocks) | `site.css` + converted files | scope audit (P1), style parity (P3), pixel baselines (P4) |
| 21 | Fonts | unchanged bytes | `font-charset.test.ts`; inventory font SHA-256 |
| 22 | Public assets, icons, OG | unchanged; `_headers` rule renamed | inventory `distFiles` |
| 23 | Portability (`portablize`, `rehost`, `siteRoot`, `portable` project) | retired (D-01) | `url-shape.spec.ts` (root-absolute + resolves) |
| 24 | Deployment (`wrangler.jsonc`, Workers Builds) | unchanged | `static-hosting.spec.ts`; layout check in `verify-dist.mjs` |
| 25 | CI (`ci.yml`) | same six gates, new commands | CI run (orchestrator) |
| 26 | `astro dev` | Vite dev + SSG middleware | P1 curl smoke |
| 27 | ESLint/Prettier Astro plugins | `eslint-plugin-react-hooks`; no Prettier plugin | lint/format gates |
| 28 | Content validator | unchanged until P5 (diagram import regex) | `validate:content -- --strict`; `content-validator.test.ts` |
| 29 | `og`, `icons`, `fonts`, `audit:frames` scripts | unchanged (framework-free) | `npm run audit:frames` exits 0 |
| 30 | JS budget test | FULL metric ≤ 120 KB (D-06) | `js-budget.spec.ts` |
| 31 | `<noscript>` kill-switches | inline per component, same CSS | `nojs-orphan-sections`; nojs pixel captures; inventory `noscript` counts |

---

## 4. Workstreams and file ownership

At most **two implementers at once**. Ownership is by file; a file changes owner only at a phase
boundary, as stated. Shared registries are split so each owner edits only its own file.

| WS | Name | Owns |
|---|---|---|
| **WS-P** | Platform | `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `wrangler.jsonc`, `public/_headers`, `scripts/vite-plugin-ssg.ts`, `scripts/{serve-dist,verify-dist,render-route}.mjs`, `src/entry-server.tsx`, `src/routes.tsx`, `src/render/**`, `src/mdx/**`, `src/mdx.d.ts`, `src/content/{schema,lessons}.ts`, `src/lib/highlight.ts`, `src/client/islands.ts`, `src/styles/site.css`; in P1 also the MDX layout primitives (`Bench`, `Band`, `Callout`, `Collapsible`, PracticeCheck markup) and all stubs |
| **WS-I** | Islands | `src/viz/Visualizer.tsx`, `src/viz/VisualizerIsland.tsx`, `src/viz/Ledger.tsx`, `src/viz/core/{player-store,session}.ts`, `src/viz/registry.ts` (preload API only), `src/client/island-registry.ts`, `src/client/viz-prepare.ts`, `src/components/{Challenge,ChallengeIsland,FinalRun,FinalRunIsland,StepLink}.tsx`, `src/client/modules/step-link.ts`, `src/styles/components/{visualizer,ledger,challenge,final-run,step-link}.css` (ExplainBack's `.tsx`, module and CSS belong to WS-C under R-min′), and their unit tests |
| **WS-C** | Chrome, content components, pages, modules | `src/layouts/**`, every other `src/components/**/*.tsx` (incl. `diagrams/`), `src/pages/**`, `src/client/modules/*.ts` (except `step-link.ts`), every other `src/styles/{components,layouts,pages}/*.css`, `src/lib/{progress,progress-paint}.ts` (the `siteRoot` removal) |
| **WS-T** | Tests, audits, CI, docs | `tests/**`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `scripts/migration/**`, `docs/migrations/**` (except this plan and the decision record, which the orchestrator keeps current), `README.md`, `docs/deployment.md`, spec amendments in P5 |

**What each workstream may run by itself** (any time, without asking): `npm run typecheck`;
`npx eslint <its files>`; `npx prettier --check <its files>`; `npm run test` (node only, ~2 min);
`npm run validate:content`; `npm run render -- <url> /tmp/<ws>-page.html` then
`node scripts/migration/inventory.mjs --diff-page <url> --against .migration/baseline-dist --file /tmp/<ws>-page.html [--body|--prose]`;
a full build into its own directory (`LDSA_OUT=/tmp/<ws> npm run build`, §2.1); and
**targeted** Playwright files with one worker on its own port against that build:
`PW_PORT=44<nn> PW_DIST=/tmp/<ws>/dist npx playwright test tests/e2e/<file>.spec.ts --workers=1`
(WS-I uses 4410, WS-C 4420, WS-T 4430, WS-P 4440). A red targeted run under load is reported, not
"fixed" — the orchestrator re-runs it on a quiet machine.

**Orchestrator only:** the full `npm run test:e2e`; `scripts/migration/scope-audit.mjs` and
`style-parity.mjs`; the inventory `--compare` at a phase exit; baseline regeneration in the
pinned container; commits that cross ownership (e.g. phase-boundary ownership transfers).

---

## 5. Phases

Each phase ends with a local tag `migration/p<N>` on the exit commit (not pushed) so rollback is
one `git reset --hard migration/p<N-1>` on the branch.

### P0 — Freeze the baseline (orchestrator) — *mostly done by this planning run*

1. Commit this plan, the decision record, `scripts/migration/inventory.mjs` and
   `docs/migrations/react-migration-inventory.json` (`docs(migration): plan, decisions and baseline inventory`).
2. Preserve the legacy artifact: `mkdir -p .migration && cp -r <scratchpad>/baseline/dist .migration/baseline-dist`;
   add `.migration/` and `.build/` to `.gitignore`, `eslint.config.mjs` ignores and `.prettierignore`.
   Optional second reference: `git worktree add ../static_dsa-legacy 51a70cf && (cd ../static_dsa-legacy && npm ci && npm run build)`.
3. Re-run the legacy e2e suite on a quiet machine (no agents, no other workloads) and replace the
   §1 row with the clean result; triage anything still red with a control run.
4. Confirm or change the open decisions in §12.

**Exit:** `node scripts/migration/inventory.mjs --dist .migration/baseline-dist --compare docs/migrations/react-migration-inventory.json`
prints `parity: 0 drift(s)` and exits 0.

### P1 — Platform foundation (WS-P) ∥ audits and harness (WS-T)

**WS-P steps** (in order; commit after each numbered step that leaves the gates green):

1. **Dependencies and config.** Add the D-18 packages (exact versions), scripts from §2.1, keep
   `og`/`icons`/`fonts`/`audit:frames`/`validate:content`; **remove** `rehost`. New `tsconfig.json`
   (D-15; `include: ["src", "scripts", "tests", "*.ts"]`), `src/mdx.d.ts`. ESLint: add
   `eslint-plugin-react-hooks` recommended for `**/*.tsx`; keep the Astro plugin until the last
   `.astro` file is gone (P3); move the `BaseLayout.astro` override to
   `src/render/pre-paint.inline.js`. Prettier keeps its Astro plugin until P3.
2. **Delete Astro-only entry files:** `astro.config.mjs` (its `SITE_URL` logic →
   `src/render/site-url.ts`, its `rehypeLessonProse` → `src/mdx/rehype-lesson-prose.ts`, both
   verbatim with comments), `src/content.config.ts` (→ `src/content/schema.ts`),
   `src/pages/robots.txt.ts` and `src/pages/sitemap.xml.ts` (→ the prerenderer emits both,
   byte-identical — the inventory compares their SHA-256 under `distFiles`). Move `tests/e2e/fixtures/static-server.mjs` → `scripts/serve-dist.mjs` (drop the
   prefix argument, read `PW_PORT`/`PW_DIST`).
3. **MDX pipeline** `src/mdx/pipeline.ts` exporting `remarkPlugins`, `rehypePlugins`,
   `mdxOptions`; the four plugin files of §2.4 (vendored code carries an MIT attribution header
   naming `@astrojs/markdown-remark@7.2.1` / `@astrojs/internal-helpers@0.10.1`).
4. **Loader** `src/content/schema.ts`, `src/content/lessons.ts` (`getLessons()`, `LessonEntry`
   type `{ id, data, body, headings, Content }`, `checkCollection()`); update
   `src/lib/structured-data.ts` to take `LessonEntry` (drop `astro:content`).
5. **Renderer core** `src/render/{context.ts,Document.tsx,Island.tsx,site-url.ts,pre-paint.inline.js}`,
   `src/entry-server.tsx`, `src/routes.tsx`; `scripts/vite-plugin-ssg.ts` (dev middleware,
   `buildApp` prerender, page manifest, the `.astro`→`.tsx` resolver for `.mdx` importers);
   `scripts/verify-dist.mjs` (every internal `href`/`src` resolves to a file in `dist/`; each page
   has one `<h1>`, one `<main id="main">`, one canonical; no `data-astro`, `astro-island` or
   `/_astro/` string; `learndsa.invalid` absent when `WORKERS_CI`/`CF_PAGES`/`NETLIFY`/`VERCEL` is
   set); `scripts/render-route.mjs`.
6. **Pages as skeletons** for every route in §2.5 with the **real** `Document` head (title,
   description, canonical, OG/Twitter, JSON-LD, `noindex` on 404 and dev) and a stub body; lesson
   pages render a stub `LessonLayout` = `<h1>` + `<div class="lesson-body">{Content}</div>`.
7. **MDX layout primitives, real markup:** `Bench`, `Band`, `Callout`, `Collapsible`, and
   `PracticeCheck`'s SSR markup (behaviour comes in P2). **Instrument stubs** render only their root
   element so `proseHash` can place them: `<section class="viz"/>`, `<div class="codetabs"/>`,
   `<div class="challenge"/>`, `<div class="final-run"/>`, `<table class="complexity-table"/>`,
   `<a class="step-link"/>`, `<figure class="figure"/>`.
8. **`src/styles/site.css`** with every `@import` of §2.6 and every target file created empty;
   `global.css` and `tokens.css` unchanged.
9. **Unit tests** (WS-P writes these three; WS-T reviews): `tests/unit/mdx-pipeline.test.ts`
   (smartypants quotes/dashes/ellipsis; duplicate heading ids `-1`; heading text with inline code;
   GFM table wrapped in `div.table-scroll[tabindex=0]`; fence → `pre[class="md-code"][tabindex=0][data-language]`
   (exactly that class list — see §1) with `--shiki-light`/`--shiki-dark` spans and the Shiki
   `<pre>` style; a ` ```text ` fence keeps `data-language="text"`;
   `frontmatter` and `body` exports; an unknown fence language falls back to `plaintext`), `tests/unit/content-loader.test.ts` (each guard fails with
   file and field), `tests/unit/island-ssr.test.ts` (`Island` output = container + isolated render;
   JSON in `data-props` escaped; `Bench` strips `slot`).

**WS-T steps (parallel):**

0. As soon as WS-P step 4 lands: retype `tests/unit/structured-data.test.ts` with `LessonEntry`
   (the only unit test that imports `astro:content`; `npm run typecheck` covers `tests/`).
1. `playwright.config.ts`: `PW_PORT`/`PW_DIST`; web server `npm run build && npm run preview`
   locally, `npm run preview` on CI; **remove** the `portable` project and the `:4322` server
   (the spec file itself is deleted in P4).
2. `scripts/migration/scope-audit.mjs` (Playwright chromium; never ports 4321/4322): copy
   `.migration/baseline-dist` → `.migration/stripped-dist`, removing every `data-astro-cid-*`
   attribute from HTML and every `[data-astro-cid-…]` selector part from `<style>` blocks and
   `_astro/*.css`; serve both (ports 4501/4502); for the sample below, at 390×844 and 1280×800, light
   and dark (`colorScheme`), `javaScriptEnabled: false`, record `getComputedStyle` (all properties)
   of every element keyed by DOM path; report every difference as `page · viewport · theme · path ·
   classes · property · before → after`. Sample: the 9 non-lesson pages, all 15 DSA lessons, the 11
   diagram lessons, and 5 prose lessons with tables (`sd-comparison-table`, `k8s-services`,
   `sd-capacity-estimation`, `k8s-rbac`, `sd-api-design`).
3. **Orchestrator runs the audit** (quiet machine); WS-T writes `docs/migrations/css-scope-audit.md`:
   for each differing property, the scoped rule responsible, why it changes (leak vs specificity),
   and the exact rewritten selector. Expected seeds: `LessonLayout`'s
   `.lesson__grid > .lesson__article > :not(.lesson-body)`; any `.bench …`, `.callout …`,
   `.collapsible …`, `.practice-check …` rule that reaches slotted prose with a type selector.
4. `scripts/migration/style-parity.mjs` — the same engine comparing `.migration/baseline-dist`
   with a candidate `dist/` (used at P3 exit).
5. Draft (not yet enabled) replacements listed in §7 that do not depend on new code:
   `tests/e2e/utils/hydration.ts` (attach a `ldsa:hydration-error` listener with `addInitScript`
   and assert none fired), the renderer-failure test via `page.route(…abort)`.

**P1 exit (objective):**

| Check | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Types | `npm run typecheck` | 0 errors |
| Lint / format | `npm run lint`; `npm run format:check` | exit 0 |
| Unit | `npm run test` | the existing 65 files + the 3 new ones, all green |
| Content | `npm run validate:content -- --strict` | `127 published lesson(s) clean … 5 accepted note(s)` (unchanged) |
| Build | `npm run build` | exit 0; `find dist -name '*.html' \| wc -l` → `136`; build time recorded here |
| Parity | `node scripts/migration/inventory.mjs --compare docs/migrations/react-migration-inventory.json --allow docs/migrations/parity-exceptions/p1.json` | exit 0, where `p1.json` accepts **only** `mainHash`, `bodyHash`, `h1`, `headings`, `internalLinks`, `noscript`, `markers` (stub bodies) — and therefore **requires** equal route set, `title`, `canonicalPath`, `description`, `robots`, `jsonLdTypes`, `sitemapPaths`, `robotsTxt`, the lessons table, the storage-key set, the font/icon/OG bytes, and **`proseHash` for all 127 lessons** |
| Dev | `npm run dev` then `curl -s -o /dev/null -w '%{http_code}' localhost:5173/learn/binary-search/` / `…/learn/binary-search` | `200` / `404` |
| Audit | `docs/migrations/css-scope-audit.md` committed | every finding has a fix |

**e2e at P1:** none gating (pages are skeletons).

### P2 — Vertical slice: `/learn/binary-search/` end to end (WS-I ∥ WS-C)

The flagship lesson exercises every lesson-shell and lesson-body component except the diagrams, so
finishing it finishes the lesson template for all 127 lessons. Ownership of the P1 stubs and the
MDX primitives transfers from WS-P to WS-C / WS-I at P2 start (§4). **Delete each `.astro` file in
the same commit that lands its port.**

**WS-I:**

1. `src/viz/registry.ts`: add `preloadVizRegistry(): Promise<void>` and
   `loadedAlgorithm(id)` / `loadedRenderer(id)` (sync after preload; throw on unknown id with the
   legacy message). The lazy thunks are unchanged.
2. `src/viz/Visualizer.tsx` — server wrapper with the legacy props (`algorithm`, `renderer`,
   `input`, `allowCustomInput = true`, `showMetrics = true`, `showLedger = true`,
   `inputLabel = 'Array'`, `inputPlaceholder`, `targetLabel = 'Target'`, `targetPlaceholder`,
   `showTarget = true`). Port every build-time computation and build-time failure of the legacy
   frontmatter verbatim (unknown ids, rejected authored input, empty trace, predict-contract
   validation, `traceExtent`, `probeListCap`, `inputHelpText`, `collectLegend`, metric pills,
   ledger build) and render `<Island name="visualizer" as="section" …>` with the legacy root
   attributes (`class="viz"`, `id={uid}`, `aria-label`, `data-viz=""`, `data-algorithm`,
   `data-renderer`, `data-input`, `data-extent`, `data-label`, `data-show-metrics`,
   `data-target-label`, conditional `data-slug`/`data-predict-items`). `uid` comes from
   `claimInstrumentId(ctx.instrumentScope, ctx.pathname, algorithm, renderer)`; `lessonSlug` from
   `ctx.pathname`.
3. `src/viz/VisualizerIsland.tsx` — renders the section's children exactly as the legacy markup
   (figure + canvas + explanation; controls; predict note; keys hint; custom-input disclosure;
   key/legend/metrics; `<Ledger>`; no-JS note). The `<noscript>` kill-switch that follows the
   section is emitted by `Visualizer.tsx`, outside the island. Props: the serialized `VisualizerProps` above plus
   `algo`, `rmod`, `container`. The canvas is `<div class="viz-canvas" data-viz-canvas=""
   tabIndex={-1} dangerouslySetInnerHTML={{ __html: still }} ref={canvasRef}>` where `still` is
   computed once (`useState` initializer) — React never touches the canvas again; the renderer
   owns it (`mount`/`setExtent`/`render`/`destroy` from an effect). The legacy counter span gets
   `suppressHydrationWarning` (the bootstrap writes `…` into it before activation).
4. Player integration: `src/viz/core/player-store.ts` wraps the unchanged `Player`
   (`onStep`/`onPlayStateChange`) in `subscribe/getSnapshot` for `useSyncExternalStore`; the
   Player stays the single owner of index, playing state and the `setTimeout` loop (spec §11;
   the calm-invariant test forbids `setInterval`). Predict mode, session counting and the pass
   rule move into the pure reducer `src/viz/core/session.ts` (+ `tests/unit/viz-session.test.ts`
   covering: skip counting, answer → advance one step, `min(5, authoredItems)` pass floor,
   `recordPass` called once, predict never persisted, ledger hidden while on).
5. Port the legacy client behaviours **by feature, in this order**, each against its legacy line
   range in `Visualizer.astro` (keep a checklist in the PR description): pre-activation states and
   the failed state (→ `src/client/viz-prepare.ts`, `prepare`/`fail` hooks of the registry entry);
   mount + first draw with the frozen extent; transport (reset/back/play/forward) with
   `aria-disabled` bound state and focus retention; slider + `aria-valuetext` + counter; speed
   (`pref:viz-speed`, `viz:speed` sync); keyboard (Space, ←/→, the canvas/ledger exceptions);
   explanation live region incl. the >1× autoplay mute and the final-step announcement; metrics;
   custom input (`composeCustomInput`, `errorField`, `showError` focus move, Restore example,
   re-trace via `setExtent` before redraw, `viz:run` dispatch); RSP-2 overflow measurement
   (`ResizeObserver`, `tabindex`/`role`/name only while overflowing); ledger current row, row seek,
   200-row cap message; predict mode (`?review=1`, toggle, note, strip, hide ledger, disable
   scrubber/autoplay, skip, answer, session line); teardown on unmount.
6. `src/viz/Ledger.tsx` (SSR + client, inside the island). `src/components/StepLink.tsx` (SSR,
   `instrumentIdFor(ctx.pathname, …)`, default text when no children) + `src/client/modules/step-link.ts`.
7. Challenge, FinalRun, ExplainBack: SSR wrapper (legacy markup, build-time witness/answer
   computation and failures verbatim) + island component. Islands render without context, so every
   id inside an island subtree (`ch-title-N`, `fr-input-N`, `explain-N…`) is minted by the wrapper
   with `ctx.uid()` and passed in as a prop; ExplainBack's
   wrapper renders the legacy `<template data-explain-template="" data-slug>`; its registry entry's
   `prepare` inserts `div.explain-back[data-explain-back]` after the template when the lesson is
   complete (now or on the `[data-mark-complete]` click / `PROGRESS_CHANGED_EVENT`) and `createRoot`s it.
8. `src/client/island-registry.ts` rows for the four islands (trigger, `prepare`, `load`, `fail`).
   `challenge`'s `prepare` buffers `VIZ_RUN_EVENT` details from page load and the island consumes
   the buffer on activation — `m8-trials-final-run.spec.ts` must pass with a run submitted before
   the card has scrolled into view.
9. CSS: `visualizer.css`, `ledger.css` (verbatim — they were `is:global`), `challenge.css`,
   `final-run.css`, `explain-back.css`, `step-link.css` (+ audit fixes).

**WS-C:**

1. `src/layouts/BaseLayout.tsx` (skip link, `SiteHeader`, `<main id="main" tabIndex={-1}
   class="mx-auto w-full px-4 md:px-6 max-w-…">`, `SiteFooter`; meta via `usePageMeta`),
   `SiteHeader.tsx` (wordmark **without** `data-site-root`, D-01), `SiteFooter.tsx`,
   `ThemeToggle.tsx` + `src/client/modules/theme-toggle.ts`. The head `<noscript>` theme-toggle
   kill-switch stays in `Document` (WS-P), byte-identical to the legacy one.
2. `src/layouts/LessonLayout.tsx` and its parts: `Breadcrumb`, `DifficultyChip`, `MasteryPips`,
   `TableOfContents` (+ `toc.ts` module: scroll-spy and inline-ToC close), `WhatsNext`,
   `PrevNext`, `MarkComplete` (+ `mark-complete.ts`), `lesson-stage.ts` and `learning-days.ts`
   modules (the two other `LessonLayout` scripts), prerequisites row, reading time, JSON-LD.
   `src/pages/LessonPage.tsx` carries `[slug].astro`'s prev/next, prerequisites and `lessonRefs`
   logic verbatim.
3. Lesson-body components: `PracticeCheck` behaviour → `practice-check.ts`; `ComplexityTable.tsx`;
   `CodeTabs.tsx` (SSR via `highlightToHtml`, same `<pre>` as Astro's `<Code>`) + `codetabs.ts`.
4. Modules: copy each legacy `<script>` body into its module file **verbatim first** (one commit),
   then make only these edits: delete `astro:page-load`/`astro:before-swap` listeners (they never
   fired); replace `siteRoot()` + `lessonHref(slug, root)`/`reviewHref(slug, root)` with the
   root-absolute `lessonHref(slug)`/`reviewHref(slug)` in `src/lib/progress.ts` (signature change,
   `progress.test.ts` updated by WS-T in the same PR); nothing else.
5. CSS: fill `layouts/lesson.css` and each component file from its scoped block + the audit fixes.

**P2 exit:**

| Check | Command | Expected |
|---|---|---|
| Gates | typecheck, lint, format:check, test, validate:content --strict, build | all exit 0 |
| Slice parity | `node scripts/migration/inventory.mjs --diff-page /learn/binary-search/ --against .migration/baseline-dist` | `identical` |
| Lesson parity | `inventory --compare … --allow docs/migrations/parity-exceptions/p2.json` | 0 drift on all 116 non-diagram lessons (`mainHash`, `bodyHash`, `proseHash`, `headings`, `internalLinks`, `noscript`, `markers` all equal); `p2.json` may except only `mainHash`/`bodyHash`/`markers` on the 11 diagram lessons (Figure lands in P3) and the body fields of the 9 non-lesson routes |
| JS budget | `npx playwright test tests/e2e/js-budget.spec.ts` (orchestrator) with the FULL metric (§7) | binary-search FULL ≤ 120 KB — **record EAGER and FULL for binary-search, sorting-basics, dynamic-programming, k8s-services here** |
| Hydration | `tests/e2e/hydration.spec.ts` on all 15 DSA lessons | no `ldsa:hydration-error`; every island activates |
| e2e (orchestrator, quiet) | `npx playwright test binary-search binary-search-gaps m7-player-v2 m7-codetabs m7-repair viz-focus-retention m8-predict m8-practice-check m8-trials-final-run m8-explain-note plan-a-frames plan-c-ledger m6-dynamic-programming m4-lessons smoke` | green, except tests that navigate to a non-lesson route (record their titles; they move to P3) |
| ARIA | `npx playwright test baseline-aria -g "binary"` | the `lesson-binary-search` snapshot passes **unchanged** |

**If the Visualizer island is not at parity by the P2 budget:** land the React server markup with
the legacy client script moved verbatim to `src/client/modules/visualizer-legacy.ts` (it operates on
identical markup), keep going with P3, and escalate — the React-owned playback requirement is then
reported as open, never as done.

### P3 — Remaining pages and components (WS-C) ∥ test migration (WS-T)

**WS-C:** `src/pages/{Home,LearnIndex,CoursePage,Glossary,About,NotFound,DevRenderers}.tsx` and the
components they use: `CourseIndex`, `CourseCard`, `LessonCard`, `TrackArc`, `ReviewStrip` (SSR is
the `<noscript>` only; `review-strip.ts` builds ≤ 2 cards with `reviewHref(slug)`), the home,
catalogue and course painters (`home-resume.ts`, `learn-index.ts`, `course-index.ts`, all on
`src/lib/progress-paint.ts`), `glossary-filter.ts`, `Figure.tsx` + the 11 diagrams in
`src/components/diagrams/`. `NotFound` keeps its build-time `renderStatic` demo and assertions
(via `loadedAlgorithm`/`loadedRenderer`). `DevRenderers` renders the gallery only in dev
(`import.meta.env.DEV`) and the stub in production. Delete the last `.astro` files; then remove
`eslint-plugin-astro` and `prettier-plugin-astro` (WS-P does the config/lockfile edit in the same
PR at the orchestrator's request — ownership exception noted in the commit).

**WS-T:** every test change in §7 marked P3; enable `hydration.spec.ts` and
`static-hosting.spec.ts`; `js-budget.spec.ts` FULL metric; e2e `utils/mastery.ts` dev-stack
regex generalised (`/@vite\/|\/node_modules\/\.vite\/|vite\/dist\//`).

**P3 exit (the parity milestone):**

| Check | Command | Expected |
|---|---|---|
| Gates | all six DoD commands (e2e by the orchestrator, quiet machine) | green except `portable.spec.ts` (deleted in P4) and `baseline-visual.spec.ts` (P4) |
| Full parity | `node scripts/migration/inventory.mjs --compare docs/migrations/react-migration-inventory.json --allow docs/migrations/parity-exceptions/final.json` | exit 0 with **no per-route exception**; `final.json` holds only global entries with reasons (none are expected before P4; P4 adds `file:_headers`, P5 adds `lesson.bodySha`) |
| Style parity | `node scripts/migration/style-parity.mjs` (orchestrator) | 0 differences, or each one listed in `css-scope-audit.md` with an accepted reason |
| No Astro sources | `find src -name '*.astro' \| wc -l` | `0` |
| Budget | `js-budget.spec.ts` | every page FULL ≤ 120 KB and EAGER ≤ 120 KB; report table pasted into §1 |
| A11y | `a11y.spec.ts`, `courses.spec.ts` axe blocks, `baseline-aria.spec.ts` | green; ARIA snapshots **unchanged** |

### P4 — Retire portability, deployment and CI (WS-P ∥ WS-T)

**WS-P:** delete `scripts/portablize.mjs`, `scripts/rehost.mjs`; `public/_headers`
`/_astro/*` → `/assets/*` (and its comment); confirm `wrangler.jsonc` needs no change (its comment
mentioning `portablize.mjs` updated); `src/render/site-url.ts` rejects a `SITE_URL` with a path;
reword the comments that still cite the pass in `src/lib/courses.ts` (WS-C file — ownership
exception noted in the commit). WS-T rewords the comments in `tests/e2e/utils/urls.ts`.

**WS-T:** delete `tests/unit/portablize.test.ts`, `tests/unit/rehost.test.ts`,
`tests/e2e/portable.spec.ts`; add `tests/unit/site-url.test.ts` (sentinel default; each of the four
`PUBLISHING_BUILDERS` throws without `SITE_URL` — the pin `rehost.test.ts` held; a `SITE_URL`
with a path throws); `url-shape.spec.ts` relative-pass test inverted (§7); CI (`ci.yml`): steps
unchanged in order — `npm ci`, `npm run build`, lint, format:check, test,
`validate:content -- --strict`, `test:e2e` with `VISUAL_BASELINE=1` — with comments updated
(no `astro check`, no portablize); the seeding job unchanged except its comment.

**Orchestrator:** in `mcr.microsoft.com/playwright:v1.61.1-noble`, run
`CI=1 VISUAL_BASELINE=1 npx playwright test tests/e2e/baseline-visual.spec.ts` against the
**existing** PNGs first. If green, keep them (strongest proof). If not, inspect every diff, record
the cause in `docs/migrations/visual-baseline-review.md`, then re-seed with
`--update-snapshots=all` (the command in `ci.yml`'s comment) and commit the PNGs with that review.

**P4 exit:** all six DoD gates green in the pinned container (the CI job, run locally with the
`docker run` line in `ci.yml`); `git grep -n "portablize\|rehost\|data-site-root\|siteRoot" -- src scripts tests playwright.config.ts .github` → no hits.

### P5 — Cutover cleanup (WS-P ∥ WS-T docs)

1. `node scripts/migration/codemod-mdx-imports.mjs` (WS-P writes it; deterministic, idempotent,
   prints `file:line old → new`): rewrites only `^import X from '…/X.astro';` →
   `'…/X'`. Verify: `git diff -U0 -- src/content/lessons | grep '^[-+][^-+]' | grep -v '^[-+]import '`
   is empty; `git diff --stat -- src/content/lessons | tail -1` → `127 files changed, 356 insertions(+), 356 deletions(-)`;
   a second run changes nothing. Same commit: delete the resolver; update
   `scripts/lib/content-validator.mjs` rule 7 to `…diagrams/([\w-]+)';` reading `.tsx`, plus a
   validator fixture.
2. Remove `astro`, `@astrojs/mdx`, `@astrojs/check`; delete `.astro/` (generated), the remaining
   Astro config remnants; `npm ls astro` → empty.
3. D-12 rename `astro-code` → Shiki classes (transform, `global.css`, CodeTabs and print CSS, the
   five e2e lines); style-parity re-run → 0 differences.
4. WS-T: README (architecture, install, dev, add/validate a lesson, routes, React islands,
   persistence, fonts, tests, build, deploy at one origin), `CLAUDE.md` (rewrite section: framework
   chosen, phases done; legacy sections reworded where stack-specific), `docs/deployment.md`
   (portability sections retired, Workers contract kept), spec amendments: §1 ("deployable to any
   static host" → one origin), §4, §8, §9, §11.3, §14, §16, §18 (C-3), with an amendment entry in
   `docs/redesign-2026-08/03-amendments.md` style naming each moved test.

**P5 exit:** `git grep -n -i "astro" -- package.json src scripts tests playwright.config.ts vitest.config.ts eslint.config.mjs .prettierrc.json`
→ only intentional historical mentions in comments (reviewed list); all six gates green; inventory
`--compare` still exit 0 with `final.json` (which now also accepts `lesson.bodySha` for the codemod;
the class rename is normalized, §11).

### P6 — Final verification and report (orchestrator)

1. Six gates in the pinned container (sequentially, quiet machine).
2. `node scripts/migration/inventory.mjs --compare docs/migrations/react-migration-inventory.json --allow docs/migrations/parity-exceptions/final.json`
   → 0 drift; write the new inventory to `docs/migrations/react-migration-inventory.final.json`.
3. Privacy audit: inventory `storageKeys` = the 8 §6 keys, none `NOT-IN-SPEC-§6`;
   `browserApis.sessionStorage/indexedDB/cookie/network` absent; manual read of every
   `storageCallSites` entry and of React/react-dom for runtime network calls (none expected).
4. Artifact audit: `find dist -name '*.map'` empty; no `.vite/` in `dist`; every HTML has the
   site stylesheet and only the scripts its components need; JS/CSS before/after table from
   `js-budget` output and inventory `bundles`.
5. Update this plan's §1 and the decision record with measured actuals; final report per master
   prompt §9.

---

## 6. File plan

### Add

| Path | Phase / owner | Purpose |
|---|---|---|
| `vite.config.ts` | P1 / P | plugins: ssg, mdx (`enforce: 'pre'`), react, tailwind; `build.outDir: 'dist'`, `assetsDir: 'assets'`, manifest; environments client/ssr |
| `scripts/vite-plugin-ssg.ts` | P1 / P | dev SSR middleware, `buildApp` prerender, page manifest, temporary `.astro` resolver |
| `scripts/serve-dist.mjs` | P1 / P | preview server (moved fixture) |
| `scripts/verify-dist.mjs` | P1 / P | post-build structure and link checks |
| `scripts/render-route.mjs` | P1 / P | single-route render |
| `src/entry-server.tsx`, `src/routes.tsx` | P1 / P | SSR entry, route table |
| `src/render/{context.ts,Document.tsx,Island.tsx,site-url.ts,pre-paint.inline.js}` | P1 / P | render core |
| `src/mdx/{pipeline,remark-lesson-body,rehype-shiki-astro,rehype-lesson-prose,rehype-heading-ids}.ts`, `src/mdx.d.ts` | P1 / P | MDX chain |
| `src/content/{schema,lessons}.ts`, `src/lib/highlight.ts` | P1 / P | loader, schema, Shiki singleton |
| `src/client/islands.ts` | P1 / P | island bootstrap |
| `src/client/island-registry.ts`, `src/client/viz-prepare.ts` | P2 / I | island table, viz pre-activation |
| `src/client/modules/*.ts` | P2–P3 / C (+ `step-link.ts` / I) | `theme-toggle`, `toc`, `lesson-stage`, `learning-days`, `practice-check`, `mark-complete`, `codetabs`, `step-link`, `review-strip`, `home-resume`, `learn-index`, `course-index`, `glossary-filter` |
| `src/styles/site.css`, `src/styles/{layouts,components,pages}/*.css` | P1 / P (empty) → owners | converted CSS |
| `src/layouts/*.tsx`, `src/pages/*.tsx`, `src/components/**/*.tsx` | P1 stubs → P2/P3 owners | ports (one `.tsx` per `.astro`, same base name; islands add `*Island.tsx`) |
| `src/viz/{Visualizer,VisualizerIsland,Ledger}.tsx`, `src/viz/core/{player-store,session}.ts` | P2 / I | instrument |
| `tests/unit/{mdx-pipeline,content-loader,island-ssr,site-url,viz-session}.test.ts` | P1–P4 | new unit tests |
| `tests/e2e/{hydration,static-hosting}.spec.ts`, `tests/e2e/utils/hydration.ts` | P1–P3 / T | new e2e |
| `scripts/migration/{scope-audit,style-parity,codemod-mdx-imports}.mjs` | P1 / T, P5 / P | migration tools |
| `docs/migrations/{css-scope-audit.md,parity-exceptions/p1.json,p2.json,final.json,visual-baseline-review.md}` | as listed | evidence |

### Modify

| Path | Phase | Change |
|---|---|---|
| `package.json`, `package-lock.json` | P1, P3, P5 | deps (D-18), scripts (§2.1) |
| `tsconfig.json` | P1 | D-15 |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore` | P1, P3 | plugins, ignores (`.build/`, `.migration/`, `pre-paint.inline.js`) |
| `playwright.config.ts` | P1 | `PW_PORT`/`PW_DIST`; drop `portable` project and second server |
| `src/lib/progress.ts`, `src/lib/progress-paint.ts` | P2 | remove `siteRoot`; `lessonHref(slug)`/`reviewHref(slug)` root-absolute |
| `src/lib/structured-data.ts` | P1 | `LessonEntry` instead of `CollectionEntry` |
| `src/viz/registry.ts` | P2 | add preload/sync accessors |
| `src/viz/core/instrument-id.ts` | P2 | comments only (scope is the render context) |
| `public/_headers` | P4 | `/_astro/*` → `/assets/*` |
| `wrangler.jsonc` | P4 | comment only |
| `scripts/lib/content-validator.mjs` | P5 | rule 7 import regex |
| `.github/workflows/ci.yml` | P4 | comments/commands (§5 P4) |
| `src/styles/global.css` | P5 | `.astro-code` → Shiki class (D-12) |
| `README.md`, `CLAUDE.md`, `docs/site-spec.md`, `docs/deployment.md` | P5 | C-3 amendments |
| tests listed in §7 | P2–P5 | as listed |

### Delete

| Path | Phase |
|---|---|
| `astro.config.mjs`, `src/content.config.ts`, `src/pages/robots.txt.ts`, `src/pages/sitemap.xml.ts`, `tests/e2e/fixtures/static-server.mjs` (moved) | P1 |
| `src/components/uid.ts` (replaced by `ctx.uid()`) | P2 |
| all 52 `.astro` files: `src/layouts/{BaseLayout,LessonLayout}.astro`; `src/pages/{index,about,glossary,404}.astro`, `src/pages/learn/{index,[slug],dsa,kubernetes,system-design}.astro`, `src/pages/dev/renderers.astro`; `src/components/{Band,Bench,Breadcrumb,Callout,Challenge,CodeTabs,Collapsible,ComplexityTable,CourseCard,CourseIndex,DifficultyChip,ExplainBack,Figure,FinalRun,LessonCard,MarkComplete,MasteryPips,PracticeCheck,PrevNext,ReviewStrip,SiteFooter,SiteHeader,StepLink,TableOfContents,ThemeToggle,TrackArc,WhatsNext}.astro`; `src/components/diagrams/*.astro` (11); `src/viz/{Visualizer,Ledger}.astro` | P2–P3, each with its port |
| `scripts/portablize.mjs`, `scripts/rehost.mjs`, `tests/unit/portablize.test.ts`, `tests/unit/rehost.test.ts`, `tests/e2e/portable.spec.ts` | P4 |
| the `.astro`→`.tsx` resolver; `astro`, `@astrojs/mdx`, `@astrojs/check`, `eslint-plugin-astro`, `prettier-plugin-astro`; `.astro/` | P3 (plugins) / P5 |
| `scripts/migration/*` and `docs/migrations/parity-exceptions/*` | **kept** until the branch merges, then optional |

---

## 7. Test migration — every assertion that moves

Every other test ports **unchanged** (the DOM contract is kept). "Stronger" means the replacement
asserts at least what the original did plus something it did not.

| Test | Original assertion | Phase | Replacement |
|---|---|---|---|
| `tests/unit/portablize.test.ts` | the relative-URL pass, chunk-literal detection, site-root anchor | P4 | deleted with the pass (D-01); the guarantee it backed — no URL leaves the deployment — becomes `url-shape.spec.ts`'s root-absolute + resolves check and `verify-dist.mjs` failing the build |
| `tests/unit/rehost.test.ts` | stamping `dist/`; the four `PUBLISHING_BUILDERS` pinned | P4 | `tests/unit/site-url.test.ts`: the same four builders pinned (each throws without `SITE_URL`), sentinel default, **plus** sub-path `SITE_URL` rejected (stronger) |
| `tests/e2e/portable.spec.ts` | the artifact works under `/deployments/learndsa/` | P4 | retired (D-01, C-1); root-deployment behaviour it also covered (deep link, refresh, assets from depth 2, 404 body, back/forward) moves to `tests/e2e/static-hosting.spec.ts` |
| `tests/e2e/url-shape.spec.ts` "the relative pass ran, and the 404 kept its root-absolute links" | every built page's internal URLs are document-relative except `404.html` | P4 | inverted: every internal `href`/`src` in every built page, 404 included, is root-absolute (no `./`, `../`) **and** resolves to a file `dist/` serves (stronger: resolution checked for assets too) |
| `tests/e2e/js-budget.spec.ts` | EAGER ≤ 60 KB; `/_astro/` cross-check | P2–P3 | EAGER ≤ 120 KB **and** FULL ≤ 120 KB from `.build/page-manifest.json` (D-06); cross-check on `/assets/` loads the page, scrolls through, activates every island and asserts every fetched chunk is in the manifest's sets and every EAGER chunk was fetched |
| `tests/e2e/m7-player-v2.spec.ts` "a renderer that cannot load says so…" | forces re-init via `astro:page-load` with a bogus renderer id | P2 | `page.route('**/assets/ArrayRenderer-*.js', r => r.abort())` before `goto`; same four assertions (`data-viz-failed`, no `aria-busy`, `.viz-unavailable` text, controls hidden) — a real load failure instead of a simulated swap |
| `tests/unit/progress.test.ts` `reviewHref and lessonHref` | joins onto a root (two sub-path cases) | P2 | `reviewHref('binary-search')` → `/learn/binary-search/?review=1#practice`; `lessonHref('arrays')` → `/learn/arrays/`; slash precedes `?`/`#` (url-shape rule); sub-path cases retired (D-01) |
| `tests/unit/structured-data.test.ts` | builds JSON-LD from a `CollectionEntry` fixture | P1 | same fixture typed as `LessonEntry` |
| `tests/unit/tokens-contrast.test.ts` | scans `.css` + `<style>` in `.astro`; reads `DifficultyChip.astro` | P3 | scans `src/**/*.css` (all former blocks now live there) and asserts the scan found ≥ the legacy block count; chip rules from `src/styles/components/difficulty-chip.css` |
| `tests/unit/palette-states.test.ts` | reads `glossary.astro`'s `<style>` | P3 | reads `src/styles/pages/glossary.css` |
| `tests/unit/font-charset.test.ts` + `scripts/build-fonts.mjs` | `SCANNED` includes `.astro` | P5 | drop `.astro` from both lists in one commit (no behaviour change) |
| `tests/e2e/utils/mastery.ts` (`trackIntervals`) | ignores `astro dev` runtime frames | P3 | ignores Vite dev frames only; the "no repeating timer at all" assertion unchanged |
| `m4-lessons`, `m6-dynamic-programming`, `plan-c-ledger`, `m7-print-hcm` (`.astro-code`) | code blocks present / print styling | P5 | selector renamed with D-12; assertion unchanged |
| `tests/e2e/baseline-visual.spec.ts` | 14 PNGs | P4 | compared first; re-seeded only after a reviewed diff (§5 P4) |
| `tests/e2e/baseline-aria.spec.ts` | 5 ARIA snapshots | — | **unchanged and must pass**; an intended delta needs an entry here before re-seeding |
| `tests/unit/content-validator.test.ts` | validator rules | P5 | + fixture for the new diagram import specifier |
| *new* `tests/e2e/hydration.spec.ts` | — | P2–P3 | every page in a sample (all DSA lessons, `/`, `/about/`, 3 prose lessons after marking complete): no `ldsa:hydration-error`, each `[data-island]` reaches its ready state |
| *new* `tests/e2e/static-hosting.spec.ts` | — | P3 | deep link + reload; back/forward across three lessons; unknown URL serves `404.html` content with status 404; slashless page URL is 404; every CSS/JS/font/icon request from `/learn/binary-search/` is 200 |
| *new* unit: `mdx-pipeline`, `content-loader`, `island-ssr`, `site-url`, `viz-session` | — | P1–P4 | see §5 |

---

## 8. CI and deployment changes

- `ci.yml`: same job, same container `mcr.microsoft.com/playwright:v1.61.1-noble`, same step order
  (`npm ci`, `npm run build`, lint, format:check, test, `validate:content -- --strict`, `test:e2e`
  with `VISUAL_BASELINE=1`, failure artifact upload). Only comments and the meaning of `npm run
  build` change. Keep the `seed-visual-baselines` job.
- Cloudflare Workers Builds: build command `npm run build`, output `dist/` (unchanged);
  `SITE_URL` must be set to an origin (the build now also rejects a path). `wrangler.jsonc`
  unchanged; `_headers` renamed rule. No adapter, no Worker script.
- Nothing is deployed by this migration. A deploy happens only when the user merges.

## 9. Risks and mitigations (ranked)

| # | Risk | Likelihood / impact | Mitigation | Detected by |
|---|---|---|---|---|
| R1 | **Visualizer behaviour drift** in the React port (focus retention, `aria-disabled`, live-region muting, predict gating, ledger seek, speed sync, RSP-2 overflow, keyboard) — 1,650 tuned lines | high / high | Player and renderers untouched; pure `session.ts` reducer with unit tests; feature-ordered port against legacy line ranges; ten viz specs as oracle; hydration-error event; documented fallback (legacy script as module) | P2 e2e list |
| R2 | **Scoped-CSS conversion** silently changes the cascade (widened matching, lost specificity) | high / medium | scope audit on the legacy artifact **before** any port, fix list per selector; style-parity diff after; pixel baselines compared before re-seeding | `scope-audit.mjs`, `style-parity.mjs`, `baseline-visual` |
| R3 | **JS budget** — React's measured 66–68 KB gz floor + island code lands near 105 KB on DSA lessons | medium / high | islands only for instruments (D-05); React loaded per activation (D-06); FULL measured at P2 exit before scaling; budget table kept in §1 | `js-budget.spec.ts` FULL |
| R4 | **Markdown/MDX output drift** (smartypants, slugger, Shiki tokens, GFM, attribute serialization) | medium / high | same packages pinned; Astro's code vendored; `proseHash` for all 127 lessons at P1 exit; `--diff-page --prose` to locate | inventory `--compare` |
| R5 | **Hydration mismatch** (render-time browser access, ids, `data-x="true"`, text separators) | medium / medium | isolated island render from serialized props; Node prerender throws on globals; D-11 rules; `onRecoverableError` event checked in e2e | `hydration.spec.ts` |
| R6 | **e2e noise under load** hides or fakes regressions | high / medium | orchestrator-only full runs on a quiet machine; targeted single-worker runs for implementers; `git archive` control run before attributing a failure | process |
| R7 | **Event-order coupling** between modules and islands (document click delegates that repaint after a component's own handler wrote storage) | low / medium | React listens at the island container (below `document`), preserving bubble order; `m8-*` specs cover the repaint paths | `m8-milestone`, `m8-mastery-ladder` |
| R8 | **Build time / memory** on the 4-core, 7 GB machine (SSR bundle with 127 MDX + Shiki) | medium / low | one Shiki highlighter; sequential prerender; measure at P1 and record; `NODE_OPTIONS=--max-old-space-size=3072` only if measured necessary | P1 exit timing |
| R9 | **Font coverage** — new source text introduces a glyph outside the subsets | low / low | `font-charset.test.ts` in every `npm run test`; replace the glyph, never re-run `npm run fonts` | unit |
| R10 | **Deploy semantics** — Workers `html_handling`/`not_found_handling` behave differently on the new layout | low / high | layout kept identical (directory pages, root `404.html`); `static-hosting.spec.ts`; optional `npx wrangler@4 deploy --dry-run` by the orchestrator (no publish) | P4 |

## 10. Rollback

- **Per phase:** every phase exit is tagged `migration/p<N>`; a failed phase is reverted with
  `git reset --hard migration/p<N-1>` on `feat/react-migration` (local, unpushed) or `git revert`
  of its commits. `main` is untouched throughout, so production keeps serving the legacy build.
- **Per component:** each port is one commit that adds the `.tsx` and deletes the `.astro`; reverting
  that commit restores the legacy file (the resolver keeps MDX imports working either way until P5).
- **Visualizer island:** fallback to the legacy client script as a module over the React server
  markup (P2), reported as open.
- **After a merge (user's decision, outside this plan):** revert the merge commit; Workers Builds
  rebuilds the legacy site from the restored `package.json`/lockfile. The legacy artifact also
  exists at `.migration/baseline-dist` and is reproducible from `51a70cf`.

## 11. Verification command reference

```bash
npm ci
npm run typecheck                         # tsc --noEmit (strict)
npm run lint && npm run format:check
npm run test                              # vitest, node environment
npm run validate:content -- --strict
npm run build                             # tsc + vite build + prerender + verify-dist
npm run preview                           # serve dist/ on :4321 (PW_PORT/PW_DIST override)
npm run test:e2e                          # orchestrator only, quiet machine
node scripts/migration/inventory.mjs --compare docs/migrations/react-migration-inventory.json \
  --allow docs/migrations/parity-exceptions/final.json
node scripts/migration/inventory.mjs --diff-page /learn/arrays/ --against .migration/baseline-dist [--body|--prose]
node scripts/migration/inventory.mjs --diff-page all --against .migration/baseline-dist --prose
npm run render -- /learn/arrays/ /tmp/arrays.html && \
  node scripts/migration/inventory.mjs --diff-page /learn/arrays/ --against .migration/baseline-dist --file /tmp/arrays.html
node scripts/migration/scope-audit.mjs    # P1, orchestrator
node scripts/migration/style-parity.mjs   # P3+, orchestrator
docker run --rm -v "$PWD":/work -w /work --user "$(id -u):$(id -g)" \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c 'npm run build && CI=1 VISUAL_BASELINE=1 npx playwright test'   # P4/P6 container gate
```

### Parity exception files

`--allow <file>` takes JSON of this shape; every value is the **reason**, and a difference without
a reason fails the comparison:

```json
{
  "routes": {
    "*": { "mainHash": "P1: stub bodies" },
    "/learn/k8s-what-kubernetes-is/": { "bodyHash": "P2: Figure is ported in P3" }
  },
  "global": {
    "file:_headers": "D-13: /_astro/* rule renamed to /assets/*",
    "lesson.bodySha": "P5: codemod rewrote 356 import lines",
    "route:/new/": "…", "sitemapPaths": "…", "robotsTxt": "…", "storageKeys": "…", "api:network": "…"
  }
}
```

Route fields: `kind title canonicalPath description robots h1 headings internalLinks externalLinks
noscript markers jsonLdTypes mainHash bodyHash proseHash`, plus `missing`. The inventory normalizes
`astro-code`/`astro-code-themes` to Shiki's `shiki`/`shiki-themes`, so the D-12 rename needs no
exception; the codemod changes each lesson's `bodySha` (the raw-source hash), which `final.json`
accepts with that reason after P5.

## 12. Decisions taken by the orchestrator (2026-10-20, before P1)

1. **D-05 island rule: R-min′.** Islands: `visualizer`, `challenge`, `final-run`. ExplainBack is a
   module owned by WS-C (`src/components/ExplainBack.tsx` + `src/client/modules/explain-back.ts`);
   step 7 of WS-I in P2 applies to Challenge and FinalRun only. React therefore loads only on pages
   that host an instrument (15 DSA lessons, `/`, `/about/`).
2. **D-06 budget:** gate FULL **and** EAGER at 120 KB gz on every page, as recommended.
3. **P2 fallback:** the Visualizer island gets the full P2 implementation pass plus one dedicated
   fix round against the P2 e2e list. The legacy-script fallback is taken only if that round still
   cannot make the oracle specs green, and it is then reported as an open requirement.
4. **Visual baselines:** compare the existing PNGs first; re-seed only after a reviewed diff.
5. `scripts/migration/` and `docs/migrations/parity-exceptions/` stay until the branch merges.
6. **Pre-existing fence dark-theme defect (§1):** reproduced for parity, reported as a follow-up,
   not fixed inside the migration.
