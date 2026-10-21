# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## React rewrite (on `feat/react-migration`, not yet merged; read first)

The whole repo was rewritten from Astro 7 onto **React 19, statically prerendered by a small
in-repo generator on Vite 8**, keeping the product identical. The plan, the decision record (D-xx,
conflicts C-x), the baseline inventory and the evidence live in `docs/migrations/`; the spec
clauses it changed are in `docs/migrations/react-amendments.md` (R-1…R-9). Read the decision record
before reopening any of the choices below.

**How the site is built now (D-03/D-04):** `vite build` builds the client assets, then an SSR bundle
holding the route table (`src/routes.tsx`) and all 127 MDX lessons (`@mdx-js/rollup` with Astro's
exact remark/rehype chain, vendored in `src/mdx/`), then `scripts/vite-plugin-ssg.ts` prerenders
every route with `renderToStaticMarkup` into the same `dist/` layout as before (directory pages,
root `404.html`, `sitemap.xml`, `robots.txt`) and `scripts/verify-dist.mjs` fails the build on an
unresolved internal URL. No client router: navigation is plain page loads.

**Islands versus modules (D-05, R-min′).** Only the *instruments* hydrate as React islands —
`visualizer` (with its ledger and predict mode), `challenge`, `final-run` — through
`src/client/islands.ts`, which loads React lazily on activation; React owns their interactive state
while the Player, algorithms and renderers stay pure TypeScript (renderers imperative behind a
ref). Every other behaviour (theme toggle, ToC, PracticeCheck, MarkComplete, ExplainBack, CodeTabs,
StepLink, review strip, painters, glossary filter) is a framework-free module in
`src/client/modules/` over server-rendered markup. Every page is still *rendered* by React; React
is downloaded only on pages that host an instrument (DSA lessons, `/`, `/about/`). Islands render
isolated from serialized props and must never read `window`/`document`/`localStorage` during render.

**Hard-constraint decisions (decided 2026-10-20; supersede the legacy list further down):**

