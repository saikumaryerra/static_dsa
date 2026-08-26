# Phase 0 — Reconnaissance (LearnDSA)

Findings later phases depend on. Verified by reading source at the cited lines
and by running the baseline commands (2026-08-26, commit `9b44d75`).

## Stack

Astro 7 static (`output: 'static'`, `build.format: 'directory'`, `trailingSlash: 'always'`),
TypeScript strict, Tailwind v4 via `@tailwindcss/vite`, MDX lessons, Vitest (node env, **no DOM,
no localStorage**), Playwright, ESLint + Prettier, npm, Node ≥ 22.12. **No backend, no database,
no auth.** Dependencies are exactly `@astrojs/mdx`, `@tailwindcss/vite`, `astro`, `tailwindcss`
— spec §4 forbids adding any without a `// SPEC-GAP:` justification.

`npm run build` = `astro check && astro build && node scripts/portablize.mjs`. The third step
rewrites every navigational URL in `dist/` to a document-relative one and **fails the build** on a
surviving root-absolute URL, so `base` is never set and client JS must never build a
`/learn/${slug}/` literal (use `lessonHref()` in `src/lib/progress.ts`).

## Baseline (all green before this work)

| Command | Result |
|---|---|
| `npm run build` | ✅ 21 pages, portablize clean |
| `npm run lint` | ✅ |
| `npm run format:check` | ✅ |
| `npm run test` | ✅ 63 files, 1103 tests |
| `npm run test:e2e` | see PROGRESS.md |

## Content model

**One** content collection, `lessons` (`src/content.config.ts`), loaded by
`glob({ pattern: '**/*.mdx', base: './src/content/lessons' })` — **MDX only**, flat, 15 entries.
The route comes from frontmatter `slug`, not the filename.

Required today: `title`, `slug` (kebab), `track` (**closed enum** `foundations|algorithms`),
`order` (**global** positive int, 1–15), `summary`, `difficulty` (**closed enum**
`beginner|intermediate`), `estimatedMinutes`, **`complexity`** (four Big-O strings, `/^O\(.+\)$/`).
Optional: `prerequisites` (default `[]`), `tags` (default `[]`), `explainPrompt`,
`published` (default **false** — an omitted flag builds no page).

There is no course/module concept above `track`. Track copy lives in exactly one place:
`src/lib/tracks.ts` (`Track` union :12, `TRACK_ORDER` :28, `TRACK_COPY` :31).

## Build-time guards new content must satisfy (hard throws)

| Guard | Where |
|---|---|
| Duplicate `slug` | `src/pages/learn/[slug].astro:24-32` |
| `prerequisites` naming an unknown/unpublished slug | `src/pages/learn/[slug].astro:39-47` |
| **Every published lesson body must contain a literal `## Practice` h2** | `src/pages/learn/index.astro:135-144` |
| Glossary `lessonSlug` must name a published lesson | `src/pages/glossary.astro:33-39` |
| `deploymentUrl()` rejects non-root-absolute paths and `?`/`#` | `src/lib/deployment-url.ts:74,79` |
| `<PracticeCheck>` rejects `index < 1` or `total < index` | `src/components/PracticeCheck.astro` |

## Routing and pages

`/`, `/learn/`, `/learn/{slug}/` (the **only** dynamic route), `/glossary/`, `/about/`, `/404.html`,
`/dev/renderers/`, plus `sitemap.xml` and `robots.txt` API routes. `STATIC_PATHS` in
`src/pages/sitemap.xml.ts:19` is hand-maintained — a new landing page must be added there.
`NAV_ITEMS` in `src/lib/nav.ts:22` drives header **and** footer; `tests/unit/nav.test.ts:124`
hardcodes the three-item list.

Prev/next is **global by `order`** across both tracks (`[slug].astro:69-86`); a cross-track
neighbour carries a `trackLabel` that `PrevNext` renders as "Next track: …". `PrevNext.astro:60-67`
hardcodes "That's the whole curriculum" when `next === null`.

## Design system

Tokens in `src/styles/tokens.css` (colour declared in **four** blocks: light `:root`, `[data-theme="dark"]`,
`prefers-color-scheme: dark` mirror, and a print override in `global.css`). Achromatic palette;
the six `--hl-*` roles are **viz-only** and chrome must never read one. Focus is one unlayered
global `:focus-visible` ring — components declare nothing. Motion goes through `--duration-*`
(collapsed by `prefers-reduced-motion` centrally); never write a component-local motion query.
Every control family must declare the five states (default / hover / focus-visible / active /
disabled) or `tests/e2e/m7-brand.spec.ts` fails.

`<Bench>` (prose + pinned `slot="stage"` at ≥1200px and ≥640px tall) and `<Band>` (two-up at
≥1200px) are the layout primitives; DOM order is never reordered. MDX-safe components:
`Bench`, `Band`, `Callout`, `Collapsible`, `CodeTabs`, `PracticeCheck`, `ComplexityTable`.
`Visualizer`, `Challenge`, `FinalRun`, `StepLink` are viz-coupled and irrelevant to prose tracks.

## Gaps this work must fill

1. **No diagram mechanism.** No Mermaid, no `Figure`, no rehype plugins, no `<img>` styling,
   no content SVG in `public/`. `renderStatic()` is bound to algorithm traces and is not reusable.
2. **Markdown tables are completely unstyled** (Tailwind preflight zeroes padding/borders) and
   capped at `--measure`. One lesson uses them today (`graphs.mdx`).
3. **Bare fenced code blocks are unstyled** — `pre.astro-code` has no padding, border, radius or
   `overflow-x`. Only `<CodeTabs>`' own `pre` is styled. A YAML-heavy track needs this fixed.
4. `.lesson-body :global(> *)` caps every direct child at `--measure`; breakouts are an explicit
   class allowlist at `LessonLayout.astro:369-396`.
5. **Fonts are subset from the repo's own characters.** New glyphs need `npm run fonts`, and
   `tests/unit/font-charset.test.ts` fails otherwise.
6. Visual + ARIA baselines cover `/` and `/learn/` and will change deliberately.
7. `difficultySpread()` (`src/pages/index.astro:76-86`) hardcodes the two difficulty values.
8. Algorithms-only site copy: `index.astro:142,143,153,155,266`, `learn/index.astro:157,159,165`,
   `about.astro:55,67`, `SiteFooter.astro:22`, `structured-data.ts:84`, `PrevNext.astro:62`.

## Already generic — needs no change

`renderTracks()` on `/learn` iterates `[data-track-progress]` and filters by track id;
`TrackArc.astro` takes `track: string`; `LessonRef.track` is `string`; `MarkComplete` looks the
track name up defensively and renders nothing for an unknown id; sitemap enumerates lessons
automatically; portablize has no hardcoded page count.
