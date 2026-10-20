# React migration — decision record

ADR-style record for the Astro → React rewrite. Each entry states the decision, the alternatives
rejected and why, and the evidence. The executable plan is
[`react-migration-plan.md`](./react-migration-plan.md); the machine-checkable baseline is
[`react-migration-inventory.json`](./react-migration-inventory.json), produced by
`scripts/migration/inventory.mjs`.

**Precedence used throughout.** The user's master prompt says the repository and its
specification "take precedence over this summary whenever they provide more precise or newer
requirements" (§1) and that its invariants hold "unless the existing specification explicitly says
otherwise" (§2). `CLAUDE.md`'s "Hard-constraint decisions for the rewrite (decided 2026-10-20)"
table is the newest statement of requirements, so it governs where the two disagree. Every such
disagreement is listed in [§ Conflicts](#conflicts) rather than resolved silently.

Status key: **Decided** (binding for execution) · **Recommended — confirm** (the planner's call,
flagged for the orchestrator before execution starts) · **Superseded**.

---

## Index

| # | Decision | Status |
|---|---|---|
| D-01 | Portability is dropped; root-absolute URLs | Decided (CLAUDE.md, orchestrator D1) |
| D-02 | React 19.3 is the UI framework | Decided (user) |
| D-03 | Static architecture: Vite 8 + in-repo prerenderer + React islands | Decided (measured) |
| D-04 | Rendering model: static markup for pages, isolated `renderToString` for islands, container-as-root hydration, no client router | Decided |
| D-05 | Island-versus-module rule, and which component lands where | **Recommended — confirm** |
| D-06 | React loads per island activation; the JS budget gates the *full* page | **Recommended — confirm** |
| D-07 | MDX pipeline reproduces Astro's plugin chain at pinned versions | Decided |
| D-08 | MDX import specifiers: resolver during migration, deterministic codemod at cutover | Decided |
| D-09 | Content schema and build guards move to a framework-free loader with `zod` | Decided |
| D-10 | CSS: one stylesheet; scoped blocks become plain CSS, gated by a cascade audit | Decided |
| D-11 | DOM compatibility contract and id determinism | Decided |
| D-12 | Shiki class `astro-code` kept until cutover, then renamed to Shiki's own | Decided |
| D-13 | URL model, preview server, 404, sitemap/robots, Workers config | Decided |
| D-14 | Tests: Vitest stays node-only; React SSR is testable without a DOM | Decided |
| D-15 | Type gate `tsc --noEmit` replaces `astro check`; lint/format plugins swap | Decided |
| D-16 | Fonts and subsets are untouched; no `npm run fonts` during the migration | Decided |
| D-17 | Legacy reference: worktree at `51a70cf` + preserved baseline `dist/` | Decided |
| D-18 | Dependencies added and removed | Decided |
| D-19 | Execution model: medium-effort implementers, disjoint ownership, ≤ 2 concurrent | Decided (orchestrator D8) |

---

## D-01 — Portability is dropped; root-absolute URLs

**Decision.** The site deploys at one origin. Every internal navigational URL is root-absolute
(`/learn/arrays/`, `/assets/x-HASH.js`). Retired with it: `scripts/portablize.mjs`,
`scripts/rehost.mjs`, `tests/unit/portablize.test.ts`, `tests/unit/rehost.test.ts`,
`tests/e2e/portable.spec.ts`, the `portable` Playwright project and its `:4322` web server, the
`[data-site-root]` anchor on the header wordmark, `siteRoot()` in `src/lib/progress.ts`, the
`npm run rehost` script, and the `vite.experimental.renderBuiltUrl` pin. Client-built links become
root-absolute literals produced by one helper (`lessonHref(slug)`, `reviewHref(slug)`).

**Kept, because it is not portability:** declared URLs (canonical, `og:url`, `og:image`,
`twitter:image`, sitemap `<loc>`, robots `Sitemap:`, JSON-LD `url`) still come from `SITE_URL` via
`deploymentUrl()` with the `https://learndsa.invalid` sentinel and the `PUBLISHING_BUILDERS` guard
(`CF_PAGES`, `WORKERS_CI`, `NETLIFY`, `VERCEL`). **Added:** the build fails if `SITE_URL` carries a
path other than `/` — with navigation now root-absolute, a sub-path `SITE_URL` would publish
canonicals that the page's own links contradict.

**Alternatives rejected.**
- *Keep `portablize.mjs` as a post-pass over the React build* — rejected by the user's 2026-10-20
  decision; it also re-imports the failure class the pass existed to police (runtime-assembled
  URLs in chunks).
- *Emit document-relative URLs natively from the prerenderer* — technically cheap here (we own the
  renderer), but out of scope by decision. A future reversal stays cheap: server-rendered links are
  authored root-absolute exactly as today (amendment U-1), and the only links built in client code
  come from two functions, `lessonHref(slug)` and `reviewHref(slug)` in `src/lib/progress.ts` — so a
  relative-URL pass would again be an HTML-only rewrite with no chunk to police.

**Evidence.** `CLAUDE.md` table row "Portable `dist/` … **Dropped**"; orchestrator decision D1.
**Conflict:** master prompt invariant 4, §4.4, §5.9 (last bullet), §6.1 item 8, §6.4, Gate E — see
[C-1](#conflicts).

## D-02 — React 19.3 is the UI framework

**Decision.** `react@19.3.1` + `react-dom@19.3.1` (current stable on the registry, 2026-10-20),
TypeScript types from `@types/react` / `@types/react-dom`. **Evidence:** the user's instruction,
relayed as orchestrator decision D2; `CLAUDE.md` names React-based static generation as the
newly-viable option once the budget rose to ~120 KB.

## D-03 — Static architecture: Vite 8 + in-repo prerenderer + React islands

**Decision.** Option (a): **Vite 8.1.5** (already the repo's bundler under Astro) with
`@vitejs/plugin-react`, `@mdx-js/rollup` 3.1.1, `@tailwindcss/vite` 4.3.3, and a small
in-repository static-site generator:

- `vite build` runs a client build (island/module entries + the site stylesheet → `dist/assets/`),
  an SSR build (`src/entry-server.tsx` + all 127 compiled lessons → `.build/server/`, never
  deployed), then **prerenders** every route to `dist/<route>/index.html` with React
  (`scripts/vite-plugin-ssg.ts`, `buildApp` hook). `npm run dev` serves the same renderer as Vite
  middleware.
- Pages are static HTML; only components that need React on the client hydrate, each as an
  isolated island (D-04/D-05). No client router: navigation is ordinary document navigation, so
  deep links, refresh, back/forward and bfcache behave exactly as they do today.

**Alternatives evaluated.**

| Option | True static | Prose ships as HTML only | Client runtime floor | Partial hydration | Fit / cost |
|---|---|---|---|---|---|
| **(a) Vite + in-repo prerenderer + islands** | yes | yes | **67.9 KB gz** only on pages with an active island; 0 KB elsewhere (measured, E1) | native (we choose per component) | ~400 lines of build code we own; reuses Vite/Tailwind/Rolldown already in the repo |
| (b) Next.js 16 App Router, `output: 'export'` | yes | **no** — every page also inlines its RSC flight payload (`self.__next_f.push(...)`), i.e. the prose a second time | **171–177 KB gz on every page**, even a page with no interactivity (measured, E2) | no (client components hydrate inside one page-wide root) | adapter-free export works, but it is over the 120 KB budget on all 136 pages before any site code, ships whole-page hydration and a router we would have to disable for MPA semantics, and duplicates the prose on 127 prose-heavy pages |
| (c) React Router (8.5.0, the current major) framework mode, `ssr:false` + `prerender` | yes | **no** — the route module carries the prose as JS so the whole page can hydrate | **107 KB gz on a bare page, 112 KB on the lesson** (measured, E3) | no | SPA-shaped; prose becomes JS; leaves ~8–13 KB for every island on a DSA lesson; violates master-prompt invariant 18's preference |
| (d) Vike + `vike-react` with prerender | yes | per page: either fully hydrated or HTML-only (`clientOnly`/server-only pages) | React DOM on hydrated pages | no first-class islands; would need the same island bootstrap we would write for (a) | adds a framework dependency for what (a) does in-repo; smaller community; same island code anyway |
| (e) Astro 7 + `@astrojs/react` islands | yes | yes | React DOM on island pages (+ `astro-island` runtime) | yes (`client:visible`) | **viable as an interim only**: the brief requires no Astro dependency in the final state, so every `.astro` file would still have to be rewritten later — two migrations instead of one |

**Measured evidence (scratch experiments, 2026-10-20, `nice -n 19`, machine under e2e load —
sizes are deterministic, times are not).**

- **E1 — Vite 8.1.5 + React 19.3.1, one hydrated island.** `islands` entry (react + react-dom/client
  + `hydrateRoot` + a 2-button island): **220,167 B raw / 67,924 B gzip -9**. The same behaviour
  as a framework-free module: **496 B raw / 282 B gzip -9**. So the React runtime costs ~66 KB gz
  per page that loads it, and that number — not the island code — dominates every budget below.
- **E1b — SSR shape.** Page via `renderToStaticMarkup` with islands via nested `renderToString`:
  static prose carries no `<!-- -->` text separators, island subtrees do (as hydration needs);
  `<noscript dangerouslySetInnerHTML>` emits the kill-switch `<style>` verbatim; boolean attributes
  render as `disabled=""`; a bare JSX data attribute (`data-x`) renders `data-x="true"`, so DOM
  parity requires writing `data-x=""` (D-11).
- **E2 — Next.js 16.4.2, App Router, `output: 'export'`** (Turbopack production build), one
  page with the k8s-services lesson's 67 prose blocks (11.9 K characters) as a server component and
  three `'use client'` islands, plus a home page that is a bare `<h1>`: **every page ships 6–7
  script files totalling 170.5 KB gz (home) / 170.9 KB gz (lesson), plus 1.4 / 6.5 KB gz of inline
  RSC flight data — 171.9 KB and 177.3 KB gz in total**, i.e. ~1.4× the 120 KB budget *before any
  site code*, on a page with no interactivity at all. The prose is duplicated: a sampled sentence
  occurs twice in the lesson HTML (once as markup, once inside `self.__next_f.push(…)`; 18.5 KB raw
  of flight data for 11.9 K characters of prose).
- **E3 — React Router 8.5.0** (the current major; the brief's "7" has been superseded), framework
  mode, `ssr: false` + `prerender: ['/', '/lesson']`, same two pages: **106.9 KB gz** on the bare
  home page and **111.5 KB gz** on the lesson (`entry.client` 67.3 KB — React DOM — plus a 38.3 KB
  shared runtime chunk plus the route module), every page hydrated whole, and the lesson's prose
  shipped a second time inside its 12.7 KB route module.
- **E4 — the MDX chain, end to end.** `@mdx-js/mdx` 3.1.1 + `remark-frontmatter`/`remark-mdx-frontmatter`
  + `remark-gfm` 4.0.1 + `remark-smartypants` 3.0.2 + `rehype-raw` (MDX passthrough) + the vendored
  Shiki 4.3.1 transform + the prose pass moved from `astro.config.mjs` + the vendored heading-id
  slugger, rendered with React 19 `renderToStaticMarkup` (prose-container components as
  pass-throughs, instruments as nulls) and compared with the baseline `dist/`'s `.lesson-body` on
  **10 lessons** (k8s-services, k8s-rbac, k8s-helm, k8s-what-kubernetes-is, sd-capacity-estimation,
  sd-comparison-table, sd-api-design, sorting-basics, dynamic-programming, recursion): heading ids
  and text, paragraphs, list items, table cells and wrappers, and every markdown code block's
  classes, `data-language`, `tabindex`, `<pre>` style, text and per-token style sequence are
  **identical**. The first run found one real drift — `data-language="plaintext"` where Astro
  writes `"text"` — because Astro keeps a Shiki *special* language (`text`, `plaintext`, `txt`,
  `plain`, `ansi`) as authored via `isSpecialLang`; the vendored transform must copy that branch
  verbatim. That is exactly the class of drift the P1 `proseHash` gate exists to catch. E4 also
  surfaced a **pre-existing defect** the port must reproduce rather than fix: every markdown fence
  ships as `<pre class="md-code">` *without* Shiki's `astro-code` classes (Shiki sets the hast
  property `class`, the prose pass sets `className`, and `className` wins in the JSX), so the
  dark-theme rules in `global.css`, which select `.astro-code`, never reach a markdown fence — in
  dark mode the 112 prose lessons' code blocks stay on the light palette. Recorded in plan §1 for a
  post-migration fix with its own visual review.
- **Legacy, for comparison** (same method as `tests/e2e/js-budget.spec.ts`: inline scripts + the
  static-import closure, gzip -9, from the saved baseline `dist/`): `/learn/binary-search/`
  **21.1 KB** · `/learn/sorting-basics/` 20.4 KB · `/` 13.3 KB · `/about/` 9.9 KB ·
  `/learn/k8s-services/` **8.5 KB** · `/learn/` 7.2 KB · `/learn/dsa/` 5.6 KB · `/glossary/` 1.3 KB
  · `/404.html` 0.7 KB. Deferred viz chunks a binary-search reader actually loads (two algorithms +
  the array renderer + shared): ~7.2 KB.

**Why (a).** It is the only option that keeps prose and diagrams as HTML with **zero** JS, lets
each component choose whether it hydrates, keeps MPA navigation (no router to fight), and adds no
framework beyond React itself. Its cost — owning ~400 lines of SSG code — is small next to the
others' structural costs, and the repo already runs on Vite/Rolldown. The orchestrator's prior was
(a); the measurements support it: Next's static export alone costs 171 KB gz per page (E2), and any
page-wide-hydration framework puts at least the ~66 KB React floor plus a router runtime on all 136
pages, including the 112 prose lessons that need none of it. E4 shows the content half of (a) is
not a rewrite risk: the same remark/rehype chain under React reproduces the legacy prose.

## D-04 — Rendering model

**Decision.**

1. **Pages** render with `renderToStaticMarkup` (no hydration markers in static content). The
   document shell (`<html>`, `<head>`, metadata, the verbatim pre-paint theme script, stylesheet
   and script tags) is a React component (`src/render/Document.tsx`) fed by the route's `PageMeta`.
2. **Islands** render in isolation: the server-side `<Island>` helper calls `renderToString` on the
   island component **with exactly the serialized props the client will receive**, and injects the
   result as the children of a container element it renders itself. The client then calls
   `hydrateRoot(container, <Component {...props} />)`. Because both renders see the same props and
   no context, server and client output are equal by construction; any render-time access to a
   browser global throws during the Node prerender and fails the build (master-prompt invariant 21,
   enforced rather than reviewed).
3. **Container-as-root.** The container *is* the component's own root element (`<section class="viz">`,
   `<div class="challenge">`, …), carrying `data-island="<name>"` and, when needed,
   `data-props='<json>'`. React owns the container's children; the island sets attributes on its
   own root through the `container` reference it is handed. No wrapper element is introduced, so the
   DOM — and the 37 e2e specs that select on it — stays as it was (D-11).
4. **Client-only islands** (ExplainBack, which ships an inert `<template>` and renders nothing until
   the lesson is complete) create their root element imperatively in the same position the legacy
   script inserts it, then `createRoot` into it.
5. **No client router and no View Transitions.** The legacy `astro:page-load` /
   `astro:before-swap` listeners never fired (no `ClientRouter` is installed) and are deleted. bfcache
   restores keep using `onRestore` (`pageshow.persisted`).
6. **Hydration errors are observable.** The bootstrap passes `onRecoverableError` to every root and
   dispatches a `ldsa:hydration-error` event on `document`; an e2e test listens for it on every page
   it visits (no console output — `no-console` stays an error).

**Alternatives rejected.** A `display: contents` wrapper element per island (`<astro-island>`
style) — changes child-combinator selectors and the ARIA tree's generic nodes. Rendering the whole
page with `renderToString` — puts `<!-- -->` separators through every lesson's prose and makes the
prose parity check noisy for no benefit. `createRoot` (client re-render) instead of hydration for
SSR'd islands — loses focus/scroll state if a reader interacts before activation and repaints the
instrument once.

## D-05 — Island-versus-module rule

**Rule (recommended).** A client behaviour becomes a **React island** when it is an *instrument*:
it holds two or more interacting pieces of UI state that drive three or more independently-updated
regions of its own markup, where declarative re-rendering replaces a large imperative DOM layer.
Everything else is a **framework-free progressive-enhancement module** (`src/client/modules/*.ts`,
plain TypeScript over server-rendered markup — what every behaviour is today): a single binary/enum
state reflected into attributes or text of server markup, or a painter/decorator over many nodes
owned by other components, or a document-level delegate.

| Legacy script | Becomes | Why (rule) | Pages it lands on | Legacy gz |
|---|---|---|---|---|
| `Visualizer.astro` (1,650 lines) + `Ledger.astro` | **Island** `visualizer` | player index × playing × speed × predict × input error × ledger → controls, counter, slider, explanation, metrics, ledger rows, predict strip | 15 DSA lessons, `/`, `/about/`, dev gallery (dev only) | 6.5 KB |
| `Challenge.astro` | **Island** `challenge` | verdict × hint × cleared state from `viz:run` → status, hint, badge, form | 5 DSA lessons | 1.9 KB |
| `FinalRun.astro` | **Island** `final-run` | prediction input × reveal × stored result → form, verdict, reveal, link | 6 DSA lessons | 0.8 KB |
| `ExplainBack.astro` | **Island** `explain-back` (client-only, activates on completion) | note text × saved/dirty × count band × recall → field, count, status, delete state | 124 lessons (every lesson with `explainPrompt`) | 1.0 KB |
| `PracticeCheck.astro` | Module | one grade → `aria-pressed`, saved line, shared status | 127 lessons | 0.9 KB |
| `MarkComplete.astro` | Module | one boolean → `aria-pressed`, note, count, milestone text | 127 lessons | 0.7 KB |
| `CodeTabs.astro` | Module | one selected index → `aria-selected`/`hidden`; copy button | 15 DSA lessons | small |
| `ThemeToggle.astro` | Module | one theme → `data-theme`, `aria-pressed`, `theme-color` meta | every page | small |
| `StepLink.astro` | Module | document-level click delegate onto a ledger row | 1 lesson | small |
| `ReviewStrip.astro` | Module | renders ≤ 2 cards once from storage; no interaction state | `/learn/` | 0.8 KB |
| `LessonLayout` ×3 (scroll-spy, stage pips, learning days) | Modules | decorators / document delegates | every lesson | ~1.5 KB |
| `index.astro`, `learn/index.astro`, `CourseIndex.astro` painters | Modules | paint many server-rendered cards/rings | `/`, `/learn/`, course pages | ~1–2 KB |
| `glossary.astro` filter | Module | toggles `hidden` on server-rendered entries | `/glossary/` | small |

**Consequence (measured).** React's ~66 KB gz floor is paid only where an instrument is present:
the 15 DSA lessons, `/`, `/about/` — plus, *when the reader marks a lesson complete*, the 124
lessons whose ExplainBack activates. Prose lessons otherwise stay at legacy size (~8.5 KB).

**Alternative (R-max) — every stateful widget an island** (adds PracticeCheck, MarkComplete,
CodeTabs, ThemeToggle, ReviewStrip). Architecturally uniform, but it puts the React floor on
**every page eagerly** (the theme toggle is on all 136): `/learn/k8s-services/` 8.5 → ~78 KB,
`/glossary/` 1.3 → ~68 KB, for widgets whose whole behaviour is one attribute flip. That is the
"material bundle-size regression" Gate F tells us to investigate, bought for no behavioural gain.

**Alternative (R-min′) — ExplainBack also a module.** Keeps all 112 prose lessons React-free even
after completion. Defensible: the note editor is ~240 lines of DOM code that already works. Not
recommended only because it is the one prose-page widget with genuinely multi-region state, and
lazy activation (D-06) means its cost is paid only by readers who complete a lesson.

**Decided by the orchestrator (2026-10-20): R-min′.** ExplainBack becomes a module, so the rule
reads without an exception: *React hydrates only on a page that hosts an instrument* (the
Visualizer and the two cards graded against its trace). All 112 prose lessons stay React-free
whether or not the reader completes them, the note editor keeps the DOM code that already passes
`m8-explain-note.spec.ts`, and `src/client/island-registry.ts` has three rows, not four. The
ExplainBack row in the table above is superseded: it is a **module** (`explain-back.ts`, WS-C), its
markup is server-rendered inside the legacy `<template data-explain-template>` exactly as today.
Every page is still *rendered* by React at build time; only hydration is scoped.

## D-06 — React loads per island activation; the budget gates the full page

**Decision (recommended).**

- `src/client/islands.ts` is a ~1 KB eager bootstrap emitted only on pages that contain at least one
  `[data-island]`. It does **not** statically import React. Each island type declares an activation
  trigger — `visible` (IntersectionObserver, `rootMargin: '200px'`, the legacy Visualizer's value),
  `idle`, or `event` — and on activation dynamically imports `react-dom/client`, the island's
  component chunk and, for the Visualizer, the algorithm and renderer chunks named by its
  `data-algorithm` / `data-renderer`, then hydrates. React is one shared chunk, fetched once.
- Triggers: `visualizer` → visible (and the legacy pre-activation states — `data-viz-loading`,
  `aria-busy`, the `…` counter, the failed state — are set by the bootstrap on the container,
  exactly where and when the legacy script set them); `final-run` → visible; `challenge` → idle,
  with its pre-activation hook buffering `viz:run` events from page load (the legacy card listened
  from the start, so a run made before activation must still count); `explain-back` → event (the
  lesson becoming complete, or already complete at load).
- **Budget measurement changes** (`tests/e2e/js-budget.spec.ts`): the gate is
  `FULL = eager closure + every chunk any island on the page loads on activation (React, island
  chunk, its static imports, and the page's own algorithm/renderer chunks)` and must be
  **≤ 120 KB gz** on every page. `EAGER` (the legacy metric) is still reported and still gated at
  120 KB. The per-page island chunk list comes from `.build/page-manifest.json`, written by the
  prerenderer; the browser cross-check (load, scroll the page through, activate every island) proves
  the manifest is complete. Without this change, lazy loading would move React into the
  "deferred, reported, not gated" bucket and the 120 KB number would stop meaning anything.
- **Projected full numbers** (to be replaced by measurement at P2 exit): DSA lesson ≈ 66 (React) +
  ~22 (Visualizer/Challenge/FinalRun/ExplainBack islands, React form of 6.5 + 1.9 + 0.8 + 1.0 KB) +
  ~12 (modules + `progress.ts`) + ~7 (viz chunks) ≈ **105 KB** — inside 120 KB but with ~15 KB of
  headroom, so P2 measures it on the real build before any other page is ported. Prose lesson ≈ 8.5
  KB eager, ≈ 76 KB full.

**Alternative rejected.** Static-importing React from the bootstrap: honest by the legacy metric,
but it charges every prose lesson ~66 KB up front for a note editor most readers never open.

## D-07 — MDX pipeline reproduces Astro's chain at pinned versions

**Decision.** `@mdx-js/rollup@3.1.1` with `format: 'mdx'`, `jsxImportSource: 'react'`, and the
plugin order `@astrojs/mdx@7.0.3` uses (read from `node_modules/@astrojs/mdx/dist/plugins.js`):

| Stage | Astro 7 (legacy) | New (in `src/mdx/`) |
|---|---|---|
| frontmatter | parsed outside MDX, exposed as `frontmatter` | `remark-frontmatter` + `remark-mdx-frontmatter` (`name: 'frontmatter'`) — `{frontmatter.slug}` and `{frontmatter.complexity}` keep working in 381 + 15 places |
| remark | `remark-gfm@4.0.1`, `remark-smartypants@3.0.2` (default options) | same packages, same versions, same options, same order |
| raw body | `entry.body` | `remark-lesson-body.ts` exports `body` (reading time, the `## Practice` guard) |
| rehype 1 | `rehypeMetaString`, `rehype-raw@7` with MDX node passthrough | same (passthrough = `nodeTypes` from `@mdx-js/mdx`) |
| rehype 2 | Shiki 4.3.1 via `@astrojs/internal-helpers/shiki`: dual themes `github-light`/`github-dark-default`, class `shiki`→`astro-code`, `data-language`, `style += overflow-x: auto;` | `rehype-shiki-astro.ts`: the same transform, vendored (MIT, attributed in the header), `shiki` pinned to **4.3.1** |
| rehype 3 | `rehypeLessonProse` (table wrapper, `md-code` on fences) | the same function moved verbatim from `astro.config.mjs` to `src/mdx/rehype-lesson-prose.ts` |
| rehype 4 | `rehypeHeadingIds` (github-slugger 2.0.0, MDX-expression aware) + headings export | `rehype-heading-ids.ts`: vendored port; exports `headings` |
| JSX | `elementAttributeNameCase: 'html'` (Astro runtime) | default (`react`): `class`→`className` etc. — DOM-equivalent |

`<CodeTabs>` (which used Astro's `<Code>`) calls the same vendored highlighter synchronously; the
prerenderer `await`s highlighter initialisation (python, javascript, java, plus every fence
language: bash, http, json, sql, text, yaml) before the first render.

**Slots.** `<Bench>` partitions its children by a `slot` prop (`'stage'` vs default) and strips the
prop before rendering — `<div slot="stage">` must not emit `slot="stage"` (Astro removed it). The
42 `slot="stage"` uses in 15 lessons need no edit.

**Unknown or unsupported constructs fail the build** with the file and line: MDX compile errors
carry `file:line:column` from the vfile; an unknown component is an unresolved import (Rolldown
error naming the lesson); a frontmatter schema failure names the file and the field (D-09). Nothing
is skipped silently: the loader asserts the compiled-module count equals the `.mdx` file count.

**Evidence of parity** is mechanical, not argued: `proseHash` (every `.lesson-body` with instrument
subtrees replaced by a placeholder) must match the baseline for all 127 lessons at P1 exit, and
`bodyHash` at P3 exit (`scripts/migration/inventory.mjs --compare`).

**Alternatives rejected.** A different highlighter (rehype-pretty-code, Prism) or a newer Shiki —
token colours and markup would drift from the baselines for no gain. `@mdx-js/esbuild` or a
separate MDX precompile step — two module graphs to keep in sync.

## D-08 — MDX import specifiers: resolver during migration, codemod at cutover

**Decision.** During P1–P4 the lessons are **not edited**: a Vite `resolveId` hook in
`scripts/vite-plugin-ssg.ts` maps any import of `…/components/**/*.astro` or `…/viz/*.astro` from
an `.mdx` importer to the sibling `.tsx` and fails the build if that file does not exist. At cutover
(P5) `scripts/migration/codemod-mdx-imports.mjs` rewrites exactly the import lines (`'…/X.astro'` →
`'…/X'`), prints every changed file and line, is idempotent (a second run changes nothing), and is
verified by `git diff --stat` touching only `^import` lines (`git diff -U0 | grep '^[-+][^-+]' |
grep -v '^[-+]import '` must be empty). The resolver is then deleted. Expected change set: 127
files, 356 import lines (the sum of the inventory's `mdx.components[*].files`).

**Why not codemod first:** it would break the legacy build on the branch on day one, and it makes
every intermediate parity diff carry 127 unrelated file changes. **Why not resolve forever:**
lessons importing `.astro` files that no longer exist is a trap for the next author, and
`scripts/lib/content-validator.mjs` rule 7 parses the diagram import specifier (`…diagrams/X.astro`)
— it is updated in the same commit as the codemod to accept `…diagrams/X` and read `X.tsx`.

## D-09 — Content schema and build guards in a framework-free loader

**Decision.** `src/content/schema.ts` restates `src/content.config.ts`'s Zod schema field for field
(same regexes, defaults, `TRACK_IDS` enum) using `zod@4` directly (it was `astro:schema`'s re-export
of zod 4.4.3). `src/content/lessons.ts` loads every lesson with
`import.meta.glob('./lessons/*.mdx', { eager: true })` in the SSR bundle, validates frontmatter
(error: `src/content/lessons/<file>.mdx: <path>: <message>`), and runs the cross-collection guards
that lived in pages: duplicate slugs and unknown prerequisites (`[slug].astro`), lesson/course slug
collision (`[slug].astro`), the `## Practice` heading guard (`learn/index.astro`), and glossary
`lessonSlug` integrity (`glossary.astro`). `scripts/lib/content-validator.mjs` stays as is
(already framework-free). `published: false` lessons build no page (none exist today).

## D-10 — CSS: one stylesheet; scoped blocks become plain CSS behind a cascade audit

**Decision.** One site stylesheet, `src/styles/site.css` → `dist/assets/site-HASH.css`, linked
render-blocking from every page: `global.css` (Tailwind layers + `tokens.css`, unchanged) followed
by one file per former `<style>` block under `src/styles/components/` and `src/styles/pages/`, in a
fixed order. Measured legacy CSS: 8 files, 85.0 KB raw / 17.8 KB gz, plus per-page inline blocks
(≤ 18.3 KB raw on a lesson) — one cached file of roughly 110–120 KB raw is acceptable. `is:global`
blocks (Visualizer, Ledger, ExplainBack, ReviewStrip, ThemeToggle) move verbatim.
`<noscript><style>` kill-switches stay inline in the component that owns them.

**The risk, stated precisely.** Astro scopes a `<style>` block by appending `[data-astro-cid-x]`
to every compound selector. Removing that does two things: it **widens matching** (a scoped
`.bench p` matched only the bench's own `<p>`, never slotted MDX prose; unscoped it matches both —
e.g. `LessonLayout`'s `.lesson__grid > .lesson__article > :not(.lesson-body)` would start applying
`max-width` to Breadcrumb, TableOfContents, WhatsNext and ExplainBack roots), and it **lowers
specificity** by (0,1,0) per compound, which can flip a cascade tie. 30 scoped blocks are affected
(23 components, `LessonLayout` and 6 pages); the other 5 blocks are already `is:global`.

**Mitigation — two mechanical audits, not review.**
1. *Before any React code* (P1): `scripts/migration/scope-audit.mjs` strips every `data-astro-cid`
   attribute and selector part from a copy of the **legacy** `dist/`, serves both copies, and diffs
   `getComputedStyle` (all properties) for every element on a page sample at 390 px and 1280 px,
   light and dark, JS off. Each difference names the element and the property; each becomes a
   selector fix recorded in `docs/migrations/css-scope-audit.md` (e.g. `:not(.lesson-body)` →
   `:is(.lesson__header, .lesson__rule)`).
2. *After the port* (P3 exit): `scripts/migration/style-parity.mjs` runs the same computed-style
   diff between the baseline `dist/` and the new `dist/` on the same sample. Zero unexplained
   differences is an exit criterion.

**Alternatives rejected.** CSS Modules (hashes class names that are part of the DOM contract and
the tests); `@scope` donut scoping (different specificity semantics, newer browser floor, still not
identical); emulating Astro's attributes in JSX (a compiler plugin to keep an artefact).

## D-11 — DOM compatibility contract and id determinism

The new build emits the legacy element tree, classes, ids, `data-*`, ARIA and text, **except**:
`data-astro-cid-*` (gone), `data-site-root` (D-01), `data-island` / `data-props` (added on island
roots), HTML comments (Astro emitted maintainer comments verbatim; React does not), `<meta
name="generator">` (Astro's — dropped), boolean attributes serialised as `attr=""` (DOM-identical),
and asset URLs (`/assets/…` instead of relative `_astro/…`). Rules for implementers:

- A bare data attribute in Astro (`data-viz`, `data-practice-check`) is written `data-viz=""` in
  JSX; `data-viz` alone renders `"true"`.
- Ids that came from the build-wide `nextUid()` counter (`pc-ask-N`, `ct-N-tab-M`, `fig-N-t`,
  `explain-N…`, `fr-…-N`, `ch-title-N`) become **per-page** counters from the render context —
  deterministic per page and independent of build order (the legacy numbers depended on Astro's
  page order). The inventory renumbers both builds per page, so wiring (`for`, `aria-labelledby`,
  `aria-controls`) is still compared.
- Instrument ids (`viz-<algo>-<hash>`, `${uid}-row-N`) are unchanged: `claimInstrumentId` takes the
  render context object as its scope key instead of `Astro.request` (the function already accepts
  any `object`).
- `useId()` is not used for any id that appears in server HTML.

## D-12 — Shiki class name

**Decision.** The vendored transform keeps `astro-code` through P4 so prose and pixel comparisons
change one variable at a time. At cutover (P5) one commit drops the `shiki`→`astro-code`
replacement and renames the selectors in `src/styles/global.css`, the CodeTabs and print CSS, and
the five e2e lines that select `.astro-code` (`m4-lessons`, `m6-dynamic-programming`,
`plan-c-ledger`, `m7-print-hcm`) to Shiki's own `shiki` / `shiki-themes`. Verified by the computed
-style parity tool (no property may change) and the full e2e suite.

## D-13 — URL model, preview server, 404, sitemap/robots, Workers config

- Routes (unchanged): `/`, `/learn/`, `/learn/{dsa,kubernetes,system-design}/`, `/learn/{slug}/`
  ×127, `/glossary/`, `/about/`, `/dev/renderers/` (prod stub), `/404.html`, `/sitemap.xml`,
  `/robots.txt` — 136 HTML files. Directory format, trailing slash on every internal link (path
  before `?`/`#`). The route table (`src/routes.tsx`) is the single source; the build fails on a
  lesson slug that collides with a course slug, and on any internal link in any built page that does
  not resolve to a built file (`scripts/verify-dist.mjs`, run by `npm run build`).
- `npm run preview` = `node scripts/serve-dist.mjs` (the legacy sub-path fixture server promoted, no
  prefix argument): no extension guessing and **no redirects**, so a slashless URL is a 404 exactly
  as under `astro preview` — `url-shape.spec.ts` keeps its teeth. Port and directory come from
  `PW_PORT` / `PW_DIST` (default 4321 / `dist`) so implementers can run single specs against their
  own build without colliding.
- `dist/404.html` is a root-level file served by Workers `not_found_handling: "404-page"`; its links
  are root-absolute like every other page now (no longer an exception).
- `wrangler.jsonc` is **unchanged** (`assets.directory: ./dist`, `html_handling:
  force-trailing-slash`, `not_found_handling: 404-page`); the new output keeps the layout those two
  keys were chosen for (`about/index.html` style). `public/_headers` changes one rule:
  `/_astro/*` → `/assets/*` (immutable caching for fingerprinted files). The committed
  `wrangler.jsonc` still prevents Wrangler's auto-configuration, which would now try to detect
  Vite rather than Astro.
- Vite's `dist/.vite/manifest.json` is moved to `.build/` by the prerenderer — no build metadata is
  deployed.

## D-14 — Tests

- **Vitest stays `environment: 'node'`, no DOM library** (CLAUDE.md, master-prompt invariant 27).
  React adds no DOM need: `react-dom/server` renders in Node, so SSR markup tests (e.g. "an island's
  isolated server render equals what the page embeds", "Bench strips `slot`") are ordinary node
  tests. Island state logic is extracted into pure modules (`src/viz/core/session.ts` for the
  predict/session state machine; any other island's non-trivial logic likewise) and unit-tested
  directly.
- No React component tests with a DOM emulator: Playwright already drives the real components in a
  real browser, and jsdom would be a new dependency to justify.
- The 37 e2e specs are the parity oracle and port **unchanged** wherever the DOM is unchanged.
  Every spec whose assertion must move is listed with its replacement in the plan (§7).
- Pixel baselines are regenerated in `mcr.microsoft.com/playwright:v1.61.1-noble` after review;
  ARIA baselines must pass **unchanged** (any intended delta is listed and justified); axe scans are
  kept and must pass.

## D-15 — Type gate and lint/format

`npm run build` runs `tsc --noEmit -p tsconfig.json` first (replacing `astro check`). `tsconfig.json`
inlines what `astro/tsconfigs/strict` set (`strict`, `verbatimModuleSyntax`, `isolatedModules`,
`moduleResolution: Bundler`, `allowImportingTsExtensions`, `resolveJsonModule`, `noEmit`,
`skipLibCheck`, `allowJs`) and adds `jsx: "react-jsx"`, `lib: ["ES2023","DOM","DOM.Iterable"]`,
`types: ["vite/client"]`. `*.mdx` modules are typed by a local `src/mdx.d.ts` (no `@types/mdx`).
ESLint swaps `eslint-plugin-astro` for `eslint-plugin-react-hooks` (rules-of-hooks,
exhaustive-deps — the stale-closure guard for player timers). Prettier drops
`prettier-plugin-astro`. The verbatim pre-paint script moves to `src/render/pre-paint.inline.js`
(imported `?raw`) and replaces `BaseLayout.astro` in `.prettierignore` and in the ESLint override.
No rule is weakened.

## D-16 — Fonts

`public/fonts/plex-sans.woff2` (60,020 B) and `plex-mono.woff2` (17,684 B) are kept byte-identical
(the inventory compares their SHA-256). `scripts/build-fonts.mjs` already scans `.tsx`; the
migration must not introduce a glyph outside `FONT_CHARSET` (`tests/unit/font-charset.test.ts`
fails if it does), so **`npm run fonts` is not run** — it downloads from Google Fonts and would
re-cut the subsets. A new glyph in ported code is replaced, not accommodated.

## D-17 — Legacy reference

The legacy build stays reproducible two ways: `git worktree add ../static_dsa-legacy 51a70cf &&
cd ../static_dsa-legacy && npm ci && npm run build` (~6.5 min), and the saved baseline `dist/`
copied to `.migration/baseline-dist/` (gitignored). On the branch, each port **deletes its `.astro`
original in the same commit** that adds the `.tsx` (the original stays one `git show 51a70cf:<path>`
away), so no dead Astro code lingers and every revert restores exactly one component. The branch's
`npm run build` is the new pipeline from P1 on; `astro.config.mjs` and `src/content.config.ts` go in
P1, the Astro packages in P5.

## D-18 — Dependencies

| Package | Kind | Why (each also gets a one-line justification comment at its config/import site) |
|---|---|---|
| `react`, `react-dom` 19.3.1 | runtime | the framework (D-02) |
| `vite` 8.1.5 | dev | already the bundler; now direct |
| `@vitejs/plugin-react` 6.1.2 | dev | JSX + Fast Refresh in dev |
| `@mdx-js/rollup` 3.1.1, `@mdx-js/mdx` 3.1.1 | dev | MDX compile (the version Astro used) |
| `remark-gfm` 4.0.1, `remark-smartypants` 3.0.2, `rehype-raw` 7.0.0, `github-slugger` 2.0.0, `shiki` 4.3.1 | dev | Astro's exact chain, pinned (D-07) |
| `remark-frontmatter` 5.0.0, `remark-mdx-frontmatter` 5.2.0 | dev | expose `frontmatter` inside MDX (both used in E4) |
| `zod` 4.x | dev | the lesson schema (D-09) |
| `@types/react`, `@types/react-dom` | dev | types |
| `eslint-plugin-react-hooks` | dev | hooks correctness (D-15) |
| **removed at cutover:** `astro`, `@astrojs/mdx`, `@astrojs/check`, `eslint-plugin-astro`, `prettier-plugin-astro` | | |

Every new package ships **zero bytes to the browser except `react`/`react-dom`** (build-time only),
which the JS budget measures. No visualization library, UI kit or router is added.

## D-19 — Execution model

Implementers run at Opus 5.5 / medium effort with **disjoint file ownership** (plan §6) and at most
two at a time on this 4-core / 7 GB machine. Implementers run `npm run typecheck`, ESLint/Prettier on
their files, `npm run test`, a full `npm run build` into their own `LDSA_OUT`, single-route
renders (`npm run render -- <url>`), the inventory diff for their routes, and at most targeted
Playwright spec files with `--workers=1` on their own `PW_PORT`. **Only the orchestrator runs the
full e2e suite, the style-parity and scope audits, and baseline regeneration, and only when no
agent is running** (CLAUDE.md: a red e2e run under load is not evidence).

---

## Conflicts

Every place the master prompt and the repository's own requirements disagree, and the resolution.

| # | Master prompt says | Repository says | Resolution |
|---|---|---|---|
| C-1 | Invariant 4 and §4.4, §5.9, §6.1(8), §6.4, Gate E: output portable to arbitrary origins **and sub-paths**, proven by a nested-path fixture | `CLAUDE.md` (2026-10-20): portability **Dropped**; retire `portablize`, `rehost` and the portability tests | **Repository wins** (newer, explicit). Gate E is satisfied as "deep links and assets work at the one supported deployment shape (origin root) under Workers' `html_handling`/`not_found_handling`", verified against the final `dist/` with `serve-dist` and the url-shape suite. Sub-path checks are retired, not faked. |
| C-2 | §6.6: "Do not introduce an arbitrary performance threshold without a baseline" | `CLAUDE.md`: budget **raised to ~120 KB gz per lesson page**, CI-enforced | Not arbitrary — it is the user's number and the legacy baseline is measured (§D-03). Enforced as FULL ≤ 120 KB (D-06). |
| C-3 | §5.1 "CI continues to use Node.js 24"; §1 "Astro 7" baseline | spec §4 still names Astro, "plain TypeScript islands", a closed dependency list, ≤ 60 KB | Spec §4, §8 ("implement these as Astro layouts"), §9 ("Astro components unless…"), §11.3 ("the Visualizer island"), §14 (build contract, portability), §16 (directory tree) and §18 (`npm run build` meaning) are **stack-specific** and are amended at cutover (P5) in the same PR as the code, with the amendment recorded in `docs/redesign-2026-08/03-amendments.md` style. Node stays ≥ 22.12 / 24. |
| C-4 | §7: "Do not commit … unless explicitly authorized" | `CLAUDE.md`: work on a dedicated branch; Conventional Commits | Commits on `feat/react-migration` are authorized by the repository's rewrite instructions and the orchestrator (D7). **No push, no deploy, no merge.** |
| C-5 | (harness) commit trailer `Co-Authored-By: …` | `CLAUDE.md` git section: **STRICT — no co-author trailer** | **User instruction wins**: no trailer on any commit. |
| C-6 | §4 / §5: planning at Extra High, execution at Medium | — | Execution agents are configured at Opus 5.5 / medium by the orchestrator. The effort this planning subagent actually ran at is not visible to it; the orchestrator reports the configured settings in the final report rather than claiming them. |
| C-7 | Invariant 26: preserve visual and ARIA baselines | `CLAUDE.md`: pixel baselines **regenerate** after the framework swap; keep aria and axe | Pixel baselines regenerated in the pinned container **after** a reviewed diff; ARIA baselines must pass unchanged; any intended ARIA delta is listed in the plan with its reason before re-seeding. |
| C-8 | Invariant 16: no "large component framework merely to implement React" | `CLAUDE.md`: dependency ban dropped, justify each | React itself is the chosen framework; no UI kit, router or viz library is added. Each new dependency is justified (D-18). |
| C-9 | §2 invariant 3/6: keep the build/deploy contract "wherever practical" | `wrangler.jsonc` committed; Workers Builds; no adapter | Kept exactly; the only deploy-visible changes are the asset directory name (`/assets/`) and the `_headers` rule that follows it. |
| C-10 | §5.9 asks the README to explain "how to verify arbitrary-subpath portability" | portability dropped | The README instead states the one-origin deployment contract and how to verify it (`npm run preview` + url-shape suite). |

---

## Addendum — how the experiments were run

All four ran in the planner's scratch directory (not in the repository) with `nice -n 19`, one at a
time, on 2026-10-20, while the legacy e2e baseline was running (load average 12–20 on 4 cores).
Byte sizes are deterministic; times are not and are not quoted. Method throughout: gzip -9 of every
JavaScript file a page loads (script tags, module preloads and their static-import closure), the
same method as `tests/e2e/js-budget.spec.ts`.

| Exp | Stack | Page(s) | Result |
|---|---|---|---|
| E1 | Vite 8.1.5 + React 19.3.1 + `@vitejs/plugin-react` 6.1.2 | island bootstrap + one 2-button island | 220,167 B raw / **67,924 B gz** (vs 282 B gz as a plain module) |
| E1b | same, `renderToStaticMarkup` + nested `renderToString` | page with prose + 2 islands | no separators in static prose; separators only inside islands; `data-x` → `"true"`; `<noscript>` style verbatim |
| E2 | Next.js 16.4.2 App Router, `output: 'export'` | bare page / prose lesson + 3 client islands | **171.9 / 177.3 KB gz**; prose duplicated in the flight payload |
| E3 | React Router 8.5.0 framework mode, `ssr:false` + `prerender` | bare page / prose lesson + 3 islands | **106.9 / 111.5 KB gz**; prose shipped in the route module |
| E4 | `@mdx-js/mdx` 3.1.1 + Astro's chain + React SSR | 10 real lessons vs baseline `.lesson-body` | identical headings, paragraphs, lists, tables, code blocks — after copying Astro's `isSpecialLang` branch |

Not measured: (d) Vike and (e) Astro + `@astrojs/react` — both would carry the same ~66 KB React DOM
floor as E1 on hydrated pages; (d) adds a framework for what (a) does in-repo and (e) is ruled out
for the final state by the brief, so neither measurement could change the decision.