| Constraint | Decision |
|---|---|
| Trace-then-render (`Step[]` → generic Player → dumb renderers; deep-copied snapshots; input caps in `parseInput`) | **Kept.** |
| Dependencies | **No blanket ban.** Justify each dependency in a comment (D-18 lists them); no viz library, UI kit or client router. |
| JS budget | **≤ 120 KB gz per page, gated twice** by `tests/e2e/js-budget.spec.ts`: EAGER (what the HTML loads) and FULL (eager + everything the page's islands load on activation, from `.build/page-manifest.json`). Measured at P3: worst FULL ≈ 100 KB (`sorting-basics`), prose lessons ≈ 11 KB. |
| No runtime network calls; prose and code work with JS disabled | **Kept.** |
| WCAG 2.1 AA | **Kept** (axe + aria baselines). |
| Persistence: `localStorage` only, §6 keys, `try/catch` on every access, no backend | **Kept**, keys unchanged so existing users' progress still loads. |
| No behavioral tracking; mastery states only (no XP, points, levels, badges, streaks) | **Kept.** |
| Trailing slash on every internal link; lesson URLs unchanged | **Kept.** |
| Portable `dist/` at any origin or sub-path | **Dropped (D-01).** One origin, root-absolute URLs; `portablize`, `rehost`, `[data-site-root]`/`siteRoot()` and the portability tests are retired. `SITE_URL` must be an origin (a path fails the build). |
| Static output on Cloudflare Workers Builds, no adapter, `wrangler.jsonc` committed | **Kept**; output layout unchanged, hashed assets under `/assets/`. |
| TypeScript strict, Tailwind, MDX lessons, CSS-variable tokens | **Kept.** |
| DoD gates: build, lint, format:check, test, test:e2e, validate:content | **Kept, all six.** |

**Things the rewrite learnt that outlive it.** *Astro's scoped `<style>` was load-bearing*: four
rules changed what they matched once the scope attribute was gone — found by a computed-style audit
of the legacy build before porting (`docs/migrations/css-scope-audit.md`), not by review. The site
now ships **one stylesheet**, so a page rule can reach another page's markup; qualify page selectors
with the page root. *Shiki's per-line time limit made builds non-deterministic under load* —
`tokenizeTimeLimit: 0` in `src/lib/highlight.ts` is load-bearing. *This host is slow and shared*:
full e2e and style-parity runs take ~1 h and ~8 h here; long axe scans time out at 30 s on the
legacy build too (plan §1), so judge e2e by assertion failures, never by timeouts alone.

**Pre-existing defect reproduced on purpose:** markdown fences ship `class="md-code"` only, so
`global.css`'s Shiki dark-theme wiring never reaches the 356 fences in prose lessons (plan §1). It is
a follow-up with its own visual review, not part of the rewrite.

Parts of the sections below still name Astro-era files in historical passages; where a section and
this one disagree, this one wins.

## Project

LearnDSA — a static, no-backend React + TypeScript site (prerendered at build time; see the section above) teaching data structures & algorithms with interactive step-through visualizations. **Every milestone in spec §17 has shipped (M1–M8)**: 15 lessons, 11 renderer modules / 12 registered renderer ids, glossary and SEO (M1–M6); the UX overhaul (M7.1 repair → M7.2 progress/player v2/wayfinding → M7.3 brand/print/forced-colors); and the M8 mastery loop (self-graded practice + pips + track rings, predict mode + spaced review, Trace Trials + Final Run). The two M8.3 items trimmed under budget pressure — Explain-it-back and the Learning Days line — **shipped afterwards** in `dab6108`, unchanged from their design; `docs/m8-gamification.md` records both as shipped, spec §7 carries the optional `explainPrompt` frontmatter field (11 of 15 lessons set it) and §6's `ld:days:v1` has a real writer in `src/lib/learning-days.ts`. Treat them as product, not as scope.

**`docs/site-spec.md` is the authoritative spec.** Read the relevant sections before implementing anything. If a request conflicts with the spec, flag the conflict instead of guessing; if the spec is silent, choose the simplest option that satisfies the goals and leave a `// SPEC-GAP:` comment explaining the choice. Never invent scope.

Milestone docs carry the detail the spec summarizes — read the one you're working in before
touching its area:

| Doc | Covers |
|---|---|
| `docs/m2-*`, `docs/m3-*`, `docs/m5-*`, `docs/m6-design.md` | shipped milestones: lesson layout, viz framework, glossary/about/SEO, DP lesson |
| `docs/design-tokens-m1.md` | the token system and its documented rationales (e.g. left-aligned measure, neutral chips) |
| `docs/deployment.md` | production deploy: `SITE_URL` (§2.1), Cloudflare Workers Builds + `wrangler.jsonc` (§4.3), GitHub Actions, Node pin, DoD gate |
| `docs/migrations/` | the React rewrite: plan, decision record, inventory/parity tooling evidence, CSS scope audit, spec amendments R-1…R-9 |
| `docs/m7-ux-overhaul.md` | UX audit findings + the three-phase redesign **as shipped**, with per-fix file pointers and the deviations from plan |
| `docs/m8-gamification.md` | the mastery-loop design **as shipped**, its binding stance, data model, killed mechanics, and what was deferred |
| `docs/redesign-2026-08/` | the 2026-08 ground-up UI/UX redesign: `00-interpretation.md` (what the brief means for a no-account static site), `01-direction.md` (the design as built), `03-amendments.md` (**every spec constraint it reopened, and the test each one moved**) |

## Course expansion (**shipped** on `feat/kubernetes-and-system-design-courses`)

Two courses added: **Kubernetes** (67 lessons, 14 modules) and **System Design**
(45 lessons, 9 modules). The catalogue went 1 → 3 courses, 2 → 25 modules,
15 → 127 lessons. `docs/courses/REPORT.md` is what was built and what was
verified; `docs/courses/PROGRESS.md` carries the §8 gate and the e2e ledger.

Before any related work, read `docs/courses/SPEC.md` and `docs/courses/PROGRESS.md`.
All lessons follow `docs/courses/CONTENT_STYLE.md`; the plan is
`docs/courses/CURRICULUM.md`, every choice is logged in
`docs/courses/DECISIONS.md`, and every spec constraint it reopened is in
`docs/courses/AMENDMENTS.md` (C-1..C-8).

**Two things this expansion learnt that outlive it.** *Read the built artifact,
not the source*: a rendered read of all 112 lessons found 60 defects that source
review had passed, including a curly quote the source spells straight and five
pages sharing two document titles. And *a per-lesson budget must scale with the
curriculum*: three e2e walks navigate once per lesson, and every constant in them
was written when that meant 17 pages.

**What it changed about the site's shape** (decisions D-04/D-05):

- The hierarchy is **course → track → lesson**. `track` keeps its name and is now
  the *module*; the two original tracks are the two modules of the `dsa` course, so
  no existing lesson's frontmatter moved. `order` is **per course**, and prev/next
  chains inside a course.
- **`/learn/` is the catalogue** of courses; the lesson cards, module arcs and a
  course-scoped resume CTA live on `/learn/{course}/` (`CourseIndex.tsx`). The
  reset control, the review strip and the learning-days line stayed on the
  catalogue because they describe the *device*, not a course. Lesson URLs did not
  move. `src/lib/progress-paint.ts` holds the painters both pages share.
- `complexity` is optional; `difficulty` is still `beginner | intermediate`.
- Prose lessons get `Figure.tsx` + `src/components/diagrams/*` (hand-written
  inline SVG on design tokens, zero JS), and a small rehype pass in
  `src/mdx/rehype-lesson-prose.ts` that wraps markdown tables in a keyboard-reachable scroll
  container and styles fenced code.

## Workflow: sub-agent orchestration

Delegate work through the role agents defined in `Agents.md` — act as orchestrator, don't implement everything inline. Role → Claude Code agent mapping:

| Role (Agents.md) | Claude Code agent |
|---|---|
| Systems-Architect | `systems-architect` |
| UI_UX-Designer | `ui-ux-designer` |
| Lead-Developer | `lead-developer` |
| Frontend-Engineer | `frontend-engineer` |
| QA-engineer | `qa-engineer` |

Flow for non-trivial tasks: clarify scope → plan → design (architect/designer) → implement (frontend-engineer, coordinated by lead-developer) → validate (qa-engineer tests, lead-developer reviews). The implementer never self-approves; QA and review are never skipped.

### UI/UX and gamification work: design before code, verify before trusting

Both `docs/m7-ux-overhaul.md` and `docs/m8-gamification.md` were produced this way, and changes to
either area follow the same process:

1. **Audit against the running site, not the source alone.** Start the dev server and capture real
   screenshots (every key page × light/dark × desktop/mobile) plus a Playwright accessibility-tree
   snapshot. Half the highest-severity findings — a rail that silently can't stick, a blank OG
   card — are invisible in code review.
2. **Explore in parallel from different lenses**, then judge. For UX that meant seven dimensions
   (IA/flows, visual, components, visualizer, a11y, responsive, content); for gamification, three
   competing concepts (learning-science, game-design, minimalist) rather than one. Divergence
   first, selection second.
3. **Adversarially verify every finding against the code before acting on it.** In the audit this
   rejected 2 claims outright and corrected 24 — wrong line numbers, fixes that would break WCAG
   2.5.3, a prediction-grading rule that leaked the answer. An unverified finding is a hypothesis.
4. **Check for dark patterns and pedagogy, not just usability.** Motivation mechanics get an
   explicit ethics pass: it killed the XP system, the first-try bonus, and streaks here.
5. **Record what was rejected and why.** Both docs end with a "considered and rejected" list so
   settled questions stay settled.
6. **Encode calm/quality rules as tests.** Design intentions erode under maintenance, so the review
   strip's ≤2-card cap, the vocabulary ban, and the token contrast matrix are tests — pure halves in
   Vitest, DOM/storage halves in Playwright.

Two standing rules for this area: **never hand-mock the product** — hero art, legends, and demo
frames come from the real renderer's build-time `renderStatic()` output so they cannot drift; and
**check the design docs before "fixing" something that looks off** — the left-aligned measure and
the neutral difficulty chips are deliberate, documented decisions, so changing them is a spec
amendment with designer sign-off, not a bug fix.

## Where the build stands

Spec §17's milestone ladder is finished — it is history, not a plan. M7 and M8 shipped in five
commits after their design PR (`632f4b4` plans + spec amendments; `7367685` M7.1, `80373a4` M7.2,
`12d2486` M7.3, `2b6b821` M8.1, `4f34cff` M8.2+M8.3). New work is repair, extension or a spec
amendment; it still runs through the same design → implement → QA → review flow and the same DoD
(§18). Prefer the smallest shippable batch, and still prefer the vertical slice (one lesson
end-to-end) before scaling a change across all 15.

**Know what an area already guarantees before touching it:**

- **Progress & mastery** — `src/lib/progress.ts` is the one reader and the one deleter of every progress key; exactly one writer exists per key (`MarkComplete` → completion, `progress.ts` → `progress:v1:{slug}`, `Challenge`/`FinalRun` → the two `ld:*` keys through `src/lib/enrichment-store.ts`). Lesson lists are injected from the build; storage is never enumerated by prefix.
- **Visualization** — trace-then-render survived M8 intact: predict mode and trials consume the same precomputed `Step[]`. `predictStep` is optional per algorithm and ships for binary-search, bubble, insertion, BFS and DFS; quick-sort and selection-sort deliberately have none (they defer swaps — see `docs/m8-gamification.md`). Plan A added two **required** members to the contract (spec §11.2): every renderer module ships `measure(step): Extent` — geometry only, extracted from the viewBox its own `draw` already computes, because reading the box back out of `renderStatic` costs 247 ms at n = 30 against 0.44 ms — and its agreement with `draw` is a test, not a convention (`tests/unit/renderers/measure.test.ts`). The extent is **frozen per trace** and reaches the client through `setExtent`, never `mount` alone: `mount` runs once per island while `loadTrace` re-traces on every custom run and on "Restore example". `fitToExtent` clamps rather than shrinks, and each renderer declares one `ANCHOR` (bottom for `stack`/`callStack`, centre-x for `heap`). `npm run audit:frames` re-derives which renderers vary. The RSP-2 legibility floor was **measured and deliberately left alone** — a vertical twin is a rejected proposal, not a gap (spec §19.1, and the comment block at the CSS itself). Plan C added the **ledger** — the same trace written out as a table under the drawing (`src/viz/core/ledger.ts`, pure; `src/viz/Ledger.tsx`), a second *view* of one trace that re-runs nothing and holds no index of its own. Two provenance rules are tests, not conventions: a value cell reads `step.state` and nothing else, and "what happened" is the authored sentence — **there is deliberately no code path from `highlights` into a cell**. `Algorithm.ledger?` is optional (binary-search declares `lo`/`mid`/`hi` + `comparisons`; everything else takes the generic `# · what happened · <metrics>` fallback), the row cap is 200 on both paths and says so in words when it binds, and Predict mode hides the whole table because it renders `trace[i + 1]` — which is **not** the killed cost withholding, for the three reasons spec §19.1 carries. Instrument ids are derived (`core/instrument-id.ts`), rows are `${uid}-row-${n}`, and `<StepLink>` resolves its target through `instrumentIdFor` — the non-claiming half, because `claimInstrumentId` mints.
- **Layout & typography (2026-08 redesign)** — a lesson body composes `<Bench>` (one artifact +
  the prose that narrates it; pinned beside the reading column at ≥1200px and ≥640px tall) and
  `<Band>` (peer cards, two-up). **DOM order inside a bench is unchanged from the pre-redesign
  stream** — the two columns are a grid placement, never a reordering, which is what keeps mobile,
  print and screen-reader order correct. `BaseLayout` takes `wide` (`--shell`, 90rem) for pages with
  a third column; everything else stays on `--container-max`. The ToC rail is retired in favour of
  the sticky "On this page" bar at every width, and lesson bodies carry **six** h2 sections — no
  `## Visualizer`. The two typefaces are self-hosted IBM Plex subsets **generated from the repo's own
  characters** by `npm run fonts`; `tests/unit/font-charset.test.ts` fails when content introduces a
  glyph they do not cover, and the byte sizes in comments are asserted against the files on disk.
  The instrument sizes itself with `@container viz`, not viewport media queries, because it now
  renders at three very different widths on one screen.
- **Tokens & chrome** — light elevation is *inverted* (`--bg` tinted `#F8FAFC`, `--surface` white, plus sunken/raised levels); the six `--hl-*` roles stay viz-only and chrome attention uses `--accent-warn`; every sticky offset and `scroll-margin-top` derives from `--header-h`; durations come only from `--duration-*` tokens. `src/styles/tokens.css` is the source of truth — `docs/design-tokens-m1.md`'s code block is the retired M1 snapshot, not something to paste.
- **JS-off** — every M8 component carries its own `<noscript>` kill-switch: with JS disabled no pip, ring, milestone, review card, trial or Final Run appears (`/learn`'s pip legend is hidden for the same reason). Newly server-rendered M7 content (prerequisites, "What's next", glossary aliases) *is* expected to appear.
- **Build & deployment** — `npm run build` is `tsc --noEmit && vite build && node scripts/verify-dist.mjs` (prerender included). Internal URLs are **root-absolute** and the site is served at one origin (D-01; Plan D's portable artifact is retired). **Declared** URLs (canonical, `og:url`, `og:image`, sitemap `<loc>`, robots' `Sitemap:`, JSON-LD `url`) are absolute, built by `deploymentUrl()` from `SITE_URL` or the sentinel `https://learndsa.invalid`; `src/render/site-url.ts` throws when a **publishing** builder (`CF_PAGES`, `WORKERS_CI` — this site deploys through Cloudflare **Workers Builds** — `NETLIFY`, `VERCEL`) builds without `SITE_URL`, or when `SITE_URL` carries a path; `tests/unit/site-url.test.ts` pins all four. **`wrangler.jsonc` is committed and must stay so:** without it `wrangler deploy` auto-configures the project, and its two `assets` handling keys (`force-trailing-slash`, `404-page`) are what give Workers the trailing-slash redirect and the 404 page. `npm run preview` (`scripts/serve-dist.mjs`) serves `dist/` with no redirects and the 404 document for unknown paths. `LDSA_OUT=/tmp/x npm run build` builds elsewhere; `PW_PORT`/`PW_DIST` point Playwright at it.
- **The calm invariants are tests**, not conventions: review strip ≤2 cards and zero DOM when empty, the banned vocabulary, the Predict toggle's absence from storage, the token contrast matrix. Breaking one fails CI rather than review.

**Deliberately not built** (decisions, not gaps): per-track OG cards and link prefetching; and —
deleted by measurement rather than taste — cost withholding and a vertical twin for the RSP-2
legibility floor. Spec §19 (with §19.1 for the two measured deletions) and the milestone docs carry
the reasoning; re-proposing one is a spec amendment, not a fix. **Two former entries on this list
shipped in the 2026-08 redesign** and are now product: the glossary filter island, and difficulty
chips that badge the exception (the chip appears on a `/learn` card only when the lesson is *not*
`beginner`; the lesson page keeps its chip unconditionally). See `docs/redesign-2026-08/03-amendments.md`.

**Budget note:** a size claim in a comment is a claim about the *build* — measure it (gzip every
chunk in a page's static import closure) or don't write it. A wrong one here hid a 1.3 KB gz chunk
riding onto `/` and `/learn` for two key strings; the fix and its measurement now live in
`src/lib/enrichment-store.ts` and at the top of `src/lib/progress.ts`.

## Hard constraints (the rewrite's decision table at the top wins where they differ)

- **Trace-then-render (§11) for every visualization** — an instrumented algorithm emits a `Step[]` trace; a generic Player indexes into it; dumb per-structure renderers draw SVG. Never hand-code timers/mutations per algorithm. Snapshots must be deep-copied; input caps enforced in `parseInput` (arrays ≤ 30, graph nodes ≤ 15).
- **Justify every dependency** — no D3 or viz libraries, no component UI kits, no client router; each package carries a one-line justification at its config or import site (D-18).
- **JS budget ≤ 120 KB gzipped per page, EAGER and FULL** (see the top section); no runtime network calls; all prose/code must work with JS disabled (the viz degrades gracefully).
- **WCAG 2.1 AA**: real buttons/inputs, fully keyboard-operable, `aria-live="polite"` step explanations, never color-only signals, respect `prefers-reduced-motion`.
- `localStorage` is the only client persistence (no `sessionStorage`, no cookies), and the permitted keys are **enumerated in §6**, split into progress keys (cleared by the reset-progress control) and preference keys (deliberately not cleared). Adding a key is a spec change. Every access is `try/catch`-guarded. No backend, ever. **No behavioral tracking** — store only explicit user acts and self-reports; inferring completion from scroll depth or time-on-page is surveillance-shaped even when local, and it breaks the site's own "no tracking" promise.
- **Gamification (M8) never forks the viz pipeline** — predict mode and challenges consume the same precomputed trace. Mastery states are the only progress currency: no XP, points, levels, badges, or streaks (see the killed list in `docs/m8-gamification.md` before proposing one).

## Stack & commands

TypeScript (`strict: true`), React 19 prerendered by Vite 8 (static output, no server), Tailwind 4, MDX lessons via `@mdx-js/rollup`, Vitest + Playwright, ESLint (+ react-hooks) + Prettier, npm, Node ≥ 22.12 (`.nvmrc` and CI pin 24).

Commands (all in `package.json`):

```bash
npm run dev                      # vite dev server; every route rendered through the SSR entry (first request is slow: 127 MDX modules)
npm run build                    # tsc + vite build (client, SSR, prerender) + verify-dist (the real build; preview/e2e serve dist/)
npm run typecheck                # tsc --noEmit (the type gate on its own)
npm run render -- /learn/arrays/ /tmp/a.html   # one route through the dev SSR, for parity diffs
npm run lint | format:check      # eslint . | prettier --check .  (`npm run format` writes)
npm run test                     # vitest run
npx vitest run tests/unit/renderers/measure.test.ts        # one unit file
npx vitest run -t "name fragment"                          # one unit test by name
npm run test:e2e                 # playwright; builds then previews dist/ (reuses an existing build on CI)
npx playwright test tests/e2e/url-shape.spec.ts            # one e2e file
npm run validate:content         # lesson frontmatter/content gate (CI uses `-- --strict`)
npm run fonts | og | icons       # regenerate generated assets; fonts must be re-run when content adds glyphs
npm run audit:frames             # which renderers' frames vary
```

Test harness shape: Vitest runs `environment: 'node'` with no DOM library and no `localStorage`, so unit tests must be pure functions with injected inputs (see `resolveTheme` in `src/lib/theme.ts`); anything DOM- or storage-shaped belongs in Playwright. Adding jsdom/happy-dom is a new dependency and needs a `// SPEC-GAP:`.

Two blind spots in that harness, found in Plan C and recorded in spec §18 — neither is a bug, and both are invisible from a green run. **axe cannot see a closed `<details>`** (`display: none`), so a11y surface behind a disclosure needs a scan that opens it first; doing that for the ledger found a real `serious` failure on its first run. And **`toMatchAriaSnapshot` matches a subset**, so the aria baselines sat a whole milestone out of date while passing — every M8 addition was invisible to the comparison. Re-seed them when a milestone adds structure, and read the diff.

Definition of Done for any change (spec §18): `npm run build`, `npm run lint`, `npm run format:check`, `npm run test`, and `npm run test:e2e` all clean. **The course expansion adds a sixth: `npm run validate:content`** (and CI runs it as `-- --strict`). CI runs all six; M7/M8 acceptance leans on the e2e suite heavily (visual/aria baselines, focus-retention, axe scans, the DOM/storage halves of the calm invariants).

**Never run `npm run test:e2e` while subagents are running.** The suite is
timing-sensitive (`retries: 0` locally, `fullyParallel: true`, 4 cores): a run
alongside four reconnaissance agents produced 14 failures that all passed on a
quiet machine. A red e2e run under load is not evidence of anything.

## Conventions

- Conventional Commits.
- JSDoc on public functions; inline "why" comments; no `console.log` or dead code in production.
- Renderer elements get stable ids (e.g. `i0`, `n5`) so highlights and CSS transitions can target them.
- **Every internal page link carries a trailing slash** — `/learn/binary-search/`, `/glossary/#array` (the slash goes on the path, *before* any `?query` or `#fragment`). The slashless form is a hard 404 under `npm run preview` (and a 301 on Workers), not a page, and `tests/e2e/url-shape.spec.ts` fails on a slashless internal link, on a canonical that disagrees with the URL it is served at, and on an unserved sitemap `<loc>`. Asset URLs (`/og-default.png`, `/fonts/…`) keep their extension and are untouched by the rule. See `docs/redesign-2026-08/03-amendments.md` (U-1). **Internal links are root-absolute** in source and in `dist/` (D-01); a link built in client JS uses `lessonHref(slug)`/`reviewHref(slug)` from `src/lib/progress.ts` rather than a hand-typed template.
- `opencode.json` contains an API key and is gitignored — never commit it.
- `README.md` is the human entry point (this file is the agent one). If a change alters how the project is run, tested or constrained, update it in the same PR; docs that describe the plan instead of the product are a review failure.


## git

STRICT INSTRUCTION: Do not add `co-athored by claude` in commit message 
