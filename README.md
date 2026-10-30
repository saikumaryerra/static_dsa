# LearnDSA

A static, no-backend site that teaches data structures and algorithms to beginners. Every lesson
pairs plain-language prose and three-language code with an **interactive visualization** you can
play, pause, step through one operation at a time, drive with your own input, and read as a table —
the whole run written out under the drawing, one row per step, which the prose can link straight
into. On a wide screen that instrument stays **pinned beside the prose** as you read, so a sentence
and the thing it describes are never on different screens.

Around it runs a quiet mastery loop — self-graded practice, three progress pips, spaced review,
input-crafting trials, your own one-sentence "why does this work?" note, and a count of days you
learned something — that never leaves your device.

Built with React + TypeScript on Vite, prerendered at build time to plain HTML/CSS; only the
instruments hydrate. No server, no database, no accounts, no analytics, no tracking. **All planned milestones (M1–M8) have shipped**,
and the catalogue now holds three courses: Data Structures & Algorithms (15 lessons, built around
the visualizations), Kubernetes (67 lessons, 14 modules) and System Design (45 lessons, 9 modules) —
the latter two prose and diagrams rather than instruments. See `docs/courses/SPEC.md` for that expansion.

## Quick start

Requires **Node ≥ 22.12** (`.nvmrc` pins 24, which is what CI uses) and npm.

```bash
npm ci          # lockfile-exact install
npm run dev     # http://localhost:5173 — Vite, every route rendered on request
```

`npm run dev` is enough for prose, layout and visualization work: it renders each page through the
same server entry the build prerenders with, so a slashless URL 404s there exactly as it does in
production. Nothing needs an API key, a database or network access at runtime.

## Commands

| Command                                 | What it does                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                           | Vite dev server on :5173, rendering every route through `src/entry-server.tsx` on request                                                                                                                                               |
| `npm run build`                         | `tsc --noEmit` (type gate), `vite build` (client assets, the SSR bundle, then a prerender of all 136 pages into `dist/`), then `scripts/verify-dist.mjs` (every internal `href`/`src` resolves, one `<h1>`/`<main>`/canonical per page) |
| `npm run preview`                       | serves the built `dist/` on :4321 the way the production host does — no redirects, `404.html` for anything unmatched (`PW_PORT`/`PW_DIST` override the port and directory)                                                              |
| `npm run render -- <url> [out.html]`    | renders one route through the dev SSR without a full build, for quick diffs                                                                                                                                                             |
| `npm run typecheck`                     | the type gate alone                                                                                                                                                                                                                     |
| `npm run lint` / `npm run format:check` | ESLint / Prettier, both must be clean                                                                                                                                                                                                   |
| `npm run format`                        | rewrite files with Prettier                                                                                                                                                                                                             |
| `npm test`                              | Vitest unit suite (`environment: 'node'`, no DOM, no `localStorage`)                                                                                                                                                                    |
| `npm run test:e2e`                      | Playwright + axe; locally it builds and previews first, so it needs :4321 free                                                                                                                                                          |
| `npm run og`                            | regenerates the Open Graph card from the real renderer — run by hand, never in the build                                                                                                                                                |
| `npm run icons`                         | re-rasterizes `public/favicon-32.png` and `public/apple-touch-icon.png` from `public/favicon.svg` — run by hand after any edit to the mark                                                                                              |
| `npm run fonts`                         | re-cuts `public/fonts/*.woff2` to the characters `src/` actually contains, verifies every one renders, and rewrites `src/styles/font-charset.ts`                                                                                        |
| `npm run audit:frames`                  | per instrument: how the drawing's viewBox varies across a full trace, and whether step 0 fits its own box — run by hand after any renderer geometry change                                                                              |
| `npm run validate:content`              | the lesson content validator: metadata, ordering, sections, word bounds, links, diagrams, code fences, Kubernetes API versions, Appendix coverage. `-- --strict` also requires every planned lesson to exist                            |

**Definition of Done for any change** (spec §18): `npm run build`, `npm run lint`,
`npm run format:check`, `npm test`, `npm run validate:content` and `npm run test:e2e` all clean. CI
(`.github/workflows/ci.yml`) runs exactly those six as the `DoD gate`, with the validator in
`--strict` mode.

**Do not run `npm run test:e2e` while other heavy processes are running.** It uses
`retries: 0` locally with full parallelism, so a loaded machine produces axe timeouts and chunk-load
failures that all pass when the machine is quiet.

Note for the two regression baselines. `tests/e2e/baseline-aria.spec.ts` runs everywhere.
`tests/e2e/baseline-visual.spec.ts` is **seeded and armed on CI** — 14 PNGs are committed and the
DoD gate sets `VISUAL_BASELINE=1` inside the pinned `mcr.microsoft.com/playwright:v1.61.1-noble`
container. It stays CI-only for hinting and sub-pixel reasons; the site self-hosts its two
typefaces, so glyph shapes no longer follow whatever fontconfig resolves on the machine. **Locally the flag is unset, so those 14 captures skip and a green local
e2e run still says nothing about pixels**; re-seed through the workflow job, in the same container.

The same seeding run works locally if Docker is available, which is worth knowing when a change
repaints the site and you would rather not round-trip through CI:

```bash
docker run --rm -v "$PWD:/w" -w /w -e CI=1 -e VISUAL_BASELINE=1 --ipc=host \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c 'npm run build && npx playwright test tests/e2e/baseline-visual.spec.ts --update-snapshots=all'
```

`--update-snapshots=all`, never the bare flag — the bare flag means `changed`, which rewrites only
the captures that FAIL and leaves any whose diff lands under `maxDiffPixelRatio` stale-but-passing.
**Afterwards, hand the container's leftovers back**: it runs as root, so `dist/`, `node_modules/.vite`,
`test-results/` and `playwright-report/` come back root-owned and the next local run cannot write
them —

```bash
docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -c 'rm -rf /w/dist /w/node_modules/.vite /w/test-results /w/playwright-report'
```

Expect the pixel gate to be coarse for text-level changes: `maxDiffPixelRatio: 0.002` on an
~8,600 px full-page screenshot tolerates ~30,000 px, so removing two 12px labels (569 px changed)
passed all 14 captures unchanged — the **aria** baseline is what catches that class of change.

## How it fits together

```
src/content/lessons/*.mdx   one file per lesson: frontmatter + prose + components
                            flat, with `k8s-`/`sd-` slug prefixes for the two newer courses
src/content/                the loader (lessons.ts: every lesson, validated) and schema.ts (zod)
src/mdx/                    the MDX pipeline: GFM, smartypants, Shiki, heading ids, the prose pass
src/routes.tsx              the route table — the single source of every URL the site serves
src/pages/, layouts/        one React component per page kind, rendered to static HTML at build time
src/render/                 Document (<html>/<head>/SEO), Island (server half of a hydrated island),
                            site-url.ts (the SITE_URL guard)
src/components/             server-rendered React components; diagrams/ are hand-drawn SVG, zero JS
src/client/islands.ts       the island bootstrap; island-registry.ts names the three islands
src/client/modules/         framework-free scripts over server markup (theme, ToC, practice, …)
src/viz/                    the visualization pipeline (see below) + the id → module registry
src/lib/                    shared logic: progress/mastery store, challenges data, theme, glossary,
                            courses.ts + tracks.ts (course → module → lesson), progress-paint.ts
scripts/vite-plugin-ssg.ts  the in-repo static-site generator: dev middleware + build-time prerender
scripts/lib/                the content validator, shared by the CLI and its Vitest suite
src/styles/                 tokens.css (the design tokens — the single source of truth for
                            colour/type/space), global.css, and site.css importing one file per
                            layout, component and page
public/fonts/               the two self-hosted IBM Plex subsets, generated by `npm run fonts`
tests/unit/, tests/e2e/     Vitest (pure functions, React SSR) and Playwright (DOM, storage, a11y)
```

**Rendering.** `vite build` builds the client assets, then an SSR bundle holding the route table and
all 127 compiled lessons, then prerenders every route with React's `renderToStaticMarkup` into
`dist/<path>/index.html` (plus `404.html`, `sitemap.xml` and `robots.txt`). Navigation is ordinary
multi-page navigation; there is no client router. **Routes** come from `src/routes.tsx`: the fixed
pages, one per course, and one per published lesson, whose URL is `/learn/{slug}/` from the lesson's
frontmatter. A route the table does not list does not exist in dev, preview or production.

**Islands versus modules.** Only the three instruments hydrate as React islands: the Visualizer
(with its ledger and predict mode), Trace Trials and the Final Run. Each is server-rendered inside a
`[data-island]` container; `src/client/islands.ts`, a small eager bootstrap, activates it on its
trigger (visible, or idle for trials) and only then imports React and the island's chunk, so a page
pays for React when an instrument activates — and only the 15 DSA lessons, `/` and `/about/` host
one. A hydration mismatch is reported as an `ldsa:hydration-error` event that the e2e suite asserts
never fires. Everything else that runs in the browser (theme toggle, table of contents, practice
grading, mark-complete, progress painters, the glossary filter, Explain-it-back) is a framework-free
module in `src/client/modules/`, loaded as a `<script type="module">` only by pages that render it.

**Persistence.** `localStorage`, and only the eight keys spec §6 enumerates: `theme`,
`pref:viz-speed`, `pref:code-lang` (preferences, never reset) and `lesson:{slug}:complete`,
`progress:v1:{slug}`, `ld:challenges:v1`, `ld:finalrun:v1`, `ld:days:v1` (progress, cleared by the
reset control). `src/lib/progress.ts` is the one reader and the one deleter of every progress key,
each key has exactly one writer, every access is `try/catch`-guarded, and the key names are
unchanged across the framework rewrite, so existing readers' progress still loads.

**Adding a lesson.** Write `src/content/lessons/{slug}.mdx` with the frontmatter the schema in
`src/content/schema.ts` requires (`title`, `slug`, `course`, `track`, `order`, `summary`,
`difficulty`, `estimatedMinutes`, `published: true`, …), the six h2 sections, and components
imported from `src/components/`. Follow `docs/courses/CONTENT_STYLE.md`. Then run
`npm run validate:content` (and `-- --strict` before a PR); the build itself also fails on an
invalid frontmatter field, a duplicate slug or an unknown prerequisite, naming the file and the
field. If the lesson introduces a character the font subsets do not cover,
`tests/unit/font-charset.test.ts` fails — run `npm run fonts` and commit the regenerated subsets.

The visualization architecture is **trace-then-render** and is not negotiable: an instrumented
algorithm emits an ordered `Step[]` trace, a generic Player indexes into it, and a dumb per-structure
renderer draws SVG for whatever step it is handed. Stepping backwards is just decrementing an index.
Nothing hand-animates an algorithm with its own timers, and the gamification layer (predict mode,
trials, Final Run) _consumes_ the same precomputed trace rather than forking the pipeline. The
renderers stay imperative behind a React ref. The ledger under each drawing is a second _view_ of
that same trace — one row per `Step`, value columns read from `step.state` and the "what happened"
cell taken verbatim from the authored explanation, so the table and the drawing can never tell
different stories. It is server-rendered, so with JavaScript off it _is_ the lesson.

Adding an algorithm is one file in `src/viz/algorithms/` plus one line in `src/viz/registry.ts`.

## Constraints that are easy to break by accident

These are enforced by review and, in most cases, by tests — a change that violates one is a bug even
if it looks like an improvement.

- **It must work with JavaScript disabled.** All prose, code and navigation stay usable; the
  visualization degrades to its static still. Every gamification component ships its own
  `<noscript>` kill-switch, so with JS off no pip, ring, review card, trial or Final Run appears at
  all — a dead control is worse than no control.
- **Every dependency is justified.** There is no blanket ban, but each one carries a comment saying
  why it is needed, and a visualization library the renderers do not need is still out — the
  renderers draw their own SVG.
- **JS budget: ≤ 120 KB gzipped per page, and no runtime network calls.** This is measured, not
  remembered: `tests/e2e/js-budget.spec.ts` gates two figures on every page — EAGER (every script in
  the built HTML plus its static import closure) and FULL (EAGER plus every chunk the page's islands
  load on activation, React included, from `.build/page-manifest.json`) — and prints the per-page
  table on every e2e run. Read that for the current number rather than a figure copied into a doc.
  Renderer and algorithm chunks load lazily per lesson; everything is bundled at build time.
- **`localStorage` is the only persistence**, and only the keys enumerated in spec §6 are permitted
  (adding one is a spec change). Every access is `try/catch`-guarded, storage is never enumerated by
  prefix, and there is **no behavioral tracking** — only explicit clicks and self-reports are stored.
  Never infer progress from scroll depth or time on page. It is also **per-device with no sync**: a
  reader's progress lives in one browser profile and nothing ever leaves it.
- **Every internal page link carries a trailing slash, root-absolute.** The site builds as
  directories, so `/learn/binary-search/` is the published URL and the slashless spelling is **not
  served** by `npm run preview` — it 404s rather than redirecting, which is what makes a missed
  slash fail loudly instead of quietly costing a redirect. Links are written root-absolute
  (`/glossary/#array`, never `../glossary/`), in server markup and in client code alike. The slash goes on the _path_, before any query
  or fragment (`/learn/#track-arrays`, never `/learn#track-arrays/`). Canonical, `og:url` and every
  sitemap `<loc>` must name the exact URL the page is served at; `tests/e2e/url-shape.spec.ts` fails
  the run when one disagrees. Asset URLs (`/favicon.svg`, `/assets/…`) are files and take no slash.
- **WCAG 2.1 AA.** Real buttons and inputs, full keyboard operability, `aria-live="polite"` step
  explanations, never colour as the only signal, and `prefers-reduced-motion` respected. Motion
  durations come only from the `--duration-*` tokens (reduced motion collapses them in one place);
  sticky offsets come only from `--header-h`; the six `--hl-*` roles are reserved for the
  visualization, so chrome uses `--accent-warn`.
- **The chrome is achromatic on purpose.** `--brand` is byte-identical to `--text`, so the only
  colours on a lesson page are the `--hl-*` roles explaining the algorithm and `--accent-warn` on a
  warning callout. Distinctions that used to ride on the brand hue carry a second signal instead
  (underlines on prose links, fill **and** border on control hovers); `tests/unit/palette-states.test.ts`
  pins the ones the contrast matrix cannot see. Re-introducing a brand hue is a spec amendment.
- **The design decisions in the docs are decisions.** The left-aligned reading measure, the neutral
  difficulty chips and the achromatic chrome look like bugs and are not; changing one is a spec
  amendment with designer sign-off. Check the docs before "fixing" something that looks off.

## Where the documentation lives

| Document                                                   | What it is                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/site-spec.md`                                        | **the authoritative spec** — architecture, content model, keys, milestones, Definition of Done                    |
| `docs/m7-ux-overhaul.md`, `docs/m8-gamification.md`        | the UX overhaul and the mastery loop: design, what shipped, and the deviations/deferrals                          |
| `docs/design-tokens-m1.md`                                 | the token system and its rationales (its code blocks are a retired M1 snapshot — `src/styles/tokens.css` is live) |
| `docs/m2-*`, `docs/m3-*`, `docs/m5-*`, `docs/m6-design.md` | earlier milestones: lesson layout, viz framework, glossary/SEO, the DP lesson                                     |
| `docs/deployment.md`                                       | production deploy: the deployment URL per host, Cloudflare Workers Builds + `wrangler.jsonc`, Node pin, DoD gate  |
| `docs/migrations/`                                         | the rewrite onto React: plan, decision record, CSS scope audit, spec amendments (`react-amendments.md`)           |
| `CLAUDE.md`, `Agents.md`                                   | how AI coding agents are expected to work in this repo — read these before running one                            |

If a request conflicts with the spec, flag the conflict instead of guessing. If the spec is silent,
choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining it.

## Contributing

- **Conventional Commits** for messages.
- **JSDoc on public functions**, and inline comments that explain _why_ a non-obvious piece of code
  exists. Comments must be true: a measurement in a comment is a claim, so measure it.
- No `console.log` and no dead code in shipped source.
- Tests are where design intent is preserved — the calm-behaviour rules, the token contrast matrix
  and the review-strip caps are all assertions, not conventions. Add to them rather than around them.

## Deployment

The site runs on **Cloudflare Workers with static assets**, at one origin: Workers Builds is
connected to the repository, runs its own `npm run build` on every push to `main` and then
`npx wrangler deploy`. The committed **`wrangler.jsonc`** is what makes that deploy a plain asset
upload of `dist/` — no adapter, no Worker script — and it also asks for the trailing-slash and
404-page handling Workers does not infer (`html_handling`, `not_found_handling: "404-page"`). The
GitHub Actions workflow runs the checks Cloudflare does not (lint, format, unit, content, e2e + axe)
and is meant to be a required status check. The workflow deliberately does not deploy — the two
systems are independent, so without branch protection a red gate cannot stop a deploy. Response
headers (security + caching, including the long cache on `/assets/*`) ship as `public/_headers`.

Internal URLs are root-absolute, so the build is made for the root of one origin. Only the
_declared_ URLs — canonical, `og:url`, `og:image`, sitemap `<loc>`, robots' `Sitemap:`, JSON-LD —
need that origin, and they come from one input: **`SITE_URL`, set to the origin alone**
(`https://learndsa.dev`, no path). On Cloudflare Workers Builds, Cloudflare Pages, Netlify and Vercel
a build without it **fails** rather than shipping the placeholder, and a `SITE_URL` with a path fails
everywhere. An unstamped local build carries `https://learndsa.invalid`, which is reserved by
RFC 2606 and can never resolve, so a placeholder that escapes is obvious and inert.

**Verifying the static output** before a deploy: `npm run build && npm run preview`, then
`npx playwright test tests/e2e/url-shape.spec.ts tests/e2e/static-hosting.spec.ts` — the first
proves every internal link is root-absolute and resolves, every canonical names the URL it is
served at and every sitemap `<loc>` is served; the second proves deep links, reloads, back/forward,
the 404 status and that every asset a lesson requests is served. Details — the Node pin, how to
regenerate the OG card, and a post-deploy checklist — are in `docs/deployment.md`.

## License

[MIT](LICENSE), © 2026 saikumaryerra — which is what the site footer's "Free and open source" now
points at.

It covers the **whole repository**, prose included: the 15 lessons, the visualization pipeline and
the tooling are all under the same terms. That is a deliberate simplification over the usual
code-MIT / content-CC-BY split — one file, nothing to explain, and reuse of the teaching material is
as unencumbered as reuse of the code.
